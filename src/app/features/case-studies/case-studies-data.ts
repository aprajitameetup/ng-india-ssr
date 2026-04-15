export interface CSSolution {
  title: string;
  when: string;
  description: string;
  code?: string;
  api: string;
}

export interface CaseStudy {
  id: number;
  title: string;
  subtitle: string;
  category: 'hydration' | 'performance' | 'state' | 'rendering' | 'security' | 'serverless' | 'edge';
  scenario: string;
  symptoms: string[];
  rootCause: string;
  rootCauseCode?: string;
  solutions: CSSolution[];
  keyTakeaway: string;
}

export const CASE_STUDY_CATEGORIES: Record<string, { label: string; color: string }> = {
  hydration:   { label: 'Hydration',   color: '#6366f1' },
  performance: { label: 'Performance', color: '#f59e0b' },
  state:       { label: 'State',       color: '#22c55e' },
  rendering:   { label: 'Rendering',   color: '#06b6d4' },
  security:    { label: 'Security',    color: '#ef4444' },
  serverless:  { label: 'Serverless',  color: '#a855f7' },
  edge:        { label: 'Edge',        color: '#0ea5e9' },
};

export const CASE_STUDIES: CaseStudy[] = [
  {
    id: 1,
    title: 'Auth Button Flicker & Lost Clicks',
    subtitle: 'Sign In vs Continue — the button that cannot make up its mind',
    category: 'hydration',
    scenario: `A product page has a primary CTA: "Continue" if the user is already logged in, "Sign In" otherwise.
The page is server-side rendered. The server has no idea about the user's auth state, so it renders
"Sign In" (the guest default). Half a second later, the Angular client boots, discovers the user IS
logged in, and swaps the button to "Continue" — a visible flash. Worse: if the user clicked "Continue"
during that half second, the click is silently dropped because Angular's event listeners weren't attached yet.`,
    symptoms: [
      'Button text/state visibly changes ~500ms after page paint (flicker)',
      'Clicking the button immediately after page load does nothing',
      'Hydration mismatch warning in the console',
      'CLS score increases because layout may shift on button swap',
    ],
    rootCause: `The server renders HTML without knowing auth state. Auth is almost always stored
client-side (localStorage token, sessionStorage, or a JS-readable cookie). The server commits
to one state in HTML; the client corrects it during hydration — causing both a visual flash
(mismatch repaint) and a window of unresponsiveness (no event listeners until hydration completes).`,
    rootCauseCode: `// ❌ Server renders this — it has no idea about auth
<button class="cta">Sign In</button>

// ✅ Client wants to render this — causes mismatch + flicker
<button class="cta">Continue</button>

// Meanwhile, user clicks "Continue" at t=200ms.
// Angular hydration finishes at t=450ms.
// Click is gone. Angular never saw it.`,
    solutions: [
      {
        title: 'Fix lost clicks with withEventReplay()',
        when: 'Always — regardless of where auth lives',
        description: `Event replay captures DOM events that fire before Angular hydration completes,
queues them, and replays them once the component is hydrated. The user's click at t=200ms
is stored and fired again at t=450ms when the listener is ready.`,
        code: `// app.config.ts
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideClientHydration(
      withEventReplay()   // ← captures clicks, inputs, submits before hydration
    )
  ]
};`,
        api: 'withEventReplay() — @angular/platform-browser',
      },
      {
        title: 'Eliminate flicker: read auth from an HttpOnly cookie (best)',
        when: 'Auth token lives in an HttpOnly cookie (recommended architecture)',
        description: `If auth is in a cookie, the SSR server can read it from the incoming HTTP
request. The server renders the correct button state from the first byte.
Zero flicker, zero mismatch, no hydration penalty.
Pass the resolved state to the client via TransferState so Angular doesn't re-check on boot.`,
        code: `// auth.service.ts (works on both server + browser)
import { inject, makeStateKey, TransferState, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { REQUEST } from '@angular/core';   // server-only

const AUTH_KEY = makeStateKey<boolean>('isLoggedIn');

@Injectable({ providedIn: 'root' })
export class AuthService {
  private ts        = inject(TransferState);
  private platformId = inject(PLATFORM_ID);

  readonly isLoggedIn = signal(this.resolveAuth());

  private resolveAuth(): boolean {
    // Client: read from TransferState (already set by server)
    if (isPlatformBrowser(this.platformId)) {
      return this.ts.get(AUTH_KEY, false);
    }

    // Server: read the real cookie from the HTTP request
    const req = inject(REQUEST);
    const cookies = req?.headers.get('cookie') ?? '';
    const hasToken = cookies.includes('auth_token=');

    // Hand the result to the client — no re-fetch needed
    this.ts.set(AUTH_KEY, hasToken);
    return hasToken;
  }
}

// product-page.html — no flicker, server renders correct state
<button class="cta">
  {{ authService.isLoggedIn() ? 'Continue' : 'Sign In' }}
</button>`,
        api: 'TransferState + makeStateKey + REQUEST — @angular/core',
      },
      {
        title: 'Eliminate flicker: defer the button (escape hatch)',
        when: 'Auth lives in localStorage/sessionStorage — server can never know',
        description: `If you cannot move auth to a cookie, instruct Angular to skip rendering
the auth button on the server entirely. @defer on immediate renders nothing (or a neutral
placeholder) during SSR. The client renders the real button after boot — no mismatch,
no flicker caused by a mismatch correction, and the placeholder is visually stable.`,
        code: `<!-- product-page.html -->

@defer (on immediate; hydrate on immediate) {
  <!-- Only runs on the client. Server sends the placeholder below. -->
  <button class="cta" (click)="handleCta()">
    {{ authService.isLoggedIn() ? 'Continue' : 'Sign In' }}
  </button>
} @placeholder {
  <!-- Server renders this. Neutral, no commitment to auth state. -->
  <button class="cta cta-loading" disabled>
    <span class="spinner"></span>
  </button>
}`,
        api: '@defer (on immediate; hydrate on immediate) — Angular template syntax',
      },
      {
        title: 'Quick escape: ngSkipHydration',
        when: 'You need a one-line fix and can accept a client repaint',
        description: `ngSkipHydration tells Angular: "do not attempt to reconcile this subtree
during hydration — just re-render it fresh on the client." No mismatch error, but the
component will re-render from scratch, so you will still see a brief paint.
Use this as a stepping stone while you implement the proper cookie-based fix.`,
        code: `<!-- Applies to the host element of the component -->
<app-auth-button ngSkipHydration />

<!-- Or on a wrapper div if you don't own the component -->
<div ngSkipHydration>
  <button class="cta">{{ isLoggedIn() ? 'Continue' : 'Sign In' }}</button>
</div>`,
        api: 'ngSkipHydration — @angular/core (host directive)',
      },
    ],
    keyTakeaway: `Two separate problems require two separate fixes. withEventReplay() is a
one-line global fix for lost clicks — always add it. For the flicker, the root cause is
architecture: move auth to an HttpOnly cookie so the server can render truth from the start.
When that is not possible, @defer the auth-dependent element so the server never commits to a state.`,
  },

  // ── CASE STUDY 2 ──────────────────────────────────────────────────────────
  {
    id: 2,
    title: 'The Double-Fetch Spinner Flash',
    subtitle: 'SSR already fetched the data — why is there a loading spinner?',
    category: 'performance',
    scenario: `A product listing page is server-side rendered. The server fetches 24 products,
renders them into HTML, and sends the full page to the browser. The user sees products
immediately — great. Then Angular boots on the client, finds no local data, and fires the
exact same HTTP request again. For 300-500ms the products disappear behind skeleton cards
while the second fetch completes. The user sees a flash of loading state on a page that
arrived fully populated. The API was called twice, bandwidth was wasted, and the user's
experience degraded for no reason.`,
    symptoms: [
      'Products/content briefly disappear and show skeleton/spinner after page load',
      'Network tab shows the same API endpoint called twice on every page load',
      'Time to interactive is longer than expected despite fast SSR',
      'Users on slow connections see a noticeable blank/skeleton phase even on SSR pages',
    ],
    rootCause: `Angular SSR and the browser client are two completely separate execution
contexts. The server fetches data, uses it to render HTML, then discards it. When the
browser receives the HTML and Angular boots, it has no memory of what the server fetched.
So it fetches again. Without TransferState (a server→client state bridge), every HTTP
request made during SSR is repeated on the client — guaranteed.`,
    rootCauseCode: `// Without TransferState — this runs TWICE: once on server, once on client
@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);

  getProducts() {
    // Server fetches → renders HTML → throws result away
    // Client boots → fetches again → skeleton flashes
    return this.http.get<Product[]>('/api/products');
  }
}`,
    solutions: [
      {
        title: 'withHttpTransferCache() — automatic, zero code changes',
        when: 'You use HttpClient for all data fetching (recommended default)',
        description: `Angular 17+ ships a built-in HTTP transfer cache. Add one flag to
provideClientHydration() and Angular automatically captures every HttpClient response
made during SSR, serialises it into the HTML as a <script> block, and replays it on
the client — skipping the second network request entirely. No changes to your services,
no manual keys, no boilerplate.`,
        code: `// app.config.ts
import {
  provideClientHydration,
  withEventReplay,
  withHttpTransferCache   // ← add this
} from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideClientHydration(
      withEventReplay(),
      withHttpTransferCache()   // done — all HttpClient calls are now cached
    )
  ]
};

// product.service.ts — zero changes needed
getProducts() {
  // First call (server): fetches + stores in transfer state
  // Second call (client): reads from transfer state, no network request
  return this.http.get<Product[]>('/api/products');
}`,
        api: 'withHttpTransferCache() — @angular/platform-browser',
      },
      {
        title: 'Manual TransferState — fine-grained control',
        when: 'You need control over which requests are cached, or use non-HttpClient fetching',
        description: `TransferState is the low-level primitive that withHttpTransferCache()
is built on. You manually set a key on the server, read it on the client, and delete it
after use. Use this when you want to cache derived/computed data, not just raw HTTP
responses — for example, a filtered/sorted product list, or data from a third-party SDK
that doesn't use HttpClient.`,
        code: `import { inject, makeStateKey, TransferState, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const PRODUCTS_KEY = makeStateKey<Product[]>('products');

@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);
  private ts   = inject(TransferState);
  private platformId = inject(PLATFORM_ID);

  getProducts(): Observable<Product[]> {
    if (isPlatformBrowser(this.platformId)) {
      // Client: check transfer state first
      const cached = this.ts.get(PRODUCTS_KEY, null);
      if (cached) {
        this.ts.remove(PRODUCTS_KEY);   // consume it — don't cache forever
        return of(cached);              // no network request
      }
    }

    return this.http.get<Product[]>('/api/products').pipe(
      tap(products => {
        if (!isPlatformBrowser(this.platformId)) {
          // Server: store for the client
          this.ts.set(PRODUCTS_KEY, products);
        }
      })
    );
  }
}`,
        api: 'TransferState + makeStateKey — @angular/core',
      },
      {
        title: 'resource() — signals-based, transfer-cache aware',
        when: 'You are using Angular 19+ signals-based data fetching',
        description: `Angular's resource() API integrates with withHttpTransferCache()
automatically when you use HttpClient inside the loader. The resource is inert on the
server (no polling, no retries), and on the client it reads from the transfer cache
before making any network call. Combine with params() for reactive re-fetching.`,
        code: `// product-list.ts
export class ProductListComponent {
  private http = inject(HttpClient);

  // resource() + withHttpTransferCache() = automatic dedup
  productsResource = resource<Product[], void>({
    loader: () =>
      firstValueFrom(this.http.get<Product[]>('/api/products'))
    // No extra code — transfer cache handles server→client hand-off
  });
}

// template
@if (productsResource.isLoading()) {
  <app-skeleton />
} @else if (productsResource.value(); as products) {
  @for (p of products; track p.id) { <app-product-card [product]="p" /> }
}`,
        api: 'resource() + withHttpTransferCache() — @angular/core + @angular/platform-browser',
      },
    ],
    keyTakeaway: `withHttpTransferCache() is a one-line fix that eliminates double fetching
for all HttpClient calls with zero code changes to your services. It should be on by default
in every SSR app. Manual TransferState is the escape hatch for non-HttpClient data or when
you need selective caching. The double-fetch flash is always a symptom of a missing
transfer cache — never accept it as normal SSR behaviour.`,
  },

  // ── CASE STUDY 3 ──────────────────────────────────────────────────────────
  {
    id: 3,
    title: 'Prerendered Stale Price',
    subtitle: 'The product page says $999 and "In Stock" — but that was 3 days ago',
    category: 'rendering',
    scenario: `An e-commerce site prerenderes all product detail pages at build time for
maximum performance. Pages load in 80ms from a CDN. A week later, a product goes on sale
($799 → down from $999), another goes out of stock, and a third has a new image. But
every user still sees the build-time snapshot: old price, wrong stock status, stale image.
Support tickets spike. The team doesn't understand why — "we updated the database!"
The database is fine. The prerendered HTML on the CDN is not.`,
    symptoms: [
      'Price/stock/content changes in the database but users still see old values',
      'Hard refresh does not help — the stale HTML is served from CDN edge',
      'Only a new build + deploy fixes the content',
      'Dynamic, user-specific content (wishlists, personalisation) never works',
    ],
    rootCause: `This is the fundamental trade-off between RenderMode.Prerender (SSG) and
RenderMode.Server (SSR). Prerender runs ONCE at build time — it bakes the data into a
static HTML file. That file is served to every user forever (or until the next build).
RenderMode.Server runs on every HTTP request — it always fetches fresh data.

Prerender = speed (CDN, no server needed), at the cost of freshness.
Server     = freshness (data is current at request time), at the cost of speed (Node.js needed).

The mistake is using Prerender for content that changes frequently.`,
    rootCauseCode: `// app.routes.server.ts

// ❌ Wrong for frequently-changing data
{
  path: 'products/:slug',
  renderMode: RenderMode.Prerender,
  // HTML frozen at build time — price/stock will go stale
}

// ✅ Correct — rendered fresh on every request
{
  path: 'products/:slug',
  renderMode: RenderMode.Server,
  // Fetches current price/stock on each visit
}

// ✅ Also correct — prerender the shell, fetch live data client-side
{
  path: 'products/:slug',
  renderMode: RenderMode.Prerender,
  // Prerender static shell (title, description, images)
  // Use @defer or resource() to load price/stock client-side
}`,
    solutions: [
      {
        title: 'Understand the three render modes — pick the right one',
        when: 'Architecture decision — must be made per route',
        description: `Angular gives you three modes per route. The choice depends entirely
on how often the data changes and whether it is user-specific.

RenderMode.Prerender (SSG): HTML built once at deploy time. Served from CDN/disk.
Best for: blog posts, marketing pages, docs, product descriptions that rarely change.
Not for: prices, stock, user-specific content.

RenderMode.Server (SSR): HTML built fresh on every HTTP request by a Node.js process.
Best for: pages with live data — prices, inventory, personalised feeds, dashboards.
Not for: pages that never change (waste of server resources).

RenderMode.Client (CSR): No server rendering at all. Browser does everything.
Best for: highly interactive apps, auth-gated dashboards, pages that need user data before rendering.
Not for: pages that need SEO or fast first paint.`,
        code: `// app.routes.server.ts — right tool for the right job
export const serverRoutes: ServerRoute[] = [
  // HOME — SSR: featured products, trending, live inventory badges
  { path: '', renderMode: RenderMode.Server },

  // PRODUCT DETAIL — SSR: price and stock must be live
  { path: 'products/:slug', renderMode: RenderMode.Server },

  // BLOG POST — Prerender: content never changes between deploys
  { path: 'blog/:slug', renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const http = inject(HttpClient);
      const res = await firstValueFrom(http.get<{slugs:string[]}>('/api/blog/slugs'));
      return res.slugs.map(slug => ({ slug }));
    }
  },

  // CART / CHECKOUT — Client: 100% user-specific, no SSR benefit
  { path: 'cart', renderMode: RenderMode.Client },
  { path: 'checkout', renderMode: RenderMode.Client },
];`,
        api: 'RenderMode.Server | RenderMode.Prerender | RenderMode.Client — @angular/ssr',
      },
      {
        title: 'Hybrid: prerender the shell, fetch volatile data client-side',
        when: 'You want CDN speed but some fields (price, stock) must be live',
        description: `Prerender the static parts of the page (title, description, images,
reviews) for CDN performance. Use @defer or resource() to load the volatile parts
(price, stock count) client-side after hydration. The page loads fast from CDN,
and the live badge/price fetches fresh data on every visit.`,
        code: `<!-- product-detail.html — hybrid strategy -->

<!-- Static shell: prerendered, served from CDN -->
<h1>{{ product.name }}</h1>
<img [src]="product.image" [alt]="product.name" />
<p>{{ product.description }}</p>

<!-- Volatile: fetched live on the client after hydration -->
@defer (on immediate; hydrate on immediate) {
  <app-price-badge [slug]="product.slug" />
  <app-stock-indicator [slug]="product.slug" />
  <button class="add-to-cart" (click)="addToCart()">Add to Cart</button>
} @placeholder {
  <div class="price-skeleton"></div>
  <div class="stock-skeleton"></div>
}`,
        api: '@defer (on immediate) — Angular template syntax',
      },
      {
        title: 'ISR pattern: trigger a rebuild when data changes',
        when: 'Content changes infrequently but must eventually be fresh',
        description: `Angular does not have built-in ISR (Incremental Static Regeneration)
like Next.js, but you can replicate the pattern: use RenderMode.Server with aggressive
Cache-Control headers on your Node.js server. The first request is SSR (slow), subsequent
requests hit the server cache (fast), and the cache is invalidated when data changes via
a webhook. Stale-while-revalidate gives you CDN-like speed with eventual freshness.`,
        code: `// server.ts — stale-while-revalidate pattern
app.get('/products/:slug', (req, res, next) => {
  // Serve cached response immediately, revalidate in background
  res.setHeader(
    'Cache-Control',
    'public, max-age=60, stale-while-revalidate=600'
    // Serve cache for 60s, serve stale + revalidate for 10min
  );
  next(); // pass to Angular SSR handler
});

// Webhook from your CMS/DB: invalidate cache when product changes
app.post('/api/revalidate', (req, res) => {
  const { slug } = req.body;
  cache.delete(\`/products/\${slug}\`);
  res.json({ revalidated: true });
});`,
        api: 'Cache-Control: stale-while-revalidate — HTTP / Express',
      },
    ],
    keyTakeaway: `Prerender = speed. Server = freshness. You cannot have both from the same
render mode. The decision rule: if the data changes more often than you deploy, use
RenderMode.Server. If the data only changes when you deploy (blog posts, docs, marketing
copy), use RenderMode.Prerender. For e-commerce product pages — price and stock change
without a deploy, so they must be RenderMode.Server or use the hybrid @defer pattern.`,
  },

  // ── CASE STUDY 4 ──────────────────────────────────────────────────────────
  {
    id: 4,
    title: 'Form Input Lost During Hydration',
    subtitle: 'User starts typing — Angular boots and wipes everything they wrote',
    category: 'hydration',
    scenario: `A search results page is server-side rendered with a search input at the top.
The user arrives from a Google search, the page loads instantly (great SSR!), and they
immediately start refining their query by typing in the search box. 400ms later, Angular
finishes hydration. The input reverts to its initial empty state. Everything the user
typed is gone. They retype it, now frustrated. This also happens on checkout forms —
users fill in their email and phone number before the page fully hydrates, and the fields
reset. withEventReplay() handles button clicks but does NOT save typed input values.`,
    symptoms: [
      'Text typed into inputs immediately after page load disappears after ~400ms',
      'Form fields reset to empty/default values mid-typing',
      'withEventReplay() is already enabled but does not fix the issue',
      'Problem only occurs on fast typists or users on fast devices who interact before hydration',
    ],
    rootCause: `withEventReplay() captures and replays discrete events (click, submit, focus).
It does NOT preserve the DOM value that the user physically typed. When Angular hydrates a
text input, it renders it from the component's signal/model state — which is still the
initial value (empty string). The characters the user typed exist only in the DOM's
.value property; Angular's render overwrites them. Event replay fires the keydown/input
events again but against a now-empty field, producing garbled results.`,
    rootCauseCode: `// ❌ The problem: component state says "" — DOM says "iph" (user typed)
export class SearchComponent {
  query = signal('');   // initial state: empty

  // Angular hydrates → renders input with value=""
  // User had typed "iph" into the raw DOM
  // Angular's render wins → "iph" is gone
}

// withEventReplay() replays the keydown events —
// but they now fire against an empty input → output: "i", "ip", "iph" race condition
// Result: unpredictable, often empty or partial`,
    solutions: [
      {
        title: 'Put the search query in the URL — not in component state',
        when: 'Search inputs, filters, pagination — any state the user can share or bookmark',
        description: `If the search query lives in the URL (?q=iphone), the server reads it,
pre-populates the input, and SSR renders the input with the correct value already in it.
The user sees a populated input from byte one. When Angular hydrates, the component reads
from the URL (same value) — no mismatch, no reset. This is the correct architecture for
any shareable or bookmarkable state.`,
        code: `// search.ts — query lives in URL, not in isolated component signal
export class SearchComponent implements OnInit {
  private router = inject(Router);
  private route  = inject(ActivatedRoute);

  // toSignal reads query params — works on server AND client
  private params = toSignal(this.route.queryParams, { initialValue: {} });
  query = computed(() => this.params()['q'] ?? '');

  onInput(value: string) {
    // Update URL → component reacts → no state mismatch
    this.router.navigate([], {
      queryParams: { q: value },
      replaceUrl: true,
    });
  }
}

// template — input pre-populated from URL on SSR, hydrates correctly
<input
  type="search"
  [value]="query()"
  (input)="onInput($any($event.target).value)"
/>`,
        api: 'ActivatedRoute.queryParams + toSignal — @angular/router + rxjs-interop',
      },
      {
        title: '@defer the form — skip SSR for interactive-only elements',
        when: 'Forms that are purely interactive with no SEO or first-paint benefit from SSR',
        description: `If the form has no value being server-side rendered (empty search box,
blank checkout form), skip SSR for it entirely. @defer on immediate means the server
sends a neutral placeholder (skeleton or disabled state). The client renders the real
interactive form after Angular boots — no hydration mismatch, no reset, because Angular
owns the form from the first render.`,
        code: `<!-- checkout.html -->

@defer (on immediate; hydrate on immediate) {
  <!-- Client-only: Angular owns this from first render, no mismatch possible -->
  <form [formGroup]="checkoutForm" (ngSubmit)="submit()">
    <input formControlName="email" placeholder="Email" />
    <input formControlName="phone" placeholder="Phone" />
    <button type="submit">Place Order</button>
  </form>
} @placeholder {
  <!-- Server renders this — neutral, no commitment to form state -->
  <div class="form-skeleton">
    <div class="sk sk-input"></div>
    <div class="sk sk-input"></div>
    <div class="sk sk-btn"></div>
  </div>
}`,
        api: '@defer (on immediate; hydrate on immediate) — Angular template syntax',
      },
      {
        title: 'Restore from DOM before Angular overwrites it',
        when: 'You cannot change the architecture and need a quick mitigation',
        description: `In ngOnInit (which runs after hydration), read the current DOM value
of the input before Angular's change detection overwrites it. Store it back into the
component signal. This is a workaround — it works but adds complexity. Prefer the
URL-based approach for long-term maintainability.`,
        code: `// search.ts — read DOM value before Angular overwrites it
export class SearchComponent implements OnInit {
  query = signal('');
  inputRef = viewChild<ElementRef>('searchInput');

  ngOnInit() {
    // ngOnInit runs after hydration — DOM value still has what user typed
    const domValue = this.inputRef()?.nativeElement?.value;
    if (domValue) {
      // Rescue the user's input before change detection clears it
      this.query.set(domValue);
      this.search(domValue);
    }
  }
}

// template
<input #searchInput type="search" [value]="query()" (input)="query.set($any($event.target).value)" />`,
        api: 'viewChild() + ElementRef + ngOnInit — @angular/core',
      },
    ],
    keyTakeaway: `withEventReplay() is not the answer for typed input loss — it was never
designed for that. The correct fix is to not have a mismatch in the first place: put
shareable state in the URL so SSR renders the right value, or use @defer so Angular owns
the form from birth and never has to reconcile a stale initial state against user input.
The principle: any state the user can interact with before hydration must either live in
the URL or not be SSR-rendered at all.`,
  },

  // ── CASE STUDY 5 ──────────────────────────────────────────────────────────
  {
    id: 5,
    title: 'Third-Party Library Crashes SSR',
    subtitle: 'Works perfectly in the browser — white screen on the server',
    category: 'rendering',
    scenario: `The team integrates a chart library (Chart.js), a rich-text editor (Quill),
or an analytics SDK (Segment, Heap). Everything works fine locally with ng serve. They
deploy to production with SSR enabled and the entire page goes white. The server logs
show: "ReferenceError: window is not defined" or "document is not defined". The library
reaches for browser globals at import time — before any component even renders — and
Node.js does not have window, document, navigator, or localStorage. The crash happens
before Angular can render a single byte of HTML.`,
    symptoms: [
      'White/blank page in production SSR — works fine with ng serve (CSR mode)',
      'Server error logs: "window is not defined" or "document is not defined"',
      'Error originates inside node_modules, not your own code',
      'The crash happens at module load time — not inside a component lifecycle hook',
    ],
    rootCause: `Browser APIs (window, document, navigator, localStorage, requestAnimationFrame)
do not exist in Node.js. Most UI libraries assume they are running in a browser and access
these globals immediately when the module is imported — even before any component uses them.
In Angular SSR, all modules are imported during the server render. The moment Node.js
executes the import, the library crashes. Angular never gets a chance to render.`,
    rootCauseCode: `// What happens inside many third-party libraries at import time:
const ChartJS = require('chart.js');
// Internally: const ctx = document.createElement('canvas');  ← BOOM in Node.js
// "ReferenceError: document is not defined"

// Your code looks innocent:
import { ChartComponent } from './chart/chart';  // ← triggers the crash on import

// Even this is enough to crash SSR:
import Chart from 'chart.js/auto';`,
    solutions: [
      {
        title: 'isPlatformBrowser guard — skip browser-only code on the server',
        when: 'The library usage is inside a component lifecycle (ngOnInit, afterNextRender)',
        description: `Inject PLATFORM_ID and check isPlatformBrowser before calling any
browser API or third-party library method. The library can still be imported (as long as
the import itself doesn't crash) — just guard every usage site. Angular's afterNextRender()
is an even cleaner option: it only runs in the browser, never on the server.`,
        code: `import { Component, inject, PLATFORM_ID, ElementRef, viewChild, afterNextRender } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Component({ selector: 'app-chart', template: '<canvas #canvas></canvas>' })
export class ChartComponent {
  private platformId = inject(PLATFORM_ID);
  private canvasRef  = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    // afterNextRender ONLY runs in the browser — never on the server
    afterNextRender(() => {
      // Safe to use Chart.js, D3, canvas APIs here
      import('chart.js/auto').then(({ Chart }) => {
        new Chart(this.canvasRef()!.nativeElement, {
          type: 'bar',
          data: { /* ... */ },
        });
      });
    });
  }
}

// Alternative: manual guard
ngOnInit() {
  if (isPlatformBrowser(this.platformId)) {
    this.initLibrary();
  }
}`,
        api: 'afterNextRender() + PLATFORM_ID + isPlatformBrowser — @angular/core',
      },
      {
        title: 'Dynamic import() — prevent the module from loading on the server',
        when: "The library's import statement itself crashes Node.js (accesses globals at module level)",
        description: `If the library crashes on import (not just on usage), a static import
statement will always break SSR regardless of guards. The fix is a dynamic import() inside
a browser-only context. The module is never loaded by Node.js — it is only requested by
the browser after Angular boots. Combine with afterNextRender() for the safest pattern.`,
        code: `@Component({ selector: 'app-rich-editor', template: '<div #editor></div>' })
export class RichEditorComponent {
  private editorRef = viewChild<ElementRef>('editor');

  constructor() {
    afterNextRender(async () => {
      // Dynamic import: Node.js never executes this line
      // Browser loads Quill only when this component mounts
      const { default: Quill } = await import('quill');
      new Quill(this.editorRef()!.nativeElement, { theme: 'snow' });
    });
  }
}

// For analytics SDKs — initialise only in the browser
afterNextRender(async () => {
  const { AnalyticsBrowser } = await import('@segment/analytics-next');
  const analytics = AnalyticsBrowser.load({ writeKey: 'YOUR_KEY' });
  analytics.track('Page Viewed');
});`,
        api: 'dynamic import() + afterNextRender() — ES2020 + @angular/core',
      },
      {
        title: '@defer — move the entire component out of SSR',
        when: 'A whole component depends on a browser-only library (charts, maps, editors)',
        description: `If an entire component is powered by a browser-only library, wrapping
it in @defer means Angular never imports or renders it during SSR. The server sends a
placeholder. The client loads the chunk lazily when the trigger fires. This also improves
initial bundle size since the library is in a separate lazy chunk.`,
        code: `<!-- dashboard.html — chart component never touches the server -->

@defer (on viewport; hydrate on viewport) {
  <!-- ChartComponent and chart.js are in a lazy chunk.         -->
  <!-- Server never imports this chunk → no window crash.       -->
  <!-- Client loads it when scrolled into view.                 -->
  <app-sales-chart [data]="chartData()" />
} @placeholder {
  <div class="chart-placeholder">
    <div class="sk sk-chart"></div>
  </div>
} @loading (minimum 200ms) {
  <div class="chart-loading">Loading chart…</div>
}

<!-- For above-the-fold charts that need to appear immediately -->
@defer (on immediate; hydrate on immediate) {
  <app-hero-chart [data]="heroData()" />
}`,
        api: '@defer (on viewport) + lazy chunk splitting — Angular template syntax',
      },
      {
        title: 'ngSkipHydration — suppress mismatch when library mutates the DOM',
        when: 'Library renders fine in CSR but causes hydration mismatch errors (not a crash)',
        description: `Some libraries (Swiper, FullCalendar, rich text editors) render fine
on the server but then mutate the DOM in ways that Angular's hydration does not expect —
producing mismatch errors instead of white screens. ngSkipHydration tells Angular to skip
reconciling this subtree and let the library own its DOM. The component re-renders
client-side from scratch on boot.`,
        code: `<!-- Add ngSkipHydration to the component that uses the mutating library -->
<app-product-carousel ngSkipHydration [products]="products()" />

<!-- Or wrap it if you don't own the component -->
<div ngSkipHydration>
  <full-calendar [options]="calendarOptions" />
</div>

<!-- Even better: combine with @defer to skip SSR entirely -->
@defer (on viewport; hydrate on viewport) {
  <div ngSkipHydration>
    <swiper-container [config]="swiperConfig">
      @for (slide of slides(); track slide.id) {
        <swiper-slide><img [src]="slide.image" /></swiper-slide>
      }
    </swiper-container>
  </div>
}`,
        api: 'ngSkipHydration — @angular/core',
      },
    ],
    keyTakeaway: `The safest pattern for any browser-only third-party library is:
dynamic import() inside afterNextRender(). This guarantees the module never loads in
Node.js and the initialisation code never runs on the server. @defer is the component-level
version of the same idea — skip the whole subtree on SSR. isPlatformBrowser guards are
correct for usage sites but insufficient when the import itself crashes. Know which problem
you have: a crash-on-import needs dynamic import(); a crash-on-usage needs a browser guard.`,
  },

  // ── CASE STUDY 6 ──────────────────────────────────────────────────────────
  {
    id: 6,
    title: 'SSR Renders Guest Data for Logged-In Users',
    subtitle: 'The server calls your API without the user\'s cookies — and gets the wrong response',
    category: 'security',
    scenario: `A product detail page is server-side rendered and shows personalised pricing
(loyalty tier discount), a saved-address prompt, and a wishlist button that shows "Saved"
if already in the user's wishlist. Everything works perfectly in the browser. In SSR,
the page always renders guest pricing, no saved-address prompt, and a blank wishlist button
— regardless of whether the user is logged in. Worse, withHttpTransferCache() caches this
guest response and hands it to the client. The client reads from the cache, never re-fetches,
and the user sees wrong data for their entire session until they force-refresh.`,
    symptoms: [
      'Logged-in users see guest prices, generic CTAs, or empty wishlist states',
      'Personalised UI elements that work in pure CSR are blank or wrong after SSR migration',
      'withHttpTransferCache() makes the problem persistent — the wrong data never refreshes',
      'Issue only appears on first load (SSR); subsequent client navigations show correct data',
    ],
    rootCause: `The SSR server (AngularNodeAppEngine) runs your Angular services and makes
HTTP calls to your backend — but it runs as its own process with no cookie jar. The user's
session cookie, JWT, or auth token lives in the browser. When your ProductService calls
/api/product/:id, the outgoing request from the server has no Authorization header and no
Cookie header. Your API treats it as an anonymous request and returns guest-tier data.
TransferState then locks that guest response in and ships it to the client.`,
    rootCauseCode: `// ❌ ProductService — makes backend call without any auth context
@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);

  getProduct(slug: string) {
    // On the server, this request has no cookies, no auth header.
    // API returns guest pricing. TransferState caches it. Client uses the cache.
    return this.http.get<Product>(\`/api/products/\${slug}\`);
  }
}`,
    solutions: [
      {
        title: 'Forward the Cookie header from the incoming request',
        when: 'Your API authenticates via HttpOnly cookies (recommended)',
        description: `Angular SSR provides the incoming HTTP request via the REQUEST injection
token. Extract the Cookie header from it and attach it to all outgoing HttpClient requests
using an HTTP interceptor. The backend API now sees the user's session cookie and returns
personalised data. TransferState caches the correct, authenticated response.`,
        code: `// auth-forwarding.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { REQUEST } from '@angular/core';

export const authForwardingInterceptor: HttpInterceptorFn = (req, next) => {
  // Only runs on the server — browser manages cookies itself
  if (isPlatformBrowser(inject(PLATFORM_ID))) return next(req);

  const incomingRequest = inject(REQUEST, { optional: true });
  const cookieHeader = incomingRequest?.headers.get('cookie');

  if (!cookieHeader) return next(req);

  // Forward the user's cookies to the outgoing API request
  return next(req.clone({
    setHeaders: { Cookie: cookieHeader }
  }));
};

// app.config.server.ts
export const serverConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([authForwardingInterceptor]))
  ]
};`,
        api: 'REQUEST token + HttpInterceptorFn — @angular/core / @angular/common/http',
      },
      {
        title: 'Skip transfer cache for auth-dependent endpoints',
        when: 'You cannot forward cookies but still want SSR for the public parts',
        description: `If forwarding cookies is not possible, exclude personalised endpoints
from the transfer cache entirely. The public data (title, description, images) is SSR'd
and cached. The personalised data (pricing tier, wishlist state) is fetched fresh by the
client after hydration. Split the component: SSR the static shell, defer the personalised parts.`,
        code: `// app.config.ts — exclude personalised endpoints from transfer cache
provideClientHydration(
  withHttpTransferCache({
    filter: (req) => !req.url.includes('/api/user/') && !req.url.includes('personalised=true')
  })
)

// product-detail.html — defer the personalised block entirely
@defer (on immediate; hydrate on immediate) {
  <app-personalised-pricing [slug]="slug" />
  <app-wishlist-button [slug]="slug" />
} @placeholder {
  <div class="price-skeleton"></div>
}`,
        api: 'withHttpTransferCache({ filter }) + @defer — @angular/platform-browser',
      },
    ],
    keyTakeaway: `The SSR server is not the browser. It does not inherit the user's cookies,
localStorage, or any client-side auth state. Every API call from the server runs as an
anonymous client unless you explicitly forward the user's context. This is the single most
common cause of "SSR looks different from CSR" bugs in production — and when combined with
TransferState, it silently locks the wrong data into the client's cache.`,
  },

  // ── CASE STUDY 7 ──────────────────────────────────────────────────────────
  {
    id: 7,
    title: 'Cold Start Destroys First-User LCP',
    subtitle: 'Serverless SSR that looks fast in staging but kills real-user P95 TTFB in production',
    category: 'serverless',
    scenario: `The team deploys Angular SSR to AWS Lambda behind API Gateway. Load tests show
250ms TTFB — well within target. Production Lighthouse scores are 90+. But real-user monitoring
shows P95 TTFB of 3.8 seconds. Support tickets start appearing: "the site takes forever to load
in the morning." Nobody in the team can reproduce it — by the time they open the URL to
investigate, the Lambda is warm. The root cause: Lambda cold starts. Traffic drops to zero at
night. The first user each morning boots the entire Lambda from scratch. With Angular SSR,
that cold start includes: Node.js runtime init + loading the Angular application bundle
(1.8MB) + bootstrapping the DI container + rendering. The first user waits. Everyone
else gets sub-300ms because they hit a warm container.`,
    symptoms: [
      'P95/P99 TTFB in RUM is 3–5x higher than P50 or staging benchmarks',
      'Slow loads cluster at off-peak hours or after traffic gaps (nights, weekends)',
      'First request after deploy is always slow regardless of time of day',
      'Issue disappears after the first request, making it impossible to reproduce in manual testing',
    ],
    rootCause: `Serverless functions scale to zero when idle — no traffic, no running process,
no cost. The price is a cold start: the next request must boot the Node.js runtime, load
all JavaScript modules from disk, and initialise the application before handling the request.
For Angular SSR, the bootstrap cost compounds: a typical production bundle is 1–3MB of
JavaScript that must be parsed, compiled, and executed before a single component can render.
This is invisible in warm-container load tests and staging environments that never go idle.`,
    rootCauseCode: `// What happens on a cold Lambda invocation (invisible in staging):
//
// t=0ms    Request arrives. Lambda container does not exist.
// t=0–300ms  AWS provisions container, starts Node.js runtime
// t=300–700ms  Node.js loads main.server.js (1.8MB bundle — parse + compile)
// t=700–900ms  Angular bootstraps: DI container, platform, root injector
// t=900–1100ms  Component tree renders, TransferState serialises
// t=1100ms+  Network transit to user
//
// User sees blank screen for 1.1s before first byte.
// Warm container: same request = 250ms total.
// P95 TTFB in prod = mostly cold starts.`,
    solutions: [
      {
        title: 'Reduce bundle size to shrink cold start cost',
        when: 'Always — smaller bundle = faster cold start regardless of infrastructure',
        description: `The single biggest lever on cold start time is the size of the JavaScript
bundle that Node.js must parse and compile. Audit your bundle with source-map-explorer or
webpack-bundle-analyzer. Eliminate unused imports, lazy-load heavy libraries, and ensure
your server bundle does not include browser-only code. Every 100KB removed saves roughly
30–50ms of cold start time.`,
        code: `// angular.json — separate server bundle, minimise it
"server": {
  "optimization": true,
  "sourceMap": false,
  "namedChunks": false
}

// Audit what's in your server bundle:
// npx source-map-explorer dist/server/main.js

// Lazy-load heavy server-side dependencies:
// Instead of importing at module level:
// import { marked } from 'marked';  // ❌ always in bundle

// Lazy import inside the function that needs it:
async function renderMarkdown(content: string) {
  const { marked } = await import('marked');  // ✅ only loaded when called
  return marked(content);
}`,
        api: 'source-map-explorer + Angular build optimisation',
      },
      {
        title: 'Migrate high-traffic public routes to edge (near-zero cold starts)',
        when: 'Routes that are public, cacheable, and globally accessed',
        description: `Cloudflare Workers and Vercel Edge Functions use V8 isolates, not full
Node.js containers. Isolates are pre-warmed and shared across requests — cold start time
is under 5ms globally, compared to 300–800ms for Lambda. Angular's WinterCG-compatible
handler (createRequestHandler) deploys to both. Isolates persist between requests on the
same edge node, so your Angular bundle is parsed once and reused.`,
        code: `// server.ts — WinterCG handler for Cloudflare Workers / Vercel Edge
import { createRequestHandler } from '@angular/ssr/node';
import { AppServerModule } from './src/main.server';

// Export the fetch handler — Cloudflare Workers / Vercel Edge pick this up
export default {
  fetch: createRequestHandler({
    bootstrap: AppServerModule,
  })
};

// wrangler.toml (Cloudflare Workers)
// name = "my-angular-app"
// main = "dist/server/server.js"
// compatibility_date = "2024-01-01"
// [build]
// command = "ng build --configuration production"`,
        api: 'createRequestHandler (WinterCG) — @angular/ssr/node',
      },
      {
        title: 'Provisioned concurrency — keep at least one Lambda warm',
        when: 'You must stay on Lambda but cannot tolerate any cold starts',
        description: `AWS Lambda Provisioned Concurrency pre-initialises a set number of
execution environments and keeps them warm. Cold starts become impossible for requests
handled by provisioned instances. The cost: you pay for the provisioned capacity 24/7
whether or not it receives traffic. For Angular SSR, provisioning even 2–5 instances
eliminates cold starts for most traffic patterns at moderate cost.`,
        code: `# AWS CDK — provision 3 warm Lambda instances for the SSR function
const ssrFunction = new lambda.Function(this, 'SsrHandler', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'server.handler',
  code: lambda.Code.fromAsset('dist/server'),
  memorySize: 512,
  timeout: Duration.seconds(10),
});

// Keep 3 instances always warm — no cold starts for up to 3 concurrent requests
const alias = new lambda.Alias(this, 'SsrAlias', {
  aliasName: 'live',
  version: ssrFunction.currentVersion,
  provisionedConcurrentExecutions: 3,
});`,
        api: 'Lambda Provisioned Concurrency — AWS',
      },
    ],
    keyTakeaway: `Serverless does not eliminate latency — it defers it to the first user
after an idle period. For Angular SSR, the cold start penalty is especially high because
bootstrapping Angular adds to the Node.js runtime boot time. Teams that only benchmark
warm containers will never see this problem in staging. Measure real-user P95/P99 TTFB
in production, not lab TTFB. The fix depends on your constraints: bundle size reduction
is always worthwhile, edge runtimes eliminate the problem architecturally, and provisioned
concurrency is the escape hatch when you must stay on Lambda.`,
  },

  // ── CASE STUDY 8 ──────────────────────────────────────────────────────────
  {
    id: 8,
    title: 'Edge Runtime: Node.js Built-In Crashes the Server',
    subtitle: 'Works on Lambda, explodes on Cloudflare Workers — same code, different runtime',
    category: 'edge',
    scenario: `The team migrates Angular SSR from AWS Lambda to Cloudflare Workers to eliminate
cold starts. The WinterCG handler is configured, deployment succeeds, and the first request
crashes with: "ReferenceError: Buffer is not defined". After fixing Buffer, the next crash
is "Error: The 'crypto' module is not compatible with this environment." After patching that,
a third-party analytics service imported in a shared service causes "ReferenceError: process
is not defined". Each fix surfaces a new crash. The root cause is not Angular — it is a
fundamental difference between Node.js and the Web Platform runtime that Cloudflare Workers
runs on. Lambda is Node.js. Cloudflare Workers is a V8 isolate. They are not the same thing.`,
    symptoms: [
      'App works perfectly on Lambda or local Node.js, crashes immediately on Cloudflare Workers/Vercel Edge',
      'ReferenceError: Buffer is not defined / crypto is not defined / process is not defined',
      'Errors originate from deep inside a shared service or a third-party npm package, not your own code',
      'Cannot reproduce in local dev — local dev runs Node.js, not a V8 isolate',
    ],
    rootCause: `Cloudflare Workers, Vercel Edge, and other WinterCG-compatible runtimes run
JavaScript in V8 isolates — the same engine as Node.js, but without the Node.js standard
library. There is no Buffer, no fs, no path, no process, and no Node.js-flavoured crypto
module. What exists instead is the Web Platform API: globalThis.crypto (Web Crypto API),
TextEncoder/TextDecoder (instead of Buffer), fetch (instead of http), and
structuredClone (instead of JSON-based deep copy). Any code — yours or a dependency —
that uses a Node.js built-in will throw at runtime on the edge.`,
    rootCauseCode: `// ❌ These work on Lambda (Node.js), crash on Cloudflare Workers (V8 isolate):
import { createHash } from 'crypto';        // Node.js — does not exist at edge
import { Buffer } from 'buffer';            // Node.js — does not exist at edge
const hash = createHash('sha256').update(data).digest('hex');
const encoded = Buffer.from(data).toString('base64');

// The crash happens at import time — before Angular even bootstraps.
// A shared service deep in the dependency tree does this,
// and it detonates the entire SSR handler on the first request.`,
    solutions: [
      {
        title: 'Replace Node.js built-ins with Web Platform equivalents',
        when: 'Your own code uses Node.js APIs — this is the correct long-term fix',
        description: `The Web Crypto API (globalThis.crypto.subtle) is available in Node.js 18+,
all modern browsers, and all edge runtimes. TextEncoder/TextDecoder replace Buffer for
encoding. fetch replaces http/https. These replacements make your code genuinely portable
across all environments — not just patched for one.`,
        code: `// ✅ Web Platform equivalents — work everywhere: Node.js, browser, edge

// Hashing (replace Node's crypto.createHash)
async function sha256(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Base64 encoding (replace Buffer.from(...).toString('base64'))
function toBase64(data: string): string {
  return btoa(unescape(encodeURIComponent(data)));  // works everywhere
}

// UUID generation (replace uuid npm package or crypto.randomUUID in Node)
const id = globalThis.crypto.randomUUID();  // available in Node 19+, all browsers, edge`,
        api: 'globalThis.crypto.subtle (Web Crypto API) — Web Platform',
      },
      {
        title: 'Isolate Node.js-only code behind platform checks',
        when: 'A shared service needs different implementations per runtime',
        description: `When a clean replacement is not available, use Angular's injection token
system to provide different implementations per platform. A server-side token provides the
Node.js implementation; the edge target provides the Web Platform implementation. The
component and most of the application never know the difference.`,
        code: `// token.ts
export const HASHER = new InjectionToken<(data: string) => Promise<string>>('HASHER');

// node.providers.ts — for Lambda / local dev
export const nodeProviders = [
  { provide: HASHER, useValue: async (data: string) => {
    const { createHash } = await import('crypto');
    return createHash('sha256').update(data).digest('hex');
  }}
];

// edge.providers.ts — for Cloudflare Workers / Vercel Edge
export const edgeProviders = [
  { provide: HASHER, useValue: async (data: string) => {
    const encoded = new TextEncoder().encode(data);
    const buf = await crypto.subtle.digest('SHA-256', encoded);
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }}
];`,
        api: 'InjectionToken + platform-specific providers — @angular/core',
      },
    ],
    keyTakeaway: `"Edge" does not mean "Lambda at the edge." Cloudflare Workers and Vercel
Edge Functions run in V8 isolates — the JavaScript engine without the Node.js runtime layer.
Buffer, crypto (Node's version), fs, path, and process do not exist. The Web Platform
equivalents do. This distinction is architectural: moving from Lambda to edge is a runtime
migration, not just a deployment target change. Audit your server-side code and all
dependencies for Node.js built-in usage before any edge migration. The crash will always
happen on the first production request — never in local dev.`,
  },

  // ── CASE STUDY 9 ──────────────────────────────────────────────────────────
  {
    id: 9,
    title: 'CDN Serves One User\'s HTML to Everyone',
    subtitle: 'A missing Cache-Control header turns an SSR performance win into a data leak',
    category: 'security',
    scenario: `The team adds a CloudFront distribution in front of their Angular SSR deployment
to improve global TTFB. They set Cache-Control: public, s-maxage=300 on all SSR responses
for a 5-minute cache. Performance improves dramatically. Three days later, a user reports
seeing someone else's name, saved addresses, and order history on the product listing page.
The first logged-in user to hit a product page after cache expiry had their rendered HTML —
complete with their name in the header ("Welcome back, Sarah"), their saved addresses, and
their loyalty tier pricing — cached by CloudFront and served to every subsequent visitor
for 5 minutes. This is a data leak caused by a caching misconfiguration, not an Angular bug.`,
    symptoms: [
      'Users occasionally see another user\'s personal information (name, addresses, order history)',
      'Issue is intermittent — only affects users who arrive while cached personalised HTML is being served',
      'Clears on its own after the CDN TTL expires (e.g., every 5 minutes)',
      'First reported by users, not caught by automated tests — tests always hit the server directly',
    ],
    rootCause: `Cache-Control: public, s-maxage=N tells every shared cache (CDN, proxy,
intermediate) to store and serve this response. If the response contains user-specific data,
that data is now public — cached at the CDN edge and served to whoever requests the same
URL next. Angular SSR has no way to know this is wrong: it renders what the component
produces and sends the response. The caching decision is an HTTP header problem, not
an Angular problem. The missing piece is correct cache-key design: personalised responses
must never enter a shared cache.`,
    rootCauseCode: `// ❌ server.ts — applies the same cache headers to ALL routes
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'public, s-maxage=300'); // ← dangerous on auth routes
  next();
});

// CloudFront caches User A's render of /products:
// HTML contains: "Welcome back, Sarah" "Ship to: 14 Oak Street" "Gold tier pricing"
// Cache key: /products (just the URL — no user context)
// Next 300 seconds: every visitor to /products gets Sarah's HTML`,
    solutions: [
      {
        title: 'Apply correct Cache-Control per route type',
        when: 'Always — cache headers must reflect whether the response is user-specific',
        description: `The fundamental rule: if the response is identical for all users, it can
be publicly cached. If it contains any user-specific data, it must be private or not cached
at all. Apply this at the Express middleware level, keyed on the route or on whether the
request carries an auth cookie.`,
        code: `// server.ts — cache headers per route type
app.use((req, res, next) => {
  const isAuthenticated = req.headers.cookie?.includes('auth_token');
  const isPersonalisedRoute = req.path.startsWith('/account')
    || req.path.startsWith('/checkout')
    || req.path.startsWith('/wishlist');

  if (isAuthenticated || isPersonalisedRoute) {
    // User-specific: never cache in a shared cache
    res.setHeader('Cache-Control', 'private, no-store');
  } else {
    // Fully public route: safe to cache at CDN
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
  }

  next();
});`,
        api: 'Cache-Control: private / no-store — HTTP',
      },
      {
        title: 'Use RenderMode.Client for all auth-dependent routes',
        when: 'Routes that always require auth — no SSR benefit anyway',
        description: `If a route only makes sense for logged-in users (account pages, checkout,
wishlist), it should be RenderMode.Client. The server never renders personalised HTML —
it returns the empty Angular shell. The client renders everything after reading auth state.
This eliminates the caching risk entirely because there is no server-rendered personalised
HTML to cache.`,
        code: `// app.routes.server.ts — auth routes are always CSR
export const serverRoutes: ServerRoute[] = [
  // Public — safe to cache at CDN
  { path: '',               renderMode: RenderMode.Server },
  { path: 'products',       renderMode: RenderMode.Server },
  { path: 'products/:slug', renderMode: RenderMode.Server },

  // Auth-dependent — CSR only, no personalised HTML ever generated
  { path: 'account',    renderMode: RenderMode.Client },
  { path: 'checkout',   renderMode: RenderMode.Client },
  { path: 'wishlist',   renderMode: RenderMode.Client },
  { path: 'orders',     renderMode: RenderMode.Client },
];`,
        api: 'RenderMode.Client — @angular/ssr',
      },
    ],
    keyTakeaway: `Cache-Control is not just a performance header — it is an authorisation
boundary. s-maxage tells shared caches (CDN, proxies) to store and serve your response.
If that response contains personalised data, you have published that user's data to the
public. The rule is absolute: any response that varies by user identity must be
Cache-Control: private or no-store. For Angular SSR, the safest default is to apply
RenderMode.Client to every auth-gated route so personalised HTML is never generated
server-side — eliminating the risk entirely rather than mitigating it with headers.`,
  },

  // ── CASE STUDY 10 ──────────────────────────────────────────────────────────
  {
    id: 10,
    title: 'TransferState Bloat Makes SSR Slower Than CSR',
    subtitle: 'The fix for double-fetch creates a 240KB inline JSON problem that hurts LCP more',
    category: 'performance',
    scenario: `A product listing page is SSR'd and withHttpTransferCache() is enabled.
The /api/products endpoint returns a full catalogue — 500 product objects, each with
name, description, variants, pricing tiers, review summary, image URLs, and metadata.
After enabling SSR, Lighthouse scores actually get worse. LCP increases by 400ms compared
to the CSR version. DevTools shows the server response HTML is 310KB. 280KB of that
is a <script type="application/json"> block containing the serialised API response.
The browser receives 310KB before it can render anything. The LCP element (a product
image) is deprioritised while the browser parses the enormous inline JSON payload.
withHttpTransferCache() solved the double-fetch problem and introduced a worse problem.`,
    symptoms: [
      'HTML response size is significantly larger after enabling SSR (300KB+ for a listing page)',
      'LCP is worse with SSR than without it, even though TTFB improved',
      'DevTools Network tab shows a large <script type="application/json"> block in the HTML source',
      'The performance regression correlates exactly with endpoints that return large datasets',
    ],
    rootCause: `withHttpTransferCache() captures every HttpClient response made during SSR
and serialises it as inline JSON in the HTML. This is intentional — the client reads from
the inline cache instead of making a second network request. The problem is that it has no
awareness of payload size. A 500-product API response is serialised in full, inline, in
every page load. The browser must parse this JSON before it finishes processing the HTML.
For large datasets, the serialisation cost (bandwidth + parse time) exceeds the cost of
the second HTTP request that transfer cache was designed to eliminate.`,
    rootCauseCode: `// The HTML that gets sent to the browser:
// <script id="ng-state" type="application/json">
//   {"body":"[{\"id\":1,\"name\":\"iPhone 16 Pro\",\"description\":\"The most...\",
//    \"variants\":[...],\"pricing\":{...},\"reviews\":{...}},
//    {\"id\":2,\"name\":\"MacBook Pro M4\",...},
//    ... 498 more objects ...
//   ]","headers":{}}
// </script>
//
// Size: 280KB of inline JSON
// Browser behaviour: must parse this synchronously before continuing HTML parsing
// LCP element (product image): delayed by 280KB JSON parse`,
    solutions: [
      {
        title: 'Paginate — only SSR the first page of results',
        when: 'Listing pages with large datasets — the most impactful fix',
        description: `The visible viewport shows 12–20 products. SSR and transfer-cache only
those. The remaining 480 products do not need to be in the initial HTML. Paginate your API,
fetch page 1 on the server, render page 1, transfer-cache page 1. Subsequent pages load
client-side on demand. The HTML drops from 310KB to 18KB. LCP improves immediately.`,
        code: `// product-list.ts — only SSR the first page
@Component({ ... })
export class ProductListComponent {
  private http = inject(HttpClient);

  // Only fetch page 1 server-side — 12 items, not 500
  products = resource({
    loader: () => firstValueFrom(
      this.http.get<Product[]>('/api/products?page=1&limit=12')
    )
  });
}

// The transfer cache now serialises 12 objects (~4KB) not 500 (~280KB)
// Subsequent pages are loaded client-side and do NOT go through transfer cache`,
        api: 'resource() + withHttpTransferCache() — @angular/core / @angular/platform-browser',
      },
      {
        title: 'Exclude large endpoints from transfer cache selectively',
        when: 'You need the full dataset server-side but want the client to re-fetch',
        description: `withHttpTransferCache() accepts a filter function. Exclude endpoints
that return large payloads. The page is still SSR'd with the full data (correct HTML,
good SEO, fast first paint of the visible content), but the client re-fetches without
the 280KB inline penalty. The double-fetch cost of one API call is almost always cheaper
than shipping 280KB of inline JSON on every page load.`,
        code: `// app.config.ts — exclude large catalogue endpoints from transfer cache
provideClientHydration(
  withEventReplay(),
  withHttpTransferCache({
    filter: (req: HttpRequest<unknown>) => {
      // Only cache small, targeted requests — exclude full catalogue endpoints
      const largeEndpoints = ['/api/products', '/api/catalogue', '/api/search'];
      return !largeEndpoints.some(ep => req.url.includes(ep));
    }
  })
)`,
        api: 'withHttpTransferCache({ filter }) — @angular/platform-browser',
      },
      {
        title: 'Defer the below-fold content — only transfer-cache what is visible',
        when: 'You want the best of both worlds: SSR hero section + client-loaded grid',
        description: `Use @defer to split the page. The hero section (first 3 featured products,
headline, search bar) is SSR'd and transfer-cached — small payload, immediately visible.
The main product grid is deferred: not SSR'd, not transfer-cached, rendered entirely
client-side after hydration. The HTML stays small, LCP is fast, and the grid loads
progressively below the fold.`,
        code: `<!-- product-list.html — hero SSR'd, grid deferred -->

<!-- SSR'd: 3 featured products, headline — small, fast, LCP content -->
<section class="hero">
  <h1>Today's Top Picks</h1>
  @for (p of featuredProducts(); track p.id) {
    <app-product-card [product]="p" />
  }
</section>

<!-- Deferred: full grid — not SSR'd, not transfer-cached, client-only -->
@defer (on viewport) {
  <app-product-grid />
} @placeholder {
  <div class="grid-skeleton"></div>
}`,
        api: '@defer (on viewport) — Angular template syntax',
      },
    ],
    keyTakeaway: `withHttpTransferCache() solves one problem (double-fetch) and can create
a worse problem (inline JSON bloat) if applied without thought to payload size. The
transfer cache is a performance tool — like all performance tools, it needs to be measured,
not assumed. The rule of thumb: transfer-cache is beneficial for small, targeted responses
(single product, user profile, config). It is harmful for large collections (product
catalogues, search results, feeds). Paginate your SSR data, defer below-fold content,
and always check the HTML response size — not just the TTFB — when evaluating SSR
performance.`,
  },
  {
    id: 11,
    title: 'Signal Store Bleeds Between SSR Requests',
    subtitle: 'Module-level signals are shared state — one user sees another user\'s data',
    category: 'state',
    scenario: `The team migrates the cart and user preference state from a BehaviorSubject-based
service to a signals-based store. They create the signals at module level (outside DI) to
keep the code simple. Everything works in development. In production, users start reporting
that they occasionally see wrong cart counts or the wrong user\'s recently-viewed list — but
only under load and only on server-rendered pages. The bug disappears after a page refresh.`,
    symptoms: [
      'Cart count shows N items for a user who has 0 items',
      'Recently-viewed list shows products the current user never visited',
      'Bug reproduces under concurrent load but not in single-user testing',
      'Hard refresh always shows correct data (browser hydrates from fresh client state)',
      'No Angular error in console — signals are working, just containing wrong values',
    ],
    rootCause: `Signals are plain JavaScript objects. Their lifetime and sharing behaviour
follow normal JavaScript scoping rules — Angular adds no special handling unless the signal
is created inside Angular\'s DI system.

A signal created at module level lives in the Node.js module cache, which is shared
across ALL requests for the lifetime of the process. On a long-running Node.js server
(and across warm Lambda invocations), concurrent or sequential requests mutate the same
signal object. User A\'s cart write is read by User B\'s render.

Angular\'s per-request isolation only covers the root injector scope. Module-level variables
— including module-level signals — are completely outside that isolation boundary.`,
    rootCauseCode: `// cart.store.ts — WRONG
// These signals live in the module cache — shared across ALL SSR requests
export const cartItems = signal<CartItem[]>([]);   // shared heap object
export const cartCount = computed(() => cartItems().reduce((n, i) => n + i.qty, 0));

export function addToCart(item: CartItem) {
  cartItems.update(items => [...items, item]);
  // This mutation is visible to EVERY concurrent SSR request
}`,
    solutions: [
      {
        title: 'Move signals inside an @Injectable({ providedIn: \'root\' }) service',
        when: 'All signal-based stores — this is the only correct pattern for SSR',
        description: `Angular SSR creates a fresh root injector for every incoming request.
Services provided in root scope are instantiated once per injector — meaning once per
request on the server, once per app lifetime in the browser.

By moving signals inside a root-provided service, you get automatic per-request
isolation on the server with zero extra code. The same store class works identically
in both environments.`,
        code: `// cart.store.ts — CORRECT
@Injectable({ providedIn: 'root' })
export class CartStore {
  // These signals are created fresh per SSR request (root injector scope).
  // In the browser they are singletons for the app lifetime — same as before.
  private _items = signal<CartItem[]>([]);

  items  = this._items.asReadonly();
  count  = computed(() => this._items().reduce((n, i) => n + i.qty, 0));
  total  = computed(() => this._items().reduce((s, i) => s + i.price * i.qty, 0));

  add(item: CartItem) {
    this._items.update(items => [...items, item]);
  }

  remove(id: string) {
    this._items.update(items => items.filter(i => i.id !== id));
  }
}

// Component — unchanged, no awareness of SSR needed
@Component({ ... })
export class CartIconComponent {
  private cart = inject(CartStore);
  count = this.cart.count;  // reactive, correct per-request on server
}`,
        api: '@Injectable({ providedIn: \'root\' }) — @angular/core',
      },
      {
        title: 'Audit with isPlatformServer() to catch accidental module-level mutations',
        when: 'During migration of existing signal stores to SSR-safe patterns',
        description: `Add a development-time guard that throws if a module-level signal
is mutated during an SSR request. This catches the pattern early before it reaches production.`,
        code: `// shared/ssr-guard.ts
import { isPlatformServer } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';

export function assertNotSSR(context: string) {
  // Only call this from module-level code to flag accidental SSR execution
  if (typeof process !== 'undefined' && process.env['NODE_ENV'] !== 'production') {
    try {
      const platformId = inject(PLATFORM_ID, { optional: true });
      if (platformId && isPlatformServer(platformId)) {
        console.error(
          \`[SSR SAFETY] "\${context}" mutated module-level state during SSR.\n\` +
          \`Move this state into an @Injectable({ providedIn: 'root' }) service.\`
        );
      }
    } catch { /* not in DI context — fine */ }
  }
}`,
        api: 'isPlatformServer(), PLATFORM_ID — @angular/common, @angular/core',
      },
    ],
    keyTakeaway: `Signals are not automatically SSR-safe — Angular\'s per-request isolation
only applies to the root injector scope. Any signal created at module level is shared across
all concurrent SSR requests, exactly like a module-level variable. The rule is simple: every
signal that holds per-user state must live inside an @Injectable({ providedIn: \'root\' })
class. There are no exceptions.`,
  },

  {
    id: 12,
    title: 'toSignal() Produces Empty Server-Rendered HTML',
    subtitle: 'The SSR serialiser fires before your async data resolves — blank content ships',
    category: 'hydration',
    scenario: `A developer converts an HttpClient-based component from Observables to signals.
They use toSignal() to bridge the HTTP call: toSignal(this.http.get('/api/product/slug')).
The component renders perfectly in the browser. In SSR, the product page consistently
ships empty — no product name, no price, no description. Just the layout shell.
withHttpTransferCache() is enabled, but the HTML sent to the client contains no product data.
After hydration the product appears, producing a visible layout shift.`,
    symptoms: [
      'Server-rendered HTML contains component skeleton but no actual content',
      'Product name, price, description all absent in the HTML source',
      'Visible content flash after hydration as Angular renders actual data',
      'LCP is delayed because the meaningful content is not in the initial HTML',
      'TransferState IS populated — the data transfer worked, the render did not wait',
    ],
    rootCause: `toSignal() is a bridge utility that converts an Observable into a signal.
It does not know about SSR. It does not register with Angular\'s PendingTasks system.

Angular SSR uses PendingTasks to determine when the render is "stable" and the HTML
can be serialised. resource() auto-registers a PendingTask when its loader is in-flight,
and resolves it when the loader completes. toSignal() does neither.

The sequence with toSignal():
  1. SSR starts rendering the component tree
  2. toSignal() subscribes to the Observable and returns the initial value (undefined)
  3. Angular sees no pending tasks registered
  4. Angular immediately serialises HTML — component renders with undefined data
  5. HTTP response arrives (too late — HTML is already serialised and sent)
  6. TransferState has the data, but the server HTML is empty

The sequence with resource():
  1. SSR starts rendering
  2. resource() starts loader(), registers a PendingTask
  3. Angular waits — pending task is open
  4. loader() resolves, signal updates, PendingTask completes
  5. Angular re-renders component with resolved data
  6. HTML serialised with full content`,
    rootCauseCode: `// product-detail.component.ts — BROKEN for SSR
@Component({ ... })
export class ProductDetailComponent {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  // toSignal does NOT tell Angular SSR to wait for this Observable to resolve.
  // SSR serialises HTML before the HTTP call completes.
  product = toSignal(
    this.http.get<Product>(\`/api/products/\${this.route.snapshot.params['slug']}\`)
  );
}`,
    solutions: [
      {
        title: 'Replace toSignal(http.get()) with resource()',
        when: 'Any async data fetch that must be in the server-rendered HTML',
        description: `resource() is the signal-native primitive for async data loading.
It auto-registers with PendingTasks, so Angular SSR automatically waits for it to resolve
before serialising HTML. It also integrates with withHttpTransferCache() — the resolved
value is serialised into TransferState and read by the client without a second fetch.`,
        code: `// product-detail.component.ts — CORRECT
import { resource } from '@angular/core';

@Component({
  template: \`
    @if (product.isLoading()) {
      <app-product-skeleton />
    } @else {
      <h1>{{ product.value()?.name }}</h1>
      <p class="price">{{ product.value()?.price | currency }}</p>
    }
  \`
})
export class ProductDetailComponent {
  private route = inject(ActivatedRoute);
  private http  = inject(HttpClient);

  product = resource({
    // request() is a signal — resource re-runs loader when this changes
    request: () => this.route.snapshot.paramMap.get('slug'),
    loader: ({ request: slug }) =>
      firstValueFrom(this.http.get<Product>(\`/api/products/\${slug}\`))
  });

  // SSR timeline:
  // 1. resource() created -> PendingTask registered
  // 2. loader() executes -> HTTP call in-flight
  // 3. Angular SSR waits (PendingTask is open)
  // 4. HTTP resolves -> product.value() set -> PendingTask complete
  // 5. Component re-renders with data
  // 6. HTML serialised with full product content
  // 7. TransferState populated with product data
  // On client: resource() reads TransferState -> no second HTTP call
}`,
        api: 'resource() — @angular/core',
      },
      {
        title: 'Use PendingTasks manually if you must keep toSignal()',
        when: 'You have a complex Observable pipeline that cannot be easily converted to resource()',
        description: `If refactoring to resource() is not immediately feasible, you can manually
register a PendingTask to hold the SSR render open until your Observable emits.
This is more verbose but gives you the same stability guarantee.`,
        code: `import { PendingTasks } from '@angular/core';

@Component({ ... })
export class ProductDetailComponent implements OnInit, OnDestroy {
  private pendingTasks = inject(PendingTasks);
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  product = signal<Product | undefined>(undefined);
  private cleanup: (() => void) | null = null;

  ngOnInit() {
    // Manually hold SSR open until the HTTP call resolves
    const done = this.pendingTasks.add();
    this.cleanup = done;

    this.http.get<Product>(\`/api/products/\${this.route.snapshot.params['slug']}\`)
      .pipe(take(1))
      .subscribe({
        next: (p) => { this.product.set(p); done(); },
        error: ()  => { done(); }
      });
  }

  ngOnDestroy() {
    this.cleanup?.();  // release if component is destroyed before HTTP resolves
  }
}`,
        api: 'PendingTasks.add() — @angular/core',
      },
    ],
    keyTakeaway: `toSignal() is an Observable bridge, not an SSR primitive. It has no
awareness of PendingTasks and will not cause Angular SSR to wait for its source to emit.
For any data that must appear in server-rendered HTML, use resource() — it is the only
signal API that auto-registers with the SSR stability system. Think of it this way:
resource() promises Angular "I am loading something, wait for me." toSignal() makes no
such promise.`,
  },

  {
    id: 13,
    title: 'Expensive computed() Exhausts Edge Runtime CPU Budget',
    subtitle: 'Lazy in the browser, eager on the server — every SSR request pays the full cost',
    category: 'performance',
    scenario: `A product listing component uses a computed signal to filter, sort, and
group 800 products by category, rating, and availability. In the browser, the computed
is lazy — it only runs when the template reads it, and subsequent reads are memoised.
Performance is fine. After deploying to Cloudflare Workers (edge SSR), the team sees
random 500 errors on the product listing route. Checking worker logs shows: "Worker
exceeded CPU time limit." The errors happen only on that one route, only under SSR,
and only on edge — the same deployment on Lambda works fine.`,
    symptoms: [
      'HTTP 500 on product listing route in edge SSR, works on Lambda and in browser',
      'Cloudflare Worker logs: "Worker exceeded CPU time limit (50ms)"',
      'Error is consistent — not random — it is every SSR render of that component',
      'wrangler tail shows CPU time 48–65ms on the affected route, 3–8ms on others',
      'Reducing the product dataset to 100 items makes the error disappear',
    ],
    rootCause: `computed() in Angular is lazy and memoised in the browser. It re-runs only
when its reactive dependencies change. A computed over 800 products runs once on mount
and is then cached until the product signal changes — which in a read-only listing rarely
happens. The browser CPU cost is negligible.

During SSR, Angular renders the entire component tree in a single synchronous pass.
Every template expression — including every reference to a computed signal — is read
during this pass. "Lazy" computeds become effectively eager: they run on every SSR render
because the template always reads them, and there is no prior render to memoised from.

On edge runtimes (Cloudflare Workers), there is a hard 50ms CPU time limit per request.
Unlike Node.js or Lambda where CPU limits are soft (you just get slow), edge hard-kills
the request and returns a 500. The same computation that takes 80ms CPU on 800 products
is fatal on edge but merely slow on Lambda.`,
    rootCauseCode: `// product-list.component.ts
@Component({
  template: \`
    @for (group of groupedProducts(); track group.category) {
      <h2>{{ group.category }}</h2>
      @for (p of group.products; track p.id) {
        <app-product-card [product]="p" />
      }
    }
  \`
})
export class ProductListComponent {
  allProducts = input<Product[]>();

  // In browser: lazy, memoised — runs once, cached until allProducts changes
  // In SSR: runs on EVERY request because the template reads it during render
  // Over 800 products: filter + sort + groupBy = ~60–80ms CPU
  groupedProducts = computed(() =>
    this.allProducts()
      .filter(p => p.inStock && p.rating >= 3.5)
      .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
      .reduce((groups, p) => {
        const key = p.category;
        const g = groups.find(g => g.category === key);
        g ? g.products.push(p) : groups.push({ category: key, products: [p] });
        return groups;
      }, [] as { category: string; products: Product[] }[])
  );
}`,
    solutions: [
      {
        title: 'Move computation to the API — return pre-grouped data from the server',
        when: 'The grouping/sorting logic is stable and can be owned by the data layer',
        description: `The most effective fix: move the expensive transformation to the API
server where CPU is unlimited and the result is cacheable. The Angular component receives
pre-grouped data and does no computation — SSR render time drops to the template render
cost only (~5ms). The API can cache the grouped result with a short TTL.`,
        code: `// product.service.ts
@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);

  // API returns pre-grouped, pre-sorted data
  getGrouped(): Observable<ProductGroup[]> {
    return this.http.get<ProductGroup[]>('/api/products/grouped');
  }
}

// product-list.component.ts — no computation in the component
@Component({ ... })
export class ProductListComponent {
  groups = resource({
    loader: () => firstValueFrom(inject(ProductService).getGrouped())
    // resource() auto-registers with PendingTasks — SSR waits for this
    // TransferState serialises the result — browser reads it without re-fetching
  });
}`,
        api: 'resource() — @angular/core',
      },
      {
        title: 'Use @defer to push the expensive component out of the SSR render path',
        when: 'The grouped listing is below the fold — it does not affect LCP',
        description: `If the product grid is not the Largest Contentful Paint element (i.e.
there is a hero section above it), wrapping it in @defer means Angular SSR does not render
it at all. The SSR HTML contains only the hero section — fast, cheap to render. The grid
loads client-side after hydration via the viewport trigger, below the fold.

This is the correct trade-off when the grid is not LCP content: the SSR HTML stays small
and fast, and the progressive load of the grid is not perceptible to the user.`,
        code: `<!-- product-list.component.html -->

<!-- Hero section: SSR'd — small, fast, IS the LCP element -->
<section class="hero">
  <h1>{{ pageTitle() }}</h1>
  <app-featured-products [products]="featured()" />
</section>

<!-- Product grid: deferred — NOT SSR'd, loaded client-side on viewport enter -->
@defer (on viewport) {
  <!-- expensive groupedProducts computed only runs in the browser, not in SSR -->
  @for (group of groupedProducts(); track group.category) {
    <section class="category-group">
      <h2>{{ group.category }}</h2>
      @for (p of group.products; track p.id) {
        <app-product-card [product]="p" />
      }
    </section>
  }
} @placeholder {
  <div class="grid-skeleton" aria-hidden="true"></div>
}`,
        api: '@defer (on viewport) — Angular template syntax',
      },
      {
        title: 'Limit SSR dataset size — paginate or slice before rendering',
        when: 'You need some products in the SSR HTML but not all 800',
        description: `SSR only needs to render enough content to populate LCP and above-the-fold
content. Slice the input to the first page (12–24 items) for SSR and load the rest
client-side. The computed runs over 24 items instead of 800 — CPU time drops from ~70ms
to ~2ms.`,
        code: `@Component({ ... })
export class ProductListComponent {
  allProducts = input<Product[]>();

  private isServer = isPlatformServer(inject(PLATFORM_ID));

  // SSR renders the first 24 only — fast, fits above the fold
  // Browser computes over all products — lazy, memoised, no limit needed
  private renderProducts = computed(() =>
    this.isServer ? this.allProducts().slice(0, 24) : this.allProducts()
  );

  groupedProducts = computed(() =>
    this.renderProducts()
      .filter(p => p.inStock && p.rating >= 3.5)
      .sort((a, b) => b.rating - a.rating)
      .reduce(/* groupBy */)
  );
}`,
        api: 'isPlatformServer(), PLATFORM_ID — @angular/common, @angular/core',
      },
    ],
    keyTakeaway: `computed() is lazy and memoised in the browser but effectively eager in SSR —
it runs on every server render because the template always reads it during the single render
pass. On edge runtimes with a 50ms CPU hard limit, an expensive computed is not just slow —
it is fatal. The fix hierarchy: (1) move computation to the API layer so the component
receives pre-processed data, (2) use @defer to exclude below-fold components from SSR
entirely, (3) limit dataset size for the SSR render path. Never assume browser performance
characteristics translate directly to SSR performance.`,
  },
  {
    id: 14,
    title: 'WebSocket & Streaming Break withHttpTransferCache()',
    subtitle: 'Persistent connections have no response to cache — SSR needs a different pattern',
    category: 'state',
    scenario: `A product detail page shows a live price ticker via WebSocket and a
stock-level indicator via SSE (Server-Sent Events). The team adds withHttpTransferCache()
expecting it to prevent double-fetching across the SSR boundary, the same way it works for
REST calls. On the server the component renders with no price data at all — the ticker
placeholder shows a dash. After hydration the WebSocket connects and prices appear.
Meanwhile the SSE stream opens a second time on the client even though the server already
had the initial stock level. The HTML is empty where data should be, and there is a visible
flash on every page load.`,
    symptoms: [
      'Price ticker renders as placeholder dash in server HTML, real value only after hydration',
      'Stock level indicator flashes from empty to a number after page load',
      'withHttpTransferCache() is enabled but has no effect on these components',
      'Network tab shows WebSocket connecting twice on cold load',
      'SSE EventSource opens client-side even though server already received the first event',
    ],
    rootCause: `withHttpTransferCache() works exclusively with Angular HttpClient (HTTP
request/response pairs). It caches a complete HTTP response keyed on URL + params and
replays it on the client so the HTTP call is not repeated.

WebSocket and SSE are persistent connections, not request/response pairs. They have no
complete response to cache. withHttpTransferCache() is completely unaware of them and
cannot help.

The real problem is architectural: the component tries to open a live connection during
SSR, which either fails silently (WebSocket cannot connect in the Node.js SSR context
without extra setup) or connects but the first value arrives after Angular has already
serialised the HTML. The client then opens a second connection because it has no knowledge
that the server already received data.

The correct pattern: SSR fetches a REST snapshot of the current state (cacheable,
TransferState-compatible), serialises it into the HTML, and the browser hydrates from
that snapshot before opening the live connection.`,
    rootCauseCode: `// price-ticker.component.ts — BROKEN
@Component({ ... })
export class PriceTickerComponent implements OnInit {
  price = signal<number | null>(null);

  ngOnInit() {
    // WebSocket in SSR context: either fails silently or connects too late
    // withHttpTransferCache() has zero awareness of this connection
    const ws = new WebSocket('wss://prices.api/stream');
    ws.onmessage = (e) => this.price.set(JSON.parse(e.data).price);
    // SSR serialises HTML before any message arrives -> price is null in HTML
    // Client opens a SECOND WebSocket because it re-runs ngOnInit
  }
}`,
    solutions: [
      {
        title: 'REST snapshot for SSR + live connection only in the browser',
        when: 'The component needs a real value in the server-rendered HTML and live updates after hydration',
        description: `Split the data strategy by platform. On the server, use HttpClient to
fetch a REST snapshot of the current value — this is a normal request/response pair that
withHttpTransferCache() can cache and transfer. On the client, read from TransferState
first (via resource()), then open the WebSocket for live updates. The user sees a real
value immediately on page load, then it updates live without any flash.`,
        code: `import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { resource } from '@angular/core';

@Component({
  template: \`
    <span class="price">
      {{ livePrice() ?? snapshot.value()?.price | currency }}
    </span>
  \`
})
export class PriceTickerComponent implements OnInit, OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  // resource() fetches the REST snapshot on the server.
  // withHttpTransferCache() transfers the result — no second HTTP call on client.
  // SSR waits for this before serialising HTML (resource() registers PendingTask).
  snapshot = resource({
    request: () => this.route.snapshot.paramMap.get('productId'),
    loader: ({ request: id }) =>
      firstValueFrom(this.http.get<{ price: number }>(\`/api/products/\${id}/price\`))
  });

  // Live signal updated by WebSocket — browser only
  livePrice = signal<number | null>(null);
  private ws: WebSocket | null = null;

  ngOnInit() {
    // WebSocket only in the browser — never on the server
    if (isPlatformBrowser(this.platformId)) {
      const id = this.route.snapshot.paramMap.get('productId');
      this.ws = new WebSocket(\`wss://prices.api/stream/\${id}\`);
      this.ws.onmessage = (e) => this.livePrice.set(JSON.parse(e.data).price);
    }
  }

  ngOnDestroy() {
    this.ws?.close();
  }
}`,
        api: 'resource(), isPlatformBrowser() — @angular/core, @angular/common',
      },
      {
        title: 'Manual TransferState for SSE initial event',
        when: 'SSE streams where the first event is the critical value for LCP',
        description: `For Server-Sent Events, the server can receive the first event and
manually write it to TransferState. The client reads TransferState before opening its
own EventSource, so the initial value is always present in the rendered HTML and the
client picks up from where the server left off rather than starting from empty.`,
        code: `import { TransferState, makeStateKey, isPlatformServer } from '@angular/core';

const STOCK_KEY = makeStateKey<number>('stock-level');

@Injectable({ providedIn: 'root' })
export class StockService {
  private ts = inject(TransferState);
  private platformId = inject(PLATFORM_ID);
  private pendingTasks = inject(PendingTasks);

  getStockLevel(productId: string): Observable<number> {
    if (isPlatformServer(this.platformId)) {
      // On server: fetch REST snapshot and store in TransferState
      const done = this.pendingTasks.add();
      return inject(HttpClient)
        .get<{ stock: number }>(\`/api/products/\${productId}/stock\`)
        .pipe(
          tap(({ stock }) => this.ts.set(STOCK_KEY, stock)),
          map(({ stock }) => stock),
          finalize(() => done())
        );
    }

    // On client: read from TransferState first, then open SSE for live updates
    const cached = this.ts.get(STOCK_KEY, -1);
    this.ts.remove(STOCK_KEY);

    return new Observable(observer => {
      if (cached !== -1) observer.next(cached);  // immediate from TransferState

      const es = new EventSource(\`/api/products/\${productId}/stock-stream\`);
      es.onmessage = (e) => observer.next(JSON.parse(e.data).stock);
      es.onerror   = (e) => observer.error(e);
      return () => es.close();
    });
  }
}`,
        api: 'TransferState, makeStateKey, PendingTasks — @angular/core',
      },
    ],
    keyTakeaway: `withHttpTransferCache() is an HTTP-only optimisation — it has no awareness
of WebSocket, SSE, or any persistent connection. The SSR-safe pattern for live data is
always a two-step approach: a REST snapshot fetched via HttpClient gives you a cacheable,
TransferState-compatible initial value for the server HTML, and the live connection opens
only in the browser after hydration. Never open a WebSocket or EventSource during SSR — it
either fails silently or connects too late to contribute to the rendered HTML.`,
  },
];