/* ══════════════════════════════════════════════════════════════
   Neorgon Beacon Kit: beacon.js
   A dimmed bottom-left control that lets a visitor report a correction.
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

  var VERSION = '1.0.0';
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
     The beacon is a fixed control in a corner, so by the time it is
     activated it is itself the focused element. Track the last thing the
     person touched or focused outside the widget and resolve against that.
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

  /* ── Clearing the footer (queue #88) ────────────────────────────────
     A fixed bottom-left control assumes the bottom-left of the viewport
     belongs to nobody. On a page that does not scroll, the footer kit pins
     its bar to the viewport floor and this icon lands on that copy. Seven
     sites pair the beacon with data-footer-mode="app", and two of them fixed
     it by measuring their own footer and hardcoding --beacon-offset: 62px and
     88px on aficion, 82px and 110px on portent. Four numbers, one
     measurement, redone per site and per breakpoint, and wrong again as soon
     as the footer copy wraps differently.

     So the kit measures. --beacon-clear is however much of the footer is
     inside the viewport plus GAP, and the CSS takes max() of that and the
     resting offset: on a long page the control sits exactly where it always
     did and rises only as the footer scrolls in. The hardcoded values were
     this same arithmetic done by hand, which is why a 50px app footer plus
     GAP is aficion's 62.

     Measured, not derived from data-footer-mode: mode names a set of
     paddings, not a height, and `minimal` alone ranges from one line to two.
     ─────────────────────────────────────────────────────────────────── */
  var GAP = 12;
  var footer = null;
  var observed = null;
  var ro = null;
  var queued = false;
  var placed = null;
  /* Frames still loading, and whether the observer is on: see below. */
  var waiting = [];
  var watching = false;

  function footerEl() {
    /* Looked up late and re-looked-up when it goes away. Both this file and
       footer.js are deferred, and which runs first is the host page's script
       order, so a footer resolved once at init is a footer half the fleet
       would not have found. */
    if (footer && footer.isConnected) return footer;
    footer = document.querySelector('.neo-footer');
    return footer;
  }

  function clearance() {
    var el = footerEl();
    if (!el) return 0;
    var box = el.getBoundingClientRect();
    /* A zero height is display:none, a print sheet, or a footer the kit has
       not filled in yet. Nothing to clear either way. */
    if (box.height <= 0) return 0;
    var view = window.innerHeight || 0;
    /* The footer's TOP edge, measured up from the viewport floor. Not its
       height: a long page's footer is below the fold and must move the control
       nowhere, and a half-scrolled footer must be cleared by the part that is
       actually in the way. */
    var lift = view - box.top;
    if (lift <= 0) return 0;
    /* A footer taller than the viewport (content mode on a phone) would
       otherwise push the control off the top of the screen, which is worse
       than an overlap: the widget becomes unreachable. */
    var ceiling = view - (link ? link.offsetHeight : 0) - GAP;
    return Math.max(0, Math.min(Math.round(lift) + GAP, Math.round(ceiling)));
  }

  /* Written only when it changes. Most frames on a long page measure 0 again,
     and a write is a style invalidation on the scroll path for nothing. */
  function place() {
    queued = false;
    if (!link) return;
    var value = clearance() + 'px';
    if (value === placed) return;
    placed = value;
    link.style.setProperty('--beacon-clear', value);
  }

  /* Coalesced into a frame. Scroll fires far more often than the control can
     usefully move, and reading a rect per event is a layout read on the
     scroll path of every site in the fleet. */
  function schedule() {
    if (queued) return;
    queued = true;
    if (window.requestAnimationFrame) window.requestAnimationFrame(place);
    else setTimeout(place, 16);
  }

  function watchFooter() {
    schedule();
    if (!window.ResizeObserver || waiting.length) return;
    if (!ro) ro = new window.ResizeObserver(schedule);
    if (!watching) {
      /* The footer's POSITION, which its own size says nothing about. It sits
         in flow after the page's content, so content that arrives late (a
         view rendered from a fetch, an image, a webfont reflowing a long
         page) pushes it down with no scroll, no resize and no change to its
         height. Runcible measured 345px while its #view still said "Loading"
         and kept it over the chapter text until the reader scrolled. Content
         that moves the footer changes the body's height, so the body is
         observed too. Not a MutationObserver: that fires on every text node a
         timer touches, and most mutations move nothing. */
      ro.observe(document.body);
      watching = true;
    }
    var el = footerEl();
    if (!el || el === observed) return;
    if (observed) ro.unobserve(observed);
    ro.observe(el);
    observed = el;
  }

  /* ── Standing aside while a frame loads ─────────────────────────────
     Firefox answers a ResizeObserver by flushing layout for every
     same-process document in the page's tree before it notifies, and a frame
     still fetching its stylesheets is one of them. Its layout is forced
     before its sheets arrive, which risks a flash of unstyled content and
     logs "Layout was forced before the page was fully loaded". Runcible's
     Yomu reader logged it on 10 loads of 10 while this kit kept one.

     So while any frame on the page is still loading, the kit keeps no
     ResizeObserver: it disconnects, or never connects. Scroll, resize and
     load still place the control; a rect read flushes this document and its
     ancestors, never a frame inside it. When the last frame fires load (or
     error) the observer comes back, and one placement catches up with
     whatever moved while it was away.

     A frame that never fires load (a lazy one far below the fold, a host
     that never answers) must not switch the observer off for good, so each
     one is waited for FRAME_WAIT at most and then stops counting. */
  var FRAME_WAIT = 10000;

  function loadsDocument(frame) {
    if (frame.hasAttribute('srcdoc')) return true;
    /* No src, or about:blank, is the empty document every frame starts
       with: no stylesheet to wait for, and its load fires during the
       insertion itself, before any observer could hear it. */
    var src = (frame.getAttribute('src') || '').trim();
    return src !== '' && !/^about:/i.test(src);
  }

  function expect(frame) {
    if (!frame.isConnected || !loadsDocument(frame)) return;
    for (var i = 0; i < waiting.length; i++) {
      if (waiting[i].frame === frame) return;
    }
    /* early: it began loading before the page's own load, see onLoad. */
    var w = { frame: frame, early: document.readyState !== 'complete' };
    w.done = function () { if (drop(w) && !waiting.length) watchFooter(); };
    frame.addEventListener('load', w.done);
    frame.addEventListener('error', w.done);
    w.timer = setTimeout(w.done, FRAME_WAIT);
    waiting.push(w);
  }

  function drop(w) {
    var at = waiting.indexOf(w);
    if (at < 0) return false;
    waiting.splice(at, 1);
    clearTimeout(w.timer);
    w.frame.removeEventListener('load', w.done);
    w.frame.removeEventListener('error', w.done);
    return true;
  }

  function standAside() {
    if (ro) ro.disconnect();
    watching = false;
    observed = null;
    /* Whatever inserted the frame may have moved the footer too, and the
       observer that would have said so is gone. */
    schedule();
  }

  /* Frames arrive at any time: Runcible builds Yomu's when its reader sheet
     first opens. The stance above, no MutationObserver, is about measuring
     on one. This one never measures. A clock that writes textContent every
     second does wake it (that replaces a child node), and each wake costs a
     nodeType test per added node and a tag lookup inside each added
     element: Runcible's 27 routes cost 53 wakes and 1.2ms in all. It reads
     no layout, writes no style and schedules nothing unless a frame went in
     or one being waited for went out. */
  function onMutations(records) {
    var had = waiting.length;
    var removed = false;
    for (var i = 0; i < records.length; i++) {
      var added = records[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var node = added[j];
        if (node.nodeType !== 1) continue;
        if (node.localName === 'iframe') expect(node);
        else if (node.firstElementChild) {
          var inner = node.getElementsByTagName('iframe');
          for (var k = 0; k < inner.length; k++) expect(inner[k]);
        }
      }
      if (records[i].removedNodes.length) removed = true;
    }
    /* A frame taken out before it loaded never fires load. */
    if (removed) {
      for (var n = waiting.length - 1; n >= 0; n--) {
        if (!waiting[n].frame.isConnected) drop(waiting[n]);
      }
    }
    if (!had && waiting.length) standAside();
    else if (had && !waiting.length) watchFooter();
  }

  function onLoad() {
    /* The page's load waits for every frame that began loading before it,
       lazy ones aside, so a frame like that still listed here loaded before
       the kit was listening to it. */
    for (var i = waiting.length - 1; i >= 0; i--) {
      var w = waiting[i];
      if (w.early && w.frame.getAttribute('loading') !== 'lazy') drop(w);
    }
    watchFooter();
  }

  function watch() {
    place();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    /* The footer moves or changes height with no scroll and no resize: the
       kit appends its bar after this script may have run, a disclaimer dialog
       closes, a webfont lands and one line becomes two, a view renders late
       and pushes it below the fold. `load` catches the late build, the
       observer on the footer and the body catches the rest. */
    window.addEventListener('load', onLoad);
    if (window.ResizeObserver) {
      /* Frames already in the page count as loading: nothing outside a
         frame can tell whether one has finished. */
      var found = document.getElementsByTagName('iframe');
      for (var i = 0; i < found.length; i++) expect(found[i]);
      if (window.MutationObserver) {
        new window.MutationObserver(onMutations)
          .observe(document, { childList: true, subtree: true });
      }
    }
    watchFooter();
  }

  /* ── The control ────────────────────────────────────────────────── */
  function buildLink() {
    var a = document.createElement('a');
    a.className = 'neo-beacon-link';
    a.id = 'neo-beacon-link';
    a.target = '_blank';
    /* noreferrer as well as noopener. It strips the Referer header, so the
       host page URL reaches Balise only inside the fragment, which no server
       is ever sent. Without it that same URL lands in an access log. */
    a.rel = 'noopener noreferrer';
    a.title = 'Report a correction';
    a.setAttribute('aria-label', 'Report a correction, opens Balise in a new tab');

    var ns = 'http://www.w3.org/2000/svg';
    var icon = document.createElementNS(ns, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.7');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('aria-hidden', 'true');

    var core = document.createElementNS(ns, 'circle');
    core.setAttribute('cx', '12');
    core.setAttribute('cy', '12');
    core.setAttribute('r', '2.6');
    core.setAttribute('fill', 'currentColor');
    core.setAttribute('stroke', 'none');
    icon.appendChild(core);

    ['M16.6 7.4a6.5 6.5 0 0 1 0 9.2', 'M7.4 16.6a6.5 6.5 0 0 1 0-9.2',
     'M19.4 4.6a10.5 10.5 0 0 1 0 14.8', 'M4.6 19.4a10.5 10.5 0 0 1 0-14.8'
    ].forEach(function (d) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      icon.appendChild(p);
    });

    a.appendChild(icon);

    /* No inline handlers anywhere in this kit. pointerenter is here so the
       browser's own status-bar preview names the real destination before the
       person commits to it, which is half the value of shipping a link. */
    a.addEventListener('pointerenter', refresh);
    a.addEventListener('pointerdown', refresh);
    a.addEventListener('focus', refresh);
    a.addEventListener('contextmenu', refresh);
    a.addEventListener('click', onClick);

    document.body.appendChild(a);
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
    watch();
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
