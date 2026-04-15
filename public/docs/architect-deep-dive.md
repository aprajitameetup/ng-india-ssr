# Angular SSR & Web Vitals — Frontend Architect Deep Dive
### Version 4 — No Simplifications. Full Technical Depth.
### Angular 19-20 | All internals explained completely

---

# Chapter 1: How the Browser Actually Renders a Page

This is called the **Critical Rendering Path** — the full sequence from network request to pixels on screen.

## Step 1: The Network Request

When a user types a URL and hits Enter:

```
1. DNS Lookup
   "myapp.com" → what IP address is this?
   Browser checks: memory cache → OS cache → DNS server
   Result: 104.21.44.1
   Cost: 20-120ms on first visit, 0ms if cached

2. TCP Connection
   Browser opens a connection to 104.21.44.1 on port 443 (HTTPS)
   TCP requires a 3-way handshake (SYN → SYN-ACK → ACK)
   Cost: 1 round trip (~30-100ms depending on physical distance to server)

3. TLS Handshake (for HTTPS)
   Browser and server negotiate cipher suites and exchange certificates
   TLS 1.3: 1 round trip. TLS 1.2: 2 round trips.
   Cost: 30-200ms depending on TLS version and server proximity

4. HTTP Request
   Browser sends: GET /dashboard HTTP/1.1
   Cost: already absorbed in connection establishment above

5. Server processes request and responds
   TTFB starts when request leaves the browser
   TTFB ends when the first byte of the response arrives
```

**This means before a single character of the page is received, the browser has spent 100-400ms purely on connection establishment.** This is why CDNs exist — physical proximity reduces every round trip.

**Modern protocols reduce this overhead significantly:**

- **HTTP/2:** Multiple requests share a single TCP connection via multiplexing. No per-request handshake cost after the first. Header compression (HPACK) reduces overhead further.
- **HTTP/3 / QUIC:** Replaces TCP entirely with QUIC — a UDP-based protocol that combines the transport handshake and TLS into a **single round trip** (1-RTT). For repeat visitors, QUIC supports **0-RTT resumption** — the connection is re-established with zero additional latency using a session ticket from the prior connection. On lossy networks, QUIC also eliminates TCP's head-of-line blocking: a lost packet only stalls the one affected stream, not all concurrent requests.

## Step 2: HTML Parsing and DOM Construction

The browser receives HTML as a byte stream and processes it **incrementally** — it does not wait for the full file.

```
Bytes arrive:     3C 68 74 6D 6C 3E...
                  ↓
Character decode: < h t m l > ...   (using declared charset, default UTF-8)
                  ↓
Tokenisation:     StartTag:html, StartTag:head, StartTag:title, Characters, EndTag...
                  ↓
Tree construction: DOM nodes created and appended as tokens arrive
```

**The preload scanner runs in parallel with the main parser:**

Modern browsers run a secondary lightweight thread called the **speculative parser** (or preload scanner) alongside the main HTML parser. Its job: scan ahead in the raw HTML byte stream and dispatch early fetch requests for resources it discovers — `<link rel="stylesheet">`, `<script src>`, `<img src>`, `<link rel="preload">` — even while the main parser is blocked.

Without the preload scanner, a parser-blocking script would delay every resource below it. With it, stylesheets, fonts, and images begin downloading in parallel before the main parser unblocks. This is one of the most impactful browser optimizations for real-world performance.

**Parser blocking:**

When the parser encounters a `<script>` tag without `async` or `defer`:

```html
<script src="main.js"></script>
```

The main HTML parser **stops completely** until `main.js` is downloaded, parsed, and executed. JavaScript can call `document.write()`, modify the DOM, or insert new stylesheets — so the parser cannot safely continue.

**Modern Angular builds use `type="module"` scripts, which are deferred by default** — they do not block HTML parsing. However, they still must download and execute before Angular can render anything. The white screen problem in Angular is not parser blocking; it is the time cost of downloading, parsing, and executing a large JavaScript bundle before the framework can produce any output.

## Step 3: CSS Object Model (CSSOM) Construction

Simultaneously with HTML parsing, the browser downloads and parses CSS files into the **CSSOM** — a tree of style rules.

**CSS is render-blocking but not parser-blocking.** HTML parsing continues uninterrupted while stylesheets load. However, the browser delays all painting until the CSSOM is complete — it cannot compute styles or produce pixels without knowing every applicable rule. A large or slow-loading stylesheet does not stall the HTML parser, but it does stall the first paint.

## Step 4: Style Calculation

Before constructing the render tree, the browser runs **style calculation** — resolving the full CSS cascade for every DOM node. This involves:

- **Cascade resolution:** Which rules apply to this element? (author styles > user styles > browser defaults)
- **Specificity:** Among competing rules, which wins? (inline > ID > class > tag)
- **Inheritance:** Which properties propagate from parent to child? (`font-size`, `color`, `line-height` inherit; `margin`, `padding`, `border` do not)
- **Computed values:** All relative units (`em`, `%`, `vh`) resolved to absolute pixel values

The output is a **computed style map** — every node now knows its exact `color`, `font-size`, `display`, `margin`, and every other CSS property. This step is visible in Chrome DevTools Performance tab as **"Recalculate Style"** and can be expensive for large DOMs or overly broad CSS selectors.

## Step 5: Render Tree Construction

The browser combines the DOM and the computed style map:

```
DOM tree  +  Computed Styles  =  Render Tree
```

The render tree only contains **visible** elements:
- Elements with `display: none` are excluded (not rendered at all)
- Elements with `visibility: hidden` are included (occupy space, but invisible)
- `::before` and `::after` pseudo-elements are included (they are visible)
- Text nodes are included as anonymous boxes

## Step 6: Layout (also called Reflow)

The browser calculates the exact position and size of every element in the render tree — their box model (content, padding, border, margin), their position in the document flow, how they affect each other.

This is expensive. The browser processes in document order, and a parent's size depends on its children's sizes, which depends on the available width, which depends on the parent — making this an iterative, potentially multi-pass process.

Layout is triggered by anything that changes geometry: adding or removing elements, changing font sizes, resizing the viewport, changing `width`, `height`, `padding`, `margin`, `border`, `position`, `float`.

**CLS occurs when layout changes happen after the initial paint and are visible to the user.** Every time an element shifts position after the user can already see the page — an ad loads above content, an image pops in with no reserved space, Angular re-renders a hydration mismatch — the browser runs another layout pass and records a `layout-shift` performance entry.

## Step 7: Paint

The browser walks the render tree and generates **paint records** — a display list of drawing instructions per layer:

- "Fill rectangle at (x:0, y:0, w:1440, h:800) with color #ffffff"
- "Draw text 'Hello World' at (x:20, y:40) with font 14px/Inter"
- "Draw border at (x:100, y:100, w:200, h:50) with color #cccccc"

Paint does **not** produce pixel values directly. It produces an ordered list of drawing commands. The actual pixel conversion happens in the next step.

## Step 8: Rasterization

The browser converts paint instructions into **actual pixel values**. This is rasterization.

- The page is divided into **tiles** (typically 256×256 or 512×512 pixels)
- Each tile is rasterized independently, often on the GPU
- GPU-accelerated rasterization (Skia on Chrome) is significantly faster than software rasterization
- Tiles outside the viewport are rasterized at lower priority or not at all until they scroll into view

Rasterization is distinct from paint: paint decides *what* to draw; rasterization converts those instructions into *which exact pixels* are filled with which colors.

## Step 9: Layer Promotion

Before compositing, the browser identifies elements that should live on their own **compositor layer** — a separately rasterized surface that can be positioned and transformed independently.

Elements are promoted to compositor layers when they have:
- `transform` (any 3D or 2D transform)
- `opacity` (value other than 1)
- `will-change: transform` or `will-change: opacity`
- `position: fixed` or `position: sticky`
- `<video>`, `<canvas>`, `<iframe>` elements
- CSS `filter`, `backdrop-filter`, or `clip-path`
- Elements that overlap promoted layers (browser promotion to avoid incorrect compositing)

**The critical performance benefit:** When only a layer's `transform` or `opacity` changes (e.g., a slide-in animation), the browser skips layout and paint entirely. The layer was already rasterized. The compositor just repositions or adjusts the opacity of the existing pixels. This is why GPU-composited animations run smoothly even on slow devices with busy main threads.

**The cost:** Each promoted layer consumes GPU memory. Promoting everything to layers is a common performance anti-pattern — the memory cost outweighs the compositing benefit.

## Step 10: Composite

The browser combines all rasterized layers into the final frame sent to the screen. This runs on the **compositor thread** — a separate thread from the main thread.

This architectural separation is the key to smooth scrolling and animation on the web:
- The compositor thread runs independently of JavaScript execution
- Scroll events and CSS `transform`/`opacity` animations can be processed at 60fps even when the main thread is executing a long JavaScript task
- This is why `transform: translateX()` is always preferred over `left` or `margin-left` for animations — `transform` is compositor-only; `left` triggers layout on the main thread

**The frame pipeline for reference:**

```
Main thread:       JavaScript → Style → Layout → Paint → Commit
                                                              │
Compositor thread:                                       Rasterize → Draw → Display
```

The `Commit` step copies the layer tree from the main thread to the compositor thread. After that, the compositor can continue drawing frames independently.

---

## What This Means for an Angular CSR App

When Angular's bundle is executing, the browser's **main thread is blocked**. The compositor thread can still scroll, but:
- No new layout runs
- No new paint runs
- No JavaScript event handlers fire
- No user input is processed

The white screen is not "content isn't ready." It is the browser physically unable to produce new frames while JavaScript occupies the only thread that can generate them.

---

# Chapter 2: Angular's Architecture in the Browser — Deep Dive

## The Injector Hierarchy

Angular's dependency injection is not a flat registry. It is a **hierarchical tree** of injectors that mirrors the application structure.

```
Platform Injector         ← created once for the browser tab
    │                       contains: DomSanitizer, PlatformLocation
    │
Root Environment Injector ← created by bootstrapApplication()
    │                       contains: your app providers, HttpClient, Router
    │
Component Injectors       ← one per component instance
    │                       contains: component-level providers
    │
Element Injectors         ← one per DOM element
                            contains: directive providers
```

**Resolution order:** When a component requests a token, Angular walks up the injector tree from the element injector until it finds a provider or reaches the platform injector. If not found, it throws `NullInjectorError`.

This hierarchy matters for SSR: each server request bootstraps a fresh **Root Environment Injector** and everything below it. The Platform Injector is shared per Node.js process (not per request), which is why any state stored at platform level could leak between requests.

## The Bootstrap Process

When `bootstrapApplication(AppComponent, appConfig)` is called:

```
bootstrapApplication(AppComponent, appConfig)
  │
  ├─► Obtains or creates the Platform Injector
  │     (shared across bootstrapApplication calls in the same process)
  │
  ├─► Creates the Root Environment Injector
  │     Registers providers from appConfig
  │     Registers Angular built-ins (Router, HttpClient, etc.)
  │     If provideExperimentalZonelessChangeDetection() present:
  │       skips Zone.js setup entirely
  │     If provideZoneChangeDetection() present (default):
  │       creates NgZone, patches async APIs
  │
  ├─► Creates ApplicationRef
  │     Manages the root component tree
  │     Exposes isStable observable
  │     Exposes tick() for manual change detection
  │
  ├─► Creates ComponentRef<AppComponent>
  │     Creates element injector for app-root
  │     Instantiates AppComponent (constructor runs)
  │     Executes compiled template instructions (create phase)
  │     Schedules first change detection (update phase)
  │
  ├─► Bootstraps to the DOM
  │     Locates <app-root> in document
  │     Attaches the component's host element
  │
  └─► Starts the Router
        Reads current URL
        Runs route matching (synchronous)
        Runs route guards (async — may involve HTTP)
        Runs route resolvers (async — may involve HTTP)
        Activates matched components
        Triggers ngOnInit in activated components
        Those components may issue HTTP requests
        Change detection runs when async work completes
```

## Zone.js — The Legacy Change Detection Engine

Zone.js patches every asynchronous API in the browser. But the patching is more nuanced than it first appears.

**The JavaScript task queue has two types:**

**Macrotasks** — discrete units of work scheduled by the runtime:
- `setTimeout(fn, delay)`
- `setInterval(fn, interval)`
- `setImmediate(fn)` (Node.js)
- `MessageChannel.port.postMessage()`
- `requestAnimationFrame(fn)`
- `XMLHttpRequest` / `fetch` callbacks

**Microtasks** — high-priority callbacks that run *between* macrotasks, before the browser yields to rendering:
- `Promise.then()` / `Promise.catch()` / `Promise.finally()`
- `queueMicrotask(fn)`
- `MutationObserver` callbacks
- `async/await` (compiled to Promise chains)

**The execution order:**

```
Macrotask executes
    ↓
Microtask queue drains completely (all pending promises resolve)
    ↓
Browser checks: should I render a new frame?
    ↓
Next macrotask executes
```

Zone.js tracks both separately:

```typescript
// Simplified NgZone internal state
class NgZone {
  _nesting: number = 0;                  // how deep in zone.run() calls
  _hasPendingMicrotasks: boolean = false; // any unresolved promises?
  _hasPendingMacrotasks: boolean = false; // any pending timers/intervals?
  _isStable: boolean = true;             // both of the above are false

  onMicrotaskEmpty: EventEmitter<void>;  // fires when microtask queue empties
  onStable: EventEmitter<void>;          // fires when both queues empty
  onUnstable: EventEmitter<void>;        // fires when entering unstable state
  isStable: Observable<boolean>;         // observable form of _isStable
}
```

