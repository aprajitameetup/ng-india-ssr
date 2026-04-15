import { RenderMode, ServerRoute } from '@angular/ssr';
import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/**
 * SERVER ROUTE CONFIGURATION — Angular 19+ separate file pattern.
 *
 * CONCEPTS DEMONSTRATED:
 * - RenderMode.Server  → SSR on every request (home, products list, category)
 * - RenderMode.Prerender → SSG at build time (product detail pages)
 * - RenderMode.Client  → CSR only, no server involvement (cart)
 * - getPrerenderParams() → fetches all product slugs to enumerate prerender targets
 */
export const serverRoutes: ServerRoute[] = [
  {
    // HOME — SSR: trending + live data per request
    path: '',
    renderMode: RenderMode.Server,
  },
  {
    // PRODUCT LIST — SSR: inventory-aware, may show sale badges
    path: 'products',
    renderMode: RenderMode.Server,
  },
  {
    // PRODUCT DETAIL — SSG: pre-rendered at build time for all known slugs
    // getPrerenderParams() fetches the slug list from the API at build time.
    path: 'products/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      // CONCEPT: getPrerenderParams()
      // Called once at build time. Returns array of param objects.
      // Angular generates a static HTML file for each slug.
      // inject() works here — runs inside Angular's DI context.
      const http = inject(HttpClient);
      try {
        const res = await firstValueFrom(
          http.get<{ slugs: string[] }>('/api/products/slugs')
        );
        return res.slugs.map(slug => ({ slug }));
      } catch {
        // Fallback: hardcoded slugs if API unreachable at build time
        return [
          { slug: 'iphone-16-pro' },
          { slug: 'macbook-pro-m4' },
          { slug: 'sony-wh-1000xm5' },
          { slug: 'ipad-pro-m4' },
          { slug: 'samsung-galaxy-s25' },
          { slug: 'dell-xps-15' },
          { slug: 'apple-watch-ultra-2' },
          { slug: 'lg-c3-oled-65' },
        ];
      }
    },
  },
  {
    // CATEGORY — SSR: product lists change with inventory
    path: 'category/:name',
    renderMode: RenderMode.Server,
  },
  {
    // CART — CSR: user-specific, session-dependent, no SSR benefit
    path: 'cart',
    renderMode: RenderMode.Client,
  },
  {
    // LEARN — CSR: content fetched from static markdown files client-side
    path: 'learn',
    renderMode: RenderMode.Client,
  },
  {
    path: 'issues',
    renderMode: RenderMode.Client,
  },
  {
    path: 'case-studies',
    renderMode: RenderMode.Client,
  },
  {
    // Catch-all — SSR
    path: '**',
    renderMode: RenderMode.Server,
  },
];
