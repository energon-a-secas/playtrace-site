// Move the panel boundaries with transforms and masks. Artwork and captions
// retain their proportions; no animated widths or per-frame layout reads.
export function bindShowcase(wall) {
  const desktop = matchMedia('(min-width: 1200px) and (hover: hover) and (pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let hovered = null, focused = null, previousWidth = 0, previousPanels = [];
  function paint() {
    const panels = [...wall.querySelectorAll(':scope > li:has(.showcase-game)')];
    const enabled = desktop.matches && !reduced.matches && panels.length > 1;
    if (!enabled) { wall.classList.remove('showcase--motion', 'showcase--animate'); previousWidth = 0; return; }
    const width = wall.clientWidth, base = width / panels.length, slant = Math.min(140, Math.max(52, width * .07));
    const reset = width !== previousWidth || panels.some((panel, i) => panel !== previousPanels[i]) || panels.length !== previousPanels.length;
    if (reset) wall.classList.remove('showcase--animate');
    const active = panels.includes(hovered) ? hovered : panels.includes(focused) ? focused : null;
    const expanded = base * 1.65, remaining = (width - expanded) / (panels.length - 1);
    let left = -slant / 2;
    panels.forEach((panel, index) => {
      const size = active ? panel === active ? expanded : remaining : base;
      const vars = { '--panel-x': left, '--canvas-width': expanded + slant, '--base-width': base,
        '--cut-start': index === 0 ? 0 : slant, '--cut-top': size + slant,
        '--cut-bottom': size + (index === panels.length - 1 ? slant : 0), '--art-x': (size - expanded) / 2 };
      for (const [name, value] of Object.entries(vars)) panel.style.setProperty(name, `${value}px`);
      panel.classList.toggle('is-expanded', panel === active);
      left += size;
    });
    wall.classList.add('showcase--motion');
    previousWidth = width; previousPanels = panels;
    if (reset) requestAnimationFrame(() => requestAnimationFrame(() => { if (wall.classList.contains('showcase--motion')) wall.classList.add('showcase--animate'); }));
  }
  const panelFor = target => target?.closest?.('.showcase-game')?.parentElement || null;
  wall.addEventListener('pointerover', event => { const panel = panelFor(event.target); if (panel !== hovered) { hovered = panel; paint(); } });
  wall.addEventListener('pointerleave', () => { hovered = null; paint(); });
  wall.addEventListener('focusin', event => { focused = event.target.matches(':focus-visible') ? panelFor(event.target) : null; paint(); });
  wall.addEventListener('focusout', () => { focused = null; paint(); });
  desktop.addEventListener('change', paint); reduced.addEventListener('change', paint);
  new ResizeObserver(paint).observe(wall);
  paint();
  return paint;
}
