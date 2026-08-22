/* The Forge :: builder.js
   Character builder + creature editor + compendium browser, driven entirely by
   whatever 5etools-format data set you point it at.

   Nothing here is hard-coded to a particular book: races, classes, subclasses,
   backgrounds, items and spells are all read from the source. If your instance
   has a book, the builder has it too. Output is a Virtual Tactics statblock,
   which can be sent straight into the game's roster (same browser origin, so
   it writes to the same campaign) or exported as JSON. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, el = U.el, FT = VT.fivetools, CV = VT.convert, T = VT.tags, SRD = VT.srd;

  var POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
  var STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
  var STEPS = ['Race', 'Class', 'Abilities', 'Background', 'Equipment', 'Spells', 'Choices', 'Review'];

  var B = {
    mode: 'character',
    step: 0,
    char: null,
    forge: null,
    comp: { query: '', kinds: ['creature'], selected: null, history: [] }
  };

  var work, side, srcBadge;

  /* ==== boot ============================================================= */
  function boot() {
    work = U.$('#bwork');
    side = U.$('#bside');
    srcBadge = U.$('#srcBadge');

    if (!VT.store.init()) {
      VT.store.campaign = VT.store.blank('Sword Coast Skirmish');
    }
    B.char = blankCharacter();

    /* Homebrew loads before any data source, so you can author with no
       5etools folder connected at all. */
    VT.homebrew.load();
    VT.homebrew.apply();

    U.$$('.mode-btn').forEach(function (b) {
      b.onclick = function () { setMode(b.dataset.mode); };
    });
    U.$('#btnSource').onclick = sourceDialog;

    /* Startup order matters for "do I have to pick the folder again?":
         1. restore the parsed compendium from IndexedDB  (instant, no dialog)
         2. silently re-acquire a remembered directory handle, so Reload works
         3. if there is no cache but the handle is still granted, just read it
         4. only if all of that fails do we interrupt with the dialog */
    FT.loadCache()
      .then(function (rec) {
        return FT.reconnectDirectory().then(function (fs) { return { rec: rec, fs: fs }; });
      })
      .then(function (st) {
        updateBadge();
        setMode('character');
        if (FT.loaded) {
          if (st.rec) note('Compendium restored from cache — ' + fmtInt(FT.stats.records) + ' records.');
          return;
        }
        if (st.fs && st.fs.ok) {
          srcBadge.className = 'src-badge warn';
          srcBadge.textContent = 'reading “' + st.fs.name + '”…';
          return FT.loadAll(function () {}).then(function (stats) {
            if (stats.records) { FT.saveCache(); updateBadge(); render(); }
            else sourceDialog();
          }).catch(function () { sourceDialog(); });
        }
        sourceDialog();
      });
  }

  function fmtInt(n) { return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function note(msg) { console.log('[forge] ' + msg); }

  function updateBadge() {
    var hb = VT.homebrew.count();
    if (!FT.loaded) {
      srcBadge.className = 'src-badge warn';
      srcBadge.textContent = hb ? 'homebrew only · ' + hb : 'no source';
      return;
    }
    srcBadge.className = 'src-badge ok';
    srcBadge.title = FT.rememberedName()
      ? 'Remembered folder: ' + FT.rememberedName() +
        (FT.cachedAt ? ' · cached ' + new Date(FT.cachedAt).toLocaleString() : '')
      : (FT.baseUrl ? 'Source: ' + FT.baseUrl : 'Loaded from a one-time folder pick') +
        (FT.cachedAt ? ' · cached ' + new Date(FT.cachedAt).toLocaleString() : '');
    var books = Object.keys(FT.sources).length;
    srcBadge.textContent = fmtInt(FT.stats.records + hb) + ' records · ' + books + ' sources' +
      (hb ? ' · ' + hb + ' homebrew' : '');
  }

  function setMode(m) {
    B.mode = m;
    U.$$('.mode-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.mode === m); });
    render();
  }

  function render() {
    U.clear(work); U.clear(side);
    /* Homebrew authoring needs no compendium behind it, and neither does the
       roster - an already-built character carries its own numbers. Both are
       richer with a source connected, and both say so where it matters. */
    if (B.mode === 'roster') { VT.rosterUI.render(work, side, PARTS); return; }
    if (B.mode === 'homebrew') {
      VT.homebrewUI.render(work, function () { updateBadge(); });
      return;
    }
    if (!FT.loaded && B.mode !== 'source') {
      work.appendChild(el('div', { class: 'panel' }, [
        el('h2', { class: 'step' }, ['No data source connected']),
        el('p', { class: 'step-sub' }, [
          'The Forge reads races, classes, spells, items and monsters from a 5etools-format data set. ' +
          'Connect one to begin.'
        ]),
        btn('Connect a data source', sourceDialog, 'primary')
      ]));
      return;
    }
    if (B.mode === 'character') renderCharacter();
    else if (B.mode === 'forge') renderForge();
    else if (B.mode === 'roster') VT.rosterUI.render(work, side, PARTS);
    else renderCompendium();
  }

  function btn(label, fn, cls) { return el('button', { class: 'btn ' + (cls || ''), onClick: fn }, [label]); }

  /* Shared with the Roster tab (roster.js), which is a separate file only
     because this one is long enough already. It renders into the same two
     columns and re-enters through render(), so mode state stays here. */
  var PARTS = {
    render: render, btn: btn, row: row, numEl: numEl, selectEl: selectEl,
    splitList: splitList, actionEditor: actionEditor, browseList: browseList,
    sourceDialog: sourceDialog
  };

  /* ==== data source ====================================================== */
  function sourceDialog() {
    var body = el('div', {});
    var urlVal = FT.baseUrl || 'http://localhost:8080';
    var statusBox = el('div', {});
    var progressWrap = el('div', {});

    function setStatus(cls, msg) {
      U.clear(statusBox);
      statusBox.appendChild(el('div', { class: cls, html: msg }));
    }

    body.appendChild(el('p', { class: 'step-sub' }, [
      'Point the Forge at your own 5etools data. Nothing is downloaded from anywhere else, ' +
      'and nothing is bundled with this app — it reads only what you provide.'
    ]));

    /* The single most common reason a folder "will not stay connected". */
    if (location.protocol === 'file:') {
      body.appendChild(el('div', { class: 'warn-box', html:
        '<b>Opened from a file:// path.</b> Browsers give file:// pages unreliable storage ' +
        'and block the remembered-folder API entirely, so you can be asked to pick the ' +
        'folder every single time. Run <code>node tools/serve.js</code> and open ' +
        '<code>http://localhost:5173</code> instead — then everything below persists.'
      }));
    }

    /* --- remembered folder --- */
    var rememberBox = el('div', { class: 'panel' });
    body.appendChild(rememberBox);

    function drawRemembered(state) {
      U.clear(rememberBox);
      if (!FT.supportsFS()) {
        rememberBox.remove();
        return;
      }
      rememberBox.appendChild(el('h3', {}, ['Remembered folder']));
      var name = state && state.name;
      if (state && state.ok) {
        rememberBox.appendChild(el('div', { class: 'ok-box' }, [
          'Connected to “' + U.esc(name) + '” — this folder is remembered, so it reloads ' +
          'with no dialog next time.'
        ]));
      } else if (state && state.reason === 'prompt') {
        rememberBox.appendChild(el('div', { class: 'warn-box' }, [
          '“' + U.esc(name) + '” is remembered but the browser wants permission again. ' +
          'One click — you will not have to find the folder.'
        ]));
      } else {
        rememberBox.appendChild(el('p', { class: 'tiny', style: { marginTop: 0 } }, [
          'Pick your 5etools folder once and the browser remembers it. A path string ' +
          'cannot be stored — but a directory handle can, so later visits reopen the same ' +
          'folder without you navigating to it again.'
        ]));
      }
      rememberBox.appendChild(el('div', { class: 'btnrow' }, [
        btn(state && state.reason === 'prompt' ? 'Reconnect to “' + name + '”' : 'Choose folder & remember…',
          function () {
            var p = (state && state.reason === 'prompt')
              ? FT.reconnectDirectory({ prompt: true })
              : FT.pickDirectory().then(function (h) { return { ok: true, name: h.name }; });
            p.then(function (r) {
              if (!r || !r.ok) {
                setStatus('err-box', 'Permission was not granted.');
                return;
              }
              setStatus('ok-box', 'Reading “' + U.esc(r.name) + '”…');
              drawRemembered(r);
              runLoad();
            }).catch(function (e) {
              if (e && e.name === 'AbortError') return;      // user closed the picker
              setStatus('err-box', 'Could not open that folder: ' + U.esc(e && e.message || e));
            });
          }, 'sm primary'),
        (name ? btn('Forget', function () {
          FT.forgetDirectory().then(function () { drawRemembered(null); });
        }, 'sm danger') : null)
      ]));
    }
    drawRemembered(null);
    FT.reconnectDirectory().then(drawRemembered);

    /* --- folder (one-time) --- */
    body.appendChild(el('div', { class: 'panel' }, [
      el('h3', {}, ['One-time folder pick']),
      el('p', { class: 'tiny', style: { marginTop: 0 } }, [
        'Reads the folder now without remembering it. Use this if the option above is ' +
        'unavailable — the parsed result is still cached, so you normally will not be ' +
        'asked again anyway.'
      ]),
      btn('Choose folder…', function () {
        var picker = U.$('#dirPicker');
        picker.value = '';
        picker.onchange = function () {
          if (!picker.files.length) return;
          var n = FT.useFolder(picker.files);
          var dataFiles = Object.keys(FT.files).filter(function (p) { return /\.json$/.test(p); }).length;
          if (!dataFiles) {
            setStatus('err-box', 'No .json files found under a <code>data/</code> folder in that directory. ' +
              'Pick the folder that <i>contains</i> <code>data/</code>, or the <code>data/</code> folder itself.');
            return;
          }
          setStatus('ok-box', 'Found ' + fmtInt(dataFiles) + ' JSON files. Loading…');
          runLoad();
        };
        picker.click();
      }, 'primary')
    ]));

    /* --- url --- */
    var urlInput = el('input', { type: 'text', value: urlVal, onInput: function (e) { urlVal = e.target.value; } });
    body.appendChild(el('div', { class: 'panel' }, [
      el('h3', {}, ['Self-hosted URL']),
      el('p', { class: 'tiny', style: { marginTop: 0 } }, [
        'The address of your running instance. It must send CORS headers for the browser to read it — ' +
        'if it does not, use the folder option above.'
      ]),
      el('div', { class: 'row' }, [urlInput]),
      el('div', { class: 'btnrow' }, [
        btn('Test connection', function () {
          setStatus('warn-box', 'Testing…');
          FT.testUrl(urlVal).then(function (r) {
            if (r.ok) setStatus('ok-box', 'Connected to <code>' + U.esc(r.base) + '</code>. Ready to load.');
            else setStatus('err-box', U.esc(r.reason));
          });
        }, 'sm'),
        btn('Load from URL', function () {
          FT.useUrl(urlVal);
          setStatus('warn-box', 'Loading…');
          runLoad();
        }, 'sm primary')
      ])
    ]));

    body.appendChild(statusBox);
    body.appendChild(progressWrap);

    if (FT.loaded) {
      body.appendChild(el('div', { class: 'panel' }, [
        el('h3', {}, ['Currently loaded']),
        el('div', { class: 'tiny' }, [
          fmtInt(FT.stats.records) + ' records from ' + FT.stats.files + ' files' +
          (FT.rememberedName() ? ' · folder “' + FT.rememberedName() + '”' : '') +
          (FT.cachedAt ? ' · cached ' + new Date(FT.cachedAt).toLocaleString() : '') + '.'
        ]),
        el('div', { style: { maxHeight: '140px', overflowY: 'auto', marginTop: '8px' } },
          FT.summary().map(function (s) {
            return el('div', { class: 'statline' }, [
              el('span', {}, [s.kind]), el('b', {}, [fmtInt(s.count)])
            ]);
          })),
        el('div', { class: 'btnrow', style: { marginTop: '10px' } }, [
          btn('Reload from folder', function () {
            FT.reconnectDirectory({ prompt: true }).then(function (r) {
              if (!r.ok) { setStatus('err-box', 'No remembered folder to reload from.'); return; }
              runLoad();
            });
          }, 'sm'),
          btn('Clear cache', function () {
            FT.clearCache().then(function () { updateBadge(); setStatus('warn-box', 'Cache cleared.'); });
          }, 'sm danger')
        ])
      ]));
    }

    function runLoad() {
      U.clear(progressWrap);
      var bar = el('i', { style: { width: '4%' } });
      var label = el('div', { class: 'tiny' }, ['starting…']);
      progressWrap.appendChild(el('div', { class: 'progress' }, [bar]));
      progressWrap.appendChild(label);
      var seen = 0;
      FT.loadAll(function (p) {
        seen = Math.max(seen, p.files);
        bar.style.width = Math.min(96, 4 + seen * 0.55) + '%';
        label.textContent = p.phase + ' — ' + p.files + ' files, ' + fmtInt(p.records) + ' records';
      }).then(function (stats) {
        bar.style.width = '100%';
        label.textContent = 'done — ' + stats.files + ' files, ' + fmtInt(stats.records) + ' records';
        var counts = FT.summary();
        var creatures = (counts.find(function (c) { return c.kind === 'creature'; }) || {}).count || 0;
        var classes = (counts.find(function (c) { return c.kind === 'class'; }) || {}).count || 0;
        if (!stats.records) {
          setStatus('err-box', 'Loaded nothing. The folder or URL does not look like a 5etools data set.');
          return;
        }
        setStatus('ok-box', 'Loaded <b>' + fmtInt(stats.records) + '</b> records — ' +
          fmtInt(creatures) + ' creatures, ' + classes + ' classes, ' +
          Object.keys(FT.sources).length + ' sources.' +
          (stats.failed.length ? '<br><span class="tiny">' + stats.failed.length + ' files could not be read.</span>' : ''));
        FT.saveCache();
        updateBadge();
        B.char = blankCharacter();
        render();
      }).catch(function (e) {
        setStatus('err-box', 'Load failed: ' + U.esc(e.message));
      });
    }

    VT.ui2.modal({ title: 'Data Source', body: body, buttons: [{ label: 'Close', cls: 'primary' }] });
  }

  /* ==== character builder ================================================ */
  function blankCharacter() {
    return {
      name: '', level: 1,
      race: null, subrace: null,
      cls: null, subclass: null,
      classes: [], picks: {},
      method: 'pointbuy',
      base: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
      arrayAssign: {},
      background: null,
      weapons: [], armor: null, shield: false,
      spells: [],
      skills: []
    };
  }

  function renderCharacter() {
    var c = B.char;
    /* rail */
    var rail = el('div', { id: 'rail' });
    STEPS.forEach(function (s, i) {
      rail.appendChild(el('button', {
        class: 'rail-step' + (i === B.step ? ' active' : '') + (stepDone(i) ? ' done' : ''),
        onClick: function () { B.step = i; render(); }
      }, [el('span', { class: 'n' }, [String(i + 1)]), s]));
    });
    work.appendChild(rail);

    var body = el('div', {});
    work.appendChild(body);
    ({
      0: stepRace, 1: stepClass, 2: stepAbilities, 3: stepBackground,
      4: stepEquipment, 5: stepSpells, 6: stepChoices, 7: stepReview
    })[B.step](body);

    /* nav */
    body.appendChild(el('div', { class: 'wrapbtns' }, [
      B.step > 0 ? btn('← Back', function () { B.step--; render(); }, '') : null,
      B.step < STEPS.length - 1 ? btn('Next →', function () { B.step++; render(); }, 'primary') : null
    ]));

    renderSheet();
  }

  function stepDone(i) {
    var c = B.char;
    var chosen = c.cls
      ? VT.choices.summary({ classes: refClasses(c), picks: c.picks }).unspent === 0 : false;
    return [!!c.race, !!c.cls, true, !!c.background, true, true, chosen, false][i];
  }

  /* --- step 1: race --- */
  function stepRace(host) {
    var c = B.char;
    host.appendChild(el('h2', { class: 'step' }, ['Choose a race']));
    host.appendChild(el('p', { class: 'step-sub' }, [
      FT.get('race').length + ' races and ' + FT.get('subrace').length + ' subraces from your sources.'
    ]));
    host.appendChild(browseList({
      kind: 'race', title: 'races',
      isSel: function (r) { return c.race === r; },
      onPick: function (r) { c.race = r; c.subrace = null; render(); },
      subFn: function (r) {
        var ab = CV.abilityBonusesFromRace(r);
        var bits = Object.keys(ab).map(function (k) { return SRD.ABILITY_NAME[k] + ' ' + U.sign(ab[k]); });
        return (bits.join(' ') || 'choice of bonuses') + ' · ' + CV.raceSpeed(r) + 'ft';
      }
    }));

    if (c.race) {
      /* The nameless subrace is the race's own default (see baseSubrace in
         charbuild.js) - it is applied automatically, so listing it as a blank
         row would only be confusing. Named subraces are the real choice. */
      var subs = FT.get('subrace').filter(function (s) {
        return s.name && String(s.raceName || '').toLowerCase() === String(c.race.name).toLowerCase();
      });
      if (subs.length) {
        host.appendChild(browseList({
          records: subs, title: 'subraces', heading: 'Subrace — ' + subs.length + ' available',
          isSel: function (s) { return c.subrace === s; },
          onPick: function (s) { c.subrace = s; render(); },
          subFn: subLabel
        }));
        if (c.subrace) {
          host.appendChild(el('div', { class: 'btnrow', style: { marginTop: '-8px', marginBottom: '14px' } }, [
            btn('Use the standard ' + c.race.name + ' instead', function () { c.subrace = null; render(); }, 'sm')
          ]));
        }
      }
      var bonuses = VT.charbuild.racialBonuses(c);
      var bits = Object.keys(bonuses).map(function (k) {
        return SRD.ABILITY_NAME[k] + ' ' + U.sign(bonuses[k]);
      });
      /* Free-choice increases (Variant Human, every 2024 race, most of MPMM)
         are not fixed bonuses, so say so rather than showing nothing. */
      var choices = 0;
      [c.race, c.subrace || VT.charbuild.baseSubrace(c.race)].forEach(function (r) {
        ((r && r.ability) || []).forEach(function (a) {
          if (a.choose && a.choose.count) choices += a.choose.count;
        });
      });
      host.appendChild(el('div', { class: bits.length || choices ? 'ok-box' : 'warn-box' }, [
        (bits.length ? 'Fixed bonuses: ' + bits.join(', ') + '. ' : '') +
        (choices ? 'Plus ' + choices + ' increase' + (choices > 1 ? 's' : '') +
          ' of your choice — apply them yourself on the Abilities step. ' : '') +
        (!bits.length && !choices
          ? 'This race grants no ability bonuses of its own; 2024 races leave them to your background.' : '')
      ]));
      host.appendChild(entryPanel(c.race.name, c.race.entries));
    }
  }
  function subLabel(s) {
    var ab = CV.abilityBonusesFromRace(s);
    return Object.keys(ab).map(function (k) { return SRD.ABILITY_NAME[k] + ' ' + U.sign(ab[k]); }).join(' ') || '—';
  }

  /* --- step 2: class --- */
  /* The wizard keeps its class list in the same {cls, subclass, level} shape
     charbuild uses, and mirrors the first entry onto c.cls so the later steps -
     spells, equipment, the live sheet - keep reading a single field. */
  function syncClasses(c) {
    if (!c.classes.length && c.cls) {
      c.classes = [{ cls: c.cls, subclass: c.subclass || null, level: c.level || 1 }];
    }
    var first = c.classes[0];
    c.cls = first ? first.cls : null;
    c.subclass = first ? first.subclass : null;
    c.level = c.classes.reduce(function (n, e) { return n + (e.level || 0); }, 0) || 1;
  }

  /* The reference shape VT.choices reads and writes. */
  function refClasses(c) {
    return (c.classes || []).map(function (e) {
      return { name: e.cls.name, source: e.cls.source || null, level: e.level,
               subclass: e.subclass ? { name: e.subclass.name, source: e.subclass.source || null } : null };
    });
  }

  /* Pull picks made against those references back onto the live records. */
  function absorbClassRefs(c, refs) {
    refs.forEach(function (r, i) {
      var e = c.classes[i];
      if (!e) return;
      e.level = r.level;
      if (!r.subclass) { e.subclass = null; return; }
      if (!e.subclass || String(e.subclass.name).toLowerCase() !== String(r.subclass.name).toLowerCase()) {
        e.subclass = VT.charbuild.subclassFor(e.cls, r.subclass);
      }
    });
    syncClasses(c);
  }

  /* Ability scores as they stand mid-wizard, for multiclass requirement checks. */
  function previewAbilities(c) {
    var bonuses = VT.charbuild.racialBonuses(c);
    var out = {};
    SRD.ABILITIES.forEach(function (k) {
      out[k] = U.clamp((c.base[k] == null ? 10 : c.base[k]) + (bonuses[k] || 0), 1, 20);
    });
    return out;
  }

  function stepClass(host) {
    var c = B.char;
    syncClasses(c);
    host.appendChild(el('h2', { class: 'step' }, ['Choose a class']));
    host.appendChild(el('p', { class: 'step-sub' }, [
      FT.get('class').length + ' classes available. Pick the one you start as - subclass, ' +
      'fighting style and everything else waits on the Choices step.'
    ]));

    host.appendChild(browseList({
      kind: 'class', title: 'classes',
      isSel: function (r) { return c.cls === r; },
      onPick: function (r) {
        c.classes = [{ cls: r, subclass: null, level: c.level || 1 }];
        c.picks = {};
        syncClasses(c);
        render();
      },
      subFn: function (r) {
        var hd = r.hd ? 'd' + r.hd.faces : '';
        var sv = (r.proficiency || []).map(function (s) { return String(s).toUpperCase(); }).join('/');
        return hd + (sv ? ' · saves ' + sv : '') +
          (r.casterProgression ? ' · ' + r.casterProgression + ' caster' : '') +
          (r.edition === 'one' ? ' · 2024' : '');
      }
    }));

    if (!c.cls) return;

    var panel = el('div', { class: 'panel' }, [el('h3', {}, ['Levels'])]);
    /* The shared component, so the wizard and the Roster tab cannot disagree
       about what a multiclass character is. */
    var preview = { classes: refClasses(c), abilities: previewAbilities(c), level: c.level };
    VT.choiceUI.renderClasses(panel, {
      actor: preview,
      /* The Abilities step comes AFTER this one, so requirements cannot be
         judged yet - show them, do not block on them. */
      enforce: false,
      onChange: render,
      onLevel: function (i, lv) {
        lv = U.clamp(lv, 0, 20);
        if (lv === 0) {
          if (c.classes.length === 1) return;
          c.classes.splice(i, 1);
        } else {
          var others = c.classes.reduce(function (n, e, j) { return n + (j === i ? 0 : e.level); }, 0);
          if (others + lv > 20) return;
          c.classes[i].level = lv;
        }
        syncClasses(c);
        render();
      },
      onAdd: function (rec) {
        if (c.level >= 20) return;
        var existing = c.classes.filter(function (e) { return e.cls === rec; })[0];
        if (existing) existing.level += 1;
        else c.classes.push({ cls: rec, subclass: null, level: 1 });
        syncClasses(c);
        render();
      }
    });
    host.appendChild(panel);
  }

  /* Requirements that the class step could not check because the scores were
     not set yet. Shown once they are. */
  function multiclassWarning(c) {
    if (!c.classes || c.classes.length < 2) return null;
    var unmet = VT.multiclass.unmetRequirements(refClasses(c), previewAbilities(c));
    if (!unmet.length) return null;
    return el('div', { class: 'warn-box' }, [
      'Multiclass requirements not met: ' +
      unmet.map(function (u) { return u.name + ' ' + u.reason; }).join('; ') +
      '. Adjust the scores on the Abilities step, or drop the class — most tables enforce this.'
    ]);
  }

  /* --- step 7: choices --- */
  function stepChoices(host) {
    var c = B.char;
    syncClasses(c);
    host.appendChild(el('h2', { class: 'step' }, ['Choices']));
    host.appendChild(el('p', { class: 'step-sub' }, [
      'Subclass, fighting style, invocations, metamagic, maneuvers, feats, skills and spells - ' +
      'everything your classes let you pick, read straight from your own books.'
    ]));
    if (!c.cls) {
      host.appendChild(el('div', { class: 'warn-box' }, ['Choose a class first.']));
      return;
    }
    var warn = multiclassWarning(c);
    if (warn) host.appendChild(warn);

    var refs = refClasses(c);
    var build = { classes: refs, picks: c.picks };
    var panel = el('div', { class: 'panel' });
    VT.choiceUI.render(panel, {
      actor: buildActor(), build: build,
      onChange: function () {
        c.picks = build.picks;
        absorbClassRefs(c, refs);
        render();
      }
    });
    host.appendChild(panel);
  }

  /* --- step 3: abilities --- */
  function stepAbilities(host) {
    var c = B.char;
    host.appendChild(el('h2', { class: 'step' }, ['Ability scores']));
    host.appendChild(el('p', { class: 'step-sub' }, ['Racial bonuses are applied automatically on top.']));

    var methods = [
      { value: 'pointbuy', label: 'Point buy (27)' },
      { value: 'array', label: 'Standard array' },
      { value: 'manual', label: 'Manual / rolled' }
    ];
    host.appendChild(el('div', { class: 'panel' }, [
      el('h3', {}, ['Method']),
      el('div', { class: 'btnrow' }, methods.map(function (m) {
        return el('button', {
          class: 'btn sm' + (c.method === m.value ? ' on' : ''),
          onClick: function () {
            c.method = m.value;
            if (m.value === 'pointbuy') c.base = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
            if (m.value === 'array') { c.base = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }; c.arrayAssign = {}; }
            render();
          }
        }, [m.label]);
      })),
      c.method === 'manual' ? el('div', { class: 'btnrow', style: { marginTop: '8px' } }, [
        btn('Roll 4d6 drop lowest', function () {
          SRD.ABILITIES.forEach(function (k) {
            var r = [0, 0, 0, 0].map(function () { return VT.dice.die(6); }).sort(function (a, b) { return b - a; });
            c.base[k] = r[0] + r[1] + r[2];
          });
          render();
        }, 'sm')
      ]) : null
    ]));

    var pointsUsed = SRD.ABILITIES.reduce(function (s, k) { return s + (POINT_COST[c.base[k]] || 0); }, 0);
    var bonuses = totalRacialBonuses();

    var grid = el('div', { class: 'panel' }, [
      el('h3', {}, ['Scores' + (c.method === 'pointbuy' ? '' : '')]),
      c.method === 'pointbuy' ? el('div', { class: 'pts', style: { marginBottom: '8px' } },
        [(27 - pointsUsed) + ' points remaining']) : null
    ]);
    grid.appendChild(el('div', { class: 'ability-row' }, [
      el('span', { class: 'tiny' }, ['']), el('span', { class: 'tiny' }, ['']),
      el('span', { class: 'tiny', style: { textAlign: 'center' } }, ['base']),
      el('span', { class: 'tiny', style: { textAlign: 'center' } }, ['race']),
      el('span', { class: 'tiny', style: { textAlign: 'center' } }, ['total'])
    ]));

    SRD.ABILITIES.forEach(function (k) {
      var row = el('div', { class: 'ability-row' });
      row.appendChild(el('span', { class: 'lab' }, [SRD.ABILITY_NAME[k]]));

      if (c.method === 'array') {
        var taken = Object.keys(c.arrayAssign).filter(function (kk) { return kk !== k; })
          .map(function (kk) { return c.arrayAssign[kk]; });
        var opts = [{ value: '', label: '—' }].concat(STANDARD_ARRAY.map(function (v, i) {
          return { value: String(v) + ':' + i, label: String(v) + (taken.indexOf(String(v) + ':' + i) >= 0 ? ' (used)' : '') };
        }));
        var sel = el('select', {
          onChange: function (e) {
            var v = e.target.value;
            Object.keys(c.arrayAssign).forEach(function (kk) { if (c.arrayAssign[kk] === v) delete c.arrayAssign[kk]; });
            if (v) c.arrayAssign[k] = v; else delete c.arrayAssign[k];
            c.base[k] = v ? parseInt(v.split(':')[0], 10) : 10;
            render();
          }
        }, opts.map(function (o) {
          return el('option', { value: o.value, selected: c.arrayAssign[k] === o.value }, [o.label]);
        }));
        sel.value = c.arrayAssign[k] || '';
        row.appendChild(sel);
      } else {
        var step = el('div', { class: 'stepper' });
        var lo = c.method === 'pointbuy' ? 8 : 1, hi = c.method === 'pointbuy' ? 15 : 20;
        step.appendChild(el('button', {
          disabled: c.base[k] <= lo ? true : null,
          onClick: function () { c.base[k]--; render(); }
        }, ['−']));
        step.appendChild(el('button', {
          disabled: (c.base[k] >= hi ||
            (c.method === 'pointbuy' && pointsUsed - (POINT_COST[c.base[k]] || 0) + (POINT_COST[c.base[k] + 1] || 99) > 27)) ? true : null,
          onClick: function () { c.base[k]++; render(); }
        }, ['+']));
        row.appendChild(step);
      }
      row.appendChild(el('span', { class: 'val' }, [String(c.base[k])]));
      row.appendChild(el('span', { class: 'bonus' }, [bonuses[k] ? U.sign(bonuses[k]) : '—']));
      var total = c.base[k] + (bonuses[k] || 0);
      row.appendChild(el('span', { class: 'fin' }, [String(total) + ' ']));
      grid.appendChild(row);
    });
    host.appendChild(grid);
  }

  function totalRacialBonuses() {
    var c = B.char, out = {};
    [c.race, c.subrace].forEach(function (r) {
      if (!r) return;
      var ab = CV.abilityBonusesFromRace(r);
      Object.keys(ab).forEach(function (k) { out[k] = (out[k] || 0) + ab[k]; });
    });
    return out;
  }

  /* --- step 4: background --- */
  function stepBackground(host) {
    var c = B.char;
    host.appendChild(el('h2', { class: 'step' }, ['Background']));
    host.appendChild(el('p', { class: 'step-sub' }, [FT.get('background').length + ' backgrounds available.']));
    host.appendChild(browseList({
      kind: 'background', title: 'backgrounds',
      isSel: function (r) { return c.background === r; },
      onPick: function (r) { c.background = r; render(); },
      subFn: function (r) { return skillsOf(r).join(', ') || '—'; }
    }));
    if (c.background) host.appendChild(entryPanel(c.background.name, c.background.entries));
  }

  function skillsOf(rec) {
    var sp = rec && rec.skillProficiencies && rec.skillProficiencies[0];
    if (!sp) return [];
    return Object.keys(sp).filter(function (k) { return sp[k] === true; })
      .map(function (s) { return s.replace(/\b\w/g, function (m) { return m.toUpperCase(); }); });
  }

  /* --- step 5: equipment --- */
  function stepEquipment(host) {
    var c = B.char;
    host.appendChild(el('h2', { class: 'step' }, ['Equipment']));
    host.appendChild(el('p', { class: 'step-sub' }, [
      'Weapons become attack actions in the game. Armour sets your AC.'
    ]));

    var allItems = FT.get('item');
    var weapons = allItems.filter(function (i) { return i.weapon || (i.dmg1 && i.type); });
    var armours = allItems.filter(function (i) { return i.armor && i.ac; });
    var shields = allItems.filter(function (i) { return String(i.type || '').split('|')[0] === 'S'; });

    /* weapons — multi-select, live heading */
    var carried = function () { return 'Weapons — ' + c.weapons.length + ' carried'; };
    var wHead = el('h3', {}, [carried()]);
    var has = function (i) {
      return c.weapons.some(function (w) { return w.name === i.name && w.source === i.source; });
    };
    var wPanel = browseList({
      records: weapons, title: 'weapons', multi: true,
      isSel: has,
      onPick: function (i) {
        if (has(i)) c.weapons = c.weapons.filter(function (w) { return !(w.name === i.name && w.source === i.source); });
        else c.weapons.push(i);
      },
      afterPick: function () { wHead.textContent = carried(); renderSheet(); },
      subFn: function (i) { return (i.dmg1 || '—') + ' ' + (CV.DMG[i.dmgType] || ''); }
    });
    wPanel.insertBefore(wHead, wPanel.firstChild);
    host.appendChild(wPanel);

    /* armour — single-select, with a synthetic "none" entry at the top */
    var NONE = { name: 'No armour', source: '', __none: true };
    var aPanel = browseList({
      records: [NONE].concat(armours), title: 'armours', single: true,
      heading: 'Armour',
      isSel: function (i) {
        return i.__none ? !c.armor : !!(c.armor && c.armor.name === i.name && c.armor.source === i.source);
      },
      onPick: function (i) { c.armor = i.__none ? null : i; },
      afterPick: function () { renderSheet(); },
      subFn: function (i) { return i.__none ? '10 + DEX' : 'AC ' + i.ac + ' · ' + armourKind(i); }
    });
    aPanel.appendChild(el('div', { class: 'row', style: { marginTop: '10px' } }, [
      el('button', {
        class: 'btn sm' + (c.shield ? ' on' : ''),
        onClick: function (e) {
          c.shield = !c.shield;
          e.target.className = 'btn sm' + (c.shield ? ' on' : '');
          renderSheet();
        }
      }, ['Shield  +2 AC'])
    ]));
    host.appendChild(aPanel);
  }

  function armourKind(i) {
    var t = String(i.type || '').split('|')[0];
    return { LA: 'light', MA: 'medium', HA: 'heavy', S: 'shield' }[t] || 'armour';
  }

  /* --- step 6: spells --- */
  function stepSpells(host) {
    var c = B.char;
    host.appendChild(el('h2', { class: 'step' }, ['Spells']));
    if (!c.cls) {
      host.appendChild(el('div', { class: 'warn-box' }, ['Pick a class first.']));
      return;
    }
    var className = c.cls.name;
    var all = FT.get('spell');
    var forClass = all.filter(function (s) {
      var list = s.classes && s.classes.fromClassList;
      if (!list) return false;
      return list.some(function (x) { return String(x.name).toLowerCase() === className.toLowerCase(); });
    });
    var usingAll = false;
    if (!forClass.length) { forClass = all; usingAll = true; }

    host.appendChild(el('p', { class: 'step-sub' }, [
      usingAll
        ? 'Your data set has no class/spell mapping, so every spell is listed — filter by name.'
        : forClass.length + ' spells on the ' + className + ' list.'
    ]));

    var lvlFilter = -1;
    var LEVELS = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    var chosen = function () { return 'Known / prepared — ' + c.spells.length + ' chosen'; };
    var sHead = el('h3', {}, [chosen()]);
    var hasSpell = function (s) {
      return c.spells.some(function (x) { return x.name === s.name && x.source === s.source; });
    };

    var sPanel = browseList({
      records: forClass, title: 'spells', multi: true,
      isSel: hasSpell,
      filterFn: function (s) { return lvlFilter < 0 || s.level === lvlFilter; },
      onPick: function (s) {
        if (hasSpell(s)) c.spells = c.spells.filter(function (x) { return !(x.name === s.name && x.source === s.source); });
        else c.spells.push(s);
      },
      afterPick: function () { sHead.textContent = chosen(); renderSheet(); },
      subFn: function (s) { return (s.level ? 'level ' + s.level : 'cantrip') + (s.school ? ' · ' + s.school : ''); }
    });

    var lvlBar = el('div', { class: 'kindbar', style: { marginBottom: '8px' } });
    LEVELS.forEach(function (L) {
      lvlBar.appendChild(el('button', {
        class: lvlFilter === L ? 'on' : '',
        onClick: function () {
          lvlFilter = L;
          U.$$('button', lvlBar).forEach(function (b, i) { b.classList.toggle('on', LEVELS[i] === L); });
          sPanel.refresh();
        }
      }, [L < 0 ? 'all' : L === 0 ? 'cantrip' : String(L)]));
    });

    sPanel.insertBefore(lvlBar, sPanel.firstChild);
    sPanel.insertBefore(sHead, sPanel.firstChild);
    host.appendChild(sPanel);
  }

  /* --- step 7: review --- */
  function stepReview(host) {
    var c = B.char;
    var a = buildActor();
    host.appendChild(el('h2', { class: 'step' }, ['Review & export']));
    host.appendChild(el('p', { class: 'step-sub' }, ['Everything below is editable later in the game\'s Roster tab.']));

    host.appendChild(el('div', { class: 'panel' }, [
      el('h3', {}, ['Identity']),
      row('Name', el('input', {
        type: 'text', value: c.name, placeholder: (c.cls ? c.cls.name : 'Adventurer'),
        onInput: function (e) { c.name = e.target.value; renderSheet(); }
      }))
    ]));

    host.appendChild(el('div', { class: 'panel' }, [
      el('h3', {}, ['Derived statblock']),
      statRow('Armour Class', a.ac + (c.armor ? ' (' + c.armor.name + (c.shield ? ' + shield' : '') + ')' : c.shield ? ' (shield)' : ' (unarmoured)')),
      statRow('Hit Points', a.hpMax),
      statRow('Speed', a.speed + ' ft'),
      statRow('Proficiency', U.sign(VT.actor.prof(a))),
      statRow('Saving throws', (a.saveProf || []).map(function (s) { return s.toUpperCase(); }).join(', ') || '—'),
      statRow('Size', U.cap(a.size))
    ]));

    host.appendChild(el('div', { class: 'panel' }, [
      el('h3', {}, ['Actions — ' + a.actions.length]),
      a.actions.length ? el('div', { class: 'list' }, a.actions.map(function (act) {
        return el('div', { class: 'listitem' }, [
          el('div', { class: 't' }, [
            el('div', { class: 'n' }, [act.name]),
            el('div', { class: 's' }, [describeAction(act)])
          ])
        ]);
      })) : el('div', { class: 'tiny' }, ['No weapons or spells chosen — the character will get a placeholder attack.'])
    ]));

    host.appendChild(exportPanel(a, function () { return buildActor(); }));
  }

  function statRow(k, v) {
    return el('div', { class: 'statline' }, [el('span', {}, [k]), el('b', {}, [String(v)])]);
  }
  function row(label, ctrl) {
    return el('div', { class: 'row' }, [el('label', {}, [label]), ctrl]);
  }

  function describeAction(act) {
    if (act.kind === 'melee') return 'Melee ' + (act.reach || 5) + 'ft · ' + U.sign(act.toHit || 0) + ' · ' + (act.dmg || '') + ' ' + (act.dmgType || '');
    if (act.kind === 'ranged') return 'Ranged ' + (act.range ? act.range[0] + '/' + act.range[1] : '') + 'ft · ' + U.sign(act.toHit || 0) + ' · ' + (act.dmg || '');
    if (act.kind === 'save') return (act.autoHit ? 'hits automatically'
      : 'DC ' + act.dc + ' ' + String(act.save).toUpperCase()) +
      (act.aoe ? ' · ' + act.aoe.radius + 'ft' : '') + ' · ' + (act.dmg || '');
    if (act.kind === 'heal') return 'Heals ' + act.dmg;
    return act.kind + (act.condition ? ' · ' + act.condition : '');
  }

  /* ---- derive the actual statblock -------------------------------------- */
  /* The derivation itself lives in src/data/charbuild.js so the TaleSpire
     symbiote builds characters through identical code. */
  function buildActor() {
    var c = B.char;
    return VT.charbuild.derive({
      name: c.name, level: c.level,
      classes: c.classes, picks: c.picks,
      race: c.race, subrace: c.subrace, cls: c.cls, subclass: c.subclass,
      background: c.background, base: c.base,
      weapons: c.weapons, armor: c.armor, shield: c.shield,
      spells: c.spells, skillProf: c.skills
    });
  }

  function totalRacialBonuses() {
    return VT.charbuild.racialBonuses({ race: B.char.race, subrace: B.char.subrace });
  }

  /* ---- live sheet in the side rail --------------------------------------- */
  function renderSheet() {
    U.clear(side);
    if (B.mode !== 'character') return;
    var c = B.char, a = buildActor();
    var head = el('div', { class: 'sec-b' });
    head.appendChild(el('div', { class: 'sheet-head' }, [
      VT.actor.portrait(a, 46, 58),
      el('div', {}, [
        el('div', { class: 'sheet-name' }, [a.name]),
        el('div', { class: 'sheet-sub' }, [
          [c.race ? c.race.name : null, a.className || null, 'level ' + c.level].filter(Boolean).join(' · ')
        ])
      ])
    ]));
    head.appendChild(el('div', { class: 'bigstat' }, [
      el('div', {}, [el('div', { class: 'k' }, ['AC']), el('div', { class: 'v' }, [String(a.ac)])]),
      el('div', {}, [el('div', { class: 'k' }, ['HP']), el('div', { class: 'v' }, [String(a.hpMax)])]),
      el('div', {}, [el('div', { class: 'k' }, ['SPD']), el('div', { class: 'v' }, [String(a.speed)])])
    ]));
    head.appendChild(el('div', { class: 'abils' }, SRD.ABILITIES.map(function (k) {
      return el('div', { class: 'abil' }, [
        el('div', { class: 'k' }, [SRD.ABILITY_NAME[k]]),
        el('div', { class: 'v' }, [String(a.abilities[k])]),
        el('div', { class: 'm' }, [U.sign(SRD.mod(a.abilities[k]))])
      ]);
    })));
    side.appendChild(el('div', { class: 'sec' }, [
      el('div', { class: 'sec-h' }, ['Live sheet']), head
    ]));

    side.appendChild(el('div', { class: 'sec' }, [
      el('div', { class: 'sec-h' }, ['Actions', el('span', { class: 'sh-right' }, [String(a.actions.length)])]),
      el('div', { class: 'sec-b' }, [
        el('div', { class: 'list' }, a.actions.slice(0, 12).map(function (act) {
          return el('div', { class: 'listitem' }, [el('div', { class: 't' }, [
            el('div', { class: 'n' }, [act.name]),
            el('div', { class: 's' }, [describeAction(act)])
          ])]);
        }))
      ])
    ]));
  }

  /* ==== creature forge =================================================== */
  function renderForge() {
    var host = el('div', {});
    work.appendChild(host);
    host.appendChild(el('h2', { class: 'step' }, ['Creature Forge']));
    host.appendChild(el('p', { class: 'step-sub' }, [
      'Import any monster from your sources, then change anything — hit points, AC, speed, ' +
      'ability scores, resistances, and every action it can take.'
    ]));

    /* picker — the whole bestiary, browsable */
    var cPanel = browseList({
      kind: 'creature', title: 'creatures',
      heading: 'Import a base creature — ' + fmtInt(FT.get('creature').length) + ' available',
      isSel: function (m) { return !!(B.forge && B.forge.__src === m); },
      onPick: function (m) {
        B.forge = CV.creature(m, { team: 'foe' });
        B.forge.__src = m;
        render();
      },
      subFn: function (m) {
        return 'CR ' + (CV.crOf(m) || '?') + ' · ' + CV.hpOf(m) + 'hp · AC ' + CV.acOf(m);
      }
    });
    cPanel.appendChild(el('div', { class: 'btnrow', style: { marginTop: '10px' } }, [
      btn('Start from blank', function () {
        B.forge = VT.actor.base('New Creature');
        B.forge.team = 'foe';
        B.forge.spec = VT.spriteart.autoSpec('New Creature');
        render();
      }, 'sm')
    ]));
    host.appendChild(cPanel);

    if (!B.forge) return;
    var a = B.forge;

    host.appendChild(el('div', { class: 'panel' }, [
      el('h3', {}, ['Identity']),
      el('div', { class: 'grid3' }, [
        row('Name', el('input', { type: 'text', value: a.name, onInput: function (e) { a.name = e.target.value; forgeSheet(); } })),
        row('Side', selectEl([
          { value: 'party', label: 'Party' }, { value: 'foe', label: 'Enemy' }, { value: 'neutral', label: 'Neutral' }
        ], a.team, function (v) { a.team = v; forgeSheet(); })),
        row('Size', selectEl(SRD.SIZES.map(function (s) { return { value: s, label: U.cap(s) }; }), a.size,
          function (v) { a.size = v; forgeSheet(); }))
      ]),
      el('div', { class: 'grid3' }, [
        row('CR', el('input', { type: 'text', value: a.cr || '', onInput: function (e) { a.cr = e.target.value; a.level = CV.crToLevel(e.target.value); forgeSheet(); } })),
        row('AC', numEl(a.ac, 1, 30, function (v) { a.ac = v; forgeSheet(); })),
        row('Speed', numEl(a.speed, 0, 200, function (v) { a.speed = v; forgeSheet(); }, 5))
      ]),
      el('div', { class: 'grid3' }, [
        row('Max HP', numEl(a.hpMax, 1, 2000, function (v) { a.hpMax = v; a.hp = v; forgeSheet(); })),
        row('Regen', numEl(a.regen || 0, 0, 100, function (v) { a.regen = v; })),
        row('Build', selectEl(VT.spriteart.BUILDS.map(function (b) { return { value: b, label: U.cap(b) }; }),
          (a.spec && a.spec.kind) || 'humanoid', function (v) {
            a.spec = Object.assign({}, a.spec || {}, { kind: v }); forgeSheet();
          }))
      ])
    ]));

    host.appendChild(el('div', { class: 'panel' }, [
      el('h3', {}, ['Abilities']),
      el('div', { class: 'grid3' }, SRD.ABILITIES.map(function (k) {
        return row(SRD.ABILITY_NAME[k], numEl(a.abilities[k], 1, 30, function (v) { a.abilities[k] = v; forgeSheet(); }));
      })),
      row('Save prof.', el('input', {
        type: 'text', value: (a.saveProf || []).join(', '), placeholder: 'dex, con',
        onInput: function (e) { a.saveProf = splitList(e.target.value); }
      }))
    ]));

    host.appendChild(el('div', { class: 'panel' }, [
      el('h3', {}, ['Damage handling']),
      el('div', { class: 'grid3' }, [
        row('Resist', el('input', { type: 'text', value: (a.resist || []).join(', '), onInput: function (e) { a.resist = splitList(e.target.value); } })),
        row('Vulnerable', el('input', { type: 'text', value: (a.vulnerable || []).join(', '), onInput: function (e) { a.vulnerable = splitList(e.target.value); } })),
        row('Immune', el('input', { type: 'text', value: (a.immune || []).join(', '), onInput: function (e) { a.immune = splitList(e.target.value); } }))
      ]),
      el('div', { class: 'tiny' }, ['Comma separated: ' + SRD.DAMAGE_TYPES.join(', ')])
    ]));

    /* actions */
    var actWrap = el('div', { class: 'panel' });
    actWrap.appendChild(el('h3', {}, ['Actions — ' + a.actions.length]));
    a.actions.forEach(function (act, i) { actWrap.appendChild(actionEditor(a, act, i)); });
    actWrap.appendChild(el('div', { class: 'btnrow' }, [
      btn('+ Melee', function () { a.actions.push(SRD.melee('New Attack', 4, '1d6+2', 'slashing')); render(); }, 'sm'),
      btn('+ Ranged', function () { a.actions.push(SRD.ranged('New Shot', 4, '1d6+2', 'piercing', 80, 320)); render(); }, 'sm'),
      btn('+ Area', function () { a.actions.push(SRD.saveSpell('New Blast', 'dex', 13, '3d6', 'fire', 15, 60)); render(); }, 'sm'),
      btn('+ From spell…', addSpellToForge, 'sm')
    ]));
    host.appendChild(actWrap);

    host.appendChild(exportPanel(a, function () { return B.forge; }));
    forgeSheet();
  }

  function forgeSheet() {
    U.clear(side);
    if (!B.forge) return;
    var a = B.forge;
    var head = el('div', { class: 'sec-b' });
    head.appendChild(el('div', { class: 'sheet-head' }, [
      VT.actor.portrait(a, 46, 58),
      el('div', {}, [
        el('div', { class: 'sheet-name' }, [a.name]),
        el('div', { class: 'sheet-sub' }, [(a.cr ? 'CR ' + a.cr + ' · ' : '') + U.cap(a.size) + (a.source ? ' · ' + a.source : '')])
      ])
    ]));
    head.appendChild(el('div', { class: 'bigstat' }, [
      el('div', {}, [el('div', { class: 'k' }, ['AC']), el('div', { class: 'v' }, [String(a.ac)])]),
      el('div', {}, [el('div', { class: 'k' }, ['HP']), el('div', { class: 'v' }, [String(a.hpMax)])]),
      el('div', {}, [el('div', { class: 'k' }, ['SPD']), el('div', { class: 'v' }, [String(a.speed)])])
    ]));
    head.appendChild(el('div', { class: 'abils' }, SRD.ABILITIES.map(function (k) {
      return el('div', { class: 'abil' }, [
        el('div', { class: 'k' }, [SRD.ABILITY_NAME[k]]),
        el('div', { class: 'v' }, [String(a.abilities[k])]),
        el('div', { class: 'm' }, [U.sign(SRD.mod(a.abilities[k]))])
      ]);
    })));
    side.appendChild(el('div', { class: 'sec' }, [el('div', { class: 'sec-h' }, ['Preview']), head]));
    if (a.notes) {
      side.appendChild(el('div', { class: 'sec' }, [
        el('div', { class: 'sec-h' }, ['Traits']),
        el('div', { class: 'sec-b tiny', style: { whiteSpace: 'pre-wrap' } }, [a.notes])
      ]));
    }
  }

  function addSpellToForge() {
    var q = '', list = el('div', { class: 'pickgrid' });
    var a = B.forge;
    var dc = 8 + VT.actor.prof(a) + Math.max(SRD.mod(a.abilities.cha), SRD.mod(a.abilities.int), SRD.mod(a.abilities.wis));
    function draw() {
      U.clear(list);
      FT.search(q, ['spell'], 40).forEach(function (s) {
        list.appendChild(pickCard(s.name, s.source, s.level ? 'level ' + s.level : 'cantrip', false, function () {
          var act = CV.spell(s, { dc: dc, atk: VT.actor.prof(a) + 3, level: a.level });
          if (act) { a.actions.push(act); render(); }
        }));
      });
    }
    draw();
    VT.ui2.modal({
      title: 'Add a spell as an action',
      body: el('div', {}, [
        el('p', { class: 'tiny' }, ['Save DC is derived from this creature\'s best casting ability (' + dc + ').']),
        el('div', { class: 'searchbar', style: { marginBottom: '8px' } }, [
          el('input', { type: 'text', placeholder: 'search spells…', onInput: function (e) { q = e.target.value.toLowerCase(); draw(); } })
        ]),
        list
      ]),
      buttons: [{ label: 'Done', cls: 'primary' }]
    });
  }

  function splitList(v) {
    return String(v).split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  }

  function actionEditor(owner, act, i) {
    var wrap = el('div', { style: {
      border: '1px solid var(--line)', borderRadius: '5px', padding: '9px',
      marginBottom: '8px', background: '#16151f'
    } });
    wrap.appendChild(el('div', { class: 'row' }, [
      el('input', { type: 'text', value: act.name, onInput: function (e) { act.name = e.target.value; } }),
      selectEl([
        { value: 'melee', label: 'Melee' }, { value: 'ranged', label: 'Ranged' },
        { value: 'save', label: 'Area/Save' }, { value: 'heal', label: 'Heal' }, { value: 'buff', label: 'Effect' }
      ], act.kind, function (v) { act.kind = v; render(); }),
      el('button', { class: 'btn sm danger', onClick: function () { owner.actions.splice(i, 1); render(); } }, ['×'])
    ]));

    if (act.kind === 'melee' || act.kind === 'ranged') {
      wrap.appendChild(el('div', { class: 'grid3' }, [
        row('To hit', numEl(act.toHit || 0, -5, 25, function (v) { act.toHit = v; })),
        row('Damage', el('input', { type: 'text', value: act.dmg || '', onInput: function (e) { act.dmg = e.target.value; } })),
        row('Type', selectEl(SRD.DAMAGE_TYPES.map(function (d) { return { value: d, label: U.cap(d) }; }),
          act.dmgType || 'slashing', function (v) { act.dmgType = v; }))
      ]));
      if (act.kind === 'melee') {
        wrap.appendChild(row('Reach ft', numEl(act.reach || 5, 5, 60, function (v) { act.reach = v; }, 5)));
      } else {
        act.range = act.range || [80, 320];
        wrap.appendChild(el('div', { class: 'grid2' }, [
          row('Normal', numEl(act.range[0], 5, 1000, function (v) { act.range[0] = v; }, 5)),
          row('Long', numEl(act.range[1], 5, 2000, function (v) { act.range[1] = v; }, 5))
        ]));
      }
    } else if (act.kind === 'save') {
      act.aoe = act.aoe || { radius: 15 };
      act.range = act.range || [60, 60];
      wrap.appendChild(el('div', { class: 'grid3' }, [
        row('Save', selectEl(SRD.ABILITIES.map(function (s) { return { value: s, label: s.toUpperCase() }; }), act.save || 'dex', function (v) { act.save = v; })),
        row('DC', numEl(act.dc || 13, 1, 30, function (v) { act.dc = v; })),
        row('Damage', el('input', { type: 'text', value: act.dmg || '', onInput: function (e) { act.dmg = e.target.value; } }))
      ]));
      wrap.appendChild(el('div', { class: 'grid3' }, [
        row('Radius', numEl(act.aoe.radius, 0, 120, function (v) { act.aoe.radius = v; }, 5)),
        row('Range', numEl(act.range[1], 0, 600, function (v) { act.range = [v, v]; }, 5)),
        row('Type', selectEl(SRD.DAMAGE_TYPES.map(function (d) { return { value: d, label: U.cap(d) }; }), act.dmgType || 'fire', function (v) { act.dmgType = v; }))
      ]));
    } else if (act.kind === 'heal') {
      act.range = act.range || [30, 30];
      wrap.appendChild(el('div', { class: 'grid2' }, [
        row('Restores', el('input', { type: 'text', value: act.dmg || '1d8', onInput: function (e) { act.dmg = e.target.value; } })),
        row('Range', numEl(act.range[1], 0, 300, function (v) { act.range = [v, v]; }, 5))
      ]));
    } else {
      act.range = act.range || [30, 30];
      wrap.appendChild(el('div', { class: 'grid2' }, [
        row('Condition', selectEl(Object.keys(SRD.CONDITIONS).map(function (k) { return { value: k, label: SRD.CONDITIONS[k].name }; }),
          act.condition || 'blessed', function (v) { act.condition = v; })),
        row('Range', numEl(act.range[1], 0, 300, function (v) { act.range = [v, v]; }, 5))
      ]));
    }
    wrap.appendChild(el('div', { class: 'grid2' }, [
      row('Cost', selectEl([
        { value: 'action', label: 'Action' }, { value: 'bonus', label: 'Bonus' }, { value: 'reaction', label: 'Reaction' }
      ], act.cost || 'action', function (v) { act.cost = v; })),
      row('Uses', numEl(act.uses ? act.uses.max : 0, 0, 20, function (v) { act.uses = v > 0 ? { max: v, per: 'rest' } : null; }))
    ]));
    if (act.desc) {
      wrap.appendChild(el('div', { class: 'tiny', style: { marginTop: '6px', maxHeight: '54px', overflow: 'auto' } }, [act.desc]));
    }
    return wrap;
  }

  /* ==== compendium ======================================================= */
  var COMP_KINDS = ['creature', 'spell', 'item', 'class', 'subclass', 'race', 'subrace',
    'background', 'feat', 'condition', 'action', 'optionalfeature', 'variantrule',
    'deity', 'hazard', 'object', 'vehicle', 'table', 'reward', 'psionic', 'language', 'sense', 'skill'];

  function renderCompendium() {
    var layout = el('div', { class: 'comp-layout' });
    var listCol = el('div', { class: 'comp-list' });
    var results = el('div', { class: 'comp-results' });
    var viewer = el('div', { class: 'comp-view entry-body' });
    var count = el('div', { class: 'browse-count' });

    /* Category pills.
       Previously each click re-ran renderCompendium(), which appends to #bwork
       without clearing it - so you got a second list stacked under the first.
       Now the pills only re-filter the existing list in place.
       Click selects one category; ctrl/cmd-click adds to the selection. */
    var kindBar = el('div', { class: 'kindbar' });
    var available = COMP_KINDS.filter(function (k) { return (FT.get(k) || []).length; });

    function paintPills() {
      U.$$('button', kindBar).forEach(function (b) {
        var k = b.dataset.kind;
        var on = k === '*' ? !B.comp.kinds.length : B.comp.kinds.indexOf(k) >= 0;
        b.classList.toggle('on', on);
      });
    }

    kindBar.appendChild(el('button', {
      'data-kind': '*', title: 'Search every category',
      onClick: function () { B.comp.kinds = []; paintPills(); drawResults(); }
    }, ['all']));

    available.forEach(function (k) {
      kindBar.appendChild(el('button', {
        'data-kind': k,
        title: 'Click to show only ' + k + ' · Ctrl-click to add to the selection',
        onClick: function (e) {
          if (e.ctrlKey || e.metaKey) {
            var i = B.comp.kinds.indexOf(k);
            if (i >= 0) B.comp.kinds.splice(i, 1); else B.comp.kinds.push(k);
          } else {
            /* exclusive select, and clicking the only active one clears back to all */
            B.comp.kinds = (B.comp.kinds.length === 1 && B.comp.kinds[0] === k) ? [] : [k];
          }
          paintPills();
          drawResults();
        }
      }, [k + ' ' + (FT.get(k) || []).length]));
    });

    var input = el('input', {
      type: 'text', value: B.comp.query, placeholder: 'search everything…',
      onInput: U.debounce(function (e) { B.comp.query = e.target.value; drawResults(); }, 140)
    });

    function drawResults() {
      U.clear(results);
      U.clear(count);
      var LIMIT = 300;
      var hits = FT.search(B.comp.query, B.comp.kinds, LIMIT);
      var scope = B.comp.kinds.length ? B.comp.kinds.join(' + ') : 'all categories';
      count.appendChild(el('span', {}, [
        (hits.length >= LIMIT ? 'first ' + LIMIT : String(hits.length)) + ' in ' + scope
      ]));
      if (!hits.length) {
        results.appendChild(el('div', { class: 'tiny', style: { padding: '10px' } }, ['No matches.']));
        return;
      }
      hits.forEach(function (r) {
        results.appendChild(el('div', {
          class: 'comp-row' + (B.comp.selected === r ? ' sel' : ''),
          onClick: function () { B.comp.selected = r; drawResults(); drawView(); }
        }, [
          el('span', { class: 'k' }, [r.__kind]),
          el('span', {}, [r.name]),
          el('span', { class: 's' }, [r.source || ''])
        ]));
      });
    }

    function drawView() {
      U.clear(viewer);
      var r = B.comp.selected;
      if (!r) {
        viewer.appendChild(el('p', { class: 'tiny' }, ['Select an entry to read it.']));
        return;
      }
      viewer.appendChild(el('h2', { class: 'step' }, [r.name]));
      viewer.appendChild(el('p', { class: 'step-sub' }, [
        r.__kind + (r.source ? ' · ' + r.source : '') + (r.page ? ' p.' + r.page : '')
      ]));

      if (r.__kind === 'creature') {
        viewer.appendChild(creatureCard(r));
      } else if (r.__kind === 'spell') {
        viewer.appendChild(spellCard(r));
      }
      var entries = r.entries || r.entriesHigherLevel;
      if (entries) {
        viewer.appendChild(el('div', { html: T.renderEntries(entries, 'html') }));
      }
      wireXrefs(viewer);
    }

    listCol.appendChild(el('div', { class: 'searchbar' }, [input]));
    listCol.appendChild(kindBar);
    listCol.appendChild(count);
    listCol.appendChild(results);
    layout.appendChild(listCol);
    layout.appendChild(viewer);
    U.clear(work);            // belt and braces: never stack a second layout
    work.appendChild(layout);
    paintPills();
    drawResults();
    drawView();
  }

  function wireXrefs(root) {
    U.$$('a.xref', root).forEach(function (a) {
      a.onclick = function () {
        var kind = a.dataset.kind === 'creature' ? 'creature' : a.dataset.kind;
        var rec = FT.byName(kind, a.dataset.name, a.dataset.source);
        if (!rec) return;
        B.comp.kinds = [rec.__kind];
        B.comp.selected = rec;
        setMode('compendium');
      };
    });
    U.$$('.roll-tag', root).forEach(function (s) {
      s.onclick = function () {
        var r = VT.dice.roll(s.dataset.dice);
        s.title = r.detail + ' = ' + r.total;
        s.textContent = s.textContent.replace(/\s*→.*$/, '') + ' → ' + r.total;
      };
    });
  }

  function creatureCard(m) {
    var a = CV.creature(m);
    var box = el('div', { class: 'panel' });
    box.appendChild(el('div', { class: 'bigstat' }, [
      el('div', {}, [el('div', { class: 'k' }, ['AC']), el('div', { class: 'v' }, [String(a.ac)])]),
      el('div', {}, [el('div', { class: 'k' }, ['HP']), el('div', { class: 'v' }, [String(a.hpMax)])]),
      el('div', {}, [el('div', { class: 'k' }, ['CR']), el('div', { class: 'v' }, [a.cr || '—'])])
    ]));
    box.appendChild(el('div', { class: 'abils' }, SRD.ABILITIES.map(function (k) {
      return el('div', { class: 'abil' }, [
        el('div', { class: 'k' }, [SRD.ABILITY_NAME[k]]),
        el('div', { class: 'v' }, [String(a.abilities[k])]),
        el('div', { class: 'm' }, [U.sign(SRD.mod(a.abilities[k]))])
      ]);
    })));
    ['creatureType', 'alignment', 'senses', 'languages'].forEach(function (k) {
      if (a[k]) box.appendChild(statRow(U.cap(k.replace('creatureType', 'type')), a[k]));
    });
    box.appendChild(el('div', { class: 'btnrow', style: { marginTop: '10px' } }, [
      btn('Open in Forge', function () {
        B.forge = CV.creature(m, { team: 'foe' });
        B.forge.__src = m;
        setMode('forge');
      }, 'sm primary'),
      btn('Send to game roster', function () { sendToGame(CV.creature(m, { team: 'foe' })); }, 'sm')
    ]));
    /* traits & actions as rendered prose */
    ['trait', 'action', 'reaction', 'legendary'].forEach(function (key) {
      if (!m[key] || !m[key].length) return;
      box.appendChild(el('div', { class: 'e-name' }, [U.cap(key === 'trait' ? 'traits' : key + 's')]));
      m[key].forEach(function (t) {
        box.appendChild(el('div', { class: 'e-item', html: '<b>' + T.render(t.name || '', 'html') + '</b> ' + T.renderEntries(t.entries, 'html') }));
      });
    });
    return box;
  }

  function spellCard(s) {
    var box = el('div', { class: 'panel' });
    box.appendChild(statRow('Level', s.level ? s.level : 'cantrip'));
    if (s.school) box.appendChild(statRow('School', s.school));
    if (s.range && s.range.distance) box.appendChild(statRow('Range', (s.range.distance.amount || '') + ' ' + (s.range.distance.type || '')));
    if (s.time && s.time[0]) box.appendChild(statRow('Casting time', (s.time[0].number || 1) + ' ' + s.time[0].unit));
    if (s.duration && s.duration[0]) box.appendChild(statRow('Duration', s.duration[0].type + (s.duration[0].duration ? ' ' + s.duration[0].duration.amount + ' ' + s.duration[0].duration.type : '')));
    box.appendChild(el('div', { class: 'btnrow', style: { marginTop: '10px' } }, [
      btn('Add to character', function () {
        if (!B.char.spells.some(function (x) { return x.name === s.name && x.source === s.source; })) B.char.spells.push(s);
        setMode('character');
        B.step = 5;
      }, 'sm primary')
    ]));
    return box;
  }

  /* ==== shared widgets =================================================== */
  function pickCard(name, source, sub, selected, onClick) {
    return el('button', { class: 'pick' + (selected ? ' sel' : ''), onClick: onClick }, [
      source ? el('span', { class: 'src' }, [source]) : null,
      el('div', { class: 'pn' }, [name]),
      el('div', { class: 'ps' }, [sub || ''])
    ]);
  }

  /* A scrollable, filterable browser over a record list.
     Everything is browsable by scrolling - search and the source filter only
     narrow it. Long lists render in chunks and append as you approach the
     bottom, so a 4,500-entry bestiary behaves like a 30-entry class list.

     opts: { kind | records, title, subFn, isSel, onPick, multi, afterPick,
             chunk, noSource } */
  var CHUNK = 120;

  function browseList(opts) {
    var recs = opts.records || FT.get(opts.kind) || [];
    var label = opts.title || (opts.kind ? opts.kind + 's' : 'entries');
    var q = '', srcFilter = '';
    var filtered = recs, shown = 0;

    var grid = el('div', { class: 'pickgrid' });
    var scroller = el('div', { class: 'pickscroll' }, [grid]);
    var count = el('div', { class: 'browse-count' });

    /* Source books present in THIS list, so the dropdown never offers a book
       that would filter everything away. */
    var sources = [];
    if (!opts.noSource) {
      var seen = {};
      recs.forEach(function (r) { if (r.source && !seen[r.source]) { seen[r.source] = 1; sources.push(r.source); } });
      sources.sort();
    }

    var cards = [];

    function makeCard(r) {
      var sel = opts.isSel ? opts.isSel(r) : false;
      var node = pickCard(r.name, r.source, opts.subFn ? opts.subFn(r) : '', sel, function () {
        opts.onPick(r);
        if (opts.multi || opts.single) {
          /* Repaint selection in place rather than rebuilding the page - keeps
             your scroll position when picking several items in a row, which
             matters a lot once the list is hundreds of entries long. */
          cards.forEach(function (c) {
            c.node.className = 'pick' + (opts.isSel(c.r) ? ' sel' : '');
          });
          if (opts.afterPick) opts.afterPick();
        }
      });
      cards.push({ r: r, node: node });
      return node;
    }

    function appendChunk() {
      var next = filtered.slice(shown, shown + (opts.chunk || CHUNK));
      next.forEach(function (r) { grid.appendChild(makeCard(r)); });
      shown += next.length;
      updateCount();
    }

    function updateCount() {
      U.clear(count);
      if (!filtered.length) { count.appendChild(el('span', {}, ['no matches'])); return; }
      var txt = shown < filtered.length
        ? 'showing ' + shown + ' of ' + filtered.length + ' — scroll for more'
        : 'showing all ' + filtered.length;
      count.appendChild(el('span', {}, [txt]));
      if (filtered.length !== recs.length) {
        count.appendChild(el('span', {}, [' · ']));
        count.appendChild(el('b', {}, [String(recs.length) + ' total']));
      }
    }

    function apply(keepScroll) {
      var top = scroller.scrollTop;
      filtered = recs.filter(function (r) {
        if (srcFilter && r.source !== srcFilter) return false;
        if (q && String(r.name).toLowerCase().indexOf(q) < 0) return false;
        if (opts.filterFn && !opts.filterFn(r)) return false;
        return true;
      });
      U.clear(grid);
      cards = [];
      shown = 0;
      appendChunk();
      if (!filtered.length) grid.appendChild(el('div', { class: 'tiny' }, ['No matches.']));
      scroller.scrollTop = keepScroll ? top : 0;
    }

    scroller.addEventListener('scroll', function () {
      if (shown < filtered.length &&
          scroller.scrollTop + scroller.clientHeight > scroller.scrollHeight - 160) {
        appendChunk();
      }
    });

    var head = el('div', { class: 'browse-head' }, [
      el('div', { class: 'searchbar' }, [
        el('input', {
          type: 'text', placeholder: 'search ' + recs.length + ' ' + label + '…',
          onInput: U.debounce(function (e) { q = e.target.value.toLowerCase(); apply(); }, 110)
        })
      ]),
      sources.length > 1 ? selectEl(
        [{ value: '', label: 'All sources (' + sources.length + ')' }].concat(
          sources.map(function (s) { return { value: s, label: s }; })),
        '', function (v) { srcFilter = v; apply(); }) : null
    ]);

    apply();
    var panel = el('div', { class: 'panel' }, [
      opts.heading ? el('h3', {}, [opts.heading]) : null,
      recs.length > 8 ? head : null,     // no filter bar for a handful of options
      scroller, count
    ]);
    /* Let the caller re-run the filter (e.g. spell-level pills above the list). */
    panel.refresh = function () { apply(true); };
    return panel;
  }

  function entryPanel(title, entries) {
    if (!entries) return el('span', {});
    return el('div', { class: 'panel' }, [
      el('h3', {}, [title]),
      el('div', { class: 'entry-body', html: T.renderEntries(entries, 'html') })
    ]);
  }

  function numEl(value, min, max, onChange, step) {
    return el('input', {
      type: 'number', value: value, min: min, max: max, step: step || 1,
      onInput: function (e) { onChange(parseFloat(e.target.value) || 0); }
    });
  }
  function selectEl(options, value, onChange) {
    var s = el('select', { onChange: function (e) { onChange(e.target.value); } },
      options.map(function (o) { return el('option', { value: o.value, selected: o.value === value }, [o.label]); }));
    s.value = value;
    return s;
  }

  /* ==== export =========================================================== */
  function exportPanel(actor, getFresh) {
    var status = el('div', {});
    return el('div', { class: 'panel' }, [
      el('h3', {}, ['Export']),
      status,
      el('div', { class: 'btnrow' }, [
        btn('Send to game roster', function () {
          var res = sendToGame(getFresh());
          U.clear(status);
          status.appendChild(el('div', { class: res.ok ? 'ok-box' : 'err-box', html: res.message }));
        }, 'primary'),
        btn('Download JSON', function () {
          var a = getFresh();
          var blob = new Blob([JSON.stringify(a, null, 1)], { type: 'application/json' });
          var link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = String(a.name || 'statblock').replace(/[^\w-]+/g, '_') + '.json';
          document.body.appendChild(link); link.click();
          setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 400);
        })
      ]),
      el('p', { class: 'tiny', style: { marginTop: '8px' } }, [
        'The roster is shared with the game through this browser. If the game is open in another tab, reload it to see the new entry.'
      ])
    ]);
  }

  function sendToGame(actor) {
    try {
      var fresh = U.clone(actor);
      delete fresh.__src;
      fresh.id = U.uid('tpl');
      VT.store.init();
      if (!VT.store.campaign) VT.store.campaign = VT.store.blank('Sword Coast Skirmish');
      VT.store.campaign.roster.push(fresh);
      var r = VT.store.save();
      if (!r.ok) return { ok: false, message: U.esc(r.error) };
      return { ok: true, message: '<b>' + U.esc(fresh.name) + '</b> added to the campaign roster. Open the game and place it from the Roster tab.' };
    } catch (e) {
      return { ok: false, message: 'Could not save: ' + U.esc(e.message) };
    }
  }

  /* ==== minimal modal (the game's ui.js is not loaded here) ============== */
  VT.ui2 = {
    modal: function (opts) {
      var root = U.$('#modalRoot');
      U.clear(root);
      var box = el('div', { class: 'modal' }, [
        el('h3', {}, [opts.title || '']),
        el('div', { class: 'body' }, opts.body ? [opts.body] : []),
        el('div', { class: 'foot' }, (opts.buttons || [{ label: 'Close' }]).map(function (b) {
          return el('button', { class: 'btn ' + (b.cls || ''), onClick: function () {
            if (!b.onClick || b.onClick() !== false) U.clear(root);
          } }, [b.label]);
        }))
      ]);
      var bg = el('div', { class: 'modal-bg', onClick: function (e) { if (e.target === bg) U.clear(root); } }, [box]);
      root.appendChild(bg);
      return { close: function () { U.clear(root); } };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