**Angular's change detection trigger:** Angular's default change detection runs on `NgZone.onMicrotaskEmpty` — not `onStable`. This means: every time the microtask queue drains (which happens after every Promise resolution, every await, every click handler), Angular runs change detection. This is why every HTTP response, every async pipe resolution, every `await` in a component automatically triggers a UI update.

**`onStable`** fires only when both `_hasPendingMicrotasks` AND `_hasPendingMacrotasks` are false. This is what Angular SSR uses to determine when to serialize.

**`NgZone.runOutsideAngular()`:**

```typescript
this.ngZone.runOutsideAngular(() => {
  // Code here runs in the PARENT zone (root zone)
  // Zone.js still patches the APIs, but Angular's NgZone is not the active zone
  // Async callbacks triggered here do NOT fire onMicrotaskEmpty
  // Angular change detection does NOT run
  setInterval(() => {
    // This fires every second but never triggers change detection
    this.latestData = this.fetchLatest();
    // To update UI manually, call this.ngZone.run(() => { ... })
  }, 1000);
});
```

Use `runOutsideAngular` for: polling intervals, third-party library initialization, WebSocket message handlers where you want to batch updates, performance-critical calculations that don't need to update the UI on every iteration.

## Zoneless Angular — The Modern Direction (Angular 18-20)

```typescript
bootstrapApplication(AppComponent, {
  providers: [
    provideExperimentalZonelessChangeDetection()
  ]
});
```

With zoneless enabled:
- `zone.js` is not loaded at all
- No async API patching
- `NgZone` is replaced with a no-op stub
- Change detection is **only** triggered by:
  - A `signal()` value changing
  - A `computed()` value being invalidated
  - An `input()` signal receiving a new value
  - An explicit `ChangeDetectorRef.markForCheck()` call
  - `ApplicationRef.tick()` called manually

**Why this is better for large applications:**

Zone.js triggers change detection on the entire component tree after every async event — including events in components that have nothing to do with the changed data. With 500 components in a dashboard, a single HTTP response means Angular checks all 500 components for changes. With Signals + zoneless, only the components that actually read the changed signal are re-evaluated.

## Change Detection Strategies

Angular components have three effective change detection strategies in 2026:

**CheckAlways (default with Zone.js):**
Every `NgZone.onMicrotaskEmpty` → entire component tree checked top-down. Every component's template expressions re-evaluated. Predictable but expensive at scale.

**OnPush:**
Component is only checked when:
- An `@Input()` reference changes (not deep equality — reference only)
- An event originates from the component or its children
- An async pipe in the template resolves
- `ChangeDetectorRef.markForCheck()` is called explicitly

OnPush reduces unnecessary checks but requires discipline around immutability.

**Signal-based (zoneless + Signals):**
Components using `signal()`, `computed()`, or `input()` register themselves as consumers of those signals. When a signal changes, **only the specific template expressions that read that signal** are re-evaluated — not the whole component, not the whole tree. This is the most granular and performant model.

## ApplicationRef and Manual Change Detection

```typescript
// Force a full change detection cycle manually
// Useful in zoneless apps or after runOutsideAngular
applicationRef.tick();

// Mark a component for check in the next cycle (OnPush strategy)
changeDetectorRef.markForCheck();

// Detach a component from automatic change detection entirely
changeDetectorRef.detach();

// Re-attach a previously detached component
changeDetectorRef.reattach();
```

## The Ivy Rendering Pipeline

Angular compiles templates at build time into **Ivy instruction sequences**. These are the actual runtime calls that create and update the DOM.

```typescript
// Source template:
// <p class="greeting">Hello {{ name }}</p>

// Compiled output (simplified):
function AppComponent_Template(rf: RenderFlags, ctx: AppComponent) {
  if (rf & RenderFlags.Create) {
    // Create phase: build the DOM structure
    ɵɵelementStart(0, 'p', 0);   // 0 = node index, 0 = attribute index
      ɵɵtext(1);                  // 1 = text node index
    ɵɵelementEnd();
  }
  if (rf & RenderFlags.Update) {
    // Update phase: patch only what changed
    ɵɵadvance(1);                 // move to node 1
    ɵɵtextInterpolate1('Hello ', ctx.name, '');
  }
}

// Attribute array referenced above:
const _c0 = ['class', 'greeting'];
```

The `RenderFlags.Create` block runs once when the component is first instantiated. The `RenderFlags.Update` block runs on every change detection cycle. Angular uses the node index system to avoid re-querying the DOM — it tracks element references by position in a flat array.

On the server (`platform-server`), the same instructions run but call the **ServerRenderer2** instead of `DomRenderer2`. ServerRenderer2 writes to an in-memory tree structure rather than a real browser DOM.

## The Signal Graph Internals

Signals use a **reactive graph** — a directed acyclic graph of producer-consumer relationships.

```typescript
const price = signal(100);           // producer node
const tax = signal(0.2);             // producer node
const total = computed(() =>         // consumer of price and tax
  price() * (1 + tax())              // producer for anything consuming total
);
```

**How dependency tracking works:**

When `computed()` runs for the first time, Angular sets a **reactive context** — a thread-local slot that says "any signal read right now should register itself as a dependency of `total`." When `price()` is called inside the computed, it sees the active reactive context and registers `total` as one of its consumers via a `WeakRef`.

```
price (signal) ──┐
                 ├──► total (computed) ──► template expression
tax   (signal) ──┘
```

**Lazy evaluation:** `computed()` does not recalculate when its dependencies change. It marks itself as **dirty** and recalculates only when its value is next **read** (consumed). If nothing reads `total` after `price` changes, the computation never runs.

**The dirty propagation:**
1. `price.set(110)` → marks `total` as dirty → marks any template consuming `total` as needing update
2. Angular schedules a change detection microtask
3. During change detection: Angular reads `total()` → sees it is dirty → recomputes → returns 132
4. Template is updated

## New Signal APIs (Angular 19-20)

**`input()` — Signal-based component inputs:**
```typescript
@Component({ ... })
export class ProductComponent {
  // Replaces @Input() decorator
  productId = input.required<string>();          // required input, throws if missing
  category = input<string>('electronics');       // optional with default

  // inputs are readonly signals — cannot be set from inside the component
  displayName = computed(() => `Product: ${this.productId()}`);
}
```

**`output()` — Signal-based component outputs:**
```typescript
@Component({ ... })
export class SearchComponent {
  // Replaces @Output() with EventEmitter
  searchSubmitted = output<string>();

  onSubmit(term: string) {
    this.searchSubmitted.emit(term);
  }
}
```

**`viewChild()` / `contentChild()` — Signal-based queries:**
```typescript
@Component({ ... })
export class ChartComponent {
  // Replaces @ViewChild
  canvas = viewChild.required<ElementRef>('chartCanvas');
  items = viewChildren<ItemComponent>(ItemComponent);

  constructor() {
    afterNextRender(() => {
      // canvas() is always defined here because we used .required<>()
      const ctx = this.canvas().nativeElement.getContext('2d');
    });
  }
}
```

**`linkedSignal()` — Angular 19+ writable signal that resets on source change:**
```typescript
const selectedIndex = linkedSignal({
  source: () => items(),          // when items() changes...
  computation: () => 0,           // ...selectedIndex resets to 0
});
// Can also be written to: selectedIndex.set(3)
// But resets to 0 whenever items() changes
```

**`resource()` — Angular 19+ async data loading with Signals:**
```typescript
const productId = signal('abc-123');

const product = resource({
  request: () => ({ id: productId() }),  // reactive — re-fetches when productId changes
  loader: async ({ request, abortSignal }) => {
    const res = await fetch(`/api/product/${request.id}`, { signal: abortSignal });
    return res.json();
  }
});

// product.value()  — the current data (Signal<Product | undefined>)
// product.status() — 'idle' | 'loading' | 'resolved' | 'error'
// product.error()  — the error if status is 'error'
```

**`httpResource()` — Angular 20 HttpClient integration:**
```typescript
const productId = signal('abc-123');

const product = httpResource<Product>(
  () => `/api/product/${productId()}`
);
// Automatically uses HttpClient, integrates with TransferState for SSR
```

**`toSignal()` — Observable to Signal bridge:**
```typescript
import { toSignal } from '@angular/core/rxjs-interop';

@Component({ ... })
export class SearchComponent {
  searchTerm = signal('');

  // Convert Observable to Signal
  results = toSignal(
    toObservable(this.searchTerm).pipe(
      debounceTime(300),
      switchMap(term => this.http.get<Product[]>(`/api/search?q=${term}`))
    ),
    { initialValue: [] }  // required — signals must have a synchronous initial value
  );
}
```

**SSR implication of `toSignal()`:** If the Observable passed to `toSignal()` makes an HTTP request, that request is tracked by Zone.js (or PendingTasks) on the server and participates in stability. The `initialValue` is what the server renders synchronously before the observable resolves. If no `initialValue` is provided and the observable does not complete synchronously, `toSignal()` throws on the server.

---

# Chapter 3: Web Vitals — The Technical Implementation

## How LCP is Measured

The browser uses `PerformanceObserver` to watch for `largest-contentful-paint` entries:

```javascript
const observer = new PerformanceObserver((list) => {
  const entries = list.getEntries();
  const lastEntry = entries[entries.length - 1];
  console.log('LCP candidate:', lastEntry.startTime, lastEntry.element);
});
observer.observe({ type: 'largest-contentful-paint', buffered: true });
```

**How "largest" is calculated:**

The browser measures the **rendered area of the element within the viewport** — not the element's intrinsic size. If a 4000×3000 image is displayed in a 1440×900 viewport, the LCP candidate area is capped at the viewport intersection. An image that is 50% off-screen contributes only its visible portion.

For text elements, the size is the area of all text nodes rendered within the element's bounding box.

The browser keeps updating the LCP candidate as larger elements become visible. The final LCP is recorded when:
- The user first interacts (click, keydown, scroll)
- The page becomes hidden (`visibilitychange` event)

**Which elements qualify:**
- `<img>` elements
- `<image>` inside SVG
- `<video>` elements (using the poster image size)
- Elements with a background image via CSS `url()` (but not CSS gradients)
- Block-level elements containing visible text
- `<input type="image">`

**Which do not qualify:**
- Elements with `opacity: 0`
- Elements with `visibility: hidden`
- Elements fully clipped or scrolled out of viewport
- Elements with no visible content area

## How CLS is Measured

CLS uses `layout-shift` performance entries, each with a precisely defined `value`:

```javascript
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (!entry.hadRecentInput) {
      clsScore += entry.value;
    }
  }
});
observer.observe({ type: 'layout-shift', buffered: true });
```

**The exact layout shift score formula:**

```
layout_shift_value = impact_fraction × distance_fraction
```

- **impact_fraction:** The fraction of the **total viewport area** that was impacted by the shift. "Impacted" means the union of all shifted elements' positions before AND after the shift, divided by viewport area. If a 300×100px element moves inside a 1440×900 viewport, the impacted area is at minimum 300×100 = 30,000px². impact_fraction = 30,000 / (1440×900) = 0.023.
- **distance_fraction:** The greatest distance any single element moved, divided by the larger viewport dimension (usually height). If the same element moved 100px downward in a 900px-high viewport, distance_fraction = 100/900 = 0.111.
- **shift value** = 0.023 × 0.111 = 0.0026 for that shift.

Multiple shifts accumulate. Large elements that move far produce large CLS scores.

**`hadRecentInput`:** If the user interacted (click, tap, keypress) within the last 500ms, layout shifts caused by that interaction are excluded from CLS. This prevents penalizing intentional UI transitions like expanding accordions.

**The session window algorithm:**

CLS does not simply sum all layout shifts. It groups them into **session windows**:
- A session window ends when there is a gap of >1 second between shifts
- A session window is capped at a maximum of 5 seconds regardless
- CLS is the score of the **worst** (highest) session window

This prevents long-lived pages (infinite scroll, SPAs) from accumulating unbounded CLS over a session lifetime.

## How INP is Measured

```javascript
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    interactions.push({
      id: entry.interactionId,
      duration: entry.duration,
    });
  }
});
observer.observe({ type: 'event', buffered: true, durationThreshold: 16 });
```

**INP is the 98th percentile interaction duration** across all interactions during a page visit. If a user has 50 interactions, INP is the 2nd-slowest. This prevents a single pathological case from dominating the score while still penalizing poor performance at the tail.

**Interaction grouping:** An "interaction" is not a single event. It is a **logical user action** identified by an `interactionId`. A keyboard press produces at minimum: `keydown`, `keypress`, `keyup` — all sharing the same `interactionId`. A click produces: `pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`. The interaction duration is the time from the first event in the group to the last paint after the last event, not the sum of individual event durations.

**What "duration" includes:**

```
User presses key
    │
    ├── INPUT DELAY
    │   Time from when the event was dispatched to when the event handler begins
    │   Caused by: main thread busy with JS, another task running,
    │              hydration completing, long task blocking the thread
    │
    ├── PROCESSING TIME
    │   Time to run all event handlers (your Angular click handler,
    │   Zone.js change detection, DOM updates)
    │
    └── PRESENTATION DELAY
        Time from handlers completing to the browser producing a new frame
        (layout, paint, rasterization, composite)

Duration = Input Delay + Processing Time + Presentation Delay
```

