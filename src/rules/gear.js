/* Virtual Tactics :: rules/gear.js
   What a character is wearing, and what that costs them.

   Armour used to be picked once at build time and then only existed as a name
   and an AC number. That made three things impossible: seeing your armour in
   your inventory, taking it off without deleting it, and applying the penalties
   that come with wearing it. All three are the same missing idea - equipment is
   a thing you own that may or may not be worn right now.

   So an inventory entry can carry a `gear` record and an `equipped` flag, and
   everything else is derived from what is equipped. Taking off plate is
   unsetting a boolean; the plate is still in the bag.

   The penalties are the part that was quietly missing. Heavy armour gives
   disadvantage on Stealth, and wearing armour heavier than your Strength can
   support costs you 10 feet of speed - and a monk's Unarmored Movement and a
   barbarian's Fast Movement both stop applying, which is the whole reason those
   features say "unarmoured" in their names. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd;

  /* 5etools types: HA heavy, MA medium, LA light, S shield. */
  var ARMOUR = { HA: 'heavy', MA: 'medium', LA: 'light' };

  function baseType(item) {
    return String((item && item.type) || '').split('|')[0];
  }

  /* Which slot an item occupies, or null if it is not something you wear. */
  /* Armour and shields are exclusive - one each. Weapons and trinkets are not:
     you can hold two weapons and wear several rings, and pretending otherwise
     would be a rule the books do not have. */
  var EXCLUSIVE = { armor: 1, shield: 1 };

  function slotOf(item) {
    var t = baseType(item);
    if (ARMOUR[t]) return 'armor';
    if (t === 'S') return 'shield';
    if (item && (item.weaponCategory || t === 'M' || t === 'R')) return 'weapon';
    /* anything with a mechanical effect is worth being able to put on */
    if (VT.itemfx && VT.itemfx.effectsOf(item)) return 'trinket';
    return null;
  }

  /* The compact record kept on an inventory entry. Deliberately a copy of the
     few fields that matter rather than the whole item: this is saved with the
     character and rides through the symbiote's 500-byte sync budget. */
  function fromItem(item) {
    var slot = slotOf(item);
    if (!slot) return null;
    var g = { slot: slot };
    var t = baseType(item);
    if (slot === 'armor') {
      g.weight = ARMOUR[t];                       /* heavy | medium | light */
      g.ac = item.ac || 10;
      if (item.stealth) g.stealth = true;         /* disadvantage while worn */
      if (item.strength) g.strength = parseInt(item.strength, 10) || 0;
    } else if (slot === 'shield') {
      g.ac = item.ac || 2;
    }
    return g;
  }

  function entries(actor) {
    return (actor && actor.inventory) || [];
  }

  function equippedIn(actor, slot) {
    return entries(actor).filter(function (e) {
      return e.equipped && e.gear && e.gear.slot === slot;
    })[0] || null;
  }

  function armour(actor) { return equippedIn(actor, 'armor'); }
  function shield(actor) { return equippedIn(actor, 'shield'); }

  /* Wearing something takes off whatever was in that slot. You cannot wear two
     breastplates, and a sheet that lets you is worse than one that does not. */
  function equip(actor, entry) {
    if (!entry || !entry.gear) return false;
    if (EXCLUSIVE[entry.gear.slot]) {
      entries(actor).forEach(function (e) {
        if (e !== entry && e.equipped && e.gear && e.gear.slot === entry.gear.slot) {
          e.equipped = false;
        }
      });
    }
    entry.equipped = true;
    recompute(actor);
    return true;
  }

  function unequip(actor, entry) {
    if (!entry) return false;
    entry.equipped = false;
    recompute(actor);
    return true;
  }

  function toggle(actor, entry) {
    return entry.equipped ? unequip(actor, entry) : equip(actor, entry);
  }

  /* ---- what being dressed costs ----------------------------------------- */

  /* Disadvantage on Stealth, from the armour itself. */
  function stealthDisadvantage(actor) {
    var a = armour(actor);
    return !!(a && a.gear && a.gear.stealth);
  }

  /* Armour you are not strong enough for costs 10 feet. Dwarves are famously
     exempt, and say so in their own trait text rather than anywhere central, so
     derive() records it when it reads the race. */
  function speedPenalty(actor) {
    var a = armour(actor);
    if (!a || !a.gear || !a.gear.strength) return 0;
    if (actor.heavyArmorSpeedOk) return 0;
    var str = SRD.mod ? (actor.abilities && actor.abilities.str) || 10 : 10;
    return str < a.gear.strength ? 10 : 0;
  }

  function wearingArmour(actor) { return !!armour(actor); }
  function wearingHeavy(actor) {
    var a = armour(actor);
    return !!(a && a.gear && a.gear.weight === 'heavy');
  }
  function wearingShield(actor) { return !!shield(actor); }

  /* ---- putting the numbers back together -------------------------------- */

  /* Recalculate everything that depends on what is worn. Called after any
     equip or unequip, and by derive() once the inventory exists. */
  function recompute(actor) {
    if (!actor) return actor;

    /* Ability scores first: an item that sets Dexterity changes the armour
       class that is about to be worked out from it, so the order matters. */
    if (VT.itemfx) VT.itemfx.applyAbilities(actor);

    var arm = armour(actor), shd = shield(actor);
    var dex = SRD.mod((actor.abilities && actor.abilities.dex) || 10);

    var ac, why;
    if (arm) {
      var g = arm.gear;
      var base = g.ac || 10;
      if (g.weight === 'heavy') { ac = base; why = arm.name + ' ' + base; }
      else if (g.weight === 'medium') {
        var capped = Math.min(2, dex);
        ac = base + capped;
        why = arm.name + ' ' + base + U.sign(capped) + ' DEX (capped at +2)';
      } else {
        ac = base + dex;
        why = arm.name + ' ' + base + U.sign(dex) + ' DEX';
      }
    } else {
      ac = 10 + dex;
      why = '10' + U.sign(dex) + ' DEX (no armour)';
    }
    if (shd) { ac += (shd.gear.ac || 2); why += ' +' + (shd.gear.ac || 2) + ' shield'; }

    actor.armorName = arm ? arm.name : '';
    actor.armorType = arm ? arm.gear.weight : null;
    actor.shield = !!shd;
    actor.ac = ac;
    actor.acWhy = why;

    /* Features that replace AC or add speed depend on what is worn, so they
       have to be reconsidered every time it changes. apply() carries spent
       resources forward, so re-running it costs nothing but the recalculation. */
    if (VT.features && VT.features.apply) VT.features.apply(actor);

    /* Everything else items do stacks on top of the armour and the features. */
    if (VT.itemfx) VT.itemfx.applyRest(actor);

    /* Race, features and items all grant resistances; this is where the three
       become one list. */
    if (VT.resist) VT.resist.gather(actor);
    return actor;
  }

  /* Put an item into the bag, as gear when it is wearable. */
  function add(actor, item, opts) {
    opts = opts || {};
    actor.inventory = actor.inventory || [];
    var g = fromItem(item);
    var entry = {
      name: item.name,
      qty: opts.qty || 1,
      note: opts.note || '',
      gear: g || undefined,
      equipped: g ? !!opts.equipped : undefined
    };
    if (VT.itemfx) VT.itemfx.tag(entry, item);
    actor.inventory.push(entry);
    if (entry.equipped) equip(actor, entry);
    return entry;
  }

  VT.gear = {
    slotOf: slotOf, fromItem: fromItem, add: add,
    armour: armour, shield: shield,
    equip: equip, unequip: unequip, toggle: toggle,
    recompute: recompute,
    stealthDisadvantage: stealthDisadvantage, speedPenalty: speedPenalty,
    wearingArmour: wearingArmour, wearingHeavy: wearingHeavy, wearingShield: wearingShield
  };
})();
