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
  var logHost = null;

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

  function drawLog() {
    if (!logHost) return;
    U.clear(logHost);
    if (!log.length) {
      logHost.appendChild(el('p', { class: 'tiny' }, [
        'Rolls you make on the sheet appear here.'
      ]));
      return;
    }
    log.forEach(function (r, i) {
      logHost.appendChild(el('div', { class: 'rolline' + (i ? '' : ' fresh') }, [
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

  function scopeRules(rules, out) {
    Array.prototype.forEach.call(rules, function (r) {
      if (r.type === 1) {                      /* style rule */
        out.push(scopeSelector(r.selectorText) + '{' + r.style.cssText + '}');
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

    /* Re-read the roster every time the tab opens. The sheet loads its state
       once at boot, which is right in a symbiote that owns its storage and
       wrong here - a character built on the Character tab a moment ago has to
       show up without a page reload. */
    if (VT.sheetApp) VT.sheetApp.reload();

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

    side.appendChild(el('div', { class: 'sec' }, [
      el('div', { class: 'sec-h' }, ['Dice']),
      el('div', { class: 'sec-b' }, [
        (logHost = el('div', { class: 'rolllog' })),
        el('div', { class: 'btnrow', style: { marginTop: '8px' } }, [
          el('button', { class: 'btn sm danger', onClick: function () {
            log.length = 0; drawLog();
          } }, ['Clear'])
        ]),
        el('p', { class: 'tiny' }, [
          'Rolled here in the browser. In TaleSpire the same buttons throw real ' +
          'dice in the tray instead.'
        ])
      ])
    ]));
    drawLog();
  }

  /* Called when the Forge leaves the Sheet tab: park the skeleton back out of
     the way so the next render does not inherit it. */
  function hide() {
    var host = document.getElementById('sheetHost');
    if (!host) return;
    host.classList.add('hidden');
    document.body.appendChild(host);
    logHost = null;
  }

  VT.sheetView = { render: render, hide: hide, roster: roster };
})();
