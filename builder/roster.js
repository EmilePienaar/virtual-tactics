/* The Forge :: Roster — level, edit and adjust anything in the campaign.

   The Character tab builds someone once; this tab is where they live
   afterwards. It is the desk-sized counterpart to Tale Sheet's Sheet and Edit
   tabs, and deliberately shares their rules rather than their markup: every
   number here comes from VT.charbuild, VT.features, VT.actor and VT.coin, the
   same four modules the symbiote calls. The layout differs because a browser
   window is not a 320px in-game panel; the arithmetic does not.

   Everything in the roster is editable, characters and creatures alike. A
   character with build data re-derives properly on a level change; an imported
   statblock falls back to the same arithmetic the symbiote uses. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, el = U.el, SRD = VT.srd, FT = VT.fivetools;
  var SKILLS = SRD.SKILL_ABILITY;

  /* Tab-local state. The roster itself lives in VT.store.campaign. */
  var R = { id: null, hpAmount: 5, msg: null, filter: '', openFeat: {},
            castAt: {}, castPact: {} };
  var work, side, P;

  function sign(n) { return (n >= 0 ? '+' : '') + n; }

  /* ==== entry point ====================================================== */
  function render(w, s, parts) {
    work = w; side = s; P = parts;

    /* init() re-reads and re-parses localStorage, so calling it on every redraw
       would throw away the object every open control is holding a reference to -
       and a campaign with no maps comes back null, which would look exactly like
       an empty roster. Load once, then work with what is in memory. */
    if (!VT.store.campaign) {
      VT.store.init();
      if (!VT.store.campaign) VT.store.campaign = VT.store.blank('Sword Coast Skirmish');
    }
    VT.store.campaign.roster = VT.store.campaign.roster || [];

    renderList();

    work.appendChild(el('h2', { class: 'step' }, ['Roster']));
    work.appendChild(el('p', { class: 'step-sub' }, [
      'Everyone the campaign knows about. Level them, spend their resources, ' +
      'change any number on the sheet — the same rules the Tale Sheet symbiote uses.'
    ]));
    if (R.msg) {
      work.appendChild(el('div', { class: R.msg.cls + '-box', html: R.msg.text }));
      R.msg = null;
    }

    var a = active();
    if (!a) {
      work.appendChild(el('div', { class: 'panel' }, [
        el('h3', {}, [roster().length ? 'Pick someone' : 'Nobody here yet']),
        el('p', { class: 'tiny' }, [roster().length
          ? 'Choose an entry on the right to open their sheet.'
          : 'Build a character in the Character tab, forge a creature in the Creature tab, ' +
            'or import a JSON sheet from the panel on the right. Anything sent to the game ' +
            'roster appears here.'])
      ]));
      return;
    }
    renderEditor(a);
  }

  /* ==== roster plumbing ================================================== */
  function roster() { return VT.store.campaign.roster; }
  function active() {
    return roster().find(function (a) { return a.id === R.id; }) || null;
  }
  function redraw() { P.render(); }
  function flash(text, cls) { R.msg = { text: text, cls: cls || 'ok' }; }

  function save() {
    var r = VT.store.save();
    if (!r.ok) flash('Could not save: ' + U.esc(r.error), 'err');
    return r.ok;
  }
  function saveDraw() { save(); redraw(); }

  /* An actor arriving from the Character tab, an import or an old campaign may
     predate any given field. Fill in what play needs before touching it. */
  function ensureFields(a) {
    a.inventory = a.inventory || [];
    a.actions = a.actions || [];
    a.conditions = a.conditions || [];
    a.skillProf = a.skillProf || [];
    a.expertise = a.expertise || [];
    /* Entries saved before proficiencies existed carry no lists. Derive them
       from the build where the compendium can still resolve it, and otherwise
       leave them absent - absent costs nothing, a guess costs attack bonuses. */
    if (VT.proficiency) VT.proficiency.backfill(a);
    a.coins = a.coins || VT.coin.emptyPurse();
    a.slotsUsed = a.slotsUsed || {};
    a.used = a.used || {};
    a.abilities = a.abilities || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    if (a.hitDiceMax == null) a.hitDiceMax = a.level || 1;
    if (a.hitDiceUsed == null) a.hitDiceUsed = 0;
    return a;
  }

  /* ==== the list ========================================================= */
  function renderList() {
    var head = el('div', { class: 'sec-b' });
    head.appendChild(el('div', { class: 'rl-head' }, [
      el('span', {}, ['Campaign roster']),
      el('span', { class: 'tiny' }, [roster().length + ' entr' + (roster().length === 1 ? 'y' : 'ies')])
    ]));
    head.appendChild(el('div', { class: 'searchbar', style: { marginBottom: '8px' } }, [
      el('input', { type: 'text', placeholder: 'Filter by name', value: R.filter,
        onInput: function (e) { R.filter = e.target.value; redraw(); } })
    ]));

    side.appendChild(head);

    var q = R.filter.trim().toLowerCase();
    var shown = roster().filter(function (a) {
      return !q || String(a.name || '').toLowerCase().indexOf(q) >= 0;
    });

    shown.forEach(function (a) {
      ensureFields(a);
      var frac = U.clamp(a.hp / Math.max(1, a.hpMax), 0, 1);
      var card = el('div', { class: 'rl-item' + (a.id === R.id ? ' sel' : ''), onClick: function () {
        R.id = a.id; R.openFeat = {}; VT.choiceUI.reset(); redraw();
      } });
      try { card.appendChild(VT.actor.portrait(a, 34, 42)); } catch (e) {}
      card.appendChild(el('div', { class: 'rl-body' }, [
        el('div', { class: 'rl-nm' }, [a.name || 'Unnamed']),
        el('div', { class: 'tiny' }, [
          [a.raceName, a.className, a.level ? 'level ' + a.level : null, a.cr ? 'CR ' + a.cr : null]
            .filter(Boolean).join(' · ') || 'statblock'
        ]),
        el('div', { class: 'rl-hp' }, [
          el('i', { style: { width: (frac * 100) + '%',
            background: frac > .5 ? '#5d8f52' : frac > .25 ? '#a8873c' : '#8f4640' } })
        ])
      ]));
      card.appendChild(el('span', { class: 'rl-team ' + (a.team || 'party') }));
      side.appendChild(card);
    });

    if (!shown.length) {
      side.appendChild(el('div', { class: 'sec-b tiny' }, [
        roster().length ? 'Nothing matches that filter.' : 'The roster is empty.'
      ]));
    }

    var tools = el('div', { class: 'sec-b', style: { borderTop: '1px solid var(--line)' } });
    tools.appendChild(el('div', { class: 'btnrow' }, [
      P.btn('Import JSON…', importSheets, 'sm'),
      P.btn('New blank', function () {
        var a = ensureFields(VT.actor.base('New Character'));
        a.id = U.uid('tpl');
        a.team = 'party';
        a.spec = VT.spriteart.autoSpec(a.name);
        roster().push(a);
        R.id = a.id;
        flash('Blank sheet added. Every field below is yours to fill in.');
        saveDraw();
      }, 'sm')
    ]));
    tools.appendChild(el('p', { class: 'tiny', style: { marginTop: '8px' } }, [
      'The roster is shared with the game through this browser. Reload a game tab to pick up changes.'
    ]));
    side.appendChild(tools);
  }

  function importSheets() {
    var picker = U.$('#jsonPicker');
    picker.onchange = function () {
      var files = Array.prototype.slice.call(picker.files || []);
      picker.value = '';
      if (!files.length) return;
      var added = 0, failed = [];
      var jobs = files.map(function (f) {
        return f.text().then(function (txt) {
          var data = JSON.parse(txt);
          (Array.isArray(data) ? data : [data]).forEach(function (a) {
            if (!a || !a.name) throw new Error('not a sheet');
            delete a.__src;
            a.id = U.uid('tpl');
            roster().push(ensureFields(a));
            added++;
          });
        }).catch(function () { failed.push(f.name); });
      });
      Promise.all(jobs).then(function () {
        flash(added + ' imported' + (failed.length ? '. Could not read: ' + U.esc(failed.join(', ')) : '.'),
              failed.length ? 'warn' : 'ok');
        saveDraw();
      });
    };
    picker.click();
  }

  /* ==== the editor ======================================================= */
  function renderEditor(a) {
    ensureFields(a);
    var prof = VT.actor.prof(a);

    header(a, prof);
    classPanel(a);
    choicePanel(a);
    levelPanel(a, prof);
    corePanel(a);
    abilityPanel(a, prof);
    asiPanel(a);
    expertisePanel(a);
    skillPanel(a);
    proficiencyPanel(a);
    toolPanel(a);
    deathPanel(a);
    resourcePanel(a);
    slotPanel(a);
    coinPanel(a);
    inventoryPanel(a);
    actionPanel(a);
    featurePanel(a);
    conditionPanel(a);
    gearPanel(a);
    attunePanel(a);
    notesPanel(a);
    managePanel(a);
  }

  /* --- header: who they are and how they are doing --- */
  function header(a, prof) {
    var p = el('div', { class: 'panel' });
    var head = el('div', { class: 'sheet-head' });
    try { head.appendChild(VT.actor.portrait(a, 46, 58)); } catch (e) {}
    head.appendChild(el('div', {}, [
      el('div', { class: 'sheet-name' }, [a.name || 'Unnamed']),
      el('div', { class: 'sheet-sub' }, [
        [a.raceName, a.className + (a.subclassName ? ' (' + a.subclassName + ')' : ''),
         a.level ? 'level ' + a.level : null].filter(Boolean).join(' · ') || 'imported statblock'
      ])
    ]));
    p.appendChild(head);

    var acWhy = VT.actor.acSources(a);
    p.appendChild(el('div', { class: 'rstats' }, [
      bigstat('AC', VT.actor.effectiveAC(a), acWhy.join(', ')),
      bigstat('HP', a.hp + '/' + a.hpMax, a.tempHp ? '+' + a.tempHp + ' temp' : ''),
      bigstat('SPEED', VT.actor.speedOf(a) + ' ft', ''),
      bigstat('PROF', sign(prof), ''),
      bigstat('INIT', sign(VT.actor.abilityMod(a, 'dex')), ''),
      bigstat('PASSIVE', VT.actor.passivePerception(a), 'perception')
    ]));

    /* hit points */
    var frac = U.clamp(a.hp / Math.max(1, a.hpMax), 0, 1);
    p.appendChild(el('div', { class: 'hpbar-lg', style: { margin: '4px 0 8px' } }, [
      el('i', { style: { width: (frac * 100) + '%',
        background: frac > .5 ? 'linear-gradient(180deg,#8ec97f,#5d8f52)'
                  : frac > .25 ? 'linear-gradient(180deg,#e0c46a,#a8873c)'
                  : 'linear-gradient(180deg,#d97b74,#8f4640)' } }),
      el('span', {}, [a.hp + ' / ' + a.hpMax + (a.tempHp ? '  (+' + a.tempHp + ' temp)' : '')])
    ]));

    var amt = el('input', { type: 'number', value: R.hpAmount, min: 0,
      style: { width: '80px' },
      onInput: function (e) { R.hpAmount = Math.max(0, parseInt(e.target.value, 10) || 0); } });
    p.appendChild(el('div', { class: 'btnrow' }, [
      P.btn('− Damage', function () {
        var r = VT.actor.applyDamage(a, R.hpAmount, null);
        flash(U.esc(a.name) + ' takes ' + r.taken + (r.downed ? ' and drops.' : '.'), r.downed ? 'err' : 'ok');
        saveDraw();
      }, 'sm danger'),
      amt,
      P.btn('+ Heal', function () {
        var g = VT.actor.healBy(a, R.hpAmount);
        flash(U.esc(a.name) + ' recovers ' + g + '.');
        saveDraw();
      }, 'sm'),
      P.btn('Temp HP', function () {
        a.tempHp = Math.max(a.tempHp || 0, R.hpAmount);
        saveDraw();
      }, 'sm'),
      P.btn('Full heal', function () {
        a.hp = a.hpMax; saveDraw();
      }, 'sm')
    ]));

    /* rests — hit dice and the resources that come back with them */
    var diceLeft = (a.hitDiceMax || a.level || 0) - (a.hitDiceUsed || 0);
    p.appendChild(el('div', { class: 'btnrow', style: { marginTop: '10px' } }, [
      P.btn('Spend a hit die (d' + (a.hitDie || 8) + ')', function () {
        if (diceLeft <= 0) { flash('No hit dice left — only a long rest brings them back.', 'warn'); redraw(); return; }
        var con = VT.actor.abilityMod(a, 'con');
        var roll = VT.dice.roll('1d' + (a.hitDie || 8));
        var gain = Math.max(1, roll.total + con);
        a.hitDiceUsed = (a.hitDiceUsed || 0) + 1;
        VT.actor.healBy(a, gain);
        flash('Hit die: rolled ' + roll.total + ' + ' + sign(con) + ' CON = <b>' + gain +
              '</b> healed. ' + (diceLeft - 1) + ' dice left.');
        saveDraw();
      }, 'sm'),
      P.btn('Short rest', function () {
        VT.features.rest(a, 'short');
        flash('Short rest — short-rest resources' +
              (a.spellSlots && a.spellSlots.pact ? ' and pact slots' : '') +
              ' restored. Hit dice are yours to spend above.');
        saveDraw();
      }, 'sm'),
      P.btn('Long rest', function () {
        VT.features.rest(a, 'long');
        a.hp = a.hpMax;
        a.tempHp = 0;
        /* A long rest returns half your total hit dice, rounded down, minimum one. */
        var back = Math.max(1, Math.floor((a.hitDiceMax || a.level || 1) / 2));
        a.hitDiceUsed = Math.max(0, (a.hitDiceUsed || 0) - back);
        a.conditions = (a.conditions || []).filter(function (c) { return c === 'exhausted'; });
        (a.actions || []).forEach(function (act) { if (act.uses) delete a.used[act.name]; });
        flash('Long rest — full hit points, every resource and slot back, ' + back + ' hit dice recovered.');
        saveDraw();
      }, 'sm primary')
    ]));
    p.appendChild(el('p', { class: 'tiny', style: { marginTop: '6px' } }, [
      'Hit dice ' + diceLeft + '/' + (a.hitDiceMax || a.level || 0) + ' available.'
    ]));
    work.appendChild(p);
  }

  function bigstat(k, v, sub) {
    return el('div', {}, [
      el('div', { class: 'k' }, [k]),
      el('div', { class: 'v' }, [String(v)]),
      sub ? el('div', { class: 'tiny' }, [sub]) : null
    ]);
  }

  /* --- classes, and multiclassing --- */
  function classPanel(a) {
    if (!a.build) return;
    var p = el('div', { class: 'panel' }, [el('h3', {}, ['Classes'])]);
    VT.choiceUI.renderClasses(p, {
      actor: a,
      onChange: redraw,
      onLevel: function (i, lv) {
        var res = VT.charbuild.relevelClass(a, i, lv);
        if (!res.ok) { flash(U.esc(res.reason), 'err'); redraw(); return; }
        replace(a, res.actor);
        flash('Now ' + U.esc(res.actor.className) + ' — level ' + res.actor.level +
              ', ' + res.actor.hpMax + ' max HP.' + missingNote(res));
        saveDraw();
      },
      onAdd: function (rec) {
        var res = VT.charbuild.addClassLevel(a, rec, null);
        if (!res.ok) { flash(U.esc(res.reason), 'err'); redraw(); return; }
        replace(a, res.actor);
        flash('Took a level in ' + U.esc(rec.name) + ' — now ' + U.esc(res.actor.className) +
              '. Choose its subclass and options below when they come due.');
        saveDraw();
      }
    });
    work.appendChild(p);
  }

  /* --- the choice tree --- */
  function choicePanel(a) {
    if (!a.build) return;
    var sum = (VT.choices && FT.loaded) ? VT.choices.summary(a.build) : null;
    var p = el('div', { class: 'panel' }, [
      el('h3', {}, ['Choices' + (sum && sum.unspent ? ' — ' + sum.unspent + ' outstanding' : '')])
    ]);
    VT.choiceUI.render(p, {
      actor: a, build: a.build,
      onChange: function () {
        /* A pick changes real numbers - a fighting style is +1 AC, a feat is
           +1 to a score - so re-derive rather than just redraw. */
        var res = VT.charbuild.relevel(a, a.level);
        if (res.ok) replace(a, res.actor);
        saveDraw();
      }
    });
    work.appendChild(p);
  }

  /* --- level --- */
  function levelPanel(a, prof) {
    var p = el('div', { class: 'panel' }, [el('h3', {}, ['Identity & level'])]);
    p.appendChild(el('div', { class: 'grid3' }, [
      P.row('Name', el('input', { type: 'text', value: a.name,
        onInput: function (e) { a.name = e.target.value; save(); } })),
      P.row('Side', P.selectEl([
        { value: 'party', label: 'Party' }, { value: 'foe', label: 'Enemy' },
        { value: 'neutral', label: 'Neutral' }
      ], a.team || 'party', function (v) { a.team = v; saveDraw(); })),
      P.row('Size', P.selectEl(SRD.SIZES.map(function (s) { return { value: s, label: U.cap(s) }; }),
        a.size || 'medium', function (v) { a.size = v; save(); }))
    ]));

    p.appendChild(el('div', { class: 'lvlrow' }, [
      el('span', { class: 'lvl-lbl' }, ['Level']),
      P.btn('−', function () { changeLevel(a, (a.level || 1) - 1); }, 'sm'),
      el('span', { class: 'lvl-v' }, [String(a.level || 1)]),
      P.btn('+', function () { changeLevel(a, (a.level || 1) + 1); }, 'sm'),
      el('span', { class: 'tiny' }, ['proficiency ' + sign(prof)]),
      el('span', { class: 'spacer' }),
      a.build && a.build.cls ? P.btn('Re-derive from build', function () {
        rederive(a, 'Re-derived from ' + a.build.cls.name + '.');
      }, 'sm') : null
    ]));

    if (a.build && a.build.cls) {
      p.appendChild(el('p', { class: 'tiny' }, [
        FT.loaded
          ? 'Levelling re-derives from ' + a.build.cls.name +
            ': hit points, proficiency, attack bonuses, features, resources and spell slots all update. ' +
            'Gold, inventory, conditions and anything you added by hand are carried across.'
          : 'No data source connected — levelling will adjust hit points and proficiency arithmetically. ' +
            'Connect your 5etools folder for a full re-derive.'
      ]));
    } else {
      p.appendChild(el('p', { class: 'tiny' }, [
        'No build data on this entry, so levelling adjusts hit points, proficiency and ' +
        'derived attack bonuses only. Everything else is yours to edit directly below.'
      ]));
    }
    work.appendChild(p);
  }

  /* --- core numbers --- */
  function corePanel(a) {
    var p = el('div', { class: 'panel' }, [
      el('h3', {}, ['Core numbers']),
      el('p', { class: 'tiny', style: { marginTop: '-6px', marginBottom: '10px' } }, [
        'Set any of these directly. If your table works something out differently, overrule it — ' +
        'nothing here recalculates behind your back.'
      ])
    ]);
    p.appendChild(el('div', { class: 'grid3' }, [
      P.row('Base AC', P.numEl(a.ac, 1, 40, function (v) { a.ac = v; saveDraw(); })),
      P.row('AC bonus', P.numEl(a.acBonus || 0, -10, 20, function (v) { a.acBonus = v; saveDraw(); })),
      P.row('Speed', P.numEl(a.speed, 0, 200, function (v) { a.speed = v; saveDraw(); }, 5))
    ]));
    var why = VT.actor.acSources(a);
    p.appendChild(el('p', { class: 'tiny' }, [
      'Effective AC ' + VT.actor.effectiveAC(a) + (why.length ? ' — ' + why.join(', ') : '') +
      '. Conditions such as Hasted or Shielded add their own bonus on top.'
    ]));
    p.appendChild(el('div', { class: 'grid3' }, [
      P.row('Current HP', P.numEl(a.hp, 0, 9999, function (v) {
        a.hp = U.clamp(v, 0, a.hpMax); saveDraw();
      })),
      P.row('Max HP', P.numEl(a.hpMax, 1, 9999, function (v) {
        a.hpMax = v; a.hp = Math.min(a.hp, v); saveDraw();
      })),
      P.row('Temp HP', P.numEl(a.tempHp || 0, 0, 999, function (v) { a.tempHp = Math.max(0, v); saveDraw(); }))
    ]));
    p.appendChild(el('div', { class: 'grid3' }, [
      P.row('Hit die', P.numEl(a.hitDie || 8, 4, 12, function (v) { a.hitDie = v; saveDraw(); }, 2)),
      P.row('Hit dice max', P.numEl(a.hitDiceMax || a.level || 1, 0, 20, function (v) { a.hitDiceMax = v; saveDraw(); })),
      P.row('Hit dice used', P.numEl(a.hitDiceUsed || 0, 0, 20, function (v) {
        a.hitDiceUsed = U.clamp(v, 0, a.hitDiceMax || 20); saveDraw();
      }))
    ]));
    p.appendChild(el('div', { class: 'grid3' }, [
      P.row('Spell DC', P.numEl(a.spellDC == null ? 0 : a.spellDC, 0, 30, function (v) {
        a.spellDC = v || null; saveDraw();
      })),
      P.row('Spell atk', P.numEl(a.spellAttack == null ? 0 : a.spellAttack, -5, 20, function (v) {
        a.spellAttack = v; saveDraw();
      })),
      P.row('Attune slots', P.numEl(VT.actor.attuneMax(a), 0, 10, function (v) {
        a.attuneMax = v; saveDraw();
      }))
    ]));
    p.appendChild(el('div', { class: 'grid3' }, [
      P.row('Resist', el('input', { type: 'text', value: (a.resist || []).join(', '),
        onInput: function (e) { a.resist = P.splitList(e.target.value); save(); } })),
      P.row('Vulnerable', el('input', { type: 'text', value: (a.vulnerable || []).join(', '),
        onInput: function (e) { a.vulnerable = P.splitList(e.target.value); save(); } })),
      P.row('Immune', el('input', { type: 'text', value: (a.immune || []).join(', '),
        onInput: function (e) { a.immune = P.splitList(e.target.value); save(); } }))
    ]));
    p.appendChild(el('div', { class: 'tiny' }, ['Comma separated: ' + SRD.DAMAGE_TYPES.join(', ')]));
    work.appendChild(p);
  }

  /* --- abilities and saving throws, side by side --- */
  function abilityPanel(a, prof) {
    var p = el('div', { class: 'panel' }, [el('h3', {}, ['Ability scores & saving throws'])]);
    var grid = el('div', { class: 'abilgrid' });
    SRD.ABILITIES.forEach(function (k) {
      /* The feature engine owns the save total, so a paladin's aura shows up
         here without this panel knowing anything about paladins. */
      var plain = VT.actor.saveMod(a, k);
      var total = VT.features.saveMod(a, k);
      var isProf = (a.saveProf || []).indexOf(k) >= 0;
      grid.appendChild(el('div', { class: 'abilcell' }, [
        el('div', { class: 'k' }, [SRD.ABILITY_NAME[k]]),
        el('div', { class: 'stepper' }, [
          el('button', { onClick: function () {
            a.abilities[k] = Math.max(1, a.abilities[k] - 1); saveDraw();
          } }, ['−']),
          el('span', { class: 'v' }, [String(a.abilities[k])]),
          el('button', { onClick: function () {
            a.abilities[k] = Math.min(30, a.abilities[k] + 1); saveDraw();
          } }, ['+'])
        ]),
        el('div', { class: 'm' }, [sign(VT.actor.abilityMod(a, k))]),
        el('button', { class: 'savebtn' + (isProf ? ' on' : ''), title: 'Toggle save proficiency',
          onClick: function () {
            a.saveProf = a.saveProf || [];
            if (isProf) a.saveProf = a.saveProf.filter(function (x) { return x !== k; });
            else a.saveProf.push(k);
            saveDraw();
          } }, ['save ' + sign(total)]),
        total !== plain ? el('div', { class: 'tiny' }, ['incl ' + sign(total - plain) + ' aura']) : null
      ]));
    });
    p.appendChild(grid);
    p.appendChild(el('p', { class: 'tiny' }, [
      'Changing Constitution does not re-roll hit points — adjust Max HP above, or re-derive ' +
      'from the build to recalculate it properly.'
    ]));
    work.appendChild(p);
  }

  /* --- ability score improvements --- */
  function asiPanel(a) {
    var asi = a.asiStatus;
    if (!asi || !asi.earned) return;
    var p = el('div', { class: 'panel' }, [el('h3', {}, ['Ability Score Improvements'])]);
    p.appendChild(el('div', { class: asi.left ? 'warn-box' : 'ok-box' }, [
      asi.spent + ' of ' + asi.earned + ' assigned' + (asi.left ? ' — ' + asi.left + ' still to spend.' : '.')
    ]));
    (a.build && a.build.asi || []).forEach(function (entry, i) {
      p.appendChild(el('div', { class: 'linerow' }, [
        el('span', { class: 'grow' }, [
          Object.keys(entry.picks || {}).map(function (k) {
            return SRD.ABILITY_NAME[k] + ' ' + sign(entry.picks[k]);
          }).join(', ') || 'empty'
        ]),
        P.btn('×', function () {
          a.build.asi.splice(i, 1);
          rederive(a, 'Improvement removed.');
        }, 'sm danger')
      ]));
    });
    if (asi.left > 0) {
      var mode = 'two', pickA = 'str', pickB = 'dex';
      var opts = SRD.ABILITIES.map(function (k) { return { value: k, label: SRD.ABILITY_NAME[k] }; });
      var selB = P.selectEl(opts, pickB, function (v) { pickB = v; });
      var wrapB = el('div', { class: 'grow' }, [selB]);
      p.appendChild(el('div', { class: 'linerow', style: { marginTop: '8px' } }, [
        P.selectEl([{ value: 'two', label: '+1 to two abilities' },
                    { value: 'one', label: '+2 to one ability' }], mode, function (v) {
          mode = v;
          wrapB.classList.toggle('hidden', v !== 'two');
        }),
        P.selectEl(opts, pickA, function (v) { pickA = v; }),
        wrapB,
        P.btn('Assign', function () {
          var picks = {};
          if (mode === 'one') picks[pickA] = 2;
          else { picks[pickA] = (picks[pickA] || 0) + 1; picks[pickB] = (picks[pickB] || 0) + 1; }
          a.build = a.build || {};
          a.build.asi = (a.build.asi || []).concat([{ picks: picks }]);
          rederive(a, 'Ability scores improved.');
        }, 'sm primary')
      ]));
      p.appendChild(el('p', { class: 'tiny' }, [
        'Scores cap at 20. Taking a feat instead of the increase? Record it as a custom action ' +
        'or in Notes — feats are not modelled mechanically.'
      ]));
    }
    work.appendChild(p);
  }

  /* --- expertise --- */
  function expertisePanel(a) {
    if (!a.expertiseSlots) return;
    var p = el('div', { class: 'panel' }, [el('h3', {}, ['Expertise'])]);
    p.appendChild(el('div', { class: a.expertise.length < a.expertiseSlots ? 'warn-box' : 'ok-box' }, [
      a.expertise.length + ' of ' + a.expertiseSlots + ' chosen — these skills use double proficiency.'
    ]));
    var box = el('div', { class: 'chiprow' });
    Object.keys(SKILLS).sort().forEach(function (name) {
      var on = a.expertise.indexOf(name) >= 0;
      var canPick = on || a.expertise.length < a.expertiseSlots;
      box.appendChild(el('span', {
        class: 'chip' + (on ? ' good' : ''),
        style: { opacity: canPick ? 1 : .3, cursor: canPick ? 'pointer' : 'default' },
        onClick: function () {
          if (!canPick) return;
          if (on) a.expertise = a.expertise.filter(function (x) { return x !== name; });
          else a.expertise.push(name);
          if (a.build) a.build.expertise = a.expertise.slice();
          saveDraw();
        }
      }, [U.cap(name)]));
    });
    p.appendChild(box);
    p.appendChild(el('p', { class: 'tiny' }, [
      'Rogues and bards normally take expertise in skills they are already proficient in.'
    ]));
    work.appendChild(p);
  }

  /* --- skills --- */
  function skillPanel(a) {
    var p = el('div', { class: 'panel' }, [el('h3', {}, ['Skills'])]);
    var grid = el('div', { class: 'skillgrid' });
    Object.keys(SKILLS).sort().forEach(function (name) {
      /* One call, and expertise and Jack of All Trades are already in it. */
      var mod = VT.features.skillMod(a, name);
      var src = VT.features.skillSource(a, name);
      var isProf = a.skillProf.indexOf(name) >= 0;
      var isExp = a.expertise.indexOf(name) >= 0;
      grid.appendChild(el('div', { class: 'skillrow' + (src ? ' lit' : ''), onClick: function () {
        if (isProf) a.skillProf = a.skillProf.filter(function (s) { return s !== name; });
        else a.skillProf.push(name);
        saveDraw();
      }, title: 'Click to toggle proficiency' }, [
        el('span', { class: 'pip' + (isExp ? ' exp' : isProf ? ' on' : '') }),
        el('span', { class: 'grow' }, [U.cap(name),
          el('span', { class: 'tiny' }, ['  ' + SRD.ABILITY_NAME[SKILLS[name]] +
            (src && src !== 'proficient' ? ' · ' + src : '')])]),
        el('span', { class: 'skillmod' }, [sign(mod)])
      ]));
    });
    p.appendChild(grid);
    p.appendChild(el('p', { class: 'tiny' }, [
      'Filled pip: proficient. Gold pip: expertise. Passive Perception ' +
      VT.actor.passivePerception(a) + '.'
    ]));
    work.appendChild(p);
  }

  /* --- languages, armour and weapons ---
     The desk-sized twin of Tale Sheet's Proficiencies card. Armour and weapons
     are shown as every kind with the trained ones lit, because "no heavy" is
     the answer to "why is my wizard rolling badly", and a list of only what you
     have cannot say it.

     Each change goes back through gear.recompute(), which re-reads the armour
     penalty and puts each weapon's proficiency bonus back on or takes it off. */
  function proficiencyPanel(a) {
    var PR = VT.proficiency;
    if (!PR) return;
    /* Held locally and written onto the character only when something is
       actually changed - opening the panel must not turn "we were never told"
       into "trained in nothing". */
    var armourList = (a.armorProf || []).slice();
    var weaponList = (a.weaponProf || []).slice();
    var langList = (a.langProf || []).slice();

    var p = el('div', { class: 'panel' }, [el('h3', {}, ['Proficiencies'])]);
    if (a.armorUnskilled) p.appendChild(el('div', { class: 'warn-box' }, [a.armorUnskilled.note]));
    /* Creatures and hand-imported statblocks have no training recorded, which
       is not the same as being untrained - say which it is rather than letting
       four empty rows imply the wrong one. */
    if (!Array.isArray(a.armorProf) && !Array.isArray(a.weaponProf)) {
      p.appendChild(el('p', { class: 'tiny' }, [
        'Nothing recorded — this entry came in as a statblock rather than a build, ' +
        'so no penalty is applied. Anything you switch on below starts being enforced.'
      ]));
    }

    function commit() {
      a.armorProf = armourList; a.weaponProf = weaponList; a.langProf = langList;
      if (a.build) {
        a.build.armorProf = armourList.slice();
        a.build.weaponProf = weaponList.slice();
        a.build.langProf = langList.slice();
      }
      VT.gear.recompute(a);
      saveDraw();
    }

    function chips(label, list, kinds, hint) {
      p.appendChild(el('div', { class: 'tiny' }, [label]));
      var box = el('div', { class: 'chiprow' });
      kinds.forEach(function (k) {
        var on = list.indexOf(k) >= 0;
        box.appendChild(el('span', { class: 'chip' + (on ? ' good' : ''), title: hint,
          onClick: function () {
            var i = list.indexOf(k);
            if (i >= 0) list.splice(i, 1); else list.push(k);
            commit();
          } }, [U.cap(k)]));
      });
      /* Granted by name rather than by kind - a race's longsword training, or
         something a DM handed out. Click to take it away again. */
      list.filter(function (k) { return kinds.indexOf(k) < 0; }).forEach(function (k) {
        box.appendChild(el('span', { class: 'chip good', title: 'Click to remove',
          onClick: function () {
            list.splice(list.indexOf(k), 1);
            commit();
          } }, [U.cap(k) + ' ×']));
      });
      p.appendChild(box);
    }

    chips('Armour', armourList, PR.ARMOUR_KINDS,
      'Armour you are not trained in: disadvantage on Strength and Dexterity ' +
      'checks, saves and attacks, and no spellcasting.');
    chips('Weapons', weaponList, PR.WEAPON_KINDS,
      'A weapon you are not trained in does not add your proficiency bonus.');

    p.appendChild(el('div', { class: 'tiny' }, ['Languages']));
    var lbox = el('div', { class: 'chiprow' });
    if (!langList.length) lbox.appendChild(el('span', { class: 'tiny' }, ['None recorded.']));
    langList.forEach(function (l) {
      lbox.appendChild(el('span', { class: 'chip good', title: 'Click to remove',
        onClick: function () {
          langList = langList.filter(function (x) { return x !== l; });
          commit();
        } }, [U.cap(l) + ' ×']));
    });
    p.appendChild(lbox);
    if (a.langChoices) {
      p.appendChild(el('div', { class: 'warn-box' }, [
        a.langChoices + ' language' + (a.langChoices > 1 ? 's' : '') +
        ' of your choice still to pick — the race or background grants them ' +
        'without saying which.'
      ]));
    }

    /* Adding by hand. Languages and named weapons are open-ended lists, so
       there is nothing to toggle - you type what the DM gave you. */
    function adder(label, list, placeholder) {
      var typed = '';
      var input = el('input', { type: 'text', class: 'grow', placeholder: placeholder,
        onInput: function (e) { typed = e.target.value; } });
      p.appendChild(el('div', { class: 'linerow' }, [
        el('span', { class: 'tiny' }, [label]), input,
        P.btn('Add', function () {
          var v = PR.clean(typed);
          if (!v) return;
          if (list.indexOf(v) < 0) list.push(v);
          flash('Proficient with ' + U.esc(U.cap(v)) + '.');
          commit();
        }, 'sm primary')
      ]));
    }
    adder('Language', langList, 'Elvish');
    adder('Weapon', weaponList, 'Longsword');

    p.appendChild(el('p', { class: 'tiny' }, [
      'Class, race and background training is worked out on the Character tab and ' +
      'comes back on a level-up. What you add here is kept.'
    ]));
    work.appendChild(p);
  }

  /* --- tools --- */
  var TOOL_ABILITY = {
    "thieves' tools": 'dex', 'thieves tools': 'dex', 'disguise kit': 'cha',
    'forgery kit': 'dex', 'herbalism kit': 'int', "healer's kit": 'wis',
    "navigator's tools": 'int', "poisoner's kit": 'int', "cartographer's tools": 'int',
    "alchemist's supplies": 'int', "brewer's supplies": 'int', "cook's utensils": 'wis',
    "smith's tools": 'str', "mason's tools": 'str', "carpenter's tools": 'str'
  };

  function toolPanel(a) {
    a.toolProf = a.toolProf || [];
    var p = el('div', { class: 'panel' }, [el('h3', {}, ['Tools'])]);
    var prof = VT.actor.prof(a);
    if (!a.toolProf.length) {
      p.appendChild(el('p', { class: 'tiny' }, [
        'No tool proficiencies. A rogue gets thieves’ tools, a druid a herbalism kit; ' +
        'the ones a class lets you choose are on the Choices panel above.'
      ]));
    }
    a.toolProf.forEach(function (t, i) {
      /* Which ability a tool check uses is the DM’s call and moves with the
         task - picking a lock is Dexterity, spotting a forgery Intelligence. */
      var abil = TOOL_ABILITY[String(t).toLowerCase()] || 'dex';
      p.appendChild(el('div', { class: 'linerow' }, [
        el('span', { class: 'grow' }, [U.cap(t),
          el('span', { class: 'tiny' }, ['  ' + SRD.ABILITY_NAME[abil] + ' + proficiency'])]),
        el('span', { class: 'skillmod' }, [sign(VT.actor.abilityMod(a, abil) + prof)]),
        P.btn('×', function () { a.toolProf.splice(i, 1); saveDraw(); }, 'sm danger')
      ]));
    });
    var add = '';
    p.appendChild(el('div', { class: 'linerow', style: { marginTop: '8px' } }, [
      el('input', { type: 'text', class: 'grow', placeholder: 'Add a tool proficiency',
        onInput: function (e) { add = e.target.value; } }),
      P.btn('Add', function () {
        if (!add.trim()) return;
        a.toolProf.push(add.trim());
        flash('Proficient with ' + U.esc(add.trim()) + '.');
        saveDraw();
      }, 'sm primary')
    ]));
    work.appendChild(p);
  }

  /* --- death saves --- */
  function deathPanel(a) {
    if (a.hp > 0 && !(a.deathSaves && (a.deathSaves.s || a.deathSaves.f))) return;
    var ds = VT.actor.deathSaveState(a);
    var p = el('div', { class: 'panel' }, [el('h3', {}, ['Death saves'])]);
    ['s', 'f'].forEach(function (which) {
      var row = el('div', { class: 'linerow' }, [
        el('span', { class: 'grow' }, [which === 's' ? 'Successes' : 'Failures'])
      ]);
      var pips = el('span', { class: 'dspips' });
      for (var i = 0; i < 3; i++) {
        pips.appendChild(el('span', {
          class: 'dspip ' + (which === 's' ? 'ok' : 'bad') + (i < ds[which] ? ' on' : ''),
          onClick: (function (n) {
            return function () { ds[which] = (ds[which] === n ? n - 1 : n); saveDraw(); };
          })(i + 1)
        }));
      }
      row.appendChild(pips);
      p.appendChild(row);
    });
    var outcome = VT.actor.deathSaveOutcome(a);
    if (outcome === 'dead') p.appendChild(el('div', { class: 'err-box' }, ['Three failures — dead.']));
    else if (a.stable) p.appendChild(el('div', { class: 'ok-box' }, ['Stable.']));
    p.appendChild(el('div', { class: 'btnrow' }, [
      P.btn('Roll a save', function () {
        var r = VT.dice.roll('1d20');
        var res = VT.actor.deathSave(a, r.total);
        flash('Death save ' + r.total + ' — ' + res.result +
              (res.outcome ? ' (' + res.outcome + ')' : '') + '.',
              res.result === 'success' || res.result === 'revived' ? 'ok' : 'err');
        saveDraw();
      }, 'sm primary'),
      P.btn('Clear', function () { VT.actor.clearDeathSaves(a); saveDraw(); }, 'sm')
    ]));
    work.appendChild(p);
  }

  /* --- resources: ki, rage, bardic inspiration, superiority dice --- */
  function resourcePanel(a) {
    if (!(a.resources || []).length) return;
    var p = el('div', { class: 'panel' }, [el('h3', {}, ['Resources'])]);
    a.resources.forEach(function (r) {
      var left = r.max - r.used;
      p.appendChild(el('div', { class: 'linerow' }, [
        el('span', { class: 'grow' }, [r.name, el('span', { class: 'tiny' }, ['  per ' + r.per + ' rest'])]),
        P.btn('+', function () { VT.features.restore(a, r.key); saveDraw(); }, 'sm'),
        el('span', { class: 'ctr', style: { color: left ? 'var(--green)' : 'var(--red)' } },
          [left + ' / ' + r.max]),
        P.btn('−', function () {
          if (VT.features.spend(a, r.key)) saveDraw();
        }, 'sm'),
        P.btn('max', function () {
          var v = prompt('New maximum for ' + r.name, String(r.max));
          if (v == null) return;
          r.max = Math.max(0, parseInt(v, 10) || 0);
          r.used = Math.min(r.used, r.max);
          saveDraw();
        }, 'sm')
      ]));
    });
    p.appendChild(el('p', { class: 'tiny' }, [
      'Maximums come from the class table, but override any of them if your table rules differently. ' +
      'Re-deriving from the build resets them.'
    ]));
    work.appendChild(p);
  }

  /* --- spell slots --- */
  function slotPanel(a) {
    if (!a.spellSlots) return;
    var p = el('div', { class: 'panel' }, [el('h3', {}, ['Spell slots'])]);
    if (a.spellSlots.pact) {
      var left = VT.features.slotsLeft(a);
      p.appendChild(el('div', { class: 'linerow' }, [
        el('span', { class: 'grow' }, ['Pact slots',
          el('span', { class: 'tiny' }, ['  level ' + a.spellSlots.slotLevel + ' · back on a short rest'])]),
        P.btn('+', function () {
          a.slotsUsed.pact = Math.max(0, (a.slotsUsed.pact || 0) - 1); saveDraw();
        }, 'sm'),
        el('span', { class: 'ctr', style: { color: left ? 'var(--green)' : 'var(--red)' } },
          [left + ' / ' + a.spellSlots.count]),
        P.btn('−', function () {
          if (left <= 0) return;
          a.slotsUsed.pact = (a.slotsUsed.pact || 0) + 1; saveDraw();
        }, 'sm')
      ]));
    } else {
      a.spellSlots.slots.forEach(function (max, i) {
        var lv = i + 1, left = VT.features.slotsLeft(a, lv);
        p.appendChild(el('div', { class: 'linerow' }, [
          el('span', { class: 'grow' }, [U.ord(lv) + ' level']),
          P.btn('+', function () {
            a.slotsUsed[lv] = Math.max(0, (a.slotsUsed[lv] || 0) - 1); saveDraw();
          }, 'sm'),
          el('span', { class: 'ctr', style: { color: left ? 'var(--green)' : 'var(--red)' } },
            [left + ' / ' + max]),
          P.btn('−', function () {
            if (left <= 0) return;
            a.slotsUsed[lv] = (a.slotsUsed[lv] || 0) + 1; saveDraw();
          }, 'sm')
        ]));
      });
    }
    p.appendChild(el('div', { class: 'btnrow', style: { marginTop: '8px' } }, [
      P.btn('Restore all slots', function () { a.slotsUsed = {}; saveDraw(); }, 'sm')
    ]));
    work.appendChild(p);
  }

  /* --- coin --- */
  function coinPanel(a) {
    var p = el('div', { class: 'panel' }, [el('h3', {}, ['Coin'])]);
    var cells = VT.coin.denoms().map(function (d) {
      return P.row(d.name + ' (' + d.key + ')', P.numEl(a.coins[d.key] || 0, 0, 999999, function (v) {
        a.coins[d.key] = Math.max(0, v | 0); saveDraw();
      }));
    });
    p.appendChild(el('div', { class: 'grid3' }, cells));
    p.appendChild(el('div', { class: 'ok-box' }, [
      'Carrying ' + VT.coin.format(a.coins) + '  (' + VT.coin.toBase(a.coins) + ' cp)'
    ]));
    var amount = '';
    p.appendChild(el('div', { class: 'linerow' }, [
      el('input', { type: 'text', class: 'grow', placeholder: 'e.g. 12 gp, 5sp 3cp, or a number of copper',
        onInput: function (e) { amount = e.target.value; } }),
      P.btn('Earn', function () {
        var base = VT.coin.parse(amount);
        if (!base) { flash('Could not read "' + U.esc(amount) + '" as an amount.', 'err'); redraw(); return; }
        a.coins = VT.coin.add(a.coins, base);
        flash('Added ' + VT.coin.format(VT.coin.fromBase(base)) + '.');
        saveDraw();
      }, 'sm primary'),
      P.btn('Spend', function () {
        var base = VT.coin.parse(amount);
        if (!base) { flash('Could not read "' + U.esc(amount) + '" as an amount.', 'err'); redraw(); return; }
        var left = VT.coin.spend(a.coins, base);
        if (!left) { flash('Not enough coin — ' + VT.coin.format(a.coins) + ' on hand.', 'err'); redraw(); return; }
        a.coins = left;
        flash('Spent ' + VT.coin.format(VT.coin.fromBase(base)) + '.');
        saveDraw();
      }, 'sm')
    ]));
    work.appendChild(p);
  }

  /* --- inventory --- */
  function inventoryPanel(a) {
    var p = el('div', { class: 'panel' }, [el('h3', {}, ['Inventory — ' + a.inventory.length])]);
    a.inventory.forEach(function (it, i) {
      p.appendChild(el('div', { class: 'linerow' }, [
        el('input', { type: 'text', class: 'grow', value: it.name,
          onInput: function (e) { it.name = e.target.value; save(); } }),
        el('input', { type: 'text', value: it.note || '', placeholder: 'note',
          style: { width: '180px' },
          onInput: function (e) { it.note = e.target.value; save(); } }),
        P.numEl(it.qty == null ? 1 : it.qty, 0, 9999, function (v) { it.qty = v | 0; save(); }),
        P.btn('×', function () { a.inventory.splice(i, 1); saveDraw(); }, 'sm danger')
      ]));
    });
    var nm = '', qty = 1, note = '';
    p.appendChild(el('div', { class: 'linerow', style: { marginTop: '8px' } }, [
      el('input', { type: 'text', class: 'grow', placeholder: 'Item bought or found',
        onInput: function (e) { nm = e.target.value; } }),
      el('input', { type: 'text', placeholder: 'note (optional)', style: { width: '180px' },
        onInput: function (e) { note = e.target.value; } }),
      P.numEl(1, 1, 9999, function (v) { qty = v | 0; }),
      P.btn('Add', function () {
        if (!nm.trim()) { flash('Give the item a name.', 'err'); redraw(); return; }
        a.inventory.push({ name: nm.trim(), qty: qty, note: note.trim() });
        saveDraw();
      }, 'sm primary')
    ]));
    p.appendChild(el('p', { class: 'tiny' }, [
      'Shared with Tale Sheet and Tale Shop, and carried untouched through every level-up.'
    ]));
    work.appendChild(p);
  }

  /* --- actions --- */
  function actionPanel(a) {
    var p = el('div', { class: 'panel' }, [el('h3', {}, ['Actions — ' + a.actions.length])]);
    a.actions.forEach(function (act, i) {
      var box = P.actionEditor(a, act, i);
      if (act.spellLevel) box.appendChild(castRow(a, act));
      if (act.custom) box.appendChild(el('div', { class: 'tiny' }, ['added by hand — survives a level-up']));
      p.appendChild(box);
    });
    p.appendChild(el('div', { class: 'btnrow' }, [
      P.btn('+ Melee', function () {
        var sm = VT.actor.abilityMod(a, 'str');
        a.actions.push(Object.assign(SRD.melee('New Attack', VT.actor.prof(a) + sm,
          '1d6' + (sm ? sign(sm) : ''), 'slashing'), { custom: true }));
        saveDraw();
      }, 'sm'),
      P.btn('+ Ranged', function () {
        var dm = VT.actor.abilityMod(a, 'dex');
        a.actions.push(Object.assign(SRD.ranged('New Shot', VT.actor.prof(a) + dm,
          '1d6' + (dm ? sign(dm) : ''), 'piercing', 80, 320), { custom: true }));
        saveDraw();
      }, 'sm'),
      P.btn('+ Area', function () {
        a.actions.push(Object.assign(SRD.saveSpell('New Blast', 'dex', a.spellDC || 13,
          '3d6', 'fire', 15, 60), { custom: true }));
        saveDraw();
      }, 'sm'),
      P.btn('+ Effect', function () {
        a.actions.push({ name: 'New Effect', kind: 'buff', condition: 'blessed',
                         range: [0, 30], cost: 'action', custom: true, desc: '' });
        saveDraw();
      }, 'sm')
    ]));
    work.appendChild(p);
  }

  /* A levelled spell can be cast with a bigger slot. Show what it does at each,
     and spend the slot from here. */
  function castRow(a, act) {
    var slot = R.castAt[act.name] || act.spellLevel;
    var shot = VT.upcast.at(act, slot);
    var opts = VT.upcast.slotOptions(a, act);
    var row = el('div', { class: 'castrow' });
    if (!opts.length) {
      row.appendChild(el('span', { class: 'sub' }, [
        'No slot of ' + U.ord(act.spellLevel) + ' level or higher.']));
      return row;
    }
    row.appendChild(el('span', { class: 'sub' }, ['cast at']));
    opts.forEach(function (o) {
      row.appendChild(el('button', {
        class: 'slotpip' + (o.level === slot ? ' on' : '') + (o.left <= 0 ? ' out' : ''),
        title: (o.pact ? 'Pact slot' : U.ord(o.level) + ' level') + ' — ' + o.left + ' of ' + o.max + ' left',
        onClick: function () { R.castAt[act.name] = o.level; R.castPact[act.name] = !!o.pact; redraw(); }
      }, [(o.pact ? 'P' : String(o.level)) + '·' + o.left]));
    });
    row.appendChild(el('span', { class: 'sub' }, [
      '  ' + (shot.count > 1 ? shot.count + '×' : '') + shot.dmg +
      (shot.note ? '  ' + shot.note : '')
    ]));
    var chosen = opts.filter(function (o) {
      return o.level === slot && (!!o.pact === !!R.castPact[act.name]);
    })[0] || opts.filter(function (o) { return o.level === slot; })[0];
    row.appendChild(P.btn('Spend slot', function () {
      if (!chosen || !VT.upcast.spendSlot(a, chosen)) { flash('No slot left at that level.', 'err'); redraw(); return; }
      flash(U.esc(act.name) + ' cast at ' + U.ord(chosen.level) + (chosen.pact ? ' (pact)' : '') +
            ' — ' + (shot.count > 1 ? shot.count + '×' : '') + shot.dmg + '.');
      saveDraw();
    }, 'sm' + (!chosen || chosen.left <= 0 ? ' danger' : '')));
    return row;
  }

  /* --- features --- */
  function featurePanel(a) {
    if (!(a.features || []).length) return;
    var notes = a.featureNotes || {};
    var applied = Object.keys(notes).length;
    var p = el('div', { class: 'panel' }, [
      el('h3', {}, ['Features — ' + a.features.length]),
      el('p', { class: 'tiny', style: { marginTop: '-6px', marginBottom: '10px' } }, [
        applied + ' of these are wired into the numbers above; the rest are printed text. ' +
        'Click any feature to read it.'
      ])
    ]);
    var byLevel = {};
    a.features.forEach(function (f) { (byLevel[f.level] = byLevel[f.level] || []).push(f); });
    Object.keys(byLevel).map(Number).sort(function (x, y) { return x - y; }).forEach(function (lv) {
      p.appendChild(el('div', { class: 'featlvl' }, ['Level ' + lv]));
      byLevel[lv].forEach(function (f) {
        var key = lv + ':' + f.name;
        var open = !!R.openFeat[key];
        var body = el('div', { class: 'feattext' + (open ? '' : ' hidden') });
        if (open) {
          var txt = VT.charbuild.featureText(f, (a.build && a.build.cls && a.build.cls.name) || a.className || '');
          body.textContent = (notes[f.name] ? '▸ ' + notes[f.name] + '\n\n' : '') +
            (txt || 'Text unavailable — connect your 5etools data source.');
        }
        p.appendChild(el('div', { class: 'linerow feathead', onClick: function () {
          R.openFeat[key] = !open; redraw();
        } }, [
          el('span', { class: 'grow' }, [f.name,
            f.subclass ? el('span', { class: 'tiny' }, ['  subclass']) : null]),
          notes[f.name] ? el('span', { class: 'chip good' }, ['applied']) : null
        ]));
        p.appendChild(body);
      });
    });
    work.appendChild(p);
  }

  /* --- conditions --- */
  function conditionPanel(a) {
    var p = el('div', { class: 'panel' }, [el('h3', {}, ['Conditions'])]);
    var box = el('div', { class: 'chiprow' });
    Object.keys(SRD.CONDITIONS).forEach(function (k) {
      var on = a.conditions.indexOf(k) >= 0;
      box.appendChild(el('span', { class: 'chip' + (on ? ' bad' : ''), onClick: function () {
        if (on) VT.actor.removeCond(a, k); else VT.actor.addCond(a, k);
        saveDraw();
      } }, [SRD.CONDITIONS[k].name]));
    });
    p.appendChild(box);
    p.appendChild(el('p', { class: 'tiny' }, [
      'These apply on the battle map and to the effective AC above — Hasted adds +2, Shielded +5.'
    ]));
    work.appendChild(p);
  }

  /* --- gear from the loaded books --- */
  function gearPanel(a) {
    if (!a.build) return;
    var p = el('div', { class: 'panel' }, [el('h3', {}, ['Gear & spells from your data'])]);
    if (!FT.loaded) {
      p.appendChild(el('div', { class: 'warn-box' }, [
        'Connect a data source to add weapons, armour and spells from the books. ' +
        'You can still add actions by hand above.'
      ]));
      work.appendChild(p);
      return;
    }
    var items = FT.get('item');
    p.appendChild(picker('Add a weapon', items.filter(function (i) { return i.weapon || i.dmg1; }),
      function (rec) { addToBuild(a, 'weapons', rec); }));
    p.appendChild(picker('Add a spell', FT.get('spell'),
      function (rec) { addToBuild(a, 'spells', rec); },
      function (s) { return s.name + (s.level ? ' · level ' + s.level : ' · cantrip'); }));
    /* By type, not by the `armor` flag. Only the 25 plain armours carry that
       flag; every magic one - "+1 Plate Armor", "Adamantine Half Plate",
       "Elven Chain" - is typed LA/MA/HA/S and would otherwise be invisible. */
    p.appendChild(picker('Wear armour', items.filter(isArmour),
      function (rec) {
        a.build.armor = { name: rec.name, source: rec.source || null };
        rederive(a, 'Equipped ' + U.esc(rec.name) + '.');
      },
      function (i) { return i.name + ' · AC ' + i.ac; }));

    var have = [];
    if (a.build.armor) have.push('armour: ' + a.build.armor.name);
    if (a.build.shield) have.push('shield');
    if ((a.build.weapons || []).length) have.push('weapons: ' + a.build.weapons.map(function (w) { return w.name; }).join(', '));
    if ((a.build.spells || []).length) have.push((a.build.spells || []).length + ' spells');

    p.appendChild(el('div', { class: 'btnrow', style: { marginTop: '10px' } }, [
      P.btn(a.build.shield ? 'Shield equipped ✓' : 'Equip shield (+2 AC)', function () {
        a.build.shield = !a.build.shield;
        rederive(a, a.build.shield ? 'Shield equipped.' : 'Shield removed.');
      }, 'sm' + (a.build.shield ? ' on' : '')),
      a.build.armor ? P.btn('Remove armour', function () {
        a.build.armor = null; rederive(a, 'Armour removed.');
      }, 'sm danger') : null,
      (a.build.weapons || []).length ? P.btn('Clear weapons', function () {
        a.build.weapons = []; rederive(a, 'Weapons cleared.');
      }, 'sm danger') : null
    ]));
    if (have.length) p.appendChild(el('p', { class: 'tiny' }, ['Currently — ' + have.join(' · ')]));
    p.appendChild(el('p', { class: 'tiny' }, [
      'Adding gear re-derives the sheet, so attack lines, AC and the spell list all update together.'
    ]));
    work.appendChild(p);
  }

  var ARMOUR_TYPES = ['LA', 'MA', 'HA', 'S'];
  function typeOf(i) { return String(i.type || '').split('|')[0]; }
  function isArmour(i) { return ARMOUR_TYPES.indexOf(typeOf(i)) >= 0 || (i.armor && i.ac); }
  /* Anything you would call a magic item: it has a rarity, or it wants
     attuning. Weapons and armour have their own pickers already. */
  function isMagicItem(i) {
    if (isArmour(i) || i.weapon) return false;
    return (i.rarity && i.rarity !== 'none') || !!i.reqAttune || !!i.wondrous;
  }

  /* A search box over a list too long for a dropdown — the same pattern the
     shop uses for its 2,600 items. */
  function picker(label, records, onPick, fmt) {
    fmt = fmt || function (r) { return r.name; };
    var wrap = el('div', { style: { marginBottom: '10px' } });
    var list = el('div', { class: 'picklist hidden' });
    var input = el('input', { type: 'text', placeholder: label + ' — type to search' });
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      U.clear(list);
      if (q.length < 2) { list.classList.add('hidden'); return; }
      var hits = records.filter(function (r) {
        return String(r.name || '').toLowerCase().indexOf(q) >= 0;
      }).slice(0, 40);
      if (!hits.length) {
        list.appendChild(el('div', { class: 'tiny', style: { padding: '6px' } }, ['Nothing matches.']));
      }
      hits.forEach(function (r) {
        list.appendChild(el('div', { class: 'pickhit', onClick: function () {
          input.value = ''; list.classList.add('hidden');
          onPick(r);
        } }, [
          el('span', { class: 'grow' }, [fmt(r)]),
          el('span', { class: 'tiny' }, [r.source || ''])
        ]));
      });
      list.classList.remove('hidden');
    });
    wrap.appendChild(el('div', { class: 'searchbar' }, [input]));
    wrap.appendChild(list);
    return wrap;
  }

  /* --- magic items and attunement --- */
  function attunePanel(a) {
    a.attuned = a.attuned || [];
    var max = VT.actor.attuneMax(a);
    var used = VT.actor.attuneCount(a);
    var p = el('div', { class: 'panel' }, [
      el('h3', {}, ['Magic items & attunement — ' + used + ' of ' + max])
    ]);

    /* the three slots, as slots */
    var slots = el('div', { class: 'attune-slots' });
    for (var i = 0; i < max; i++) {
      var it = a.attuned[i];
      slots.appendChild(el('div', { class: 'attune-slot' + (it ? ' filled' : '') }, it ? [
        el('div', { class: 'attune-nm' }, [it.name]),
        it.note ? el('div', { class: 'tiny' }, [it.note]) : null,
        el('button', { class: 'btn sm danger', onClick: (function (name) {
          return function () { VT.actor.unattune(a, name); flash('No longer attuned to ' + U.esc(name) + '.'); saveDraw(); };
        })(it.name) }, ['Break attunement'])
      ] : [el('div', { class: 'tiny' }, ['empty slot'])]));
    }
    p.appendChild(slots);

    if (FT.loaded) {
      p.appendChild(picker('Attune to an item', FT.get('item').filter(function (i) { return i.reqAttune; }),
        function (rec) {
          var r = VT.actor.attune(a, rec);
          if (!r.ok) { flash(U.esc(r.reason), 'err'); redraw(); return; }
          if (!a.inventory.some(function (x) { return x.name === rec.name; })) {
            a.inventory.push({ name: rec.name, qty: 1, note: 'attuned' });
          }
          flash('Attuned to ' + U.esc(rec.name) + '.');
          saveDraw();
        },
        function (i) {
          return i.name + ' · ' + (i.rarity || 'magic') +
            (typeof i.reqAttune === 'string' ? ' · ' + i.reqAttune : '');
        }));

      /* everything else magical - rings, wondrous items, potions, wands */
      p.appendChild(picker('Add a magic item', FT.get('item').filter(isMagicItem),
        function (rec) {
          a.inventory.push({ name: rec.name, qty: 1, note: (rec.rarity || 'magic') });
          flash(U.esc(rec.name) + ' added to the inventory.' +
                (rec.reqAttune ? ' It needs attuning — do that above.' : ''));
          saveDraw();
        },
        function (i) {
          return i.name + ' · ' + (i.rarity || 'magic') + (i.reqAttune ? ' · attunement' : '');
        }));
    } else {
      p.appendChild(el('p', { class: 'tiny' }, ['Connect a data source to browse magic items.']));
    }
    p.appendChild(el('p', { class: 'tiny' }, [
      'Three items at once is the standard limit; change it in Core numbers if your table plays it differently. ' +
      'Attuning also drops the item into the inventory so it is not held in two places.'
    ]));
    work.appendChild(p);
  }

  /* --- notes --- */
  function notesPanel(a) {
    work.appendChild(el('div', { class: 'panel' }, [
      el('h3', {}, ['Notes']),
      el('textarea', { rows: 6, value: a.notes || '',
        placeholder: 'Feats taken, fighting style, invocations, anything the sheet does not model.',
        onInput: function (e) { a.notes = e.target.value; a.notesCustom = true; save(); } }),
      el('p', { class: 'tiny' }, ['Marked as yours once edited, so a level-up never overwrites it.'])
    ]));
  }

  /* --- housekeeping --- */
  function managePanel(a) {
    var p = el('div', { class: 'panel' }, [el('h3', {}, ['This entry'])]);
    p.appendChild(el('div', { class: 'btnrow' }, [
      P.btn('Duplicate', function () {
        var copy = U.clone(a);
        copy.id = U.uid('tpl');
        copy.name = a.name + ' (copy)';
        roster().push(copy);
        R.id = copy.id;
        flash('Duplicated.');
        saveDraw();
      }, 'sm'),
      P.btn('Download JSON', function () {
        var clean = U.clone(a);
        delete clean.__src;
        var blob = new Blob([JSON.stringify(clean, null, 1)], { type: 'application/json' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = String(a.name || 'sheet').replace(/[^\w-]+/g, '_') + '.json';
        document.body.appendChild(link); link.click();
        setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 400);
      }, 'sm'),
      P.btn('Remove from roster', function () {
        if (!confirm('Remove ' + a.name + ' from the campaign roster? Anything already placed on a map stays there.')) return;
        VT.store.removeFromRoster(a.id);
        R.id = null;
        flash('Removed.');
        saveDraw();
      }, 'sm danger')
    ]));
    p.appendChild(el('p', { class: 'tiny', style: { marginTop: '8px' } }, [
      'Exported JSON imports into Tale Sheet, so a character built and levelled here can be ' +
      'handed to a player for use in TaleSpire.'
    ]));
    work.appendChild(p);
  }

  /* ==== level and re-derive ============================================== */
  function addToBuild(a, key, rec) {
    a.build[key] = a.build[key] || [];
    a.build[key].push({ name: rec.name, source: rec.source || null });
    rederive(a, 'Added ' + U.esc(rec.name) + '.');
  }

  function replace(oldA, newA) {
    var i = roster().findIndex(function (c) { return c.id === oldA.id; });
    if (i >= 0) roster()[i] = ensureFields(newA);
    R.id = newA.id;
  }

  function rederive(a, msg) {
    var res = VT.charbuild.relevel(a, a.level);
    if (!res.ok) { flash(U.esc(res.reason), 'err'); redraw(); return; }
    replace(a, res.actor);
    flash(msg || 'Updated.' + missingNote(res));
    saveDraw();
  }

  function missingNote(res) {
    return res.missing && res.missing.length
      ? ' Not found in your data: ' + U.esc(res.missing.join(', ')) + '.' : '';
  }

  function changeLevel(a, newLevel) {
    newLevel = U.clamp(newLevel, 1, 20);
    if (newLevel === a.level) return;

    if (FT.loaded && a.build && a.build.cls) {
      var res = VT.charbuild.relevel(a, newLevel);
      if (res.ok) {
        replace(a, res.actor);
        flash('Now level ' + newLevel + ' — <b>' + res.actor.hpMax + '</b> max HP, proficiency ' +
              sign(VT.actor.prof(res.actor)) +
              ((res.actor.asiStatus && res.actor.asiStatus.left)
                ? '. <b>' + res.actor.asiStatus.left + ' ability score improvement' +
                  (res.actor.asiStatus.left > 1 ? 's' : '') + '</b> to assign below.' : '.') +
              missingNote(res));
        saveDraw();
        return;
      }
      flash(U.esc(res.reason) + ' Falling back to arithmetic.', 'warn');
    }

    /* No build data, or the class is not in the loaded set. Hit points gain the
       die's average plus Constitution, and any change in proficiency flows
       through to derived attack bonuses and the spell numbers. Exactly what the
       symbiote does in the same situation. */
    var oldProf = SRD.profBonus(a.level || 1), newProf = SRD.profBonus(newLevel);
    var faces = a.hitDie || 8;
    var conMod = SRD.mod(a.abilities.con);
    var per = Math.max(1, Math.floor(faces / 2) + 1 + conMod);
    var delta = newLevel - (a.level || 1);
    a.hpMax = Math.max(1, a.hpMax + delta * per);
    a.hp = U.clamp(a.hp + (delta > 0 ? delta * per : 0), 1, a.hpMax);
    a.level = newLevel;
    a.hitDiceMax = newLevel;
    a.hitDiceUsed = Math.min(a.hitDiceUsed || 0, newLevel);
    if (newProf !== oldProf) {
      var d = newProf - oldProf;
      (a.actions || []).forEach(function (act) {
        if (act.toHit != null && !act.custom) act.toHit += d;
      });
      if (a.spellDC != null) a.spellDC += d;
      if (a.spellAttack != null) a.spellAttack += d;
    }
    flash('Now level ' + newLevel + ' — <b>' + a.hpMax + '</b> max HP, proficiency ' + sign(newProf) +
          (newProf !== oldProf ? ' (attack bonuses adjusted).' : '.'));
    saveDraw();
  }

  VT.rosterUI = { render: render, select: function (id) { R.id = id; } };
})();
