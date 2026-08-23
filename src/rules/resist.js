/* Virtual Tactics :: rules/resist.js
   Damage resistances, immunities and vulnerabilities, from every source.

   Three places grant them and they behave differently, which is why this is one
   file rather than three scattered checks:

     race       structured data - tiefling fire, aasimar necrotic and radiant.
                43 races and 8 subraces carry it, and a few say "choose one",
                which the character's ancestry pick answers.
     features   English in the feature text. 50 features mention resistance and
                only 21 are permanent - the rest are Rage, Bear Totem, and other
                things you turn on. Applying those passively would make a
                barbarian permanently resistant to everything.
     items      handled in itemfx.js, merged here.

   The honest line is drawn at qualified resistances. "Resistance to fire
   damage" is a fact about the character. "Resistance to bludgeoning, piercing
   and slashing from nonmagical attacks" is narrower than the sheet can show in
   one word, so it is listed as a note rather than claimed as blanket
   resistance - a sheet that overstates a defence gets someone killed. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd;

  var TYPES = SRD.DAMAGE_TYPES;

  /* Anything that narrows a resistance to less than "all of this type". */
  var QUALIFIER = /\bfrom\b|nonmagical|magical weapons|silvered|adamantine|while|unless/i;

  /* Turns on and off, so it is a reminder rather than a state. */
  var CONDITIONAL =
    /while (you are )?raging|while this|when you|as an action|bonus action|for 1 minute|until the (end|start)|while transformed|while in/i;

  function typesIn(text) {
    var found = [];
    TYPES.forEach(function (t) {
      if (new RegExp('\\b' + t + '\\b', 'i').test(text) && found.indexOf(t) < 0) found.push(t);
    });
    return found;
  }

  /* ---- race --------------------------------------------------------------- */

  /* "choose": the race offers a list and something else picks from it - a
     dragonborn's draconic ancestry, most often. Look for the answer among the
     character's own choices before giving up. */
  function resolveChoose(entry, build) {
    var from = entry && entry.choose && entry.choose.from;
    if (!Array.isArray(from)) return [];
    var picked = JSON.stringify((build && build.picks) || {}).toLowerCase();
    var hit = from.filter(function (t) {
      return picked.indexOf(String(t).toLowerCase()) >= 0;
    });
    return hit.length ? [hit[0]] : [];
  }

  function fromRace(build) {
    var out = { resist: [], immune: [], vulnerable: [], conditionImmune: [], pending: [] };
    if (!build) return out;
    [build.race, build.subrace].forEach(function (rec) {
      if (!rec) return;
      ['resist', 'immune', 'vulnerable', 'conditionImmune'].forEach(function (key) {
        [].concat(rec[key] || []).forEach(function (v) {
          if (typeof v === 'string') {
            if (out[key].indexOf(v) < 0) out[key].push(v);
          } else if (v && v.choose) {
            var got = resolveChoose(v, build);
            if (got.length) {
              got.forEach(function (t) { if (out[key].indexOf(t) < 0) out[key].push(t); });
            } else {
              out.pending.push('choose one: ' + (v.choose.from || []).join(', '));
            }
          }
        });
      });
    });
    return out;
  }

  /* ---- class and subclass features ---------------------------------------- */

  /* Reads a feature's own text. Applies only what is unambiguous; anything
     narrowed or switchable comes back as a note. */
  function fromFeature(feature) {
    if (!VT.featureText) return null;
    var text = VT.featureText.textOf(feature);
    if (!/resistance to/i.test(text)) return null;

    var m = text.match(/resistance to ([^.]{0,90})/i);
    if (!m) return null;
    var clause = m[1];
    var types = typesIn(clause);

    /* "resistance to all damage except psychic" names psychic as the one type
       it does NOT cover, so listing the types found would say the opposite of
       what the feature does. When the clause excludes rather than enumerates,
       quote it instead. */
    var inverted = /except|other than|all damage/i.test(clause);
    if (CONDITIONAL.test(text)) {
      return { note: feature.name + ': ' + (inverted
        ? 'resistance while active to ' + clause.trim().replace(/\s+/g, ' ')
        : 'resistance while active' + (types.length ? ' (' + types.join(', ') + ')' : '')) };
    }
    if (!types.length || inverted || QUALIFIER.test(clause)) {
      return { note: feature.name + ': ' + U.cap(clause.trim().replace(/\s+/g, ' ')) };
    }
    return { types: types, from: feature.name };
  }

  function fromFeatures(actor, records) {
    var out = { resist: [], notes: [] };
    (records || []).forEach(function (rec) {
      var got = fromFeature(rec);
      if (!got) return;
      if (got.note) { out.notes.push(got.note); return; }
      got.types.forEach(function (t) { if (out.resist.indexOf(t) < 0) out.resist.push(t); });
    });
    return out;
  }

  /* ---- putting it together ------------------------------------------------ */

  /* Merge every source onto the actor. Items are already on actor.itemResist,
     put there by itemfx, so this owns the final arrays. */
  function gather(actor) {
    if (!actor) return actor;
    var resist = [], immune = [], vuln = [], condImm = [], notes = [];

    function addAll(target, list) {
      (list || []).forEach(function (t) {
        var v = String(t).toLowerCase();
        if (target.indexOf(v) < 0) target.push(v);
      });
    }

    var race = actor.raceDefences || {};
    addAll(resist, race.resist); addAll(immune, race.immune);
    addAll(vuln, race.vulnerable); addAll(condImm, race.conditionImmune);
    (race.pending || []).forEach(function (p) { notes.push('From your race, ' + p); });

    addAll(resist, actor.featureResist);
    (actor.featureResistNotes || []).forEach(function (n) { notes.push(n); });

    addAll(resist, actor.itemResist);
    addAll(condImm, actor.itemConditionImmune);

    /* Immunity beats resistance - listing both is noise. */
    resist = resist.filter(function (t) { return immune.indexOf(t) < 0; });

    actor.resist = resist;
    actor.immune = immune;
    actor.vulnerable = vuln;
    actor.conditionImmune = condImm;
    actor.resistNotes = notes;
    return actor;
  }

  VT.resist = {
    fromRace: fromRace, fromFeature: fromFeature, fromFeatures: fromFeatures,
    gather: gather, typesIn: typesIn
  };
})();
