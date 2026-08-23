/* Virtual Tactics :: data/itemforge.js
   Turning a written description into an item the apps already understand.

   Nothing here invents a new representation. The whole point is to emit a
   record shaped exactly like the ones in the books, because everything
   downstream already reads those:

     gear.fromItem   -> type, ac, stealth, strength     (worn, and what it costs)
     itemfx.effectsOf-> ability.static, bonusAc, resist  (what it does to you)
     convert.weapon  -> dmg1, dmgType, property         (a rollable attack)
     featureText     -> an action out of the prose

   So a forged item is a real item from the first moment, and needs no special
   case in the sheet, the shop or the loot code.

   What it reads is deliberately narrow. Every pattern here is one the books
   themselves use, and anything it cannot place is handed back in `unread` and
   shown to whoever wrote it, rather than being quietly dropped or guessed at. A
   homebrew item that silently loses half its text is worse than one that says
   "I did not understand these two lines". */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd;

  var DMG_CODE = {
    acid: 'A', bludgeoning: 'B', cold: 'C', fire: 'F', force: 'O', lightning: 'L',
    necrotic: 'N', piercing: 'P', poison: 'I', psychic: 'Y', radiant: 'R',
    slashing: 'S', thunder: 'T'
  };

  var ABIL = { strength: 'str', dexterity: 'dex', constitution: 'con',
               intelligence: 'int', wisdom: 'wis', charisma: 'cha' };

  /* Armour kinds, so "light armor" becomes something gear.js can wear. */
  var ARMOUR_KIND = { light: 'LA', medium: 'MA', heavy: 'HA' };

  function firstDie(text) {
    var m = String(text).match(/\b(\d*d\d+)\b/i);
    return m ? (m[1].charAt(0) === 'd' ? '1' + m[1] : m[1]) : null;
  }

  function damageWord(text) {
    var found = null;
    Object.keys(DMG_CODE).forEach(function (t) {
      if (!found && new RegExp(t + '\\s+damage', 'i').test(text)) found = t;
    });
    return found;
  }

  /* ---- the individual readings ------------------------------------------- */
  /* Each returns true when it recognised the line, so the caller can tell what
     was left over. */

  var READERS = [
    /* "+1 bonus to attack and damage rolls" / "a +2 weapon" */
    { name: 'weapon bonus', run: function (line, out) {
        var m = line.match(/\+(\d)\s*(?:bonus)?\s*to attack and damage/i)
             || line.match(/^\s*\+(\d)\s+(?:magic\s+)?weapon\b/i);
        if (!m) return false;
        out.bonusWeapon = '+' + m[1];
        return true;
      } },

    /* "+1 bonus to AC" */
    { name: 'ac bonus', run: function (line, out) {
        var m = line.match(/\+(\d)\s*(?:bonus)?\s*to\s+(?:your\s+)?(?:AC|Armor Class|Armour Class)/i);
        if (!m) return false;
        out.bonusAc = '+' + m[1];
        return true;
      } },

    /* "+1 bonus to saving throws" */
    { name: 'save bonus', run: function (line, out) {
        var m = line.match(/\+(\d)\s*(?:bonus)?\s*to\s+(?:your\s+)?saving throws/i);
        if (!m) return false;
        out.bonusSavingThrow = '+' + m[1];
        return true;
      } },

    /* "+1 bonus to spell attack rolls" and "to your spell save DC" */
    { name: 'spell bonus', run: function (line, out) {
        var a = line.match(/\+(\d)\s*(?:bonus)?\s*to\s+(?:your\s+)?spell attack/i);
        var d = line.match(/\+(\d)\s*(?:bonus)?\s*to\s+(?:your\s+)?spell save DC/i);
        if (!a && !d) return false;
        if (a) out.bonusSpellAttack = '+' + a[1];
        if (d) out.bonusSpellSaveDc = '+' + d[1];
        return true;
      } },

    /* "you have resistance to fire damage" */
    { name: 'resistance', run: function (line, out) {
        if (!/resistance to/i.test(line)) return false;
        var types = (VT.resist ? VT.resist.typesIn(line) : []).filter(Boolean);
        if (!types.length) return false;
        out.resist = (out.resist || []).concat(types.filter(function (t) {
          return (out.resist || []).indexOf(t) < 0;
        }));
        return true;
      } },

    /* "your Strength score becomes 21" / "changes to 21" */
    { name: 'ability score', run: function (line, out) {
        var m = line.match(/\b(strength|dexterity|constitution|intelligence|wisdom|charisma)\b[^.]{0,30}?\b(?:becomes|changes to|is)\s+(\d{1,2})/i);
        if (!m) return false;
        out.ability = out.ability || { static: {} };
        out.ability.static[ABIL[m[1].toLowerCase()]] = parseInt(m[2], 10);
        return true;
      } },

    /* "your walking speed increases by 10 feet" / "your speed is doubled" */
    { name: 'speed', run: function (line, out) {
        var add = line.match(/speed[^.]{0,20}?increases by (\d+)\s*(?:feet|ft)/i);
        var mul = /speed[^.]{0,20}?(?:is )?doubled/i.test(line);
        if (!add && !mul) return false;
        out.modifySpeed = out.modifySpeed || {};
        if (add) {
          out.modifySpeed.bonus = out.modifySpeed.bonus || {};
          out.modifySpeed.bonus.walk = parseInt(add[1], 10);
        }
        if (mul) {
          out.modifySpeed.multiply = out.modifySpeed.multiply || {};
          out.modifySpeed.multiply.walk = 2;
        }
        return true;
      } },

    /* "it has 3 charges" and "regains 1d3 expended charges at dawn" */
    { name: 'charges', run: function (line, out) {
        var m = line.match(/\bhas\s+(\d+)\s+charges/i);
        var r = line.match(/regains?\s+(\d*d?\d+)\s+(?:expended\s+)?charges/i);
        if (!m && !r) return false;
        if (m) out.charges = parseInt(m[1], 10);
        if (r) out.recharge = r[1];
        return true;
      } },

    /* "it deals an extra 2d6 fire damage" - a rider on a weapon hit */
    { name: 'extra damage', run: function (line, out) {
        if (!/\bextra\b/i.test(line)) return false;
        var die = firstDie(line), type = damageWord(line);
        if (!die || !type) return false;
        out.__extraDamage = { die: die, type: type };
        return true;
      } },

    /* base armour: "AC 14 + your Dexterity modifier" or "base AC of 12" */
    { name: 'armour class', run: function (line, out) {
        var m = line.match(/\b(?:AC|Armor Class|Armour Class)\s+(?:of\s+)?(\d{2})\b/i);
        if (!m) return false;
        out.__baseAc = parseInt(m[1], 10);
        return true;
      } },
  ];

  /* ---- the whole thing ---------------------------------------------------- */

  /* opts: { name, kind: 'weapon'|'armor'|'wondrous', attunement, rarity,
             weaponBase, armourWeight, stealth, strength } */
  function forge(text, opts) {
    opts = opts || {};
    var out = {
      name: (opts.name || 'Unnamed item').trim(),
      source: opts.source || 'HB',
      rarity: opts.rarity || 'uncommon',
      __forged: true
    };
    if (opts.attunement) out.reqAttune = true;

    var read = [], unread = [];
    var lines = String(text || '')
      .split(/\r?\n|(?<=\.)\s+(?=[A-Z])/)
      .map(function (l) { return l.trim(); })
      .filter(Boolean);

    lines.forEach(function (line) {
      /* the header lines the template uses are handled by the form, not here */
      if (/^(name|type|rarity|attunement)\s*:/i.test(line)) return;
      var hit = false;
      READERS.forEach(function (r) {
        if (r.run(line, out)) { read.push(r.name + ': ' + line); hit = true; }
      });
      if (!hit) unread.push(line);
    });

    /* ---- shape it as the kind of thing it is ---- */
    if (opts.kind === 'weapon') {
      out.weaponCategory = 'martial';
      out.type = opts.ranged ? 'R' : 'M';
      /* Base damage comes from the form, never from the prose. Scanning the
         text for a die finds the RIDER - "an extra 2d6 fire damage" - and a
         Sunfire Blade would come out as a 2d6 fire weapon that also does 2d6
         fire, which is both wrong and wrong twice. */
      out.dmg1 = opts.baseDmg || (opts.ranged ? '1d6' : '1d8');
      out.dmgType = DMG_CODE[opts.baseDmgType || (opts.ranged ? 'piercing' : 'slashing')] || 'S';
      if (out.__extraDamage) {
        /* The books write a rider as its own line in the entries, and
           convert.weapon reads the base die - so keep them apart rather than
           folding the rider into dmg1 and overstating every swing. */
        out.__riderText = 'Extra ' + out.__extraDamage.die + ' ' +
                          out.__extraDamage.type + ' damage on a hit.';
      }
    } else if (opts.kind === 'armor') {
      out.armor = true;
      out.type = ARMOUR_KIND[opts.armourWeight || 'light'] || 'LA';
      out.ac = out.__baseAc || ({ light: 11, medium: 14, heavy: 16 })[opts.armourWeight || 'light'];
      /* The books state a magic armour's TOTAL - "+1 Plate Armor" carries ac 19,
         not 18 plus a separate bonus - and itemfx deliberately ignores an
         armour's own bonusAc for exactly that reason. Fold it in so a forged
         armour follows the same convention rather than losing the bonus. */
      if (out.bonusAc) {
        out.ac += parseInt(String(out.bonusAc).replace(/[^-\d]/g, ''), 10) || 0;
        delete out.bonusAc;
      }
      if (opts.stealth) out.stealth = true;
      if (opts.strength) out.strength = String(opts.strength);
    } else if (opts.kind === 'shield') {
      out.type = 'S';
      out.ac = 2;
    } else {
      out.type = 'G';                       /* wondrous item, ring, and so on */
    }

    /* Keep the prose. It is what a player actually reads at the table, and the
       readers above only ever cover the mechanical half. */
    out.entries = lines.filter(function (l) {
      return !/^(name|type|rarity|attunement)\s*:/i.test(l);
    });

    /* An action, if the text describes one - the same reader the class features
       use, so "DC 15 Dexterity saving throw, 4d6 fire damage" becomes rollable
       here for the same reason it does there.

       Only the sentence that describes the action is handed over. Given the
       whole description it reads the first die it finds anywhere, which is the
       damage rider several lines earlier, and produces an action that hits for
       the wrong amount. */
    var action = null;
    var actionLine = out.entries.filter(function (l) {
      return /\bas an action\b|\bas a bonus action\b|\bexpend a charge\b|saving throw/i.test(l);
    })[0];
    if (VT.featureText && actionLine) {
      /* A stated DC beats a guessed one. */
      var dcm = actionLine.match(/\bDC\s*(\d+)/i);
      action = VT.featureText.toAction({ name: out.name, entries: [actionLine] },
        { level: 5, prof: 3, abilities: {},
          saveDC: dcm ? parseInt(dcm[1], 10) : (opts.saveDC || 13) });
    }
    if (action) out.__action = action;

    delete out.__extraDamage;
    return { item: out, read: read, unread: unread, action: action };
  }

  /* A description template, offered in the UI so the readers above have the
     shapes they know how to read. */
  var TEMPLATE = [
    'It deals an extra 2d6 fire damage on a hit.',
    'You gain a +1 bonus to attack and damage rolls with this weapon.',
    'You have resistance to fire damage.',
    'Your Strength score becomes 19.',
    'You gain a +1 bonus to AC.',
    'Your walking speed increases by 10 feet.',
    'It has 3 charges and regains 1d3 expended charges at dawn.',
    'As an action, each creature within 15 feet must make a DC 15 Dexterity',
    'saving throw, taking 4d6 fire damage on a failed save.'
  ].join('\n');

  VT.itemforge = { forge: forge, TEMPLATE: TEMPLATE, READERS: READERS };
})();