## How TTFB is Measured

```javascript
const [nav] = performance.getEntriesByType('navigation');

// TTFB as commonly reported:
const ttfb = nav.responseStart - nav.requestStart;

// Full breakdown of what precedes the request:
const dnsTime     = nav.domainLookupEnd   - nav.domainLookupStart;
const tcpTime     = nav.connectEnd        - nav.connectStart;
const tlsTime     = nav.secureConnectionStart > 0
                    ? nav.connectEnd - nav.secureConnectionStart : 0;
const requestTime = nav.responseStart     - nav.requestStart;

// Total from navigation start to first byte:
const totalToFirstByte = nav.responseStart - nav.startTime;
```

**Service Worker effect on TTFB:** If a Service Worker is installed and intercepts the navigation request, `requestStart` reflects when the SW handled the request, not the network. A SW serving from cache can produce TTFB of 0-5ms even for large HTML files. Conversely, a SW that does network-first fetching adds its own overhead to TTFB.

**The SSR TTFB reality:**

```
Static file (no SSR):    disk read + send → 5-20ms server time
SSR per request:         boot Angular (0ms, already running) +
                         route match (1-2ms) +
                         guards/resolvers (5-50ms) +
                         data fetch (50-300ms) +
                         render (10-50ms) +
                         serialize (5-20ms) → 71-422ms server time
SSR with CDN cache:      CDN memory lookup → 1-5ms (same as static)
```

---

# Chapter 4: Angular SSR Architecture — How It Actually Works

## The Server Setup (Angular 19-20)

> **Version note:** `CommonEngine` and `AppServerModule` are deprecated as of Angular 19. Do not use them in new projects. The architecture below is the current standard.

**`src/main.server.ts`** — server-side bootstrap entry:

```typescript
// main.server.ts — Angular 19+
import { bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { AppComponent } from './app/app.component';
import { serverRoutes } from './app/app.routes.server';
import { appConfig } from './app/app.config';
import { mergeApplicationConfig } from '@angular/core';

const serverConfig = mergeApplicationConfig(appConfig, {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
  ],
});

export default function bootstrap() {
  return bootstrapApplication(AppComponent, serverConfig);
}
```

**`server.ts`** — Node.js server:

```typescript
// server.ts — Angular 19+
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  })
);

app.use('/**', (req, res, next) => {
  angularApp
    .handle(req, { server: 'express' })
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next()
    )
    .catch(next);
});

if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  app.listen(port);
}

export const reqHandler = createNodeRequestHandler(app);
```

**Express is one option.** Angular 19+ also supports:
- **Serverless:** `createNodeRequestHandler` exports a handler compatible with AWS Lambda, Vercel, Netlify Functions
- **Edge runtimes:** `@angular/ssr` exports a fetch-based handler compatible with Cloudflare Workers, Deno Deploy, and any WinterCG-compatible runtime
- **Node HTTP directly:** Without Express, using `http.createServer(reqHandler)`

## The Platform Abstraction

```
Angular Core (platform-agnostic)
         │
         ├── @angular/platform-browser     ← browser runtime
         │     DomRenderer2 → real DOM APIs
         │     BrowserEventManager → real addEventListener
         │     Title/Meta services → real document manipulation
         │
         └── @angular/platform-server      ← Node.js runtime
               ServerRenderer2 → in-memory DOM tree
               Server-side Title/Meta → no-ops or in-memory
               HttpClient → uses Node.js fetch (not XMLHttpRequest)
               DOCUMENT token → fake Document implementation
```

Angular's own in-memory DOM implementation replaced `domino` (a third-party DOM simulation library) in Angular 17. The internal implementation is more tightly integrated with Angular's serializer and hydration marker system.

## How Hydration Attributes Are Generated

When Angular serializes the server-rendered DOM, it needs a way to identify component boundaries so the client can reconstruct the component tree during hydration. This is done via two mechanisms:

**1. The `APP_ID` token:**
```typescript
// Each component gets a unique host attribute scoped to the APP_ID
// APP_ID defaults to 'ng' in Angular 17+ (was randomly generated before)
// The attribute format is: _nghost-{APP_ID}-c{componentIndex}
<app-root _nghost-ng-c1="">
  <app-header _nghost-ng-c2="">
    <nav _ngcontent-ng-c2=""></nav>
  </app-header>
</app-root>
```

These attributes serve two purposes: CSS encapsulation (ViewEncapsulation.Emulated) and hydration component boundary marking.

**2. The `ngh` attribute:**
The `<app-root>` element receives an `ngh` attribute containing a compressed index into the hydration metadata:

```html
<app-root ngh="0" ng-version="19.0.0">
```

The hydration metadata itself is embedded in a `<script>` block:
```html
<script id="ng-state" type="application/json">
{
  "__nghData__": [
    {
      "c": { "r": [0, 1, 2] },   // component structure
      "nodes": [...]              // DOM node mapping
    }
  ]
}
</script>
```

This data tells the client-side Angular: "component index 0 corresponds to this DOM subtree with these child nodes." The client uses this to skip re-rendering and instead attach directly.

## Lazy Loading and SSR

Angular CLI's code splitting creates separate JavaScript chunks for lazy-loaded routes. On the server, these chunks must be loaded synchronously before rendering can proceed.

Angular's server-side router handles this automatically: when a lazy-loaded route is activated during SSR, Angular uses `require()` (in Node.js CJS mode) or dynamic `import()` to load the chunk synchronously as part of the route activation. The chunk files are on the local filesystem, so this is fast — typically 1-5ms per lazy chunk.

The implication: even lazy-loaded route components are included in the SSR output. There is no deferred loading for lazy routes on the server.

## Error Handling During SSR

If a component throws during server-side rendering:

```
Component constructor throws
    ↓
Angular SSR catches the error
    ↓
Two behaviors depending on configuration:

1. Default (strict): The entire render fails.
   Express catches the error via .catch(next)
   Express returns a 500 error OR falls back to CSR
   (Angular CLI default: serve the static index.html as fallback)

2. With error boundaries (@defer with error templates):
   The @defer block catches the render error
   Renders the @error template instead
   SSR continues for the rest of the page
```

The `@defer` block's `@error` template provides a natural error boundary for SSR — isolated component failures do not crash the entire render.

## The Rendering Process in Detail

```
1. bootstrapApplication() from main.server.ts
   └── Fresh Root Injector created per request
       No state shared between requests (except Platform Injector)

2. Request URL injected into application
   APP_BASE_HREF set to the request origin

3. Router activates for the URL
   Lazy route chunks loaded synchronously if needed
   Guards execute (can be async, tracked by Zone.js / PendingTasks)
   Resolvers execute (same)
   Components instantiated

4. Component lifecycle runs
   Constructors execute
   ngOnInit executes
   HTTP requests dispatched (tracked automatically by HttpClient + Zone.js)
   PendingTasks.run() wraps any custom async work
   Data arrives, change detection runs
   Components render to the in-memory DOM

5. Stability reached
   Zone.js: _hasPendingMicrotasks = false AND _hasPendingMacrotasks = false
   Zoneless: PendingTasks counter = 0
   ApplicationRef.isStable emits true

6. Serialization
   In-memory DOM walked recursively
   HTML string constructed
   If provideClientHydration() is active:
     Component boundary markers injected
     ngh attributes added to host elements
     Hydration metadata embedded in ng-state script
     Transfer state (HTTP cache) embedded in ng-state script
     jsaction attributes added to interactive elements (if withEventReplay())

7. Angular application instance destroyed
   All subscriptions cleaned up via DestroyRef
   Memory freed for this request's component tree

8. HTML string returned to AngularNodeAppEngine
   writeResponseToNodeResponse() sets headers and streams the response
```

---

# Chapter 5: Hydration — The Technical Implementation

## Prerequisite: Enabling Hydration

Hydration is **not automatic**. It requires explicit configuration:

```typescript
// app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideClientHydration(
      withHttpTransferCache(),     // prevents duplicate HTTP requests
      withEventReplay(),           // captures events during hydration
      withIncrementalHydration()   // enables @defer hydration triggers (Angular 19+)
    )
  ]
};
```

Without `provideClientHydration()`, Angular destroys the server-rendered DOM on client bootstrap and performs a full client-side re-render — producing a visible flash and CLS regression.

## How Angular Walks the DOM During Hydration

During browser bootstrap with hydration enabled, Angular reads the `ngh` attribute and the `ng-state` hydration metadata to reconstruct the component tree **without re-rendering**.

```
Angular has:  Component tree (from bootstrapping main.ts)
Browser has:  Existing DOM (from server-rendered HTML) + ng-state metadata

Hydration algorithm:
  1. Parse ng-state JSON to get hydration info map
  2. For AppComponent: read ngh="0", look up index 0 in hydration map
  3. Find the corresponding DOM node (the <app-root> element)
  4. Assign that DOM node as AppComponent's host element
  5. For each child component in AppComponent's template:
       a. Use hydration map to locate the corresponding DOM node
       b. Verify node type matches template expectation
       c. If match:
            - Assign existing DOM node to component view
            - Attach event listeners to existing elements
            - Set up signal/binding connections
       d. If mismatch:
            - Log NG0500/NG0501/etc. in development mode
            - Destroy mismatched subtree
            - Re-render from scratch (causes CLS)
       e. Recurse into child components
  6. Mark hydration complete
  7. If withEventReplay() enabled: replay captured events
```

This is fundamentally different from the client-only path where Angular calls `document.createElement()` for every element.

## Hydration Mismatch Error Reference

| Code | Cause | Common trigger |
|---|---|---|
| NG0500 | Expected a DOM node at position N, found nothing | Server rendered fewer nodes than client expects |
| NG0501 | Text content mismatch | `Date.now()`, `Math.random()`, server/client time difference |
| NG0502 | Node type mismatch (e.g., expected element, found text) | Conditional rendering differs between server and client |
| NG0503 | Unexpected text node found | Whitespace differences, browser auto-inserts `<tbody>` |
| NG0504 | Parent has ngSkipHydration but child tried to hydrate | Incorrect skipHydration placement |
| NG0505 | Client expected hydration info but server HTML had none | Server rendered without provideClientHydration() |
| NG0506 | Could not find DOM node referenced in hydration metadata | DOM was modified by third-party script before hydration |

In production, all of these result in silent fallback: Angular destroys and re-renders the affected subtree. In development mode, they throw errors that halt hydration.

## The `ngSkipHydration` Escape Hatch

```html
<app-timestamp ngSkipHydration></app-timestamp>
```

Angular skips hydration for this component and all its children. The server-rendered DOM for this subtree is destroyed; the component re-renders client-side. Use for:
- Components that read `Date.now()`, `Math.random()`, or similar nondeterministic values
- Third-party components that manipulate the DOM directly in their constructors
- Components that read browser-only APIs (`window`, `navigator`) during initialization

## Event Replay (`withEventReplay()`) — Angular 18+

```
Timeline without withEventReplay():
0ms      HTML arrives, user sees content
50ms     User clicks "Add to Cart" — no Angular handler attached yet
900ms    Hydration completes — click is gone forever

Timeline with withEventReplay():
0ms      HTML arrives, user sees content
         Angular injected jsaction="click:..." on interactive elements during SSR
50ms     User clicks "Add to Cart"
         Pre-hydration capture script records: {event: 'click', element: button, timestamp: 50}
900ms    Hydration completes
         Replay: the recorded click is dispatched through Angular's event system
         "Add to Cart" handler fires correctly
```

The `jsaction` attribute Angular injects during SSR:
```html
<button jsaction="click:;keydown:;">Add to Cart</button>
```

This is the same attribute format used by Google's internal event delegation infrastructure. The pre-hydration capture script is a small (~1KB) inline script that attaches a single root-level event listener to capture all events before Angular is ready.

## Incremental Hydration (`withIncrementalHydration()`) — Angular 19+

Full hydration processes the entire component tree on page load. For large pages, this can take 200-500ms of main thread time — contributing to input delay and poor INP.

Incremental hydration defers hydration of `@defer` blocks until specific triggers:

```html
<!-- Hydrate when user clicks or interacts with this block -->
@defer (hydrate on interaction) {
  <product-reviews [productId]="id" />
}

<!-- Hydrate when this block enters the viewport -->
@defer (hydrate on viewport) {
  <related-products />
}

<!-- Hydrate after the browser reports idle time -->
@defer (hydrate on idle) {
  <footer-newsletter />
}

<!-- Hydrate immediately (equivalent to full hydration for this block) -->
@defer (hydrate on immediate) {
  <above-fold-hero />
}

<!-- Hydrate after a specific time -->
@defer (hydrate on timer(2000ms)) {
  <delayed-widget />
}

<!-- Hydrate when a condition becomes true -->
@defer (hydrate when userScrolledPastHero()) {
  <personalized-recommendations />
}

<!-- Never hydrate — static content, no interactivity needed -->
@defer (hydrate never) {
  <legal-disclaimer />
}
```

**How `@defer` blocks behave during SSR:**

During SSR, Angular renders the `@defer` block content (not the `@placeholder`) into the HTML. The server-rendered HTML is fully populated. But on the client, the hydration for that block is deferred until the trigger fires.

