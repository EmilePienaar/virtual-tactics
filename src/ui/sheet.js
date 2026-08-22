/* Virtual Tactics :: ui/sheet.js
   Two panels: the Play tab (what the selected creature can do right now) and
   the Roster tab (the campaign's cast, fully editable statblocks). */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, el = U.el, ui = VT.ui, A = VT.actor, SRD = VT.srd;

  /* ==== PLAY PANEL ====================================================== */
  function renderPlay(container, map, selected) {
    U.clear(container);
    var C = VT.combat;

    /* encounter controls */
    container.appendChild(ui.section('Encounter', C.active ? 'round ' + C.round : 'not started', [
      el('div', { class: 'btnrow' }, [
        C.active
          ? ui.btn('End Encounter', function () {
              ui.confirm('End the encounter and clear initiative?', function () { C.end(); VT.app.renderSide(); }, 'End');
            }, 'sm danger')
          : ui.btn('Roll Initiative', function () {
              if (!map || !map.tokens.length) { ui.logLine('<span class="miss">Place some tokens first.</span>'); return; }
              C.rollInitiative(map);
              VT.app.renderSide();
            }, 'sm primary'),
        C.active ? ui.btn('Next Turn', function () { VT.app.endTurn(); }, 'sm') : null,
        ui.btn('Full Heal', function () {
          map.tokens.forEach(function (t) { t.hp = t.hpMax; t.tempHp = 0; t.conditions = []; });
          VT.store.touch(); VT.app.renderSide();
        }, 'sm', 'Reset every creature to full health')
      ]),
      !C.active && map ? el('p', { class: 'hint' }, [
        'Rolling initiative sorts every token on the board. Enemies act on their own unless you turn that off in Settings.'
      ]) : null
    ]));

    if (!selected) {
      container.appendChild(ui.section('Selection', '', [
        el('div', { class: 'muted' }, ['Click a creature on the board to inspect it.']),
        map && map.tokens.length ? el('div', { class: 'list', style: { marginTop: '8px' } },
          map.tokens.map(function (t) { return tokenRow(t); })) : null
      ]));
      return;
    }

    var a = selected;
    var isTurn = C.active && C.current() && C.current().id === a.id;

    /* headline */
    var head = el('div', { class: 'sec-b' }, [
      el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, [
        A.portrait(a, 44, 54),
        el('div', { class: 'grow' }, [
          el('div', { style: { fontFamily: 'var(--serif)', fontSize: '15px', color: VT.sprites.TEAM_COLOR[a.team] } }, [a.name]),
          el('div', { class: 'muted' }, [
            (a.className ? a.className + ' ' + a.level : a.cr ? 'CR ' + a.cr : U.cap(a.size)) +
            ' · ' + U.cap(a.size)
          ])
        ])
      ]),
      el('div', { class: 'hpwrap' }, [
        el('div', { class: 'hpbar-lg' }, [
          el('i', { style: { width: (U.clamp(a.hp / Math.max(1, a.hpMax), 0, 1) * 100) + '%' } }),
          el('span', {}, [a.hp + ' / ' + a.hpMax + (a.tempHp ? ' (+' + a.tempHp + ')' : '')])
        ])
      ]),
      damageControls(a),
      el('div', {}, [
        statline('Armour Class', A.effectiveAC(a) +
          (A.acSources(a).length ? '  (' + A.acSources(a).join(', ') + ')' : '')),
        statline('Speed', A.speedOf(a) + ' ft' + (C.active ? '  (' + Math.round(a.moveLeft) + ' left)' : '')),
        C.active ? statline('Initiative', a.initiative) : null,
        statline('Passive Perception', A.passivePerception(a))
      ]),
      abilityGrid(a),
      purseRow(a),
      conditionChips(a)
    ]);
    container.appendChild(el('div', { class: 'sec' }, [
      el('div', { class: 'sec-h' }, [isTurn ? 'Acting Now' : 'Selected',
        el('span', { class: 'sh-right' }, [a.team])]),
      head
    ]));

    /* actions */
    container.appendChild(ui.section('Actions', '', [
      el('div', { class: 'list' }, (a.actions || []).map(function (act) {
        return el('div', { class: 'listitem', onClick: function () {
          if (isTurn) VT.app.beginTargeting(act);
        } }, [
          el('div', { class: 't' }, [
            el('div', { class: 'n' }, [act.name + (act.cost === 'bonus' ? '  ·  bonus' : '')]),
            el('div', { class: 's' }, [describeAction(act)])
          ]),
          act.uses ? el('span', { class: 'chip' }, [A.usesLeft(a, act) + '/' + act.uses.max]) : null
        ]);
      })),
      (a.resist || []).length ? el('div', { style: { marginTop: '6px' } }, [
        el('span', { class: 'chip good' }, ['resists ' + a.resist.join(', ')])]) : null,
      (a.vulnerable || []).length ? el('div', {}, [
        el('span', { class: 'chip bad' }, ['vulnerable ' + a.vulnerable.join(', ')])]) : null,
      (a.immune || []).length ? el('div', {}, [
        el('span', { class: 'chip good' }, ['immune ' + a.immune.join(', ')])]) : null,
      a.notes ? el('p', { class: 'hint' }, [a.notes]) : null
    ]));

    container.appendChild(ui.section('Token', '', [
      el('div', { class: 'btnrow' }, [
        ui.btn('Edit statblock', function () { editActor(a, function () { VT.app.renderSide(); }); }, 'sm'),
        ui.btn('Sprite…', function () { VT.spriteUI.pick(a, function () { VT.app.renderSide(); }); }, 'sm'),
        ui.btn('Remove', function () {
          map.tokens = map.tokens.filter(function (t) { return t.id !== a.id; });
          VT.app.selectActor(null); VT.store.touch(); VT.app.renderSide();
        }, 'sm danger')
      ])
    ]));
  }

  function tokenRow(t) {
    var item = el('div', {
      class: 'listitem',
      onClick: function () { VT.app.selectActor(t); VT.app.focusOn(t); }
    }, [
      el('div', { class: 't' }, [
        el('div', { class: 'n', style: { color: VT.sprites.TEAM_COLOR[t.team] } }, [t.name]),
        el('div', { class: 's' }, [t.hp + '/' + t.hpMax + ' hp · AC ' + t.ac])
      ])
    ]);
    item.insertBefore(A.portrait(t, 26, 32), item.firstChild);
    return item;
  }

  /* Purse: a readable total plus a quick earn/spend box, since coins change
     far more often than they are hand-edited denomination by denomination. */
  function purseRow(a) {
    a.coins = a.coins || VT.coin.emptyPurse();
    var amount = el('input', { type: 'text', value: '10 gp', style: { width: '84px' } });
    var line = el('div', { style: { marginTop: '8px' } }, [
      statline('Coin', VT.coin.format(a.coins)),
      el('div', { class: 'row', style: { marginTop: '4px' } }, [
        amount,
        ui.btn('Earn', function () {
          var n = VT.coin.parse(amount.value);
          if (!n) { ui.logLine('<span class="miss">Could not read "' + U.esc(amount.value) + '"</span>'); return; }
          a.coins = VT.coin.add(a.coins, n);
          ui.logLine('<b>' + U.esc(a.name) + '</b> gains ' + VT.coin.format(n));
          VT.store.touch(); VT.app.renderSide();
        }, 'sm'),
        ui.btn('Spend', function () {
          var n = VT.coin.parse(amount.value);
          if (!n) return;
          var next = VT.coin.spend(a.coins, n);
          if (!next) { ui.logLine('<span class="miss">' + U.esc(a.name) + ' cannot afford that.</span>'); return; }
          a.coins = next;
          ui.logLine('<b>' + U.esc(a.name) + '</b> spends ' + VT.coin.format(n));
          VT.store.touch(); VT.app.renderSide();
        }, 'sm danger')
      ])
    ]);
    return line;
  }

  function statline(k, v) {
    return el('div', { class: 'statline' }, [el('span', {}, [k]), el('b', {}, [String(v)])]);
  }

  function abilityGrid(a) {
    return el('div', { class: 'abils' }, SRD.ABILITIES.map(function (k) {
      return el('div', { class: 'abil' }, [
        el('div', { class: 'k' }, [SRD.ABILITY_NAME[k]]),
        el('div', { class: 'v' }, [String(a.abilities[k])]),
        el('div', { class: 'm' }, [U.sign(A.abilityMod(a, k))])
      ]);
    }));
  }

  function conditionChips(a) {
    var wrap = el('div', { style: { marginTop: '6px' } });
    Object.keys(SRD.CONDITIONS).forEach(function (k) {
      var on = A.hasCond(a, k);
      wrap.appendChild(el('span', {
        class: 'chip ' + (on ? (k === 'blessed' || k === 'hasted' || k === 'dodging' || k === 'invisible' ? 'good' : 'bad') : ''),
        style: { cursor: 'pointer', opacity: on ? 1 : .42 },
        onClick: function () {
          if (on) A.removeCond(a, k); else A.addCond(a, k);
          VT.store.touch(); VT.app.renderSide();
        }
      }, [SRD.CONDITIONS[k].name]));
    });
    return wrap;
  }

  function damageControls(a) {
    var amount = 5;
    var input = el('input', {
      type: 'number', value: amount, min: 0,
      onInput: function (e) { amount = parseInt(e.target.value, 10) || 0; }
    });
    return el('div', { class: 'row' }, [
      ui.btn('− Damage', function () {
        var r = A.applyDamage(a, amount, null);
        ui.logLine('<b>' + U.esc(a.name) + '</b> takes <span class="dmg">' + r.taken + '</span> (manual)');
        VT.bus.emit('floater', a, '-' + r.taken, '#ff8a5c');
        if (r.downed) ui.logLine('<b>' + U.esc(a.name) + '</b> drops.', 'turn');
        VT.store.touch(); VT.app.renderSide();
      }, 'sm danger'),
      input,
      ui.btn('+ Heal', function () {
        var g = A.healBy(a, amount);
        ui.logLine('<b>' + U.esc(a.name) + '</b> recovers <span class="hit">' + g + '</span> (manual)');
        VT.bus.emit('floater', a, '+' + g, '#78b06a');
        VT.store.touch(); VT.app.renderSide();
      }, 'sm')
    ]);
  }

  function describeAction(act) {
    if (act.kind === 'melee') return 'Melee ' + (act.reach || 5) + 'ft · ' + U.sign(act.toHit) + ' · ' + act.dmg + ' ' + (act.dmgType || '');
    if (act.kind === 'ranged') return 'Ranged ' + act.range[0] + '/' + act.range[1] + 'ft · ' + U.sign(act.toHit) + ' · ' + act.dmg + ' ' + (act.dmgType || '');
    if (act.kind === 'save') return 'DC ' + act.dc + ' ' + String(act.save).toUpperCase() +
      (act.aoe ? ' · ' + act.aoe.radius + 'ft radius' : '') + ' · ' + act.dmg + ' ' + (act.dmgType || '');
    if (act.kind === 'heal') return 'Restores ' + act.dmg + ' · range ' + act.range[1] + 'ft';
    if (act.kind === 'buff') return 'Applies ' + act.condition;
    return act.kind;
  }

  /* ==== ROSTER PANEL ==================================================== */
  function renderRoster(container) {
    U.clear(container);
    var c = VT.store.campaign;

    container.appendChild(ui.section('Campaign', c.roster.length + ' entries', [
      ui.row('Name', ui.text(c.name, function (v) { c.name = v; VT.store.touch(); VT.app.renderTitle(); })),
      el('div', { class: 'btnrow' }, [
        ui.btn('Add Hero', addHeroDialog, 'sm primary'),
        ui.btn('Add Monster', addMonsterDialog, 'sm'),
        ui.btn('Blank', function () {
          var a = A.base('New Creature');
          a.spec = VT.spriteart.autoSpec(a.name);
          VT.store.addToRoster(a);
          editActor(a, function () { VT.app.renderSide(); });
        }, 'sm')
      ])
    ]));

    var groups = { party: [], foe: [], neutral: [] };
    c.roster.forEach(function (r) { (groups[r.team] || groups.neutral).push(r); });

    [['party', 'Heroes'], ['foe', 'Adversaries'], ['neutral', 'Neutral']].forEach(function (g) {
      var list = groups[g[0]];
      if (!list.length) return;
      container.appendChild(ui.section(g[1], String(list.length),
        [el('div', { class: 'list' }, list.map(function (r) { return rosterRow(r); }))]));
    });

    if (!c.roster.length) {
      container.appendChild(el('div', { class: 'sec-b muted' }, [
        'Add a few heroes and monsters, then switch to the Map tab and use the Token tool to place them.'
      ]));
    }
  }

  function rosterRow(r) {
    var item = el('div', { class: 'listitem' }, [
      el('div', { class: 't', onClick: function () { editActor(r, function () { VT.app.renderSide(); }); } }, [
        el('div', { class: 'n', style: { color: VT.sprites.TEAM_COLOR[r.team] } }, [r.name]),
        el('div', { class: 's' }, [
          (r.className ? r.className + ' ' + r.level : r.cr ? 'CR ' + r.cr : U.cap(r.size)) +
          ' · AC ' + r.ac + ' · ' + r.hpMax + ' hp'
        ])
      ]),
      ui.btn('Place', function () {
        VT.editor.templateId = r.id;
        VT.editor.team = r.team;
        VT.editor.tool = 'token';
        VT.app.setMode('map');
        ui.logLine('Click the board to place <b>' + U.esc(r.name) + '</b>.');
      }, 'sm', 'Place this creature on the current map'),
      ui.btn('×', function () {
        ui.confirm('Remove ' + U.esc(r.name) + ' from the roster? Tokens already on maps stay.', function () {
          VT.store.removeFromRoster(r.id); VT.app.renderSide();
        }, 'Remove');
      }, 'sm danger')
    ]);
    item.insertBefore(A.portrait(r, 26, 32), item.firstChild);
    return item;
  }

  function addHeroDialog() {
    var key = 'fighter', name = '', level = 3;
    var body = el('div', {}, [
      ui.row('Class', ui.select(Object.keys(SRD.CLASSES).map(function (k) {
        return { value: k, label: SRD.CLASSES[k].name };
      }), key, function (v) { key = v; })),
      ui.row('Name', ui.text('', function (v) { name = v; }, 'leave blank for the class name')),
      ui.row('Level', ui.num(level, 1, 20, function (v) { level = v; })),
      el('p', { class: 'hint' }, ['Creates a level-appropriate statblock you can then edit freely.'])
    ]);
    ui.modal({
      title: 'Add Hero', body: body,
      buttons: [{ label: 'Cancel' }, { label: 'Add', cls: 'primary', onClick: function () {
        var a = A.fromClass(key, name, level);
        VT.store.addToRoster(a);
        VT.app.renderSide();
      } }]
    });
  }

  function addMonsterDialog() {
    var chosen = {};
    var body = el('div', {}, [
      el('p', { class: 'hint', style: { marginTop: 0 } }, ['Pick as many as you like; each becomes a roster entry.']),
      el('div', { class: 'list' }, Object.keys(SRD.MONSTERS).map(function (k) {
        var m = SRD.MONSTERS[k];
        var proto = A.fromMonster(k);
        var item = el('div', { class: 'listitem', onClick: function () {
          chosen[k] = !chosen[k];
          item.className = 'listitem' + (chosen[k] ? ' sel' : '');
        } }, [
          el('div', { class: 't' }, [
            el('div', { class: 'n' }, [m.name]),
            el('div', { class: 's' }, ['CR ' + m.cr + ' · AC ' + m.ac + ' · ' + m.hp + ' hp · ' + m.speed + 'ft'])
          ])
        ]);
        item.insertBefore(A.portrait(proto, 26, 32), item.firstChild);
        return item;
      }))
    ]);
    ui.modal({
      title: 'Bestiary', body: body,
      buttons: [{ label: 'Cancel' }, { label: 'Add selected', cls: 'primary', onClick: function () {
        Object.keys(chosen).forEach(function (k) {
          if (chosen[k]) VT.store.addToRoster(A.fromMonster(k));
        });
        VT.app.renderSide();
      } }]
    });
  }

  /* ==== STATBLOCK EDITOR ================================================ */
  function editActor(a, onDone) {
    var body = el('div', {});

    function refresh() {
      U.clear(body);
      body.appendChild(el('div', { class: 'grid2' }, [
        ui.row('Name', ui.text(a.name, function (v) { a.name = v; })),
        ui.row('Side', ui.select([
          { value: 'party', label: 'Party' }, { value: 'foe', label: 'Enemy' }, { value: 'neutral', label: 'Neutral' }
        ], a.team, function (v) { a.team = v; }))
      ]));
      body.appendChild(el('div', { class: 'grid3' }, [
        ui.row('Size', ui.select(SRD.SIZES, a.size, function (v) { a.size = v; })),
        ui.row('Level', ui.num(a.level, 1, 20, function (v) { a.level = v; })),
        ui.row('Speed', ui.num(a.speed, 0, 120, function (v) { a.speed = v; }, 5))
      ]));
      body.appendChild(el('div', { class: 'grid3' }, [
        ui.row('AC', ui.num(a.ac, 1, 30, function (v) { a.ac = v; })),
        ui.row('Max HP', ui.num(a.hpMax, 1, 999, function (v) { a.hpMax = v; a.hp = Math.min(a.hp, v); })),
        ui.row('HP', ui.num(a.hp, 0, 999, function (v) { a.hp = v; }))
      ]));

      body.appendChild(el('div', { class: 'sec-h', style: { margin: '10px -16px 6px' } }, ['Abilities']));
      body.appendChild(el('div', { class: 'grid3' }, SRD.ABILITIES.map(function (k) {
        return ui.row(SRD.ABILITY_NAME[k], ui.num(a.abilities[k], 1, 30, function (v) { a.abilities[k] = v; }));
      })));
      body.appendChild(ui.row('Save prof.', ui.text((a.saveProf || []).join(', '), function (v) {
        a.saveProf = v.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
      }, 'e.g. dex, wis')));

      body.appendChild(el('div', { class: 'sec-h', style: { margin: '10px -16px 6px' } }, ['Coin']));
      a.coins = a.coins || VT.coin.emptyPurse();
      body.appendChild(el('div', { class: 'grid3' }, VT.coin.denoms().map(function (d) {
        return ui.row(d.key.toUpperCase(), ui.num(a.coins[d.key] || 0, 0, 999999, function (v) {
          a.coins[d.key] = Math.max(0, v | 0);
        }));
      })));
      body.appendChild(el('p', { class: 'hint' }, ['Total: ' + VT.coin.format(a.coins) +
        '  (' + VT.coin.toBase(a.coins) + ' cp)']));

      body.appendChild(el('div', { class: 'sec-h', style: { margin: '10px -16px 6px' } }, ['Damage handling']));
      body.appendChild(el('div', { class: 'grid3' }, [
        ui.row('Resist', ui.text((a.resist || []).join(', '), function (v) { a.resist = splitList(v); })),
        ui.row('Vulnerable', ui.text((a.vulnerable || []).join(', '), function (v) { a.vulnerable = splitList(v); })),
        ui.row('Immune', ui.text((a.immune || []).join(', '), function (v) { a.immune = splitList(v); }))
      ]));

      body.appendChild(el('div', { class: 'sec-h', style: { margin: '10px -16px 6px' } }, ['Actions']));
      (a.actions || []).forEach(function (act, i) {
        body.appendChild(actionEditor(a, act, i, refresh));
      });
      body.appendChild(el('div', { class: 'btnrow' }, [
        ui.btn('+ Melee', function () { a.actions.push(SRD.melee('New Attack', 4, '1d6+2', 'slashing')); refresh(); }, 'sm'),
        ui.btn('+ Ranged', function () { a.actions.push(SRD.ranged('New Shot', 4, '1d6+2', 'piercing', 80, 320)); refresh(); }, 'sm'),
        ui.btn('+ Area', function () { a.actions.push(SRD.saveSpell('New Blast', 'dex', 13, '3d6', 'fire', 15, 60)); refresh(); }, 'sm'),
        ui.btn('+ Heal', function () { a.actions.push(SRD.heal('New Heal', '1d8+3', 30)); refresh(); }, 'sm')
      ]));

      body.appendChild(el('div', { class: 'sec-h', style: { margin: '10px -16px 6px' } }, ['Appearance']));
      body.appendChild(el('div', { class: 'btnrow' }, [
        ui.btn('Choose sprite…', function () { VT.spriteUI.pick(a, refresh); }, 'sm'),
        ui.btn('Randomise look', function () {
          a.spriteId = null;
          a.spec = VT.spriteart.autoSpec(a.name + Math.random(), { kind: (a.spec && a.spec.kind) || 'humanoid' });
          refresh();
        }, 'sm')
      ]));
      body.appendChild(el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginTop: '8px' } }, [
        A.portrait(a, 44, 54),
        el('div', { class: 'grow' }, [
          ui.row('Build', ui.select(VT.spriteart.BUILDS, (a.spec && a.spec.kind) || 'humanoid', function (v) {
            a.spec = Object.assign({}, a.spec || VT.spriteart.autoSpec(a.name), { kind: v });
            refresh();
          })),
          ui.row('Weapon', ui.select(VT.spriteart.WEAPONS, (a.spec && a.spec.weapon) || 'sword', function (v) {
            a.spec = Object.assign({}, a.spec || {}, { weapon: v });
            refresh();
          }))
        ])
      ]));
      body.appendChild(ui.row('Notes', el('textarea', {
        rows: 2, value: a.notes || '',
        onInput: function (e) { a.notes = e.target.value; }
      }), true));
    }
    refresh();

    ui.modal({
      title: 'Statblock', body: body,
      buttons: [{ label: 'Done', cls: 'primary', onClick: function () {
        VT.store.touch();
        if (onDone) onDone();
      } }]
    });
  }

  function splitList(v) {
    return v.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  }

  function actionEditor(a, act, i, refresh) {
    var wrap = el('div', { style: {
      border: '1px solid var(--line)', borderRadius: '4px', padding: '8px', marginBottom: '8px', background: '#16151f'
    } });
    wrap.appendChild(el('div', { class: 'row' }, [
      ui.text(act.name, function (v) { act.name = v; }),
      ui.select([
        { value: 'melee', label: 'Melee' }, { value: 'ranged', label: 'Ranged' },
        { value: 'save', label: 'Area/Save' }, { value: 'heal', label: 'Heal' }, { value: 'buff', label: 'Effect' }
      ], act.kind, function (v) { act.kind = v; refresh(); }),
      ui.btn('×', function () { a.actions.splice(i, 1); refresh(); }, 'sm danger')
    ]));

    if (act.kind === 'melee' || act.kind === 'ranged') {
      wrap.appendChild(el('div', { class: 'grid3' }, [
        ui.row('To hit', ui.num(act.toHit, -5, 20, function (v) { act.toHit = v; })),
        ui.row('Damage', ui.text(act.dmg, function (v) { act.dmg = v; }, '1d8+3')),
        ui.row('Type', ui.select(SRD.DAMAGE_TYPES, act.dmgType || 'slashing', function (v) { act.dmgType = v; }))
      ]));
      if (act.kind === 'melee') {
        wrap.appendChild(ui.row('Reach ft', ui.num(act.reach || 5, 5, 30, function (v) { act.reach = v; }, 5)));
      } else {
        act.range = act.range || [80, 320];
        wrap.appendChild(el('div', { class: 'grid2' }, [
          ui.row('Normal', ui.num(act.range[0], 5, 600, function (v) { act.range[0] = v; }, 5)),
          ui.row('Long', ui.num(act.range[1], 5, 1200, function (v) { act.range[1] = v; }, 5))
        ]));
      }
    } else if (act.kind === 'save') {
      wrap.appendChild(el('div', { class: 'grid3' }, [
        ui.row('Save', ui.select(SRD.ABILITIES, act.save || 'dex', function (v) { act.save = v; })),
        ui.row('DC', ui.num(act.dc || 13, 1, 30, function (v) { act.dc = v; })),
        ui.row('Damage', ui.text(act.dmg, function (v) { act.dmg = v; }, '6d6'))
      ]));
      act.aoe = act.aoe || { radius: 15 };
      act.range = act.range || [60, 60];
      wrap.appendChild(el('div', { class: 'grid3' }, [
        ui.row('Radius', ui.num(act.aoe.radius, 0, 60, function (v) { act.aoe.radius = v; }, 5)),
        ui.row('Range', ui.num(act.range[1], 5, 600, function (v) { act.range = [v, v]; }, 5)),
        ui.row('Type', ui.select(SRD.DAMAGE_TYPES, act.dmgType || 'fire', function (v) { act.dmgType = v; }))
      ]));
    } else if (act.kind === 'heal') {
      act.range = act.range || [30, 30];
      wrap.appendChild(el('div', { class: 'grid2' }, [
        ui.row('Restores', ui.text(act.dmg, function (v) { act.dmg = v; }, '1d8+3')),
        ui.row('Range', ui.num(act.range[1], 0, 300, function (v) { act.range = [v, v]; }, 5))
      ]));
    } else if (act.kind === 'buff') {
      act.range = act.range || [30, 30];
      wrap.appendChild(el('div', { class: 'grid2' }, [
        ui.row('Condition', ui.select(Object.keys(SRD.CONDITIONS), act.condition || 'blessed', function (v) { act.condition = v; })),
        ui.row('Range', ui.num(act.range[1], 0, 300, function (v) { act.range = [v, v]; }, 5))
      ]));
    }

    wrap.appendChild(el('div', { class: 'grid2' }, [
      ui.row('Cost', ui.select([
        { value: 'action', label: 'Action' }, { value: 'bonus', label: 'Bonus action' }, { value: 'reaction', label: 'Reaction' }
      ], act.cost || 'action', function (v) { act.cost = v; })),
      ui.row('Uses', ui.num(act.uses ? act.uses.max : 0, 0, 20, function (v) {
        act.uses = v > 0 ? { max: v, per: 'rest' } : null;
      }))
    ]));
    return wrap;
  }

  VT.sheet = { renderPlay: renderPlay, renderRoster: renderRoster, editActor: editActor, describeAction: describeAction };
})();
