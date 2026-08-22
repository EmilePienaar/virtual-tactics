/* Virtual Tactics :: rules/srd.js
   5e-compatible reference data: ability maths, conditions, and a starter
   bestiary / party of archetypes so a table can start playing immediately.
   Statblocks are ordinary game numbers - edit any of them in the Roster tab,
   or build your own from scratch. Swap this file wholesale to run a different
   d20 system; nothing else hard-codes these values. */
(function () {
  'use strict';
  var VT = window.VT;

  var ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  var ABILITY_NAME = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
  var SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
  var DAMAGE_TYPES = ['slashing', 'piercing', 'bludgeoning', 'fire', 'cold', 'lightning',
    'acid', 'poison', 'necrotic', 'radiant', 'psychic', 'thunder', 'force'];

  /* The 18 skills and the ability each is measured against. */
  var SKILL_ABILITY = {
    athletics: 'str', acrobatics: 'dex', 'sleight of hand': 'dex', stealth: 'dex',
    arcana: 'int', history: 'int', investigation: 'int', nature: 'int', religion: 'int',
    'animal handling': 'wis', insight: 'wis', medicine: 'wis', perception: 'wis', survival: 'wis',
    deception: 'cha', intimidation: 'cha', performance: 'cha', persuasion: 'cha'
  };

  function mod(score) { return Math.floor((score - 10) / 2); }
  function profBonus(level) { return 2 + Math.floor((Math.max(1, level) - 1) / 4); }

  /* ---- conditions ------------------------------------------------------ */
  /* atkFrom  : advantage this creature's own attacks get (-1/0/1)
     atkAgainst: advantage attackers get against it
     noAct    : cannot take actions */
  var CONDITIONS = {
    prone:      { name: 'Prone',      atkFrom: -1, atkAgainstMelee: 1, atkAgainstRanged: -1 },
    dodging:    { name: 'Dodging',    atkAgainst: -1 },
    poisoned:   { name: 'Poisoned',   atkFrom: -1 },
    blinded:    { name: 'Blinded',    atkFrom: -1, atkAgainst: 1 },
    frightened: { name: 'Frightened', atkFrom: -1 },
    restrained: { name: 'Restrained', atkFrom: -1, atkAgainst: 1, speed0: true },
    grappled:   { name: 'Grappled',   speed0: true },
    stunned:    { name: 'Stunned',    atkAgainst: 1, noAct: true, speed0: true },
    paralyzed:  { name: 'Paralyzed',  atkAgainst: 1, noAct: true, speed0: true },
    unconscious:{ name: 'Unconscious',atkAgainst: 1, noAct: true, speed0: true },
    blessed:    { name: 'Blessed',    bonusToHit: '1d4' },
    shielded:   { name: 'Shielded',   acBonus: 5 },
    hasted:     { name: 'Hasted',     speedMult: 2, acBonus: 2 },
    slowed:     { name: 'Slowed',     speedMult: .5 },
    invisible:  { name: 'Invisible',  atkFrom: 1, atkAgainst: -1 },
    concentrating: { name: 'Concentrating' }
  };
  var CONDITION_ICON = {
    prone: '↓', dodging: '○', poisoned: '☠', blinded: '●',
    frightened: '!', restrained: '⊕', grappled: '⊗', stunned: '✳',
    paralyzed: '✖', unconscious: 'z', blessed: '+', hasted: '»', shielded: '△',
    slowed: '«', invisible: '◌', concentrating: '◆'
  };

  /* ---- attack helpers -------------------------------------------------- */
  function melee(name, toHit, dmg, type, opts) {
    return Object.assign({ name: name, kind: 'melee', reach: 5, toHit: toHit, dmg: dmg, dmgType: type || 'slashing', cost: 'action' }, opts || {});
  }
  function ranged(name, toHit, dmg, type, near, far, opts) {
    return Object.assign({ name: name, kind: 'ranged', range: [near || 80, far || 320], toHit: toHit, dmg: dmg, dmgType: type || 'piercing', cost: 'action' }, opts || {});
  }
  function saveSpell(name, ability, dc, dmg, type, radiusFt, rangeFt, opts) {
    return Object.assign({
      name: name, kind: 'save', save: ability, dc: dc, dmg: dmg, dmgType: type || 'fire',
      aoe: radiusFt ? { radius: radiusFt } : null, range: [rangeFt || 60, rangeFt || 60],
      half: true, cost: 'action'
    }, opts || {});
  }
  function heal(name, dice, rangeFt, opts) {
    return Object.assign({ name: name, kind: 'heal', dmg: dice, range: [rangeFt || 5, rangeFt || 5], cost: 'action' }, opts || {});
  }

  /* ---- party archetypes ------------------------------------------------ */
  /* Level 3 baselines - a sane starting point that is easy to retune. */
  var CLASSES = {
    fighter: {
      name: 'Fighter', hitDie: 10, ac: 18, speed: 30,
      abilities: { str: 16, dex: 12, con: 15, int: 10, wis: 12, cha: 10 },
      spec: { kind: 'humanoid', weapon: 'sword', shield: true, helm: true, cloth: '#5a5f78', trim: '#c8a44c' },
      actions: [melee('Longsword', 5, '1d8+3', 'slashing'), ranged('Handaxe', 5, '1d6+3', 'slashing', 20, 60),
        { name: 'Second Wind', kind: 'heal', dmg: '1d10+3', range: [0, 0], cost: 'bonus', uses: { max: 1, per: 'rest' }, self: true }]
    },
    barbarian: {
      name: 'Barbarian', hitDie: 12, ac: 15, speed: 40,
      abilities: { str: 17, dex: 14, con: 16, int: 8, wis: 11, cha: 10 },
      spec: { kind: 'humanoid', weapon: 'greatsword', cloth: '#8a5a2b', trim: '#7a2f2a', hair: '#c9a95f' },
      actions: [melee('Greataxe', 5, '1d12+3', 'slashing'),
        { name: 'Rage', kind: 'buff', condition: 'blessed', range: [0, 0], cost: 'bonus', self: true, uses: { max: 3, per: 'rest' } }]
    },
    rogue: {
      name: 'Rogue', hitDie: 8, ac: 15, speed: 30,
      abilities: { str: 10, dex: 17, con: 13, int: 13, wis: 12, cha: 14 },
      spec: { kind: 'humanoid', weapon: 'dagger', cloth: '#3b3b44', trim: '#4d6b3c', cape: true },
      actions: [melee('Shortsword', 5, '1d6+3', 'piercing', { sneak: '2d6' }),
        ranged('Shortbow', 5, '1d6+3', 'piercing', 80, 320, { sneak: '2d6' }),
        { name: 'Hide', kind: 'buff', condition: 'invisible', range: [0, 0], cost: 'bonus', self: true }]
    },
    ranger: {
      name: 'Ranger', hitDie: 10, ac: 16, speed: 30,
      abilities: { str: 12, dex: 16, con: 14, int: 11, wis: 14, cha: 10 },
      spec: { kind: 'humanoid', weapon: 'bow', cloth: '#3f7a5c', trim: '#6b4a2a' },
      actions: [ranged('Longbow', 5, '1d8+3', 'piercing', 150, 600), melee('Shortsword', 5, '1d6+3', 'piercing')]
    },
    wizard: {
      name: 'Wizard', hitDie: 6, ac: 12, speed: 30,
      abilities: { str: 8, dex: 14, con: 13, int: 17, wis: 12, cha: 11 },
      spec: { kind: 'humanoid', weapon: 'staff', cloth: '#7a4a8e', trim: '#c8a44c', accent: '#9a76c4', cape: true },
      actions: [ranged('Fire Bolt', 5, '2d10', 'fire', 120, 120, { spell: true }),
        saveSpell('Burning Hands', 'dex', 13, '3d6', 'fire', 15, 15),
        saveSpell('Fireball', 'dex', 13, '8d6', 'fire', 20, 150, { uses: { max: 1, per: 'rest' } }),
        { name: 'Shield', kind: 'buff', condition: 'dodging', range: [0, 0], cost: 'reaction', self: true }]
    },
    cleric: {
      name: 'Cleric', hitDie: 8, ac: 18, speed: 30,
      abilities: { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 12 },
      spec: { kind: 'humanoid', weapon: 'sword', shield: true, cloth: '#cfc7bd', trim: '#c8a44c' },
      actions: [melee('Mace', 4, '1d6+2', 'bludgeoning'),
        ranged('Sacred Flame', 5, '2d8', 'radiant', 60, 60, { spell: true }),
        heal('Cure Wounds', '1d8+3', 30, { uses: { max: 3, per: 'rest' } }),
        { name: 'Bless', kind: 'buff', condition: 'blessed', range: [30, 30], cost: 'action', uses: { max: 2, per: 'rest' } }]
    },
    paladin: {
      name: 'Paladin', hitDie: 10, ac: 18, speed: 30,
      abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 15 },
      spec: { kind: 'humanoid', weapon: 'sword', shield: true, helm: true, cloth: '#b9bcc4', trim: '#d8b25c', cape: true, accent: '#c8504a' },
      actions: [melee('Longsword', 5, '1d8+3', 'slashing'),
        melee('Divine Smite', 5, '1d8+3+2d8', 'radiant', { uses: { max: 2, per: 'rest' } }),
        heal('Lay on Hands', '15', 5, { uses: { max: 1, per: 'rest' } })]
    },
    druid: {
      name: 'Druid', hitDie: 8, ac: 14, speed: 30,
      abilities: { str: 10, dex: 13, con: 14, int: 12, wis: 17, cha: 11 },
      spec: { kind: 'humanoid', weapon: 'staff', cloth: '#4d6b3c', trim: '#8a6a2f', accent: '#78b06a' },
      actions: [ranged('Thorn Whip', 5, '2d6', 'piercing', 30, 30, { spell: true }),
        saveSpell('Thunderwave', 'con', 13, '2d8', 'thunder', 15, 5),
        heal('Healing Word', '1d4+3', 60, { cost: 'bonus', uses: { max: 2, per: 'rest' } })]
    }
  };

  /* ---- bestiary -------------------------------------------------------- */
  var MONSTERS = {
    goblin: {
      name: 'Goblin', size: 'small', cr: '1/4', ac: 15, hp: 7, speed: 30,
      abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
      spec: { kind: 'humanoid', skin: '#7d9b52', hair: '#3a2a18', cloth: '#6b5334', weapon: 'dagger' },
      actions: [melee('Scimitar', 4, '1d6+2', 'slashing'), ranged('Shortbow', 4, '1d6+2', 'piercing', 80, 320)]
    },
    kobold: {
      name: 'Kobold', size: 'small', cr: '1/8', ac: 12, hp: 5, speed: 30,
      abilities: { str: 7, dex: 15, con: 9, int: 8, wis: 7, cha: 8 },
      spec: { kind: 'humanoid', skin: '#b06a3a', hair: '#5a2f1c', cloth: '#7a4a2a', weapon: 'spear' },
      actions: [melee('Spear', 4, '1d6+2', 'piercing'), ranged('Sling', 4, '1d4+2', 'bludgeoning', 30, 120)]
    },
    orc: {
      name: 'Orc', size: 'medium', cr: '1/2', ac: 13, hp: 15, speed: 30,
      abilities: { str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10 },
      spec: { kind: 'humanoid', skin: '#6f8a54', hair: '#241a12', cloth: '#5a4028', weapon: 'axe' },
      actions: [melee('Greataxe', 5, '1d12+3', 'slashing'), ranged('Javelin', 5, '1d6+3', 'piercing', 30, 120)]
    },
    hobgoblin: {
      name: 'Hobgoblin', size: 'medium', cr: '1/2', ac: 18, hp: 11, speed: 30,
      abilities: { str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 9 },
      spec: { kind: 'humanoid', skin: '#b06b4a', hair: '#3a1f14', cloth: '#7a3f3a', weapon: 'sword', shield: true, helm: true },
      actions: [melee('Longsword', 3, '1d8+1', 'slashing'), ranged('Longbow', 3, '1d8+1', 'piercing', 150, 600)]
    },
    bandit: {
      name: 'Bandit', size: 'medium', cr: '1/8', ac: 12, hp: 11, speed: 30,
      abilities: { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
      spec: { kind: 'humanoid', cloth: '#5a4a6a', weapon: 'sword' },
      actions: [melee('Scimitar', 3, '1d6+1', 'slashing'), ranged('Light Crossbow', 3, '1d8+1', 'piercing', 80, 320)]
    },
    cultist: {
      name: 'Cultist', size: 'medium', cr: '1/8', ac: 12, hp: 9, speed: 30,
      abilities: { str: 11, dex: 12, con: 10, int: 10, wis: 11, cha: 10 },
      spec: { kind: 'humanoid', cloth: '#3a2b44', trim: '#8d3b46', weapon: 'dagger', cape: true },
      actions: [melee('Ritual Dagger', 3, '1d4+1', 'piercing'),
        saveSpell('Hex Bolt', 'wis', 11, '2d6', 'necrotic', 0, 60)]
    },
    bugbear: {
      name: 'Bugbear', size: 'medium', cr: '1', ac: 16, hp: 27, speed: 30,
      abilities: { str: 15, dex: 14, con: 13, int: 8, wis: 11, cha: 9 },
      spec: { kind: 'humanoid', skin: '#8a6a3a', hair: '#4a2f16', cloth: '#4a3a24', weapon: 'axe' },
      actions: [melee('Morningstar', 4, '2d8+2', 'piercing', { reach: 10 }), ranged('Javelin', 4, '1d6+2', 'piercing', 30, 120)]
    },
    gnoll: {
      name: 'Gnoll', size: 'medium', cr: '1/2', ac: 15, hp: 22, speed: 30,
      abilities: { str: 14, dex: 12, con: 11, int: 6, wis: 10, cha: 7 },
      spec: { kind: 'beast', cloth: '#a8874a', accent: '#c8504a' },
      actions: [melee('Bite', 4, '1d4+2', 'piercing'), melee('Spear', 4, '1d6+2', 'piercing')]
    },
    wolf: {
      name: 'Wolf', size: 'medium', cr: '1/4', ac: 13, hp: 11, speed: 40,
      abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
      spec: { kind: 'beast', cloth: '#6b6b70', accent: '#d8b25c' },
      actions: [melee('Bite', 4, '2d4+2', 'piercing')]
    },
    direwolf: {
      name: 'Dire Wolf', size: 'large', cr: '1', ac: 14, hp: 37, speed: 50,
      abilities: { str: 17, dex: 15, con: 15, int: 3, wis: 12, cha: 7 },
      spec: { kind: 'beast', cloth: '#3f4048', accent: '#c9605a' },
      actions: [melee('Bite', 5, '2d6+3', 'piercing')]
    },
    spider: {
      name: 'Giant Spider', size: 'large', cr: '1', ac: 14, hp: 26, speed: 30,
      abilities: { str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4 },
      spec: { kind: 'beast', cloth: '#2f2a36', accent: '#c8504a' },
      actions: [melee('Bite', 5, '1d8+3', 'piercing'),
        ranged('Web', 5, '0', 'bludgeoning', 30, 60, { applies: 'restrained' })]
    },
    owlbear: {
      name: 'Owlbear', size: 'large', cr: '3', ac: 13, hp: 59, speed: 40,
      abilities: { str: 20, dex: 12, con: 17, int: 3, wis: 12, cha: 7 },
      spec: { kind: 'beast', cloth: '#8a6a4a', accent: '#d8b25c' },
      actions: [melee('Beak', 7, '1d10+5', 'piercing'), melee('Claws', 7, '2d8+5', 'slashing')]
    },
    skeleton: {
      name: 'Skeleton', size: 'medium', cr: '1/4', ac: 13, hp: 13, speed: 30,
      abilities: { str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5 },
      spec: { kind: 'undead', skin: '#d8d2c0', accent: '#c9605a', weapon: 'sword' },
      actions: [melee('Shortsword', 4, '1d6+2', 'piercing'), ranged('Shortbow', 4, '1d6+2', 'piercing', 80, 320)],
      resist: ['piercing'], vulnerable: ['bludgeoning']
    },
    zombie: {
      name: 'Zombie', size: 'medium', cr: '1/4', ac: 8, hp: 22, speed: 20,
      abilities: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 },
      spec: { kind: 'undead', skin: '#8a9b76', accent: '#5f8b46', weapon: 'none' },
      actions: [melee('Slam', 3, '1d6+1', 'bludgeoning')]
    },
    wight: {
      name: 'Wight', size: 'medium', cr: '3', ac: 14, hp: 45, speed: 30,
      abilities: { str: 15, dex: 14, con: 16, int: 10, wis: 13, cha: 15 },
      spec: { kind: 'undead', skin: '#b9c0c8', accent: '#9a76c4', weapon: 'sword', cape: true },
      actions: [melee('Life Drain', 4, '1d6+2+1d6', 'necrotic'), ranged('Longbow', 4, '1d8+2', 'piercing', 150, 600)],
      resist: ['necrotic']
    },
    armor: {
      name: 'Animated Armor', size: 'medium', cr: '1', ac: 18, hp: 33, speed: 25,
      abilities: { str: 14, dex: 11, con: 13, int: 1, wis: 3, cha: 1 },
      spec: { kind: 'construct', metal: '#8f96a3', accent: '#5f9ecf' },
      actions: [melee('Slam', 4, '1d6+2', 'bludgeoning')],
      immune: ['poison', 'psychic']
    },
    ogre: {
      name: 'Ogre', size: 'large', cr: '2', ac: 11, hp: 59, speed: 40,
      abilities: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 },
      spec: { kind: 'humanoid', skin: '#c0a07a', hair: '#4a2f16', cloth: '#7a6244', weapon: 'greatsword' },
      actions: [melee('Greatclub', 6, '2d8+4', 'bludgeoning'), ranged('Javelin', 6, '2d6+4', 'piercing', 30, 120)]
    },
    troll: {
      name: 'Troll', size: 'large', cr: '5', ac: 15, hp: 84, speed: 30,
      abilities: { str: 18, dex: 13, con: 20, int: 7, wis: 9, cha: 7 },
      spec: { kind: 'humanoid', skin: '#6f8a54', hair: '#3f5a2a', cloth: '#4a3a24', weapon: 'claws' },
      actions: [melee('Claw', 7, '2d6+4', 'slashing'), melee('Bite', 7, '1d6+4', 'piercing')],
      regen: 10
    },
    ooze: {
      name: 'Gray Ooze', size: 'medium', cr: '1/2', ac: 8, hp: 22, speed: 10,
      abilities: { str: 12, dex: 6, con: 16, int: 1, wis: 6, cha: 2 },
      spec: { kind: 'ooze', cloth: '#6d7a72' },
      actions: [melee('Pseudopod', 3, '1d6+1+2d6', 'acid')],
      immune: ['acid', 'poison']
    },
    drake: {
      name: 'Young Drake', size: 'large', cr: '4', ac: 17, hp: 68, speed: 40,
      abilities: { str: 17, dex: 14, con: 16, int: 8, wis: 11, cha: 12 },
      spec: { kind: 'dragon', cloth: '#8a3f3a', accent: '#ffb04d' },
      actions: [melee('Bite', 6, '2d10+3', 'piercing'), melee('Claw', 6, '1d8+3', 'slashing'),
        saveSpell('Fire Breath', 'dex', 14, '6d6', 'fire', 15, 30, { uses: { max: 1, per: 'rest' } })],
      resist: ['fire']
    }
  };

  VT.srd = {
    ABILITIES: ABILITIES, ABILITY_NAME: ABILITY_NAME, SIZES: SIZES, DAMAGE_TYPES: DAMAGE_TYPES,
    SKILL_ABILITY: SKILL_ABILITY,
    CONDITIONS: CONDITIONS, CONDITION_ICON: CONDITION_ICON,
    CLASSES: CLASSES, MONSTERS: MONSTERS,
    mod: mod, profBonus: profBonus,
    melee: melee, ranged: ranged, saveSpell: saveSpell, heal: heal
  };
})();
