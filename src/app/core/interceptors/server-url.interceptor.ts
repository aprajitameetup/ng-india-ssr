import { HttpInterceptorFn } from '@angular/common/http';
import { inject, REQUEST } from '@angular/core';

/**
 * SERVER-SIDE HTTP INTERCEPTOR
 *
 * CONCEPT: Per-request app isolation
 * During SSR, relative URLs (e.g. `/api/products`) need to be converted to
 * absolute URLs so Node's fetch knows where to connect.
 * The REQUEST token gives us the incoming Express Request object,
 * from which we extract the base URL (protocol + host).
 *
 * This interceptor only runs on the server (injected only in server config).
 * On the client, relative URLs resolve against window.location automatically.
 */
export const serverUrlInterceptor: HttpInterceptorFn = (req, next) => {
  const serverRequest = inject(REQUEST, { optional: true });

  if (serverRequest && req.url.startsWith('/')) {
    const baseUrl = `http://localhost:${process.env['PORT'] || 4000}`;
    const absoluteReq = req.clone({ url: `${baseUrl}${req.url}` });
    return next(absoluteReq);
  }

  return next(req);
};
