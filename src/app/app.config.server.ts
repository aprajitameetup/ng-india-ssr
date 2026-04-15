import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { serverUrlInterceptor } from './core/interceptors/server-url.interceptor';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

/**
 * SERVER APPLICATION CONFIG
 *
 * CONCEPTS DEMONSTRATED:
 *
 * provideServerRendering(withRoutes(serverRoutes))
 *   — Registers the server route configuration.
 *     Angular reads renderMode and getPrerenderParams() from serverRoutes.
 *
 * provideHttpClient(withFetch())
 *   — Also required on the server side.
 *     Node 18+ supports native fetch; Angular uses it for server-side HTTP calls.
 *     TransferState integration: GET responses are serialized into ng-state JSON
 *     embedded in the server-rendered HTML, so the client can reuse them.
 *
 * mergeApplicationConfig(appConfig, serverConfig)
 *   — Merges client config with server-specific providers.
 *     Per-request isolation: each incoming HTTP request gets a fresh Root Injector.
 *     The Platform Injector (and AngularNodeAppEngine) is shared across requests.
 */
const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    provideHttpClient(withFetch(), withInterceptors([serverUrlInterceptor])),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
