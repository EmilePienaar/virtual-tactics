/* The Forge :: homebrew.js
   Author your own races, classes, backgrounds, spells and gear.

   Everything you make is written out in the 5etools schema and merged into the
   compendium, so a homebrew race appears in the character builder's race list
   next to the published ones, a homebrew spell converts into a real attack
   action, and search finds all of it. Saved to localStorage, exportable as one
   JSON file you can hand to your table. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, el = U.el, SRD = VT.srd, CV = VT.convert, HB = VT.homebrew;

  var SCHOOLS = {
    A: 'Abjuration', C: 'Conjuration', D: 'Divination', E: 'Enchantment',
    V: 'Evocation', I: 'Illusion', N: 'Necromancy', T: 'Transmutation'
  };
  var ABILITY_LONG = {
    str: 'strength', dex: 'dexterity', con: 'constitution',
    int: 'intelligence', wis: 'wisdom', cha: 'charisma'
  };
  var ITEM_DMG = { S: 'slashing', P: 'piercing', B: 'bludgeoning' };
  var WEAPON_PROPS = {
    F: 'Finesse', V: 'Versatile', T: 'Thrown', R: 'Reach',
    A: 'Ammunition', L: 'Light', H: 'Heavy', '2H': 'Two-handed'
  };

  var state = { type: 'race', editing: null, model: null };

  /* ---- entries <-> simple trait rows ------------------------------------ */
  function traitsToEntries(traits) {
    return (traits || []).filter(function (t) { return t.name || t.text; })
      .map(function (t) {
        return t.name
          ? { type: 'entries', name: t.name, entries: String(t.text || '').split(/\n{2,}/) }
          : String(t.text || '');
      });
  }
  function entriesToTraits(entries) {
    var out = [];
    (function walk(e) {
      if (e == null) return;
      if (typeof e === 'string') { out.push({ name: '', text: e }); return; }
      if (Array.isArray(e)) { e.forEach(walk); return; }
      if (e.name) out.push({ name: VT.tags.render(e.name, 'text'), text: VT.tags.toText(e.entries || e.entry) });
      else walk(e.entries || e.entry);
    })(entries);
    return out.length ? out : [{ name: '', text: '' }];
  }
  function splitList(v) {
    return String(v || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  }

  /* ---- per-type models -------------------------------------------------- */
  var FORMS = {
    race: {
      label: 'Race', kind: 'race', plural: 'races',
      blank: function () {
        var v = { name: '', source: 'HB', size: 'M', speed: 30, traits: [{ name: '', text: '' }] };
        SRD.ABILITIES.forEach(function (k) { v['ab_' + k] = 0; });
        return v;
      },
      fromRecord: function (r) {
        var v = {
          name: r.name, source: r.source || 'HB',
          size: (Array.isArray(r.size) ? r.size[0] : r.size) || 'M',
          speed: CV.raceSpeed(r), traits: entriesToTraits(r.entries)
        };
        var ab = CV.abilityBonusesFromRace(r);
        SRD.ABILITIES.forEach(function (k) { v['ab_' + k] = ab[k] || 0; });
        return v;
      },
      toRecord: function (v) {
        var r = {
          name: v.name || 'New Race', source: v.source || 'HB',
          size: [v.size || 'M'], speed: Number(v.speed) || 30
        };
        var ab = {};
        SRD.ABILITIES.forEach(function (k) { if (Number(v['ab_' + k])) ab[k] = Number(v['ab_' + k]); });
        if (Object.keys(ab).length) r.ability = [ab];
        r.entries = traitsToEntries(v.traits);
        return r;
      },
      fields: function (v, redraw) {
        return [
          grid3(
            row('Name', text(v.name, function (x) { v.name = x; })),
            row('Source tag', text(v.source, function (x) { v.source = x; }, 'HB')),
            row('Size', select(sizeOpts(), v.size, function (x) { v.size = x; }))
          ),
          row('Speed (ft)', num(v.speed, 0, 200, function (x) { v.speed = x; }, 5)),
          sectionLabel('Ability score bonuses'),
          el('div', { class: 'grid3' }, SRD.ABILITIES.map(function (k) {
            return row(SRD.ABILITY_NAME[k], num(v['ab_' + k], -4, 6, function (x) { v['ab_' + k] = x; }));
          })),
          sectionLabel('Traits'),
          traitsEditor(v.traits, redraw)
        ];
      }
    },

    'class': {
      label: 'Class', kind: 'class', plural: 'classes',
      blank: function () {
        return { name: '', source: 'HB', hitDie: 8, save1: 'con', save2: 'wis',
                 castAbility: '', caster: 'full', traits: [{ name: '', text: '' }] };
      },
      fromRecord: function (r) {
        var p = r.proficiency || [];
        return {
          name: r.name, source: r.source || 'HB',
          hitDie: (r.hd && r.hd.faces) || 8,
          save1: p[0] || '', save2: p[1] || '',
          castAbility: r.spellcastingAbility || '',
          caster: r.casterProgression || 'full',
          traits: entriesToTraits(r.entries)
        };
      },
      toRecord: function (v) {
        var r = {
          name: v.name || 'New Class', source: v.source || 'HB',
          hd: { number: 1, faces: Number(v.hitDie) || 8 },
          proficiency: [v.save1, v.save2].filter(Boolean),
          startingProficiencies: { armor: [], weapons: [], skills: [] },
          entries: traitsToEntries(v.traits)
        };
        if (v.castAbility) {
          r.spellcastingAbility = v.castAbility;
          r.casterProgression = v.caster || 'full';
        }
        return r;
      },
      fields: function (v, redraw) {
        var abOpts = SRD.ABILITIES.map(function (k) { return { value: k, label: SRD.ABILITY_NAME[k] }; });
        return [
          grid3(
            row('Name', text(v.name, function (x) { v.name = x; })),
            row('Source tag', text(v.source, function (x) { v.source = x; }, 'HB')),
            row('Hit die', select([4, 6, 8, 10, 12].map(function (f) { return { value: String(f), label: 'd' + f }; }),
              String(v.hitDie), function (x) { v.hitDie = Number(x); }))
          ),
          grid3(
            row('Save prof. 1', select(abOpts, v.save1, function (x) { v.save1 = x; })),
            row('Save prof. 2', select(abOpts, v.save2, function (x) { v.save2 = x; })),
            row('Casting', select([{ value: '', label: 'Non-caster' }].concat(abOpts),
              v.castAbility, function (x) { v.castAbility = x; redraw(); }))
          ),
          v.castAbility ? row('Progression', select([
            { value: 'full', label: 'Full caster' },
            { value: '1/2', label: 'Half caster' },
            { value: '1/3', label: 'Third caster' },
            { value: 'pact', label: 'Pact magic' }
          ], v.caster, function (x) { v.caster = x; })) : null,
          el('p', { class: 'tiny' }, [
            'Hit die drives HP, the two saves become proficient saving throws, and a casting ability ' +
            'sets your spell save DC and attack bonus in the builder.'
          ]),
          sectionLabel('Features'),
          traitsEditor(v.traits, redraw)
        ];
      }
    },

    background: {
      label: 'Background', kind: 'background', plural: 'backgrounds',
      blank: function () { return { name: '', source: 'HB', skills: '', traits: [{ name: '', text: '' }] }; },
      fromRecord: function (r) {
        var sp = (r.skillProficiencies && r.skillProficiencies[0]) || {};
        return {
          name: r.name, source: r.source || 'HB',
          skills: Object.keys(sp).filter(function (k) { return sp[k] === true; }).join(', '),
          traits: entriesToTraits(r.entries)
        };
      },
      toRecord: function (v) {
        var sp = {};
        splitList(v.skills).forEach(function (s) { sp[s] = true; });
        return {
          name: v.name || 'New Background', source: v.source || 'HB',
          skillProficiencies: Object.keys(sp).length ? [sp] : [],
          entries: traitsToEntries(v.traits)
        };
      },
      fields: function (v, redraw) {
        return [
          grid2(
            row('Name', text(v.name, function (x) { v.name = x; })),
            row('Source tag', text(v.source, function (x) { v.source = x; }, 'HB'))
          ),
          row('Skills', text(v.skills, function (x) { v.skills = x; }, 'survival, nature')),
          el('p', { class: 'tiny' }, ['Comma separated, lower case, e.g. "insight, persuasion".']),
          sectionLabel('Features'),
          traitsEditor(v.traits, redraw)
        ];
      }
    },

    spell: {
      label: 'Spell', kind: 'spell', plural: 'spells',
      blank: function () {
        return {
          name: '', source: 'HB', level: 1, school: 'V', time: 'action',
          rangeType: 'feet', rangeFt: 60, effect: 'attack', attackType: 'R',
          save: 'dex', half: true, aoe: 0, dmg: '2d8', dmgType: 'fire',
          condition: 'blessed', desc: ''
        };
      },
      fromRecord: function (r) {
        var raw = VT.tags.rawOf(r.entries);
        var dmgTag = VT.tags.splitTags(raw).find(function (t) { return t.tag === 'damage' || t.tag === 'dice'; });
        var rt = (r.range && r.range.distance && r.range.distance.type) || 'feet';
        return {
          name: r.name, source: r.source || 'HB',
          level: r.level || 0, school: r.school || 'V',
          time: (r.time && r.time[0] && r.time[0].unit) || 'action',
          rangeType: rt === 'feet' ? 'feet' : rt,
          rangeFt: (r.range && r.range.distance && r.range.distance.amount) || 60,
          effect: (r.savingThrow && r.savingThrow.length) ? 'save'
                : (r.spellAttack && r.spellAttack.length) ? 'attack'
                : /regains? hit points/i.test(raw) ? 'heal' : 'buff',
          attackType: (r.spellAttack && r.spellAttack[0]) || 'R',
          save: r.savingThrow ? (Object.keys(ABILITY_LONG).find(function (k) {
            return ABILITY_LONG[k] === String(r.savingThrow[0]).toLowerCase(); }) || 'dex') : 'dex',
          half: /half as much damage/i.test(raw),
          aoe: (raw.match(/(\d+)[- ]foot[- ](?:radius|sphere|cone)/i) || [0, 0])[1] || 0,
          dmg: dmgTag ? dmgTag.parts[0] : '',
          dmgType: (r.damageInflict && r.damageInflict[0]) || 'fire',
          condition: 'blessed',
          desc: VT.tags.toText(r.entries).slice(0, 600)
        };
      },
      toRecord: function (v) {
        var r = {
          name: v.name || 'New Spell', source: v.source || 'HB',
          level: Number(v.level) || 0, school: v.school || 'V',
          time: [{ number: 1, unit: v.time || 'action' }],
          duration: [{ type: 'instant' }],
          components: { v: true, s: true }
        };
        r.range = v.rangeType === 'self' ? { type: 'point', distance: { type: 'self' } }
          : v.rangeType === 'touch' ? { type: 'point', distance: { type: 'touch' } }
          : { type: 'point', distance: { type: 'feet', amount: Number(v.rangeFt) || 60 } };

        /* Build prose containing the tags the converter reads, so a homebrew
           spell becomes a real action exactly like a published one. */
        var lines = [];
        if (v.desc) lines.push(v.desc);
        var aoeTxt = Number(v.aoe) ? ' in a ' + Number(v.aoe) + '-foot-radius sphere' : '';
        if (v.effect === 'save') {
          r.savingThrow = [ABILITY_LONG[v.save] || 'dexterity'];
          if (v.dmg) r.damageInflict = [v.dmgType];
          if (Number(v.aoe)) r.areaTags = ['S'];
          lines.push('Each creature' + aoeTxt + ' must make a ' +
            U.cap(ABILITY_LONG[v.save] || 'dexterity') + ' saving throw' +
            (v.dmg ? ', taking {@damage ' + v.dmg + '} ' + v.dmgType + ' damage on a failed save' +
              (v.half ? ', or half as much damage on a successful one' : '') : '') + '.');
        } else if (v.effect === 'attack') {
          r.spellAttack = [v.attackType || 'R'];
          if (v.dmg) r.damageInflict = [v.dmgType];
          lines.push('Make a ' + (v.attackType === 'M' ? 'melee' : 'ranged') +
            ' spell attack against the target. On a hit it takes {@damage ' +
            (v.dmg || '1d8') + '} ' + v.dmgType + ' damage.');
        } else if (v.effect === 'heal') {
          lines.push('The target regains hit points equal to {@dice ' + (v.dmg || '1d8') + '}.');
        } else {
          lines.push('The target is {@condition ' + (v.condition || 'blessed') + '} for the duration.');
        }
        r.entries = lines;
        return r;
      },
      fields: function (v, redraw) {
        return [
          grid3(
            row('Name', text(v.name, function (x) { v.name = x; })),
            row('Source tag', text(v.source, function (x) { v.source = x; }, 'HB')),
            row('Level', select([{ value: '0', label: 'Cantrip' }].concat(
              [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return { value: String(n), label: U.ord(n) + ' level' }; })),
              String(v.level), function (x) { v.level = Number(x); }))
          ),
          grid3(
            row('School', select(Object.keys(SCHOOLS).map(function (k) { return { value: k, label: SCHOOLS[k] }; }),
              v.school, function (x) { v.school = x; })),
            row('Cast as', select([
              { value: 'action', label: 'Action' }, { value: 'bonus', label: 'Bonus action' },
              { value: 'reaction', label: 'Reaction' }], v.time, function (x) { v.time = x; })),
            row('Range', select([
              { value: 'feet', label: 'Ranged (ft)' }, { value: 'touch', label: 'Touch' },
              { value: 'self', label: 'Self' }], v.rangeType, function (x) { v.rangeType = x; redraw(); }))
          ),
          v.rangeType === 'feet' ? row('Distance (ft)', num(v.rangeFt, 5, 1000, function (x) { v.rangeFt = x; }, 5)) : null,
          sectionLabel('Effect'),
          row('Type', select([
            { value: 'attack', label: 'Spell attack roll' },
            { value: 'save', label: 'Saving throw' },
            { value: 'heal', label: 'Healing' },
            { value: 'buff', label: 'Applies a condition' }
          ], v.effect, function (x) { v.effect = x; redraw(); })),
          v.effect === 'attack' ? row('Attack', select([
            { value: 'R', label: 'Ranged spell attack' }, { value: 'M', label: 'Melee spell attack' }
          ], v.attackType, function (x) { v.attackType = x; })) : null,
          v.effect === 'save' ? grid3(
            row('Save', select(SRD.ABILITIES.map(function (k) { return { value: k, label: SRD.ABILITY_NAME[k] }; }),
              v.save, function (x) { v.save = x; })),
            row('Radius (ft)', num(v.aoe, 0, 120, function (x) { v.aoe = x; }, 5)),
            row('Half on save', toggleBtn(v.half, function (x) { v.half = x; }))
          ) : null,
          v.effect === 'buff' ? row('Condition', select(
            Object.keys(SRD.CONDITIONS).map(function (k) { return { value: k, label: SRD.CONDITIONS[k].name }; }),
            v.condition, function (x) { v.condition = x; })) : null,
          v.effect !== 'buff' ? grid2(
            row(v.effect === 'heal' ? 'Restores' : 'Damage', text(v.dmg, function (x) { v.dmg = x; }, '6d6')),
            v.effect === 'heal' ? null
              : row('Type', select(SRD.DAMAGE_TYPES.map(function (d) { return { value: d, label: U.cap(d) }; }),
                v.dmgType, function (x) { v.dmgType = x; }))
          ) : null,
          row('Description', el('textarea', {
            rows: 3, value: v.desc || '',
            onInput: function (e) { v.desc = e.target.value; }
          }), true),
          el('p', { class: 'tiny' }, [
            'The mechanical sentence is written for you from the settings above — the description is ' +
            'flavour that appears before it.'
          ])
        ];
      }
    },

    item: {
      label: 'Item', kind: 'item', plural: 'items',
      blank: function () {
        return { name: '', source: 'HB', kind: 'weapon', wtype: 'M', cat: 'martial',
                 dmg1: '1d8', dmg2: '1d10', dmgType: 'S', props: [], range: '80/320', bonus: 0,
                 atype: 'LA', ac: 12 };
      },
      fromRecord: function (r) {
        var isArmour = !!r.armor;
        return {
          name: r.name, source: r.source || 'HB',
          kind: isArmour ? 'armour' : 'weapon',
          wtype: String(r.type || 'M').split('|')[0] === 'R' ? 'R' : 'M',
          cat: r.weaponCategory || 'martial',
          dmg1: r.dmg1 || '1d8', dmg2: r.dmg2 || '1d10', dmgType: r.dmgType || 'S',
          props: (r.property || []).map(function (p) { return typeof p === 'string' ? p : (p.uid || '').split('|')[0]; }),
          range: r.range || '80/320',
          bonus: parseInt(r.bonusWeapon || 0, 10) || 0,
          atype: isArmour ? (String(r.type || 'LA').split('|')[0]) : 'LA',
          ac: r.ac || 12
        };
      },
      toRecord: function (v) {
        if (v.kind === 'armour') {
          return { name: v.name || 'New Armour', source: v.source || 'HB',
                   type: v.atype || 'LA', armor: true, ac: Number(v.ac) || 12 };
        }
        var r = {
          name: v.name || 'New Weapon', source: v.source || 'HB',
          type: v.wtype || 'M', weapon: true, weaponCategory: v.cat || 'martial',
          dmg1: v.dmg1 || '1d6', dmgType: v.dmgType || 'S',
          property: (v.props || []).slice()
        };
        if (r.property.indexOf('V') >= 0) r.dmg2 = v.dmg2 || '1d10';
        if (v.wtype === 'R' || r.property.indexOf('T') >= 0) r.range = v.range || '80/320';
        if (Number(v.bonus)) r.bonusWeapon = '+' + Number(v.bonus);
        return r;
      },
      fields: function (v, redraw) {
        var isArm = v.kind === 'armour';
        return [
          grid3(
            row('Name', text(v.name, function (x) { v.name = x; })),
            row('Source tag', text(v.source, function (x) { v.source = x; }, 'HB')),
            row('Kind', select([
              { value: 'weapon', label: 'Weapon' }, { value: 'armour', label: 'Armour / shield' }
            ], v.kind, function (x) { v.kind = x; redraw(); }))
          ),
          isArm ? grid2(
            row('Type', select([
              { value: 'LA', label: 'Light armour' }, { value: 'MA', label: 'Medium armour' },
              { value: 'HA', label: 'Heavy armour' }, { value: 'S', label: 'Shield' }
            ], v.atype, function (x) { v.atype = x; })),
            row('Base AC', num(v.ac, 1, 25, function (x) { v.ac = x; }))
          ) : null,
          !isArm ? grid3(
            row('Melee/Ranged', select([{ value: 'M', label: 'Melee' }, { value: 'R', label: 'Ranged' }],
              v.wtype, function (x) { v.wtype = x; redraw(); })),
            row('Damage', text(v.dmg1, function (x) { v.dmg1 = x; }, '1d8')),
            row('Type', select(Object.keys(ITEM_DMG).map(function (k) { return { value: k, label: U.cap(ITEM_DMG[k]) }; }),
              v.dmgType, function (x) { v.dmgType = x; }))
          ) : null,
          !isArm ? grid3(
            row('Magic bonus', num(v.bonus, 0, 3, function (x) { v.bonus = x; })),
            (v.props || []).indexOf('V') >= 0
              ? row('Two-handed dmg', text(v.dmg2, function (x) { v.dmg2 = x; }, '1d10')) : null,
            (v.wtype === 'R' || (v.props || []).indexOf('T') >= 0)
              ? row('Range', text(v.range, function (x) { v.range = x; }, '80/320')) : null
          ) : null,
          !isArm ? sectionLabel('Properties') : null,
          !isArm ? el('div', { class: 'kindbar' }, Object.keys(WEAPON_PROPS).map(function (p) {
            return el('button', {
              class: (v.props || []).indexOf(p) >= 0 ? 'on' : '',
              onClick: function () {
                v.props = v.props || [];
                var i = v.props.indexOf(p);
                if (i >= 0) v.props.splice(i, 1); else v.props.push(p);
                redraw();
              }
            }, [WEAPON_PROPS[p]]);
          })) : null
        ];
      }
    }
  };

  /* ---- small widgets ---------------------------------------------------- */
  function row(label, ctrl, wide) {
    if (!ctrl) return null;
    return el('div', { class: 'row' + (wide ? ' wide' : '') }, [el('label', {}, [label]), ctrl]);
  }
  function grid2() { return el('div', { class: 'grid2' }, [].slice.call(arguments)); }
  function grid3() { return el('div', { class: 'grid3' }, [].slice.call(arguments)); }
  function sectionLabel(t) {
    return el('div', { class: 'sec-h', style: { margin: '12px -18px 8px' } }, [t]);
  }
  function text(v, cb, ph) {
    return el('input', { type: 'text', value: v == null ? '' : v, placeholder: ph || '',
      onInput: function (e) { cb(e.target.value); } });
  }
  function num(v, min, max, cb, step) {
    return el('input', { type: 'number', value: v, min: min, max: max, step: step || 1,
      onInput: function (e) { cb(parseFloat(e.target.value) || 0); } });
  }
  function select(opts, v, cb) {
    var s = el('select', { onChange: function (e) { cb(e.target.value); } },
      opts.map(function (o) { return el('option', { value: o.value }, [o.label]); }));
    s.value = v == null ? '' : String(v);
    return s;
  }
  function toggleBtn(v, cb) {
    var b = el('button', { class: 'btn sm' + (v ? ' on' : ''), onClick: function () {
      v = !v; b.className = 'btn sm' + (v ? ' on' : ''); cb(v);
    } }, ['Yes']);
    return b;
  }
  function sizeOpts() {
    return [['T', 'Tiny'], ['S', 'Small'], ['M', 'Medium'], ['L', 'Large'], ['H', 'Huge'], ['G', 'Gargantuan']]
      .map(function (p) { return { value: p[0], label: p[1] }; });
  }

  function traitsEditor(traits, redraw) {
    var wrap = el('div', {});
    traits.forEach(function (t, i) {
      wrap.appendChild(el('div', { class: 'hb-trait' }, [
        el('div', { class: 'row' }, [
          text(t.name, function (x) { t.name = x; }, 'Trait name'),
          el('button', { class: 'btn sm danger', title: 'Remove', onClick: function () {
            traits.splice(i, 1); redraw();
          } }, ['×'])
        ]),
        el('textarea', { rows: 2, value: t.text || '', placeholder: 'What it does…',
          onInput: function (e) { t.text = e.target.value; } })
      ]));
    });
    wrap.appendChild(el('button', { class: 'btn sm', onClick: function () {
      traits.push({ name: '', text: '' }); redraw();
    } }, ['+ Add trait']));
    return wrap;
  }

  /* ---- main render ------------------------------------------------------ */
  function render(host, onChange) {
    U.clear(host);
    var form = FORMS[state.type];

    host.appendChild(el('h2', { class: 'step' }, ['Homebrew']));
    host.appendChild(el('p', { class: 'step-sub' }, [
      'Anything you make here is saved in this browser and merged into the compendium, ' +
      'so it shows up in the builder\'s pickers alongside published content.'
    ]));

    /* type tabs */
    var tabs = el('div', { class: 'kindbar', style: { marginBottom: '14px' } });
    (HB.AUTHORED || HB.TYPES).forEach(function (t) {
      tabs.appendChild(el('button', {
        class: state.type === t ? 'on' : '',
        onClick: function () { state.type = t; state.editing = null; state.model = null; render(host, onChange); }
      }, [FORMS[t].label + ' ' + HB.list(t).length]));
    });
    host.appendChild(tabs);

    /* Imported content that has no authoring form of its own - the subclasses
       and feature records that come with a converted book. There is nothing to
       edit here, but a user who has just imported two hundred records should be
       able to see that they landed. */
    var extra = HB.TYPES.filter(function (t) {
      return (HB.AUTHORED || []).indexOf(t) < 0 && HB.list(t).length;
    });
    if (extra.length) {
      var total = extra.reduce(function (n, t) { return n + HB.list(t).length; }, 0);
      host.appendChild(el('div', { class: 'ok-box' }, [
        'Imported: ' + total + ' further records that have no form of their own — ' +
        extra.map(function (t) { return HB.list(t).length + ' ' + t; }).join(', ') +
        '. They are merged into the compendium and drive the choice tree.'
      ]));
    }

    /* existing entries */
    var list = HB.list(state.type);
    var listPanel = el('div', { class: 'panel' }, [
      el('h3', {}, ['Your ' + form.plural + ' — ' + list.length]),
      list.length ? el('div', { class: 'list' }, list.map(function (r) {
        return el('div', { class: 'listitem' + (state.editing === r.__hbId ? ' sel' : '') }, [
          el('div', { class: 't', onClick: function () { edit(r); render(host, onChange); } }, [
            el('div', { class: 'n' }, [r.name]),
            el('div', { class: 's' }, [summarise(state.type, r)])
          ]),
          el('button', { class: 'btn sm', title: 'Duplicate', onClick: function () {
            var copy = U.clone(r);
            delete copy.__hbId;
            copy.name = r.name + ' (copy)';
            HB.upsert(state.type, copy);
            render(host, onChange); if (onChange) onChange();
          } }, ['⧉']),
          el('button', { class: 'btn sm danger', title: 'Delete', onClick: function () {
            HB.remove(state.type, r.__hbId);
            if (state.editing === r.__hbId) { state.editing = null; state.model = null; }
            render(host, onChange); if (onChange) onChange();
          } }, ['×'])
        ]);
      })) : el('div', { class: 'tiny' }, ['Nothing yet.']),
      el('div', { class: 'btnrow', style: { marginTop: '10px' } }, [
        el('button', { class: 'btn sm primary', onClick: function () {
          state.editing = 'new';
          state.model = form.blank();
          render(host, onChange);
        } }, ['+ New ' + form.label])
      ])
    ]);
    host.appendChild(listPanel);

    /* editor */
    if (state.model) {
      var v = state.model;
      var redraw = function () { render(host, onChange); };
      var body = el('div', { class: 'panel' }, [
        el('h3', {}, [state.editing === 'new' ? 'New ' + form.label : 'Editing “' + (v.name || form.label) + '”'])
      ]);
      form.fields(v, redraw).forEach(function (f) { if (f) body.appendChild(f); });
      body.appendChild(el('div', { class: 'btnrow', style: { marginTop: '14px' } }, [
        el('button', { class: 'btn primary', onClick: function () {
          if (!String(v.name || '').trim()) { flash(body, 'err-box', 'Give it a name first.'); return; }
          var rec = form.toRecord(v);
          if (state.editing && state.editing !== 'new') rec.__hbId = state.editing;
          var saved = HB.upsert(state.type, rec);
          if (!saved) { flash(body, 'err-box', 'Could not save — browser storage may be full.'); return; }
          state.editing = null; state.model = null;
          render(host, onChange);
          if (onChange) onChange();
        } }, ['Save']),
        el('button', { class: 'btn', onClick: function () {
          state.editing = null; state.model = null; render(host, onChange);
        } }, ['Cancel'])
      ]));
      host.appendChild(body);
    }

    /* library management */
    host.appendChild(el('div', { class: 'panel' }, [
      el('h3', {}, ['Library — ' + HB.count() + ' entries']),
      el('div', { class: 'btnrow' }, [
        el('button', { class: 'btn sm', onClick: function () { HB.exportFile(); } }, ['Export JSON']),
        el('button', { class: 'btn sm', onClick: function () {
          var picker = U.$('#jsonPicker');
          picker.value = '';
          picker.onchange = function () {
            var f = picker.files[0]; if (!f) return;
            var fr = new FileReader();
            fr.onload = function () {
              try {
                var n = HB.importJSON(fr.result, true);
                render(host, onChange); if (onChange) onChange();
                flash(host, 'ok-box', 'Imported ' + n + ' entries.');
              } catch (e) {
                flash(host, 'err-box', 'Import failed: ' + U.esc(e.message));
              }
            };
            fr.readAsText(f);
          };
          picker.click();
        } }, ['Import JSON']),
        el('button', { class: 'btn sm danger', onClick: function () {
          if (!HB.count()) return;
          HB.clearAll();
          state.editing = null; state.model = null;
          render(host, onChange); if (onChange) onChange();
        } }, ['Delete all'])
      ]),
      el('p', { class: 'tiny' }, [
        'Exports in the same schema as everything else, so the file also drops straight into a ' +
        '5etools homebrew folder. Import merges rather than replacing.'
      ])
    ]));
  }

  function edit(r) {
    state.editing = r.__hbId;
    state.model = FORMS[state.type].fromRecord(r);
  }

  function summarise(type, r) {
    if (type === 'race') {
      var ab = CV.abilityBonusesFromRace(r);
      var bits = Object.keys(ab).map(function (k) { return SRD.ABILITY_NAME[k] + ' ' + U.sign(ab[k]); });
      return (bits.join(' ') || 'no bonuses') + ' · ' + CV.raceSpeed(r) + 'ft';
    }
    if (type === 'class') {
      return 'd' + ((r.hd && r.hd.faces) || 8) +
        ((r.proficiency || []).length ? ' · saves ' + r.proficiency.join('/').toUpperCase() : '') +
        (r.spellcastingAbility ? ' · caster' : '');
    }
    if (type === 'background') {
      var sp = (r.skillProficiencies && r.skillProficiencies[0]) || {};
      return Object.keys(sp).join(', ') || '—';
    }
    if (type === 'spell') return (r.level ? U.ord(r.level) + ' level' : 'cantrip') + ' · ' + (SCHOOLS[r.school] || '');
    if (type === 'item') return r.armor ? 'AC ' + r.ac : (r.dmg1 || '') + ' ' + (ITEM_DMG[r.dmgType] || '');
    return '';
  }

  function flash(host, cls, msg) {
    var box = el('div', { class: cls, html: msg });
    host.insertBefore(box, host.firstChild);
    setTimeout(function () { box.remove(); }, 4000);
  }

  VT.homebrewUI = { render: render, FORMS: FORMS, state: state };
})();
