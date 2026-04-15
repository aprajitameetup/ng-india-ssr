import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { MOCK_PRODUCTS, MOCK_CATEGORIES, MOCK_COMMENTS } from './app/core/data/mock-data';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(express.json());

// ─────────────────────────────────────────────
// MOCK REST API
// Demonstrates: TransferState source data, httpResource() endpoints,
//               Cache-Control strategies per resource type
// ─────────────────────────────────────────────

/**
 * GET /api/products
 * SSR page: category/search — Cache short (60s) since inventory may change.
 */
app.get('/api/products', (req, res) => {
  // Cache-Control: SSR dynamic data — short TTL with stale-while-revalidate
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  const { category, featured } = req.query;
  let products = [...MOCK_PRODUCTS];
  if (category) products = products.filter(p => p.category === category);
  if (featured === 'true') products = products.filter(p => p.featured);
  res.json({ products, total: products.length });
});

/**
 * GET /api/products/slugs
 * Used by getPrerenderParams() to enumerate all product slugs at build time.
 * Cache-Control: long TTL — slugs are stable and set at build time.
 */
app.get('/api/products/slugs', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json({ slugs: MOCK_PRODUCTS.map(p => p.slug) });
});

/**
 * GET /api/products/:slug
 * Used by SSG product-detail page via TransferState.
 * Cache-Control: long TTL — pre-rendered content is immutable until next build.
 */
app.get('/api/products/:slug', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  const product = MOCK_PRODUCTS.find(p => p.slug === req.params['slug']);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json(product);
});

/**
 * GET /api/categories
 * Used by home/nav components.
 */
app.get('/api/categories', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  res.json({ categories: MOCK_CATEGORIES });
});

/**
 * GET /api/comments/:productSlug
 * Deferred — loaded client-side only (on interaction).
 * No Cache-Control needed — this data is fetched after hydration.
 */
app.get('/api/comments/:productSlug', (req, res) => {
  // Simulate small delay for real-world feel
  setTimeout(() => {
    res.json({ comments: MOCK_COMMENTS, productSlug: req.params['productSlug'] });
  }, 300);
});

/**
 * GET /api/related/:productSlug
 * Deferred — loaded on viewport intersection.
 */
app.get('/api/related/:productSlug', (req, res) => {
  const current = MOCK_PRODUCTS.find(p => p.slug === req.params['productSlug']);
  const related = current
    ? MOCK_PRODUCTS.filter(p => p.category === current.category && p.slug !== current.slug).slice(0, 4)
    : MOCK_PRODUCTS.slice(0, 4);
  res.json({ products: related });
});

/**
 * GET /api/recommendations
 * Deferred — loaded on idle.
 */
app.get('/api/recommendations', (req, res) => {
  const featured = MOCK_PRODUCTS.filter(p => p.featured);
  res.json({ products: featured });
});

/**
 * GET /api/stock
 * LIVE endpoint — randomizes stock counts on each request to simulate real-time changes.
 * httpResource() polls this every 8 seconds.
 * Cache-Control: no-cache — live data must never be cached.
 */
app.get('/api/stock', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const stockLevels = MOCK_PRODUCTS.map(p => {
    // Simulate live fluctuation: ±10 around base count
    const base = p.stockCount;
    const jitter = Math.floor(Math.random() * 21) - 10;
    const count = Math.max(0, base + jitter);
    return {
      productId: p.id,
      slug: p.slug,
      name: p.name,
      count,
      status: count === 0 ? 'out_of_stock' : count < 10 ? 'low_stock' : 'in_stock',
      lastUpdated: new Date().toISOString(),
    };
  });
  res.json({ stockLevels, timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// STATIC FILES
// ─────────────────────────────────────────────

// Markdown docs: no cache — content changes without hashed filenames
app.use(
  '/docs',
  express.static(browserDistFolder, {
    maxAge: 0,
    index: false,
    redirect: false,
  }),
);

// All other assets: 1 year immutable — Angular build adds content hashes to filenames
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

// ─────────────────────────────────────────────
// ANGULAR SSR HANDLER
// AngularNodeAppEngine handles per-request isolation:
// fresh Root Injector per request, Platform Injector shared across requests.
// ─────────────────────────────────────────────
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error?: Error) => {
    if (error) throw error;
    console.log(`ShopPulse SSR server listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
