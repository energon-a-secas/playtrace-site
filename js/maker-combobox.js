import { escHtml as e } from './utils.js';

let names = [], choose, active = -1, matches = [], selected = '', input, list, toggle;
function paint() {
  const term = input.value.trim().replace(/^u\//i, '').toLowerCase();
  matches = names.filter(name => name.toLowerCase().includes(term)).slice(0, 80);
  const options = [{ name: '', label: 'All makers' }, ...matches.map(name => ({ name, label: `u/${name}` }))];
  matches = options.map(item => item.name);
  active = -1; input.removeAttribute('aria-activedescendant');
  list.innerHTML = options.map((item, index) => `<li role="option" id="maker-option-${index}" data-maker-index="${index}" aria-selected="${item.name === selected}">${e(item.label)}</li>`).join('')
    + (options.length === 1 && term ? '<li class="combobox-empty" role="presentation">No makers match.</li>' : '');
}
function open() { list.hidden = false; input.setAttribute('aria-expanded', 'true'); paint(); }
function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); input.value = selected ? `u/${selected}` : ''; }
function select(index) { const value = matches[index]; if (value === undefined) return; selected = value; close(); choose(value); input.focus({ preventScroll: true }); }
export function syncMakers(games, value) {
  if (!input) return;
  names = [...new Set(games.map(game => game.author.name))].sort((a, b) => a.localeCompare(b));
  selected = value;
  if (list.hidden || document.activeElement !== input) input.value = value ? `u/${value}` : '';
}
export function bindMaker(onChoose) {
  choose = onChoose; input = document.getElementById('authorSelect'); list = document.getElementById('makerOptions'); toggle = document.getElementById('makerToggle');
  input.addEventListener('focus', () => { input.select(); });
  input.addEventListener('click', open);
  input.addEventListener('input', open);
  toggle.addEventListener('click', () => { if (list.hidden) { input.focus(); input.value = ''; open(); } else close(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !list.hidden) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { close(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      if (list.hidden && !event.key.startsWith('Arrow')) return;
      event.preventDefault(); if (list.hidden) { input.value = ''; open(); }
      active = event.key === 'Home' ? 0 : event.key === 'End' ? matches.length - 1 : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      list.querySelectorAll('[role="option"]').forEach((node, index) => node.classList.toggle('is-active', index === active));
      input.setAttribute('aria-activedescendant', `maker-option-${active}`); document.getElementById(`maker-option-${active}`).scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && !list.hidden) { event.preventDefault(); select(active < 0 ? (matches.length === 2 ? 1 : 0) : active); }
  });
  list.addEventListener('pointerdown', event => event.preventDefault());
  list.addEventListener('click', event => { const option = event.target.closest('[data-maker-index]'); if (option) select(Number(option.dataset.makerIndex)); });
  document.addEventListener('pointerdown', event => { if (!event.target.closest('.maker-combobox')) close(); });
  input.addEventListener('blur', event => { if (event.relatedTarget !== toggle) close(); });
}
