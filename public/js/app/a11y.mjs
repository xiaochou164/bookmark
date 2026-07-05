export function hasModalOpen() {
  return Boolean(document.querySelector('dialog[open]'));
}

export function isVisibleFocusable(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.matches('[disabled], [inert]')) return false;
  if (el.closest('.hidden')) return false;
  return el.getClientRects().length > 0;
}

export function focusableElementsWithin(root) {
  if (!(root instanceof HTMLElement)) return [];
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');
  return Array.from(root.querySelectorAll(selector)).filter(isVisibleFocusable);
}

function menuItemsWithin(menu) {
  if (!(menu instanceof HTMLElement)) return [];
  return Array.from(menu.querySelectorAll('[role="menuitem"]')).filter(isVisibleFocusable);
}

export function handleMenuArrowNavigation(e) {
  if (e.defaultPrevented) return false;
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (!target) return false;
  const item = target.closest('[role="menuitem"]');
  const menu = item?.closest?.('[role="menu"]');
  if (!(item instanceof HTMLElement) || !(menu instanceof HTMLElement)) return false;
  const items = menuItemsWithin(menu);
  if (!items.length) return false;
  const currentIndex = Math.max(0, items.indexOf(item));
  let nextIndex = -1;
  if (e.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
  if (e.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
  if (e.key === 'Home') nextIndex = 0;
  if (e.key === 'End') nextIndex = items.length - 1;
  if (nextIndex < 0) return false;
  e.preventDefault();
  items[nextIndex]?.focus();
  return true;
}
