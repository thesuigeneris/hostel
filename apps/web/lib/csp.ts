/**
 * The website's Content Security Policy, built per request with a fresh nonce (middleware.ts).
 *
 * Scripts: only this site's own files, Razorpay Checkout's script, and inline scripts carrying this response's nonce.
 * Next.js reads the nonce from the request's policy and puts it on every script it writes (the page's chunks and the
 * inline data it streams), so there is no `'unsafe-inline'`: a script injected into a page, without the nonce, does
 * not run. `'unsafe-eval'` only in development, for fast refresh.
 *
 * Images: every photo is an upload served from the API's origin (outside photo links are refused by the API), map
 * tiles come from OpenStreetMap, and Razorpay Checkout may show its own images. Styles keep `'unsafe-inline'`: React
 * and the motion library set inline styles, which cannot carry a nonce.
 */
export function contentSecurityPolicy(nonce: string, opts: { dev: boolean; apiOrigin: string }) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${opts.dev ? " 'unsafe-eval'" : ''} https://checkout.razorpay.com`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${opts.apiOrigin} https://*.tile.openstreetmap.org https://*.razorpay.com`,
    "font-src 'self' data:",
    "connect-src 'self' https://*.razorpay.com https://lumberjack.razorpay.com",
    'frame-src https://api.razorpay.com https://checkout.razorpay.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/** 128 random bits, base64: a nonce nobody can guess for the response it is used in. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
