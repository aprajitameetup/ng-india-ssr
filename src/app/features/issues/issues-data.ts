export interface Issue {
  id: number;
  title: string;
  category: 'hydration' | 'browser-api' | 'stability' | 'performance' | 'routing' | 'state';
  problem: {
    description: string;
    code?: string;
  };
  fix: {
    description: string;
    code?: string;
    api: string;
  };
}

export const CATEGORIES: Record<string, { label: string; color: string }> = {
  hydration:   { label: 'Hydration',    color: '#8b5cf6' },
  'browser-api': { label: 'Browser API',  color: '#f59e0b' },
  stability:   { label: 'Stability',    color: '#ef4444' },
  performance: { label: 'Performance',  color: '#3b82f6' },
  routing:     { label: 'Routing',      color: '#10b981' },
  state:       { label: 'State',        color: '#6366f1' },
};

export const SSR_ISSUES: Issue[] = [
  {
    id: 1,
    title: 'Hydration Mismatch — NG0500',
    category: 'hydration',
    problem: {
      description: 'Server renders different HTML than the client. Angular cannot reconcile the DOM trees and throws NG0500. Common causes: Date.now(), Math.random(), user-agent sniffing, or CSR-only conditionals.',
      code: `// ❌ Non-deterministic — different on server vs client
@Component({
  template: \`<p>{{ greeting }}</p>\`
})
export class GreetingComponent {
  greeting = Math.random() > 0.5
    ? 'Good morning!'
    : 'Good evening!';
}`,
    },
    fix: {
      description: 'Make rendering deterministic. Both server and client must produce identical HTML. If a component truly cannot be SSR\'d (e.g. a canvas widget), opt it out with ngSkipHydration.',
      code: `// ✅ Option A — deterministic logic
export class GreetingComponent {
  greeting = 'Welcome!'; // same on server and client
}

// ✅ Option B — skip hydration for non-deterministic component
@Component({ selector: 'app-chart' })
export class ChartComponent {}

// In parent template:
// <app-chart ngSkipHydration />`,
      api: 'ngSkipHydration attribute',
    },
  },
  {
    id: 2,
    title: 'HTTP Request Fires Twice',
    category: 'state',
    problem: {
      description: 'The same GET request is made once during SSR (to fetch data for rendering) and again on the client after hydration. The data is fetched, discarded, and re-fetched — doubling network cost and causing a loading flash.',
      code: `// ❌ No TransferState — fetches twice
@Component({})
export class ProductComponent implements OnInit {
  product$ = this.http.get<Product>('/api/product/1');
  constructor(private http: HttpClient) {}
}`,
    },
    fix: {
      description: 'Use withHttpTransferCache() to automatically serialise HTTP GET responses into the ng-state JSON block during SSR. The client reads from that cache on first load — zero duplicate requests.',
      code: `// ✅ app.config.ts
provideClientHydration(
  withHttpTransferCache()
)

// That's it — HttpClient responses are cached
// automatically. No component changes needed.

// ✅ Manual alternative with makeStateKey
const KEY = makeStateKey<Product>('product-1');

ngOnInit() {
  if (this.transferState.hasKey(KEY)) {
    this.product = this.transferState.get(KEY, null);
    this.transferState.remove(KEY);
    return;
  }
  this.http.get<Product>('/api/product/1').pipe(
    tap(p => this.transferState.set(KEY, p))
  ).subscribe(p => this.product = p);
}`,
      api: 'withHttpTransferCache(), makeStateKey<T>()',
    },
  },
  {
    id: 3,
    title: 'localStorage / sessionStorage Crash on Server',
    category: 'browser-api',
    problem: {
      description: 'localStorage and sessionStorage are browser-only APIs. Accessing them in a service constructor or ngOnInit crashes the Node.js SSR process with "localStorage is not defined".',
      code: `// ❌ Crashes on server
@Injectable({ providedIn: 'root' })
export class CartService {
  private items = JSON.parse(
    localStorage.getItem('cart') || '[]'
  );
}`,
    },
    fix: {
      description: 'Inject PLATFORM_ID and guard every browser API access with isPlatformBrowser(). The service instantiates safely on both platforms.',
      code: `// ✅ Platform-guarded
@Injectable({ providedIn: 'root' })
export class CartService {
  private platformId = inject(PLATFORM_ID);

  private items = signal<CartItem[]>(
    this.loadFromStorage()
  );

  private loadFromStorage(): CartItem[] {
    if (!isPlatformBrowser(this.platformId)) {
      return []; // server: return empty, no crash
    }
    return JSON.parse(
      localStorage.getItem('cart') || '[]'
    );
  }
}`,
      api: 'inject(PLATFORM_ID), isPlatformBrowser()',
    },
  },
  {
    id: 4,
    title: 'window / document is Undefined',
    category: 'browser-api',
    problem: {
      description: 'window and document do not exist in Node.js. Accessing them directly in component code (e.g. for scroll position, viewport size, or DOM queries) throws a ReferenceError during SSR.',
      code: `// ❌ Crashes on server
@Component({})
export class ScrollComponent implements OnInit {
  ngOnInit() {
    window.scrollTo(0, 0);           // ReferenceError
    const w = document.body.clientWidth; // ReferenceError
  }
}`,
    },
    fix: {
      description: 'Use Angular\'s DOCUMENT injection token instead of the global. For window, use isPlatformBrowser() guard. Both approaches work safely on server and client.',
      code: `// ✅ Use DOCUMENT token + platform guard
@Component({})
export class ScrollComponent implements OnInit {
  private doc = inject(DOCUMENT);
  private platformId = inject(PLATFORM_ID);

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    this.doc.defaultView?.scrollTo(0, 0); // safe window
    const w = this.doc.body.clientWidth;  // safe document
  }
}`,
      api: 'inject(DOCUMENT), isPlatformBrowser()',
    },
  },
  {
    id: 5,
    title: 'SSR Hangs — Never Sends Response',
    category: 'stability',
    problem: {
      description: 'Angular SSR waits for the app to "stabilise" (Zone.js onStable) before serialising HTML. An open setTimeout, an interval, or an unresolved Observable keeps the zone unstable indefinitely — the request times out.',
      code: `// ❌ Keeps SSR alive forever
@Component({})
export class BannerComponent implements OnInit {
  ngOnInit() {
    // This interval runs forever — SSR never stabilises
    setInterval(() => {
      this.tick++;
    }, 1000);
  }
}`,
    },
    fix: {
      description: 'Run timers and non-rendering work outside Angular\'s zone. NgZone.runOutsideAngular() prevents those callbacks from being tracked, so the zone can reach stability.',
      code: `// ✅ Run timer outside Angular zone
@Component({})
export class BannerComponent implements OnInit {
  private ngZone = inject(NgZone);

  ngOnInit() {
    this.ngZone.runOutsideAngular(() => {
      setInterval(() => {
        // UI update: bring back inside zone
        this.ngZone.run(() => this.tick++);
      }, 1000);
    });
  }
}`,
      api: 'NgZone.runOutsideAngular()',
    },
  },
  {
    id: 6,
    title: 'SSR Hangs in Zoneless App',
    category: 'stability',
    problem: {
      description: 'In a zoneless app (provideExperimentalZonelessChangeDetection()), there is no Zone.js to track async work. Angular has no signal for when rendering is complete — SSR either times out or returns an empty shell.',
      code: `// ❌ Zoneless — Angular doesn't know when this resolves
@Component({})
export class ProductComponent implements OnInit {
  product = signal<Product | null>(null);

  async ngOnInit() {
    // SSR doesn't wait for this — renders before data arrives
    this.product.set(await this.api.getProduct());
  }
}`,
    },
    fix: {
      description: 'Wrap async work in PendingTasks.run(). This is the only stability mechanism in zoneless apps. HttpClient registers tasks automatically — manual tasks only needed for custom async.',
      code: `// ✅ PendingTasks tells SSR to wait
@Component({})
export class ProductComponent implements OnInit {
  private pendingTasks = inject(PendingTasks);
  product = signal<Product | null>(null);

  ngOnInit() {
    this.pendingTasks.run(async () => {
      this.product.set(await this.api.getProduct());
    });
    // SSR waits for the promise to resolve
    // before serialising HTML
  }
}`,
      api: 'inject(PendingTasks).run()',
    },
  },
  {
    id: 7,
    title: 'Clicks Lost Before Hydration',
    category: 'hydration',
    problem: {
      description: 'SSR delivers HTML instantly but Angular takes time to bootstrap and hydrate. If a user clicks "Add to Cart" during that gap, the click fires on a non-functional DOM element and is silently lost.',
      code: `// ❌ Without withEventReplay()
// User clicks button at t=0ms
// Angular hydrates at t=800ms
// Click is lost — no handler was attached yet

// app.config.ts
provideClientHydration()
// ^ withEventReplay() not included`,
    },
    fix: {
      description: 'Add withEventReplay() to provideClientHydration(). Angular inserts a lightweight capture script that queues events fired before hydration and replays them once the component tree is live.',
      code: `// ✅ app.config.ts
provideClientHydration(
  withEventReplay()
)

// Angular adds jsaction="click:..." attributes
// to interactive elements in the SSR HTML.
// Pre-hydration clicks are captured and queued.
// Replayed automatically after hydration.`,
      api: 'withEventReplay()',
    },
  },
  {
    id: 8,
    title: 'Heavy Components Block TTFB',
    category: 'performance',
    problem: {
      description: 'Every component in the tree renders synchronously during SSR. A slow data fetch or CPU-heavy component (e.g. a recommendations engine) delays the entire response — TTFB spikes for all users.',
      code: `// ❌ Recommendations blocks entire SSR response
@Component({
  template: \`
    <app-product-detail />
    <app-recommendations />  <!-- slow: 400ms DB query -->
    <app-comments />         <!-- slow: another DB query -->
  \`
})`,
    },
    fix: {
      description: 'Wrap non-critical components in @defer with incremental hydration triggers. During SSR, @defer renders the content (not placeholder) — but the hydration is deferred client-side, reducing JS parse cost.',
      code: `// ✅ app.config.ts
provideClientHydration(
  withIncrementalHydration()
)

// ✅ In template
<app-product-detail />

@defer (on idle; hydrate on idle) {
  <app-recommendations />
}

@defer (on viewport; hydrate on viewport) {
  <app-comments />
}`,
      api: 'withIncrementalHydration(), @defer hydrate on idle/viewport/interaction',
    },
  },
  {
    id: 9,
    title: 'Third-Party Library Crashes on Server',
    category: 'browser-api',
    problem: {
      description: 'Libraries like chart.js, Google Maps, or Swiper access window or document in their constructors or module-level code. Importing them in a component that SSR renders causes an immediate crash.',
      code: `// ❌ chart.js accesses window on import
import { Chart } from 'chart.js';

@Component({})
export class ChartComponent implements OnInit {
  ngOnInit() {
    new Chart(this.canvas, config); // crashes on server
  }
}`,
    },
    fix: {
      description: 'Dynamically import the library inside a platform browser guard so it never loads on the server. Alternatively, mark the host component with ngSkipHydration to exclude it from SSR entirely.',
      code: `// ✅ Dynamic import — browser only
@Component({})
export class ChartComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);

  async ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    const { Chart } = await import('chart.js');
    new Chart(this.canvas, config);
  }
}

// ✅ Or skip hydration on host
// <app-chart ngSkipHydration />`,
      api: 'isPlatformBrowser() + dynamic import()',
    },
  },
  {
    id: 10,
    title: 'Memory Leak Across SSR Requests',
    category: 'stability',
    problem: {
      description: 'Developers assume services are singletons across all requests (like in CSR). In SSR, the Platform Injector is shared but the Root Environment Injector is created fresh per request. Holding state in a platform-level provider leaks data between user requests.',
      code: `// ❌ Assumes single instance — leaks between requests
@Injectable({ providedIn: 'platform' })
export class UserContextService {
  currentUser = signal<User | null>(null);
  // Platform-level = shared across ALL requests
  // User A's data bleeds into User B's response
}`,
    },
    fix: {
      description: 'Provide request-scoped services at root (providedIn: root) not platform. Root injector is created fresh per SSR request — each user gets an isolated instance.',
      code: `// ✅ Root-scoped = fresh per SSR request
@Injectable({ providedIn: 'root' })
export class UserContextService {
  currentUser = signal<User | null>(null);
  // New instance per request — no cross-user leakage
}

// Injector hierarchy:
// Platform Injector  ← shared across requests
//   └─ Root Injector ← NEW per request ✅
//        └─ Component Injectors`,
      api: 'providedIn: "root" (not "platform")',
    },
  },
  {
    id: 11,
    title: 'CLS from Loading State Flash on Hydration',
    category: 'performance',
    problem: {
      description: 'resource() or HttpClient fetches data during SSR and renders it into HTML. On the client, the resource starts fresh with isLoading() = true, briefly showing skeleton UI before the re-fetch completes — causing a visible layout shift.',
      code: `// ❌ resource() shows skeleton on client
// even though SSR already rendered the data
export class HomeComponent {
  products = resource({
    loader: () => fetch('/api/products')
  });
  // isLoading() = true on client init → skeleton flash → CLS
}`,
    },
    fix: {
      description: 'Enable withHttpTransferCache(). Server-side HTTP responses are embedded in ng-state JSON. resource() using HttpClient reads from that cache instantly — isLoading() never goes true on client for cached responses.',
      code: `// ✅ app.config.ts
provideClientHydration(
  withEventReplay(),
  withIncrementalHydration(),
  withHttpTransferCache()  // ← prevents skeleton flash
)

// resource() using HttpClient now reads from
// ng-state cache on first client render.
// isLoading() stays false. No layout shift.`,
      api: 'withHttpTransferCache()',
    },
  },
  {
    id: 12,
    title: 'Wrong RenderMode for Route',
    category: 'routing',
    problem: {
      description: 'All routes default to RenderMode.Prerender. A cart or dashboard page gets pre-rendered as a static file — serving stale or empty user-specific content. Or a stable marketing page gets SSR\'d on every request — wasting server CPU.',
      code: `// ❌ One size fits all — wrong for every route
export const serverRoutes: ServerRoute[] = [
  { path: '**', renderMode: RenderMode.Prerender }
  // Cart page pre-rendered as empty shell ❌
  // Product detail re-SSR'd on every hit ❌
  // Home SSR'd when it could be prerendered ❌
]`,
    },
    fix: {
      description: 'Assign RenderMode per route based on content type. Static = Prerender. Dynamic/personalised = Server. User-specific = Client. Each route gets exactly the right strategy.',
      code: `// ✅ app.routes.server.ts
export const serverRoutes: ServerRoute[] = [
  { path: '',              renderMode: RenderMode.Server },
  { path: 'products/:slug',renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return slugs.map(s => ({ slug: s }));
    }
  },
  { path: 'category/:name',renderMode: RenderMode.Server },
  { path: 'cart',          renderMode: RenderMode.Client },
  { path: '**',            renderMode: RenderMode.Server },
];`,
      api: 'RenderMode.Server / Prerender / Client, getPrerenderParams()',
    },
  },
  {
    id: 13,
    title: '@defer Shows Placeholder in SSR Output',
    category: 'hydration',
    problem: {
      description: 'Developers expect @defer to show the @placeholder block during SSR and are confused when the actual component content appears in the page source instead. They add platform guards thinking something is broken.',
      code: `// ❌ Wrong mental model
@defer (on viewport) {
  <app-reviews />       ← "This won't render on server"
} @placeholder {
  <p>Loading reviews…</p>  ← "This is what SSR shows"
}

// Reality: app-reviews DOES render during SSR.
// The placeholder is client-side only (before trigger).`,
    },
    fix: {
      description: 'This is correct behaviour — no fix needed. @defer renders content during SSR for SEO and LCP. The placeholder only appears client-side while waiting for the trigger condition. Use hydrate on X to control when the component activates on the client.',
      code: `// ✅ Correct understanding
@defer (on viewport; hydrate on viewport) {
  <app-reviews />
  // SSR: renders full content ✅ (good for SEO)
  // Client before scroll: HTML exists, dehydrated
  // Client after scroll: hydrates and becomes interactive
} @placeholder {
  <p>Loading…</p>
  // Only shown client-side if content hasn't loaded yet
}`,
      api: '@defer (hydrate on viewport/idle/interaction/never)',
    },
  },
  {
    id: 14,
    title: 'getPrerenderParams() Returns Nothing',
    category: 'routing',
    problem: {
      description: 'A dynamic route like /products/:slug is set to RenderMode.Prerender but no getPrerenderParams() is provided. Angular cannot enumerate the slugs at build time — generates zero static files. Requests hit the server and are SSR\'d dynamically instead.',
      code: `// ❌ Missing getPrerenderParams
export const serverRoutes: ServerRoute[] = [
  {
    path: 'products/:slug',
    renderMode: RenderMode.Prerender,
    // No getPrerenderParams — Angular generates nothing
    // Falls back to RenderMode.Server silently
  }
]`,
    },
    fix: {
      description: 'Implement getPrerenderParams() to return all param combinations. It runs once at build time inside Angular\'s DI context — inject() works here, so you can use HttpClient to fetch slugs from an API.',
      code: `// ✅ app.routes.server.ts
{
  path: 'products/:slug',
  renderMode: RenderMode.Prerender,
  async getPrerenderParams() {
    const http = inject(HttpClient);
    const res = await firstValueFrom(
      http.get<{ slugs: string[] }>('/api/slugs')
    );
    return res.slugs.map(slug => ({ slug }));
    // Returns: [{slug:'iphone'},{slug:'macbook'},...]
    // Angular generates one HTML file per slug ✅
  }
}`,
      api: 'getPrerenderParams(), inject(HttpClient)',
    },
  },
];