Before the trigger fires: the content is visible (server-rendered HTML is there) but not interactive. No event listeners are attached.

After the trigger fires: Angular hydrates just that subtree — loads the component class if it was code-split, runs change detection, attaches event listeners.

## Non-Destructive Hydration for Third-Party Scripts

If a third-party script (analytics, chat widget, A/B testing library) modifies the DOM between SSR response delivery and Angular hydration, Angular may encounter nodes it did not expect. This causes NG0506 errors.

Mitigation strategies:
1. Use `ngSkipHydration` on containers managed by third-party scripts
2. Initialize third-party scripts in `afterNextRender()` so they run after hydration
3. Use a `MutationObserver` to detect and defer third-party DOM modifications until after hydration

---

# Chapter 6: Stability — Zone.js Internals

## Microtasks vs Macrotasks in SSR Context

Zone.js tracks two separate categories of pending work, and both affect stability:

**Macrotasks** (pending timers and intervals):
```typescript
// Each of these registers a pending macrotask
setTimeout(() => {}, 1000);         // pendingMacrotasks++, decrements after 1000ms
setInterval(() => {}, 1000);        // pendingMacrotasks++, NEVER decrements
fetch('/api/data');                  // pendingMacrotasks++ until response
new XMLHttpRequest().send();        // pendingMacrotasks++ until response
```

**Microtasks** (pending promise chains):
```typescript
// Each of these registers a pending microtask
Promise.resolve().then(() => {});   // pendingMicrotasks++, resolves synchronously
async function load() {
  await fetch('/api');              // fetch is macrotask, but the await chain is microtask
}
```

**The stability condition:**

```typescript
// NgZone internal stability check (simplified):
get isStable(): boolean {
  return !this._hasPendingMicrotasks && !this._hasPendingMacrotasks;
}
```

Both must be false for the app to be stable. In practice:
- Pending HTTP requests keep `_hasPendingMacrotasks = true` until the response stream is consumed
- Promise chains following HTTP requests keep `_hasPendingMicrotasks = true` momentarily after each `.then()`
- `setInterval` keeps `_hasPendingMacrotasks = true` forever

## NgZone Stability Events

```typescript
class NgZone {
  // Fires every time the microtask queue empties (very frequent)
  // This is what triggers Angular change detection
  onMicrotaskEmpty: EventEmitter<void>;

  // Fires when BOTH queues are empty AND we are not inside a zone.run() call
  // This is what Angular SSR uses to know rendering is complete
  onStable: EventEmitter<void>;

  // Fires when the app transitions from stable → unstable
  onUnstable: EventEmitter<void>;

  // Observable wrapping onStable / onUnstable
  isStable: Observable<boolean>;
}
```

**The distinction between `onMicrotaskEmpty` and `onStable`:**

`onMicrotaskEmpty` fires many times during a single render cycle — every time a promise chain resolves and the microtask queue empties, even if macrotasks are still pending. Angular runs change detection on each of these.

`onStable` fires once when everything — micro and macro — is complete. Angular SSR waits for this.

## The SSR Stability Contract

```typescript
// Simplified internal rendering engine logic:
async render(options): Promise<string> {
  const appRef = await bootstrapApplication(bootstrap, options);

  await firstValueFrom(
    appRef.isStable.pipe(
      filter(stable => stable === true),
      first()
    )
  );

  const html = serializeDOM();
  appRef.destroy();
  return html;
}
```

**The timeout:** Angular's SSR engine has a configurable stability timeout. If `isStable` never emits `true` within the timeout window, the render either:
- Returns the partially rendered HTML (incomplete but better than hanging forever)
- Throws, causing the Express error handler to serve the fallback static `index.html`

This is why sporadic 30-second server responses indicate a stability problem, not a network problem.

## `runOutsideAngular` — The SSR Implication

```typescript
@Injectable({ providedIn: 'root' })
export class PollingService {
  constructor(private ngZone: NgZone, @Inject(PLATFORM_ID) private platformId: object) {
    if (isPlatformBrowser(this.platformId)) {
      // Run outside Angular's zone so the interval never affects stability
      // and never triggers change detection automatically
      this.ngZone.runOutsideAngular(() => {
        setInterval(() => {
          const data = this.fetchLatest();
          // To update UI, explicitly re-enter the zone:
          this.ngZone.run(() => {
            this.data.set(data);  // This triggers change detection
          });
        }, 5000);
      });
    }
  }
}
```

`runOutsideAngular` places the callback in the **root zone** — Zone.js's parent zone that exists before Angular creates NgZone. Tasks started in the root zone are tracked by Zone.js (the patching still happens) but do not increment NgZone's `_hasPendingMacrotasks` counter and do not fire `onMicrotaskEmpty`.

## PendingTasks — The Only Stability Mechanism in Zoneless Apps

In zoneless apps, Zone.js does not exist. `ApplicationRef.isStable` is driven entirely by `PendingTasks`:

```typescript
import { PendingTasks, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DataService {
  private pendingTasks = inject(PendingTasks);

  // Option 1: manual cleanup pattern
  async loadData() {
    const cleanup = this.pendingTasks.add();  // mark app as unstable
    try {
      const response = await fetch('/api/data');
      this.data.set(await response.json());
    } finally {
      cleanup();  // mark this task as complete — MUST always be called
    }
  }

  // Option 2: run() wrapper (handles cleanup automatically)
  async loadDataSafe() {
    await this.pendingTasks.run(async () => {
      const response = await fetch('/api/data');
      this.data.set(await response.json());
    });
    // cleanup called automatically whether the promise resolves or rejects
  }
}
```

Angular's `HttpClient` calls `PendingTasks.add()` before making a request and `cleanup()` when the response stream is fully consumed. In zoneless apps, this is all the tracking that happens — any custom async work not using `HttpClient` must be wrapped in `PendingTasks.run()` to participate in SSR stability.

---

# Chapter 7: Transfer State — The Deduplication Mechanism

## The Problem Without Transfer State

```
Server (SSR):
  ProductComponent.ngOnInit() fires
  this.http.get('/api/product/123') → HTTP request
  Response: { id: 123, name: "Laptop", price: 999 }
  Component state set, HTML rendered

Browser:
  Angular bootstraps
  ProductComponent.ngOnInit() fires AGAIN
  this.http.get('/api/product/123') → second HTTP request
  Response arrives 200ms later
  Component state updated
  Change detection runs
  DOM potentially changes → possible hydration mismatch → possible CLS
```

Two requests. Double server load. Potential data inconsistency. Potential CLS.

## How Transfer State Works Internally

During SSR, Angular's `HttpClient` (when `withHttpTransferCache()` is enabled) intercepts every response and stores it in `TransferState`:

```typescript
// What HttpClient does internally during SSR (simplified):
intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
  const stateKey = this.generateKey(req);

  return next.handle(req).pipe(
    tap(event => {
      if (event instanceof HttpResponse && isPlatformServer(this.platformId)) {
        // Store response in TransferState
        this.transferState.set(stateKey, {
          body: event.body,
          status: event.status,
          statusText: event.statusText,
          headers: event.headers.keys().reduce((acc, key) => {
            acc[key] = event.headers.getAll(key);
            return acc;
          }, {})
        });
      }
    })
  );
}
```

After rendering, `TransferState` is serialized into the HTML:

```html
<script id="ng-state" type="application/json">
{
  "HttpClient.u/api/product/123.GET.{}": {
    "body": { "id": 123, "name": "Laptop", "price": 999 },
    "status": 200,
    "statusText": "OK",
    "headers": { "content-type": ["application/json"] }
  }
}
</script>
```

On the client, the same interceptor checks `TransferState` before making any request:

```typescript
// Client-side behavior:
intercept(req, next) {
  const stateKey = this.generateKey(req);

  if (isPlatformBrowser(this.platformId)) {
    const cachedResponse = this.transferState.get(stateKey, null);
    if (cachedResponse !== null) {
      this.transferState.remove(stateKey);  // one-time cache, prevent stale use
      return of(new HttpResponse({
        body: cachedResponse.body,
        status: cachedResponse.status,
        // ...
      }));
    }
  }

  return next.handle(req);
}
```

The cached response is returned synchronously — no network request, no async wait. The component's `ngOnInit` gets its data immediately, preventing the duplicate request and the potential hydration mismatch.

## The Key Generation

The `TransferState` key is generated from:
- The normalized URL (scheme + host + path + sorted query params)
- The HTTP method
- The request body (hashed, for POST requests)

Two requests to the same URL with the same method will match. A request with a different sort order on query params may not match if the server URL was constructed differently — this is a common source of "transfer state not being used" bugs.

## Custom Transfer State

For data that is not fetched via `HttpClient` (custom WebSocket data, file reads, environment-specific configuration):

```typescript
import { TransferState, makeStateKey } from '@angular/core';

// Define a typed key
const PRODUCT_KEY = makeStateKey<Product>('featured-product');

@Injectable({ providedIn: 'root' })
export class ProductService {
  private transferState = inject(TransferState);
  private platformId = inject(PLATFORM_ID);

  getFeaturedProduct(): Observable<Product> {
    if (isPlatformBrowser(this.platformId)) {
      const cached = this.transferState.get(PRODUCT_KEY, null);
      if (cached) {
        this.transferState.remove(PRODUCT_KEY);
        return of(cached);
      }
    }

    return this.fetchFromApi().pipe(
      tap(product => {
        if (isPlatformServer(this.platformId)) {
          this.transferState.set(PRODUCT_KEY, product);
        }
      })
    );
  }
}
```

**Security note:** Transfer state is embedded in the HTML response and visible to any user who views the page source. Do not store sensitive data (auth tokens, PII, internal API keys) in `TransferState`. Only store data that would be publicly visible in the rendered HTML anyway.

## `withNoHttpTransferCache()` — Opting Out

```typescript
provideClientHydration(
  withNoHttpTransferCache()  // disable HTTP transfer cache entirely
)
```

Use this when:
- Your API responses contain session-specific data that must never be shared between server render and client
- You are debugging hydration issues and want to eliminate transfer state as a variable
- Your API uses authentication mechanisms that differ between server and client

---

# Chapter 8: Signals + SSR — The Complete Picture

## The Signal Graph

A signal is a reactive value container with a directed dependency graph:

```
WritableSignal<T>:
  - stores a value
  - has a version counter (increments on every set/update)
  - maintains a WeakRef list of consumers

Signal<T> / ComputedSignal<T>:
  - has a "dirty" flag
  - has a WeakRef list of consumers
  - has its own list of producers (signals it depends on)
  - lazy: recomputes only when read AND dirty

Template bindings:
  - are consumers of every signal read during their execution
  - are marked dirty when any producer signal changes
  - are re-executed during change detection if dirty
```

**Lazy evaluation in detail:**

```typescript
const a = signal(1);
const b = signal(2);
const sum = computed(() => a() + b());

// sum has not been computed yet — no reactive context was active when declared
// sum.value is undefined internally; dirty flag = true

a.set(10);
// sum is NOT recomputed here
// sum's dirty flag is set to true (it was already true)
// Any template consuming sum() is marked for update

// Only when a template reads sum() does recomputation happen:
console.log(sum()); // NOW it runs: 10 + 2 = 12
```

## Signals in SSR Context

On the server, Angular uses a synchronous rendering model. Signal evaluation is synchronous. Any signal that depends on async data must be resolved before rendering — which means the async work must be tracked by `PendingTasks` so SSR stability waits for it.

**Pure computation — safe:**

```typescript
@Component({
  template: `<p>Total: £{{ total() | number:'1.2-2' }}</p>`
})
export class CartComponent {
  items = signal([{ price: 10 }, { price: 20 }]);
  total = computed(() => this.items().reduce((sum, i) => sum + i.price, 0));
}
```

Server evaluates `total()` → 30. Client evaluates `total()` → 30. Deterministic. Hydration matches.

**`effect()` — dangerous:**

```typescript
constructor() {
  effect(() => {
    // Runs during server rendering
    // Runs again during client hydration bootstrap
    this.analytics.track('event', this.count());
  });
}
```

Effects run as part of the change detection cycle, which runs on both server and client. Analytics fires twice.

**`afterNextRender` and `afterRender` — browser-only by design:**

```typescript
import { afterNextRender, afterRender, afterRenderEffect } from '@angular/core';

constructor() {
  // Runs ONCE after first browser render — never on server
  afterNextRender(() => {
    this.chart = new Chart(this.canvas.nativeElement, config);
  });

  // Runs after EVERY browser render cycle — never on server
  afterRender(() => {
    this.resizeObserver.observe(this.container.nativeElement);
  });
}
```

**`toSignal()` SSR implications:**

```typescript
// This works correctly in SSR:
results = toSignal(
  this.http.get<Product[]>('/api/featured'),
  { initialValue: [] }
);
// Server renders with initialValue=[]
// HTTP request is made (tracked by HttpClient + PendingTasks)
// If request completes before stability: server renders with actual data
// Transfer state ensures client gets same data without second request
```

```typescript
// This is problematic in SSR:
results = toSignal(
  interval(1000).pipe(switchMap(() => this.http.get('/api/poll')))
);
// interval(1000) creates a macrotask that never completes
// App never stabilises → SSR hangs
```

## `resource()` and SSR (Angular 19+)

