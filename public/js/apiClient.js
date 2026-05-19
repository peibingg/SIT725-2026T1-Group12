'use strict';

async function parseJsonResponse(res) {
  const hasHeadersGet = res.headers && typeof res.headers.get === 'function';
  const ct = hasHeadersGet ? (res.headers.get('content-type') || '').toLowerCase() : '';
  if (!hasHeadersGet || ct.includes('application/json')) {
    return res.json().catch(() => ({}));
  }
  return {};
}

async function apiGet(url) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const data = await parseJsonResponse(res);
  return { res, data };
}

async function apiPostJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const data = await parseJsonResponse(res);
  return { res, data };
}

const apiClient = { apiGet, apiPostJson };

if (typeof globalThis !== 'undefined') {
  globalThis.TaskMarketplaceApi = apiClient;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = apiClient;
}
