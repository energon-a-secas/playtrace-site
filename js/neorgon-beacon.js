/* ══════════════════════════════════════════════════════════════
   Neorgon Beacon Kit: beacon.js
   A ladybug in the footer bar that lets a visitor report an issue.
   Canonical source: packages/neorgon-ui/beacon/
   Vendored per site as js/neorgon-beacon.js. Do not edit copies.

   Classic script, not an ES module, loaded with `defer`. Half the fleet has
   no module setup at all, and the sweep that vendors this has to be a
   one-liner on every site including the single-file ones.

   No dependencies, no network request, and no form. The widget is a flag
   plus context capture: it opens Balise's own report page with
   {v, site, url, target} in the URL fragment and the visitor writes there,
   same-origin (CONTRACTS.md D1 and C1.3). It never emits the three fields a
   person types, which is why nothing anyone types can land in a URL, in
   browser history, or in an access log on either side.

   Namespace note (PLAN.md F1): the header kit loads Cloudflare Insights,
   also called a beacon (`beacon.min.js`, `data-cf-beacon`), in all 68
   vendored copies. Everything here is `neo-beacon-*` in CSS,
   `neorgon-beacon.*` on disk and `NeoBeacon` in JS. The attribute is
   `data-beacon-target`, never `data-beacon`.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__neoBeaconInit) return;
  window.__neoBeaconInit = true;

  var VERSION = '1.1.0';
  var REPORT_URL = 'https://balise.neorgon.com/report/';

  /* CONTRACTS.md C1 lengths, restated as numbers rather than imported,
     because this file ships to sixty repos with no build step. A change here
     is a contract change and goes through delivery-lead. */
  var MAX_URL = 512;
  var MAX_KIND = 32;
  var MAX_ID = 128;
  var MAX_LABEL = 120;

  function meta(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el && el.content ? el.content.trim() : '';
  }

  var SITE = meta('beacon-site');

  /* ── Target resolution (C1.1), first hit wins ───────────────────────
     1. a resolveTarget the host site registered on window.NeoBeacon
     2. the nearest [data-beacon-target] ancestor, parsed as "kind:id"
     3. null, and the report is page level

     Step 3 is a requirement, not a fallback. A site that drops this kit in
     with no markup changes gets working page-level reports, which is what
     makes the fleet sweep a one-liner. ──────────────────────────────── */
  function trunc(value, max) {
    var s = value == null ? '' : String(value).trim();
    return s.length > max ? s.slice(0, max) : s;
  }

  function shape(t) {
    if (!t || !t.id) return null;
    /* Case is the one thing normalised here. C1 spells target.kind
       lowercase, and a site that writes "Concept:cool" means the same
       vocabulary word. Everything else is passed through as authored: the
       Worker owns validation (C1.2), and a widget that quietly repaired a
       malformed id would hide the site's bug instead of surfacing it. */
    return {
      kind: trunc(t.kind || 'item', MAX_KIND).toLowerCase(),
      id: trunc(t.id, MAX_ID),
      label: trunc(t.label || t.id, MAX_LABEL)
    };
  }

  function resolveTarget(node) {
    var hook = window.NeoBeacon && window.NeoBeacon.resolveTarget;
    if (typeof hook === 'function') {
      var hooked = null;
      try {
        hooked = hook(node);
      } catch (err) {
        /* A hook that throws is the site's bug, said out loud. Resolution
           then continues to step 2: the documented order, not a rescue. */
        if (window.console) console.error('[beacon] resolveTarget threw', err);
      }
      var shaped = shape(hooked);
      if (shaped) return shaped;
    }

    var host = node && node.closest ? node.closest('[data-beacon-target]') : null;
    if (host) {
      var raw = (host.getAttribute('data-beacon-target') || '').trim();
      if (raw) {
        /* A single flat "kind:id" string on purpose. JSON in an HTML
           attribute breaks on a quote in the label. */
        var cut = raw.indexOf(':');
        var fromAttr = shape({
          kind: cut > 0 ? raw.slice(0, cut) : 'item',
          id: cut > 0 ? raw.slice(cut + 1) : raw,
          label: host.getAttribute('data-beacon-label') || host.textContent || ''
        });
        if (fromAttr) return fromAttr;
      }
    }

    return null;
  }

  /* ── What the visitor was looking at ────────────────────────────────
     The beacon sits in the footer, so by the time it is activated it is
     itself the focused element, and reaching it was a scroll away from the
     thing being reported. Track the last thing the person touched or
     focused outside the widget and resolve against that.
     Both events, because plenty of reportable things in this fleet are
     cards and table rows that never take focus. ────────────────────── */
  var lastContext = null;
  var link = null;

  function remember(e) {
    var t = e.target;
    if (!t || typeof t.closest !== 'function') return;
    if (t.closest('.neo-beacon-link')) return;
    lastContext = t;
  }

  /* ── The hand-off URL ───────────────────────────────────────────────
     {v, site, url, target} and nothing else. C1.3: the visitor has typed
     nothing at this point, and the widget has no field for them to type
     into. Balise's page adds the rest, same-origin. ─────────────────── */
  function href() {
    return REPORT_URL + '#' + encodeURIComponent(JSON.stringify({
      v: 1,
      site: SITE,
      url: trunc(location.href, MAX_URL),
      target: resolveTarget(lastContext || document.body)
    }));
  }

  /* Recomputed at every activation path rather than on every interaction on
     the page: pointerdown precedes click, auxclick and contextmenu, and
     focus precedes Enter, so the href is current by the time anything can
     act on it and no cost lands on ordinary browsing. */
  function refresh() {
    if (link) link.href = href();
  }

  function open(context) {
    if (context) lastContext = context;
    var url = href();
    if (link) link.href = url;
    window.open(url, '_blank', 'noopener');
  }

  /* ── Activation ─────────────────────────────────────────────────────
     window.open runs synchronously here so the user gesture that permits
     opening a tab is still live (D1).

     The control is a real <a> carrying the same URL, and that is the answer
     to a blocked popup. window.open with 'noopener' returns null whether the
     tab opened or the browser refused it, so nothing here can branch on the
     outcome and any message claiming success would be a guess. What the
     widget can guarantee is that a refusal leaves something to act on: the
     browser shows its own blocked-popup indicator, and the link is still on
     screen, still addressed to the same report, still activatable by a
     second click, by the keyboard, or by "open in new tab".

     A modified or non-primary activation is not intercepted at all, so
     cmd-click, ctrl-click, shift-click and middle click reach the href
     through the browser's own path. ─────────────────────────────────── */
  function onClick(e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    /* Built before the default is suppressed: if this throws, the error
       reaches the console and the anchor's own navigation still carries the
       person to the report page with the URL it last held. */
    var url = href();
    link.href = url;
    e.preventDefault();
    window.open(url, '_blank', 'noopener');
  }
  /* ── Where it sits: the bottom of the page ──────────────────────────
     Docked in the footer kit's bar, in flow, so it is never drawn over the
     page. It used to float in the bottom-left corner, and every site that
     met it paid for that: the footer copy sat under it on pages that do not
     scroll (queue #88, which grew a measured --beacon-clear, a ResizeObserver
     and a frame watcher to lift it clear), Runcible shortened its chapter
     rail by the control's height and hid it during drills, and Playtrace
     moved it into its own footer by hand. A control in the footer has
     nothing to clear and nothing to cover, on a phone or anywhere else.

     It leads the bar rather than trailing it. The trailing end of the bar is
     where the footer kit's back-to-top rests on an app-mode page (right and
     bottom 20px), and two controls stacked there is the overlap this move
     exists to remove. Leading, it sits left of "Fin." in every mode, and in
     content mode at the head of the right-hand group, beside the links it
     belongs with.

     The page's real footer is found by the footer kit's own rule: the last
     .neo-footer directly under <body>, since previews and embedded samples
     sit deeper. A page with no footer at all keeps the old floating corner,
     the one place left that nothing else marks as the bottom. ─────────── */
  function primaryFooter() {
    var all = document.querySelectorAll('.neo-footer');
    var last = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].parentElement === document.body) last = all[i];
    }
    return last || all[all.length - 1] || null;
  }

  function childOf(parent, cls) {
    for (var n = parent.firstElementChild; n; n = n.nextElementSibling) {
      if (n.classList.contains(cls)) return n;
    }
    return null;
  }

  /* footer.js always builds .neo-footer-inner, so a footer without one is a
     footer it has not reached yet. Both kits are deferred and the sync script
     wires this one after the footer's line, but the order is still the host
     page's to choose. */
  function built(footer) {
    return !!(childOf(footer, 'neo-footer-inner') || childOf(footer, 'neo-footer-bar'));
  }

  function place() {
    var footer = primaryFooter();
    if (!footer) {
      link.classList.remove('is-docked');
      if (link.parentNode !== document.body) document.body.appendChild(link);
      return;
    }
    var bar = childOf(footer, 'neo-footer-bar');
    /* A footer whose copy already links the hub and declares no repo,
       version or stamp gets no bar from the kit. The control then closes the
       footer itself rather than building a bar of its own, which would hand
       that site a row the footer kit chose not to draw. */
    var host = bar ? (childOf(bar, 'neo-footer-bar-group') || bar) : footer;
    link.classList.add('is-docked');
    host.insertBefore(link, bar ? host.firstChild : null);
  }

  function dock() {
    var footer = primaryFooter();
    if (footer && !built(footer) && document.readyState !== 'complete') {
      /* Placed once the footer exists, so its sweep of loose children into
         .neo-footer-inner cannot carry the control off into the copy. Both
         events, because a script injected after DOMContentLoaded would wait
         for it forever; place() is idempotent, so the second is harmless. */
      document.addEventListener('DOMContentLoaded', place);
      window.addEventListener('load', place);
      return;
    }
    place();
  }

  /* ── The control ──────────────────────────────────────────────────
     A ladybug, because a bug is what the fleet already calls a thing that is
     wrong, and a ladybug is the one bug that reads as friendly at 18px: round
     spotted body, solid head, antennae, legs. Drawn on the fleet's icon grid,
     24x24 with one 2px stroke, round caps and joins, stroked in currentColor
     so the lit state and every theme recolour it. 51% ink at 16px, under the
     55% the favicon audit holds glyphs to. */
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(name, attrs) {
    var n = document.createElementNS(SVG_NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function ladybug() {
    var icon = svgEl('svg', {
      viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
      focusable: 'false'
    });
    icon.appendChild(svgEl('circle', { cx: '12', cy: '14.5', r: '6.5' }));
    icon.appendChild(svgEl('path', { d: 'M9 8.6a3 3 0 0 1 6 0z', fill: 'currentColor' }));
    icon.appendChild(svgEl('path', {
      d: 'M12 8.6V21M10.5 6 9 3.8M13.5 6 15 3.8M6 12l-2.4-1.2M6 17l-2.4 1.2' +
         'M18 12l2.4-1.2M18 17l2.4 1.2'
    }));
    icon.appendChild(svgEl('circle', { cx: '8.8', cy: '14.5', r: '1.5', fill: 'currentColor', stroke: 'none' }));
    icon.appendChild(svgEl('circle', { cx: '15.2', cy: '14.5', r: '1.5', fill: 'currentColor', stroke: 'none' }));
    return icon;
  }

  function buildLink() {
    var a = document.createElement('a');
    a.className = 'neo-beacon-link';
    a.id = 'neo-beacon-link';
    a.target = '_blank';
    /* noreferrer as well as noopener. It strips the Referer header, so the
       host page URL reaches Balise only inside the fragment, which no server
       is ever sent. Without it that same URL lands in an access log. */
    a.rel = 'noopener noreferrer';
    a.title = 'Report an issue';
    a.setAttribute('aria-label', 'Report an issue, opens Balise in a new tab');
    a.appendChild(ladybug());

    /* No inline handlers anywhere in this kit. pointerenter is here so the
       browser's own status-bar preview names the real destination before the
       person commits to it, which is half the value of shipping a link. */
    a.addEventListener('pointerenter', refresh);
    a.addEventListener('pointerdown', refresh);
    a.addEventListener('focus', refresh);
    a.addEventListener('contextmenu', refresh);
    a.addEventListener('click', onClick);
    return a;
  }

  /* ── Init ───────────────────────────────────────────────────────── */
  function init() {
    if (meta('beacon') === 'off') return;

    if (!SITE) {
      /* No site id means no valid report under C1, so nothing is drawn. Said
         out loud rather than guessed from the hostname: sync-beacon.sh writes
         this tag, and a missing one means the sweep did not finish here. */
      if (window.console) {
        console.warn('[beacon] no <meta name="beacon-site">, widget not shown. ' +
          'Run packages/neorgon-ui/sync-beacon.sh --to <this site>.');
      }
      return;
    }

    document.addEventListener('focusin', remember, true);
    document.addEventListener('pointerdown', remember, true);
    link = buildLink();
    refresh();
    dock();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  var api = window.NeoBeacon || {};
  api.version = VERSION;
  api.open = open;
  /* Left alone if the host already assigned one before this script ran. */
  if (typeof api.resolveTarget !== 'function') api.resolveTarget = null;
  window.NeoBeacon = api;
})();
