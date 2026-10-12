import { escHtml as e } from './utils.js';

// One editable combobox, with selection kept separate from its search text.
export function searchSelect(root, onChange) {
  const input = root.querySelector('[role="combobox"]'), list = root.querySelector('[role="listbox"]');
  const toggle = root.querySelector('button'), value = root.querySelector('input[type="hidden"]');
  let items = [], matches = [], active = -1;
  function paint() {
    const term = input.value.trim().toLowerCase();
    const all = items.filter(item => `${item.label} ${item.description || ''}`.toLowerCase().includes(term));
    matches = all.slice(0, 60); active = -1; input.removeAttribute('aria-activedescendant');
    list.innerHTML = matches.map((item, index) => `<li role="option" id="${list.id}-${index}" data-index="${index}" aria-selected="${item.value === value.value}"><strong>${e(item.label)}</strong>${item.description ? `<small>${e(item.description)}</small>` : ''}</li>`).join('') + (!matches.length ? '<li role="presentation" class="combobox-empty">No games match. Try a title or maker.</li>' : all.length > 60 ? '<li role="presentation" class="combobox-empty">Keep typing to narrow these results.</li>' : '');
  }
  function open(clear = false) { if (input.disabled) return; if (clear) input.value = ''; list.hidden = false; input.setAttribute('aria-expanded', 'true'); paint(); }
  function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); input.value = items.find(item => item.value === value.value)?.label || ''; }
  function select(id, notify = true) { value.value = items.some(item => item.value === id) ? id : ''; close(); if (notify) onChange(value.value); }
  function choose(index) { if (!matches[index]) return; select(matches[index].value); input.focus({preventScroll: true}); }
  input.addEventListener('click', () => { if (list.hidden) open(true); });
  input.addEventListener('input', () => { value.value = ''; onChange(''); open(); });
  toggle.addEventListener('click', () => { if (list.hidden) { input.focus(); open(true); } else close(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !list.hidden) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { close(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      if (list.hidden && !event.key.startsWith('Arrow')) return;
      event.preventDefault(); if (list.hidden) open(true); if (!matches.length) return;
      active = event.key === 'Home' ? 0 : event.key === 'End' ? matches.length - 1 : active < 0 ? (event.key === 'ArrowUp' ? matches.length - 1 : 0) : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      list.querySelectorAll('[role="option"]').forEach((node, index) => node.classList.toggle('is-active', active === index));
      const node = document.getElementById(`${list.id}-${active}`); input.setAttribute('aria-activedescendant', node.id); node.scrollIntoView({block: 'nearest'});
    } else if (event.key === 'Enter' && !list.hidden) { event.preventDefault(); if (active >= 0 || matches.length === 1) choose(Math.max(0, active)); }
  });
  list.addEventListener('pointerdown', event => event.preventDefault());
  list.addEventListener('click', event => { const option = event.target.closest('[data-index]'); if (option) choose(Number(option.dataset.index)); });
  document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) close(); });
  root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget)) close(); });
  return { setOptions(next, selected = value.value) { items = next; select(selected); }, select, close };
}