```typescript
const productId = signal('abc-123');

const product = resource({
  request: () => ({ id: productId() }),
  loader: async ({ request, abortSignal }) => {
    const res = await fetch(`/api/product/${request.id}`, { signal: abortSignal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<Product>;
  }
});
```

During SSR, `resource()` registers the loader as a `PendingTask`. Angular SSR waits for the loader to complete before serializing. The resolved value is stored in `TransferState` automatically when `httpResource()` is used. For custom `resource()` loaders, you must handle `TransferState` manually or accept that the client will re-fetch.

---

# Chapter 9: SSR Impact on Web Vitals — The Full Technical Picture

## Lab Data vs Field Data

Before analyzing SSR's impact, understand which type of data you're looking at:

**Lab data** (Lighthouse, WebPageTest, Chrome DevTools):
- Controlled environment, single run, simulated network/CPU throttling
- Useful for development and debugging
- Does not represent real user diversity
- SSR improvements show clearly in lab data

**Field data** (Chrome User Experience Report — CrUX, Search Console Core Web Vitals):
- Aggregated from real Chrome users who've consented to data collection
- The 75th percentile of real user experiences
- Represents the diversity of user devices, networks, geographic distances
- **This is what Google uses for search ranking**
- SSR improvements may be smaller in field data if your server is slow for some geographies

The gap between lab and field data is often larger for SSR apps: lab tests simulate one server location, while real users are globally distributed with varying TTFB to your origin.

## LCP — The Complete Story

```
CSR LCP timeline (lab, 4G, mid-range device):
────────────────────────────────────────────────────────────────────────────────────────────────────────────►
│ DNS+TCP+TLS │ Request │ TTFB │ HTML parse │ JS download │ JS parse │ JS execute │ Data fetch │ Render │
│    ~100ms   │  ~20ms  │ ~5ms │   ~10ms    │   ~500ms    │  ~200ms  │   ~100ms   │   ~300ms   │ ~50ms  │
                                                                                                    ▲
                                                                                                   LCP ~1285ms

SSR LCP timeline (same conditions, 200ms server render):
────────────────────────────────────────────────────────────────────────────────────────────────────────────►
│ DNS+TCP+TLS │ Request │ Server render │ TTFB │ HTML parse │ Content in HTML │ Render │
│    ~100ms   │  ~20ms  │    ~200ms     │      │   ~10ms    │  (no extra wait) │ ~10ms  │
                                                                                    ▲
                                                                                   LCP ~340ms
```

**The LCP element can change after hydration.** If a server-rendered LCP element (an `<h1>`) is destroyed and re-rendered during hydration (due to a mismatch), the LCP entry recorded by the browser at first paint remains, but the visual stability suffers. More importantly, if hydration re-renders a component that was the LCP element, the `largest-contentful-paint` observer may record a new entry at hydration time — potentially changing the reported LCP. In practice, this only matters if hydration causes a visible repaint of the LCP element.

**The TTFB crossover point:**

```
SSR LCP wins when:   TTFB_ssr < TTFB_csr + JS_download + JS_parse + JS_execute + data_fetch
                     server_render_time + network < ~1100ms (for the example above)

At 500ms server render: SSR LCP = 620ms vs CSR LCP = 1285ms → SSR wins by 665ms
At 1000ms server render: SSR LCP = 1120ms vs CSR LCP = 1285ms → SSR wins by 165ms
At 1200ms server render: SSR LCP = 1320ms vs CSR LCP = 1285ms → CSR wins by 35ms
```

## CLS — The Full Technical Chain

```
SSR renders HTML:
  <div class="promo-banner">
    <p>Offer expires: 15:42:30</p>   ← Date.now() evaluated on server
  </div>

Client hydration checks:
  Server DOM: <p>Offer expires: 15:42:30</p>
  Client evaluates: Date.now() → 15:42:31

  Angular: NG0501 mismatch. Destroying this subtree.
  Angular: Re-renders <div class="promo-banner"> with "15:42:31"

  Browser event:
    LayoutShift entry:
      value = impact_fraction × distance_fraction
      Let's say the banner is 1440×80px in a 1440×900 viewport
      impact_fraction = (1440×80) / (1440×900) = 0.089
      If elements below shifted 80px: distance_fraction = 80/900 = 0.089
      layout_shift_value = 0.089 × 0.089 = 0.0079

Multiple such mismatches → accumulated CLS of 0.1-0.3+
```

## INP — Why SSR Barely Helps (and How Incremental Hydration Changes This)

**The full timeline with hydration costs:**

```
0ms      HTML arrives (server-rendered, fully populated)
0-10ms   Browser paints initial frame — user sees content
         Main thread: busy processing HTML + CSS

50ms     User clicks "Add to Cart"
         Input delay begins: no Angular handler attached
         Click registered by pre-hydration capture (if withEventReplay())

100ms    JS bundle download begins (deferred scripts)

600ms    JS bundle download complete (500ms for 2MB on 4G)
600ms    JS parsing begins (CPU-bound, ~200ms for 2MB)

800ms    Parsing complete, Angular bootstraps
         DI setup, router, service instantiation (~100ms)

900ms    Full hydration begins
         Walking DOM, attaching bindings, registering listeners (~100-300ms)

1100ms   Hydration complete
         withEventReplay() dispatches captured click
         Angular processes "Add to Cart" handler
         Change detection runs
         DOM updated

INP = 1100ms - 50ms = 1050ms → POOR (>500ms threshold)
```

**With incremental hydration:**

```html
@defer (hydrate on interaction) {
  <add-to-cart-button [product]="product" />
}
```

```
0ms      HTML arrives — button is visible (server-rendered)
50ms     User hovers/clicks button area
         Angular detects interaction on @defer block
         Hydrates ONLY the add-to-cart-button component (~20ms)
         Attaches click handler

70ms     Angular processes click handler
         Input delay: 20ms (time to hydrate the component)
         Processing time: ~5ms

INP = 70ms - 50ms = 20ms → GOOD (<200ms threshold)
```

Incremental hydration is the most impactful Angular 19+ feature for INP on SSR pages.

## TTFB — SSR Always Costs More Initially

```
Request flow:
Client → CDN → Origin server
         ↕         ↕
    cache miss  SSR render: 100-500ms

With caching:
  Cache hit: CDN responds in 1-5ms (TTFB same as static)
  Cache miss: Origin renders: 100-500ms (TTFB worse than static)
  Cache hit rate for a popular product page: 95%+
  Net TTFB impact: ~5% of requests pay the SSR cost

Cache strategy by content type:
  Marketing pages:    Cache-Control: public, max-age=3600, s-maxage=86400
  Product pages:      Cache-Control: public, s-maxage=300, stale-while-revalidate=60
  Category pages:     Cache-Control: public, s-maxage=60
  Search results:     Cache-Control: private (query-specific, hard to cache)
  Auth-gated:         Cache-Control: private, no-store (never cache)
```

---

# Chapter 10: The Full Architectural Decision Framework

## The Questions to Ask Per Route

### Question 1: Who is the audience?

```
Unauthenticated users:
  → Googlebot can index the content
  → CDN can cache the rendered HTML
  → First paint benefits real users
  → SSR worth evaluating

Authenticated users only:
  → Googlebot cannot log in — zero SEO benefit
  → Content is user-specific — CDN cannot cache
  → Server must render for every user → TTFB cost without cache benefit
  → SSR adds complexity with no measurable gain
```

### Question 2: What is the LCP element and is it in the HTML?

```
LCP is a text block or heading:
  → SSR puts it in HTML immediately → strong LCP improvement
  → Low CLS risk if content is deterministic

LCP is an image in the HTML (SSR img tag):
  → <img> tag is in HTML → browser discovers early
  → But image still has to download → image is the real LCP bottleneck
  → Add <link rel="preload" as="image"> for the LCP image
  → SSR helps discovery, preload solves download latency

LCP is a JS-driven image (dynamically inserted):
  → SSR cannot help → image is not in initial HTML
  → Use SSR to put a static <img> in HTML instead of dynamic injection

LCP is a background-image via CSS:
  → SSR puts the HTML element in place → browser applies CSS
  → But background images are not eligible for resource hints
  → Consider <img> with object-fit instead for LCP elements
```

### Question 3: Data freshness and cacheability?

```
Changes less than hourly (articles, documentation):
  → Cache at CDN: s-maxage=3600
  → 99%+ cache hit rate at steady state
  → TTFB effectively same as static

Changes every few minutes (product inventory, prices):
  → Cache with short TTL + stale-while-revalidate
  → s-maxage=60, stale-while-revalidate=300
  → User always sees content within 60s of freshness

Changes in real-time (live prices, scores, chat):
  → No cache possible for the dynamic content
  → Every request pays full SSR cost
  → Rendered content is stale by the time hydration completes
  → SSR gives no meaningful benefit for the live portion
  → Consider: SSR the page shell, CSR the live data sections
```

### Question 4: CLS risk assessment?

```
Low risk:
  ✓ All template values from deterministic server-side data
  ✓ No Math.random(), Date.now(), window.* in templates
  ✓ Images have explicit width/height attributes
  ✓ Fonts loaded with font-display: optional or size-adjust
  ✓ Third-party widgets use ngSkipHydration

High risk (requires remediation before SSR is safe):
  ✗ Date/time displays without server-injected timestamp
  ✗ A/B test variants determined by browser cookies
  ✗ localStorage/sessionStorage values in initial render
  ✗ User-agent-based content branching
  ✗ Third-party libraries that mutate the DOM in constructors
  ✗ Dynamic class lists based on browser viewport
```

### Question 5: INP profile?

```
Content consumption (articles, product detail, blog):
  → Low interaction frequency
  → LCP matters more than INP
  → SSR wins on the dominant metric
  → Use incremental hydration for interactive islands

Form-intensive flows (checkout, multi-step wizard):
  → High interaction frequency
  → INP matters more than LCP
  → SSR provides visual-only benefit
  → Hydration overhead creates exactly the interaction delay users feel
  → If using SSR: use incremental hydration extensively

Real-time interaction (trading terminal, live collaboration):
  → INP is critical, must be sub-100ms
  → SSR cannot achieve this for the interactive core
  → Do not SSR the interactive portions
```

## The Route Classification Matrix

```
Route Type               │ SEO │ Cache │ Fresh │ LCP Gain │ CLS Risk │ INP Risk │ Verdict
─────────────────────────┼─────┼───────┼───────┼──────────┼──────────┼──────────┼──────────────
Homepage / marketing     │ YES │ HIGH  │ LOW   │ HIGH     │ LOW      │ LOW      │ Prerender
Blog post / article      │ YES │ HIGH  │ LOW   │ HIGH     │ LOW      │ LOW      │ Prerender
Product detail           │ YES │ MED   │ MED   │ HIGH     │ LOW-MED  │ MED      │ SSR + cache
Category listing         │ YES │ MED   │ MED   │ MED      │ MED      │ LOW      │ SSR + care
Search results           │ YES │ LOW   │ HIGH  │ MED      │ MED      │ LOW      │ SSR, no cache
User dashboard           │ NO  │ NONE  │ HIGH  │ LOW      │ MED-HIGH │ HIGH     │ CSR
Account settings         │ NO  │ NONE  │ LOW   │ LOW      │ LOW-MED  │ HIGH     │ CSR
Admin panel              │ NO  │ NONE  │ HIGH  │ LOW      │ HIGH     │ HIGH     │ CSR
Real-time feed           │ NO  │ NONE  │ RT    │ NONE     │ VERY HIGH│ CRITICAL │ CSR
Trading terminal         │ NO  │ NONE  │ RT    │ NONE     │ VERY HIGH│ CRITICAL │ CSR
Checkout flow            │ NO  │ NONE  │ MED   │ LOW      │ MED      │ HIGH     │ CSR
```

---

# Chapter 11: Architecture — Route Strategy and Rendering Modes

## Route-Level Rendering Configuration (Angular 19+)

The rendering mode is configured in a **separate file** from the client routes:

```typescript
// src/app/app.routes.server.ts — Angular 19+
import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Prerender at build time — zero runtime TTFB, maximum LCP
  {
    path: '',
    mode: RenderMode.Prerender,
  },
  {
    path: 'about',
    mode: RenderMode.Prerender,
  },
  // Prerender with dynamic params — requires getPrerenderParams()
  {
    path: 'blog/:slug',
    mode: RenderMode.Prerender,
    async getPrerenderParams() {
      // Called at build time to enumerate all param values
      // Must return all possible values for :slug
      const slugs = await fetch('https://cms.example.com/blog/slugs')
        .then(r => r.json()) as string[];
      return slugs.map(slug => ({ slug }));
    }
  },
  // On-demand SSR — rendered per request, cacheable at CDN
  {
    path: 'product/:id',
    mode: RenderMode.Server,
  },
  // CSR only — Angular bootstraps in browser, no server rendering
  {
    path: 'dashboard',
    mode: RenderMode.Client,
  },
  {
    path: 'admin/**',
    mode: RenderMode.Client,
  },
  // Catch-all — SSR for anything not explicitly configured
  {
    path: '**',
    mode: RenderMode.Server,
  },
];
```

## The Three Rendering Modes in Detail

**`RenderMode.Prerender` (SSG — Static Site Generation):**
Runs at build time (`ng build`). Angular bootstraps, renders the route, and saves the HTML file to the output directory. At runtime, the CDN serves a static file — zero server processing. TTFB approaches CDN response time (1-10ms globally). Maximum LCP performance.

