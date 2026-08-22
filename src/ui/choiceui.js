/* Virtual Tactics :: ui/choiceui.js
   The choice tree and the class list, as UI, once.

   The Forge and the Tale Sheet symbiote both need to show "you have three
   maneuvers to pick and here are the 23 you may pick from", and a second
   implementation of that would drift inside a week. So this renders neutral
   markup with its own `ch-` class names, and each app skins it.

   Everything it knows about rules it asks VT.choices and VT.multiclass. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, el = U.el, SRD = VT.srd;

  /* Which groups are open, and what has been typed into each search box. Held
     outside the render so a redraw does not collapse what you were reading. */
  var S = { open: {}, q: {}, allSources: false, adding: false, addQ: '' };

  function low(v) { return String(v == null ? '' : v).toLowerCase(); }
  function FT() { return VT.fivetools; }

  /* ==== the class list, with multiclassing =============================== */
  /* opts: { actor, onLevel(index, level), onAdd(clsRec), onSubclass(index, rec),
             readOnly } */
  function renderClasses(host, opts) {
    var a = opts.actor;
    var classes = (a.classes && a.classes.length)
      ? a.classes
      : [{ name: a.className || 'Class', source: null, level: a.level || 1, subclass: null }];

    var wrap = el('div', { class: 'ch-classes' });
    classes.forEach(function (entry, i) {
      var rec = VT.choices.classRecord(entry);
      var scLv = rec ? VT.choices.subclassLevel(rec) : 3;
      var row = el('div', { class: 'ch-class' });
      row.appendChild(el('div', { class: 'ch-class-main' }, [
        el('span', { class: 'ch-class-nm' }, [entry.name]),
        el('span', { class: 'ch-sub' }, [
          entry.subclass ? entry.subclass.name
            : (entry.level >= scLv ? 'no subclass chosen' : 'subclass at ' + U.ord(scLv)),
          rec ? '  ·  d' + ((rec.hd && rec.hd.faces) || 8) : '',
          rec && rec.casterProgression ? '  ·  ' + casterWord(rec.casterProgression) : ''
        ].filter(Boolean).join(''))
      ]));
      if (!opts.readOnly) {
        row.appendChild(el('div', { class: 'ch-steps' }, [
          el('button', { class: 'btn sm', title: 'One level fewer',
            onClick: function () { opts.onLevel(i, entry.level - 1); } }, ['−']),
          el('span', { class: 'ch-lv' }, [String(entry.level)]),
          el('button', { class: 'btn sm', title: 'One level more',
            onClick: function () { opts.onLevel(i, entry.level + 1); } }, ['+'])
        ]));
      } else {
        row.appendChild(el('span', { class: 'ch-lv' }, [String(entry.level)]));
      }
      wrap.appendChild(row);
    });

    var total = classes.reduce(function (n, c) { return n + (c.level || 0); }, 0);
    wrap.appendChild(el('div', { class: 'ch-total' }, [
      'Character level ' + total + '  ·  proficiency ' + U.sign(SRD.profBonus(U.clamp(total, 1, 20))) +
      (classes.length > 1 ? '  ·  ' + castingLine(a) : '')
    ]));

    if (!opts.readOnly) wrap.appendChild(addClassBlock(a, classes, total, opts));
    host.appendChild(wrap);
  }

  function casterWord(p) {
    return p === 'full' ? 'full caster' : p === 'pact' ? 'pact magic'
      : p === 'artificer' ? 'half caster (rounds up)'
      : p === '1/2' ? 'half caster' : p === '1/3' ? 'third caster' : p;
  }

  function castingLine(a) {
    var bits = [];
    if (a.casterLevel) bits.push('caster level ' + a.casterLevel);
    if (a.pactSlots) bits.push('pact ' + a.pactSlots.count + '×' + U.ord(a.pactSlots.slotLevel));
    return bits.join(', ') || 'no spellcasting';
  }

  function addClassBlock(a, classes, total, opts) {
    var box = el('div', { class: 'ch-add' });
    if (total >= 20) {
      box.appendChild(el('div', { class: 'ch-note' }, ['At 20th level — no more class levels to take.']));
      return box;
    }
    if (!FT().loaded) {
      box.appendChild(el('div', { class: 'ch-note' }, ['Connect a data source to add a class.']));
      return box;
    }
    if (!S.adding) {
      box.appendChild(el('button', { class: 'btn sm', onClick: function () {
        S.adding = true; opts.onChange && opts.onChange();
      } }, ['+ Multiclass…']));
      return box;
    }

    box.appendChild(el('div', { class: 'ch-note' }, [
      'Taking a level in a new class. You keep the hit points, proficiencies and ' +
      'features you already have; the new class adds its own. Saving-throw ' +
      'proficiencies are not granted by a multiclass.' +
      (opts.enforce === false
        ? ' Your ability scores are not set yet, so the requirements below are ' +
          'shown but not enforced — check them once you have rolled.'
        : '')
    ]));

    /* Only offer classes from the same printing as the one they started in -
       mixing a 2014 and a 2024 class gives a character two incompatible
       feature trees for the same twenty levels. */
    var first = classes[0];
    var firstRec = VT.choices.classRecord(first);
    var wantSource = firstRec ? low(firstRec.source) : '';

    var list = el('div', { class: 'ch-list' });
    FT().get('class').filter(function (c) {
      if (wantSource && low(c.source) !== wantSource) return false;
      return true;
    }).sort(function (x, y) { return x.name < y.name ? -1 : 1; }).forEach(function (rec) {
      /* 5e checks BOTH ends: you must qualify for the class you are leaving as
         well as the one you are joining. */
      var reason = VT.multiclass.requirementReason(rec, a.abilities);
      if (!reason) {
        for (var ci = 0; ci < classes.length && !reason; ci++) {
          var haveRec = VT.choices.classRecord(classes[ci]);
          if (!haveRec || low(haveRec.name) === low(rec.name)) continue;
          var r2 = VT.multiclass.requirementReason(haveRec, a.abilities);
          if (r2) reason = classes[ci].name + ' ' + r2 + ' to multiclass out';
        }
      }
      var already = classes.filter(function (e) { return low(e.name) === low(rec.name); })[0];
      /* During character CREATION the abilities have not been assigned yet -
         the wizard asks for a class before it asks for scores - so every class
         would fail its requirement and the whole list would be dead. There,
         the requirement is shown but not enforced, and the Review step says if
         one is still unmet. Where the scores are known, it blocks. */
      var blocked = !!reason && opts.enforce !== false;
      var row = el('div', {
        class: 'ch-opt' + (blocked ? ' ch-no' : (reason ? ' ch-caution' : '')),
        onClick: function () {
          if (blocked) return;
          S.adding = false;
          opts.onAdd(rec);
        } }, [
        el('span', { class: 'ch-opt-nm' }, [rec.name,
          already ? el('span', { class: 'ch-sub' }, ['  already ' + already.level]) : null]),
        el('span', { class: 'ch-sub' }, [
          reason ? reason : 'd' + ((rec.hd && rec.hd.faces) || 8) +
            (rec.casterProgression ? ' · ' + casterWord(rec.casterProgression) : '')
        ])
      ]);
      list.appendChild(row);
    });
    box.appendChild(list);
    box.appendChild(el('button', { class: 'btn sm', onClick: function () {
      S.adding = false; opts.onChange && opts.onChange();
    } }, ['Cancel']));
    return box;
  }

  /* ==== the choice tree ================================================== */
  /* opts: { actor, build, onChange, max } - build must be the actor's own
     build object so picks are written where a re-derive will read them. */
  function render(host, opts) {
    var a = opts.actor, build = opts.build;
    if (!build) {
      host.appendChild(el('div', { class: 'ch-note' }, [
        'This character has no build data, so there is nothing to choose from. ' +
        'Characters made in the Character tab carry their choices with them.'
      ]));
      return;
    }
    if (!FT().loaded) {
      host.appendChild(el('div', { class: 'ch-note' }, [
        'Connect your 5etools data to see fighting styles, invocations, metamagic, ' +
        'maneuvers, feats and spell lists.'
      ]));
      return;
    }

    var list = VT.choices.pending(build);
    if (!list.length) {
      host.appendChild(el('div', { class: 'ch-note' }, [
        'Nothing to choose yet — this class makes its first choice at a higher level.'
      ]));
      return;
    }

    var sum = VT.choices.summary(build);
    host.appendChild(el('div', { class: 'ch-head' }, [
      el('span', {}, [sum.unspent
        ? sum.unspent + ' still to choose'
        : 'Everything chosen.']),
      el('label', { class: 'ch-srcs' }, [
        el('input', { type: 'checkbox', checked: S.allSources,
          onChange: function (e) { S.allSources = e.target.checked; opts.onChange(); } }),
        ' every book'
      ])
    ]));

    list.forEach(function (ch) {
      host.appendChild(choiceCard(ch, a, build, opts));
    });
  }

  function choiceCard(ch, a, build, opts) {
    var done = (ch.picked || []).length;
    var short = done < ch.count;
    var card = el('div', { class: 'ch-group' + (short ? ' ch-short' : '') });

    var open = !!S.open[ch.key];
    card.appendChild(el('div', { class: 'ch-group-h', onClick: function () {
      S.open[ch.key] = !open; opts.onChange();
    } }, [
      el('span', { class: 'ch-group-nm' }, [
        ch.label,
        el('span', { class: 'ch-sub' }, ['  ' + (ch.entry ? ch.entry.name : '') +
          (ch.level > 1 ? ' · ' + U.ord(ch.level) + ' level' : '')])
      ]),
      el('span', { class: 'ch-count' + (short ? ' ch-warn' : '') }, [done + ' / ' + ch.count]),
      el('span', { class: 'ch-caret' }, [open ? '▾' : '▸'])
    ]));

    /* what has been picked */
    if (done) {
      var chosen = el('div', { class: 'ch-chosen' });
      (ch.picked || []).forEach(function (p) {
        var name = typeof p === 'string' ? U.cap(p) : p.name;
        chosen.appendChild(el('span', { class: 'ch-pill' }, [
          name,
          abilTag(p),
          el('button', { class: 'ch-x', title: 'Remove', onClick: function (e) {
            e.stopPropagation();
            VT.choices.unpick(build, ch, typeof p === 'string' ? { __skill: p } : p);
            opts.onChange();
          } }, ['×'])
        ]));
      });
      card.appendChild(chosen);
    }

    if (!open) return card;

    /* the options */
    var opts2 = VT.choices.optionsFor(ch, { allSources: S.allSources });
    /* Say so when a setting has taken spells off this class's list, rather
       than leaving the player to wonder where Flame Strike went. */
    if ((ch.kind === 'spell' || ch.kind === 'cantrip') && ch.listFrom && FT().spellListChanges) {
      var changes = FT().spellListChanges(ch.listFrom.name);
      var lost = changes.reduce(function (n, c) { return n + (c.removed || []).length; }, 0);
      if (lost) {
        card.appendChild(el('div', { class: 'ch-note' }, [
          lost + ' spell' + (lost === 1 ? '' : 's') + ' removed from the ' +
          ch.listFrom.name + ' list by ' + changes[0].source + '.'
        ]));
      }
    }
    var q = low(S.q[ch.key] || '');
    if (opts2.length > 12) {
      card.appendChild(el('div', { class: 'ch-search' }, [
        el('input', { type: 'text', placeholder: 'Search ' + opts2.length + ' options',
          value: S.q[ch.key] || '',
          onInput: function (e) { S.q[ch.key] = e.target.value; opts.onChange(); } })
      ]));
    }
    var shown = opts2.filter(function (o) { return !q || low(o.name).indexOf(q) >= 0; });
    var full = done >= ch.count;

    var box = el('div', { class: 'ch-list' });
    shown.slice(0, 300).forEach(function (o) {
      var already = isPicked(ch, o);
      var reason = ch.kind === 'skill' ? '' : VT.choices.prereqReason(o, a, build, ch);
      var blocked = (full && !already) || (!!reason && !already);
      var row = el('div', { class: 'ch-opt' + (already ? ' ch-on' : '') + (blocked ? ' ch-no' : ''),
        onClick: function () {
          if (already) { VT.choices.unpick(build, ch, o); opts.onChange(); return; }
          if (blocked) return;
          VT.choices.pick(build, ch, o);
          opts.onChange();
        } }, [
        el('span', { class: 'ch-opt-nm' }, [o.name]),
        el('span', { class: 'ch-sub' }, [subtitleFor(ch, o, reason)])
      ]);
      box.appendChild(row);
    });
    if (!shown.length) box.appendChild(el('div', { class: 'ch-note' }, ['Nothing matches.']));
    if (shown.length > 300) {
      box.appendChild(el('div', { class: 'ch-note' }, [
        shown.length - 300 + ' more — narrow the search to see them.']));
    }
    card.appendChild(box);

    /* a feat that raises a score has to be told which one */
    (ch.picked || []).forEach(function (p) {
      if (ch.kind !== 'feat' || typeof p === 'string') return;
      var rec = VT.choiceFx.findFeat(p);
      var need = rec && VT.choiceFx.abilityNeed(rec);
      if (!need) return;
      card.appendChild(abilityPicker(p, need, opts));
    });

    /* the printed text of whatever is highlighted */
    if (full && ch.picked.length) {
      var txt = VT.choiceFx.textFor({
        name: ch.picked[ch.picked.length - 1].name,
        source: ch.picked[ch.picked.length - 1].source, kind: ch.kind
      });
      if (txt) card.appendChild(el('div', { class: 'ch-text' }, [txt.slice(0, 900)]));
    }
    return card;
  }

  function abilTag(p) {
    if (!p || !p.abil) return null;
    var bits = Object.keys(p.abil).map(function (k) {
      return SRD.ABILITY_NAME[k] + ' ' + U.sign(p.abil[k]);
    });
    return bits.length ? el('span', { class: 'ch-sub' }, ['  ' + bits.join(', ')]) : null;
  }

  function abilityPicker(pick, need, opts) {
    var box = el('div', { class: 'ch-abil' });
    box.appendChild(el('div', { class: 'ch-note' }, [
      pick.name + ': raise ' + (need.count > 1 ? need.count + ' abilities' : 'one ability') +
      ' by ' + need.amount + (need.max > 20 ? ' (up to ' + need.max + ')' : '')
    ]));
    need.from.forEach(function (k) {
      var on = !!(pick.abil && pick.abil[k]);
      box.appendChild(el('button', {
        class: 'btn sm' + (on ? ' on' : ''),
        onClick: function () {
          pick.abil = pick.abil || {};
          if (on) delete pick.abil[k];
          else {
            var used = Object.keys(pick.abil).length;
            if (used >= need.count) return;
            pick.abil[k] = need.amount;
          }
          opts.onChange();
        }
      }, [SRD.ABILITY_NAME[k]]));
    });
    return box;
  }

  function isPicked(ch, o) {
    var val = ch.kind === 'skill' ? o.__skill : o;
    return (ch.picked || []).some(function (p) {
      if (typeof p === 'string') return low(p) === low(val);
      return low(p.name) === low(o.name) &&
        (!o.source || !p.source || low(p.source) === low(o.source));
    });
  }

  function subtitleFor(ch, o, reason) {
    if (reason) return reason;
    if (ch.kind === 'skill') return SRD.ABILITY_NAME[SRD.SKILL_ABILITY[o.__skill]] || '';
    var bits = [];
    if (ch.kind === 'cantrip' || ch.kind === 'spell') {
      bits.push(o.level ? U.ord(o.level) + ' level' : 'cantrip');
      if (o.school) bits.push(schoolName(o.school));
    }
    if (o.source) bits.push(o.source);
    return bits.join(' · ');
  }

  var SCHOOLS = { A: 'abjuration', C: 'conjuration', D: 'divination', E: 'enchantment',
                  V: 'evocation', I: 'illusion', N: 'necromancy', T: 'transmutation' };
  function schoolName(s) { return SCHOOLS[s] || s; }

  /* ==== what a character has already chosen, for the sheet =============== */
  function renderPicked(host, actor, opts) {
    var picked = actor.picked || [];
    if (!picked.length) return false;
    var byLabel = {};
    picked.forEach(function (p) { (byLabel[p.label] = byLabel[p.label] || []).push(p); });
    Object.keys(byLabel).forEach(function (label) {
      host.appendChild(el('div', { class: 'ch-picked-h' }, [label]));
      byLabel[label].forEach(function (p) {
        var open = !!S.open['pk:' + p.name];
        var body = el('div', { class: 'ch-text' + (open ? '' : ' hidden') });
        if (open) body.textContent = VT.choiceFx.textFor(p) || 'Text unavailable.';
        host.appendChild(el('div', { class: 'ch-opt', onClick: function () {
          S.open['pk:' + p.name] = !open;
          opts && opts.onChange && opts.onChange();
        } }, [
          el('span', { class: 'ch-opt-nm' }, [p.name, abilTag(p)]),
          el('span', { class: 'ch-sub' }, [p.note || (p.applied ? 'applied' : (p.source || ''))])
        ]));
        host.appendChild(body);
      });
    });
    return true;
  }

  VT.choiceUI = {
    render: render, renderClasses: renderClasses, renderPicked: renderPicked,
    state: S, reset: function () { S.open = {}; S.q = {}; S.adding = false; }
  };
})();
