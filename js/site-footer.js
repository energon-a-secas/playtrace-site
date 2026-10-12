// Keep the shared Balise control and its context handling; only move its host.
// Loaded after the footer and beacon kits so their live nodes are ready.
(() => {
  function placeBeacon() {
    const footer = document.querySelector('body > .neo-footer');
    const inner = footer?.querySelector('.neo-footer-inner');
    const beacon = document.getElementById('neo-beacon-link');
    if (!inner || !beacon) return;
    inner.prepend(beacon);
    footer.classList.add('site-footer');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', placeBeacon, { once: true });
  else placeBeacon();
})();
