/* Virtual Tactics :: data/featuretext.js
   Reading rollable actions out of the printed text of a class feature.

   features.js is a curated table: hand-written mechanics for the features worth
   the effort. It says, correctly, that no amount of parsing will reliably turn
   English into arbitrary game effects - you cannot read "you gain expertise in
   two skills of your choice" out of prose and be sure of it.

   But two shapes are not arbitrary. Attacks and saving-throw effects are
   written to a house style that barely varies across twenty years of books:

     "a ranged spell attack with a range of 30 feet ... you add your Dexterity
      modifier to its attack and damage rolls ... its damage is radiant, and
      its damage die is a d4"

     "each creature in that area must make a Dexterity saving throw, taking
      3d6 fire damage on a failed save"

   Everything needed for a clickable action is stated outright: what kind of
   attack, the range, which ability, the die, the damage type. So this reads
   those two shapes and nothing else.

   The rule it works to is: produce an action only when every part was found in
   the text, and otherwise produce nothing. A missing action is a feature you
   read and apply yourself, which is where you already were. A wrong one is a
   character sheet that lies to you, which is worse than useless - so every
   extraction here is all-or-nothing, and anything it emits is tagged `derived`
   so the sheet can say where it came from. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd;

  var ABILITY_WORD = {
    strength: 'str', dexterity: 'dex', constitution: 'con',
    intelligence: 'int', wisdom: 'wis', charisma: 'cha'
  };

  var DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning',
    'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];

  /* Feature entries nest: strings, {entries:[...]}, lists, tables. Flatten to
     one string, keeping the inline tags intact - the damage tags are the most
     reliable thing in the whole record and must survive. */
  function flatten(node, out) {
    out = out || [];
    if (node == null) return out;
    if (typeof node === 'string') { out.push(node); return out; }
    if (Array.isArray(node)) { node.forEach(function (n) { flatten(n, out); }); return out; }
    if (typeof node === 'object') {
      if (node.name) out.push(node.name);
      flatten(node.entries || node.items || node.rows || [], out);
    }
    return out;
  }

  function textOf(feature) {
    return flatten(feature && feature.entries).join(' ').replace(/\s+/g, ' ');
  }

  /* "{@damage 2d6}" / "{@dice d4}" / a bare "3d8".

     The first usable die wins - the first damage a feature mentions is the
     damage it deals, and later ones are nearly always an upgrade table or a
     secondary rider. "Usable" is doing real work there: a d20 is skipped and
     the scan continues, because a feature that rolls 1d20 on a table and then
     deals 2d6 must not come out as a 1d20 attack. */
  function firstDie(text) {
    var tag = text.match(/\{@(?:damage|dice|scaledamage|scaledice)\s+([^}|]+)/i);
    if (tag) {
      var inner = tag[1].trim();
      var m = inner.match(/\d*d\d+(?:\s*[+-]\s*\d+)?/i);
      if (m) { var tagged = normaliseDie(m[0]); if (tagged) return tagged; }
    }
    var all = text.match(/\b\d*d\d+\b/gi) || [];
    for (var i = 0; i < all.length; i++) {
      var d = normaliseDie(all[i]);
      if (d) return d;
    }
    return null;
  }

  function normaliseDie(d) {
    d = String(d).replace(/\s+/g, '');
    d = /^d/i.test(d) ? '1' + d : d;         /* "d4" is one d4 */
    /* A d20 or d100 is a table roll, never damage. "Tales from Beyond" rolls
       1d20 to pick which effect you get, and reading that as damage produces a
       weapon that hits for 1d20 fire - confidently, and completely wrong. */
    var faces = parseInt((d.match(/d(\d+)/i) || [])[1], 10);
    if (faces === 20 || faces === 100) return null;
    return d;
  }

  /* Which damage type this feature deals, or null when the text does not make
     that unambiguous.

     The trap is that damage words appear in text for reasons other than the
     damage being dealt - "resistance to bludgeoning, piercing, and slashing"
     is the common one, and picking the first word out of that list invents an
     attack that deals slashing damage. So the evidence is ranked, and a list
     of several types is treated as no answer at all rather than a menu to
     choose from. */
  function damageType(text) {
    /* strongest: the feature says outright what its damage is */
    var m = text.match(/damage(?:\s+type)?\s+is\s+([a-z]+)/i);
    if (m && DAMAGE_TYPES.indexOf(m[1].toLowerCase()) >= 0) return m[1].toLowerCase();

    /* strong: the type sits directly against a die - "takes 3d6 fire damage" */
    m = text.match(/\b\d*d\d+\s+([a-z]+)\s+damage\b/i);
    if (m && DAMAGE_TYPES.indexOf(m[1].toLowerCase()) >= 0) return m[1].toLowerCase();

    /* weakest: "<type> damage" somewhere in the prose.

       Two separate traps, needing two separate rules.

       The word must be the noun, not the verb: "you can force it to make a
       Wisdom saving throw" is not force damage. So the match requires "damage"
       right after it.

       But adjacency alone is not enough either, because a list ends with one:
       "Bludgeoning, Piercing, or Slashing damage" satisfies it exactly once,
       for Slashing, and turns a damage-reduction reaction into a slashing
       attack. So the abstain check counts the type words themselves, wherever
       they appear - more than one distinct type anywhere means the text is
       listing or offering a choice, and there is no way to tell from here
       which one this feature actually deals. */
    var named = DAMAGE_TYPES.filter(function (t) {
      return new RegExp('\\b' + t + '\\b', 'i').test(text);
    });
    if (named.length !== 1) return null;

    var t0 = named[0];
    return new RegExp('\\b' + t0 + '\\s+damage\\b', 'i').test(text) ? t0 : null;
  }

  /* Which ability feeds the roll. Both phrasings are common and mean the same
     thing - "you add your Dexterity modifier to its attack and damage rolls",
     and "radiant damage equal to 1d8 + your Wisdom modifier". */
  function statedAbility(text) {
    var m = text.match(/add your ([A-Za-z]+) modifier/i)
         || text.match(/\+\s*your ([A-Za-z]+) modifier/i);
    if (m && ABILITY_WORD[m[1].toLowerCase()]) return ABILITY_WORD[m[1].toLowerCase()];
    return null;
  }

  /* How far it reaches. "a range of 30 feet" is the formal phrasing; "targets
     one creature within 60 feet of you" is the one the books actually use most
     of the time, and missing it was silently costing every feature written that
     way - the Circle of the Stars Archer among them. */
  function statedRange(text) {
    var m = text.match(/range of (\d+)\s*(?:feet|ft)/i)
         || text.match(/within (\d+)\s*(?:feet|ft)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function statedReach(text) {
    var m = text.match(/reach of (\d+)\s*(?:feet|ft)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  /* Some features say their die follows a class table rather than printing it.
     Only the Martial Arts column is common enough to be worth resolving, and
     features.js already owns that progression. */
  function tableDie(text, ctx) {
    if (/Martial Arts (?:column|die|table)/i.test(text) && VT.features && VT.features.martialArtsDie) {
      return VT.features.martialArtsDie(ctx.level || 1);
    }
    return null;
  }

  /* ---- the two shapes ---------------------------------------------------- */

  function asAttack(feature, ctx, text) {
    var atk = text.match(/\b(ranged|melee)\s+(spell\s+)?attack\b/i);
    if (!atk) return null;

    var die = tableDie(text, ctx) || firstDie(text);
    if (!die) return null;

    var type = damageType(text);
    if (!type) return null;

    var ability = statedAbility(text) || ctx.castAbility || 'dex';
    var abilityMod = SRD.mod((ctx.abilities || {})[ability] || 10);
    var ranged = /ranged/i.test(atk[1]);
    var reach = statedReach(text);
    var range = statedRange(text);
    if (ranged && !range) return null;              /* a ranged attack needs a range */

    var act = {
      name: feature.name,
      kind: ranged ? 'ranged' : 'melee',
      toHit: (ctx.prof || 2) + abilityMod,
      dmg: die + (abilityMod ? U.sign(abilityMod) : ''),
      dmgType: type,
      cost: 'action',
      fromFeature: true,
      derived: true,
      desc: 'Read from the feature text: ' + (ranged ? range + ' ft range' : (reach || 5) + ' ft reach') +
            ', ' + ability.toUpperCase() + ' to hit and damage.'
    };
    if (ranged) act.range = [range, range];
    else act.reach = reach || 5;
    return act;
  }

  function asSave(feature, ctx, text) {
    var sv = text.match(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw\b/i);
    if (!sv) return null;

    var die = tableDie(text, ctx) || firstDie(text);
    if (!die) return null;

    var type = damageType(text);
    if (!type) return null;

    /* Where the DC comes from, in the order the text itself settles it.

       Most features say "against your spell save DC" outright. A few name a
       class DC instead - the monk's Ki save DC - and some, like Searing
       Sunburst, name none at all because the class table already did. So a
       class DC is accepted as the fallback where the rules define one, and
       anything left over is refused: a wrong DC is worse than no action. */
    var dc = /spell save DC/i.test(text) ? (ctx.saveDC || ctx.classDC)
           : (ctx.classDC || ctx.saveDC);
    if (!dc) return null;

    return {
      name: feature.name,
      kind: 'save',
      save: ABILITY_WORD[sv[1].toLowerCase()],
      dc: dc,
      dmg: die,
      dmgType: type,
      half: /half as much damage|half damage/i.test(text),
      range: [0, statedRange(text) || 30],
      cost: 'action',
      fromFeature: true,
      derived: true,
      desc: 'Read from the feature text: ' + sv[1] + ' save against DC ' + dc +
            (/half as much damage|half damage/i.test(text) ? ', half on a success.' : '.')
    };
  }

  /* Healing. Narrower than the other two on purpose: the die has to sit
     directly against the words that spend it, because "hit points" appears in
     half the features in the game and a feature that merely mentions them is
     not a heal. */
  function asHeal(feature, ctx, text) {
    var m = text.match(/(?:regains?|restores?)\s+(?:a number of\s+)?(?:hit points|Hit Points)[^.]{0,30}?equal to[^.]{0,20}?(\d*d\d+)/i);
    if (!m) return null;
    var die = normaliseDie(m[1]);
    if (!die) return null;

    var ability = statedAbility(text);
    var abilityMod = ability ? SRD.mod((ctx.abilities || {})[ability] || 10) : 0;

    return {
      name: feature.name,
      kind: 'heal',
      dmg: die + (abilityMod ? U.sign(abilityMod) : ''),
      range: [0, statedRange(text) || 0],
      cost: 'action',
      fromFeature: true,
      derived: true,
      desc: 'Read from the feature text: restores ' + die +
            (ability ? ' + ' + ability.toUpperCase() : '') + ' hit points.'
    };
  }

  /* One feature in, zero or one action out. */
  /* A die that feeds temporary hit points, healing, or a table roll is not
     damage. When the only die in the text is spoken for like that, there is
     nothing to build an attack out of. */
  function dieIsNotDamage(text, die) {
    if (!die) return true;
    var faces = die.replace(/^\d+/, '');
    var pattern = '\\b\\d*' + faces + '\\b[^.]{0,40}?(temporary hit points|hit points back|regains?)';
    if (new RegExp(pattern, 'i').test(text)) return true;
    return false;
  }

  /* Some records are containers: "Psionic Disciplines" is every discipline in
     the book under one name, "Eldritch Invocations" likewise. Reading a single
     attack out of a list of thirty abilities picks an arbitrary one and labels
     it with the container's name, which is worse than saying nothing. Length is
     a crude signal but a reliable one - a single feature that grants an attack
     is a paragraph, not a chapter. */
  var CONTAINER_CHARS = 1500;

  function toAction(feature, ctx) {
    if (!feature || !feature.name) return null;
    var text = textOf(feature);
    if (!text) return null;
    if (text.length > CONTAINER_CHARS) return null;
    ctx = ctx || {};
    var act = asAttack(feature, ctx, text) || asSave(feature, ctx, text) ||
              asHeal(feature, ctx, text);
    if (!act) return null;
    if (dieIsNotDamage(text, (act.dmg || '').match(/\d*d\d+/) && (act.dmg.match(/\d*d\d+/) || [])[0])) {
      return null;
    }
    return act;
  }

  /* Later features that improve earlier ones.

     "The {@damage 1d8} of the Archer and the Chalice becomes {@damage 2d8}" is
     a whole sentence naming the features it upgrades, the die it replaces and
     the die it replaces it with. That is enough to apply without guessing, and
     without it a 10th-level Stars druid is shown 1d8 for an attack that has
     dealt 2d8 since they levelled - the sheet being confidently out of date,
     which is the failure mode this whole file exists to avoid.

     Only this one sentence shape is read. Anything vaguer is left alone. */
  function upgrades(text) {
    var out = [];
    var re = /the \{@(?:damage|dice)\s+([^}|]+)\}[^.]{0,80}?\bof the ([^.]{0,80}?)\bbecomes \{@(?:damage|dice)\s+([^}|]+)\}/gi;
    var m;
    while ((m = re.exec(text)) !== null) {
      var names = m[2].split(/\s*(?:,|and)\s*/i)
        .map(function (n) { return n.replace(/^the\s+/i, '').trim(); })
        .filter(Boolean);
      if (!names.length) continue;
      out.push({ names: names, from: normaliseDie(m[1]), to: normaliseDie(m[3]) });
    }
    return out;
  }

  /* Rewrite an action's die in place when an upgrade names it. */
  function applyUpgrade(act, up) {
    if (!act || !up || !up.from || !up.to) return false;
    var named = up.names.some(function (n) {
      return String(act.name).toLowerCase() === n.toLowerCase();
    });
    if (!named) return false;
    if (String(act.dmg).indexOf(up.from) !== 0) return false;
    act.dmg = up.to + String(act.dmg).slice(up.from.length);
    return true;
  }

  VT.featureText = {
    toAction: toAction,
    upgrades: upgrades, applyUpgrade: applyUpgrade,
    textOf: textOf,
    /* exposed for the tests that keep this honest */
    firstDie: firstDie, damageType: damageType, statedAbility: statedAbility
  };
})();
