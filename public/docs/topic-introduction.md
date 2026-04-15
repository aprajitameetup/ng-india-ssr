# Angular SSR & Web Vitals — Topic Introduction
### For someone who knows Angular and frontend development but not specifically Angular SSR or Web Vitals

---

# Lesson 1: How a Browser Renders a Page (The Baseline)

Before SSR makes sense, you need to understand what the browser does without it.

## What happens when you visit a website (CSR — Client Side Rendering)

```
You type: https://myapp.com/dashboard
         │
         ▼
Browser asks server: "Give me this page"
         │
         ▼
Server responds instantly with:
┌─────────────────────────────────┐
│ <!DOCTYPE html>                 │
│ <html>                          │
│   <head>                        │
│     <title>My App</title>       │
│   </head>                       │
│   <body>                        │
│     <app-root></app-root>  ◄── EMPTY. Nothing here yet.
│     <script src="main.js"></script>
│   </body>                       │
│ </html>                         │
└─────────────────────────────────┘
         │
         ▼
Browser downloads main.js  (could be 500KB, 1MB, 2MB)
         │
         ▼
Browser parses and executes JavaScript
         │
         ▼
Angular bootstraps, creates components, fetches data
         │
         ▼
DOM is populated — user finally sees something
```

**The user sees a blank white screen until step 6.** That is the CSR problem.

---

# Lesson 2: Core Web Vitals — What They Actually Measure

Google uses these metrics to rank your site and measure user experience. You need to understand each one precisely because your talk is about how SSR affects them.

## TTFB — Time To First Byte
**What it measures:** How long from the user's request until the first byte of the server response arrives.

```
User clicks link ──────────────────────► First byte received
                 ◄─── TTFB ────────────►
```

**Good:** under 800ms. **Needs improvement:** 800ms–1800ms. **Poor:** over 1800ms.

This is 100% about your server/network. CDN, server processing time, database queries — all of it shows up here.

## FCP — First Contentful Paint
**What it measures:** When the browser first renders *any* content (text, image, canvas). Not blank anymore.

```
Page starts loading ─────────────────► User sees first pixel of content
                    ◄──── FCP ────────►
```

**Good:** under 1.8s.

## LCP — Largest Contentful Paint
**What it measures:** When the largest visible element finishes rendering. Usually a hero image, a headline, or a product description. This is the one Google cares about most.

```
Page starts loading ──────────────────────────► Biggest content element renders
                    ◄──────── LCP ─────────────►
```

**Good:** under 2.5s. **Poor:** over 4s.

LCP is what SSR is primarily sold as improving. But as we'll see, it's conditional.

## CLS — Cumulative Layout Shift
**What it measures:** How much content *jumps around* while loading. You've seen this — you go to click a button and an ad loads above it and your click hits the wrong thing.

```
0.0 = nothing moved. Perfect.
0.1 = good
0.25 = needs improvement
> 0.25 = poor
```

This is a score, not time. It accumulates every time something shifts unexpectedly.

**This is where SSR can make things WORSE** — hydration mismatches cause layout shift.

## INP — Interaction to Next Paint
**What it measures:** How quickly the page responds when a user interacts (clicks, types, taps). Replaced FID in 2024.

```
User clicks button ────────────────────► Browser paints the response
                   ◄──── INP ──────────►
```

**Good:** under 200ms.

---

# Lesson 3: What Angular SSR Actually Is

If you remember only one thing: **SSR is not one render. It is two executions.**

Execution one happens on the server. Angular runs in a server environment (Node.js) and produces HTML.

Execution two happens in the browser. Angular bootstraps again on the client and hydrates the existing DOM so the page becomes interactive.

```
User request → Server executes Angular app → HTML returned → Browser loads JS → Angular bootstraps again → Hydration attaches app to DOM
```

That means your application now lives in:
- two runtimes
- two platform contexts
- two phases of execution

And any code you write has to survive both.

That sounds manageable in theory. But in practice, this changes everything: what code is safe, what side effects are dangerous, how async work behaves, why timing bugs appear, why debugging gets harder.

This is the hidden cost of SSR. It is not just rendering on the server. It is changing the execution model of the application.

---

# Lesson 4: The Request Lifecycle

Let's walk the full lifecycle of an SSR request.

A request comes in. The server runs your Angular application for that route. During that render, Angular may fetch data, resolve route state, create component trees, and produce HTML. But the server does not send the final output at just any moment. Angular waits for the application to reach a **stable state** before serialization.

