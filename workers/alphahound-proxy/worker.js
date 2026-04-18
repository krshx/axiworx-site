/**
 * alphahound.axiworx.com → serves axiworx-site/alphahound/ content
 *
 * Deployed as a CF Worker on route: alphahound.axiworx.com/*
 * Proxies all requests to the Pages project's /alphahound/ path,
 * so the subdomain feels like a standalone site.
 */

const PAGES_ORIGIN = 'https://axiworx-site.pages.dev';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Map root → /alphahound/, and any sub-paths stay within it
    let path = url.pathname;
    if (path === '/' || path === '') {
      path = '/alphahound/';
    } else if (!path.startsWith('/alphahound/')) {
      // Assets like /icon.jpeg, /og-image.jpeg etc live at /alphahound/
      path = '/alphahound' + path;
    }

    const target = `${PAGES_ORIGIN}${path}${url.search}`;

    const response = await fetch(target, {
      method: request.method,
      headers: request.headers,
      body: request.method !== 'GET' && request.method !== 'HEAD'
        ? request.body : undefined,
    });

    // Pass through with original status and headers
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  },
};