Limitation: cannot use request-time context (cookies, auth headers, personalization). The same HTML is served to every user.

**`RenderMode.Server` (SSR — Server Side Rendering):**
Renders on every request. Can access request headers, cookies, and user context. Results can be cached at CDN with appropriate `Cache-Control` headers. For public content with short cache TTLs, combine with CDN caching to get near-static TTFB for cached responses.

```typescript
// Setting cache headers in a Server-rendered route (Angular 19+)
// In your server.ts Express middleware:
app.use('/**', (req, res, next) => {
  angularApp.handle(req, { server: 'express' }).then(response => {
    if (response) {
      // Add cache headers before sending
      response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
      writeResponseToNodeResponse(response, res);
    } else {
      next();
    }
  }).catch(next);
});
```

**`RenderMode.Client` (CSR — Client Side Rendering):**
Angular serves the static `index.html` shell. The browser downloads JavaScript and Angular bootstraps entirely client-side. No server rendering. No hydration. No stability concerns. No two-runtime complexity. The right choice for auth-gated, real-time, and interaction-heavy routes.

## The Architect's Summary Table

| Concept | Technical Reality |
|---|---|
| Critical Rendering Path | DNS → TCP → TLS → HTTP → HTML parse (incremental) → preload scanner → CSSOM → style calc → render tree → layout → paint → rasterize → layer promotion → composite |
| HTTP/3 / QUIC | Replaces TCP, combines transport + TLS into 1-RTT, 0-RTT for repeat visitors, no head-of-line blocking |
| Parser blocking | Plain `<script>` blocks parser. Modern Angular uses `type="module"` = deferred by default |
| CSS blocking | Render-blocking but NOT parser-blocking |
| Compositor thread | Separate from main thread. Scroll and transform/opacity animations run independently of JS |
| Angular injector hierarchy | Platform → Root Environment → Component → Element |
| Zone.js macrotasks | setTimeout, setInterval, fetch — tracked by pendingMacrotasks counter |
| Zone.js microtasks | Promise.then, async/await — tracked by _hasPendingMicrotasks counter |
| onMicrotaskEmpty | Fires on every Promise resolution — triggers Angular change detection |
| onStable | Fires when BOTH pending counters = 0 — used by SSR to determine render completion |
| runOutsideAngular | Runs in parent zone — does not increment NgZone counters — no change detection |
| Zoneless | No Zone.js. Change detection driven by Signals only. provideExperimentalZonelessChangeDetection() |
| Signal lazy eval | computed() only recomputes when read AND dirty — never on dependency change alone |
| linkedSignal() | Writable signal that resets to computed value when source signal changes (Angular 19+) |
| resource() | Async data loader integrated with Signal graph and PendingTasks (Angular 19+) |
| toSignal() | Observable → Signal bridge. Requires initialValue for SSR. Observable must complete or be manageable |
| LCP size calculation | Visible area within viewport, not full element intrinsic size |
| CLS formula | impact_fraction × distance_fraction per shift, worst session window |
| INP percentile | 98th percentile of all interaction durations in the page visit |
| AngularNodeAppEngine | Angular 19+ replacement for deprecated CommonEngine |
| AppServerModule | Deprecated. Use standalone bootstrap via main.server.ts |
| Per-request isolation | Each SSR request gets its own Root Environment Injector — Platform Injector is shared |
| APP_ID + ngh | Mechanism for hydration component boundary markers in HTML |
| Hydration algorithm | Reads ngh + ng-state metadata, walks DOM, matches nodes, attaches bindings without re-rendering |
| NG0500–NG0506 | Specific hydration mismatch codes, each with distinct root cause |
| ngSkipHydration | Escape hatch for non-deterministic or third-party components |
| withEventReplay() | jsaction attributes + pre-hydration capture script → replays events after hydration |
| withIncrementalHydration() | @defer blocks hydrate on interaction/viewport/idle/timer/condition/never (Angular 19+) |
| @defer + SSR | Content (not placeholder) renders during SSR. Client hydrates lazily per trigger. |
| TransferState security | Visible in page source. Never store sensitive data. |
| withNoHttpTransferCache() | Disables HTTP transfer cache — use for session-specific or auth-specific data |
| makeStateKey<T>() | Typed custom transfer state keys for non-HttpClient data |
| PendingTasks | Only stability mechanism in zoneless apps. HttpClient registers automatically. |
| app.routes.server.ts | Separate file defining RenderMode per route. getPrerenderParams() for dynamic routes. |
| SSR + LCP | Wins when TTFB (including server render) < CSR JS execution time |
| SSR + CLS | Can worsen CLS via hydration mismatches. Nondeterminism = layout shift. |
| SSR + INP | Barely helps alone. Incremental hydration with @defer is the real INP solution. |
| SSR + TTFB | Always worse than static without caching. CDN caching restores near-static TTFB. |
| Lab vs field data | Lab = controlled, single run. Field = CrUX 75th percentile real users. Google ranks on field data. |

# Chapter 12: SSR Problems & Angular Solutions — Architect Reference

A precise reference of every common SSR problem, its root cause, and the exact Angular API that solves it.

| # | Problem | Root Cause | Angular Solution | API / Code |
|---|---------|-----------|-----------------|------------|
| 1 | **Hydration mismatch** `NG0500` | Server HTML differs from what client renders — dynamic content, random values, `Date.now()` | Make server + client render identically; use `ngSkipHydration` only as last resort | `ngSkipHydration` on component |
| 2 | **Effect / HTTP runs twice** | Runs on server, serialised to HTML, then runs again on client hydration | Use `TransferState` to cache server response; client reads from cache, skips fetch | `makeStateKey<T>()`, `transferState.set/get` |
| 3 | **`localStorage` / `sessionStorage` crash** | These APIs do not exist in Node.js | Guard with `PLATFORM_ID` + `isPlatformBrowser()` | `inject(PLATFORM_ID)`, `isPlatformBrowser()` |
| 4 | **`window` / `document` is undefined** | Browser globals absent on server | Same platform guard, or use Angular's `DOCUMENT` token | `inject(DOCUMENT)` from `@angular/common` |
| 5 | **SSR hangs / never responds** | Open `setTimeout`, pending HTTP, unresolved Observable keeps Zone.js unstable | Ensure all async completes; use `NgZone.runOutsideAngular()` for non-rendering timers | `NgZone.runOutsideAngular()` |
| 6 | **SSR hangs (Zoneless app)** | No Zone.js = no stability signal; Angular doesn't know when rendering is done | Wrap async work in `PendingTasks.run()` — only mechanism in zoneless | `inject(PendingTasks).run(promise)` |
| 7 | **Clicks lost before hydration** | User clicks a button before Angular has bootstrapped on client | Enable event replay — Angular buffers events via `jsaction`, replays after hydration | `provideClientHydration(withEventReplay())` |
| 8 | **Entire page re-renders on hydration** | Angular re-creates the DOM instead of reusing server HTML | Enable hydration (not on by default pre-v17) | `provideClientHydration()` |
| 9 | **Heavy components block TTFB** | Expensive components rendered eagerly on every SSR request | Defer non-critical sections; they render as content server-side but hydrate lazily | `@defer (hydrate on idle/viewport/interaction)` + `withIncrementalHydration()` |
| 10 | **Third-party lib crashes on server** | Library accesses `window`/`document` in constructor | Wrap with platform guard; load library only in browser; or `ngSkipHydration` on host component | `isPlatformBrowser()` + dynamic `import()` |
| 11 | **Memory leak across requests** | Service holds state between SSR requests (singleton at platform level) | Services provided at root are re-created per request — platform injector is shared, root injector is not | Understand injector hierarchy: Platform → Root (per-request) → Component |
| 12 | **`@defer` shows placeholder instead of content in SSR** | Misunderstanding of SSR behaviour | `@defer` renders **content** (not placeholder) during SSR by default — placeholder only shows client-side before trigger fires | No fix needed — this is correct behaviour |
| 13 | **Hydration errors on `innerHTML` content** | Angular tries to reconcile server DOM generated outside its control | Add `ngSkipHydration` to tell Angular not to attempt hydration on that subtree | `<app-foo ngSkipHydration />` |
| 14 | **Duplicate `APP_ID` collision** | Multiple Angular apps on same page share hydration markers | Set unique `APP_ID` per app | `{ provide: APP_ID, useValue: 'my-app' }` |
| 15 | **CLS from resource / HTTP re-fetch** | `resource()` / `HttpClient` starts in loading state on client even though data was SSR'd | Add HTTP transfer cache — server responses serialised into `ng-state`, client reads them instantly | `provideClientHydration(withHttpTransferCache())` |
| 16 | **Route SSR'd when it should be CSR** | User-specific page (cart, dashboard) SSR'd unnecessarily — wasted server work | Explicitly set `RenderMode.Client` for user-specific routes | `{ path: 'cart', renderMode: RenderMode.Client }` |
| 17 | **Static page SSR'd on every request** | Stable content re-rendered server-side per request — wasted CPU | Prerender at build time | `{ path: 'about', renderMode: RenderMode.Prerender }` |
| 18 | **`getPrerenderParams()` returns nothing** | Dynamic routes not enumerated at build time — generates no static files | Implement `getPrerenderParams()` to return all param combinations | `async getPrerenderParams() { return [{ slug: 'a' }, { slug: 'b' }] }` |


# Chapter 13: Server Runtime Comparison — Deep Architecture for Angular SSR

This chapter does what Chapter 13 does not: it explains **why** each runtime behaves the way it does, what that means for Angular SSR specifically, and how to reason about the trade-offs at architecture time — not deployment time.

---

## The Four Execution Models

Every server runtime Angular SSR can target is fundamentally defined by one thing: **what shares what between requests**.

```
                      Node.js Process       Lambda Instance     V8 Isolate (Edge)   CDN/Static
                      ─────────────────     ──────────────────  ─────────────────   ──────────
V8 Heap               Shared               Per instance        Per isolate         None
Module cache          Shared               Warm-invocation     Per isolate init    None
Event loop            Shared               Shared (per inv.)   Per isolate         None
OS process            1 persistent         Freeze/thaw         Co-located, sep.    None
libuv thread pool     Yes                  Yes                 No                  None
Request isolation     Injector scope only  Full (new context)  Full (new isolate)  N/A
```

This table predicts almost every production bug and performance characteristic you will encounter.

---

## 1. Long-Running Node.js Process — Execution Internals

### What "process" means here

A single Node.js process runs one V8 instance with one JavaScript heap. The event loop multiplexes all I/O across that heap. Multiple concurrent SSR requests are **concurrent events on the same heap** — not separate threads, not separate processes.

```
Process lifetime:
  t=0   Node.js boots — V8 initialises, module graph parsed, Angular engine created
  t=0+  Express starts listening on port 4000
  t=1   Request A arrives   -> root injector created, render starts
  t=1+  Request B arrives   -> root injector created, render starts (concurrently)
  t=2   Request A completes -> injector destroyed, GC eligible
  t=inf Process stays alive — V8 heap, module cache, platform injector all persist
```

**The critical boundary:**

```typescript
// Angular injector hierarchy in a long-running process:
//
// Platform injector   <- ONE for the entire process lifetime
//   Root injector     <- ONE per request (created by AngularNodeAppEngine.handle())
//     Component tree  <- ONE per component per request
//
// Platform injector is a singleton across ALL requests.
// Root injector is fresh per request — Angular isolation guarantee.

// DANGER: module-level variable leaks across requests
let activeUsers = 0;  // shared heap — wrong from the 2nd concurrent request

// SAFE: root-provided services are per-request in SSR
@Injectable({ providedIn: 'root' })
export class RequestScopedService {
  // fresh instance per request, guaranteed by Angular SSR
}
```

### Memory pressure model

```
Heap at rest:    ~80MB  (module cache + Angular engine + V8 baseline)
Per request:     ~8–25MB (component tree + render output + HTTP in-flight)
Peak concurrent: heap_rest + (active_requests x per_request_cost)

At 50 concurrent renders:  80MB + (50 x 20MB) = 1.08GB

Node.js default heap limit: 1.5GB (64-bit).
  Fix 1: --max-old-space-size=4096  (4GB heap)
  Fix 2: horizontal scaling         (multiple processes behind load balancer)
```

### What makes it fast for consistent traffic

Module parsing and Angular bootstrap happen once at startup. Every subsequent request gets a pre-warmed engine — no V8 cold start, no module re-parsing. For consistent, high-throughput traffic this is the most CPU-efficient model because the fixed bootstrap cost is amortised across thousands of requests.

---

## 2. Serverless Function — Execution Context Lifecycle

### The Lambda execution model

Lambda does not start a new process per request. It starts a new process per **cold start**, then **freezes** the process between requests and **thaws** it for warm invocations.

```
COLD START lifecycle:
  1. Provision: allocate a micro-VM                     ~50ms  (AWS managed)
  2. Runtime init: Node.js boots, V8 initialises        ~100ms
  3. Module init: top-level code executes
     -> import express, new AngularNodeAppEngine()      ~400ms–1.5s (scales with bundle)
  4. Handler ready

  WARM invocation (subsequent requests to same instance):
  1. Thaw existing process                              ~5ms
  2. Execute handler function
  3. Freeze on return

  The execution context (heap, module cache, global variables) PERSISTS
  across warm invocations of the same instance.
```

**Warm lambdas share state across sequential invocations:**