Once Angular considers the app stable enough, the HTML is serialized and sent to the browser.

Then the browser loads the JavaScript bundle. Angular boots again on the client. Hydration tries to connect the already-existing DOM with the client application state and behavior.

```
Request arrives
→ Server runs Angular
→ Data fetches happen
→ App becomes stable
→ HTML serialized
→ Browser downloads JS
→ Hydration starts
→ App becomes interactive
```

From the user's perspective: the page appeared fast, then became interactive. But from the system's perspective, a lot happened — render on server, wait for stability, serialize, transfer state, bootstrap client, hydrate, continue execution. That is already a big architectural commitment.

---

# Lesson 5: Two Runtimes — Server is Not Browser

The first major source of SSR bugs is simple: **the server is not the browser.**

A lot of frontend code quietly assumes a browser environment:
- `window`
- `document`
- `localStorage`
- element measurements
- viewport logic
- direct DOM manipulation
- browser-only third-party libraries

Once you introduce SSR, those assumptions become liabilities.

## A simple bad example

```typescript
@Component({
  selector: 'app-theme-toggle',
  template: `<button (click)="toggle()">Toggle Theme</button>`
})
export class ThemeToggleComponent {
  darkMode = localStorage.getItem('theme') === 'dark';

  toggle() {
    this.darkMode = !this.darkMode;
    localStorage.setItem('theme', this.darkMode ? 'dark' : 'light');
    document.body.classList.toggle('dark', this.darkMode);
  }
}
```

This works fine in a browser-only app. In SSR, this is risky immediately:
- `localStorage` is browser-only
- `document` is browser-only

## A safer pattern

```typescript
import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT } from '@angular/common';

@Component({
  selector: 'app-theme-toggle',
  template: `<button (click)="toggle()">Toggle Theme</button>`
})
export class ThemeToggleComponent {
  darkMode = false;
  private isBrowser: boolean;

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    @Inject(DOCUMENT) private document: Document
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      this.darkMode = localStorage.getItem('theme') === 'dark';
    }
  }

  toggle() {
    this.darkMode = !this.darkMode;
    if (this.isBrowser) {
      localStorage.setItem('theme', this.darkMode ? 'dark' : 'light');
      this.document.body.classList.toggle('dark', this.darkMode);
    }
  }
}
```

The point here is not that platform checks are difficult. The point is that once SSR is enabled, every hidden browser assumption becomes part of your design risk. That is one of the first tradeoffs.

---

# Lesson 6: Stability and Pending Tasks

## Why SSR Waits

Angular does not just render and stop instantly. It tracks whether the application has pending work.

That matters for SSR, because Angular wants to serialize HTML at the right moment. It also matters for hydration, because Angular uses stability signals during the hydration lifecycle.

Here is the intuitive version:
- If HTTP is still in flight
- If timers are pending
- If subscriptions never complete
- If unresolved async work keeps the app busy

...then SSR may hang, delay, or behave unexpectedly.

That means SSR adds a new category of bug: not "my code crashed" but "my code never let rendering finish correctly."

## The bad pattern

```typescript
@Injectable({ providedIn: 'root' })
export class LivePriceService {
  startPolling() {
    setInterval(() => {
      console.log('polling prices...');
    }, 1000);
  }
}
```

In a browser-only dashboard, long-lived intervals may be fine. In SSR, starting a long-lived interval during render is a bad idea. You are telling the system: "I have work forever." That is exactly the kind of thing that can interfere with stability.

## The fix

```typescript
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class LivePriceService {
  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  startPolling() {
    if (isPlatformBrowser(this.platformId)) {
      setInterval(() => {
        console.log('polling prices...');
      }, 1000);
    }
  }
}
```

Now the polling only starts in the browser, where it actually makes sense.

## Explicit pending task control

If you have custom async work that Angular does not naturally track, you can wrap it deliberately so stability reflects that work:

```typescript
import { Injectable, inject } from '@angular/core';
import { PendingTasks } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ProfilePrefetchService {
  private pendingTasks = inject(PendingTasks);

  async loadImportantData() {
    await this.pendingTasks.run(async () => {
      const response = await fetch('https://api.example.com/profile');
      const data = await response.json();
      console.log('profile data', data);
    });
  }
}
```

So the lesson is: in SSR, async work is not just async work. It influences render timing.

