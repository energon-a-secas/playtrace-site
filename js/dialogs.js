/** The platform owns trapping and Escape; this module owns launch/return focus. */
const openers = new WeakMap();

export function openDialog(dialog, opener = document.activeElement) {
  if (!dialog || dialog.open) return;
  openers.set(dialog, opener);
  dialog.showModal();
}

/** Bind once. Keep a visible close button for touch users. */
export function bindDialog(dialog, fallback) {
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-dialog-close]')) dialog.close();
  });
  // Contain Escape so a site's page shortcut does not also dismiss a sheet.
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') event.stopPropagation();
  });
  dialog.addEventListener('close', () => {
    const opener = openers.get(dialog);
    const target = opener?.isConnected && opener.getClientRects().length ? opener : fallback;
    target?.focus({ preventScroll: true });
    openers.delete(dialog);
  });
}