```typescript
// This looks serverless-clean but has a subtle problem:
let cachedConfig: AppConfig | null = null;

export const handler = async (event: any) => {
  if (!cachedConfig) {
    cachedConfig = await fetchConfig();  // fetched once on cold start
  }
  // cachedConfig persists across ALL warm invocations of this instance.
  // Config changes in the DB are invisible until the next cold start.
};
```

### Cold start anatomy for Angular SSR

```
V8 init:                         ~80–120ms
Node.js built-in module load:    ~30–60ms
Angular imports + DI metadata:   ~80–200ms   (scales with app size)
AngularNodeAppEngine init:       ~50–150ms   (router compilation, lazy chunk scan)
Express app setup:               ~5–20ms

Total cold start:
  Small app (<500KB bundle):     400–600ms
  Medium app (1–2MB bundle):     800ms–1.5s
  Large app (3MB+ bundle):       1.5s–3s+
```

**The bundle-as-infrastructure insight:**

Your bundle size is not just a client performance concern — it is a direct input to server cold start cost.

```bash
npx source-map-explorer dist/my-app/server/server.mjs
```

---

## 3. Edge Runtime (V8 Isolates) — What Makes It Different

### V8 Isolates are not processes, threads, or containers

```
Traditional process:
  OS process -> one V8 instance -> one heap -> full libuv -> full Node.js API

V8 Isolate (Cloudflare Workers):
  Single OS worker process
    -> Many isolated V8 heap contexts running simultaneously
    -> No shared memory between isolates
    -> No libuv -> no Node.js APIs (no fs, no crypto, no net.Socket)
    -> Memory limit: ~128MB per isolate
    -> CPU time limit: 50ms per request

One V8 process runs thousands of isolates because they share the underlying
compiled code cache but have separate heap contexts. Isolates initialise in
~5ms — this is why cold starts are near-zero at the edge.
```

### What this means for Angular SSR

```typescript
// Use AngularAppEngine (NOT AngularNodeAppEngine) for edge:
import { AngularAppEngine, createRequestHandler } from '@angular/ssr';
// NOT '@angular/ssr/node' — that imports Node.js-specific code

const angularApp = new AngularAppEngine();

export default {
  fetch(request: Request): Promise<Response> {
    return createRequestHandler(angularApp)(request);
  }
};
```

### The API compatibility failure modes

```typescript
// BREAKS on edge: Node.js crypto
import { createHash } from 'crypto';  // ReferenceError: createHash is not defined

// WORKS everywhere: Web Crypto API
const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));

// BREAKS on edge: Node.js Buffer
const b64 = Buffer.from(token).toString('base64');  // ReferenceError: Buffer

// WORKS everywhere
const b64 = btoa(token);

// BREAKS on edge: process.env
const apiKey = process.env['API_KEY'];  // ReferenceError: process

// WORKS on Cloudflare Workers: env bindings
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const apiKey = env.API_KEY;  // injected via wrangler.toml bindings
    return createRequestHandler(angularApp)(request);
  }
};
```

### Platform providers for runtime-specific dependencies

```typescript
export const CRYPTO_SERVICE = new InjectionToken<CryptoService>('CryptoService');

// app.config.server.ts — Node.js / Lambda
export const serverConfig: ApplicationConfig = {
  providers: [{ provide: CRYPTO_SERVICE, useClass: NodeCryptoService }]
};

// app.config.edge.ts — Cloudflare Workers
export const edgeConfig: ApplicationConfig = {
  providers: [{ provide: CRYPTO_SERVICE, useClass: WebCryptoCryptoService }]
};

// Components inject CRYPTO_SERVICE — no platform knowledge required
```

---

## 4. Angular API Compatibility Matrix by Runtime

| API / Capability | Node.js Express | Lambda | Edge (Cloudflare/Vercel) | Notes |
|---|---|---|---|---|
| `AngularNodeAppEngine` | Yes | Yes | No | Node.js-specific streams |
| `AngularAppEngine` + `createRequestHandler` | Yes | Yes | Yes | WinterCG Fetch API |
| `REQUEST` injection token | Yes | Yes | Yes | Forwards native request |
| `isPlatformServer()` | Yes | Yes | Yes | Detects SSR context |
| `TransferState` / `withHttpTransferCache` | Yes | Yes | Yes | Pure JS |
| `withEventReplay()` | Yes | Yes | Yes | Pure JS |
| `withIncrementalHydration()` | Yes | Yes | Yes | Pure JS |
| `HttpClient` (making fetch calls) | Yes | Yes | Yes | Uses Fetch API on all |
| `resource()` signal primitive | Yes | Yes | Yes | Pure JS, integrates with PendingTasks |
| File system access (`fs`) | Yes | Yes | No | No `fs` on edge |
| Node.js `crypto` module | Yes | Yes | No | Use Web Crypto instead |
| `process.env` | Yes | Yes | No | Use platform `env` binding |
| Native Node.js modules | Yes | Yes | No | V8 isolates only |
| Persistent in-memory cache | Yes | Warm only | No | Isolate resets |
| Database connections (pg, mysql2) | Yes | Warm-cached | No | TCP sockets unavailable |
| Cookie forwarding via `REQUEST` | Yes | Yes | Yes | See Case Study #6 |
| `Cache-Control` response headers | Yes | Yes | Yes | CDN respects these |

---

## 5. Network Topology and TTFB Components

TTFB is not a single number — it is a sum of latencies, each owned by a different infrastructure layer.

### Long-running Node.js (origin)

```
User               CDN                  Node.js Origin
  |                 |                        |
  |-- GET /product ->|                        |
  |                 |-- cache MISS ---------->|
  |                 |                    angularApp.handle()
  |                 |                        |<-- fetch product API ~50ms
  |                 |                    render HTML ~8ms
  |                 |<-- HTML ---------------
  |<-- HTML --------|

  TTFB = CDN->Origin RTT(~40ms) + API call(~50ms) + render(~8ms) = ~100ms typical
       = ~350ms+ if origin is geographically distant from user
```

### Edge runtime

```
User               Edge PoP (~10ms away)   Origin DB
  |                 |                           |
  |-- GET /product ->|                           |
  |                 |-- fetch product API ------>|
  |                 |<-- product data -----------|
  |                 render HTML ~8ms
  |<-- HTML --------|

  TTFB = User->Edge(~10ms) + API call(~40ms) + render(~8ms) = ~60ms typical

  BUT if the API is at origin (not edge-colocated):
  TTFB = User->Edge(10ms) + Edge->OriginAPI(100ms) + render(8ms) = ~120ms
  This can be WORSE than origin-served if your data is not near the edge.
```

**The edge data locality trap:**

```
If Edge->OriginAPI is 100ms (London edge -> US-East database):
  TTFB(edge)   = 10ms + 100ms + 5ms = ~215ms
  TTFB(origin) = 80ms + 5ms        =  ~85ms

Edge made it worse. Fix: use edge-colocated data (Cloudflare D1, KV, Vercel KV),
or accept that edge only wins when the SSR is compute-bound, not data-bound.
```

---

## 6. State and Memory Implications Per Runtime

```
What is isolated per request:

Node.js (Express)    Angular root injector + component tree
                     Module-level variables    -> SHARED (all concurrent requests)
                     Platform injector         -> SHARED (process lifetime)

Lambda (warm)        Angular root injector + component tree
                     Module-level variables    -> SHARED (sequential warm invocations)
                     Platform injector         -> SHARED (warm invocations)

Lambda (cold)        Everything is fresh — true isolation at the cost of cold start

Edge (V8 isolate)    Angular root injector + component tree
                     Module-level variables    -> SHARED (within one isolate instance)
                     Platform injector         -> SHARED (within one isolate instance)

Static               No server state — inherently safe
```

### The singleton trap at each layer

```typescript
// LAYER 1: Module-level — process-wide on Node.js/Lambda, isolate-wide on Edge
const configCache = new Map<string, Config>();  // safe if read-only, dangerous if mutable

// LAYER 2: Angular platform injector — lives for the process/isolate lifetime
@Injectable({ providedIn: 'platform' })
export class PlatformWideService { }  // almost always wrong for SSR

// LAYER 3: Angular root injector — fresh per request on ALL runtimes
@Injectable({ providedIn: 'root' })
export class SafeRequestService { }   // correct zone for SSR services

// LAYER 4: Component injector — tied to component tree, always safe
@Component({ providers: [ComponentLocalService] })
```

---

## 7. Signals in SSR — Per-Request Reactivity Across Runtimes

Signals are the most important architecture change in Angular for SSR. They replace both Zone.js change detection and manual `PendingTasks` registration for async data — and they work identically across all four runtimes because they are pure JavaScript with no platform dependencies.

### Why signals are the right primitive for SSR

```typescript
// Old pattern: Zone.js tracks async operations for SSR stability
// Angular waits for Zone to drain before serialising HTML
// Problem: any untracked async (setTimeout, third-party SDK) delays or hangs serialisation

// New pattern: explicit async tracking via resource() and PendingTasks
// Angular SSR waits only for what you declare
```

### `resource()` — the signal primitive that owns SSR data fetching

`resource()` is a signal-based async primitive that auto-registers with Angular SSR stability. When you use `resource()` inside a component, Angular SSR knows the render is not complete until the resource resolves — no manual `PendingTasks` required.

```typescript
import { Component, inject } from '@angular/core';
import { resource } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ProductService } from '../services/product.service';

@Component({
  selector: 'app-product-detail',
  template: `
    @if (product.isLoading()) {
      <div class="skeleton"></div>
    } @else if (product.error()) {
      <div class="error">{{ product.error() }}</div>
    } @else {
      <h1>{{ product.value()?.name }}</h1>
      <p>{{ product.value()?.price | currency }}</p>
    }
  `
})
export class ProductDetailComponent {
  private productService = inject(ProductService);
  private route = inject(ActivatedRoute);

  product = resource({
    request: () => this.route.snapshot.paramMap.get('slug'),
    loader: ({ request: slug }) => this.productService.getBySlug(slug!)
  });

  // What Angular SSR does with this:
  // 1. Renders the component tree
  // 2. Detects resource() registration -> adds to PendingTasks internally
  // 3. Waits for loader() to resolve
  // 4. Re-renders with resolved value
  // 5. Marks PendingTask complete
  // 6. Serialises HTML + TransferState
  // 7. Sends response
}
```

### How signals integrate with TransferState across runtimes

`resource()` resolves on the server, its value is serialised into TransferState, and on the client the signal initialises directly from TransferState — no second HTTP call, no loading state flash.

```typescript
// This happens automatically with resource() + withHttpTransferCache()
// You do not need to wire TransferState manually.

// The signal lifecycle across the SSR boundary:

// SERVER (any runtime — Node.js, Lambda, Edge):
// resource.status() = ResourceStatus.Loading
// loader() executes -> fetches data
// resource.status() = ResourceStatus.Resolved
// resource.value() = { id: 1, name: 'iPhone 16 Pro', price: 999 }
// Angular serialises: <script id="ng-state">{"product-iphone-16-pro": {...}}</script>
// HTML sent to client

// CLIENT (browser):
// resource.status() = ResourceStatus.Resolved  (immediately, from TransferState)
// resource.value() = { id: 1, name: 'iPhone 16 Pro', price: 999 }  (no fetch)
// Component renders without loading state
// loader() does NOT execute — TransferState hit prevents it
```

### Computed signals — lazy on client, eager on server

This is a subtle but important difference. Computed signals are lazy in the browser — they only evaluate when read. During SSR, Angular renders the full component tree, which means every template expression is read during render. Computed signals that are expensive but rarely accessed in the browser will run on every SSR request.

```typescript
@Component({
  template: `
    <div class="related">{{ relatedProducts() | slice:0:3 }}</div>
  `
})
export class ProductDetailComponent {
  allProducts = input<Product[]>();

  // This computed runs ONCE per render in SSR (template reads it during render)
  // In the browser it runs only when the template re-evaluates
  relatedProducts = computed(() =>
    this.allProducts()
      .filter(p => p.category === this.product()?.category)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 10)
  );
}

// On edge with a 50ms CPU limit, an expensive computed over 500 products
// can burn significant budget on every SSR request.
// Fix: move the computation to the server API, or use @defer to push the
// component out of the SSR render path entirely.
```

### Signals and the Zone.js exit path

Signals do not need Zone.js for change detection. This has a direct impact on SSR stability across runtimes.

```typescript
// Old Zone.js SSR stability model:
// Angular waits for Zone to drain (all microtasks/macrotasks complete)
// Problem: any stray setTimeout or unpatched Promise in a third-party library
//          can delay or permanently hang SSR response

// Signal-based SSR stability model:
// Angular waits for PendingTasks to complete
// resource() auto-registers — nothing else does unless you explicitly register

// This means: on Edge runtimes with strict CPU limits,
// signal-based components are safer because they have no hidden async dependencies.
// Zone.js-based components can trigger unexpected microtask queues that eat into
// the 50ms CPU budget.

// To opt out of Zone.js entirely (signals-only app):
bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // or for Zoneless (Angular 18+):
    provideExperimentalZonelessChangeDetection(),
  ]
});

// Zoneless + signals on Edge = predictable CPU budget per request
// because there are no hidden async operations
```

### Signals as the cross-runtime portable state layer

Because signals are pure JavaScript, the same reactive state works on all four runtimes without adaptation.

