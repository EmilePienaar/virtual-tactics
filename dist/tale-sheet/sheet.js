/* Virtual Tactics :: TaleSpire symbiote.

   A 5e character sheet that lives inside TaleSpire. It builds characters from
   your own 5etools data, keeps them in the campaign's symbiote storage, and
   rolls everything through the real dice tray so the whole table sees the dice
   land - rather than reporting numbers the sheet made up on its own.

   Boot order matters: TaleSpire injects the TS object after DOMContentLoaded
   and then fires `hasInitialized`. Nothing may touch TS before that. If the
   event never arrives we are in a normal browser, so we install the dev shim
   and carry on. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, el = U.el, SRD = VT.srd, CV = VT.convert, FT = VT.fivetools;
  var SHOPS = VT.shops;                 // shared loot-code format with Tale Shop

  var SKILLS = VT.tags.SKILL_ABILITY;   // 18 skills -> governing ability
  var STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
  var POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

  /* Which slot each spell is currently set to be cast at, by spell name. */
  var S = {
    castAt: {}, castPact: {},
    tab: 'sheet',
    chars: [], activeId: null,
    adv: 0, crit: false,
    hpAmount: 5,          // survives re-render: you often heal what you just took
    coinEntry: '10 gp',
    tracked: {},
    linked: null,          // { id, name, hp:{value,max} }
    postToChat: false,
    live: false,           // true when the real TaleSpire API is present
    build: null,
    isGM: false, myClientId: null,
    table: {},             // clientId -> { sheet, name, at }  (GM view)
    shareSheet: true       // players mirror their sheet to the table
  };

  var view, toastHost;

  /* ==== boot ============================================================= */
  var booted = false;

  window.onStateChangeEvent = function (msg) {
    if (msg && msg.kind === 'hasInitialized' && !booted) boot(true);
  };

  window.onCreatureStateChange = function (evt) {
    if (!evt || !S.linked) return;
    var p = evt.payload || {};
    if (evt.kind === 'creatureHpChanged' && p.id === S.linked.id) {
      S.linked.hp = p.hp;
      if (S.tab === 'sheet') render();
    } else if (evt.kind === 'creatureRemoved' && p.id === S.linked.id) {
      S.linked = null;
      render();
    }
  };

  function boot(live) {
    if (booted) return;
    booted = true;
    S.live = !!live;
    view = document.getElementById('view');
    toastHost = document.getElementById('toast');

    if (!live && typeof window.installTSShim === 'function') window.installTSShim();

    wireChrome();
    /* Homebrew imported into this symbiote lives in its own storage and has to
       be put back into the compendium before anything reads it. Loading it
       first means the cache restore below merges it in one pass. */
    try { VT.homebrew.load(); VT.homebrew.apply(); } catch (e) {}
    Promise.all([
      loadState(),
      FT.loadCache().catch(function () { return null; }),
      initClientRole()
    ]).then(function () {
      render();
      autoConnectData();
      if (!live) toast('Running outside TaleSpire — dice are simulated locally.', 'err');
    });
  }

  /* Reconnect to the data with no dialog, in order of least friction:
       1. the cache is already warm       -> nothing to do
       2. a remembered folder handle      -> reopen it silently
       3. a data/ folder shipped alongside -> read it in place
     Only if all three miss does the Setup tab ask for anything. */
  function autoConnectData() {
    /* Homebrew shipped beside this symbiote loads whatever happens - it does
       not depend on a data source being connected, and needs no picker, so it
       is the one route that works identically on every OS and browser. */
    FT.loadBundledHomebrew().then(function (r) {
      if (r && r.records) {
        TS.debug.log('bundled homebrew: ' + r.records + ' records from ' + r.files + ' file(s)');
        render();
      }
    }).catch(function () {});

    if (FT.loaded) return;
    FT.reconnectDirectory().then(function (r) {
      if (r && r.ok) return quietLoad('remembered folder “' + r.name + '”');
      var base = new URL('.', window.location.href).href.replace(/\/$/, '');
      FT.useUrl(base);
      return FT.loadAll(function () {}).then(function (stats) {
        if (stats.records) {
          FT.saveCache();
          toast('Loaded ' + stats.records + ' records from the bundled data folder', 'ok');
          render();
        }
      }).catch(function () { /* nothing bundled; Setup will offer the options */ });
    }).catch(function () {});
  }

  function quietLoad(what) {
    return FT.loadAll(function () {}).then(function (stats) {
      if (!stats.records) return;
      FT.saveCache();
      toast('Loaded ' + stats.records + ' records from your ' + what, 'ok');
      render();
    }).catch(function () {});
  }

  /* In a browser `hasInitialized` never comes; give TaleSpire a moment first. */
  setTimeout(function () { if (!booted) boot(false); }, 1800);

  /* ==== persistence ====================================================== */
  function loadState() {
    return TS.localStorage.campaign.getBlob().then(function (raw) {
      var d = {};
      try { d = JSON.parse(raw || '{}'); } catch (e) { d = {}; }
      S.chars = Array.isArray(d.chars) ? d.chars : [];
      S.activeId = d.activeId || (S.chars[0] && S.chars[0].id) || null;
      S.postToChat = !!d.postToChat;
      /* Persist the repair, otherwise the bad expression comes back next load. */
      if (S.chars.map(repairActions).some(Boolean)) save();
      S.chars.forEach(ensurePlayFields);
      S.linked = d.linked || null;
      if (d.shareSheet != null) S.shareSheet = !!d.shareSheet;
    }).catch(function (e) {
      TS.debug.log('load failed: ' + (e && e.cause));
    });
  }

  /* Repair dice expressions on load. "1d6+-1" is arithmetically obvious but
     not valid notation, and older saves (or a slip in the Edit tab) can carry
     one; left alone it would silently roll nothing. */
  /* Characters imported as flat statblocks, or saved before a field existed,
     need the play-side values filled in before the sheet touches them. */
  function ensurePlayFields(a) {
    if (!a.coins) a.coins = VT.coin.emptyPurse();
    if (!Array.isArray(a.inventory)) a.inventory = [];
    if (!a.hitDie) a.hitDie = 8;
    if (a.hitDiceMax == null) a.hitDiceMax = a.level || 1;
    if (a.hitDiceUsed == null) a.hitDiceUsed = 0;
    if (a.acBonus == null) a.acBonus = 0;
    if (!Array.isArray(a.features)) a.features = [];
    if (!Array.isArray(a.expertise)) a.expertise = [];
    if (!Array.isArray(a.resources)) a.resources = [];
    if (!a.slotsUsed) a.slotsUsed = {};
    if (a.expertiseSlots == null) a.expertiseSlots = 0;
  }

  function repairActions(a) {
    var changed = false;
    (a.actions || []).forEach(function (act) {
      if (!act.dmg) return;
      var fixed = String(act.dmg).replace(/\+\s*-/g, '-').replace(/-\s*\+/g, '-').trim();
      if (fixed !== act.dmg) { act.dmg = fixed; changed = true; }
    });
    return changed;
  }

  var saveSoon = U.debounce(function () {
    var payload = JSON.stringify({
      v: 1, chars: S.chars, activeId: S.activeId,
      postToChat: S.postToChat, linked: S.linked, shareSheet: S.shareSheet
    });
    TS.localStorage.campaign.setBlob(payload).catch(function (e) {
      toast('Could not save: ' + (e && e.cause || e), 'err');
    });
  }, 400);

  function save() { saveSoon(); }

  /* ==== helpers ========================================================== */
  function active() {
    return S.chars.find(function (c) { return c.id === S.activeId; }) || null;
  }
  function toast(msg, cls) {
    if (!toastHost) return;
    var n = el('div', { class: 'toast-msg ' + (cls || ''), text: msg });
    toastHost.appendChild(n);
    setTimeout(function () { n.remove(); }, 4200);
  }
  function sign(n) { return (n >= 0 ? '+' : '') + n; }

  /* ==== rolling ========================================================== */
  /* Normal rolls go straight to the tray and TaleSpire publishes them.
     Advantage and disadvantage put two groups in quietly, then we evaluate both
     and publish only the winning one - the pattern the official dice roller
     example uses. */
  /* `disadvantage` is for a source the roll itself knows about - armour
     against Stealth, say - as opposed to the Adv/Dis buttons, which are the
     player's call. They combine the way the rules say: any advantage and any
     disadvantage cancel to a straight roll, however many of each there are. */
  function rollD20(label, mod, disadvantage) {
    var expr = '1d20' + (mod ? sign(mod) : '');
    var mode = S.adv;
    if (disadvantage) mode = mode > 0 ? 0 : -1;
    var name = label + (mode > 0 ? ' (Adv)' : mode < 0 ? ' (Dis)' : '');
    var descs = mode ? [{ name: name, roll: expr }, { name: name, roll: expr }]
                     : [{ name: name, roll: expr }];
    TS.dice.putDiceInTray(descs, !!mode).then(function (rollId) {
      S.tracked[rollId] = { mode: mode, label: name };
    }).catch(function (e) {
      toast('Roll failed: ' + (e && e.cause || e), 'err');
    });
  }

  /* Rolled in the tray like anything else; the result comes back through
     onRollResults and is recorded against the character. */
  function rollDeathSave() {
    var a = active();
    if (!a) return;
    TS.dice.putDiceInTray([{ name: 'Death save', roll: '1d20' }], true).then(function (rollId) {
      S.tracked[rollId] = { mode: 0, label: 'Death save', death: true };
    }).catch(function (e) { toast('Roll failed: ' + (e && e.cause || e), 'err'); });
  }

  function rollDamage(label, expr) {
    if (!expr || expr === '0') { toast('No damage on ' + label); return; }
    if (VT.dice.roll(expr).invalid) {
      toast('"' + expr + '" is not a valid roll — fix it in the Edit tab', 'err');
      return;
    }
    var use = S.crit ? VT.dice.critDice(expr) : expr;
    var name = label + (S.crit ? ' (Crit)' : '') + ' damage';
    TS.dice.putDiceInTray([{ name: name, roll: use }], false).then(function (rollId) {
      S.tracked[rollId] = { mode: 0, label: name };
      if (S.crit) { S.crit = false; syncChrome(); }
    }).catch(function (e) { toast('Roll failed: ' + (e && e.cause || e), 'err'); });
  }

  /* A hit die is rolled in the tray like anything else; the healing is applied
     when the result comes back, so the table sees the die land. */
  function spendHitDie(a) {
    var left = Math.max(0, (a.hitDiceMax || a.level) - (a.hitDiceUsed || 0));
    if (left <= 0) { toast('No hit dice left', 'err'); return; }
    var conMod = VT.actor.abilityMod(a, 'con');
    var expr = '1d' + (a.hitDie || 8) + (conMod ? sign(conMod) : '');
    TS.dice.putDiceInTray([{ name: a.name + ' hit die', roll: expr }], false).then(function (rollId) {
      S.tracked[rollId] = { mode: 0, label: 'Hit die', heal: true };
      a.hitDiceUsed = (a.hitDiceUsed || 0) + 1;
      save(); render();
    }).catch(function (e) { toast('Roll failed: ' + (e && e.cause || e), 'err'); });
  }

  function rollRaw(label, expr) {
    if (VT.dice.roll(expr).invalid) {
      toast('"' + expr + '" is not a valid roll', 'err');
      return;
    }
    TS.dice.putDiceInTray([{ name: label, roll: expr }], false).then(function (rollId) {
      S.tracked[rollId] = { mode: 0, label: label };
    }).catch(function (e) { toast('Roll failed: ' + (e && e.cause || e), 'err'); });
  }

  window.onRollResults = function (evt) {
    if (!evt) return;
    if (evt.kind === 'rollRemoved') { delete S.tracked[evt.payload.rollId]; return; }
    if (evt.kind !== 'rollResults') return;

    var roll = evt.payload;
    var meta = S.tracked[roll.rollId];
    if (!meta) return;                       // someone else's roll
    delete S.tracked[roll.rollId];

    var groups = roll.resultsGroups || [];
    if (!groups.length) return;

    Promise.all(groups.map(function (g) {
      return TS.dice.evaluateDiceResultsGroup(g).catch(function () { return null; });
    })).then(function (sums) {
      var valid = sums.map(function (s) { return typeof s === 'number' ? s : null; });
      var idx = 0;
      if (meta.mode) {
        for (var i = 1; i < valid.length; i++) {
          if (valid[i] == null) continue;
          if (valid[idx] == null ||
              (meta.mode > 0 ? valid[i] > valid[idx] : valid[i] < valid[idx])) idx = i;
        }
        TS.dice.sendDiceResult([groups[idx]], roll.rollId)
          .catch(function (e) { TS.debug.log('sendDiceResult failed: ' + (e && e.cause)); });
      }
      var total = valid[idx];
      /* A death save is judged on the FACE of the die, not the total - a
         natural 20 stands you up and a natural 1 costs two failures - so the
         raw result matters, not the sum. */
      if (total != null && meta.death) {
        var dying = active();
        if (dying) {
          var nat = natOf(groups[idx], total);
          var r = VT.actor.deathSave(dying, nat);
          var say = r.result === 'revived' ? dying.name + ' is up with 1 hit point!'
            : r.result === 'fumble' ? 'natural 1 — two failures'
            : r.result === 'success' ? 'success (' + dying.deathSaves.s + '/3)'
            : 'failure (' + dying.deathSaves.f + '/3)';
          if (r.outcome === 'dead') say += ' — three failures. Dead.';
          if (r.outcome === 'stable') say += ' — three successes. Stable.';
          toast('Death save ' + nat + ': ' + say,
                r.result === 'success' || r.result === 'revived' ? 'ok' : 'err');
          if (S.postToChat) postChat('death save ' + nat + ' — ' + say);
          save(); render();
        }
        return;
      }

      if (total != null && meta.heal) {
        var who = active();
        if (who) {
          var got = VT.actor.healBy(who, Math.max(0, total));
          toast('Hit die -> ' + total + ' - healed ' + got, 'ok');
          if (S.postToChat) postChat('spends a hit die and heals ' + got);
          save(); render();
        }
        return;
      }
      if (total != null) {
        var extra = meta.mode && valid.length > 1
          ? '  [' + valid.filter(function (v) { return v != null; }).join(' / ') + ']' : '';
        toast(meta.label + ' → ' + total + extra, 'ok');
        if (S.postToChat) postChat(meta.label + ': ' + total + extra);
      }
    });
  };

  /* The natural face of the d20 in a group. evaluateDiceResultsGroup gives the
     total including modifiers, but a death save cares about the die itself. */
  function natOf(group, fallback) {
    var found = null;
    (function walk(node) {
      if (!node || found != null) return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (typeof node !== 'object') return;
      if (node.value != null && (node.size === 20 || node.dieType === 'd20')) {
        found = node.value; return;
      }
      Object.keys(node).forEach(function (k) { walk(node[k]); });
    })(group);
    return found == null ? fallback : found;
  }

  function postChat(text) {
    var a = active();
    var msg = (a ? a.name + ' — ' : '') + text;
    TS.players.getPlayersInThisBoard().then(function (players) {
      var ids = (players || []).map(function (p) { return p.id; });
      if (!ids.length) return;
      TS.chat.multiSend(msg, ids).catch(function (e) {
        TS.debug.log('chat failed: ' + (e && e.cause));
      });
    }).catch(function () {});
  }

  /* ==== chrome (top bar + tabs) ========================================== */
  function wireChrome() {
    U.$$('#rollMode button').forEach(function (b) {
      b.onclick = function () { S.adv = parseInt(b.dataset.adv, 10); syncChrome(); };
    });
    document.getElementById('critToggle').onclick = function () {
      S.crit = !S.crit; syncChrome();
    };
    U.$$('.tab').forEach(function (t) {
      t.onclick = function () {
        S.tab = t.dataset.tab;
        U.$$('.tab').forEach(function (x) { x.classList.toggle('on', x === t); });
        render();
      };
    });
    document.getElementById('charPick').onchange = function (e) {
      S.activeId = e.target.value; VT.choiceUI.reset(); save(); render();
    };
  }

  function syncChrome() {
    U.$$('#rollMode button').forEach(function (b) {
      b.classList.toggle('on', parseInt(b.dataset.adv, 10) === S.adv);
    });
    document.getElementById('critToggle').classList.toggle('on', S.crit);
  }

  function syncCharPick() {
    var sel = document.getElementById('charPick');
    U.clear(sel);
    if (!S.chars.length) {
      sel.appendChild(el('option', { value: '' }, ['No characters yet']));
      return;
    }
    S.chars.forEach(function (c) {
      sel.appendChild(el('option', { value: c.id }, [c.name +
        (c.className ? ' — ' + c.className.replace(/\s*\(.*\)/, '') + ' ' + c.level : '')]));
    });
    sel.value = S.activeId || '';
  }

  /* ==== render =========================================================== */
  function render() {
    syncChrome();
    syncCharPick();
    U.clear(view);
    ({ sheet: renderSheet, edit: renderEdit, party: renderParty,
       build: renderBuild, setup: renderSetup }[S.tab] || renderSheet)();
    if (S.tab === 'sheet' || S.tab === 'edit') shareSoon();
  }

  /* ---- sheet ---- */
  function renderSheet() {
    var a = active();
    if (!a) {
      view.appendChild(el('div', { class: 'warn' }, [
        'No character yet. Use the Build tab to make one from your 5etools data, ' +
        'or Setup to import a JSON character exported from the Forge.'
      ]));
      return;
    }
    var prof = VT.actor.prof(a);

    /* identity + core stats */
    var who = el('div', { class: 'card' });
    var head = el('div', { class: 'who' }, [
      el('div', {}, [
        el('div', { class: 'nm' }, [a.name]),
        el('div', { class: 'sub' }, [
          [a.raceName, a.className, 'level ' + a.level].filter(Boolean).join(' · ')
        ])
      ])
    ]);
    try { head.insertBefore(VT.actor.portrait(a, 40, 50), head.firstChild); } catch (e) {}
    who.appendChild(head);
    var acWhy = VT.actor.acSources(a);
    who.appendChild(el('div', { class: 'bigstats' }, [
      stat('AC', VT.actor.effectiveAC(a)), stat('HP', a.hp + '/' + a.hpMax),
      stat('SPD', VT.actor.speedOf(a)), stat('PROF', sign(prof))
    ]));

    if (acWhy.length) {
      who.appendChild(el('div', { class: 'muted', style: { textAlign: 'center' } }, ['AC ' + acWhy.join(', ')]));
    }

    /* Where the numbers came from. A character built with ability points left
       unspent looks exactly like a correct one, only worse, so the arithmetic
       is worth showing rather than making someone reverse it by hand. */
    if (a.acWhy || a.hpWhy) {
      who.appendChild(el('div', { class: 'muted', style: { textAlign: 'center', fontSize: '10px' } }, [
        [a.acWhy ? 'AC = ' + a.acWhy : null,
         a.hpWhy ? 'HP = ' + a.hpWhy : null].filter(Boolean).join('   \u00b7   ')
      ]));
    }
    if (a.acWhyAlt) {
      who.appendChild(el('div', { class: 'muted', style: { textAlign: 'center', fontSize: '10px' } }, [
        a.acWhyAlt
      ]));
    }

    /* hp */
    var frac = U.clamp(a.hp / Math.max(1, a.hpMax), 0, 1);
    who.appendChild(el('div', { class: 'hpbar' }, [
      el('i', { style: { width: (frac * 100) + '%',
        background: frac > .5 ? 'linear-gradient(180deg,#8ec97f,#5d8f52)'
                  : frac > .25 ? 'linear-gradient(180deg,#e0c46a,#a8873c)'
                  : 'linear-gradient(180deg,#d97b74,#8f4640)' } }),
      el('span', {}, [a.hp + ' / ' + a.hpMax + (a.tempHp ? '  (+' + a.tempHp + ' temp)' : '')])
    ]));
    var amt = el('input', {
      type: 'number', value: S.hpAmount, min: 0,
      onInput: function (e) { S.hpAmount = Math.max(0, parseInt(e.target.value, 10) || 0); }
    });
    who.appendChild(el('div', { class: 'hpctl' }, [
      el('button', { class: 'btn sm danger', onClick: function () {
        var n = S.hpAmount;
        var r = VT.actor.applyDamage(a, n, null);
        toast(a.name + ' takes ' + r.taken + (r.downed ? ' and drops!' : ''), r.downed ? 'err' : '');
        if (S.postToChat) postChat('takes ' + r.taken + ' damage (' + a.hp + '/' + a.hpMax + ')');
        save(); render();
      } }, ['− Damage']),
      amt,
      el('button', { class: 'btn sm', onClick: function () {
        var n = S.hpAmount;
        var g = VT.actor.healBy(a, n);
        toast(a.name + ' recovers ' + g);
        if (S.postToChat) postChat('heals ' + g + ' (' + a.hp + '/' + a.hpMax + ')');
        save(); render();
      } }, ['+ Heal']),
      el('button', { class: 'btn sm', title: 'Temporary hit points', onClick: function () {
        a.tempHp = Math.max(a.tempHp || 0, S.hpAmount);
        save(); render();
      } }, ['Temp'])
    ]));
    if (S.linked) {
      who.appendChild(el('div', { class: 'muted', style: { marginTop: '6px' } }, [
        'Linked mini: ' + S.linked.name +
        (S.linked.hp ? ' — ' + S.linked.hp.value + '/' + S.linked.hp.max + ' on the board' : '')
      ]));
    }
    view.appendChild(who);

    /* abilities */
    var abils = el('div', { class: 'card' }, [el('h3', {}, ['Abilities'])]);
    var grid = el('div', { class: 'abil-grid' });
    SRD.ABILITIES.forEach(function (k) {
      var mod = VT.actor.abilityMod(a, k);
      var sv = VT.features.saveMod(a, k);
      grid.appendChild(el('div', { class: 'abil-cell' }, [
        el('span', { class: 'k' }, [SRD.ABILITY_NAME[k]]),
        el('span', { class: 'v' }, [String(a.abilities[k])]),
        el('span', { class: 'acts' }, [
          el('button', { title: 'Ability check', onClick: function () {
            rollD20(SRD.ABILITY_NAME[k] + ' check', mod); } }, [sign(mod)]),
          el('button', { title: 'Saving throw' + ((a.saveProf || []).indexOf(k) >= 0 ? ' (proficient)' : '') +
              (a.saveBonusAll ? ' +' + a.saveBonusAll + ' from your aura' : ''),
            style: { color: (a.saveProf || []).indexOf(k) >= 0 ? 'var(--green)' : '' },
            onClick: function () { rollD20(SRD.ABILITY_NAME[k] + ' save', sv); } }, ['sv ' + sign(sv)])
        ])
      ]));
    });
    abils.appendChild(grid);
    abils.appendChild(el('div', { class: 'btnrow', style: { marginTop: '8px' } }, [
      el('button', { class: 'btn sm', onClick: function () {
        rollD20('Initiative', VT.actor.abilityMod(a, 'dex')); } }, ['Initiative']),
      el('button', { class: 'btn sm', onClick: function () {
        rollDeathSave(); } }, ['Death save'])
    ]));
    view.appendChild(abils);

    /* skills */
    a.skillProf = a.skillProf || [];
    var skillBox = el('div', {});
    a.expertise = a.expertise || [];
    Object.keys(SKILLS).sort().forEach(function (name) {
      var abil = SKILLS[name];
      var isProf = a.skillProf.indexOf(name) >= 0;
      var isExp = a.expertise.indexOf(name) >= 0;
      /* Expertise doubles proficiency, Jack of All Trades adds half to
         everything else — the feature engine owns that sum. */
      var mod = VT.features.skillMod(a, name);
      var src = VT.features.skillSource(a, name);
      var pip = el('span', {
        class: 'pip' + (isExp ? ' exp' : isProf ? ' on' : ''),
        title: isExp ? 'Expertise' : isProf ? 'Proficient' : 'Not proficient'
      });
      pip.onclick = function (e) {
        e.stopPropagation();
        if (isProf) a.skillProf = a.skillProf.filter(function (s) { return s !== name; });
        else a.skillProf.push(name);
        save(); render();
      };
      /* Heavy and medium armour give disadvantage on Stealth. Rolling that
         straight while wearing plate is quietly wrong, so the row says so and
         the roll takes it. */
      var stealthDis = name === 'stealth' && VT.gear && VT.gear.stealthDisadvantage(a);
      skillBox.appendChild(el('div', { class: 'rollrow', onClick: function () {
        rollD20(U.cap(name), mod, stealthDis); } }, [
        pip,
        el('span', { class: 'lbl' }, [U.cap(name),
          el('span', { class: 'sub' }, ['  ' + SRD.ABILITY_NAME[abil] +
            (stealthDis ? ' · disadvantage from ' + a.armorName : '') +
            (src && src !== 'proficient' ? ' · ' + src : '')])]),
        el('span', { class: 'mod' }, [sign(mod)])
      ]));
    });
    view.appendChild(el('details', {}, [
      el('summary', {}, ['Skills']), el('div', {}, [skillBox])
    ]));

    /* Damage resistances, from whatever granted them. */
    var defCard = defencesPanel(a);
    if (defCard) view.appendChild(defCard);

    /* What you are carrying, and what of it you are wearing. */
    var gearCard = gearPanel(a);
    if (gearCard) view.appendChild(gearCard);

    /* tool proficiencies - a thieves' tools check is a real thing to roll */
    if ((a.toolProf || []).length) {
      var toolCard = el('div', { class: 'card' }, [el('h3', {}, ['Tools'])]);
      var prof = VT.actor.prof(a);
      a.toolProf.forEach(function (t) {
        /* Which ability a tool check uses is the DM's call and changes with the
           task - picking a lock is Dexterity, spotting a forgery Intelligence -
           so offer the sensible default and let it be changed. */
        var abil = TOOL_ABILITY[String(t).toLowerCase()] || 'dex';
        var mod = VT.actor.abilityMod(a, abil) + prof;
        var sel = selectOf(SRD.ABILITIES.map(function (k) {
          return { value: k, label: SRD.ABILITY_NAME[k] };
        }), abil, function (v) { abil = v; });
        toolCard.appendChild(el('div', { class: 'rollrow' }, [
          el('span', { class: 'lbl' }, [U.cap(t), el('span', { class: 'sub' }, ['  proficient'])]),
          sel,
          el('button', { class: 'btn sm', onClick: function () {
            rollD20(U.cap(t) + ' (' + SRD.ABILITY_NAME[abil] + ')',
                    VT.actor.abilityMod(a, abil) + prof);
          } }, [sign(mod)])
        ]));
      });
      view.appendChild(toolCard);
    }

    /* Attacks and abilities. Spells used to be mixed in here, which meant a
       caster's attacks were buried under forty spells and the slots that pay
       for them were in a different card again. */
    var spells = (a.actions || []).filter(function (x) { return x.spellLevel != null; });
    var plain = (a.actions || []).filter(function (x) { return x.spellLevel == null; });

    var acts = el('div', { class: 'card' }, [el('h3', {}, ['Actions'])]);
    if (plain.length) {
      plain.forEach(function (act) { acts.appendChild(actionRow(a, act)); });
    } else {
      acts.appendChild(el('div', { class: 'muted' }, ['Nothing but spells.']));
    }
    view.appendChild(acts);

    var book = spellbookCard(a, spells);
    if (book) view.appendChild(book);

    /* Anything a spell has put on the board goes with the spells, not among
       the class features - a summon is something you cast, and looking for it
       anywhere else is looking in the wrong place. */
    (summonCards(a) || []).forEach(function (cd) { view.appendChild(cd); });

    /* the ranger's animal - one card, whether picking or playing */
    var compCard = companionCard(a);
    if (compCard) view.appendChild(compCard);

    /* wild shape: the picker, then the active form's own stat block */
    var wsCard = wildShapeCard(a);
    if (wsCard) view.appendChild(wsCard);
    var wsPanel = wildShapePanel(a);
    if (wsPanel) view.appendChild(wsPanel);

    /* coin */
    a.coins = a.coins || VT.coin.emptyPurse();
    var coinAmt = el('input', { type: 'text', value: S.coinEntry || '10 gp' ,
      onInput: function (e) { S.coinEntry = e.target.value; } });
    var purse = el('div', { class: 'card' }, [
      el('h3', {}, ['Coin']),
      el('div', { class: 'bigstats', style: { gridTemplateColumns: 'repeat(4,1fr)' } },
        VT.coin.denoms().filter(function (d) { return d.key !== 'ep' || a.coins.ep; })
          .map(function (d) { return stat(d.key.toUpperCase(), a.coins[d.key] || 0); })),
      el('div', { class: 'muted', style: { margin: '6px 0' } }, ['Total ' + VT.coin.format(a.coins)]),
      el('div', { class: 'hpctl' }, [
        el('button', { class: 'btn sm danger', onClick: function () {
          var n = VT.coin.parse(coinAmt.value);
          if (!n) { toast('Could not read "' + coinAmt.value + '"', 'err'); return; }
          var next = VT.coin.spend(a.coins, n);
          if (!next) { toast('Not enough coin — you have ' + VT.coin.format(a.coins), 'err'); return; }
          a.coins = next;
          toast('Spent ' + VT.coin.format(n), 'ok');
          if (S.postToChat) postChat('spends ' + VT.coin.format(n));
          save(); render();
        } }, ['− Spend']),
        coinAmt,
        el('button', { class: 'btn sm', onClick: function () {
          var n = VT.coin.parse(coinAmt.value);
          if (!n) { toast('Could not read "' + coinAmt.value + '"', 'err'); return; }
          a.coins = VT.coin.add(a.coins, n);
          toast('Gained ' + VT.coin.format(n), 'ok');
          save(); render();
        } }, ['+ Earn'])
      ]),
      el('p', { class: 'muted' }, ['Type amounts like "12 gp", "5sp 3cp", or a bare number of copper.'])
    ]);
    view.appendChild(purse);

    /* resources — ki, rage, bardic inspiration, superiority dice... */
    if ((a.resources || []).length) {
      var resCard = el('div', { class: 'card' }, [el('h3', {}, ['Resources'])]);
      a.resources.forEach(function (r) {
        var left = r.max - r.used;
        resCard.appendChild(el('div', { class: 'rollrow' }, [
          el('span', { class: 'lbl' }, [r.name,
            el('span', { class: 'sub' }, ['  per ' + r.per + ' rest'])]),
          el('button', { class: 'btn sm', disabled: r.used <= 0 ? true : null,
            title: 'Give one back', onClick: function () {
              VT.features.restore(a, r.key); save(); render();
            } }, ['+']),
          el('span', { class: 'mod', style: { color: left ? 'var(--green)' : 'var(--red)' } },
            [left + '/' + r.max]),
          el('button', { class: 'btn sm', disabled: left <= 0 ? true : null,
            title: 'Spend one', onClick: function () {
              if (VT.features.spend(a, r.key)) {
                toast(r.name + ' spent — ' + (r.max - r.used) + ' left');
                save(); render();
              }
            } }, ['−'])
        ]));
      });
      view.appendChild(resCard);
    }

    /* Spell slots live with the spells they pay for (see spellbookCard). This
       card is only for a character who has slots and no spells on the sheet -
       a multiclass who prepares from a book, or someone still being built. */
    if ((a.spellSlots || a.pactSlots) && !spells.length) {
      var slotCard = el('div', { class: 'card' }, [el('h3', {}, ['Spell slots'])]);
      if (a.casterLevel && (a.classes || []).length > 1) {
        slotCard.appendChild(el('div', { class: 'muted', style: { marginTop: 0 } }, [
          'Combined caster level ' + a.casterLevel + '. Pact slots are counted separately.'
        ]));
      }
      /* A warlock multiclass has BOTH pools: ordinary slots from the combined
         caster level, and pact slots that come back on a short rest. */
      if (a.pactSlots && !(a.spellSlots && a.spellSlots.pact)) {
        var pLeft = VT.features.pactLeft(a);
        slotCard.appendChild(el('div', { class: 'rollrow' }, [
          el('span', { class: 'lbl' }, ['Pact slots',
            el('span', { class: 'sub' }, ['  level ' + a.pactSlots.slotLevel + ' · short rest'])]),
          el('button', { class: 'btn sm', disabled: (a.slotsUsed.pact || 0) <= 0 ? true : null,
            onClick: function () {
              a.slotsUsed.pact = Math.max(0, (a.slotsUsed.pact || 0) - 1); save(); render();
            } }, ['+']),
          el('span', { class: 'mod', style: { color: pLeft ? 'var(--green)' : 'var(--red)' } },
            [pLeft + '/' + a.pactSlots.count]),
          el('button', { class: 'btn sm', disabled: pLeft <= 0 ? true : null,
            onClick: function () {
              a.slotsUsed.pact = (a.slotsUsed.pact || 0) + 1; save(); render();
            } }, ['−'])
        ]));
      }
      if (a.spellSlots && a.spellSlots.pact) {
        var pactLeft = VT.features.slotsLeft(a);
        slotCard.appendChild(el('div', { class: 'rollrow' }, [
          el('span', { class: 'lbl' }, ['Pact slots',
            el('span', { class: 'sub' }, ['  level ' + a.spellSlots.slotLevel + ' · short rest'])]),
          el('button', { class: 'btn sm', disabled: (a.slotsUsed.pact || 0) <= 0 ? true : null,
            onClick: function () {
              a.slotsUsed.pact = Math.max(0, (a.slotsUsed.pact || 0) - 1); save(); render();
            } }, ['+']),
          el('span', { class: 'mod', style: { color: pactLeft ? 'var(--green)' : 'var(--red)' } },
            [pactLeft + '/' + a.spellSlots.count]),
          el('button', { class: 'btn sm', disabled: pactLeft <= 0 ? true : null,
            onClick: function () {
              a.slotsUsed.pact = (a.slotsUsed.pact || 0) + 1; save(); render();
            } }, ['−'])
        ]));
      } else if (a.spellSlots && a.spellSlots.slots) {
        a.spellSlots.slots.forEach(function (max, i) {
          var lv = i + 1;
          var left = VT.features.slotsLeft(a, lv);
          slotCard.appendChild(el('div', { class: 'rollrow' }, [
            el('span', { class: 'lbl' }, [U.ord(lv) + ' level']),
            el('button', { class: 'btn sm', disabled: (a.slotsUsed[lv] || 0) <= 0 ? true : null,
              onClick: function () {
                a.slotsUsed[lv] = Math.max(0, (a.slotsUsed[lv] || 0) - 1); save(); render();
              } }, ['+']),
            el('span', { class: 'mod', style: { color: left ? 'var(--green)' : 'var(--red)' } },
              [left + '/' + max]),
            el('button', { class: 'btn sm', disabled: left <= 0 ? true : null,
              onClick: function () {
                a.slotsUsed[lv] = (a.slotsUsed[lv] || 0) + 1; save(); render();
              } }, ['−'])
          ]));
        });
      }
      view.appendChild(slotCard);
    }

    /* death saves - only once they matter */
    if (a.hp <= 0 || (a.deathSaves && (a.deathSaves.s || a.deathSaves.f))) {
      var ds = VT.actor.deathSaveState(a);
      var dsCard = el('div', { class: 'card' }, [el('h3', {}, ['Death saves'])]);
      ['s', 'f'].forEach(function (which) {
        var row = el('div', { class: 'rollrow' }, [
          el('span', { class: 'lbl' }, [which === 's' ? 'Successes' : 'Failures'])
        ]);
        var pips = el('span', { class: 'dspips' });
        for (var i = 0; i < 3; i++) {
          pips.appendChild(el('span', {
            class: 'dspip ' + (which === 's' ? 'ok' : 'bad') + (i < ds[which] ? ' on' : ''),
            title: 'Click to set',
            onClick: (function (n) {
              return function () { ds[which] = (ds[which] === n ? n - 1 : n); save(); render(); };
            })(i + 1)
          }));
        }
        row.appendChild(pips);
        dsCard.appendChild(row);
      });
      var outcome = VT.actor.deathSaveOutcome(a);
      if (outcome === 'dead') dsCard.appendChild(el('div', { class: 'warn' }, ['Three failures — dead.']));
      else if (a.stable) dsCard.appendChild(el('div', { class: 'ok' }, ['Stable.']));
      dsCard.appendChild(el('div', { class: 'btnrow', style: { marginTop: '6px' } }, [
        el('button', { class: 'btn sm primary', onClick: rollDeathSave }, ['Roll death save']),
        el('button', { class: 'btn sm', onClick: function () {
          VT.actor.clearDeathSaves(a); toast('Death saves cleared'); save(); render();
        } }, ['Clear'])
      ]));
      dsCard.appendChild(el('p', { class: 'muted' }, [
        'Rolled in the tray, and the result is recorded here — a natural 20 stands ' +
        'you up on 1 hit point, a natural 1 costs two failures.'
      ]));
      view.appendChild(dsCard);
    }

    /* conditions + rests */
    var cond = el('div', { class: 'card' }, [el('h3', {}, ['Conditions'])]);
    var chips = el('div', {});
    Object.keys(SRD.CONDITIONS).forEach(function (k) {
      var on = VT.actor.hasCond(a, k);
      var good = ['blessed', 'hasted', 'dodging', 'invisible'].indexOf(k) >= 0;
      chips.appendChild(el('span', {
        class: 'chip' + (good ? ' good' : '') + (on ? ' on' : ''),
        onClick: function () {
          if (on) VT.actor.removeCond(a, k); else VT.actor.addCond(a, k);
          save(); render();
        }
      }, [SRD.CONDITIONS[k].name]));
    });
    cond.appendChild(chips);
    view.appendChild(cond);

    /* rest & hit dice */
    var hdLeft = Math.max(0, (a.hitDiceMax || a.level) - (a.hitDiceUsed || 0));
    var conMod = VT.actor.abilityMod(a, 'con');
    var rest = el('div', { class: 'card' }, [
      el('h3', {}, ['Rest']),
      el('div', { class: 'rollrow' }, [
        el('span', { class: 'lbl' }, ['Hit dice',
          el('span', { class: 'sub' }, ['  d' + (a.hitDie || 8) + (conMod ? ' ' + sign(conMod) : '') + ' each'])]),
        el('span', { class: 'mod', style: { color: hdLeft ? 'var(--green)' : 'var(--red)' } },
          [hdLeft + '/' + (a.hitDiceMax || a.level)]),
        el('button', { class: 'btn sm primary', disabled: hdLeft <= 0 ? true : null,
          title: 'Roll one hit die in the tray and heal by the result',
          onClick: function () { spendHitDie(a); } }, ['Spend 1'])
      ]),
      el('div', { class: 'btnrow', style: { marginTop: '8px' } }, [
        el('button', { class: 'btn sm',
          title: 'Restores limited-use abilities. Spend hit dice above to heal.',
          onClick: function () {
            a.used = {};
            VT.features.rest(a, 'short');
            save(); render();
            toast('Short rest — short-rest resources restored. Spend hit dice to heal.');
          } }, ['Short rest']),
        el('button', { class: 'btn sm primary', onClick: function () {
          a.hp = a.hpMax; a.tempHp = 0; a.used = {}; a.conditions = [];
          VT.features.rest(a, 'long');
          var back = Math.max(1, Math.floor((a.hitDiceMax || a.level) / 2));
          a.hitDiceUsed = Math.max(0, (a.hitDiceUsed || 0) - back);
          save(); render();
          toast('Long rest — full HP, slots and resources, ' + back + ' hit dice back');
        } }, ['Long rest'])
      ])
    ]);
    view.appendChild(rest);

    /* features */
    if ((a.features || []).length) {
      var featBox = el('div', {});
      var byLevel = {};
      a.features.forEach(function (f) { (byLevel[f.level] = byLevel[f.level] || []).push(f); });
      Object.keys(byLevel).map(Number).sort(function (x, y) { return x - y; }).forEach(function (lv) {
        featBox.appendChild(el('div', { class: 'muted', style: { marginTop: '6px' } }, ['Level ' + lv]));
        byLevel[lv].forEach(function (f) {
          var open = false;
          var body = el('div', { class: 'hidden muted',
            style: { padding: '2px 4px 6px', whiteSpace: 'pre-wrap' } });
          featBox.appendChild(el('div', { class: 'rollrow', onClick: function () {
            open = !open;
            if (open && !body.textContent) {
              var note = (a.featureNotes || {})[f.name];
              var txt = VT.charbuild.featureText(f, (a.build && a.build.cls && a.build.cls.name) || '');
              body.textContent = (note ? '\u25b8 ' + note + '\n\n' : '') +
                (txt || 'Text unavailable - connect your 5etools data in Setup.');
            }
            body.classList.toggle('hidden', !open);
          } }, [
            el('span', { class: 'lbl' }, [f.name,
              el('span', { class: 'sub' }, [
                (f.subclass ? '  subclass' : '') +
                ((a.featureNotes || {})[f.name] ? '  · applied' : '')
              ])])
          ]));
          featBox.appendChild(body);
        });
      });
      view.appendChild(el('details', {}, [
        el('summary', {}, ['Features - ' + a.features.length]),
        el('div', {}, [featBox])
      ]));
    }

    /* what this character has chosen: fighting styles, invocations, feats */
    if ((a.picked || []).length) {
      var pickBox = el('div', {});
      VT.choiceUI.renderPicked(pickBox, a, { onChange: render });
      view.appendChild(el('details', {}, [
        el('summary', {}, ['Choices - ' + a.picked.length]),
        el('div', {}, [pickBox])
      ]));
    }

    var asi = a.asiStatus || { left: 0 };
    if (asi.left > 0) {
      view.appendChild(el('div', { class: 'card' }, [
        el('h3', {}, ['Ability Score Improvement']),
        el('div', { class: 'warn' }, [
          asi.left + ' unspent - assign them in the Edit tab.'
        ])
      ]));
    }

    /* attunement */
    var atMax = VT.actor.attuneMax(a);
    var atCard = el('div', { class: 'card' }, [
      el('h3', {}, ['Attunement - ' + VT.actor.attuneCount(a) + ' of ' + atMax])
    ]);
    for (var ai = 0; ai < atMax; ai++) {
      var item = (a.attuned || [])[ai];
      atCard.appendChild(el('div', { class: 'rollrow' }, [
        el('span', { class: 'lbl' }, [
          item ? item.name : el('span', { class: 'sub' }, ['empty slot']),
          item && item.note ? el('span', { class: 'sub' }, ['  ' + item.note]) : null
        ]),
        item ? el('button', { class: 'btn sm danger', onClick: (function (nm) {
          return function () {
            VT.actor.unattune(a, nm);
            VT.gear.recompute(a);
            toast('Attunement broken'); save(); render();
          };
        })(item.name) }, ['×']) : null
      ]));
    }
    /* Attune to what you are carrying, not to anything in the books. You
       cannot attune to an item you do not own, and offering several thousand of
       them made the one you do own hard to find. */
    var attunable = (a.inventory || []).filter(function (e) {
      return e.fx && e.fx.needsAttune &&
        !(a.attuned || []).some(function (x) {
          return String(x.name).toLowerCase() === String(e.name).toLowerCase();
        });
    });
    if (attunable.length) {
      atCard.appendChild(el('div', { class: 'muted', style: { marginTop: '6px' } }, ['In your pack']));
      attunable.forEach(function (e) {
        atCard.appendChild(el('div', { class: 'rollrow' }, [
          el('span', { class: 'lbl' }, [
            e.name,
            el('span', { class: 'sub' }, ['  ' + VT.itemfx.describe(e.fx)])
          ]),
          el('button', { class: 'btn sm primary', onClick: function () {
            var r = VT.actor.attune(a, { name: e.name });
            if (!r.ok) { toast(r.reason, 'err'); return; }
            VT.gear.recompute(a);
            toast('Attuned to ' + e.name, 'ok');
            save(); render();
          } }, ['Attune'])
        ]));
      });
    } else {
      atCard.appendChild(el('p', { class: 'muted' }, [
        'Nothing in your pack needs attunement. Add magic items on the Edit tab.'
      ]));
    }
    view.appendChild(atCard);

    /* free roll */
    var free = el('input', { type: 'text', value: '1d20', placeholder: 'e.g. 2d6+3' });
    view.appendChild(el('div', { class: 'card' }, [
      el('h3', {}, ['Custom roll']),
      el('div', { class: 'row' }, [
        free,
        el('button', { class: 'btn sm primary', onClick: function () {
          var expr = String(free.value || '').trim();
          if (VT.dice.roll(expr).invalid) { toast('Not a valid roll: ' + expr, 'err'); return; }
          rollRaw('Custom', expr);
        } }, ['Roll'])
      ])
    ]));
  }

  /* The slot picker under a levelled spell: which slot to spend, what it does
     at that level, and a Cast button that actually spends it. */
  /* Spells, by level, with the slots for each level at the head of its own
     section.

     The arrangement is D&D Beyond's and it is the right one: what you can cast
     and what you have left to cast it with are the same question, and keeping
     them in separate cards meant answering it twice. Cantrips come first and
     have no slot row, because they cost nothing. */
  function spellbookCard(a, spells) {
    if (!spells.length) return null;

    var card = el('div', { class: 'card' }, [el('h3', {}, ['Spells'])]);
    if (a.spellDC) {
      card.appendChild(el('div', { class: 'muted', style: { marginBottom: '6px' } }, [
        'Spell save DC ' + a.spellDC + ' · spell attack ' + sign(a.spellAttack)
      ]));
    }
    if (a.casterLevel && (a.classes || []).length > 1) {
      card.appendChild(el('div', { class: 'muted' }, [
        'Combined caster level ' + a.casterLevel + '. Pact slots are counted separately.'
      ]));
    }

    /* group by the level the spell is written at */
    var byLevel = {};
    spells.forEach(function (sp) {
      var lv = sp.spellLevel || 0;
      (byLevel[lv] = byLevel[lv] || []).push(sp);
    });

    /* Every level worth showing: one that has spells, and one that has slots
       even if nothing is prepared at it - an empty 3rd-level row is how you
       notice you can still upcast into it. */
    var levels = Object.keys(byLevel).map(Number);
    if (a.spellSlots && a.spellSlots.slots) {
      a.spellSlots.slots.forEach(function (max, i) {
        if (max > 0 && levels.indexOf(i + 1) < 0) levels.push(i + 1);
      });
    }
    levels.sort(function (x, y) { return x - y; });

    levels.forEach(function (lv) {
      card.appendChild(spellLevelHeader(a, lv));
      (byLevel[lv] || []).forEach(function (act) {
        card.appendChild(actionRow(a, act));
        var sl = S.castAt[act.name] || act.spellLevel;
        if (lv > 0) card.appendChild(castRow(a, act, sl, VT.upcast.at(act, sl)));
      });
      if (!(byLevel[lv] || []).length) {
        card.appendChild(el('div', { class: 'muted', style: { marginLeft: '6px' } }, [
          'nothing prepared at this level'
        ]));
      }
    });

    /* Warlock pact slots are their own pool on their own timer, so they get
       their own row rather than being folded into a level above. */
    var pact = a.pactSlots || (a.spellSlots && a.spellSlots.pact ? a.spellSlots : null);
    if (pact) {
      var left = a.pactSlots ? VT.features.pactLeft(a) : VT.features.slotsLeft(a);
      card.appendChild(slotRow(a, 'Pact slots',
        '  level ' + (pact.slotLevel || 1) + ' · short rest',
        left, pact.count, 'pact'));
    }
    return card;
  }

  /* The head of a level's section: its name, and the slots that pay for it. */
  function spellLevelHeader(a, lv) {
    if (lv === 0) {
      return el('div', { class: 'spell-head' }, [
        el('span', { class: 'lbl' }, ['Cantrips', el('span', { class: 'sub' }, ['  at will'])])
      ]);
    }
    var max = (a.spellSlots && a.spellSlots.slots && a.spellSlots.slots[lv - 1]) || 0;
    if (!max) {
      return el('div', { class: 'spell-head' }, [
        el('span', { class: 'lbl' }, [U.ord(lv) + ' level',
          el('span', { class: 'sub' }, ['  no slots'])])
      ]);
    }
    return slotRow(a, U.ord(lv) + ' level', '', VT.features.slotsLeft(a, lv), max, lv);
  }

  /* One spendable pool: a name, how many are left, and a way to change it. */
  function slotRow(a, label, sub, left, max, key) {
    return el('div', { class: 'spell-head' }, [
      el('span', { class: 'lbl' }, [label, sub ? el('span', { class: 'sub' }, [sub]) : null]),
      el('button', { class: 'btn sm', title: 'Regain a slot',
        disabled: (a.slotsUsed[key] || 0) <= 0 ? true : null,
        onClick: function () {
          a.slotsUsed[key] = Math.max(0, (a.slotsUsed[key] || 0) - 1); save(); render();
        } }, ['+']),
      el('span', { class: 'mod', style: { color: left ? 'var(--green)' : 'var(--red)' } },
        [left + '/' + max]),
      el('button', { class: 'btn sm', title: 'Spend a slot',
        disabled: left <= 0 ? true : null,
        onClick: function () {
          a.slotsUsed[key] = (a.slotsUsed[key] || 0) + 1; save(); render();
        } }, ['−'])
    ]);
  }

  function castRow(a, act, slot, shot) {
    var opts = VT.upcast.slotOptions(a, act);
    var row = el('div', { class: 'castrow' });
    if (!opts.length) {
      row.appendChild(el('span', { class: 'sub' }, ['  no slot of ' + U.ord(act.spellLevel) + ' level or higher']));
      return row;
    }
    row.appendChild(el('span', { class: 'sub' }, ['cast at']));
    opts.forEach(function (o) {
      var on = o.level === slot && (!o.pact || opts.length === 1 || S.castPact[act.name]);
      row.appendChild(el('button', {
        class: 'slotpip' + (on ? ' on' : '') + (o.left <= 0 ? ' out' : ''),
        title: (o.pact ? 'Pact slot' : U.ord(o.level) + ' level') + ' - ' + o.left + ' of ' + o.max + ' left',
        onClick: function () {
          S.castAt[act.name] = o.level;
          S.castPact[act.name] = !!o.pact;
          render();
        }
      }, [(o.pact ? 'P' : String(o.level)) + '\u00b7' + o.left]));
    });
    if (shot.note) row.appendChild(el('span', { class: 'sub' }, ['  ' + shot.note]));
    var chosen = opts.filter(function (o) {
      return o.level === slot && (!!o.pact === !!S.castPact[act.name]);
    })[0] || opts.filter(function (o) { return o.level === slot; })[0];
    row.appendChild(el('button', {
      class: 'btn sm primary', disabled: (!chosen || chosen.left <= 0) ? true : null,
      title: 'Spend the slot',
      onClick: function () {
        if (!chosen || !VT.upcast.spendSlot(a, chosen)) { toast('No slot left', 'err'); return; }
        toast(act.name + ' cast at ' + U.ord(chosen.level) + (chosen.pact ? ' (pact)' : ''));
        if (S.postToChat) postChat('casts ' + act.name + ' at ' + U.ord(chosen.level) + ' level');
        save(); render();
      }
    }, ['Cast']));
    return row;
  }

  /* The ability a tool check most often uses. The DM can override per roll. */
  var TOOL_ABILITY = {
    "thieves' tools": 'dex', 'thieves tools': 'dex', 'disguise kit': 'cha',
    'forgery kit': 'dex', 'herbalism kit': 'int', "healer's kit": 'wis',
    "navigator's tools": 'int', "poisoner's kit": 'int', "cartographer's tools": 'int',
    "alchemist's supplies": 'int', "brewer's supplies": 'int', "cook's utensils": 'wis',
    "smith's tools": 'str', "mason's tools": 'str', "carpenter's tools": 'str'
  };

  function stat(k, v) {
    return el('div', {}, [el('div', { class: 'k' }, [k]), el('div', { class: 'v' }, [String(v)])]);
  }

  /* ---- the ranger's companion -------------------------------------------

     Built like Wild Shape and for the same reason: the animal is a separate
     stat block beside the sheet, so changing which animal it is replaces one
     object and nothing about the ranger is touched. */

  /* ---- summoned creatures -------------------------------------------------

     A summon is the same idea as a companion with two extra questions: what
     level was it cast at, and which shape did you pick. Both change the block,
     so both live on it and changing either rebuilds it. */

  function summonCards(a) {
    if (!VT.summon || !FT.loaded) return [];
    var out = [];

    /* what is already on the board */
    (a.summons || []).forEach(function (sm, i) {
      out.push(summonPanel(a, sm, i));
    });

    /* what could be */
    var can = VT.summon.available(a);
    if (!can.length) return out;

    var card = el('div', { class: 'card' }, [el('h3', {}, ['Summons'])]);
    can.forEach(function (opt) {
      card.appendChild(el('div', { class: 'rollrow' }, [
        el('span', { class: 'lbl' }, [
          opt.spell,
          el('span', { class: 'sub' }, ['  ' + opt.mon.name +
            '  · cast at ' + U.ord(opt.minLevel) + ' or higher'])
        ]),
        el('button', { class: 'btn sm primary', onClick: function () {
          var forms = VT.summon.forms(opt.mon);
          a.summons = a.summons || [];
          a.summons.push(VT.summon.conjure(opt.mon, opt.minLevel,
            forms.length ? forms[0] : null, a));
          /* remember what it came from so the level and form can be changed */
          a.summons[a.summons.length - 1].from = opt.mon.name;
          a.summons[a.summons.length - 1].fromSource = opt.mon.source;
          a.summons[a.summons.length - 1].minLevel = opt.minLevel;
          save(); render();
          toast(opt.spell + ' cast', 'ok');
        } }, ['Summon'])
      ]));
    });
    card.appendChild(el('p', { class: 'muted' }, [
      'Casting here does not spend a slot - do that on the spell itself. This ' +
      'puts the creature\u2019s stat block on your sheet.'
    ]));
    out.push(card);
    return out;
  }

  function summonMon(sm) {
    return (FT.get('creature') || []).find(function (m) {
      return m.name === sm.from && (!sm.fromSource || m.source === sm.fromSource);
    });
  }

  function summonPanel(a, sm, index) {
    var card = el('div', { class: 'card wildshape summoned' }, [
      el('h3', {}, [sm.name + '  ·  ' + U.ord(sm.level) + ' level'])
    ]);

    card.appendChild(el('div', { class: 'bigstats' }, [
      stat('AC', sm.ac), stat('HP', sm.hp + '/' + sm.hpMax),
      stat('SPD', sm.speed), stat('STR', sm.abilities ? sm.abilities.str : '\u2014')
    ]));

    var frac = U.clamp(sm.hp / Math.max(1, sm.hpMax), 0, 1);
    card.appendChild(el('div', { class: 'hpbar' }, [
      el('i', { style: { width: (frac * 100) + '%',
        background: frac > .5 ? 'linear-gradient(180deg,#8ec97f,#5d8f52)'
                  : frac > .25 ? 'linear-gradient(180deg,#e0c46a,#a8873c)'
                  : 'linear-gradient(180deg,#d97b74,#8f4640)' } }),
      el('span', {}, [sm.hp + ' / ' + sm.hpMax])
    ]));

    var amount = 5;
    card.appendChild(el('div', { class: 'hpctl' }, [
      el('button', { class: 'btn sm danger', onClick: function () {
        sm.hp = Math.max(0, sm.hp - amount); save(); render();
      } }, ['− Damage']),
      el('input', { type: 'number', value: 5, min: 0,
        onInput: function (e) { amount = Math.max(0, parseInt(e.target.value, 10) || 0); } }),
      el('button', { class: 'btn sm', onClick: function () {
        sm.hp = Math.min(sm.hpMax, sm.hp + amount); save(); render();
      } }, ['+ Heal'])
    ]));

    var mon = summonMon(sm);

    /* the two things that change the block */
    if (mon) {
      var formList = VT.summon.forms(mon);
      if (formList.length) {
        var frow = el('div', { class: 'btnrow' });
        formList.forEach(function (f) {
          frow.appendChild(el('button', {
            class: 'btn sm' + (String(sm.form).toLowerCase() === f.toLowerCase() ? ' on' : ''),
            onClick: function () { reconjure(a, sm, index, sm.level, f); }
          }, [f]));
        });
        card.appendChild(el('div', { class: 'row' }, [
          el('label', {}, ['Shape']), frow
        ]));
      }

      var lrow = el('div', { class: 'btnrow' });
      for (var lv = sm.minLevel || sm.level; lv <= 9; lv++) {
        (function (n) {
          lrow.appendChild(el('button', {
            class: 'btn sm' + (n === sm.level ? ' on' : ''),
            onClick: function () { reconjure(a, sm, index, n, sm.form); }
          }, [String(n)]));
        })(lv);
      }
      card.appendChild(el('div', { class: 'row' }, [
        el('label', {}, ['Cast at']), lrow
      ]));
    }

    (sm.warnings || []).forEach(function (w) {
      card.appendChild(el('div', { class: 'warn' }, [w]));
    });

    (sm.actions || []).forEach(function (act) { card.appendChild(actionRow(a, act)); });

    if ((sm.traits || []).length) {
      card.appendChild(el('div', { class: 'muted', style: { marginTop: '6px' } }, [
        sm.traits.join('  ·  ')
      ]));
    }
    var extra = Object.keys(sm.speeds || {}).filter(function (k) { return k !== 'walk'; });
    if (extra.length) {
      card.appendChild(el('div', { class: 'muted' }, [
        extra.map(function (k) { return k + ' ' + sm.speeds[k] + ' ft'; }).join(', ')
      ]));
    }

    card.appendChild(el('div', { class: 'btnrow', style: { marginTop: '8px' } }, [
      el('button', { class: 'btn sm danger', onClick: function () {
        a.summons.splice(index, 1); save(); render();
      } }, ['Dismiss'])
    ]));
    return card;
  }

  /* Rebuild in place, keeping damage already taken where it still fits. */
  function reconjure(a, sm, index, level, form) {
    var mon = summonMon(sm);
    if (!mon) return;
    var hurt = Math.max(0, sm.hpMax - sm.hp);
    var next = VT.summon.conjure(mon, level, form, a);
    next.from = sm.from; next.fromSource = sm.fromSource; next.minLevel = sm.minLevel;
    next.hp = Math.max(1, next.hpMax - hurt);
    a.summons[index] = next;
    save(); render();
  }

  function companionCard(a) {
    if (!VT.companion || !VT.companion.kind(a)) return null;
    var c = a.companion;

    /* One card, not two. A picker card sitting above a stat block card left the
       ranger with two half-empty panels saying related things; the animal is
       one subject and reads as one. */
    var card = el('div', { class: 'card' + (c ? ' wildshape' : '') }, [
      el('h3', {}, [c
        ? c.name + '  ·  ' + (c.size || '') +
          (c.scaling ? '  ·  scales with you' : '')
        : 'Companion'])
    ]);

    if (c) {
      card.appendChild(el('div', { class: 'bigstats' }, [
        stat('AC', c.ac), stat('HP', c.hp + '/' + c.hpMax),
        stat('SPD', c.speed), stat('STR', c.abilities ? c.abilities.str : '\u2014')
      ]));

      var frac = U.clamp(c.hp / Math.max(1, c.hpMax), 0, 1);
      card.appendChild(el('div', { class: 'hpbar' }, [
        el('i', { style: { width: (frac * 100) + '%',
          background: frac > .5 ? 'linear-gradient(180deg,#8ec97f,#5d8f52)'
                    : frac > .25 ? 'linear-gradient(180deg,#e0c46a,#a8873c)'
                    : 'linear-gradient(180deg,#d97b74,#8f4640)' } }),
        el('span', {}, [c.hp + ' / ' + c.hpMax])
      ]));

      var amount = 5;
      card.appendChild(el('div', { class: 'hpctl' }, [
        el('button', { class: 'btn sm danger', onClick: function () {
          c.hp = Math.max(0, c.hp - amount); save(); render();
        } }, ['− Damage']),
        el('input', { type: 'number', value: 5, min: 0,
          onInput: function (e) { amount = Math.max(0, parseInt(e.target.value, 10) || 0); } }),
        el('button', { class: 'btn sm', onClick: function () {
          c.hp = Math.min(c.hpMax, c.hp + amount); save(); render();
        } }, ['+ Heal'])
      ]));

      (c.warnings || []).forEach(function (w) {
        card.appendChild(el('div', { class: 'warn' }, [w]));
      });

      (c.actions || []).forEach(function (act) { card.appendChild(actionRow(a, act)); });

      if (c.scaling) {
        card.appendChild(el('div', { class: 'muted', style: { marginTop: '6px' } }, [
          'AC, hit points and attacks come from your ranger level (' + c.ownerLevel +
          '). Re-take it after levelling to bring the numbers up.'
        ]));
      }
      if (c.senses) card.appendChild(el('div', { class: 'muted' }, ['Senses: ' + c.senses]));
      if (c.notes) {
        card.appendChild(el('p', { class: 'muted', style: { whiteSpace: 'pre-wrap' } }, [c.notes]));
      }

      card.appendChild(el('div', { class: 'btnrow', style: { marginTop: '8px' } }, [
        el('button', { class: 'btn sm', onClick: function () {
          a.companionPicking = !a.companionPicking; save(); render();
        } }, [a.companionPicking ? 'Never mind' : 'Change animal']),
        el('button', { class: 'btn sm danger', onClick: function () {
          a.companion = null; a.companionPicking = false; save(); render();
        } }, ['Dismiss'])
      ]));

      if (!a.companionPicking) return card;
      card.appendChild(el('div', { class: 'muted', style: { marginTop: '8px' } }, [
        'Choosing a different animal replaces this one.'
      ]));
    }

    if (!FT.loaded) {
      card.appendChild(el('div', { class: 'warn' }, [
        'Connect your 5etools data to choose a companion.'
      ]));
      return card;
    }

    var groups = VT.companion.options(a);
    if (!groups.length) {
      card.appendChild(el('div', { class: 'muted' }, ['No companion stat blocks in your data.']));
      return card;
    }

    groups.forEach(function (g) {
      card.appendChild(el('div', { class: 'spell-head' }, [
        el('span', { class: 'lbl' }, [g.group])
      ]));
      /* The 2014 list is every small beast in the books, so it gets a search
         rather than a hundred rows. The Primal ones are three. */
      if (g.list.length > 12) {
        var q = '';
        var box = el('div', { class: 'goods', style: { maxHeight: '170px', overflowY: 'auto' } });
        var draw = function () {
          U.clear(box);
          var shown = (q ? g.list.filter(function (m) {
            return String(m.name).toLowerCase().indexOf(q) >= 0;
          }) : g.list).slice(0, 40);
          shown.forEach(function (m) { box.appendChild(pickRow(a, m)); });
          if (!shown.length) box.appendChild(el('div', { class: 'muted' }, ['Nothing matches.']));
        };
        card.appendChild(el('input', { type: 'search', placeholder: 'search beasts\u2026',
          onInput: U.debounce(function (e) { q = e.target.value.toLowerCase(); draw(); }, 120) }));
        card.appendChild(box);
        draw();
      } else {
        g.list.forEach(function (m) { card.appendChild(pickRow(a, m)); });
      }
    });
    return card;
  }

  function pickRow(a, mon) {
    return el('div', { class: 'rollrow' }, [
      el('span', { class: 'lbl' }, [
        mon.name,
        el('span', { class: 'sub' }, ['  ' + (mon.source || '') +
          (VT.convert.crOf(mon) != null
            ? '  · CR ' + VT.wildshape.crLabel(VT.convert.crOf(mon)) : '')])
      ]),
      el('button', { class: 'btn sm primary', onClick: function () {
        a.companion = VT.companion.assume(mon, a);
        a.companionPicking = false;
        save(); render();
        toast(mon.name + ' joins you', 'ok');
      } }, ['Take'])
    ]);
  }

  /* ---- wild shape --------------------------------------------------------

     A form is shown BESIDE the character rather than replacing them. Swapping
     a sheet out means being able to put it back, and every bug in that shape
     costs somebody their character; this way dismissing a form deletes one
     object and touches nothing else.

     The beast keeps its own hit points, because that is the number actually
     being tracked at the table - damage goes to the form until it drops, and
     then you are yourself again with the hit points you had. */

  function wildShapeCard(a) {
    var lim = VT.wildshape.limits(a);
    var special = VT.wildshape.specials(a);
    if (!lim && !special.length) return null;          /* not a shapechanger */

    var card = el('div', { class: 'card' }, [el('h3', {}, ['Wild Shape'])]);

    if (a.wildShape) {
      card.appendChild(el('div', { class: 'ok' }, [
        'Currently ' + a.wildShape.name + '. Its stat block is below.'
      ]));
      card.appendChild(el('div', { class: 'btnrow' }, [
        el('button', { class: 'btn sm danger', onClick: function () {
          a.wildShape = null; save(); render();
          toast('Back to your own form', 'ok');
        } }, ['Revert to your own form'])
      ]));
      return card;
    }

    if (special.length) {
      var srow = el('div', { class: 'btnrow' });
      special.forEach(function (f) {
        srow.appendChild(el('button', { class: 'btn sm', title: f.parent || '', onClick: function () {
          toast(f.name + (f.parent ? ' (' + f.parent + ')' : '') +
                ' — its actions are already in your list', 'ok');
        } }, [f.name]));
      });
      card.appendChild(el('div', { class: 'muted' }, [
        'Forms that keep your own stat block. Their actions are already in your ' +
        'action list, so there is nothing to switch on.'
      ]));
      card.appendChild(srow);
    }

    if (!lim) return card;
    if (!FT.loaded) {
      card.appendChild(el('div', { class: 'warn' }, [
        'Connect your 5etools data to browse beasts.'
      ]));
      return card;
    }

    card.appendChild(el('div', { class: 'muted', style: { marginTop: '8px' } }, [
      lim.moon
        ? 'Circle of the Moon: up to CR ' + VT.wildshape.crLabel(lim.maxCr) + '.'
        : 'Up to CR ' + VT.wildshape.crLabel(lim.maxCr) +
          (lim.fly ? '' : ', no flying speed') + (lim.swim ? '' : ', no swimming speed') + '.'
    ]));

    var q = '', showAll = false;
    var results = el('div', { class: 'goods', style: { maxHeight: '190px', overflowY: 'auto' } });

    function draw() {
      U.clear(results);
      var list = VT.wildshape.beasts(a, { all: showAll });
      var shown = (q
        ? list.filter(function (m) { return String(m.name).toLowerCase().indexOf(q) >= 0; })
        : list).slice(0, 60);
      if (!shown.length) {
        results.appendChild(el('div', { class: 'muted' }, ['No beasts match.']));
        return;
      }
      shown.forEach(function (m) {
        results.appendChild(el('div', { class: 'rollrow' }, [
          el('span', { class: 'lbl' }, [
            m.name,
            el('span', { class: 'sub' }, ['  CR ' + VT.wildshape.crLabel(VT.convert.crOf(m)) +
              ' · AC ' + VT.convert.acOf(m) + ' · ' + VT.convert.hpOf(m) + ' hp'])
          ]),
          el('button', { class: 'btn sm primary', onClick: function () {
            a.wildShape = VT.wildshape.assume(m);
            /* Transforming costs a use. Spent here rather than left to the
               player, because the whole point is that the sheet keeps count -
               and the resource has its own +/- if a DM rules otherwise. */
            var res = (a.resources || []).find(function (r) { return r.key === 'wildshape'; });
            var short = res && res.used >= res.max;
            if (res && !short) res.used++;
            save(); render();
            toast('Wild shaped into ' + m.name +
              (short ? ' — but you have no uses left' : ''), short ? 'err' : 'ok');
          } }, ['Become'])
        ]));
      });
    }

    card.appendChild(el('input', { type: 'search', placeholder: 'search beasts…',
      onInput: U.debounce(function (e) { q = e.target.value.toLowerCase(); draw(); }, 120) }));
    card.appendChild(results);
    card.appendChild(el('div', { class: 'btnrow' }, [
      el('button', { class: 'btn sm', onClick: function () { showAll = !showAll; draw(); } },
        ['Ignore level limits'])
    ]));
    card.appendChild(el('p', { class: 'muted' }, [
      'The list follows the printed limits. Your DM has the last word, so the ' +
      'button above shows every beast in your data.'
    ]));
    draw();
    return card;
  }

  /* The form's own stat block, appended below the character's. */
  function wildShapePanel(a) {
    var w = a.wildShape;
    if (!w) return null;
    var keep = VT.wildshape.keeps(a);

    var card = el('div', { class: 'card wildshape' }, [
      el('h3', {}, [w.name + '  ·  ' + (w.size || '') + ' beast' +
        (w.cr != null ? '  ·  CR ' + VT.wildshape.crLabel(w.cr) : '')])
    ]);

    card.appendChild(el('div', { class: 'bigstats' }, [
      stat('AC', w.ac), stat('HP', w.hp + '/' + w.hpMax),
      stat('SPD', w.speed), stat('STR', w.abilities ? w.abilities.str : '—')
    ]));

    var frac = U.clamp(w.hp / Math.max(1, w.hpMax), 0, 1);
    card.appendChild(el('div', { class: 'hpbar' }, [
      el('i', { style: { width: (frac * 100) + '%',
        background: frac > .5 ? 'linear-gradient(180deg,#8ec97f,#5d8f52)'
                  : frac > .25 ? 'linear-gradient(180deg,#e0c46a,#a8873c)'
                  : 'linear-gradient(180deg,#d97b74,#8f4640)' } }),
      el('span', {}, [w.hp + ' / ' + w.hpMax])
    ]));

    var amount = 5;
    card.appendChild(el('div', { class: 'hpctl' }, [
      el('button', { class: 'btn sm danger', onClick: function () {
        w.hp = Math.max(0, w.hp - amount);
        save(); render();
        if (w.hp === 0) toast('The form drops — you revert with the hit points you had', 'err');
      } }, ['\u2212 Damage']),
      el('input', { type: 'number', value: 5, min: 0,
        onInput: function (e) { amount = Math.max(0, parseInt(e.target.value, 10) || 0); } }),
      el('button', { class: 'btn sm', onClick: function () {
        w.hp = Math.min(w.hpMax, w.hp + amount); save(); render();
      } }, ['+ Heal'])
    ]));

    if (w.hp === 0) {
      card.appendChild(el('div', { class: 'warn' }, [
        'The form has dropped. Revert, and any damage past this point carries ' +
        'over to your own hit points.'
      ]));
    }

    card.appendChild(el('div', { class: 'muted', style: { marginTop: '6px' } }, [
      'You keep your own INT ' + (keep.int || '—') + ', WIS ' + (keep.wis || '—') +
      ', CHA ' + (keep.cha || '—') + ', and your proficiencies.' +
      (w.senses ? '  Senses: ' + w.senses : '')
    ]));

    if ((w.actions || []).length) {
      card.appendChild(el('div', { class: 'muted', style: { marginTop: '8px' } }, [
        w.name + '\u2019s actions'
      ]));
      w.actions.forEach(function (act) {
        card.appendChild(actionRow(a, act));
      });
    }

    if (w.notes) {
      card.appendChild(el('p', { class: 'muted', style: { whiteSpace: 'pre-wrap' } }, [w.notes]));
    }

    card.appendChild(el('div', { class: 'btnrow', style: { marginTop: '8px' } }, [
      el('button', { class: 'btn sm danger', onClick: function () {
        a.wildShape = null; save(); render();
      } }, ['Close ' + w.name])
    ]));
    return card;
  }

  /* Resistances, immunities and vulnerabilities, with the conditional ones
     listed as reminders rather than claimed outright. */
  function defencesPanel(a) {
    var has = (a.resist || []).length || (a.immune || []).length ||
              (a.vulnerable || []).length || (a.conditionImmune || []).length ||
              (a.resistNotes || []).length;
    if (!has) return null;

    var card = el('div', { class: 'card' }, [el('h3', {}, ['Defences'])]);
    function row(label, list, cls) {
      if (!list || !list.length) return;
      var box = el('div', { class: 'row' }, [el('label', {}, [label])]);
      var chips = el('div', { class: 'grow' });
      list.forEach(function (t) { chips.appendChild(el('span', { class: 'chip ' + cls }, [U.cap(t)])); });
      box.appendChild(chips);
      card.appendChild(box);
    }
    row('Resistant', a.resist, 'good on');
    row('Immune', a.immune, 'good on');
    row('Vulnerable', a.vulnerable, 'bad on');
    row('Cond. immune', a.conditionImmune, 'good on');

    (a.resistNotes || []).forEach(function (n) {
      card.appendChild(el('div', { class: 'muted' }, [n]));
    });
    return card;
  }

  /* Worn and carried, with a way to change which is which.

     Equipment used to be a build-time choice with no way back: the armour you
     picked was a name and an AC number, and taking it off meant deleting it.
     Now it is an inventory entry with a flag, so a rogue can drop the mail
     before sneaking and put it back afterwards without losing it. */
  function gearPanel(a) {
    var inv = a.inventory || [];
    if (!inv.length) return null;
    var wearable = inv.filter(function (e) { return e.gear; });
    var rest = inv.filter(function (e) { return !e.gear; });

    var card = el('div', { class: 'card' }, [
      el('h3', {}, ['Equipment — ' + inv.length])
    ]);

    wearable.forEach(function (e) {
      var g = e.gear;
      var fxText = e.fx ? VT.itemfx.describe(e.fx) : '';
      var what = g.slot === 'trinket' ? (fxText || 'wondrous item')
        : g.slot === 'armor'
        ? (g.weight + ' armour · AC ' + g.ac +
           (g.stealth ? ' · stealth disadvantage' : '') +
           (g.strength ? ' · needs STR ' + g.strength : ''))
        : g.slot === 'shield' ? 'shield · +' + (g.ac || 2) + ' AC'
        : 'weapon';
      card.appendChild(el('div', { class: 'rollrow' }, [
        el('span', { class: 'lbl' }, [
          e.name + (e.qty > 1 ? '  ×' + e.qty : ''),
          el('span', { class: 'sub' }, ['  ' + what])
        ]),
        el('button', {
          class: 'btn sm' + (e.equipped ? ' on' : ''),
          title: e.equipped ? 'Take it off - it stays in your pack' : 'Put it on',
          onClick: function () { VT.gear.toggle(a, e); save(); render(); }
        }, [e.equipped ? 'Worn' : 'Wear'])
      ]));
    });

    if (rest.length) {
      card.appendChild(el('div', { class: 'muted', style: { marginTop: '8px' } }, ['Carried']));
      rest.forEach(function (e) {
        card.appendChild(el('div', { class: 'rollrow' }, [
          el('span', { class: 'lbl' }, [
            e.name + (e.qty > 1 ? '  ×' + e.qty : ''),
            e.note ? el('span', { class: 'sub' }, ['  ' + e.note]) : null
          ])
        ]));
      });
    }
    card.appendChild(el('p', { class: 'muted' }, [
      'Taking something off leaves it in your pack. Add and remove items on the Edit tab.'
    ]));
    return card;
  }

  /* One rollable action. Pulled out of the actions card so a wild-shaped form
     can list the beast's attacks through exactly the same path - the rolls, the
     advantage handling and the crit toggle are the sheet's, not a second
     implementation that drifts from it. */
  function actionRow(a, act) {
    var left = VT.actor.usesLeft(a, act);
    var line = el('div', { class: 'rollrow' }, [
      el('span', { class: 'lbl' }, [
        act.name + (act.cost === 'bonus' ? '  \u00b7  bonus' : ''),
        el('span', { class: 'sub' }, ['  ' + describe(act)])
      ])
    ]);
    if (act.kind === 'melee' || act.kind === 'ranged') {
      line.appendChild(el('button', { class: 'btn sm', title: 'Attack roll', onClick: function () {
        rollD20(act.name, act.toHit || 0);
        if (act.uses) { VT.actor.spendUse(a, act); save(); }
      } }, [sign(act.toHit || 0)]));
    }
    if (act.kind === 'save' && act.dc) {
      line.appendChild(act.autoHit
        ? el('span', { class: 'mod', title: 'Hits without an attack roll or save' }, ['auto'])
        : el('span', { class: 'mod', title: 'Save DC' }, ['DC' + act.dc]));
    }
    /* A levelled spell is cast AT a slot level, and the numbers follow. */
    var slot = act.spellLevel ? (S.castAt[act.name] || act.spellLevel) : 0;
    var shot = slot ? VT.upcast.at(act, slot) : { dmg: act.dmg, count: act.count || 1, note: '' };

    if (shot.dmg && shot.dmg !== '0') {
      var label = (shot.count > 1 ? shot.count + '\u00d7' : '') + shot.dmg;
      line.appendChild(el('button', { class: 'btn sm',
        title: act.kind === 'heal' ? 'Roll healing' : 'Roll damage',
        onClick: function () {
          var expr = shot.count > 1 ? VT.upcast.totalExpr(act, slot) : shot.dmg;
          if (act.kind === 'heal') rollRaw(act.name + ' healing', expr);
          else rollDamage(act.name + (shot.levels ? ' (' + U.ord(slot) + ')' : ''), expr);
          if (act.uses && act.kind !== 'melee' && act.kind !== 'ranged') { VT.actor.spendUse(a, act); save(); }
        } }, [label]));
    }
    if (act.uses) {
      line.appendChild(el('span', { class: 'mod', title: 'Uses remaining',
        style: { color: left ? 'var(--green)' : 'var(--red)' } }, [left + '/' + act.uses.max]));
    }
    return line;
  }

  function describe(act) {
    /* Actions read out of a feature's printed text are marked, because they
       were inferred rather than hand-checked: the reader abstains when it is
       unsure, but "confident" is not "correct", and the player should know
       which numbers to glance at before trusting them. */
    var mark = act.derived ? ' · read from text' : '';
    if (act.kind === 'melee') return 'melee ' + (act.reach || 5) + 'ft ' + (act.dmgType || '') + mark;
    if (act.kind === 'ranged') return 'ranged ' + (act.range ? act.range[0] + '/' + act.range[1] : '') + 'ft' + mark;
    if (act.kind === 'save') return (act.autoHit ? 'hits automatically'
      : String(act.save || '').toUpperCase() + ' save') +
      (act.aoe ? ' · ' + act.aoe.radius + 'ft' : '') + mark;
    if (act.kind === 'heal') return 'healing';
    return act.condition || act.kind;
  }

  /* ---- party ---- */
  function renderParty() {
    var box = el('div', { class: 'card' }, [el('h3', {}, ['Characters — ' + S.chars.length])]);
    if (!S.chars.length) box.appendChild(el('div', { class: 'muted' }, ['None yet.']));
    S.chars.forEach(function (c) {
      box.appendChild(el('div', { class: 'rollrow' }, [
        el('span', { class: 'lbl', onClick: function () { S.activeId = c.id; VT.choiceUI.reset(); S.tab = 'sheet';
          U.$$('.tab').forEach(function (x) { x.classList.toggle('on', x.dataset.tab === 'sheet'); });
          save(); render(); } }, [
          c.name, el('span', { class: 'sub' }, ['  ' + (c.className || '') + ' ' + c.level +
            ' · ' + c.hp + '/' + c.hpMax + ' hp'])
        ]),
        el('button', { class: 'btn sm', title: 'Export JSON', onClick: function () { exportChar(c); } }, ['⤓']),
        el('button', { class: 'btn sm danger', title: 'Delete', onClick: function () {
          S.chars = S.chars.filter(function (x) { return x.id !== c.id; });
          if (S.activeId === c.id) S.activeId = S.chars[0] ? S.chars[0].id : null;
          save(); render();
        } }, ['×'])
      ]));
    });
    view.appendChild(box);

    view.appendChild(el('div', { class: 'card' }, [
      el('h3', {}, ['Import']),
      el('div', { class: 'btnrow' }, [
        el('button', { class: 'btn sm primary', onClick: importChars }, ['Import character JSON'])
      ]),
      el('p', { class: 'muted' }, [
        'Accepts a statblock exported from the Forge, or a whole .vtcampaign file ' +
        '(its party is pulled in).'
      ])
    ]));

    if (S.isGM) view.appendChild(renderTable());
    else view.appendChild(el('div', { class: 'card' }, [
      el('h3', {}, ['Share with the GM']),
      el('div', { class: 'btnrow' }, [
        el('button', { class: 'btn sm' + (S.shareSheet ? ' on' : ''), onClick: function () {
          S.shareSheet = !S.shareSheet;
          if (S.shareSheet) shareSoon(); else syncSend({ p: 'vt1', t: 'gone' });
          save(); render();
        } }, ['Mirror my sheet to the GM'])
      ]),
      el('p', { class: 'muted' }, [
        'Sends a read-only summary — name, HP, AC, abilities, actions — to whoever is ' +
        'running the game, and lets them ask you for saves or apply damage. Your copy ' +
        'stays the authority.'
      ])
    ]));
  }

  function exportChar(c) {
    var blob = new Blob([JSON.stringify(c, null, 1)], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = String(c.name || 'character').replace(/[^\w-]+/g, '_') + '.json';
    document.body.appendChild(link); link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 400);
  }

  function importChars() {
    var picker = document.getElementById('jsonPicker');
    picker.value = '';
    picker.onchange = function () {
      var files = Array.prototype.slice.call(picker.files);
      var added = 0;
      Promise.all(files.map(function (f) { return f.text(); })).then(function (texts) {
        texts.forEach(function (t) {
          var data;
          try { data = JSON.parse(t); } catch (e) { return; }
          var list = Array.isArray(data) ? data
            : (data.roster ? data.roster.filter(function (r) { return r.team === 'party'; })
            : [data]);
          list.forEach(function (c) {
            if (!c || !c.name || !c.abilities) return;
            c.id = U.uid('pc');
            if (c.hp == null) c.hp = c.hpMax;
            S.chars.push(c);
            added++;
          });
        });
        if (added) {
          S.activeId = S.chars[S.chars.length - 1].id;
          save(); render();
          toast('Imported ' + added + ' character' + (added > 1 ? 's' : ''), 'ok');
        } else {
          toast('Nothing importable in that file', 'err');
        }
      });
    };
    picker.click();
  }

  /* ---- build ---- */
  function renderBuild() {
    if (!FT.loaded) {
      view.appendChild(el('div', { class: 'warn' }, [
        'No 5etools data connected. Open the Setup tab and point this at your data folder.'
      ]));
      return;
    }
    if (!S.build) {
      S.build = {
        name: '', level: 1, race: null, subrace: null, cls: null, subclass: null,
        background: null, base: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
        weapons: [], armor: null, shield: false, spells: []
      };
    }
    var b = S.build;

    var card = el('div', { class: 'card' }, [el('h3', {}, ['Build a character'])]);
    card.appendChild(labelled('Name', el('input', {
      type: 'text', value: b.name, placeholder: 'Adventurer',
      onInput: function (e) { b.name = e.target.value; }
    })));
    card.appendChild(labelled('Level', el('input', {
      type: 'number', value: b.level, min: 1, max: 20,
      onInput: function (e) { b.level = U.clamp(parseInt(e.target.value, 10) || 1, 1, 20); }
    })));

    card.appendChild(recordSelect('Race', 'race', b.race, function (r) {
      b.race = r; b.subrace = null; render();
    }));
    if (b.race) {
      var subs = FT.get('subrace').filter(function (s) {
        return String(s.raceName || '').toLowerCase() === String(b.race.name).toLowerCase();
      });
      if (subs.length) card.appendChild(recordSelect('Subrace', null, b.subrace, function (r) {
        b.subrace = r; render();
      }, subs));
    }
    card.appendChild(recordSelect('Class', 'class', b.cls, function (r) {
      b.cls = r; b.subclass = null; render();
    }));
    if (b.cls) {
      var subc = FT.get('subclass').filter(function (s) {
        return String(s.className || '').toLowerCase() === String(b.cls.name).toLowerCase();
      });
      if (subc.length) card.appendChild(recordSelect('Subclass', null, b.subclass, function (r) {
        b.subclass = r; render();
      }, subc));
    }
    card.appendChild(recordSelect('Background', 'background', b.background, function (r) {
      b.background = r; render();
    }));
    view.appendChild(card);

    /* abilities */
    var used = SRD.ABILITIES.reduce(function (s, k) { return s + (POINT_COST[b.base[k]] || 0); }, 0);
    var ab = el('div', { class: 'card' }, [
      el('h3', {}, ['Ability scores']),
      el('div', { class: 'muted', style: { marginBottom: '6px' } }, [(27 - used) + ' points left (point buy)'])
    ]);
    SRD.ABILITIES.forEach(function (k) {
      var bonus = VT.charbuild.racialBonuses(b)[k] || 0;
      ab.appendChild(el('div', { class: 'rollrow' }, [
        el('span', { class: 'lbl' }, [SRD.ABILITY_NAME[k]]),
        el('button', { class: 'btn sm', disabled: b.base[k] <= 8 ? true : null,
          onClick: function () { b.base[k]--; render(); } }, ['−']),
        el('span', { class: 'score' }, [String(b.base[k])]),
        el('button', { class: 'btn sm',
          disabled: (b.base[k] >= 15 || used - (POINT_COST[b.base[k]] || 0) + (POINT_COST[b.base[k] + 1] || 99) > 27) ? true : null,
          onClick: function () { b.base[k]++; render(); } }, ['+']),
        el('span', { class: 'mod' }, [String(b.base[k] + bonus) + (bonus ? ' (' + sign(bonus) + ')' : '')])
      ]));
    });
    ab.appendChild(el('div', { class: 'btnrow', style: { marginTop: '6px' } }, [
      el('button', { class: 'btn sm', onClick: function () {
        SRD.ABILITIES.forEach(function (k, i) { b.base[k] = STANDARD_ARRAY[i]; }); render();
      } }, ['Standard array']),
      el('button', { class: 'btn sm', onClick: function () {
        SRD.ABILITIES.forEach(function (k) {
          var r = [0, 0, 0, 0].map(function () { return VT.dice.die(6); }).sort(function (x, y) { return y - x; });
          b.base[k] = r[0] + r[1] + r[2];
        });
        render();
      } }, ['Roll 4d6']),
      el('button', { class: 'btn sm', onClick: function () {
        SRD.ABILITIES.forEach(function (k) { b.base[k] = 8; }); render();
      } }, ['Reset'])
    ]));
    view.appendChild(ab);

    /* gear */
    var gear = el('div', { class: 'card' }, [el('h3', {}, ['Gear'])]);
    var weapons = FT.get('item').filter(function (i) { return i.weapon || i.dmg1; });
    var armours = FT.get('item').filter(function (i) { return i.armor && i.ac; });
    gear.appendChild(addPicker('Weapon', weapons, function (rec) {
      if (rec) { b.weapons.push(rec); render(); }
    }));
    b.weapons.forEach(function (w, i) {
      gear.appendChild(el('div', { class: 'rollrow' }, [
        el('span', { class: 'lbl' }, [w.name, el('span', { class: 'sub' }, ['  ' + (w.dmg1 || '')])]),
        el('button', { class: 'btn sm danger', onClick: function () { b.weapons.splice(i, 1); render(); } }, ['×'])
      ]));
    });
    gear.appendChild(recordSelect('Armour', null, b.armor, function (r) { b.armor = r; render(); },
      armours, 'No armour'));
    gear.appendChild(el('div', { class: 'btnrow' }, [
      el('button', { class: 'btn sm' + (b.shield ? ' on' : ''), onClick: function () {
        b.shield = !b.shield; render();
      } }, ['Shield +2 AC'])
    ]));
    view.appendChild(gear);

    /* spells */
    if (b.cls && b.cls.spellcastingAbility) {
      var spells = FT.get('spell').filter(function (s) {
        var l = s.classes && s.classes.fromClassList;
        return !l || l.some(function (x) { return String(x.name).toLowerCase() === b.cls.name.toLowerCase(); });
      });
      var sp = el('div', { class: 'card' }, [el('h3', {}, ['Spells — ' + b.spells.length + ' chosen'])]);
      sp.appendChild(addPicker('Spell', spells, function (rec) {
        if (rec) { b.spells.push(rec); render(); }
      }, function (s) { return s.name + (s.level ? ' (' + s.level + ')' : ' (C)'); }));
      b.spells.forEach(function (s, i) {
        sp.appendChild(el('div', { class: 'rollrow' }, [
          el('span', { class: 'lbl' }, [s.name,
            el('span', { class: 'sub' }, ['  ' + (s.level ? 'level ' + s.level : 'cantrip')])]),
          el('button', { class: 'btn sm danger', onClick: function () { b.spells.splice(i, 1); render(); } }, ['×'])
        ]));
      });
      view.appendChild(sp);
    }

    /* preview + create */
    var preview = VT.charbuild.derive(b);
    var pointsLeft = 27 - SRD.ABILITIES.reduce(function (n, k) {
      return n + (POINT_COST[b.base[k]] || 0);
    }, 0);
    var asiDue = (preview.asiStatus && preview.asiStatus.earned) || 0;

    var result = el('div', { class: 'card' }, [
      el('h3', {}, ['Result']),
      el('div', { class: 'bigstats' }, [
        stat('AC', preview.ac), stat('HP', preview.hpMax),
        stat('SPD', preview.speed), stat('ACTS', preview.actions.length)
      ]),
      el('div', { class: 'muted', style: { textAlign: 'center', fontSize: '10px' } }, [
        [preview.acWhy ? 'AC = ' + preview.acWhy : null,
         preview.hpWhy ? 'HP = ' + preview.hpWhy : null].filter(Boolean).join('   \u00b7   ')
      ]),
      /* Every ability starts at 8 because that is where point buy starts. Left
         alone it produces a legal but crippled character - so say so here,
         where it can still be fixed, rather than letting it look like the
         sheet miscalculated later. */
      pointsLeft > 0
        ? el('div', { class: 'warn', style: { marginTop: '8px' } }, [
            pointsLeft + ' of 27 ability points are still unspent. Scores left at 8 give a ' +
            (-1) + ' modifier, which is why AC and HP look low \u2014 spend them above, or ' +
            'press Standard array.'
          ])
        : null,
      asiDue > 0
        ? el('div', { class: 'muted', style: { marginTop: '6px' } }, [
            'At level ' + (b.level || 1) + ' this character has earned ' + asiDue +
            ' ability score improvement' + (asiDue === 1 ? '' : 's') +
            ' \u2014 assign ' + (asiDue === 1 ? 'it' : 'them') + ' on the Edit tab after creating.'
          ])
        : null,
      el('div', { class: 'btnrow', style: { marginTop: '10px' } }, [
        el('button', { class: 'btn primary', onClick: function () {
          var made = VT.charbuild.derive(b);
          made.id = U.uid('pc');
          S.chars.push(made);
          S.activeId = made.id;
          S.build = null;
          S.tab = 'sheet';
          U.$$('.tab').forEach(function (x) { x.classList.toggle('on', x.dataset.tab === 'sheet'); });
          save(); render();
          toast('Created ' + made.name, 'ok');
        } }, ['Create character']),
        el('button', { class: 'btn', onClick: function () { S.build = null; render(); } }, ['Reset'])
      ])
    ]);
    view.appendChild(result);
  }

  function labelled(text, ctrl) {
    return el('div', { class: 'row' }, [el('label', {}, [text]), ctrl]);
  }

  /* A native <select> is the right control in a narrow panel: it scrolls
     hundreds of options without any custom virtualisation. */
  function recordSelect(label, kind, current, onPick, records, emptyLabel) {
    var recs = records || FT.get(kind) || [];
    var sel = el('select', {
      onChange: function (e) {
        var i = parseInt(e.target.value, 10);
        onPick(isNaN(i) || i < 0 ? null : recs[i]);
      }
    });
    sel.appendChild(el('option', { value: '-1' }, [emptyLabel || '— choose —']));
    recs.forEach(function (r, i) {
      sel.appendChild(el('option', { value: String(i) },
        [r.name + (r.source ? '  (' + r.source + ')' : '')]));
    });
    sel.value = current ? String(recs.indexOf(current)) : '-1';
    return labelled(label + '  ' + recs.length, sel);
  }

  function addPicker(label, recs, onAdd, fmt) {
    var sel = el('select', {});
    sel.appendChild(el('option', { value: '-1' }, ['— ' + label.toLowerCase() + ' —']));
    recs.forEach(function (r, i) {
      sel.appendChild(el('option', { value: String(i) },
        [(fmt ? fmt(r) : r.name) + (r.source ? '  (' + r.source + ')' : '')]));
    });
    return el('div', { class: 'row' }, [
      sel,
      el('button', { class: 'btn sm', onClick: function () {
        var i = parseInt(sel.value, 10);
        if (!isNaN(i) && i >= 0) onAdd(recs[i]);
      } }, ['Add'])
    ]);
  }

  /* ---- setup ---- */
  function renderSetup() {
    /* data source */
    view.appendChild(homebrewCard());

    var box = el('div', { class: 'card' }, [el('h3', {}, ['5etools data'])]);
    box.appendChild(el('div', { class: FT.loaded ? 'ok' : 'warn' }, [
      FT.loaded
        ? FT.stats.records + ' records loaded from ' + Object.keys(FT.sources).length + ' sources.'
        : 'Not connected. The sheet works without it — you just cannot build new characters in-game.'
    ]));
    var progress = el('div', {});
    box.appendChild(progress);
    var remembered = FT.rememberedName();
    if (remembered) {
      box.appendChild(el('div', { class: 'muted', style: { marginBottom: '6px' } }, [
        'Remembered folder: “' + remembered + '”'
      ]));
    }
    box.appendChild(el('div', { class: 'btnrow' }, [
      FT.supportsFS() ? el('button', { class: 'btn sm primary',
        title: 'Pick once; the folder is remembered for next time',
        onClick: function () { pickRemembered(progress); } },
        [remembered ? 'Reconnect / change folder…' : 'Choose folder & remember…']) : null,
      el('button', { class: 'btn sm', onClick: function () { pickFolder(progress); } },
        [FT.supportsFS() ? 'One-time pick…' : 'Choose data folder…']),
      el('button', { class: 'btn sm', title: 'Look for a data folder next to this symbiote',
        onClick: function () { tryBundledData(progress); } }, ['Use bundled ./data'])
    ]));
    box.appendChild(el('p', { class: 'muted' }, [
      FT.supportsFS()
        ? 'Pick your 5etools folder once and it is remembered — later sessions reopen it with ' +
          'no dialog. Dropping the data folder next to this symbiote works too, and never asks.'
        : 'Drop your 5etools data folder next to this symbiote and press “Use bundled ./data” — ' +
          'that survives restarts with no dialog at all.'
    ]));

    /* Homebrew that shipped with the symbiote. Nothing to connect and nothing
       to import - it is read from a folder beside these files, which is the one
       route that needs no picker and no filesystem API, so it behaves the same
       on Windows, Linux and anything else. */
    var bhb = FT.bundledHomebrew;
    if (bhb && bhb.records) {
      box.appendChild(el('div', { class: 'ok', style: { marginTop: '8px' } }, [
        'Bundled homebrew: ' + bhb.records + ' records from ' + bhb.files +
        (bhb.files === 1 ? ' file' : ' files') + ' shipped beside this symbiote.'
      ]));
    } else {
      box.appendChild(el('p', { class: 'muted' }, [
        'No bundled homebrew. To ship a supplement with this symbiote, put its ' +
        '.json in a homebrew/ folder here and name it in homebrew/index.json.'
      ]));
    }
    view.appendChild(box);

    /* board integration */
    var link = el('div', { class: 'card' }, [el('h3', {}, ['Board'])]);
    link.appendChild(el('div', { class: 'muted', style: { marginBottom: '6px' } }, [
      S.linked ? 'Linked to "' + S.linked.name + '".' : 'No mini linked.'
    ]));
    link.appendChild(el('div', { class: 'btnrow' }, [
      el('button', { class: 'btn sm', onClick: linkSelected }, ['Link selected mini']),
      S.linked ? el('button', { class: 'btn sm danger', onClick: function () {
        S.linked = null; save(); render();
      } }, ['Unlink']) : null
    ]));
    link.appendChild(el('p', { class: 'muted' }, [
      'Linking shows the mini\'s board HP next to your sheet. The symbiote API is ' +
      'read-only for board state, so the sheet cannot write HP back to the token.'
    ]));
    view.appendChild(link);

    /* chat */
    var chat = el('div', { class: 'card' }, [el('h3', {}, ['Chat'])]);
    chat.appendChild(el('div', { class: 'btnrow' }, [
      el('button', { class: 'btn sm' + (S.postToChat ? ' on' : ''), onClick: function () {
        S.postToChat = !S.postToChat; save(); render();
      } }, ['Post results to chat'])
    ]));
    chat.appendChild(el('p', { class: 'muted' }, [
      'Sends roll totals and HP changes to everyone on the board. The dice themselves ' +
      'always land in the tray for the table to see either way.'
    ]));
    view.appendChild(chat);

    /* storage */
    view.appendChild(el('div', { class: 'card' }, [
      el('h3', {}, ['Storage']),
      el('div', { class: 'muted' }, [
        S.chars.length + ' character' + (S.chars.length === 1 ? '' : 's') +
        ' saved in this campaign' + (S.live ? '' : ' (browser localStorage in dev mode)') + '.'
      ]),
      el('div', { class: 'btnrow', style: { marginTop: '8px' } }, [
        el('button', { class: 'btn sm danger', onClick: function () {
          S.chars = []; S.activeId = null; S.build = null;
          TS.localStorage.campaign.deleteBlob().catch(function () {});
          save(); render(); toast('All characters cleared');
        } }, ['Delete all characters'])
      ])
    ]));

    view.appendChild(el('div', { class: 'muted', style: { textAlign: 'center', padding: '6px' } }, [
      'Virtual Tactics sheet · ' + (S.live ? 'connected to TaleSpire' : 'development mode')
    ]));
  }

  /* Converted supplements. Three ways in, because a table has three
     situations: shipped alongside the symbiote, sitting in a homebrew/ folder
     inside the 5etools data everyone points at, or a one-off file someone
     sends you. The first needs nothing done at all. */
  function homebrewCard() {
    var card = el('div', { class: 'card' }, [el('h3', {}, ['Homebrew'])]);
    var fromFolder = FT.folderHomebrewCount ? FT.folderHomebrewCount() : 0;
    var stored = VT.homebrew ? VT.homebrew.count() : 0;
    var bundled = (FT.bundledHomebrew && FT.bundledHomebrew.records) || 0;

    if (bundled) {
      card.appendChild(el('div', { class: 'ok' }, [
        bundled + ' records shipped with this symbiote, loaded automatically.'
      ]));
    }
    if (fromFolder) {
      card.appendChild(el('div', { class: 'ok' }, [
        fromFolder + ' records loaded from the homebrew folder in your data source.'
      ]));
    }
    if (stored) {
      card.appendChild(el('div', { class: 'ok' }, [
        stored + ' records imported into this copy of the symbiote.'
      ]));
    }
    if (!bundled && !fromFolder && !stored) {
      card.appendChild(el('div', { class: 'muted' }, [
        'None loaded. Put a converted supplement in a "homebrew" folder inside ' +
        'your 5etools data and every device that reads it gets the content — ' +
        'no importing on each one. Or import a single file here.'
      ]));
    }

    card.appendChild(el('div', { class: 'btnrow', style: { marginTop: '8px' } }, [
      el('button', { class: 'btn sm primary', onClick: importHomebrew }, ['Import a file…']),
      stored ? el('button', { class: 'btn sm danger', onClick: function () {
        if (!confirm('Remove the homebrew imported into this symbiote? Content in your data folder stays.')) return;
        VT.homebrew.clearAll();
        toast('Imported homebrew removed');
        render();
      } }, ['Clear imported']) : null
    ]));
    card.appendChild(el('p', { class: 'muted' }, [
      'Races, classes, subclasses and spells from a supplement appear beside the ' +
      'published ones — in the Build tab, and in the choice tree on the Edit tab.'
    ]));
    return card;
  }

  function importHomebrew() {
    var input = el('input', { type: 'file', accept: 'application/json', multiple: true,
                              style: { display: 'none' } });
    document.body.appendChild(input);
    input.onchange = function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (!files.length) { input.remove(); return; }
      VT.homebrew.load();
      var added = 0, failed = [];
      Promise.all(files.map(function (f) {
        return f.text()
          .then(function (txt) { added += VT.homebrew.importJSON(txt, true); })
          .catch(function (e) { failed.push(f.name + ': ' + (e && e.message || e)); });
      })).then(function () {
        input.remove();
        if (added) toast(added + ' records imported', 'ok');
        failed.forEach(function (m) { toast(m, 'err'); });
        render();
      });
    };
    input.click();
  }

  function linkSelected() {
    TS.creatures.getSelectedCreatures().then(function (sel) {
      if (!sel || !sel.length) { toast('Select a mini on the board first', 'err'); return; }
      return TS.creatures.getMoreInfo([sel[0]]).then(function (info) {
        var c = info && info[0];
        if (!c) { toast('Could not read that mini', 'err'); return; }
        S.linked = { id: c.id, name: c.name, hp: c.hp };
        save(); render();
        toast('Linked to ' + c.name, 'ok');
      });
    }).catch(function (e) { toast('Link failed: ' + (e && e.cause || e), 'err'); });
  }

  function pickRemembered(progress) {
    FT.pickDirectory().then(function (h) {
      showBox(progress, 'ok', 'Reading “' + h.name + '” — this folder will be remembered.');
      runLoad(progress);
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      showBox(progress, 'err', 'Could not open that folder: ' + (e && e.message || e));
    });
  }

  function pickFolder(progress) {
    var picker = document.getElementById('dirPicker');
    picker.value = '';
    picker.onchange = function () {
      if (!picker.files.length) return;
      var n = FT.useFolder(picker.files);
      if (!n) { showBox(progress, 'err', 'No JSON files found under a data/ folder there.'); return; }
      runLoad(progress);
    };
    picker.click();
  }

  function tryBundledData(progress) {
    /* Resolve against the symbiote's own directory so it works whatever scheme
       TaleSpire serves the page from. */
    var base = new URL('.', window.location.href).href.replace(/\/$/, '');
    FT.useUrl(base);
    showBox(progress, 'warn', 'Looking in ' + base + '/data …');
    runLoad(progress);
  }

  function runLoad(progress) {
    U.clear(progress);
    var bar = el('i', { style: { width: '4%' } });
    var lab = el('div', { class: 'muted' }, ['starting…']);
    progress.appendChild(el('div', { class: 'progress' }, [bar]));
    progress.appendChild(lab);
    var seen = 0;
    FT.loadAll(function (p) {
      seen = Math.max(seen, p.files);
      bar.style.width = Math.min(96, 4 + seen * 0.55) + '%';
      lab.textContent = p.phase + ' — ' + p.files + ' files, ' + p.records + ' records';
    }).then(function (stats) {
      bar.style.width = '100%';
      if (!stats.records) {
        showBox(progress, 'err', 'Loaded nothing — that does not look like a 5etools data set.');
        return;
      }
      FT.saveCache();
      toast('Loaded ' + stats.records + ' records', 'ok');
      render();
    }).catch(function (e) {
      showBox(progress, 'err', 'Load failed: ' + (e && e.message || e));
    });
  }

  /* ==== edit / level up ================================================== */
  /* A derived character keeps its build references, so levelling re-derives
     hit points, proficiency and every attack bonus properly. Without the
     compendium loaded we fall back to arithmetic that is still correct for a
     standard character, and say so rather than pretending. */
  function renderEdit() {
    var a = active();
    if (!a) {
      view.appendChild(el('div', { class: 'warn' }, ['No character selected.']));
      return;
    }
    var prof = VT.actor.prof(a);

    /* --- identity + level --- */
    var idc = el('div', { class: 'card' }, [el('h3', {}, ['Identity'])]);
    idc.appendChild(labelled('Name', el('input', {
      type: 'text', value: a.name,
      onInput: function (e) { a.name = e.target.value; save(); }
    })));
    var lvlOut = el('span', { class: 'mod' }, [String(a.level)]);
    idc.appendChild(el('div', { class: 'rollrow' }, [
      el('span', { class: 'lbl' }, ['Level', el('span', { class: 'sub' }, ['  prof ' + sign(prof)])]),
      el('button', { class: 'btn sm', disabled: a.level <= 1 ? true : null,
        onClick: function () { changeLevel(a, a.level - 1); } }, ['−']),
      lvlOut,
      el('button', { class: 'btn sm', disabled: a.level >= 20 ? true : null,
        onClick: function () { changeLevel(a, a.level + 1); } }, ['+'])
    ]));
    if (a.build && a.build.cls) {
      idc.appendChild(el('div', { class: 'muted' }, [
        FT.loaded
          ? 'Levelling re-derives from ' + a.build.cls.name + ' — HP, proficiency and attack bonuses all update.'
          : 'No data connected: levelling will adjust HP and proficiency arithmetically. Connect your 5etools folder for a full re-derive.'
      ]));
    } else {
      idc.appendChild(el('div', { class: 'muted' }, [
        'Imported statblock with no build data — levelling adjusts HP and proficiency only.'
      ]));
    }
    view.appendChild(idc);

    /* --- classes and multiclassing --- */
    if (a.build) {
      var clsCard = el('div', { class: 'card' }, [el('h3', {}, ['Classes'])]);
      VT.choiceUI.renderClasses(clsCard, {
        actor: a,
        onChange: render,
        onLevel: function (i, lv) {
          var res = VT.charbuild.relevelClass(a, i, lv);
          if (!res.ok) { toast(res.reason, 'err'); return; }
          replaceChar(a, res.actor);
          toast('Now ' + res.actor.className + ' - ' + res.actor.hpMax + ' max HP', 'ok');
          save(); render();
        },
        onAdd: function (rec) {
          var res = VT.charbuild.addClassLevel(a, rec, null);
          if (!res.ok) { toast(res.reason, 'err'); return; }
          replaceChar(a, res.actor);
          toast('Took a level in ' + rec.name, 'ok');
          save(); render();
        }
      });
      view.appendChild(clsCard);

      /* --- the choice tree --- */
      var sum = (VT.choices && FT.loaded) ? VT.choices.summary(a.build) : null;
      var chCard = el('div', { class: 'card' }, [
        el('h3', {}, ['Choices' + (sum && sum.unspent ? ' - ' + sum.unspent + ' to make' : '')])
      ]);
      VT.choiceUI.render(chCard, {
        actor: a, build: a.build,
        onChange: function () {
          /* Picks change real numbers, so re-derive rather than just redraw. */
          var res = VT.charbuild.relevel(a, a.level);
          if (res.ok) replaceChar(a, res.actor);
          save(); render();
        }
      });
      view.appendChild(chCard);
    }

    /* --- core numbers --- */
    var core = el('div', { class: 'card' }, [
      el('h3', {}, ['Core numbers']),
      el('p', { class: 'muted', style: { marginTop: 0 } }, [
        'Every number here is yours to set directly. If the sheet works something ' +
        'out differently from your table, overrule it — nothing recalculates these ' +
        'behind your back.'
      ])
    ]);
    core.appendChild(labelled('Base AC', numInput(a.ac, 1, 40, function (v) { a.ac = v; save(); })));
    core.appendChild(labelled('AC bonus', numInput(a.acBonus || 0, -10, 20, function (v) {
      a.acBonus = v; save(); render();
    })));
    core.appendChild(el('div', { class: 'muted' }, [
      'Effective AC ' + VT.actor.effectiveAC(a) +
      (VT.actor.acSources(a).length ? ' (' + VT.actor.acSources(a).join(', ') + ')' : '') +
      '. Conditions such as Hasted add their own bonus automatically.'
    ]));
    core.appendChild(labelled('Current HP', numInput(a.hp, 0, 999, function (v) {
      a.hp = Math.max(0, Math.min(v, a.hpMax)); save(); render();
    })));
    core.appendChild(labelled('Max HP', numInput(a.hpMax, 1, 999, function (v) {
      a.hpMax = v; a.hp = Math.min(a.hp, v); save();
    })));
    core.appendChild(labelled('Temp HP', numInput(a.tempHp || 0, 0, 999, function (v) {
      a.tempHp = Math.max(0, v); save();
    })));
    core.appendChild(labelled('Speed', numInput(a.speed, 0, 200, function (v) { a.speed = v; save(); }, 5)));
    core.appendChild(labelled('Hit die', numInput(a.hitDie || 8, 4, 12, function (v) { a.hitDie = v; save(); }, 2)));
    core.appendChild(labelled('Hit dice max', numInput(a.hitDiceMax || a.level, 0, 20, function (v) {
      a.hitDiceMax = v; save();
    })));
    core.appendChild(labelled('Hit dice used', numInput(a.hitDiceUsed || 0, 0, 20, function (v) {
      a.hitDiceUsed = v; save();
    })));
    if (a.spellDC != null) {
      core.appendChild(labelled('Spell DC', numInput(a.spellDC, 1, 30, function (v) { a.spellDC = v; save(); })));
      core.appendChild(labelled('Spell atk', numInput(a.spellAttack || 0, -5, 20, function (v) { a.spellAttack = v; save(); })));
    }
    view.appendChild(core);

    /* --- ability score improvements --- */
    var asi = a.asiStatus || { earned: 0, spent: 0, left: 0 };
    if (asi.earned > 0) {
      var asiCard = el('div', { class: 'card' }, [
        el('h3', {}, ['Ability Score Improvements']),
        el('div', { class: asi.left ? 'warn' : 'ok' }, [
          asi.spent + ' of ' + asi.earned + ' assigned' + (asi.left ? ' — ' + asi.left + ' still to spend.' : '.')
        ])
      ]);
      (a.build && a.build.asi || []).forEach(function (entry, i) {
        asiCard.appendChild(el('div', { class: 'rollrow' }, [
          el('span', { class: 'lbl' }, [
            Object.keys(entry.picks || {}).map(function (k) {
              return SRD.ABILITY_NAME[k] + ' ' + sign(entry.picks[k]);
            }).join(', ') || 'empty'
          ]),
          el('button', { class: 'btn sm danger', onClick: function () {
            a.build.asi.splice(i, 1);
            rederive(a, 'Improvement removed');
          } }, ['×'])
        ]));
      });
      if (asi.left > 0) {
        var pickA = 'str', pickB = 'dex', mode = 'two';
        var abilOpts = SRD.ABILITIES.map(function (k) { return { value: k, label: SRD.ABILITY_NAME[k] }; });
        var rowTwo = el('div', { class: 'row' }, [
          selectOf(abilOpts, pickA, function (v) { pickA = v; }),
          selectOf(abilOpts, pickB, function (v) { pickB = v; })
        ]);
        var rowOne = el('div', { class: 'row hidden' }, [
          selectOf(abilOpts, pickA, function (v) { pickA = v; })
        ]);
        asiCard.appendChild(labelled('Style', selectOf([
          { value: 'two', label: '+1 to two abilities' },
          { value: 'one', label: '+2 to one ability' }
        ], mode, function (v) {
          mode = v;
          rowTwo.classList.toggle('hidden', v !== 'two');
          rowOne.classList.toggle('hidden', v !== 'one');
        })));
        asiCard.appendChild(rowTwo);
        asiCard.appendChild(rowOne);
        asiCard.appendChild(el('button', { class: 'btn sm primary', onClick: function () {
          var picks = {};
          if (mode === 'one') picks[pickA] = 2;
          else { picks[pickA] = (picks[pickA] || 0) + 1; picks[pickB] = (picks[pickB] || 0) + 1; }
          a.build = a.build || {};
          a.build.asi = (a.build.asi || []).concat([{ picks: picks }]);
          rederive(a, 'Ability scores improved');
        } }, ['Assign']));
        asiCard.appendChild(el('p', { class: 'muted' }, [
          'Scores cap at 20. Taking a feat instead? Record it as a custom feature below.'
        ]));
      }
      view.appendChild(asiCard);
    }

    /* --- coin --- */
    a.coins = a.coins || VT.coin.emptyPurse();
    var coinCard = el('div', { class: 'card' }, [el('h3', {}, ['Coin'])]);
    VT.coin.denoms().forEach(function (d) {
      coinCard.appendChild(labelled(d.name + ' (' + d.key + ')',
        numInput(a.coins[d.key] || 0, 0, 999999, function (v) {
          a.coins[d.key] = Math.max(0, v | 0); save();
        })));
    });
    coinCard.appendChild(el('div', { class: 'muted' }, [
      'Total ' + VT.coin.format(a.coins) + ' (' + VT.coin.toBase(a.coins) + ' cp)'
    ]));
    view.appendChild(coinCard);

    /* --- abilities --- */
    var ab = el('div', { class: 'card' }, [el('h3', {}, ['Ability scores'])]);
    SRD.ABILITIES.forEach(function (k) {
      ab.appendChild(el('div', { class: 'rollrow' }, [
        el('span', { class: 'lbl' }, [SRD.ABILITY_NAME[k]]),
        el('button', { class: 'btn sm', onClick: function () {
          a.abilities[k] = Math.max(1, a.abilities[k] - 1); save(); render();
        } }, ['−']),
        el('span', { class: 'score' }, [String(a.abilities[k])]),
        el('button', { class: 'btn sm', onClick: function () {
          a.abilities[k] = Math.min(30, a.abilities[k] + 1); save(); render();
        } }, ['+']),
        el('span', { class: 'mod' }, [sign(VT.actor.abilityMod(a, k))])
      ]));
    });
    ab.appendChild(el('div', { class: 'muted' }, [
      'Editing a score here does not re-roll hit points; adjust Max HP above if Constitution changed.'
    ]));
    view.appendChild(ab);

    /* --- gear & spells from the compendium --- */
    if (FT.loaded && a.build) {
      var add = el('div', { class: 'card' }, [el('h3', {}, ['Add from your data'])]);
      var weapons = FT.get('item').filter(function (i) { return i.weapon || i.dmg1; });
      /* By type, not by the `armor` flag: only the plain armours carry that,
         so every magic one would otherwise be missing from the list. */
      var ARM = ['LA', 'MA', 'HA', 'S'];
      var armours = FT.get('item').filter(function (i) {
        return ARM.indexOf(String(i.type || '').split('|')[0]) >= 0 || (i.armor && i.ac);
      });
      var spells = FT.get('spell');
      add.appendChild(addPicker('Weapon', weapons, function (rec) { addToBuild(a, 'weapons', rec); }));
      add.appendChild(addPicker('Spell', spells, function (rec) { addToBuild(a, 'spells', rec); },
        function (s) { return s.name + (s.level ? ' (' + s.level + ')' : ' (C)'); }));
      /* Armour goes into the pack like everything else. It used to jump
         straight onto the character with nothing in the inventory to show for
         it, which meant it could be swapped but never simply carried. */
      add.appendChild(addPicker('Armour', armours, function (rec) {
        VT.gear.add(a, rec, { equipped: true });
        save();
        toast('Wearing ' + rec.name, 'ok');
        render();
      }));

      /* Magic items: anything with a rarity. Attunement is recorded as a note
         so the attunement card can see it. */
      var magic = FT.get('item').filter(function (i) {
        return i.rarity && i.rarity !== 'none' && i.rarity !== 'unknown';
      });
      add.appendChild(addPicker('Magic item', magic, function (rec) {
        var entry = VT.gear.add(a, rec, { note: rec.reqAttune ? 'requires attunement' : '' });
        entry.rarity = rec.rarity || null;
        save();
        toast('Added ' + rec.name, 'ok');
        render();
      }, function (i) { return i.name + (i.rarity ? '  (' + i.rarity + ')' : ''); }));

      /* Tools: owning one and being proficient with it are different things,
         and only the second makes it rollable, so do both. */
      var TOOLKINDS = ['AT', 'T', 'GS', 'INS'];
      var tools = FT.get('item').filter(function (i) {
        return TOOLKINDS.indexOf(String(i.type || '').split('|')[0]) >= 0;
      });
      add.appendChild(addPicker('Tool', tools, function (rec) {
        VT.gear.add(a, rec, {});
        var key = String(rec.name).toLowerCase();
        a.toolProf = a.toolProf || [];
        var already = a.toolProf.some(function (t) { return String(t).toLowerCase() === key; });
        if (!already) a.toolProf.push(rec.name);
        if (a.build) a.build.toolProf = a.toolProf.slice();
        save();
        toast(already ? 'Added ' + rec.name
                      : 'Added ' + rec.name + ' and proficiency with it', 'ok');
        render();
      }));

      add.appendChild(el('div', { class: 'btnrow' }, [
        el('button', { class: 'btn sm' + (VT.gear.shield(a) ? ' on' : ''), onClick: function () {
          var have = VT.gear.shield(a);
          if (have) VT.gear.unequip(a, have);
          else VT.gear.add(a, { name: 'Shield', type: 'S', ac: 2 }, { equipped: true });
          save(); render();
        } }, ['Shield +2 AC'])
      ]));
      add.appendChild(el('p', { class: 'muted' }, [
        'Everything lands in your inventory. Wear and remove it on the Sheet tab.'
      ]));
      view.appendChild(add);
    } else if (!FT.loaded) {
      view.appendChild(el('div', { class: 'warn' }, [
        'Connect your 5etools data in Setup to add weapons, armour and spells from the books. ' +
        'You can still add actions by hand below.'
      ]));
    }

    /* --- expertise --- */
    if (a.expertiseSlots > 0) {
      a.expertise = a.expertise || [];
      var expCard = el('div', { class: 'card' }, [
        el('h3', {}, ['Expertise']),
        el('div', { class: a.expertise.length < a.expertiseSlots ? 'warn' : 'ok' }, [
          a.expertise.length + ' of ' + a.expertiseSlots + ' chosen — these skills use double proficiency.'
        ])
      ]);
      Object.keys(SKILLS).sort().forEach(function (name) {
        var on = a.expertise.indexOf(name) >= 0;
        var canPick = on || a.expertise.length < a.expertiseSlots;
        expCard.appendChild(el('span', {
          class: 'chip' + (on ? ' good on' : ''),
          style: { opacity: canPick ? 1 : .35, cursor: canPick ? 'pointer' : 'default' },
          onClick: function () {
            if (!canPick) return;
            if (on) a.expertise = a.expertise.filter(function (x) { return x !== name; });
            else a.expertise.push(name);
            if (a.build) a.build.expertise = a.expertise.slice();
            save(); render();
          }
        }, [U.cap(name)]));
      });
      expCard.appendChild(el('p', { class: 'muted' }, [
        'Rogues and bards normally take expertise in skills they are already proficient in.'
      ]));
      view.appendChild(expCard);
    }

    /* --- inventory --- */
    var inv = el('div', { class: 'card' }, [el('h3', {}, ['Inventory — ' + a.inventory.length])]);
    a.inventory.forEach(function (it, i) {
      inv.appendChild(el('div', { class: 'rollrow' }, [
        el('span', { class: 'lbl' }, [
          it.name,
          it.note ? el('span', { class: 'sub' }, ['  ' + it.note]) : null
        ]),
        numInput(it.qty == null ? 1 : it.qty, 0, 9999, function (v) { it.qty = v | 0; save(); }),
        el('button', { class: 'btn sm danger', onClick: function () {
          a.inventory.splice(i, 1); save(); render();
        } }, ['×'])
      ]));
    });
    var invName = '', invQty = 1, invNote = '';
    inv.appendChild(el('div', { class: 'row', style: { marginTop: '6px' } }, [
      el('input', { type: 'text', placeholder: 'Item bought or found',
        onInput: function (e) { invName = e.target.value; } }),
      numInput(1, 1, 9999, function (v) { invQty = v | 0; })
    ]));
    inv.appendChild(el('div', { class: 'row' }, [
      el('input', { type: 'text', placeholder: 'note (optional)',
        onInput: function (e) { invNote = e.target.value; } }),
      el('button', { class: 'btn sm primary', onClick: function () {
        if (!invName.trim()) { toast('Give it a name', 'err'); return; }
        a.inventory.push({ name: invName.trim(), qty: invQty, note: invNote.trim() });
        save(); render();
      } }, ['Add'])
    ]));
    inv.appendChild(el('p', { class: 'muted' }, [
      'Somewhere to keep what you buy in Tale Shop. Carried through level-ups.'
    ]));

    /* Collecting from Tale Shop. TaleSpire only lets two symbiotes talk when
       both carry a matching interop id, and a manifest declaring one is not
       always accepted - so the shop writes a short code instead and this reads
       it. Paste, check what it says, take it. */
    var pasted = '';
    var pasteReport = el('div', { class: 'muted' });
    var takeBtn = el('button', { class: 'btn sm primary', disabled: true }, ['Collect']);
    var pasteIn = el('textarea', {
      class: 'lootcode', rows: 2,
      placeholder: 'Paste a code from Tale Shop here',
      onInput: function (e) {
        pasted = e.target.value;
        var got = SHOPS.parseLootCode(pasted);
        takeBtn.disabled = !got;
        if (!pasted.trim()) { pasteReport.textContent = ''; pasteReport.className = 'muted'; return; }
        if (!got) {
          pasteReport.textContent = 'That does not look like a Tale Shop code.';
          pasteReport.className = 'warn';
          return;
        }
        pasteReport.textContent = 'Ready to collect: ' + SHOPS.describeLoot(got, VT.coin.system()) +
          (got.from ? ' — from ' + got.from : '');
        pasteReport.className = 'muted';
      }
    });
    takeBtn.addEventListener('click', function () {
      var got = SHOPS.parseLootCode(pasted);
      if (!got) { toast('Nothing readable in that code', 'err'); return; }
      acceptGrant({ items: got.items, coins: got.coins, from: got.from || 'Tale Shop' });
      pasteIn.value = ''; pasted = '';
      takeBtn.disabled = true;
      pasteReport.textContent = '';
    });
    inv.appendChild(el('h3', { style: { marginTop: '14px' } }, ['Collect from Tale Shop']));
    inv.appendChild(pasteIn);
    inv.appendChild(el('div', { class: 'btnrow' }, [takeBtn]));
    inv.appendChild(pasteReport);

    view.appendChild(inv);

    /* --- actions --- */
    var acts = el('div', { class: 'card' }, [el('h3', {}, ['Actions — ' + (a.actions || []).length])]);
    (a.actions || []).forEach(function (act, i) {
      acts.appendChild(compactActionEditor(a, act, i));
    });
    acts.appendChild(el('div', { class: 'btnrow', style: { marginTop: '8px' } }, [
      el('button', { class: 'btn sm', onClick: function () {
        var sm = VT.actor.abilityMod(a, 'str');
        a.actions.push(Object.assign(
          SRD.melee('New Attack', VT.actor.prof(a) + sm, '1d6' + (sm ? sign(sm) : ''), 'slashing'),
          { custom: true }));
        save(); render();
      } }, ['+ Attack']),
      el('button', { class: 'btn sm', onClick: function () {
        a.actions.push(Object.assign(SRD.saveSpell('New Effect', 'dex', a.spellDC || 13, '2d6', 'fire', 15, 60), { custom: true }));
        save(); render();
      } }, ['+ Save effect']),
      el('button', { class: 'btn sm', onClick: function () {
        a.actions.push({ name: 'New Feature', kind: 'buff', condition: 'blessed',
                         range: [0, 0], cost: 'action', custom: true, desc: '' });
        save(); render();
      } }, ['+ Feature'])
    ]));
    view.appendChild(acts);

    /* --- notes --- */
    view.appendChild(el('div', { class: 'card' }, [
      el('h3', {}, ['Notes']),
      el('textarea', { rows: 4, value: a.notes || '',
        onInput: function (e) { a.notes = e.target.value; a.notesCustom = true; save(); } })
    ]));
  }

  function numInput(v, min, max, cb, step) {
    return el('input', { type: 'number', value: v, min: min, max: max, step: step || 1,
      onInput: function (e) { cb(parseFloat(e.target.value) || 0); } });
  }

  function compactActionEditor(a, act, i) {
    var open = false;
    var wrap = el('div', { style: { border: '1px solid var(--line)', borderRadius: '5px',
      marginBottom: '6px', background: '#16151f' } });
    var body = el('div', { class: 'hidden', style: { padding: '0 8px 8px' } });

    var head = el('div', { class: 'rollrow', onClick: function () {
      open = !open; body.classList.toggle('hidden', !open);
    } }, [
      el('span', { class: 'lbl' }, [act.name,
        el('span', { class: 'sub' }, ['  ' + describe(act) + (act.custom ? ' · custom' : '')])]),
      el('button', { class: 'btn sm danger', onClick: function (e) {
        e.stopPropagation(); a.actions.splice(i, 1); save(); render();
      } }, ['×'])
    ]);

    body.appendChild(labelled('Name', el('input', { type: 'text', value: act.name,
      onInput: function (e) { act.name = e.target.value; save(); } })));
    body.appendChild(labelled('Type', selectOf([
      { value: 'melee', label: 'Melee' }, { value: 'ranged', label: 'Ranged' },
      { value: 'save', label: 'Save' }, { value: 'heal', label: 'Heal' }, { value: 'buff', label: 'Effect' }
    ], act.kind, function (v) { act.kind = v; act.custom = true; save(); render(); })));

    if (act.kind === 'melee' || act.kind === 'ranged') {
      body.appendChild(labelled('To hit', numInput(act.toHit || 0, -5, 25, function (v) { act.toHit = v; save(); })));
    }
    if (act.kind === 'save') {
      body.appendChild(labelled('Save', selectOf(SRD.ABILITIES.map(function (k) {
        return { value: k, label: SRD.ABILITY_NAME[k] }; }), act.save || 'dex',
        function (v) { act.save = v; save(); })));
      body.appendChild(labelled('DC', numInput(act.dc || 13, 1, 30, function (v) { act.dc = v; save(); })));
    }
    if (act.kind !== 'buff') {
      body.appendChild(labelled('Dice', el('input', { type: 'text', value: act.dmg || '',
        placeholder: '1d8+3',
        onInput: function (e) { act.dmg = e.target.value; save(); } })));
    }
    if (act.kind === 'melee' || act.kind === 'ranged' || act.kind === 'save') {
      body.appendChild(labelled('Dmg type', selectOf(SRD.DAMAGE_TYPES.map(function (d) {
        return { value: d, label: U.cap(d) }; }), act.dmgType || 'slashing',
        function (v) { act.dmgType = v; save(); })));
    }
    body.appendChild(labelled('Cost', selectOf([
      { value: 'action', label: 'Action' }, { value: 'bonus', label: 'Bonus' }, { value: 'reaction', label: 'Reaction' }
    ], act.cost || 'action', function (v) { act.cost = v; save(); })));
    body.appendChild(labelled('Uses', numInput(act.uses ? act.uses.max : 0, 0, 20, function (v) {
      act.uses = v > 0 ? { max: v, per: 'rest' } : null; save(); render();
    })));

    wrap.appendChild(head);
    wrap.appendChild(body);
    return wrap;
  }

  function selectOf(opts, value, onChange) {
    var s = el('select', { onChange: function (e) { onChange(e.target.value); } },
      opts.map(function (o) { return el('option', { value: o.value }, [o.label]); }));
    s.value = value;
    return s;
  }

  function addToBuild(a, key, rec) {
    a.build[key] = a.build[key] || [];
    a.build[key].push({ name: rec.name, source: rec.source || null });
    rederive(a, 'Added ' + rec.name);
  }

  function rederive(a, msg) {
    var res = VT.charbuild.relevel(a, a.level);
    if (!res.ok) { toast(res.reason, 'err'); return; }
    replaceChar(a, res.actor);
    toast(msg || 'Updated', 'ok');
    if (res.missing && res.missing.length) {
      toast('Not found in your data: ' + res.missing.join(', '), 'err');
    }
    save(); render();
  }

  function replaceChar(oldA, newA) {
    var i = S.chars.findIndex(function (c) { return c.id === oldA.id; });
    if (i >= 0) S.chars[i] = newA;
    S.activeId = newA.id;
  }

  function changeLevel(a, newLevel) {
    newLevel = U.clamp(newLevel, 1, 20);
    if (newLevel === a.level) return;

    if (FT.loaded && a.build && a.build.cls) {
      var res = VT.charbuild.relevel(a, newLevel);
      if (res.ok) {
        replaceChar(a, res.actor);
        toast('Now level ' + newLevel + ' — ' + res.actor.hpMax + ' max HP, prof ' +
              sign(VT.actor.prof(res.actor)), 'ok');
        if (res.missing && res.missing.length) toast('Missing: ' + res.missing.join(', '), 'err');
        save(); render();
        return;
      }
      toast(res.reason, 'err');
    }

    /* Fallback: arithmetic that is still correct for a standard character.
       Hit points gain the die's average plus Constitution, and proficiency
       applies to every derived attack and to the spell numbers. */
    var oldProf = SRD.profBonus(a.level), newProf = SRD.profBonus(newLevel);
    var faces = a.hitDie || 8;
    var conMod = SRD.mod(a.abilities.con);
    var per = Math.max(1, Math.floor(faces / 2) + 1 + conMod);
    var delta = newLevel - a.level;
    a.hpMax = Math.max(1, a.hpMax + delta * per);
    a.hp = U.clamp(a.hp + (delta > 0 ? delta * per : 0), 1, a.hpMax);
    a.level = newLevel;
    if (newProf !== oldProf) {
      var d = newProf - oldProf;
      (a.actions || []).forEach(function (act) {
        if (act.toHit != null && !act.custom) act.toHit += d;
      });
      if (a.spellDC != null) a.spellDC += d;
      if (a.spellAttack != null) a.spellAttack += d;
    }
    save(); render();
    toast('Now level ' + newLevel + ' — ' + a.hpMax + ' max HP, prof ' + sign(newProf) +
          (newProf !== oldProf ? ' (attack bonuses adjusted)' : ''), 'ok');
  }

  /* ==== GM table sync ==================================================== */
  /* Symbiotes sharing an interop id can message each other across clients.
     Players mirror a compact summary of their sheet; the GM collects them and
     can ask for rolls or apply damage, which the player's own sheet performs.
     Deliberately a mirror, not a remote control: the player's copy stays the
     authority, so nothing desynchronises if someone closes the panel. */
  var PROTO = 'vt1';

  function initClientRole() {
    if (!TS.clients || !TS.clients.whoAmI) return Promise.resolve();
    return TS.clients.whoAmI().then(function (me) {
      S.myClientId = me && me.id;
      return TS.clients.getMoreInfo([me.id]);
    }).then(function (info) {
      var c = info && info[0];
      if (c) {
        S.isGM = c.clientMode === 'gm';
        S.myName = (c.player && c.player.name) || 'Player';
      }
      if (S.isGM) pollTable();
      else shareSoon();
    }).catch(function () {});
  }

  function sheetSummary(a) {
    if (!a) return null;
    return {
      id: a.id, name: a.name, className: a.className, raceName: a.raceName, level: a.level,
      ac: a.ac, hp: a.hp, hpMax: a.hpMax, tempHp: a.tempHp || 0,
      speed: VT.actor.speedOf(a), pp: VT.actor.passivePerception(a),
      abilities: a.abilities, saveProf: a.saveProf || [], skillProf: a.skillProf || [],
      conditions: a.conditions || [], spellDC: a.spellDC || null,
      coins: a.coins || null, coinText: VT.coin.format(a.coins || {}),
      actions: (a.actions || []).slice(0, 24).map(function (x) {
        return { name: x.name, kind: x.kind, toHit: x.toHit, dmg: x.dmg,
                 dc: x.dc, save: x.save,
                 left: x.uses ? VT.actor.usesLeft(a, x) : null,
                 max: x.uses ? x.uses.max : null };
      })
    };
  }

  /* Frame it. TaleSpire refuses any single payload over 500 characters, and a
     shop or a mirrored sheet is far bigger than that, so VT.sync cuts the
     message up and the other side puts it back together. */
  function syncSend(obj) {
    if (!TS.sync || !TS.sync.send) return;
    VT.sync.send(TS.sync, JSON.stringify(obj), 'board', function (e) {
      TS.debug.log('sync failed: ' + describeErr(e));
    });
  }

  /* TaleSpire hands back errors in more than one shape; print whichever of
     them actually says something rather than logging "undefined". */
  function describeErr(e) {
    if (!e) return 'unknown';
    return String(e.cause || e.message || e.error || e);
  }

  var shareSoon = U.debounce(function () {
    if (S.isGM || !S.shareSheet) return;
    var a = active();
    if (!a) return;
    syncSend({ p: PROTO, t: 'sheet', name: S.myName || 'Player', sheet: sheetSummary(a) });
  }, 900);

  function pollTable() { syncSend({ p: PROTO, t: 'poll' }); }

  window.onSyncMessage = function (evt) {
    if (!evt || !evt.payload) return;
    var from = evt.payload.fromClient && evt.payload.fromClient.id;
    /* Long messages arrive in frames; this returns null until the last one
       lands, then the whole payload at once. */
    var whole = VT.sync.receive(evt.payload.str, from);
    if (whole == null) return;
    var msg;
    try { msg = JSON.parse(whole); } catch (e) { return; }
    if (!msg || msg.p !== PROTO) return;

    TS.clients.isMe(from).then(function (isMe) {
      if (isMe) return;                       // broadcasts come back to us too

      if (msg.t === 'sheet' && S.isGM) {
        S.table[from] = { sheet: msg.sheet, name: msg.name, at: Date.now() };
        if (S.tab === 'party') render();
        return;
      }
      if (msg.t === 'poll' && !S.isGM) { shareSoon(); return; }
      if (msg.t === 'cmd' && msg.to === S.myClientId && !S.isGM) { applyCommand(msg); return; }
      if (msg.t === 'gone' && S.isGM) { delete S.table[from]; if (S.tab === 'party') render(); }
    }).catch(function () {});
  };

  window.onClientEvent = function (evt) {
    if (!evt) return;
    var k = evt.kind;
    if (k === 'clientModeChanged' || k === 'clientJoinedBoard') {
      initClientRole().then(function () { render(); });
      if (S.isGM) pollTable();
    } else if (k === 'clientLeftBoard') {
      var id = evt.payload && evt.payload.client && evt.payload.client.id;
      if (id && S.table[id]) { delete S.table[id]; if (S.tab === 'party') render(); }
    }
  };

  /* A GM request arrives here and is carried out by the player's own sheet. */
  function applyCommand(msg) {
    var a = active();
    if (!a) return;
    if (msg.cmd === 'roll') {
      var wasAdv = S.adv;
      if (msg.adv) S.adv = msg.adv;
      rollD20(msg.label || 'Check', msg.mod || 0);
      S.adv = wasAdv;
      syncChrome();
      toast('GM asked for: ' + (msg.label || 'a roll'), 'ok');
    } else if (msg.cmd === 'damage') {
      var r = VT.actor.applyDamage(a, msg.amount || 0, null);
      toast('GM: ' + r.taken + ' damage' + (r.downed ? ' — you are down!' : ''), 'err');
      save(); render();
    } else if (msg.cmd === 'heal') {
      var g = VT.actor.healBy(a, msg.amount || 0);
      toast('GM: healed ' + g, 'ok');
      save(); render();
    } else if (msg.cmd === 'cond') {
      if (VT.actor.hasCond(a, msg.condition)) VT.actor.removeCond(a, msg.condition);
      else VT.actor.addCond(a, msg.condition);
      toast('GM toggled ' + msg.condition, 'ok');
      save(); render();
    }
    shareSoon();
    notifyIfHidden('From the GM', msg.label || msg.cmd);
  }

  /* Put loot into the active character. Nothing here is destructive:
     items stack into the inventory and coin is added to the purse. */
  function acceptGrant(msg) {
    var a = active();
    if (!a) { toast('Something was sent to you, but no character is open', 'err'); return; }
    var got = [];

    (msg.items || []).forEach(function (it) {
      var qty = Math.max(1, it.qty | 0);
      a.inventory = a.inventory || [];
      var have = a.inventory.find(function (x) {
        return String(x.name).toLowerCase() === String(it.name).toLowerCase();
      });
      if (have) have.qty = (have.qty || 1) + qty;
      else if (it.item && VT.gear) {
        /* Comes with its own record, so put it in through the gear path and it
           arrives wearable, attunable and with its effects already read. */
        VT.gear.add(a, it.item, { qty: qty, note: it.note || '' });
      } else a.inventory.push({ name: it.name, qty: qty, note: it.note || '' });
      got.push(qty + ' x ' + it.name);
    });

    if (msg.coins && Object.keys(msg.coins).length) {
      a.coins = a.coins || VT.coin.emptyPurse();
      var base = 0;
      Object.keys(msg.coins).forEach(function (k) {
        var d = VT.coin.denoms().find(function (x) { return x.key === k; });
        if (d) base += (msg.coins[k] || 0) * d.inBase;
      });
      if (base) {
        a.coins = VT.coin.add(a.coins, base);
        got.push(VT.coin.format(VT.coin.fromBase(base)));
      }
    }

    if (!got.length) return;
    save(); render();
    var line = 'Received from ' + (msg.from || 'the GM') + ': ' + got.join(', ');
    toast(line, 'ok');
    notifyIfHidden('Tale Sheet', line);
  }

  function notifyIfHidden(title, body) {
    if (!TS.symbiote || !TS.symbiote.getIfThisSymbioteIsVisible) return;
    TS.symbiote.getIfThisSymbioteIsVisible().then(function (vis) {
      if (!vis) TS.symbiote.sendNotification(title, String(body || ''));
    }).catch(function () {});
  }

  function gmCommand(clientId, cmd) {
    syncSend(Object.assign({ p: PROTO, t: 'cmd', to: clientId }, cmd));
  }

  /* ---- GM view (rendered inside the Party tab) ---- */
  function renderTable() {
    var ids = Object.keys(S.table);
    var box = el('div', { class: 'card' }, [
      el('h3', {}, ['The table — ' + ids.length + ' sheet' + (ids.length === 1 ? '' : 's')])
    ]);
    box.appendChild(el('div', { class: 'btnrow', style: { marginBottom: '8px' } }, [
      el('button', { class: 'btn sm', onClick: function () {
        pollTable(); toast('Asked everyone to send their sheet');
      } }, ['Refresh']),
      el('button', { class: 'btn sm', onClick: function () {
        ids.forEach(function (id) { gmCommand(id, { cmd: 'roll', label: 'Initiative', mod: 0 }); });
        toast('Asked the table for initiative');
      } }, ['Ask all: initiative'])
    ]));

    if (!ids.length) {
      box.appendChild(el('div', { class: 'muted' }, [
        'Nothing yet. Players need this symbiote open with a character selected — ' +
        'their sheets appear here automatically.'
      ]));
      return box;
    }

    ids.forEach(function (id) {
      var e = S.table[id], sh = e.sheet;
      if (!sh) return;
      var frac = U.clamp(sh.hp / Math.max(1, sh.hpMax), 0, 1);
      var open = S.tableOpen === id;

      var card = el('div', { style: { border: '1px solid var(--line)', borderRadius: '5px',
        marginBottom: '8px', background: '#16151f', padding: '8px' } });
      card.appendChild(el('div', { class: 'rollrow', onClick: function () {
        S.tableOpen = open ? null : id; render();
      } }, [
        el('span', { class: 'lbl' }, [sh.name,
          el('span', { class: 'sub' }, ['  ' + (e.name || 'player') + ' · ' +
            (sh.className || '') + ' ' + sh.level])]),
        el('span', { class: 'mod' }, ['AC ' + sh.ac])
      ]));
      card.appendChild(el('div', { class: 'hpbar' }, [
        el('i', { style: { width: (frac * 100) + '%',
          background: frac > .5 ? 'linear-gradient(180deg,#8ec97f,#5d8f52)'
                    : frac > .25 ? 'linear-gradient(180deg,#e0c46a,#a8873c)'
                    : 'linear-gradient(180deg,#d97b74,#8f4640)' } }),
        el('span', {}, [sh.hp + ' / ' + sh.hpMax + (sh.tempHp ? ' (+' + sh.tempHp + ')' : '')])
      ]));
      if (sh.conditions && sh.conditions.length) {
        card.appendChild(el('div', {}, sh.conditions.map(function (c) {
          return el('span', { class: 'chip on' }, [(SRD.CONDITIONS[c] || { name: c }).name]);
        })));
      }

      var gmAmt = el('input', { type: 'number', value: 5, min: 0, style: { width: '52px' } });
      card.appendChild(el('div', { class: 'hpctl', style: { marginTop: '6px' } }, [
        el('button', { class: 'btn sm danger', onClick: function () {
          gmCommand(id, { cmd: 'damage', amount: parseInt(gmAmt.value, 10) || 0 });
          toast('Sent damage to ' + sh.name);
        } }, ['− Dmg']),
        gmAmt,
        el('button', { class: 'btn sm', onClick: function () {
          gmCommand(id, { cmd: 'heal', amount: parseInt(gmAmt.value, 10) || 0 });
          toast('Sent healing to ' + sh.name);
        } }, ['+ Heal'])
      ]));

      if (open) {
        /* ask for any check or save */
        var askAbil = el('div', { class: 'btnrow', style: { marginTop: '6px' } });
        SRD.ABILITIES.forEach(function (k) {
          askAbil.appendChild(el('button', { class: 'btn sm',
            title: 'Ask for a ' + SRD.ABILITY_NAME[k] + ' saving throw',
            onClick: function () {
              var mod = SRD.mod(sh.abilities[k]) +
                ((sh.saveProf || []).indexOf(k) >= 0 ? SRD.profBonus(sh.level) : 0);
              gmCommand(id, { cmd: 'roll', label: SRD.ABILITY_NAME[k] + ' save', mod: mod, adv: S.adv });
              toast('Asked ' + sh.name + ' for a ' + SRD.ABILITY_NAME[k] + ' save');
            } }, [SRD.ABILITY_NAME[k]]));
        });
        card.appendChild(el('div', { class: 'muted', style: { marginTop: '8px' } }, ['Ask for a save']));
        card.appendChild(askAbil);

        var condSel = selectOf(Object.keys(SRD.CONDITIONS).map(function (k) {
          return { value: k, label: SRD.CONDITIONS[k].name }; }), 'prone', function () {});
        card.appendChild(el('div', { class: 'row', style: { marginTop: '8px' } }, [
          condSel,
          el('button', { class: 'btn sm', onClick: function () {
            gmCommand(id, { cmd: 'cond', condition: condSel.value });
            toast('Toggled ' + condSel.value + ' on ' + sh.name);
          } }, ['Toggle'])
        ]));

        card.appendChild(el('div', { class: 'abil-grid', style: { marginTop: '8px' } },
          SRD.ABILITIES.map(function (k) {
            return el('div', { class: 'abil-cell' }, [
              el('span', { class: 'k' }, [SRD.ABILITY_NAME[k]]),
              el('span', { class: 'v' }, [String(sh.abilities[k])]),
              el('span', { class: 'mod' }, [sign(SRD.mod(sh.abilities[k]))])
            ]);
          })));
        if (sh.coinText) {
          card.appendChild(el('div', { class: 'muted', style: { marginTop: '6px' } }, ['Purse: ' + sh.coinText]));
        }
        card.appendChild(el('div', { class: 'muted', style: { marginTop: '6px' } }, [
          'Speed ' + sh.speed + ' · passive perception ' + sh.pp +
          (sh.spellDC ? ' · spell DC ' + sh.spellDC : '')
        ]));
        (sh.actions || []).forEach(function (x) {
          card.appendChild(el('div', { class: 'rollrow' }, [
            el('span', { class: 'lbl' }, [x.name,
              el('span', { class: 'sub' }, ['  ' + (x.toHit != null ? sign(x.toHit) + ' ' : '') +
                (x.dmg && x.dmg !== '0' ? x.dmg : '') + (x.dc ? ' DC' + x.dc : '')])]),
            x.left != null ? el('span', { class: 'mod' }, [x.left + '/' + x.max]) : null
          ]));
        });
      }
      box.appendChild(card);
    });
    return box;
  }

  function showBox(host, cls, msg) {
    U.clear(host);
    host.appendChild(el('div', { class: cls }, [msg]));
  }

  /* A small door for a host page.

     Inside TaleSpire nothing else shares this storage, so the sheet reads it
     once at boot and owns it thereafter. Embedded in the Forge that is not
     true: the roster is edited on other tabs, and a character built there
     after boot would otherwise be invisible here. Re-reading on demand is the
     whole of what a host needs. */
  VT.sheetApp = {
    reload: function () {
      return loadState().then(function () { render(); });
    },
    select: function (id) {
      if (id) S.activeId = id;
      render();
    },
    active: function () { return active(); }
  };
})();
