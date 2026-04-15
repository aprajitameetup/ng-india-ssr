# ShopPulse — ng-india 2026 SSR Demo

> **Talk:** *Angular SSR from an Architect's Perspective*
> **Conference:** [ng-india 2026](https://www.ng-india.org/)
> **Speaker:** Aprajita

ShopPulse is a production-grade Angular demo application built specifically for the ng-india 2026 conference talk. It is an e-commerce storefront that serves as a living reference for how Angular SSR works in practice — not just the happy path, but the real-world problems architects face when shipping SSR to production.

The app is intentionally structured so that every route teaches something. You can browse the shop, but the real value is in the three dedicated sections below.

---

## The Three Core Sections

### 1. SSR Issues & Fixes (`/issues`)

**14 real-world Angular SSR problems** — each presented as a side-by-side card showing exactly what breaks, why it breaks, and the exact Angular API that fixes it.

Issues are grouped into six categories:

| Category | What it covers |
|---|---|
| **Hydration** | Mismatch errors (NG0500), pre-hydration click loss, `@defer` behaviour in SSR |
| **Browser API** | `localStorage`, `sessionStorage`, `window`, `document` crashes on Node.js |
| **Stability** | SSR hanging forever due to open timers, Zone.js vs zoneless stabilisation |
| **Performance** | Double HTTP requests, TTFB spikes from slow components, CLS from skeleton flashes |
| **Routing** | Wrong `RenderMode` per route, `getPrerenderParams()` gaps |
| **State** | Transfer state misuse, memory leaks from platform-scoped providers |

Each card includes:
- A description of the root cause
- The broken code snippet
- The correct code snippet
- The exact Angular API that resolves it (e.g. `withHttpTransferCache()`, `ngSkipHydration`, `PendingTasks`)

---

### 2. Case Studies (`/case-studies`)

Real-world architecture scenarios drawn from production SSR apps. Each case study walks through:

- **Scenario** — the business context and what the page is supposed to do
- **Symptoms** — what the developer observes (flicker, lost clicks, stale content, timeout)
- **Root cause** — why SSR and the client disagree
- **Solutions** — one or more fixes ranked by when to apply them
- **Key takeaway** — the architectural principle behind the fix

Example case studies include auth button flicker, double-data-fetch on hydration, memory leaks across requests, and edge rendering trade-offs.

---

### 3. Learn SSR (`/learn`)

A structured reading experience with three guides, each targeting a different level of Angular knowledge:

#### Beginner Guide
For developers new to SSR or Web Vitals. Covers:
- How the browser renders a page (CRP basics)
- What SSR actually changes vs a standard Angular app
- Hydration from first principles
- Web Vitals (LCP, CLS, INP) explained with concrete examples

#### Architect Deep Dive
Full technical depth — no simplifications. Covers:
- Angular's rendering pipeline internals
- Signals and how reactivity interacts with SSR stabilisation
- Zone.js vs zoneless: how each determines when SSR is "done"
- Hydration internals: DOM reconciliation, `ng-state`, `jsaction`
- Critical Rendering Path and what architects must optimise

#### Topic Introduction
For Angular developers who know the framework well but haven't worked with SSR or Web Vitals before. Bridges the gap between CSR knowledge and SSR architecture — explains what changes, what stays the same, and what surprises are coming.

---

## Running the App

```bash
npm install
ng serve              # CSR dev server — http://localhost:4200
ng serve --ssr        # SSR dev server
ng build              # Production build
```

For SSR production mode:

```bash
npm run build
node dist/shoppulse/server/server.mjs
```

---

## Tech Stack

- **Angular 21** with SSR (`@angular/ssr`)
- **Angular Signals** for state management
- Server-side rendering via **Express** (`server.ts`)
- Per-route render modes via `app.routes.server.ts` (`RenderMode.Server`, `RenderMode.Prerender`, `RenderMode.Client`)
- `provideClientHydration()` with `withEventReplay()`, `withIncrementalHydration()`, `withHttpTransferCache()`

---

## Talk Slides

The talk slides are available in the repo as `talk-slides-v2.html` — open directly in any browser.

---

## Additional Resources

- [Angular SSR docs](https://angular.dev/guide/ssr)
- [Angular CLI reference](https://angular.dev/tools/cli)
- [Web Vitals](https://web.dev/vitals/)
