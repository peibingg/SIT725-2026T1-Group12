/**
 * @jest-environment jsdom
 */
'use strict';

const path = require('path');

function loadFlash({ withElement = true } = {}) {
  jest.resetModules();
  delete require.cache[path.join(__dirname, '../public/js/flash.js')];
  sessionStorage.clear();
  document.body.innerHTML = withElement
    ? '<div id="site-flash" class="site-flash hidden"></div>'
    : '';
  require('../public/js/flash.js');
  return globalThis.TaskMarketplaceFlash;
}

describe('TaskMarketplaceFlash (flash.js)', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  describe('set', () => {
    it('stores type and message in sessionStorage', () => {
      const flash = loadFlash({ withElement: false });
      flash.set({ type: 'ok', message: 'Welcome back' });

      const stored = JSON.parse(sessionStorage.getItem('taskMarketplaceFlash'));
      expect(stored).toEqual({ type: 'ok', message: 'Welcome back' });
    });

    it('defaults type to ok and message to empty string', () => {
      const flash = loadFlash({ withElement: false });
      flash.set({});

      expect(JSON.parse(sessionStorage.getItem('taskMarketplaceFlash'))).toEqual({
        type: 'ok',
        message: '',
      });
    });

    it('ignores sessionStorage errors when setItem fails', () => {
      const flash = loadFlash({ withElement: false });
      const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota');
      });

      expect(() => flash.set({ type: 'err', message: 'No room' })).not.toThrow();

      spy.mockRestore();
    });
  });

  describe('consume', () => {
    it('does nothing when site-flash element is missing', () => {
      const flash = loadFlash({ withElement: false });
      sessionStorage.setItem('taskMarketplaceFlash', JSON.stringify({ type: 'ok', message: 'Hi' }));

      flash.consume();

      expect(sessionStorage.getItem('taskMarketplaceFlash')).toBeTruthy();
    });

    it('returns early when getItem throws', () => {
      const flash = loadFlash();
      sessionStorage.setItem('taskMarketplaceFlash', JSON.stringify({ type: 'ok', message: 'Hi' }));
      const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });

      flash.consume();

      const el = document.getElementById('site-flash');
      expect(el.textContent).toBe('');
      expect(el.classList.contains('hidden')).toBe(true);

      spy.mockRestore();
    });

    it('returns early when nothing is stored', () => {
      const flash = loadFlash();
      flash.consume();

      const el = document.getElementById('site-flash');
      expect(el.textContent).toBe('');
      expect(el.classList.contains('hidden')).toBe(true);
    });

    it('returns early when stored JSON is invalid', () => {
      const flash = loadFlash();
      sessionStorage.setItem('taskMarketplaceFlash', 'not-json');

      flash.consume();

      const el = document.getElementById('site-flash');
      expect(el.textContent).toBe('');
      expect(el.classList.contains('hidden')).toBe(true);
    });

    it('returns early when message is empty (still clears stored flash)', () => {
      const flash = loadFlash();
      sessionStorage.setItem('taskMarketplaceFlash', JSON.stringify({ type: 'ok', message: '' }));

      flash.consume();

      const el = document.getElementById('site-flash');
      expect(el.textContent).toBe('');
      expect(el.classList.contains('hidden')).toBe(true);
      expect(sessionStorage.getItem('taskMarketplaceFlash')).toBeNull();
    });

    it('shows ok flash, removes storage, and auto-hides after timeout', () => {
      jest.useFakeTimers();
      const flash = loadFlash();
      flash.set({ type: 'ok', message: 'Saved successfully' });

      flash.consume();

      const el = document.getElementById('site-flash');
      expect(el.textContent).toBe('Saved successfully');
      expect(el.classList.contains('site-flash--ok')).toBe(true);
      expect(el.classList.contains('site-flash--err')).toBe(false);
      expect(el.classList.contains('hidden')).toBe(false);
      expect(sessionStorage.getItem('taskMarketplaceFlash')).toBeNull();

      jest.advanceTimersByTime(6500);

      expect(el.classList.contains('hidden')).toBe(true);
      expect(el.textContent).toBe('');
      expect(el.classList.contains('site-flash--ok')).toBe(false);
      expect(el._tmFlashTimer).toBeUndefined();
    });

    it('shows err flash styling', () => {
      const flash = loadFlash();
      sessionStorage.setItem(
        'taskMarketplaceFlash',
        JSON.stringify({ type: 'err', message: 'Something failed' }),
      );

      flash.consume();

      const el = document.getElementById('site-flash');
      expect(el.textContent).toBe('Something failed');
      expect(el.classList.contains('site-flash--err')).toBe(true);
      expect(el.classList.contains('site-flash--ok')).toBe(false);
    });

    it('still displays when removeItem throws', () => {
      const flash = loadFlash();
      sessionStorage.setItem(
        'taskMarketplaceFlash',
        JSON.stringify({ type: 'ok', message: 'Shown anyway' }),
      );
      const spy = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('blocked');
      });

      flash.consume();

      const el = document.getElementById('site-flash');
      expect(el.textContent).toBe('Shown anyway');
      expect(el.classList.contains('site-flash--ok')).toBe(true);

      spy.mockRestore();
    });

    it('clears a pending timer before showing a new flash', () => {
      jest.useFakeTimers();
      const flash = loadFlash();
      const el = document.getElementById('site-flash');
      const clearSpy = jest.spyOn(globalThis, 'clearTimeout');

      flash.set({ type: 'ok', message: 'First' });
      flash.consume();
      el._tmFlashTimer = 999;

      flash.set({ type: 'err', message: 'Second' });
      flash.consume();

      expect(clearSpy).toHaveBeenCalledWith(999);
      expect(el.textContent).toBe('Second');
      expect(el.classList.contains('site-flash--err')).toBe(true);

      clearSpy.mockRestore();
    });
  });
});
