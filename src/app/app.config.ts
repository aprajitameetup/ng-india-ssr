import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import {
  provideClientHydration,
  withEventReplay,
  withIncrementalHydration,
} from '@angular/platform-browser';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { routes } from './app.routes';

/**
 * CLIENT APPLICATION CONFIG
 *
 * CONCEPTS DEMONSTRATED:
 *
 * provideHttpClient(withFetch())
 *   — Uses the Fetch API instead of XHR. Required for SSR compatibility
 *     (Node 18+ has native fetch). Also enables withFetchTransferCache()
 *     which auto-deduplicates GET requests via TransferState.
 *
 * provideClientHydration(
 *   withEventReplay()      — Captures DOM events (clicks, inputs) that fire
 *                            before hydration completes. Replays them after
 *                            the component tree is hydrated.
 *                            Adds jsaction="click:..." attributes to elements.
 *
 *   withIncrementalHydration() — Enables @defer block-level hydration control.
 *                            Components wrapped in @defer can declare:
 *                              hydrate on interaction
 *                              hydrate on viewport
 *                              hydrate on idle
 *                              hydrate never
 *                            Without this, all @defer content hydrates eagerly.
 * )
 *
 * withComponentInputBinding() — Allows route params/queryParams to be bound
 *                               directly as component inputs via input().
 *
 * withViewTransitions()     — Enables the View Transitions API for route changes.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withViewTransitions(),
    ),
    provideHttpClient(withFetch()),
    provideClientHydration(
      withEventReplay(),
      withIncrementalHydration(),
    ),
  ],
};