---

# Lesson 7: Hydration — What Really Happens

## The browser takeover

After SSR, hydration begins.

Hydration means Angular reuses the server-rendered DOM instead of destroying it and recreating it. That gives a faster and less jarring startup experience when everything matches.

```
Server HTML → client app bootstraps → Angular matches DOM → interactivity attaches
```

But hydration is also where reality hits.

Because now Angular asks: **Does the DOM I received from the server match what the client expects?**

If yes, hydration succeeds. If not, you start seeing problems:
- mismatch warnings
- flicker
- unexpected re-rendering
- losing the benefits of SSR

Hydration is powerful, but it is unforgiving of nondeterminism.

## The hydration trap

```typescript
@Component({
  selector: 'app-random-banner',
  template: `<p>Your lucky number is {{ lucky() }}</p>`
})
export class RandomBannerComponent {
  lucky() {
    return Math.floor(Math.random() * 100);
  }
}
```

The server may render "lucky number 17". The client may evaluate "lucky number 62". Now the DOM does not match.

Same problem with:
- `Date.now()`
- random IDs
- user-agent-based branches
- browser-only values during render

So a key rule of SSR is: **Initial render output must be deterministic across server and client.**

---

# Lesson 8: Duplicate Side Effects and Race Conditions

## Why SSR apps do weird things twice

One of the most surprising SSR bugs is duplicate side effects. Because if your app logic runs during SSR and then runs again during client boot, side effects may happen twice.

Typical examples:
- analytics events
- API calls
- initialization logic
- subscriptions
- state mutation

## The concrete example

```typescript
@Component({
  selector: 'app-dashboard',
  template: `<pre>{{ data | json }}</pre>`
})
export class DashboardComponent implements OnInit {
  data: unknown;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.http.get('/api/dashboard').subscribe(res => {
      this.data = res;
      console.log('dashboard loaded');
    });
  }
}
```

If this runs on the server and then again on the client, you may see:
- duplicated work
- duplicated logs
- duplicated network behavior
- and if data changes between server render and client boot, hydration mismatches or UI flicker

So the general issue is not that Angular is broken. The issue is that your mental model must account for repeated execution.

## Race conditions

This also creates race conditions. The server rendered one state. By the time the client hydrates, the backend may already have newer data. Now the app has to reconcile:
- old HTML
- new client state
- user-visible continuity

That is why SSR bugs often feel like timing bugs rather than normal component bugs.

---

# Lesson 9: Signals + SSR

## Reactive elegance, but still two runtimes

Signals improve local reactivity and make data flow easier to reason about in Angular. But Signals do not remove the SSR mental model.

A signal may be elegant. A computed may be memoized. But the app still runs on the server and again in the browser.

So the questions remain:
- What values are computed on the server?
- What recomputes on the client?
- Are those values deterministic?
- Do any effects cause side effects twice?

## The safe pattern — pure computation

```typescript
import { Component, computed, signal } from '@angular/core';

@Component({
  selector: 'app-cart',
  template: `<p>Total items: {{ totalItems() }}</p>`
})
export class CartComponent {
  items = signal([{ qty: 1 }, { qty: 2 }]);
  totalItems = computed(() => this.items().reduce((sum, item) => sum + item.qty, 0));
}
```

This first example is fine. Pure derivation. Deterministic. Safe.

## The risky pattern — uncontrolled effects

```typescript
import { Component, effect, signal } from '@angular/core';

@Component({
  selector: 'app-analytics-counter',
  template: `<button (click)="increment()">Clicked {{ count() }} times</button>`
})
export class AnalyticsCounterComponent {
  count = signal(0);

  constructor() {
    effect(() => {
      console.log('analytics event', this.count());
    });
  }

  increment() {
    this.count.update(v => v + 1);
  }
}
```

If that effect performs a real side effect during initialization, you now have to ask: does it run on the server? Does it run again on the client? Should it?

So the principle with Signals is: **pure reactive computation is great for SSR; uncontrolled effects are where trouble begins.**

---

# Lesson 10: Live Apps and Trading Apps — A Bad Fit for SSR

## SSR gives you a snapshot. Live apps are streams.

For live applications — stock trading, market feeds, real-time dashboards, multiplayer systems — SSR is usually not the right default for the core interactive area.

SSR is best when the initial HTML has meaningful value for the user and remains relevant long enough to justify server rendering.