```typescript
// A signal store that works identically on Node.js, Lambda, Edge, and in the browser:
@Injectable({ providedIn: 'root' })
export class ProductStore {
  // These signals are created fresh per request on the server (root injector scope)
  // and persist across navigation on the client (browser singleton)
  private _products = signal<Product[]>([]);
  private _loading = signal(false);
  private _error = signal<string | null>(null);

  products = this._products.asReadonly();
  loading = this._loading.asReadonly();

  featured = computed(() =>
    this._products().filter(p => p.featured).slice(0, 6)
  );

  loadProducts = resource({
    loader: () => inject(ProductService).getAll()
  });
}

// On the server: a new ProductStore is injected per request (root injector).
// The resource() fetches, resolves, and the signal tree is serialised.
// On the client: the same store is a singleton. resource() reads from TransferState.
// The signal values are the same — no flash, no double-fetch.
```

---

## 8. Concurrency and Scaling Models

### Node.js: horizontal scaling via process replication

```
Load Balancer
    +-- Node.js instance 1  handles req A, C, E concurrently (event loop)
    +-- Node.js instance 2  handles req B, D, F concurrently
    +-- Node.js instance 3  handles req G, H concurrently

In Kubernetes/ECS:
  New pod has ~3s of Angular engine init before serving traffic.
  Use readiness probes to prevent traffic hitting un-warmed pods.
```

### Lambda: automatic scaling at a per-invocation cost

```
Traffic burst:
  0->100 concurrent requests -> Lambda creates up to 100 instances in parallel.
  First request to each new instance = cold start.
  100 simultaneous cold starts = 100 users hit 800ms–1.5s TTFB simultaneously.

Mitigation ladder:
  1. Keep bundles small (reduce cold start duration)
  2. Provisioned concurrency (pre-warm N instances)
  3. Reserved concurrency (throttle to prevent runaway scaling)
```

### Edge: isolate pool with near-zero cold starts

```
~300 PoP locations globally. Isolate creation: ~5ms.
Real constraint: 50ms CPU time per request — not concurrency.
Stateless by design -> forces architecturally correct patterns (singleton leaks impossible).
Signals + zoneless = predictable CPU consumption per request.
```

---

## 9. Hybrid Topology Patterns

### Pattern 1: Edge SSR + Origin API (global, latency-first)

```
Cloudflare Workers (Angular SSR — all routes)
         |
         | fetch() calls
         |
Node.js API Server (EC2/ECS — business logic, DB, auth)

Benefits: HTML served globally fast. API server retains full Node.js APIs.
Drawback: Edge->API round trip adds ~40–100ms for non-cached routes.
```

### Pattern 2: CDN + Serverless SSR + Origin API (cost-optimised)

```
CDN (CloudFront / Cloudflare)
    +-- Cache HIT  -> serve HTML directly (~5ms)
    +-- Cache MISS -> Lambda -> fetch API -> HTML + Cache-Control -> CDN caches

Cache strategy:
  Product pages:  Cache-Control: s-maxage=60, stale-while-revalidate=300
  Category pages: Cache-Control: s-maxage=300, stale-while-revalidate=3600
  Home page:      Cache-Control: s-maxage=30, stale-while-revalidate=120
  User pages:     Cache-Control: private, no-store  (NEVER CDN-cached)
```

### Pattern 3: Mixed render modes within one Angular app

```typescript
export const routes: Routes = [
  {
    path: '',
    component: HomeComponent,
    data: { renderMode: RenderMode.Prerender }
    // Static HTML at build time -> CDN only, no server involved
  },
  {
    path: 'products/:slug',
    component: ProductDetailComponent,
    data: { renderMode: RenderMode.Server }
    // SSR on demand -> Lambda or Edge handles only these requests
  },
  {
    path: 'search',
    component: SearchComponent,
    data: { renderMode: RenderMode.Client }
    // Pure CSR -> served as index.html shell from CDN, no SSR cost
  },
  {
    path: 'dashboard',
    component: DashboardComponent,
    data: { renderMode: RenderMode.Client }
    // Auth-required -> RenderMode.Client, never SSR
  },
];
```

---

## 10. Runtime Selection Decision Framework

For each SSR route, work through this in order:

```
1. Does the route serve personalised content (auth-gated, user-specific)?
   Yes -> Cache-Control: private, no-store
          Use Node.js or Lambda
          Consider RenderMode.Client if the page is 100% user-specific
   No  -> continue

2. What is the traffic pattern?
   Consistent / high throughput  -> Long-running Node.js (amortises bootstrap cost)
   Spiky / event-driven          -> Lambda (scales to zero, pay per use)
   Globally distributed audience -> Edge (latency-first)

3. Does the route depend on Node.js-only APIs?
   Yes (native crypto, fs, pg, redis) -> Node.js or Lambda — never edge
   No  (pure JS, fetch, Web Crypto)   -> Edge is viable

4. What is the data access pattern?
   Colocated KV / D1 at edge   -> Edge is optimal
   Centralised relational DB    -> Node.js or Lambda
   API call to origin server    -> Edge adds RTT — measure before committing

5. What are cold start constraints?
   First-user TTFB must be <200ms  -> Long-running Node.js (no cold start after boot)
                                      OR Edge (near-zero cold start)
                                      NOT Lambda without provisioned concurrency
   Occasional cold start tolerable -> Lambda is fine

6. Is the component tree using signals + zoneless?
   Yes -> Edge runtime is safer (predictable CPU budget, no hidden Zone.js async)
   No  -> Zone.js may trigger unexpected microtask queues — test CPU budget carefully

7. What is the operational complexity budget?
   Simple ops, single provider  -> Lambda / serverless
   Full control required        -> Long-running Node.js in containers
   Maximum performance ceiling  -> Edge + origin hybrid
```

---

## Summary Table

| Dimension | Node.js (Express) | Lambda | Edge (V8 Isolate) | Static CDN |
|---|---|---|---|---|
| Cold start | Once (process boot) | Per-instance (400ms–3s) | Near-zero (~5ms) | None |
| Memory isolation | Injector boundary only | Injector + warm context | Injector + isolate | N/A |
| Concurrent requests | Event loop, shared heap | One per warm instance | Pool of isolates | N/A |
| Node.js APIs | Full | Full | None | N/A |
| Angular API support | Full | Full | WinterCG subset | N/A |
| Signals / resource() | Yes | Yes | Yes | N/A |
| Zoneless compatibility | Yes | Yes | Yes (preferred) | N/A |
| TTFB warm, nearby user | ~50–100ms | ~50–100ms | ~20–60ms | ~5–15ms |
| TTFB cold, first user | Fast (pre-warmed) | +400ms–3s | Fast | Fast |
| Data locality | Centralised DB fine | Centralised DB fine | Edge DB preferred | N/A |
| Cost model | Constant | Per invocation | Per request-ms | Bandwidth only |
| Scaling | Manual/HPA | Automatic | Automatic | Infinite |
| Observability | Full APM | Logs + X-Ray | Limited | CDN logs |
| Deployment | Rolling/canary | Version aliases | Atomic global | Atomic |
# Chapter 14: SEO Mechanics — What Angular SSR Actually Does for Crawlers

## The Core Problem SSR Solves for SEO

When a crawler fetches a CSR Angular app, it receives:

```html
<!doctype html>
<html>
  <head>
    <title>My App</title>   <!-- same title on every page -->
  </head>
  <body>
    <app-root></app-root>   <!-- empty shell -->
    <script src="main.js"></script>
  </body>
</html>
```

Googlebot can execute JavaScript (since 2019) but with limitations: pages enter a separate JS rendering queue that can be days behind the standard crawl queue. Social media bots (Slack, Twitter/X, WhatsApp) do not execute JavaScript at all — they see only the empty shell.

With SSR, crawlers receive fully populated HTML on the first HTTP response — no JavaScript execution needed.

---

## The Title Service

`Title` writes to `<title>`. In SSR, it writes the tag into server-rendered HTML. Every page gets a unique, meaningful title.

```typescript
import { Component, inject, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';

@Component({ ... })
export class ProductDetailComponent implements OnInit {
  private title = inject(Title);

  ngOnInit() {
    // SSR: writes <title> into server HTML
    // Browser navigation: updates document.title
    this.title.setTitle(`${this.product().name} | ShopPulse`);
  }
}
```

---

## The Meta Service

`Meta` writes `<meta>` tags controlling search snippets, Open Graph previews, and social unfurls.

```typescript
import { Meta, Title } from '@angular/platform-browser';

@Component({ ... })
export class ProductDetailComponent implements OnInit {
  private meta  = inject(Meta);
  private title = inject(Title);

  ngOnInit() {
    const p = this.product();
    this.title.setTitle(`${p.name} | ShopPulse`);

    // Standard SEO
    this.meta.updateTag({ name: 'description', content: p.shortDescription });

    // Open Graph — Facebook, LinkedIn, Slack, WhatsApp
    this.meta.updateTag({ property: 'og:title',       content: p.name });
    this.meta.updateTag({ property: 'og:description', content: p.shortDescription });
    this.meta.updateTag({ property: 'og:image',       content: p.image });
    this.meta.updateTag({ property: 'og:url',         content: `https://shoppulse.dev/products/${p.slug}` });
    this.meta.updateTag({ property: 'og:type',        content: 'product' });

    // Twitter / X cards
    this.meta.updateTag({ name: 'twitter:card',  content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: p.name });
    this.meta.updateTag({ name: 'twitter:image', content: p.image });
  }
}
```

### addTag vs updateTag

```typescript
// addTag — always adds a new tag, creates duplicates on navigation
this.meta.addTag({ name: 'description', content: '...' });

// updateTag — updates if exists, adds if not. Always use this.
this.meta.updateTag({ name: 'description', content: '...' });
```

---

## Structured Data (JSON-LD)

Structured data enables Google rich results — star ratings, prices, breadcrumbs directly in search results.

```typescript
import { DOCUMENT } from '@angular/common';

@Component({ ... })
export class ProductDetailComponent implements OnInit {
  private doc = inject(DOCUMENT);

  ngOnInit() {
    const p = this.product();
    const script = this.doc.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      image: p.image,
      description: p.shortDescription,
      brand: { '@type': 'Brand', name: p.brand },
      offers: {
        '@type': 'Offer',
        price: p.price,
        priceCurrency: 'USD',
        availability: p.inStock
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: p.rating,
        reviewCount: p.reviewCount,
      }
    });
    this.doc.head.appendChild(script);
  }
}
```

SSR renders this block into the server HTML. Google parses it without JavaScript and may show rich results.

---

## What SSR Does NOT Fix for SEO

| SEO concern | Does SSR fix it? | What actually fixes it |
|---|---|---|
| Content invisible to crawler | Yes | Core SSR benefit |
| Slow TTFB | Depends | CDN caching, edge deployment |
| Missing title / meta per page | Yes | Title + Meta services |
| Duplicate content | No | `<link rel="canonical">` |
| Crawl budget waste | No | `robots.txt`, proper sitemap |
| Core Web Vitals ranking signal | Partial | Fix hydration mismatches for CLS |
| Pagination / infinite scroll | No | Explicit page URLs or `rel="next"` |
| Private pages indexed | No | `noindex` meta tag |

---

## SEO Per Route Type

| Route | SSR SEO benefit | Notes |
|---|---|---|
| Home | High | Crawler sees featured content and links |
| Product detail | High | Price, description, structured data all visible |
| Category / listing | High | Crawler can follow product links |
| Blog / docs | High | Text-heavy — exactly what crawlers want |
| Cart / checkout | None | User-specific — use `RenderMode.Client` |
| Dashboard / account | None | Add `noindex` — crawlers cannot log in |
| Search results | Medium | Crawlable if query is in URL (`?q=iphone`) |

```typescript
// noindex for private routes
ngOnInit() {
  if (this.isAuthRequired) {
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
  }
}
```

---

## Centralised SEO Service Pattern

In production, centralise head management to prevent duplicate tags and ensure consistency:

```typescript
@Injectable({ providedIn: 'root' })
export class SeoService {
  private title = inject(Title);
  private meta  = inject(Meta);

  setPage(config: {
    title: string;
    description: string;
    image?: string;
    url?: string;
    noIndex?: boolean;
  }) {
    this.title.setTitle(`${config.title} | ShopPulse`);
    this.meta.updateTag({ name: 'description', content: config.description });
    this.meta.updateTag({ name: 'robots', content: config.noIndex ? 'noindex' : 'index, follow' });
    this.meta.updateTag({ property: 'og:title',       content: config.title });
    this.meta.updateTag({ property: 'og:description', content: config.description });
    if (config.image) {
      this.meta.updateTag({ property: 'og:image',      content: config.image });
      this.meta.updateTag({ name: 'twitter:image',     content: config.image });
    }
    if (config.url) {
      this.meta.updateTag({ property: 'og:url',        content: config.url });
      this.meta.updateTag({ rel: 'canonical',           href: config.url });
    }
  }
}

// Any component
export class ProductDetailComponent implements OnInit {
  private seo = inject(SeoService);

  ngOnInit() {
    const p = this.product();
    this.seo.setPage({
      title: p.name,
      description: p.shortDescription,
      image: p.image,
      url: `https://shoppulse.dev/products/${p.slug}`,
    });
  }
}
```

This pattern works identically during SSR (writes to server HTML before sending) and CSR navigation (updates the live document in the browser).


---

