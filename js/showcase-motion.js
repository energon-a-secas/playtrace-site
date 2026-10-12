// Move the panel boundaries with transforms and masks. Artwork and captions
// retain their proportions; no animated widths or per-frame layout reads.
export function bindShowcase(wall) {
  const desktop = matchMedia('(min-width: 1200px) and (hover: hover) and (pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let hovered = null, focused = null, previousWidth = 0, panels = [], sizes = [], target = [], frame = 0;
  let base = 0, slant = 0, expanded = 0;
  function draw() {
    let left = -slant / 2;
    panels.forEach((panel, index) => {
      const size = sizes[index];
      // Adjacent masks share the same boundary on every frame. A one-pixel
      // overlap also covers antialiasing along the diagonal at fractional sizes.
      const vars = { '--panel-x': left, '--canvas-width': expanded + slant + 1, '--base-width': base,
        '--cut-start': index === 0 ? 0 : slant, '--cut-top': size + slant + 1,
        '--cut-bottom': size + (index === panels.length - 1 ? slant : 0) + 1, '--art-x': (size - expanded) / 2 };
      for (const [name, value] of Object.entries(vars)) panel.style.setProperty(name, `${value}px`);
      left += size;
    });
  }
  function paint() {
    const nextPanels = [...wall.querySelectorAll(':scope > li:has(.showcase-game)')];
    const enabled = desktop.matches && !reduced.matches && nextPanels.length > 1;
    if (!enabled) {
      cancelAnimationFrame(frame); frame = 0;
      wall.classList.remove('showcase--motion');
      nextPanels.forEach(panel => panel.classList.remove('is-expanded'));
      previousWidth = 0;
      return;
    }
    const width = wall.clientWidth;
    const reset = width !== previousWidth || nextPanels.some((panel, i) => panel !== panels[i]) || nextPanels.length !== panels.length;
    panels = nextPanels;
    base = width / panels.length; slant = Math.min(140, Math.max(52, width * .07)); expanded = base * 1.65;
    const active = panels.includes(focused) ? focused : panels.includes(hovered) ? hovered : null;
    const remaining = (width - expanded) / (panels.length - 1);
    const next = panels.map(panel => active ? panel === active ? expanded : remaining : base);
    panels.forEach(panel => panel.classList.toggle('is-expanded', panel === active));
    wall.classList.add('showcase--motion');
    previousWidth = width;
    if (!reset && next.every((size, i) => size === target[i])) return;
    cancelAnimationFrame(frame); frame = 0;
    target = next;
    if (reset) { sizes = [...target]; draw(); return; }
    const from = [...sizes], started = performance.now();
    function step(now) {
      const progress = Math.min(1, (now - started) / 440), eased = 1 - (1 - progress) ** 3;
      sizes = from.map((size, i) => size + (target[i] - size) * eased);
      draw();
      frame = progress < 1 ? requestAnimationFrame(step) : 0;
    }
    frame = requestAnimationFrame(step);
  }
  const panelFor = target => target?.closest?.('.showcase-game')?.parentElement || null;
  // Moving boundaries must not trigger another expansion under a still pointer.
  wall.addEventListener('pointermove', event => { const panel = panelFor(event.target); if (panel !== hovered) { hovered = panel; paint(); } });
  wall.addEventListener('pointerleave', () => { hovered = null; paint(); });
  wall.addEventListener('focusin', event => { focused = event.target.matches(':focus-visible') ? panelFor(event.target) : null; paint(); });
  wall.addEventListener('focusout', event => {
    // Moving between Check Project and Play must keep this panel open.
    if (panelFor(event.relatedTarget) !== focused) { focused = null; paint(); }
  });
  desktop.addEventListener('change', paint); reduced.addEventListener('change', paint);
  new ResizeObserver(paint).observe(wall);
  paint();
  return paint;
}
