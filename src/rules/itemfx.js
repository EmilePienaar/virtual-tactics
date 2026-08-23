/* Virtual Tactics :: rules/itemfx.js
   What a magic item actually does to you.

   Until now an attuned Belt of Hill Giant Strength was a line in a list. It did
   not touch Strength, which is the entire item. Same for a Ring of Protection
   and its +1, a Ring of Fire Resistance and its resistance, Boots of Speed and
   their doubled movement.

   The data carries all of it in structured fields, so this reads rather than
   guesses:

     ability:      { static: { str: 21 } }      74 items
     bonusAc:      "+1"                        267 items
     resist:       ["fire"]                    361 items
     modifySpeed:  { multiply: { walk: 2 } }   121 items
     bonusSavingThrow, conditionImmune, bonusSpellAttack, bonusSpellSaveDc

   When an item counts is the other half of the question. An item that requires
   attunement does nothing until attuned - that is what attunement is for.
   Anything else has to be worn. Carrying a ring in your pack has never made
   anyone tougher. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd;

  function num(v) {
    if (v == null) return 0;
    var n = parseInt(String(v).replace(/[^-\d]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }

  /* The compact record kept on an inventory entry, or null for a mundane item.
     A copy rather than the whole record: this is saved with the character. */
  function effectsOf(item) {
    if (!item) return null;
    var fx = {};
    if (item.ability && item.ability.static) fx.set = U.clone(item.ability.static);
    if (item.bonusAc) fx.ac = num(item.bonusAc);
    if (item.bonusSavingThrow) fx.save = num(item.bonusSavingThrow);
    if (item.bonusSpellAttack) fx.spellAttack = num(item.bonusSpellAttack);
    if (item.bonusSpellSaveDc) fx.spellDc = num(item.bonusSpellSaveDc);
    if (item.resist) fx.resist = [].concat(item.resist).filter(function (x) { return typeof x === 'string'; });
    if (item.conditionImmune) {
      fx.conditionImmune = [].concat(item.conditionImmune)
        .filter(function (x) { return typeof x === 'string'; });
    }
    if (item.modifySpeed && item.modifySpeed.multiply) fx.speedMul = U.clone(item.modifySpeed.multiply);
    if (item.modifySpeed && item.modifySpeed.bonus) fx.speedAdd = U.clone(item.modifySpeed.bonus);
    if (item.reqAttune) fx.needsAttune = true;
    /* A wand is not just a bonus - it casts. 524 items carry the spells they
       cast in a structured field, keyed by what it costs to cast them:
         attachedSpells: { charges: { "1": ["magic missile"] } }
       and 1,157 carry charges. Both are kept so the sheet can offer the spell
       as a real action rather than leaving it buried in the description. */
    if (item.attachedSpells) fx.spells = U.clone(item.attachedSpells);
    if (item.charges) fx.charges = item.charges;
    if (item.recharge) fx.recharge = item.recharge;
    if (item.rechargeAmount) {
      fx.rechargeAmount = String(item.rechargeAmount).replace(/\{@dice\s*([^}]*)\}/i, '$1').trim();
    }
    /* Armour states its total AC already, so its own +1 must not be added on
       top - "+1 Plate Armor" carries ac 19 AND bonusAc "+1", and counting both
       gives 20. */
    if (item.armor && item.ac) fx.acInArmour = true;
    return Object.keys(fx).length ? fx : null;
  }

  /* Is this entry doing anything right now? */
  function live(actor, entry) {
    if (!entry || !entry.fx) return false;
    if (entry.fx.needsAttune) {
      return (actor.attuned || []).some(function (x) {
        return String(x.name).toLowerCase() === String(entry.name).toLowerCase();
      });
    }
    return !!entry.equipped;
  }

  function active(actor) {
    return (actor.inventory || []).filter(function (e) { return live(actor, e); });
  }

  /* ---- applying ---------------------------------------------------------- */

  /* Ability scores an item sets. The books say "your Strength score changes to
     21", and every one of them adds "unless your Strength is already equal to
     or greater" - so it is a floor, not an assignment. */
  function applyAbilities(actor) {
    if (!actor.baseAbilities) actor.baseAbilities = U.clone(actor.abilities || {});
    var out = U.clone(actor.baseAbilities);
    var from = {};
    active(actor).forEach(function (e) {
      var set = e.fx.set;
      if (!set) return;
      Object.keys(set).forEach(function (k) {
        if ((out[k] || 0) < set[k]) { out[k] = set[k]; from[k] = e.name; }
      });
    });
    actor.abilities = out;
    actor.abilityFrom = from;
    return actor;
  }

  /* Everything that is not an ability score. Called after AC has been worked
     out from armour, because these stack on top of it. */
  function applyRest(actor) {
    var acBonus = 0, saveBonus = 0, spellAtk = 0, spellDc = 0;
    var resist = [], condImm = [], notes = [];
    var speedMul = 1, speedAdd = 0;

    active(actor).forEach(function (e) {
      var fx = e.fx;
      /* worn armour already includes its own bonus in its AC */
      if (fx.ac && !(fx.acInArmour && e.gear && e.gear.slot === 'armor')) acBonus += fx.ac;
      if (fx.save) saveBonus += fx.save;
      if (fx.spellAttack) spellAtk += fx.spellAttack;
      if (fx.spellDc) spellDc += fx.spellDc;
      (fx.resist || []).forEach(function (r) { if (resist.indexOf(r) < 0) resist.push(r); });
      (fx.conditionImmune || []).forEach(function (r) { if (condImm.indexOf(r) < 0) condImm.push(r); });
      if (fx.speedMul && fx.speedMul.walk) speedMul *= fx.speedMul.walk;
      if (fx.speedAdd && fx.speedAdd.walk) speedAdd += fx.speedAdd.walk;
      if (fx.ac || fx.save || fx.resist || fx.set || fx.speedMul) notes.push(e.name);
    });

    if (acBonus) {
      actor.ac = (actor.ac || 10) + acBonus;
      actor.acWhy = (actor.acWhy || '') + U.sign(acBonus) + ' from items';
    }
    actor.itemSaveBonus = saveBonus;
    actor.itemSpellAttack = spellAtk;
    actor.itemSpellDc = spellDc;
    /* Kept apart from actor.resist, which resist.js owns - it merges these
        with what the race and the class features grant. Writing straight to
        actor.resist here would erase a tiefling's fire resistance the moment
        they picked up any magic item. */
     actor.itemResist = resist;
     actor.itemConditionImmune = condImm;
     actor.itemNotes = notes;

    if (speedMul !== 1 || speedAdd) {
      actor.speed = Math.round((actor.speed || 30) * speedMul) + speedAdd;
    }
    if (spellAtk && actor.spellAttack != null) actor.spellAttack += spellAtk;
    if (spellDc && actor.spellDC != null) actor.spellDC += spellDc;
    return actor;
  }

  /* The spells an item can cast, as rollable actions.

     Gated the same way every other effect is: an item that requires attunement
     grants nothing until attuned, and anything else has to be held or worn.
     A wand in your pack is not a wand in your hand. */
  function actionsFrom(actor, entry) {
    if (!entry || !entry.fx || !entry.fx.spells) return [];
    if (!live(actor, entry)) return [];
    var FT = VT.fivetools;
    if (!FT || !FT.get) return [];

    var out = [];
    var seen = {};
    Object.keys(entry.fx.spells).forEach(function (how) {
      var byCost = entry.fx.spells[how];
      /* "charges" is an object of cost -> names; the rest are plain arrays. */
      var pairs = Array.isArray(byCost)
        ? [[null, byCost]]
        : Object.keys(byCost).map(function (k) { return [k, byCost[k]]; });

      pairs.forEach(function (pair) {
        var cost = pair[0], names = pair[1] || [];
        names.forEach(function (raw) {
          var name = String(raw).split('|')[0].trim();
          var key = name.toLowerCase();
          if (seen[key]) return;
          seen[key] = 1;
          var rec = (FT.get('spell') || []).find(function (sp) {
            return String(sp.name).toLowerCase() === key;
          });
          if (!rec) return;

          var prof = VT.actor.prof(actor);
          var act = VT.convert.spell(rec, {
            dc: actor.spellDC || (8 + prof + 2),
            atk: actor.spellAttack || (prof + 2),
            mod: 0, prof: prof, level: actor.level || 1
          });
          if (!act) return;
          act = U.clone(act);
          act.fromItem = entry.name;
          act.name = act.name + '  (' + entry.name + ')';
          /* An item's spell is cast from the item, not from your own slots. */
          delete act.spellLevel;
          if (cost) {
            act.chargeCost = parseInt(cost, 10) || 1;
            act.desc = (act.desc ? act.desc + '  ' : '') +
                       act.chargeCost + ' charge' + (act.chargeCost === 1 ? '' : 's') + '.';
          }
          out.push(act);
        });
      });
    });
    return out;
  }

  /* Every action every live item grants. */
  function allActions(actor) {
    var out = [];
    (actor.inventory || []).forEach(function (e) {
      actionsFrom(actor, e).forEach(function (a) { out.push(a); });
    });
    return out;
  }

  /* Tag an inventory entry with its effects, if it has any. */
  function tag(entry, item) {
    var fx = effectsOf(item);
    if (fx) entry.fx = fx;
    return entry;
  }

  /* A plain-English summary, for the sheet to show under the item. */
  function describe(fx) {
    if (!fx) return '';
    var bits = [];
    if (fx.set) {
      Object.keys(fx.set).forEach(function (k) {
        bits.push((SRD.ABILITY_NAME[k] || k.toUpperCase()) + ' becomes ' + fx.set[k]);
      });
    }
    if (fx.ac && !fx.acInArmour) bits.push(U.sign(fx.ac) + ' AC');
    if (fx.save) bits.push(U.sign(fx.save) + ' to saves');
    if (fx.spellAttack) bits.push(U.sign(fx.spellAttack) + ' spell attack');
    if (fx.spellDc) bits.push(U.sign(fx.spellDc) + ' spell DC');
    if (fx.resist && fx.resist.length) bits.push('resist ' + fx.resist.join(', '));
    if (fx.conditionImmune && fx.conditionImmune.length) {
      bits.push('immune to ' + fx.conditionImmune.join(', '));
    }
    if (fx.speedMul && fx.speedMul.walk) bits.push('speed x' + fx.speedMul.walk);
    if (fx.speedAdd && fx.speedAdd.walk) bits.push(U.sign(fx.speedAdd.walk) + ' ft speed');
    if (fx.needsAttune) bits.push('needs attunement');
    return bits.join(' · ');
  }

  VT.itemfx = {
    effectsOf: effectsOf, tag: tag, live: live, active: active,
    actionsFrom: actionsFrom, allActions: allActions,
    applyAbilities: applyAbilities, applyRest: applyRest, describe: describe
  };
})();
