/* ══════════════════════════════════════════════════════════════
   Neorgon Footer Kit — footer.js
   Behavior harness: structure normalisation, meta bar (Neorgon /
   source / version / updated), back-to-top, optional theme menu,
   bottom-pinning guard for wrapped layouts.
   Vendored per site as js/neorgon-footer.js — do not edit copies.
   No dependencies. Load with `defer`.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__neoFooterInit) return;
  window.__neoFooterInit = true;

  var CDN = 'https://cdn.neorgon.org/v1.0.0';
  var HUB = 'https://neorgon.com/';
  var GH = 'https://github.com';
  var TOP_THRESHOLD = 600;

  function meta(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el ? el.content.trim() : '';
  }

  /* ── Live flag: ?footer=live or <meta name="neo-footer-source" content="live">
     appends the CDN stylesheet after the vendored one (CDN wins). Mirrors
     the header kit — JS harness always stays vendored. ────────────────── */
  (function liveFlag() {
    var live = new URLSearchParams(location.search).get('footer') === 'live' ||
               meta('neo-footer-source') === 'live';
    if (!live) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CDN + '/footer/footer.css';
    document.head.appendChild(link);
    document.documentElement.setAttribute('data-neo-footer-live', '');
  })();

  /* ── Small builders ─────────────────────────────────────────────────── */
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function link(href, text, external) {
    var a = el('a', null, text);
    a.href = href;
    if (external) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      /* A minimal north-east arrow, drawn rather than typed: the character
         renders as an emoji on some platforms and as a box on others, and it
         has to sit on the text baseline at 1em next to a 12px label. It is
         aria-hidden because the link already announces itself as opening a new
         tab through the title; the arrow is for the eye. */
      a.appendChild(arrow());
      a.title = text + ' (opens in a new tab)';
    }
    return a;
  }
  function arrow() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'neo-footer-out');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '10'); svg.setAttribute('height', '10');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '3');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M7 17 17 7M9 7h8v8');
    svg.appendChild(path);
    return svg;
  }
  function sep() {
    var s = el('span', 'neo-footer-sep', '·');
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  /* ── Structure: guarantee a .neo-footer-inner so sites can author the
     footer as one bare line of copy and still get kit layout. Loose
     children are moved (not cloned), so any site listeners survive. ──── */
  function ensureInner(footer) {
    var inner = footer.querySelector(':scope > .neo-footer-inner');
    if (inner) return inner;

    inner = el('div', 'neo-footer-inner');
    var moved = Array.prototype.slice.call(footer.childNodes);
    var hasElement = moved.some(function (n) { return n.nodeType === 1; });

    /* Bare text ("Part of Neorgon") becomes a proper note paragraph;
       richer markup is wrapped as-is. */
    var host = inner;
    if (!hasElement) { host = el('p', 'neo-footer-note'); inner.appendChild(host); }
    moved.forEach(function (n) { host.appendChild(n); });

    footer.appendChild(inner);
    return inner;
  }

  /* ── Bottom-pinning for wrapped layouts ─────────────────────────────
     The CSS pins the footer via `body:has(> .neo-footer)`. When a site
     nests the footer inside a wrapper that selector cannot match, so
     tag the chain here instead. ─────────────────────────────────────── */
  function ensurePinning(footer) {
    if (footer.getAttribute('data-stick') === 'off') return;
    var parent = footer.parentElement;
    if (!parent || parent === document.body) return;
    parent.classList.add('neo-footer-host');
    document.body.classList.add('neo-footer-root');
  }

  /* ── Theme menu — reuses the header kit's registry so themes are
     defined in exactly one place. No header kit on the page → no menu. ─ */
  var PALETTE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 22a10 10 0 1 1 10-10c0 1.66-1.34 3-3 3h-2.5a2.5 2.5 0 0 0-1.8 4.2c.4.43.3 1.05-.13 1.42A9.9 9.9 0 0 1 12 22z"/>' +
    '<circle cx="7.5" cy="11.5" r="1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1" fill="currentColor"/>' +
    '<circle cx="14.5" cy="7.5" r="1" fill="currentColor"/><circle cx="17.5" cy="11.5" r="1" fill="currentColor"/></svg>';

  function themeRegistry() {
    var api = window.NeoHeader;
    if (!api) return null;
    if (api.list && api.list.length) return api.list;
    /* Older vendored header.js exposes ids only — derive a usable label. */
    return (api.themes || []).map(function (id) {
      return { id: id, label: id.charAt(0).toUpperCase() + id.slice(1), swatch: 'transparent' };
    });
  }

  function buildThemeMenu() {
    var themes = themeRegistry();
    if (!themes) return null;

    var wrap = el('div', 'neo-footer-theme');
    var toggle = el('button', 'neo-footer-theme-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-haspopup', 'menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = PALETTE_SVG + '<span>Theme</span>';

    var menu = el('div', 'neo-footer-menu');
    menu.setAttribute('role', 'menu');

    function mark() {
      var active = window.NeoHeader.getTheme();
      menu.querySelectorAll('[data-theme-id]').forEach(function (item) {
        item.setAttribute('aria-checked', String(item.getAttribute('data-theme-id') === active));
      });
    }
    function close() {
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }

    themes.forEach(function (t) {
      var item = el('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('data-theme-id', t.id);
      item.setAttribute('aria-checked', 'false');
      item.innerHTML = '<span class="theme-swatch" style="background:' + t.swatch + '"></span>';
      item.appendChild(document.createTextNode(t.label));
      item.addEventListener('click', function () {
        window.NeoHeader.setTheme(t.id);
        mark();
        close();
        toggle.focus();
      });
      menu.appendChild(item);
    });

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      if (open) { mark(); var first = menu.querySelector('button'); if (first) first.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) close();
    });
    menu.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(menu.querySelectorAll('button'));
      var i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); close(); toggle.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
      else if (e.key === 'Tab') close();
    });

    mark();
    wrap.appendChild(toggle);
    wrap.appendChild(menu);
    return wrap;
  }

  /* ── Meta bar ────────────────────────────────────────────────────────
     "Part of Neorgon · Source · v1.2.0 · updated Aug 2026 [· Theme]".
     The hub link is skipped when the site already links neorgon.com, so
     retrofitting an existing footer never produces a duplicate. ─────── */
  function formatUpdated(raw) {
    var d = new Date(raw);
    if (isNaN(d)) return raw;
    return 'updated ' + d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  /* The hub, not merely something hosted on it. This used to be the selector
     a[href*="neorgon.com"], which a "you might also like" line pointing at a
     sibling site satisfies, so the attribution disappeared from the sites most
     likely to link their neighbours: client-says-site lost it that way, and
     incident-runbook-site and runcible-site were doing the same silently. A
     resolved .href is compared, so a relative link reads as this site's own
     origin (which is what it is) rather than matching on a substring. */
  function linksHub(inner) {
    var links = inner.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      if (/^https?:\/\/(www\.)?neorgon\.com(\/|$)/i.test(links[i].href)) return true;
    }
    return false;
  }

  function buildBar(footer, inner, disclaimer) {
    var items = [];
    if (disclaimer) items.push(disclaimer);

    /* Only add the hub link when the site's own copy doesn't already
       carry one — retrofits keep their hand-written "Part of Neorgon". */
    if (!linksHub(inner)) {
      /* The hub is a different site, so it opens in a new tab and says so with
         the same arrow every other outbound link here uses. It used to replace
         the page you were on, which on a game mid-run is a door you did not
         mean to walk through. */
      items.push(link(HUB, 'Part of Neorgon', true));
    }

    var repo = meta('neo-repo');
    if (repo) items.push(link(/^https?:/.test(repo) ? repo : GH + '/' + repo, 'Code', true));

    var version = meta('neo-version');
    if (version) items.push(el('span', 'neo-footer-stamp', /^v/i.test(version) ? version : 'v' + version));

    var updated = meta('neo-updated');
    if (updated) items.push(el('span', 'neo-footer-stamp', formatUpdated(updated)));

    if (meta('neo-theme-switcher') === 'footer') {
      var theme = buildThemeMenu();
      if (theme) items.push(theme);
    }

    if (!items.length) return null;

    /* The end mark leads the bar, so it reads as a colophon: "Fin. · Part of
       Neorgon · Source". Added only when a bar already exists, so a site that
       renders no bar today does not grow one (and its height budget holds).
       lang="fr" or a screen reader says the English word for a fish's fin. */
    if (footer.getAttribute('data-fin') !== 'off') {
      var fin = el('span', 'neo-footer-fin', 'Fin.');
      fin.lang = 'fr';
      items.unshift(fin);
    }

    var bar = el('div', 'neo-footer-bar');
    /* Content mode splits the bar: © on the left, everything else right. */
    var host = bar;
    if (footer.getAttribute('data-footer-mode') === 'content') {
      bar.appendChild(el('span', null, '© ' + new Date().getFullYear() + ' Neorgon'));
      host = el('div', 'neo-footer-bar-group');
      bar.appendChild(host);
    }

    items.forEach(function (item, i) {
      if (i) host.appendChild(sep());
      host.appendChild(item);
    });
    return bar;
  }

  /* ── Disclaimer dialog ───────────────────────────────────────────────
     Long-form copy — provenance, licensing, "this is not advice" — is worth
     keeping and worth reading once. Stacked above the footer bar it is
     neither: it pushes the bar down the page and nobody reads a 99-word
     paragraph in 12px grey (affinity ran 99 words, glassbox 57, headpain 51).
     So the site authors it inside a <template> and the kit turns it into one
     bar link plus a modal.

     Native <dialog> on purpose: showModal() brings the focus trap, the Esc
     handler, the inert background and ::backdrop with it. A hand-rolled
     overlay would have to re-earn all four, and the two the fleet usually
     forgets are the ones a keyboard user notices first.

       <footer class="neo-footer" data-footer-mode="minimal">
         One line that stays visible.
         <template data-neo-disclaimer data-label="Full notice" data-title="About this tool">
           <p>The long copy, as much of it as you like.</p>
         </template>
       </footer> ───────────────────────────────────────────────────────── */
  var dialogSeq = 0;

  function buildDisclaimer(footer) {
    var tpl = footer.querySelector(':scope > template[data-neo-disclaimer]');
    if (!tpl) return null;
    tpl.parentNode.removeChild(tpl);

    var label = tpl.getAttribute('data-label') || 'Disclaimer';
    var title = tpl.getAttribute('data-title') || label;
    var titleId = 'neo-disclaimer-title-' + (++dialogSeq);

    var dlg = el('dialog', 'neo-modal');
    dlg.setAttribute('aria-labelledby', titleId);

    var head = el('div', 'neo-modal-head');
    var h = el('h2', 'neo-modal-title', title);
    h.id = titleId;
    var close = el('button', 'neo-modal-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    head.appendChild(h);
    head.appendChild(close);

    var body = el('div', 'neo-modal-body');
    body.appendChild(tpl.content.cloneNode(true));

    dlg.appendChild(head);
    dlg.appendChild(body);
    document.body.appendChild(dlg);

    close.addEventListener('click', function () { dlg.close(); });

    /* Esc is handled explicitly rather than left to showModal()'s built-in
       close request. Two reasons: the built-in could not be demonstrated in
       this environment (the key reached the document but no `cancel` fired),
       and several sites in the fleet already bind Esc at document level for
       their own panels. Closing here and stopping propagation means exactly
       one thing closes per press, and it is the thing on top. Harmless when
       the UA also handles it — close() on a closed dialog is a no-op. */
    dlg.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !dlg.open) return;
      e.stopPropagation();
      dlg.close();
    });
    /* Backdrop click: a click on the backdrop reports the <dialog> itself as
       target, since the backdrop is its pseudo-element and not a node. */
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

    var trigger = el('button', 'neo-footer-disclaimer', label);
    trigger.type = 'button';
    trigger.addEventListener('click', function () {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    });
    return trigger;
  }

  /* ── Back to top ─────────────────────────────────────────────────────
     Yielding. The button floats over whatever the page keeps in its
     bottom-right corner, and on a phone that corner is where a drill puts its
     Done and Next: Runcible at 390px (2026-09-28) had the 38px circle over the
     right half of a 65px Next button, so a thumb aimed at Next scrolled the
     page to the top instead. So the button looks at what it is sitting on and
     steps aside while that is something a person could press: it fades out and
     stops taking taps until the corner is clear again.

     Hidden rather than moved. A button shifted up lands on the next control
     up, and the corner belongs to the page; back-to-top is a convenience. The
     same rule keeps it off the beacon kit's bottom-left control, which is a
     link, on any viewport narrow enough for the two to meet.

     What counts is deliberately generous. A false positive costs the
     convenience for as long as the corner is busy; a false negative costs a
     tap. cursor:pointer catches the div with a click listener that none of the
     selectors name. */
  var PRESSABLE = 'a[href], button, input, select, textarea, summary, label, iframe, ' +
    'audio[controls], video[controls], .neo-beacon-link, ' +
    '[contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"]), ' +
    '[role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], ' +
    '[role="tab"], [role="option"], [role="slider"], [role="textbox"], ' +
    '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';
  /* Samples per axis over the button's box plus PROBE_PAD of thumb slop. Four
     across a 46px box are 15px apart, so any target at least that size that
     touches the box is seen. */
  var PROBE_GRID = 4;
  var PROBE_PAD = 4;
  /* Mutations arrive in bursts, so the page changing under the button is
     looked at no more than once per SETTLE_MS. */
  var SETTLE_MS = 120;
  /* Once out of the way it stays out until scrolling has stopped this long,
     so a list of rows sliding under it does not blink it on and off. Leaving
     is never delayed: the tap it would steal can come at any moment. */
  var RETURN_MS = 180;

  function pressable(node) {
    if (!node || node === document.body || node === document.documentElement) return false;
    if (node.closest && node.closest(PRESSABLE)) return true;
    return window.getComputedStyle(node).cursor === 'pointer';
  }

  /* What a tap at (x, y) would reach if the button were not there:
     elementsFromPoint lists the whole stack top-down, so it is the first entry
     that is not the button or its icon. */
  function beneath(btn, x, y) {
    var stack = document.elementsFromPoint(x, y);
    for (var i = 0; i < stack.length; i++) {
      if (!btn.contains(stack[i])) return stack[i];
    }
    return null;
  }

  /* The show/hide transition translates the button by 8px. The probe reads
     where it rests, not where it happens to be mid-fade. */
  function translation(node) {
    var t = window.getComputedStyle(node).transform;
    if (!t || t === 'none' || typeof window.DOMMatrixReadOnly !== 'function') return { x: 0, y: 0 };
    var m = new window.DOMMatrixReadOnly(t);
    return { x: m.e, y: m.f };
  }

  function overControl(btn) {
    if (typeof document.elementsFromPoint !== 'function') return false;
    var box = btn.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    var shift = translation(btn);
    var left = box.left - shift.x - PROBE_PAD;
    var top = box.top - shift.y - PROBE_PAD;
    var w = box.width + PROBE_PAD * 2;
    var h = box.height + PROBE_PAD * 2;
    var seen = [];
    for (var i = 0; i < PROBE_GRID; i++) {
      for (var j = 0; j < PROBE_GRID; j++) {
        var node = beneath(btn, left + w * i / (PROBE_GRID - 1), top + h * j / (PROBE_GRID - 1));
        if (!node || seen.indexOf(node) !== -1) continue;
        if (pressable(node)) return true;
        seen.push(node);
      }
    }
    return false;
  }

  function buildBackToTop(footer) {
    if (footer.getAttribute('data-footer-top') === 'off') return;

    var btn = el('button', 'neo-top');
    btn.type = 'button';
    btn.title = 'Back to top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

    btn.addEventListener('click', function () {
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      /* Keep keyboard users oriented: park focus on the top landmark. */
      var landmark = document.querySelector('.header-bar, header, #main');
      if (landmark) {
        landmark.setAttribute('tabindex', '-1');
        landmark.focus({ preventScroll: true });
      }
    });

    document.body.appendChild(btn);

    var ticking = false;
    var yielding = false;
    var lastScroll = 0;
    var settle = 0;
    var back = 0;

    function update() {
      ticking = false;
      var past = window.scrollY > TOP_THRESHOLD;
      /* Focus means a keyboard user is on it, and a key press is not a tap
         that could land on the wrong thing, so it never yields from under
         them. */
      var blocked = past && document.activeElement !== btn && overControl(btn);
      if (blocked) {
        yielding = true;
      } else if (yielding && past && Date.now() - lastScroll < RETURN_MS) {
        clearTimeout(back);
        back = setTimeout(schedule, RETURN_MS);
      } else {
        yielding = false;
      }
      btn.classList.toggle('is-visible', past && !yielding);
      btn.classList.toggle('is-yielding', past && yielding);
    }
    function schedule() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }
    /* The page can put a control under the button with no scroll at all: a
       drill draws its next card, a panel opens, an embed finishes loading. */
    function soon() {
      if (settle) return;
      settle = setTimeout(function () { settle = 0; schedule(); }, SETTLE_MS);
    }

    window.addEventListener('scroll', function () {
      lastScroll = Date.now();
      schedule();
    }, { passive: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('transitionend', soon, true);
    document.addEventListener('animationend', soon, true);
    if (window.MutationObserver) {
      new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          if (!btn.contains(records[i].target)) { soon(); return; }
        }
      }).observe(document.body, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'open', 'disabled'],
      });
    }
    update();
    return btn;
  }

  /* ── Init ────────────────────────────────────────────────────────── */
  function init() {
    /* Generic nicety: any element marked data-neo-year gets the current
       year, so hand-written © lines never go stale. */
    var year = String(new Date().getFullYear());
    document.querySelectorAll('[data-neo-year]').forEach(function (n) { n.textContent = year; });

    var footers = Array.prototype.slice.call(document.querySelectorAll('.neo-footer'));
    if (!footers.length) return;

    footers.forEach(function (footer) {
      if (footer.__neoDone) return;
      footer.__neoDone = true;
      if (!footer.hasAttribute('data-footer-mode')) footer.setAttribute('data-footer-mode', 'minimal');
      /* Lift the template out before ensureInner sweeps loose children into
         .neo-footer-inner — otherwise the dialog's source ends up nested in
         the visible note it exists to replace. */
      var disclaimer = buildDisclaimer(footer);
      var inner = ensureInner(footer);
      var bar = buildBar(footer, inner, disclaimer);
      if (bar) footer.appendChild(bar);
    });

    /* The page's real footer is the last one under <body> (previews and
       embedded samples sit deeper). Only it gets pinned + back-to-top,
       and only it is the contentinfo landmark. */
    var primary = footers.filter(function (f) { return f.parentElement === document.body; }).pop() ||
                  footers[footers.length - 1];
    if (!primary.hasAttribute('role')) primary.setAttribute('role', 'contentinfo');
    ensurePinning(primary);
    buildBackToTop(primary);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.NeoFooter = { init: init };
})();
