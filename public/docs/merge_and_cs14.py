import re

# ── 1. MERGE CHAPTERS 13 + 15 ────────────────────────────────────────────────
with open('C:/Users/aprajita/Documents/repo/shoppulse/public/docs/architect-deep-dive.md', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find exact line indices (0-based)
ch13_start = next(i for i, l in enumerate(lines) if l.startswith('# Chapter 13:'))
ch14_start = next(i for i, l in enumerate(lines) if l.startswith('# Chapter 14:'))
ch15_start = next(i for i, l in enumerate(lines) if l.startswith('# Chapter 15:'))

# Build the merged chapter 13:
# - heading from ch15 but renumbered to 13
# - body from ch15 (everything after the heading line)
ch15_body = lines[ch15_start+1:]  # skip the "# Chapter 15: ..." heading line

merged_heading = '# Chapter 13: Server Runtime Comparison — Deep Architecture for Angular SSR\n'

new_lines = (
    lines[:ch13_start]           # everything before old ch13
    + [merged_heading]
    + ch15_body                  # full deep-dive body (no trailing ch15 heading)
)

# Re-insert chapter 14 right after the deep-dive ends
# ch14 content is lines[ch14_start:ch15_start]
# We need to splice it back before the ch15 body ends... actually:
# new_lines is: pre-ch13 + new-ch13-heading + ch15-body
# ch14 content (SEO) was between ch14_start and ch15_start — it is now lost.
# Fix: insert ch14 content between old ch13 end and ch15 start.

new_lines = (
    lines[:ch13_start]           # pre-ch13
    + [merged_heading]           # new ch13 heading
    + lines[ch15_start+1:]       # ch15 body (deep dive)
)

# Re-add chapter 14 SEO between ch13 and ch15 (now ch13 ends at ch14_start boundary)
# Actually we want order: [pre-ch13] [ch13=deep-dive] [ch14=SEO]
# ch14 content = lines[ch14_start : ch15_start]

new_lines = (
    lines[:ch13_start]                 # all content before old ch13
    + [merged_heading]                 # chapter 13 heading (deep dive)
    + lines[ch15_start+1:]             # chapter 15 body
    + lines[ch14_start:ch15_start]     # chapter 14 SEO appended at end
)

with open('C:/Users/aprajita/Documents/repo/shoppulse/public/docs/architect-deep-dive.md', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

# ── 2. ADD CASE STUDY #14 ────────────────────────────────────────────────────
cs14 = """
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
"""

with open('C:/Users/aprajita/Documents/repo/shoppulse/src/app/features/case-studies/case-studies-data.ts', 'r', encoding='utf-8') as f:
    content = f.read()

stripped = content.rstrip()
if stripped.endswith('];'):
    updated = stripped[:-2] + ',' + cs14 + '];'
    with open('C:/Users/aprajita/Documents/repo/shoppulse/src/app/features/case-studies/case-studies-data.ts', 'w', encoding='utf-8') as f:
        f.write(updated)
    print("Case study 14 added.")
else:
    print("ERROR:", repr(stripped[-80:]))

# ── 3. SYNC DOCS TO DIST ────────────────────────────────────────────────────
import shutil
shutil.copy(
    'C:/Users/aprajita/Documents/repo/shoppulse/public/docs/architect-deep-dive.md',
    'C:/Users/aprajita/Documents/repo/shoppulse/dist/shoppulse/browser/docs/architect-deep-dive.md'
)
print("Docs synced to dist.")
