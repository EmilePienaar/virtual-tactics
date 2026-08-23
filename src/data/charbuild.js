/* Virtual Tactics :: data/charbuild.js
   Turns a set of character choices into a finished statblock.

   Extracted so the Forge and the TaleSpire symbiote derive characters through
   exactly the same code - two implementations of "how much HP does a level 7
   half-caster have" would drift within a week. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd, CV = VT.convert;

  /* choices = {
       name, level, race, subrace, cls, subclass, background,
       base: {str..cha},         raw scores before racial bonuses
       weapons: [itemRecord],    armor: itemRecord|null, shield: bool,
       spells: [spellRecord],    skillProf: ['stealth', ...]
     } */
  /* 5etools keeps a race's default ability bonuses on a subrace with NO name.
     The standard Human's +1 to everything lives there and nowhere else - the
     base Human record has no 'ability' field at all. Picking Human without
     noticing a blank row in the subrace list therefore left you with no racial
     bonuses whatsoever, silently. Treat the nameless subrace as the default. */
  function baseSubrace(race) {
    if (!race || !VT.fivetools || !VT.fivetools.loaded) return null;
    var name = String(race.name || '').toLowerCase();
    var src = String(race.source || '').toLowerCase();
    return VT.fivetools.get('subrace').find(function (s) {
      if (!s.__base) return false;
      if (String(s.raceName || '').toLowerCase() !== name) return false;
      return !src || !s.raceSource || String(s.raceSource).toLowerCase() === src;
    }) || null;
  }

  function racialBonuses(c) {
    var out = {};
    [c.race, c.subrace || baseSubrace(c.race)].forEach(function (r) {
      if (!r) return;
      var ab = CV.abilityBonusesFromRace(r);
      Object.keys(ab).forEach(function (k) { out[k] = (out[k] || 0) + ab[k]; });
    });
    return out;
  }

  /* AC, and a plain-English account of how it was reached.

     Worth spelling out because the number alone is unfalsifiable: a character
     built with unspent ability points looks identical to a correct one, just
     worse, and there is no way to tell which without doing the arithmetic by
     hand. The breakdown turns "my AC seems low" into something you can read. */
  function armourClass(actor, c) {
    var dexMod = SRD.mod(actor.abilities.dex);
    var ac, why;
    if (c.armor) {
      var kind = String(c.armor.type || '').split('|')[0];
      var base = c.armor.ac || 10;
      if (kind === 'HA') { ac = base; why = c.armor.name + ' ' + base; }
      else if (kind === 'MA') {
        var capped = Math.min(2, dexMod);
        ac = base + capped;
        why = c.armor.name + ' ' + base + U.sign(capped) + ' DEX (capped at +2)';
      } else {
        ac = base + dexMod;
        why = c.armor.name + ' ' + base + U.sign(dexMod) + ' DEX';
      }
    } else {
      ac = 10 + dexMod;
      why = '10' + U.sign(dexMod) + ' DEX (no armour)';
    }
    if (c.shield) { ac += 2; why += ' +2 shield'; }
    actor.acWhy = why;
    return ac;
  }

  /* Max hit die at 1st level, then the die's average rounded up - the
     convention almost every table uses. */
  function hitPoints(faces, level, conMod) {
    var perLevel = Math.floor(faces / 2) + 1 + conMod;
    return Math.max(1, faces + conMod + (level - 1) * perLevel);
  }

  function weaponLook(w) {
    var n = String(w && w.name || '').toLowerCase();
    if (/bow|sling/.test(n)) return 'bow';
    if (/axe/.test(n)) return 'axe';
    if (/spear|pike|lance|javelin|trident|halberd|glaive/.test(n)) return 'spear';
    if (/greatsword|maul|greatclub|greataxe/.test(n)) return 'greatsword';
    if (/dagger|dart|sickle/.test(n)) return 'dagger';
    if (/staff|wand|rod/.test(n)) return 'staff';
    return 'sword';
  }

  /* ---- class features ---------------------------------------------------
     5etools keeps class and subclass features as their own records, keyed by
     class name and level, so a character's feature list is a lookup rather than
     anything we have to hard-code. We store only the identity on the actor and
     resolve the text at render time — the full text of twenty levels of features
     would bloat every save, and would go stale if the source data changed. */
  /* A character is a LIST of classes. `c.classes` is the multiclass shape;
     `c.cls`/`c.subclass`/`c.level` is the original single-class one, still
     accepted everywhere so old saves and old callers keep working. */
  function classesOf(c) {
    if (!c) return [];
    if (c.classes && c.classes.length) {
      return c.classes.filter(function (e) { return e && e.cls; });
    }
    if (c.cls) return [{ cls: c.cls, subclass: c.subclass || null, level: c.level || 1 }];
    return [];
  }

  function totalLevelOf(c) {
    var list = classesOf(c);
    if (!list.length) return U.clamp(c && c.level || 1, 1, 20);
    return U.clamp(list.reduce(function (n, e) { return n + (e.level || 0); }, 0), 1, 20);
  }

  function featuresFor(c) {
    var FT = VT.fivetools, out = [];
    if (!FT || !FT.get) return out;

    classesOf(c).forEach(function (entry) {
      var cname = String(entry.cls.name).toLowerCase();
      var csrc = String(entry.cls.source || '').toLowerCase();
      var lvl = U.clamp(entry.level || 1, 1, 20);

      /* Match the PRINTING, not just the class name. A full data set carries
         both the 2014 (PHB) and 2024 (XPHB) Bard, each with its own feature
         tree - take both and the character ends up with two Extra Attacks and
         four Expertise features. The class record the player picked decides. */
      function sameClass(f) {
        if (String(f.className || '').toLowerCase() !== cname) return false;
        if (!csrc || !f.classSource) return true;
        return String(f.classSource).toLowerCase() === csrc;
      }

      (FT.get('classfeature') || []).forEach(function (f) {
        if (!sameClass(f)) return;
        if ((f.level || 1) > lvl) return;
        out.push({ name: f.name, level: f.level || 1, source: f.source || null,
                   subclass: false, className: entry.cls.name, classSource: entry.cls.source || null });
      });

      if (entry.subclass) {
        var sname = String(entry.subclass.shortName || entry.subclass.name).toLowerCase();
        var ssrc = String(entry.subclass.source || '').toLowerCase();
        (FT.get('subclassfeature') || []).forEach(function (f) {
          if (!sameClass(f)) return;
          if (String(f.subclassShortName || '').toLowerCase() !== sname) return;
          if (ssrc && f.subclassSource &&
              String(f.subclassSource).toLowerCase() !== ssrc) return;
          if ((f.level || 1) > lvl) return;
          out.push({ name: f.name, level: f.level || 1, source: f.source || null,
                     subclass: true, className: entry.cls.name, classSource: entry.cls.source || null });
        });
      }
    });

    /* De-duplicate WITHIN a class only. Two classes can each legitimately grant
       an Extra Attack or an Ability Score Improvement at their own levels, and
       collapsing those across classes would quietly rob a multiclass character
       of improvements they are owed. */
    var seen = {}, uniq = [];
    out.forEach(function (f) {
      var k = String(f.className).toLowerCase() + '|' + f.level + '|' + String(f.name).toLowerCase();
      if (seen[k]) return;
      seen[k] = 1; uniq.push(f);
    });
    uniq.sort(function (a, b) {
      return a.level - b.level ||
        (a.className < b.className ? -1 : a.className > b.className ? 1 : 0) ||
        (a.name < b.name ? -1 : 1);
    });
    return uniq;
  }

  /* Resolve a stored feature back to its printed text, when the data is loaded. */
  /* The feature list carried on an actor is deliberately thin - a name and a
     level - so a saved character does not haul the whole printed text of forty
     features around with it. Anything that needs the prose looks it back up. */
  function featureRecord(feature, className) {
    var FT = VT.fivetools;
    if (!FT || !FT.get || !feature) return null;
    /* A subclass feature can be listed without the flag being set, so check
       both pools rather than trusting it. */
    var pools = feature.subclass ? ['subclassfeature', 'classfeature']
                                 : ['classfeature', 'subclassfeature'];
    var hit = null;
    pools.forEach(function (kind) {
      if (hit) return;
      hit = (FT.get(kind) || []).find(function (f) {
        return String(f.name).toLowerCase() === String(feature.name).toLowerCase() &&
          (f.level || 1) === feature.level &&
          (!className || String(f.className || '').toLowerCase() === String(className).toLowerCase());
      }) || null;
    });
    /* Last resort: name and level alone. A subclass feature's className is the
       parent class, but homebrew is not always so tidy. */
    if (!hit) {
      pools.forEach(function (kind) {
        if (hit) return;
        hit = (FT.get(kind) || []).find(function (f) {
          return String(f.name).toLowerCase() === String(feature.name).toLowerCase() &&
            (f.level || 1) === feature.level;
        }) || null;
      });
    }
    return hit;
  }

  function featureText(feature, className) {
    var hit = featureRecord(feature, className);
    return hit ? VT.tags.toText(hit.entries) : '';
  }

  function isASI(f) { return /^ability score improvement/i.test(f.name || ''); }

  /* How many ability score improvements this build has earned, and how many the
     player has actually assigned. */
  function asiStatus(c) {
    var earned = featuresFor(c).filter(isASI).length;
    var spent = (c.asi || []).length;
    return { earned: earned, spent: spent, left: Math.max(0, earned - spent) };
  }

  function derive(c) {
    c = c || {};
    var classes = classesOf(c);
    var primary = classes[0] || null;
    var level = totalLevelOf(c);
    var a = VT.actor.base(c.name || (primary ? primary.cls.name : 'Adventurer'));
    a.team = 'party';
    a.level = level;

    /* Keep the flat, per-class shape on the actor so every existing consumer -
       the battle map, the shop, the party list - keeps working unchanged. */
    a.classes = classes.map(function (e) {
      return { name: e.cls.name, source: e.cls.source || null, level: e.level || 1,
               subclass: e.subclass
                 ? { name: e.subclass.name, shortName: e.subclass.shortName || e.subclass.name,
                     source: e.subclass.source || null } : null };
    });
    a.multiclass = classes.length > 1;
    a.className = classes.map(function (e) {
      return e.cls.name + (e.subclass ? ' (' + (e.subclass.shortName || e.subclass.name) + ')' : '') +
             (classes.length > 1 ? ' ' + e.level : '');
    }).join(' / ');
    a.raceName = c.race
      ? c.race.name + (c.subrace && c.subrace.name ? ' (' + c.subrace.name + ')' : '') : '';
    a.backgroundName = c.background ? c.background.name : '';

    /* Some races say their speed is not reduced by heavy armour - both PHB and
       Athasian dwarves do. It is stated in the race's own trait text and
       nowhere central, so read it here rather than keeping a list of names. */
    a.heavyArmorSpeedOk = /speed is not reduced by wearing heavy armor/i
      .test(JSON.stringify((c.race && c.race.entries) || ''));

    var bonuses = racialBonuses(c);
    /* Ability score improvements stack on top of race, and cap at 20. */
    (c.asi || []).forEach(function (entry) {
      Object.keys(entry.picks || {}).forEach(function (k) {
        if (SRD.ABILITIES.indexOf(k) >= 0) bonuses[k] = (bonuses[k] || 0) + entry.picks[k];
      });
    });
    /* Feats raise scores too, and an Epic Boon raises its cap to 30. */
    var caps = {};
    if (VT.choiceFx) {
      var fb = VT.choiceFx.abilityBonuses({ classes: a.classes, picks: c.picks });
      Object.keys(fb.bonus).forEach(function (k) { bonuses[k] = (bonuses[k] || 0) + fb.bonus[k]; });
      caps = fb.cap;
    }
    var base = c.base || {};
    SRD.ABILITIES.forEach(function (k) {
      a.abilities[k] = U.clamp((base[k] == null ? 10 : base[k]) + (bonuses[k] || 0), 1, caps[k] || 20);
    });

    a.size = c.race ? CV.raceSize(c.race) : 'medium';
    a.speed = c.race ? CV.raceSpeed(c.race) : 30;
    /* What the race walks at, before features and armour. Kept so the feature
       pass can recompute rather than accumulate - it runs again every time
       something is equipped. */
    a.baseSpeed = a.speed;
    /* Scores before any item touches them, for the same reason as baseSpeed:
       an item that sets Strength must not stack with itself when the gear pass
       runs again. */
    a.baseAbilities = U.clone(a.abilities);

    /* What the race itself grants - tiefling fire, aasimar necrotic and
       radiant. Recorded here so the gear pass can merge it with items and
       features without having to re-read the race every time. */
    if (VT.resist) a.raceDefences = VT.resist.fromRace(c);

    /* Only the class you started as grants saving-throw proficiencies. No
       edition gives them on a multiclass, and adding them silently would
       inflate every save the character makes. */
    a.saveProf = (primary && primary.cls.proficiency)
      ? primary.cls.proficiency.filter(function (s) { return SRD.ABILITIES.indexOf(s) >= 0; })
      : [];

    /* Skills chosen on the class step live in the choice tree; skills chosen
       anywhere else (a background, an edit by hand) come in on skillProf. */
    a.skillProf = (c.skillProf || []).slice();
    if (VT.choices && c.picks) {
      VT.choices.chosenSkills({ classes: a.classes, picks: c.picks }).forEach(function (sk) {
        if (a.skillProf.indexOf(sk) < 0) a.skillProf.push(sk);
      });
    }

    /* Tool proficiencies: the fixed grants from the class you started as, plus
       whatever was chosen for the "one of your choice" ones. */
    a.toolProf = [];
    if (VT.choices) {
      var toolBuild = { classes: a.classes, picks: c.picks || {} };
      VT.choices.fixedTools(toolBuild).concat(VT.choices.chosenTools(toolBuild))
        .forEach(function (t) { if (a.toolProf.indexOf(t) < 0) a.toolProf.push(t); });
    }
    (c.toolProf || []).forEach(function (t) {
      if (a.toolProf.indexOf(t) < 0) a.toolProf.push(t);
    });

    var faces = (primary && primary.cls.hd && primary.cls.hd.faces) || 8;
    a.hitDie = faces;
    var conMod = SRD.mod(a.abilities.con);
    a.hpMax = classes.length > 1
      ? VT.multiclass.hitPoints(a.classes, conMod)
      : hitPoints(faces, level, conMod);
    a.hitDiceBreakdown = classes.length > 1 ? VT.multiclass.hitDice(a.classes) : null;
    a.hp = a.hpMax;
    a.hpWhy = classes.length > 1
      ? 'multiclass hit dice' + U.sign(conMod * level) + ' CON over ' + level + ' levels'
      : 'd' + faces + U.sign(conMod) + ' at 1st, then ' + (level - 1) + ' x (' +
        (Math.floor(faces / 2) + 1) + U.sign(conMod) + ' CON)';
    a.ac = armourClass(a, c);
    a.armorName = c.armor ? c.armor.name : '';
    a.shield = !!c.shield;

    /* actions from gear and spells */
    var prof = VT.actor.prof(a);
    var strMod = SRD.mod(a.abilities.str);
    var dexMod = SRD.mod(a.abilities.dex);
    a.actions = [];
    (c.weapons || []).forEach(function (w) {
      var act = CV.weapon(w, { str: strMod, dex: dexMod, prof: prof });
      if (act) a.actions.push(act);
    });

    /* Each class casts off its own ability, so a Cleric/Wizard has two save
       DCs. The sheet leads with the highest and lists the rest. */
    a.spellStats = VT.multiclass.spellStats(a.classes, a);
    var lead = a.spellStats.slice().sort(function (x, y) { return y.dc - x.dc; })[0] || null;
    var castAbility = lead ? lead.ability : null;
    var castMod = castAbility ? SRD.mod(a.abilities[castAbility] || 10) : 0;
    a.castAbility = castAbility || null;
    a.spellDC = lead ? lead.dc : null;
    a.spellAttack = lead ? lead.attack : null;

    (c.spells || []).forEach(function (s) {
      var act = CV.spell(s, { dc: a.spellDC || 13, atk: a.spellAttack || prof, mod: castMod, prof: prof, level: level });
      if (act) a.actions.push(act);
    });



    a.spec = VT.spriteart.autoSpec(a.name, {
      kind: 'humanoid',
      weapon: (c.weapons && c.weapons.length) ? weaponLook(c.weapons[0]) : (castAbility ? 'staff' : 'sword'),
      shield: !!c.shield,
      helm: !!(c.armor && String(c.armor.type || '').indexOf('HA') === 0)
    });

    a.features = featuresFor(c);
    a.asiStatus = asiStatus(c);
    a.picks = U.clone(c.picks || {});
    /* Turn the features that have mechanics into actual mechanics: resources,
       actions, expertise, aura bonuses, unarmoured AC. */
    if (VT.features) VT.features.apply(a, c);

    /* Only after features have had their say — a monk's Martial Arts provides a
       real unarmed strike, and the placeholder must not sit in its place. */
    if (!a.actions.length) {
      a.actions.push(SRD.melee('Unarmed Strike', VT.actor.prof(a) + SRD.mod(a.abilities.str),
        '1' + (SRD.mod(a.abilities.str) ? U.sign(SRD.mod(a.abilities.str)) : ''), 'bludgeoning'));
    }
    /* Choices the player has made - fighting styles, invocations, metamagic,
       feats - become real notes, actions and resources on the sheet. */
    if (VT.choiceFx) VT.choiceFx.apply(a, c);

    a.hitDiceMax = level;
    a.hitDiceUsed = 0;
    a.coins = U.clone(c.coins || VT.coin.emptyPurse());
    /* Equipment lives in the inventory, worn or not, so it can be taken off
       without being thrown away. AC, stealth and speed all follow from what is
       equipped rather than from a build-time choice nothing can revisit.

       This has to come after the inventory exists, not before: an earlier
       version built the gear a hundred lines up and had it silently overwritten
       here. */
    a.inventory = U.clone(c.inventory || []);
    if (VT.gear) {
      var have = {};
      a.inventory.forEach(function (e) { have[String(e.name).toLowerCase()] = e; });
      if (c.armor && !have[String(c.armor.name).toLowerCase()]) {
        VT.gear.add(a, c.armor, { equipped: true });
      }
      if (c.shield && !have.shield) {
        VT.gear.add(a, { name: 'Shield', type: 'S', ac: 2 }, { equipped: true });
      }
      (c.weapons || []).forEach(function (w) {
        if (!have[String(w.name).toLowerCase()]) VT.gear.add(a, w, { equipped: true });
      });
      VT.gear.recompute(a);
    }

    /* Remember how this was built so Edit/level-up can re-derive. */
    a.build = toRefs(c);

    a.notes = [
      a.raceName ? 'Race: ' + a.raceName : '',
      a.backgroundName ? 'Background: ' + a.backgroundName : '',
      a.className ? 'Class: ' + a.className : ''
    ].filter(Boolean).join('\n');
    return a;
  }

  /* ---- build references -------------------------------------------------
     A derived character is a flat statblock, which is all play needs - but
     levelling up has to recompute hit points, proficiency and every attack
     bonus, so it needs the original choices back.

     Storing the whole records would bloat the save (a spell record is several
     KB), so we keep {name, source} references and re-resolve them against the
     compendium. Small, and portable between machines. */
  function ref(r) { return r ? { name: r.name, source: r.source || null } : null; }

  /* A subclass name is only unique within its class: "Champion" exists in both
     printings of Fighter, and there is more than one "Life Domain". Match the
     class and printing too. */
  function subclassFor(clsRec, r) {
    var FT = VT.fivetools;
    if (!FT || !FT.get || !r) return null;
    var hits = (FT.get('subclass') || []).filter(function (sc) {
      if (String(sc.name).toLowerCase() !== String(r.name).toLowerCase()) return false;
      if (String(sc.className || '').toLowerCase() !== String(clsRec.name).toLowerCase()) return false;
      if (clsRec.source && sc.classSource &&
          String(sc.classSource).toLowerCase() !== String(clsRec.source).toLowerCase()) return false;
      if (r.source && sc.source &&
          String(sc.source).toLowerCase() !== String(r.source).toLowerCase()) return false;
      return true;
    });
    return hits[0] || null;
  }

  function toRefs(c) {
    var classes = classesOf(c);
    var first = classes[0] || null;
    return {
      level: totalLevelOf(c), base: U.clone(c.base || {}),
      /* The multiclass list is the truth; cls/subclass/level stay written as
         the primary class so an older build of the app, or an older symbiote
         still on a player's machine, opens the character rather than failing. */
      classes: classes.map(function (e) {
        return { name: e.cls.name, source: e.cls.source || null, level: e.level || 1,
                 subclass: e.subclass ? { name: e.subclass.name, source: e.subclass.source || null } : null };
      }),
      picks: U.clone(c.picks || {}),
      race: ref(c.race), subrace: ref(c.subrace),
      cls: first ? ref(first.cls) : null,
      subclass: first && first.subclass ? ref(first.subclass) : null,
      background: ref(c.background), armor: ref(c.armor), shield: !!c.shield,
      weapons: (c.weapons || []).map(ref),
      spells: (c.spells || []).map(ref),
      skillProf: (c.skillProf || []).slice(),
      toolProf: (c.toolProf || []).slice(),
      asi: U.clone(c.asi || []),
      expertise: (c.expertise || []).slice()
    };
  }

  /* Returns { choices, missing:[label] } - missing tells the UI honestly which
     references could not be found rather than silently dropping them. */
  function fromRefs(refs) {
    var FT = VT.fivetools, missing = [];
    function get(kind, r, label) {
      if (!r) return null;
      var rec = FT.byName(kind, r.name, r.source);
      if (!rec) missing.push((label || kind) + ' "' + r.name + '"');
      return rec;
    }
    /* Resolve the multiclass list, falling back to the single-class fields for
       characters saved before multiclassing existed. */
    var classRefs = (refs.classes && refs.classes.length)
      ? refs.classes
      : (refs.cls ? [{ name: refs.cls.name, source: refs.cls.source,
                       subclass: refs.subclass || null, level: refs.level || 1 }] : []);
    var classes = classRefs.map(function (r) {
      var rec = get('class', { name: r.name, source: r.source }, 'class');
      if (!rec) return null;
      var sub = r.subclass ? subclassFor(rec, r.subclass) : null;
      if (r.subclass && !sub) missing.push('subclass "' + r.subclass.name + '"');
      return { cls: rec, subclass: sub, level: r.level || 1 };
    }).filter(Boolean);

    var choices = {
      level: refs.level, base: U.clone(refs.base || {}),
      classes: classes,
      picks: U.clone(refs.picks || {}),
      skillProf: (refs.skillProf || []).slice(),
      toolProf: (refs.toolProf || []).slice(),
      asi: U.clone(refs.asi || []),
      expertise: (refs.expertise || []).slice(),
      race: get('race', refs.race, 'race'),
      subrace: get('subrace', refs.subrace, 'subrace'),
      cls: classes[0] ? classes[0].cls : get('class', refs.cls, 'class'),
      subclass: classes[0] ? classes[0].subclass : get('subclass', refs.subclass, 'subclass'),
      background: get('background', refs.background, 'background'),
      armor: get('item', refs.armor, 'armour'),
      shield: !!refs.shield,
      weapons: (refs.weapons || []).map(function (r) { return get('item', r, 'weapon'); }).filter(Boolean),
      spells: (refs.spells || []).map(function (r) { return get('spell', r, 'spell'); }).filter(Boolean)
    };
    return { choices: choices, missing: missing };
  }

  /* Re-derive at a new level while keeping everything play has changed since:
     damage taken, conditions, spent uses, hand-edited skill proficiencies. */
  /* Change ONE class's level, leaving the others alone. This is what levelling
     up actually is for a multiclass character: you pick a class and take a
     level in it. `index` is a position in build.classes. */
  function relevelClass(actor, index, newLevel) {
    var refs = actor.build;
    if (!refs) return { ok: false, reason: 'This character has no build data - it was imported as a flat statblock.' };
    var r = fromRefs(refs);
    if (!r.choices.classes.length) {
      return { ok: false, reason: "None of this character's classes are in the loaded data.", missing: r.missing };
    }
    var entry = r.choices.classes[index];
    if (!entry) return { ok: false, reason: 'No such class on this character.' };

    newLevel = U.clamp(newLevel, 0, 20);
    if (newLevel === 0) {
      if (r.choices.classes.length === 1) {
        return { ok: false, reason: 'A character needs at least one class level.' };
      }
      r.choices.classes.splice(index, 1);
    } else {
      entry.level = newLevel;
    }
    if (totalLevelOf(r.choices) > 20) {
      return { ok: false, reason: 'That would take the character past 20th level.' };
    }
    return finishRelevel(actor, r);
  }

  /* Add a class, or take another level in one already held. */
  function addClassLevel(actor, clsRec, subclassRec) {
    var refs = actor.build;
    if (!refs) return { ok: false, reason: 'This character has no build data.' };
    var r = fromRefs(refs);
    var existing = r.choices.classes.filter(function (e) {
      return String(e.cls.name).toLowerCase() === String(clsRec.name).toLowerCase() &&
             String(e.cls.source || '').toLowerCase() === String(clsRec.source || '').toLowerCase();
    })[0];
    if (totalLevelOf(r.choices) >= 20) {
      return { ok: false, reason: 'Already at 20th level.' };
    }
    if (existing) existing.level += 1;
    else r.choices.classes.push({ cls: clsRec, subclass: subclassRec || null, level: 1 });
    return finishRelevel(actor, r);
  }

  function relevel(actor, newLevel) {
    var refs = actor.build;
    if (!refs) return { ok: false, reason: 'This character has no build data — it was imported as a flat statblock.' };
    var r = fromRefs(refs);
    if (!r.choices.cls) {
      return { ok: false, reason: 'Class "' + (refs.cls && refs.cls.name) + '" is not in the loaded data.', missing: r.missing };
    }
    newLevel = U.clamp(newLevel, 1, 20);
    /* A single overall level only has one meaning when there is one class. For
       a multiclass character, put the difference into the class they most
       recently took - the others keep the levels they earned. */
    if (r.choices.classes.length > 1) {
      var delta = newLevel - totalLevelOf(r.choices);
      var last = r.choices.classes[r.choices.classes.length - 1];
      var want = (last.level || 1) + delta;
      if (want < 1) {
        return { ok: false, reason: 'Reduce a specific class instead — that would take ' +
                 last.cls.name + ' below 1st level.' };
      }
      last.level = want;
      return finishRelevel(actor, r);
    }
    r.choices.classes[0].level = newLevel;
    r.choices.level = newLevel;
    return finishRelevel(actor, r);
  }

  /* Everything a re-derive has to carry across, in one place, so that changing
     a level, adding a class and adding a weapon all preserve exactly the same
     things. Play state survives; the build is recomputed. */
  function finishRelevel(actor, r) {
    var refs = actor.build || {};
    r.choices.name = actor.name;
    r.choices.level = totalLevelOf(r.choices);
    r.choices.skillProf = (actor.skillProf || refs.skillProf || []).slice();
    r.choices.toolProf = (actor.toolProf || refs.toolProf || []).slice();

    var damage = Math.max(0, actor.hpMax - actor.hp);
    r.choices.coins = actor.coins;
    r.choices.inventory = actor.inventory;
    r.choices.expertise = actor.expertise || (refs.expertise || []);

    var next = derive(r.choices);
    next.id = actor.id;
    next.hp = Math.max(1, next.hpMax - damage);

    /* Everything below belongs to PLAY, not to the build, and must survive a
       level-up untouched. Losing a party's gold to a level-up is the kind of
       bug that costs a session. */
    next.tempHp = actor.tempHp || 0;
    next.conditions = (actor.conditions || []).slice();
    next.used = U.clone(actor.used || {});
    next.coins = U.clone(actor.coins || VT.coin.emptyPurse());
    next.inventory = U.clone(actor.inventory || []);
    next.spriteId = actor.spriteId || null;
    next.acBonus = actor.acBonus || 0;
    next.deathSaves = U.clone(actor.deathSaves || { s: 0, f: 0 });
    next.hitDiceUsed = Math.min(actor.hitDiceUsed || 0, next.hitDiceMax);
    /* What you are attuned to is a fact about the character, not the build. */
    next.attuned = U.clone(actor.attuned || []);
    if (actor.attuneMax) next.attuneMax = actor.attuneMax;

    /* Spent resources and spell slots are play state: keep what is used, but
       clamp to the new maximums in case a level-up shrank something. */
    var priorUse = {};
    (actor.resources || []).forEach(function (r2) { priorUse[r2.key] = r2.used; });
    (next.resources || []).forEach(function (r2) {
      r2.used = Math.min(priorUse[r2.key] || 0, r2.max);
    });
    if (next.spellSlots && actor.slotsUsed) {
      next.slotsUsed = {};
      if (next.spellSlots.pact) {
        next.slotsUsed.pact = Math.min(actor.slotsUsed.pact || 0, next.spellSlots.count);
      } else {
        next.spellSlots.slots.forEach(function (n2, i2) {
          next.slotsUsed[i2 + 1] = Math.min(actor.slotsUsed[i2 + 1] || 0, n2);
        });
      }
    }
    if (actor.notesCustom) { next.notes = actor.notes; next.notesCustom = true; }
    next.hitDiceMax = next.level;

    /* Which side they fight on, and a sprite the GM chose by hand, are theirs
       and not the class table's. The build re-derives the default look from
       equipped gear, so only an explicit override is worth protecting. */
    if (actor.team) next.team = actor.team;
    if (actor.specCustom) { next.spec = U.clone(actor.spec); next.specCustom = true; }

    /* keep any actions the player added by hand in the Edit tab */
    (actor.actions || []).filter(function (x) { return x.custom; })
      .forEach(function (x) { next.actions.push(U.clone(x)); });
    return { ok: true, actor: next, missing: r.missing };
  }

  VT.charbuild = {
    derive: derive, racialBonuses: racialBonuses,
    armourClass: armourClass, hitPoints: hitPoints, weaponLook: weaponLook,
    toRefs: toRefs, fromRefs: fromRefs, relevel: relevel, baseSubrace: baseSubrace,
    relevelClass: relevelClass, addClassLevel: addClassLevel,
    classesOf: classesOf, totalLevelOf: totalLevelOf,
    subclassFor: subclassFor,
    featuresFor: featuresFor, featureText: featureText, featureRecord: featureRecord, asiStatus: asiStatus, isASI: isASI
  };
})();