In a trading app, data is stale almost immediately. Hydration then has to reconnect to live state. And the risk of mismatch, flicker, duplicate fetches, and client resynchronization becomes much higher.

So for this type of application, SSR might still make sense for:
- landing pages
- public SEO pages
- marketing pages
- static stock overview pages

But usually not for the live dashboard itself.

That is the kind of architectural distinction teams need to make before enabling SSR everywhere.

---

# Lesson 11: When SSR Is Worth It

## Use it deliberately

**SSR is a good fit when:**
- SEO matters
- First meaningful content matters
- Content is mostly stable or cacheable
- The route is content-heavy rather than interaction-heavy
- The initial server HTML provides real user value

**SSR is a weaker fit when:**
- The app is highly interactive
- Client state dominates
- Browser APIs are deeply embedded
- Timing-sensitive logic is everywhere
- Live updates make the initial server snapshot obsolete immediately

So the mature decision is not: "Can we enable SSR?"

The mature decision is: **"Which routes benefit from SSR, and which do not?"**

---

# Lesson 12: The SSR Closing Thought

## SSR is a tradeoff, not an upgrade

Angular SSR is powerful. But it is not a free upgrade.

It adds a server runtime. It adds a second execution. It adds hydration. It changes your async behavior. It changes your debugging model. It changes which code is safe.

If you understand those tradeoffs, SSR can be the right tool.

If you ignore them, SSR becomes a source of complexity that your team keeps paying for.

So the real goal is not to blindly adopt SSR. The real goal is to understand:
- what it gives you
- what it costs you
- and whether your application actually needs it

---

# Mental Model Summary

| Concept | What You Need to Know |
|---|---|
| CSR | Angular runs entirely in the browser. Blank screen until JS loads and executes. |
| SSR | Angular runs on server first (Node.js), produces HTML, browser receives real content immediately, then Angular runs again in browser. |
| Two runtimes | Server (Node.js) ≠ browser. No window, document, localStorage on server. Code must handle both. |
| Hydration | Angular reuses server DOM instead of destroying and rebuilding. Requires server and client output to match exactly. |
| Hydration mismatch | Any nondeterministic value (Date.now, Math.random, browser APIs) causes server and client output to differ → Angular destroys and rebuilds the section → CLS. |
| Stability | Angular waits for all async work to complete before serializing HTML. Long-lived timers or never-completing subscriptions prevent stability → render hangs. |
| PendingTasks | API for manually registering custom async work that Angular doesn't track automatically. |
| Duplicate side effects | ngOnInit, constructors, effects run on server AND browser. Analytics, HTTP calls, state mutations run twice. |
| TransferState | Server embeds HTTP responses in the HTML. Browser HttpClient reads these instead of making duplicate network requests. |
| TTFB | SSR makes TTFB worse (server processing time). Caching at CDN restores it. |
| LCP | SSR improves LCP only if TTFB is controlled. The content is in the HTML on arrival. |
| CLS | SSR can introduce CLS via hydration mismatches. |
| INP | SSR barely helps. JS bundle still downloads and runs. Hydration still blocks main thread. |
| Decision framework | SSR per route: SEO value + cacheable + stable data + low CLS risk = worth it. Auth-gated + real-time + interaction-heavy = not worth it. |

---

# One-Liners for the Talk

- Angular SSR is not one render. It is two executions with different rules.
- Your app does not move from server to browser. It restarts in a different runtime.
- Hydration succeeds only when server output and client expectation still agree.
- In SSR, async work is not just async work. It affects render timing.
- A browser assumption hidden in your code becomes a platform bug in SSR.
- SSR gives you a snapshot. Some applications are streams.
- SSR is a tradeoff, not an upgrade.

---

# Q&A Answers to Be Ready For

## Is SSR bad?
No. It is valuable when SEO and fast first paint matter, and when the rendered content stays meaningful long enough to justify the cost. It is just not universally beneficial.

## Does hydration always happen automatically?
In standard Angular SSR setups, hydration is enabled with `provideClientHydration()` and is often already wired in CLI-based SSR projects. If the client expects hydration but the server response lacks hydration info, Angular surfaces errors such as NG0505.

## Can Signals solve SSR issues?
They help with cleaner reactivity, but they do not erase the two-runtime model. Determinism and side-effect control still matter.

## How do I control custom async stability?
Angular exposes `PendingTasks` for custom work that should affect stability when built-in tracking is not enough.
