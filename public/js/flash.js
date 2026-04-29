'use strict';

/**
 * One-shot UI messages across navigations (sessionStorage). Used after sign-in → profile and sign-out → home.
 */
(function flashModule() {
  const KEY = 'taskMarketplaceFlash';

  function set(payload) {
    try {
      const obj = { type: 'ok', message: '', ...payload };
      sessionStorage.setItem(KEY, JSON.stringify(obj));
    } catch (_) {
      /* ignore quota / private mode */
    }
  }

  function consume() {
    const el = document.getElementById('site-flash');
    if (!el) return;
    let raw;
    try {
      raw = sessionStorage.getItem(KEY);
    } catch (_) {
      return;
    }
    if (!raw) return;
    try {
      sessionStorage.removeItem(KEY);
    } catch (_) {
      /* still try to show */
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return;
    }
    const msg = (data && data.message) || '';
    if (!msg) return;
    el.textContent = msg;
    el.classList.remove('hidden', 'site-flash--ok', 'site-flash--err');
    el.classList.add(data.type === 'err' ? 'site-flash--err' : 'site-flash--ok');
    el.classList.remove('hidden');
    if (el._tmFlashTimer) clearTimeout(el._tmFlashTimer);
    el._tmFlashTimer = setTimeout(() => {
      el.classList.add('hidden');
      el.textContent = '';
      el.classList.remove('site-flash--ok', 'site-flash--err');
      el._tmFlashTimer = undefined;
    }, 6500);
  }

  globalThis.TaskMarketplaceFlash = { set, consume };
})();
