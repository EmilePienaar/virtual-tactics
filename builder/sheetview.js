/* The Forge :: sheetview.js
   Hosting the symbiote's character sheet inside the Forge.

   The sheet in tale-sheet/sheet.js is around two thousand lines of rolling,
   resting, levelling, spell slots, death saves, attunement and wild shape.
   Rebuilding that here would mean two implementations of the same rules
   drifting apart, and the second one always being the stale one - so this runs
   the real thing rather than a copy of it.

   Three things have to be arranged for it to work outside TaleSpire:

     1. The DOM it binds to. sheet.js looks up #view and #toast at boot, so the
        skeleton lives in the page from the start, hidden, rather than being
        built when the tab is opened - it boots on a timer and must not find an
        empty document.

     2. Storage. In the symbiote a character lives in TaleSpire's campaign
        storage. Here it should be the Forge's own roster, so the adapter below
        maps the sheet's blob onto VT.store.campaign.roster. Pick a character in
        the Roster tab, open the Sheet tab, and it is the same object.

     3. Dice. The development shim already rolls for real and returns results
        through onRollResults - it just has nowhere to show them. The roll log
        here listens in on that and prints what was thrown, which is what makes
        the sheet usable away from a dice tray. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, el = U.el;

  var log = [];          /* most recent first */

  /* ---- storage: the sheet's blob <-> the Forge's roster ------------------ */

  function roster() {
    if (!VT.store.campaign) {
      VT.store.init();
      if (!VT.store.campaign) VT.store.campaign = VT.store.blank('Sword Coast Skirmish');
    }
    VT.store.campaign.roster = VT.store.campaign.roster || [];
    return VT.store.campaign.roster;
  }

  var activeId = null;

  function campaignAdapter() {
    return {
      getBlob: function () {
        var list = roster();
        /* The remembered selection can point at somebody who has since been
           deleted on the Roster tab. Fall back rather than handing the sheet an
           id it cannot find. */
        var stillThere = activeId && list.some(function (c) { return c.id === activeId; });
        return Promise.resolve(JSON.stringify({
          v: 1,
          chars: list,
          activeId: stillThere ? activeId : ((list[0] && list[0].id) || null),
          postToChat: false,
          shareSheet: false
        }));
      },
      setBlob: function (raw) {
        var d;
        try { d = JSON.parse(raw || '{}'); } catch (e) { return Promise.resolve(); }
        if (Array.isArray(d.chars)) {
          /* Replace the roster contents in place. The array identity matters:
             the Roster tab holds a reference to it, and swapping the array
             would leave that tab editing a list nothing else can see. */
          var list = roster();
          list.length = 0;
          d.chars.forEach(function (c) { list.push(c); });
        }
        if (d.activeId) activeId = d.activeId;
        VT.store.autosave();
        return Promise.resolve();
      },
      deleteBlob: function () { return Promise.resolve(); }
    };
  }

  /* ---- the roll log ------------------------------------------------------ */

  /* The individual die faces, for showing what was actually thrown. The total
     comes from the shim's own evaluator rather than being re-added here, so a
     roll reads the same way it would in TaleSpire. */
  function faces(node, out) {
    out = out || [];
    if (!node) return out;
    if (node.results) out.push(node.results.slice());
    (node.operands || []).forEach(function (o) { faces(o, out); });
    return out;
  }

  function noteRoll(group, total) {
    log.unshift({
      name: group.name || 'Roll',
      total: total,
      dice: faces(group.result).reduce(function (a, b) { return a.concat(b); }, []),
      at: Date.now()
    });
    if (log.length > 40) log.length = 40;
    drawLog();
  }

  /* The log is a tray that shows up when dice are thrown and gets out of the
     way otherwise. Reading your own sheet is most of what you do on this tab,
     and a permanent panel for something that is empty most of the time was
     taking rail space to say nothing. */
  var tray = null, trayBody = null, minimised = false;

  function buildTray() {
    if (tray) return tray;
    trayBody = el('div', { class: 'tray-body' });
    var title = el('span', { class: 'tray-title' }, ['Dice']);
    var min = el('button', { class: 'tray-btn', title: 'Minimise' }, ['\u2013']);
    var close = el('button', { class: 'tray-btn', title: 'Clear and close' }, ['\u00d7']);

    min.addEventListener('click', function () {
      minimised = !minimised;
      tray.classList.toggle('min', minimised);
      min.textContent = minimised ? '\u25b2' : '\u2013';
      min.title = minimised ? 'Show the last rolls' : 'Minimise';
    });
    close.addEventListener('click', function () {
      log.length = 0;
      tray.classList.add('gone');
    });

    tray = el('div', { class: 'dicetray gone' }, [
      el('div', { class: 'tray-head' }, [title, min, close]),
      trayBody
    ]);
    document.body.appendChild(tray);
    return tray;
  }

  function drawLog() {
    buildTray();
    if (!log.length) { tray.classList.add('gone'); return; }
    tray.classList.remove('gone');
    /* A new roll while minimised is still worth a glance, so the newest line
       shows in the header strip rather than forcing the tray back open. */
    tray.querySelector('.tray-title').textContent = minimised
      ? log[0].name + ' \u2192 ' + (log[0].total == null ? '?' : log[0].total)
      : 'Dice';

    U.clear(trayBody);
    log.slice(0, 12).forEach(function (r, i) {
      trayBody.appendChild(el('div', { class: 'rolline' + (i ? '' : ' fresh') }, [
        el('span', { class: 'rn' }, [r.name]),
        el('span', { class: 'rd' }, [r.dice.length ? '[' + r.dice.join(', ') + ']' : '']),
        el('span', { class: 'rt' }, [r.total == null ? '?' : String(r.total)])
      ]));
    });
  }

  /* Chain the sheet's own results handler rather than replacing it: it uses
     those results for death saves and hit dice, and losing them would break
     the sheet in ways that only show up mid-fight. */
  function watchRolls() {
    var mine = window.onRollResults;
    if (!mine || mine.__forgeWatched) return;
    var wrapped = function (evt) {
      try { mine.apply(window, arguments); } catch (e) { /* the sheet's problem */ }
      var p = evt && evt.payload;
      if (!p || !p.resultsGroups) return;
      p.resultsGroups.forEach(function (g) {
        window.TS.dice.evaluateDiceResultsGroup(g)
          .then(function (total) { noteRoll(g, total); })
          .catch(function () { noteRoll(g, null); });
      });
    };
    wrapped.__forgeWatched = true;
    window.onRollResults = wrapped;
  }

  /* ---- keeping the sheet's stylesheet to itself -------------------------- */

  /* sheet.css was written for a page it owns: it sets :root variables, sizes
     html and body, styles #app to fill the viewport, and claims plain names
     like .card, .btn and .row. The Forge uses all of those too, so loading it
     as-is rearranges the host page - the first attempt at this put the Forge's
     own toolbar through a hedge.

     The fix has to keep ONE copy of that stylesheet. tale-sheet is what the
     table actually runs, so it cannot be edited to suit an embedder, and a
     hand-scoped duplicate would drift the first time either changed. So the
     rules are rewritten in place at load: every selector is prefixed with
     #sheetHost, and the three that mean "the whole page" are re-pointed at the
     host element instead. Same file, scoped automatically, nothing to keep in
     step by hand. */
  var HOST = '#sheetHost';
  var WHOLE_PAGE = { ':root': 1, 'html': 1, 'body': 1, '#app': 1 };

  function scopeSelector(sel) {
    return sel.split(',').map(function (part) {
      var t = part.trim();
      if (!t) return t;
      if (WHOLE_PAGE[t]) return HOST;
      /* "*" means everything in the sheet, host included - not the host alone,
         which would drop box-sizing from every element inside it. */
      if (t === '*') return HOST + ', ' + HOST + ' *';
      /* already ours, or targeting the host itself */
      if (t.indexOf(HOST) === 0) return t;
      return HOST + ' ' + t;
    }).join(', ');
  }

  /* sheet.css is sized for a phone-width panel in TaleSpire: 11px labels, 9px
     stat captions, buttons a thumb can just about hit. On a monitor that reads
     as a postage stamp in the middle of an empty page.

     Scaling happens here, in the same pass that scopes the selectors, rather
     than as a parallel set of overrides in sheet-embed.css. An override list
     would have to name every size in the file and would silently fall out of
     step the first time one changed; multiplying the values as they go past
     cannot. Only lengths that control apparent size are touched - borders and
     radii keep their pixel values, because a 1px rule scaled to 1.3px is just
     a blurry 1px rule. */
  var SCALE = 1.3;
  /* "font" is in the list because the browser re-serialises font-size,
     font-family and line-height back into the shorthand, so a rule that was
     written as font-size comes back out as "font: 13px/1.45 ..." and would
     escape a font-size-only match. The only px in that shorthand is the size. */
  var SCALED = /^(font|font-size|padding|padding-top|padding-right|padding-bottom|padding-left|gap|row-gap|column-gap|min-width|min-height|width|height)$/;

  /* Scale the rule's own text. Walking style[i] instead looks tidier and is
     wrong: iterating a declaration block yields the LONGHANDS of any shorthand,
     and a shorthand written with a var() - "background: var(--panel)",
     "border: 1px solid var(--line)" - cannot be decomposed before it is
     computed, so every longhand comes back as the empty string. Doing that
     silently stripped the background and border off every card. */
  function scaleDecls(style) {
    return style.cssText.replace(/(^|;)\s*([-a-zA-Z]+)\s*:\s*([^;]+)/g,
      function (whole, lead, prop, val) {
        if (!SCALED.test(prop.toLowerCase()) || val.indexOf('px') < 0) return whole;
        return lead + prop + ': ' + val.replace(/(-?[\d.]+)px/g, function (_, n) {
          return (Math.round(parseFloat(n) * SCALE * 100) / 100) + 'px';
        });
      });
  }

  function scopeRules(rules, out) {
    Array.prototype.forEach.call(rules, function (r) {
      if (r.type === 1) {                      /* style rule */
        out.push(scopeSelector(r.selectorText) + '{' + scaleDecls(r.style) + '}');
      } else if (r.type === 4) {               /* @media */
        var inner = [];
        scopeRules(r.cssRules, inner);
        out.push('@media ' + r.conditionText + '{' + inner.join('') + '}');
      } else if (r.type === 7 || r.type === 5) {
        out.push(r.cssText);                   /* @keyframes / @font-face */
      }
    });
    return out;
  }

  function scopeSheetCss() {
    var link = Array.prototype.slice.call(document.querySelectorAll('link[rel=stylesheet]'))
      .find(function (l) { return /tale-sheet\/sheet\.css$/.test(l.getAttribute('href') || ''); });
    if (!link || !link.sheet) return false;
    var rules;
    try { rules = link.sheet.cssRules; } catch (e) { return false; }
    if (!rules) return false;

    var css = scopeRules(rules, []).join('\n');
    var style = document.createElement('style');
    style.id = 'sheetScoped';
    style.textContent = css;
    document.head.appendChild(style);
    link.disabled = true;                      /* the unscoped original is done */
    return true;
  }

  /* The stylesheet may not have parsed yet when this file runs. Try now, and
     fall back to load/next-tick rather than leaving the host page restyled. */
  function ensureScoped() {
    if (document.getElementById('sheetScoped')) return;
    if (scopeSheetCss()) return;
    var tries = 0;
    var iv = setInterval(function () {
      if (scopeSheetCss() || ++tries > 40) clearInterval(iv);
    }, 25);
  }
  ensureScoped();

  /* ---- boot -------------------------------------------------------------- */

  /* sheet.js installs the shim itself during boot. Wrap that call so the
     storage adapter is in place before the sheet reads a single character, and
     the roll watcher goes on immediately after the sheet has registered its
     own handler. */
  var realInstall = window.installTSShim;
  window.installTSShim = function () {
    if (typeof realInstall === 'function') realInstall();
    if (window.TS && window.TS.localStorage) {
      window.TS.localStorage.campaign = campaignAdapter();
    }
    setTimeout(watchRolls, 0);
  };

  /* ---- grouping the sheet into sections ---------------------------------- */

  /* The sheet is one long strip, which is right in a phone-width panel and
     tiring on a monitor. The first attempt at fixing that set `columns: 2`,
     which was worse: multi-column flow runs down the first column and back up
     to the top of the second, so reading it means scrolling down, up, and down
     again for one character.

     Sections instead. The cards keep their order and their single column - only
     some of them are on screen at a time, which is the part that was actually
     tiring. Nothing here restructures the sheet's DOM: each card is tagged with
     an attribute and CSS hides the rest, so sheet.js can re-render whenever it
     likes and this just runs again. */
  var GROUPS = [
    { key: 'play',  label: 'Play',
      match: /^(abilities|skills|tools|actions|custom roll|conditions|wild shape|companion|resources)$|^$/i },
    /* Spells are their own section rather than a general "magic" one: the
       slots now sit inside the spell list, so there is nothing else left for a
       magic section to hold. */
    { key: 'spells', label: 'Spells',
      match: /^(spells|spell slots|pact magic)/i },
    { key: 'gear',  label: 'Gear',
      match: /^(coin|inventory|equipment|attunement|collect from)/i },
    { key: 'about', label: 'Character',
      match: /^(features|choices|details|rest|notes|ability score|proficiencies)/i }
  ];

  var activeGroup = 'play';
  var groupBar = null;
  var applying = false;

  /* Cards title themselves with an h3; the collapsible ones - Skills,
     Features, Choices - use a summary instead. Read whichever is there, and
     drop any trailing count so "Features - 13" still matches "features". */
  function headingOf(card) {
    var h = card.querySelector('h3') || card.querySelector('summary');
    if (!h) return '';
    return h.textContent.trim().split(/\s+[-—·]\s+/)[0].trim();
  }

  function groupFor(card, index) {
    /* The first card is the character themself - name, AC, HP, the hit point
       bar - and has no heading. It belongs with Play whatever else happens. */
    if (index === 0) return 'play';
    /* An assumed form or a companion is titled with the creature's name, which
       no heading rule can match - "Brown Bear" and "Beast of the Land" are not
       words this file can know. They carry a class instead, which is stable. */
    if (card.classList && card.classList.contains('wildshape')) return 'play';
    var h = headingOf(card);
    for (var i = 0; i < GROUPS.length; i++) {
      if (GROUPS[i].match.test(h)) return GROUPS[i].key;
    }
    return 'about';                 /* anything unrecognised is reference material */
  }

  function onSheetTab() {
    var on = document.querySelector('#sheetHost .tab.on');
    return !on || on.dataset.tab === 'sheet';
  }

  function applyGroups() {
    var view = document.getElementById('view');
    if (!view || applying) return;
    applying = true;

    var cards = Array.prototype.slice.call(view.children);
    var counts = {};
    cards.forEach(function (c, i) {
      var g = groupFor(c, i);
      c.setAttribute('data-group', g);
      counts[g] = (counts[g] || 0) + 1;
    });

    /* Edit and Build are sheet.js's own tabs and are not carved up. */
    var show = onSheetTab() && cards.length > 3;
    view.setAttribute('data-grp', show ? activeGroup : 'all');
    if (groupBar) {
      groupBar.classList.toggle('hidden', !show);
      U.clear(groupBar);
      if (show) {
        GROUPS.forEach(function (g) {
          if (!counts[g.key]) return;
          groupBar.appendChild(el('button', {
            class: 'sub-tab' + (g.key === activeGroup ? ' on' : ''),
            onClick: function () {
              activeGroup = g.key;
              applyGroups();
            }
          }, [g.label]));
        });
        /* If the section we were on has nothing in it for this character, fall
           back rather than showing an empty page. */
        if (!counts[activeGroup]) {
          var first = GROUPS.filter(function (g) { return counts[g.key]; })[0];
          if (first) { activeGroup = first.key; view.setAttribute('data-grp', activeGroup); }
        }
      }
    }
    applying = false;
  }

  /* sheet.js rebuilds #view on every change, so re-tag whenever it does. */
  function watchSheet() {
    var view = document.getElementById('view');
    if (!view || view.__grouped) return;
    view.__grouped = true;
    new MutationObserver(function () {
      if (!applying) applyGroups();
    }).observe(view, { childList: true });
  }

  /* ---- the Forge's Sheet tab --------------------------------------------- */

  function render(work, side) {
    var host = document.getElementById('sheetHost');
    if (!host) {
      work.appendChild(el('div', { class: 'warn-box' }, ['The sheet failed to load.']));
      return;
    }

    /* The skeleton lives in the page permanently so sheet.js can find it on
       boot; showing the tab is a matter of moving it into view. */
    host.classList.remove('hidden');
    work.appendChild(host);

    /* the section bar, inserted once, just under the sheet's own tabs */
    if (!groupBar) {
      groupBar = el('nav', { id: 'sheetGroups' });
      var tabs = host.querySelector('#tabs');
      if (tabs && tabs.parentNode) tabs.parentNode.insertBefore(groupBar, tabs.nextSibling);
    }
    watchSheet();

    /* The sheet's own tabs change what is in #view without replacing it, so
       re-evaluate the sections when one is clicked. */
    Array.prototype.slice.call(host.querySelectorAll('#tabs .tab')).forEach(function (t) {
      if (t.__grouped) return;
      t.__grouped = true;
      t.addEventListener('click', function () { setTimeout(applyGroups, 0); });
    });

    /* Re-read the roster every time the tab opens. The sheet loads its state
       once at boot, which is right in a symbiote that owns its storage and
       wrong here - a character built on the Character tab a moment ago has to
       show up without a page reload. */
    if (VT.sheetApp) VT.sheetApp.reload();
    setTimeout(applyGroups, 60);

    var list = roster();
    if (!list.length) {
      side.appendChild(el('div', { class: 'sec' }, [
        el('div', { class: 'sec-h' }, ['Nobody yet']),
        el('div', { class: 'sec-b' }, [
          el('p', { class: 'tiny' }, [
            'Build a character on the Character tab, or import one, and it ' +
            'appears here with a full sheet.'
          ])
        ])
      ]));
      return;
    }

    /* Nothing goes in the rail, and the dice tray floats, so give the sheet the
       whole width rather than leaving an empty panel beside it. */
    document.getElementById('bmain').classList.add('no-rail');
    buildTray();
    drawLog();
  }

  /* Called when the Forge leaves the Sheet tab: park the skeleton back out of
     the way so the next render does not inherit it. */
  function hide() {
    var host = document.getElementById('sheetHost');
    if (!host) return;
    host.classList.add('hidden');
    document.body.appendChild(host);
    document.getElementById('bmain').classList.remove('no-rail');
    if (tray) tray.classList.add('gone');
  }

  VT.sheetView = { render: render, hide: hide, roster: roster };
})();
