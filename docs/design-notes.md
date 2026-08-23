# Design notes

The long version: how each piece works and why it was built that way. If you just
want to get playing, the [README](../README.md) is what you want instead.

Virtual Tactics is an isometric virtual tabletop for D&D 5e, built to feel like
*Final Fantasy Tactics*: real elevation, cliffs you have to path around, high
ground that matters, and an initiative bar across the top.

---

## Running it

**Simplest:** double-click `index.html`.

**If you want it on a URL** (so a laptop plugged into the TV can load it, or so
browser storage behaves consistently):

```bash
node tools/serve.js
```

Then open <http://localhost:5173>.

**To hand a copy to your players**, build the whole app into one file:

```bash
node tools/build-single.js
```

That writes `dist/virtual-tactics.html` — a single ~220 KB page with every
script, style and generated sprite baked in. Email it, drop it in Discord, put it
on a USB stick. It works offline.

---

## How a session runs

The app opens on a pre-built skirmish: four level-3 heroes against an ogre and its
warband in a set of sunken ruins. Press **Roll Initiative** and play.

There are three tabs:

| Tab | What it's for |
| --- | --- |
| **Play** | Run the fight. Selected creature's statblock, HP, conditions, actions. |
| **Map** | Build the battlefield. Paint terrain, sculpt elevation, place scenery and tokens. |
| **Roster** | The campaign's cast. Edit statblocks, add monsters, assign sprites. |

On a creature's turn you get the action menu at the bottom left. Click **Move** and
the reachable tiles light up — blue is a normal step, **orange means you'll drop
and land prone**, red is standing in something that will hurt. Pick an attack and
the legal targets light up; hovering one shows your actual hit chance, the
target's effective AC, and *why* you have advantage or disadvantage.

### Controls

| | |
| --- | --- |
| Left click | Select / move / attack |
| Right click | Cancel the current action |
| Middle-drag, or hold **Space** and drag | Pan |
| Wheel | Zoom |
| **Q** / **E** | Rotate the camera 90° |
| **Home** | Re-centre and fit the board |
| **1**–**9** | Pick an action |
| **M** move · **D** dash · **V** dodge · **X** disengage · **S** stand | |
| **Space** | End turn |
| **Esc** | Cancel |
| **Ctrl+Z** | Undo (Map tab) |

---

## Building maps

The Map tab has six tools: **Terrain**, **Raise**, **Flatten**, **Props**,
**Token**, **Erase**. Brush size goes up to 5. Left click applies the tool, right
click does its inverse (lower, erase, remove).

Elevation is the important one. Every height step is **5 ft**, and it changes how
the fight plays:

- Scrambling **up** one step costs an extra 5 ft of movement.
- Climbing **two or more** steps is impossible — build stairs or go around.
- Dropping up to 10 ft is free. More than that deals `1d6` per 10 ft and knocks
  you prone, and your movement ends there.
- Being 5 ft above your target grants **advantage** (a house rule you can switch
  off — see Settings).

Terrain carries rules too: snow and moss are difficult terrain, chasms are
impassable, lava burns anything that steps in it, and scenery grants half or
three-quarters cover depending on what you're hiding behind.

Seven generators give you a starting point — open field, colosseum, canyon with
chasms, sunken ruins, crypt, volcanic ridge, castle approach — and every tile
stays editable afterwards.

---

## Custom sprites

**Drag any PNG straight onto the board.** It's imported, and if a creature is
selected it's assigned immediately.

You can also go to a creature's statblock → **Sprite…** to pick from the library.

- **Single image** — leave columns and rows at 1. Transparent PNGs around 32–128 px
  tall sit best on a tile.
- **Directional sheet** — set rows to 4 and the rows are read as
  *front, left, right, back*.
- **Animation** — set columns to your frame count and tick *Animate columns*.
- **Scale** — nudge if your art sits too large or small on the tile.

Anything without a custom sprite gets procedurally generated pixel art, derived
from its name, so a fresh campaign already has a visually distinct cast. Nothing
in this project loads an external image file.

---

## The Forge — character builder, creature editor, compendium

`builder/index.html` (or the **The Forge →** link in the top bar) is a second app
that reads a **5etools-format data set** and turns it into playable statblocks.

It ships with **no game content of its own.** It reads only what you point it at.

### Connecting your data

Two ways, on the **Data Source** dialog:

- **Local folder** *(recommended)* — pick your instance's directory, either the
  site root or its `data/` folder. No network, no CORS, works offline.
- **Self-hosted URL** — e.g. `http://localhost:8080`. Faster, but the server has
  to send `Access-Control-Allow-Origin` or the browser refuses to read it. The
  Test button tells you specifically whether it's a bad address or a CORS block,
  because those look identical to a browser and need opposite fixes.

### You should only ever pick the folder once

Two mechanisms keep it connected, and both are automatic:

1. **The parsed compendium is cached** in IndexedDB. Your 13.5k records come to
   ~18 MB, save in ~120 ms and restore in ~220 ms, against a multi-GB quota — so
   a normal start reloads instantly and never opens the dialog.
2. **The folder itself is remembered.** A browser is never told the absolute path
   of a folder you pick, and could not open one from a string if it were — but
   `showDirectoryPicker()` returns a *directory handle*, and a handle can be
   stored. Pick once with **Choose folder & remember…** and later sessions reopen
   the same folder with no dialog. If the browser downgrades the permission it
   costs one click, never navigating the folder tree again.

Loading is atomic: if you point it somewhere wrong, the probe finds nothing and
the compendium you already had is left untouched.

> **If you keep being asked to pick the folder, you are almost certainly running
> from a `file://` path.** Browsers give `file://` pages unreliable storage and
> block the remembered-folder API outright. Run `node tools/serve.js` and use
> `http://localhost:5173` — that one change makes both mechanisms work. The app
> detects this and says so in the Data Source dialog.

### What it does

**Character builder** — a seven-step wizard: race and subrace, class and
subclass, level, ability scores (point buy / standard array / rolled), background,
equipment, spells. A live sheet on the right updates as you go. It derives AC from
your armour type and Dex, HP from your hit die and Con, proficiency from level,
saving throws from your class, and turns every weapon and spell you picked into a
real attack action.

Every picker is a **scrollable browser over the complete list** — you never have
to know an option's name to find it. Each has a search box and a **source-book
filter** built from the books actually present in that list, so you can narrow
160 races to just the 9 in the PHB, or browse all of them. Long lists load in
chunks as you scroll, so the 4,528-entry bestiary is as smooth as the 30-entry
class list.

**Creature Forge** — import any monster from your bestiary, then change anything:
HP, AC, speed, ability scores, CR, resistances, and every action it has. Add a
spell as an action and it becomes a usable attack with a save DC derived from the
creature's own stats. Or start from blank.

**Roster** — where a character lives after the wizard has finished with them.
Every entry in the campaign, characters and creatures alike, with the full sheet
open for editing: level up or down, spend and restore Ki, rage, bardic
inspiration and spell slots, take a short or long rest, roll a hit die, toggle
proficiency and expertise, change any number directly, keep coin and inventory,
add gear or spells from the books, edit actions, read every feature.

It runs on the same four modules the Tale Sheet symbiote runs on — `charbuild`,
`features`, `actor` and `currency` — so a paladin's aura, a bard's expertise and
a monk's unarmoured AC come out the same number in both. The layout differs
because a browser window is not a 320px in-game panel; the arithmetic does not.

A level change on a character with build data re-derives the whole sheet and
carries gold, inventory, conditions, notes and hand-added actions across
untouched. An imported statblock with no build data falls back to arithmetic:
average hit die plus Constitution, with proficiency flowing through to derived
attack bonuses.

**Compendium** — search everything at once, with the source book shown on each
result. Click a category to show only that one, ctrl-click to combine several,
or **all** to search everything. Statblocks render properly; cross-references are
clickable; dice expressions in the text are clickable to roll.

**Homebrew** — author your own races, classes, backgrounds, spells and gear in
the UI. Forms cover the things that actually drive play: ability bonuses, speed
and traits for a race; hit die, saving throws and casting ability for a class;
effect type, damage, save DC and area for a spell; damage, properties and magic
bonus for a weapon.

Everything you write is stored in the 5etools schema and merged into the
compendium, so it appears in the builder's pickers next to published content, a
homebrew spell converts into a real attack action, and search finds it. Tagged
`HB` by default so the source filter can isolate it.

It saves to this browser and **survives reloading or switching your data
source** — homebrew is held separately and re-merged after every load, never
written into the compendium cache. Export writes one JSON file in the same
schema, so it also drops straight into a 5etools homebrew folder; import merges
rather than replacing. The Homebrew tab works with **no data source connected at
all**, so you can start writing before you set 5etools up.

Both output straight into the game's roster (same browser, same campaign) or
download as JSON.

### How the conversion works

The source data is written to be *displayed*, not executed, so this is the
interesting part. Prose like

```
{@atk mw} {@hit 4} to hit, reach 5 ft., one target.
{@h}9 ({@damage 2d6 + 2}) piercing damage plus 3 ({@damage 1d6}) fire damage.
```

is parsed into `{kind: 'melee', toHit: 4, reach: 5, dmg: '2d6 + 2+1d6', dmgType:
'piercing'}` — which the combat engine then rolls, crits and resists like anything
else. Save-based effects, area radii, Recharge, applied conditions and monster
spellcasting blocks all come across the same way.

It is exact where the tags carry numbers and best-effort where it has to read
English. Anything it guesses wrong lands in the Forge as an editable field, so a
bad guess is a two-second fix rather than a dead end.

### On source books and sharing

Worth being straight about, because it affects what you can hand to your players:

The SRD is Creative Commons (SRD 5.1 and SRD 5.2, both CC-BY-4.0) and is freely
redistributable. **The rest of the book content is not.** In August 2024 Wizards
of the Coast issued a DMCA takedown against the 5etools mirrors on exactly that
basis — that they reproduced published books more or less verbatim.

So: reading your own instance is one thing, and this tool is a client that does
only that. But `build-single.js` deliberately bundles **no data at all** — the
Forge asks for a source at runtime every time. Handing a friend `the-forge.html`
gives them the tool, not the books. That's the line worth keeping on the right
side of.

If you want something you *can* share with the whole table, point it at SRD 5.2
data in the same format and everything above still works.

---

## TaleSpire symbiote

If your table plays in **TaleSpire**, there are two symbiotes: **Tale Sheet**
(`tale-sheet/`), a character sheet that rolls through TaleSpire's own dice tray,
and **Tale Shop** (`tale-shop/`), a GM-run shop window for the party to browse.

Build it, then install:

```bash
node tools/build-symbiote.js
```

That writes `dist/tale-sheet/` and `dist/tale-shop/` — self-contained folders.
Copy them into:

```
%AppData%\..\LocalLow\BouncyRock Entertainment\TaleSpire\Symbiotes\
```

### What it does

- **Edit and level up in-game** — the Edit tab changes anything: level, ability
  scores, AC, HP, speed, and every action. Levelling **re-derives** from the
  original build (hit points, proficiency, attack bonuses, and cantrip scaling
  all update), keeping damage taken, conditions, spent uses and anything you
  added by hand. Add weapons, armour and spells straight from your 5etools data,
  or write a custom action by hand.
- **Tracks coin** — platinum through copper, with a Spend/Earn box that takes
  "12 gp 5 sp" and refuses what you cannot afford. Per-denomination editing lives
  in the Edit tab, and your purse is mirrored to the GM.
- **Rolls into the dice tray** — ability checks, saving throws, all 18 skills,
  attacks, damage, initiative, death saves. Advantage and disadvantage put two
  sets in the tray, then publish only the winning one (the pattern TaleSpire's
  own dice-roller example uses). A **Crit** toggle doubles damage dice, not
  modifiers, and clears itself after one use.
- **Builds characters in-game** from the same 5etools data — race, subrace,
  class, subclass, background, point-buy or rolled abilities, gear and spells.
- **Applies class features mechanically.** Expertise doubles proficiency and
  Jack of All Trades adds half to everything else; a paladin's Aura of Protection
  lifts every saving throw; Divine Smite, Sneak Attack, Cutting Words, Second
  Wind and a monk's Martial Arts appear as real, rollable actions; Unarmored
  Defense sets AC from DEX plus CON or WIS. Features that are wired up are
  tagged **applied** and carry a one-line reminder.
- **Tracks resources and spell slots** — Ki, Rage, Bardic Inspiration, Channel
  Divinity, Superiority Dice, Lay on Hands, Sorcery Points, Action Surge, and
  slots for every caster progression including warlock pact magic. Short and long
  rests restore the right ones.
- **Lists every class and subclass feature** you have earned, grouped by level,
  with the printed text one tap away. Ability Score Improvements are a real
  choice (+2 to one, or +1 to two) feeding back into scores, attack bonuses and
  save DCs.
- **Runs play** — HP, temp HP, conditions, limited-use abilities, skill
  proficiency toggles, and rests. A short rest lets you **spend hit dice**, which
  roll in the tray like anything else and heal you by the result; a long rest
  returns half of them.
- **Everything is directly editable.** Current HP, max HP, temp HP, base AC, an
  AC bonus, hit dice, ability scores, spell DC — all typed in by hand in the Edit
  tab, and nothing recalculates them behind your back. Conditions that change AC
  (Hasted +2, Shielded +5) apply on their own and show why: *AC +2 hasted*.
- **Keeps an inventory** — somewhere to put what you buy in Tale Shop.
- **Imports** a statblock exported from the Forge, or a whole `.vtcampaign` file.

Characters live in TaleSpire's campaign symbiote storage, so they follow the
campaign rather than the machine.

### Connecting your 5etools data

On start the symbiote reconnects by itself, in order of least friction: warm
cache → remembered folder → a `data` folder sitting next to its own files. It
only asks for anything if all three miss.

Setup tab, three options:

- **Choose folder & remember…** — pick once; the directory handle is stored and
  reopened silently next time.
- **One-time pick…** — reads the folder now without remembering the handle. The
  parsed result is still cached, so you normally will not be asked again anyway.
- **Use bundled ./data** — drop your 5etools `data` folder into the symbiote's
  own folder. Zero dialogs, ever. This is the most robust option for a symbiote,
  since it does not depend on browser permissions at all.

The sheet works without any data; you just can't build new characters in-game,
only import them.

### GM view

The symbiote carries an interop id, so every copy at the table can talk to the
others. Players mirror a compact read-only summary of their sheet (~850 bytes);
whoever is running the game sees **The table** in the Party tab: everyone's HP,
AC, conditions, abilities and actions, live.

From there the GM can apply damage or healing, toggle a condition, and ask any
player for a specific saving throw — the request lands on that player's sheet and
*their* copy performs it, so the dice still go through their tray and nothing
desynchronises if someone closes the panel. Players can switch the mirror off in
the Party tab.

It needs every player to have the symbiote open. `runInBackground` is declared,
so it keeps working while the panel is hidden, and a hidden panel raises a
TaleSpire notification when the GM asks for something.

## The choice tree

Fighting styles, eldritch invocations, metamagic, battle-master maneuvers,
artificer infusions, arcane shots, runes, elemental disciplines, pact boons,
feats, epic boons, subclasses, skill proficiencies, cantrips and prepared
spells — everything your classes let you pick, on the **Choices** step of the
Forge's character builder, the **Roster** tab, and the symbiote's **Edit** tab.

It is a reader, not a table. 5etools stores this properly, in five fields:

| Field | What it drives |
| --- | --- |
| `class.optionalfeatureProgression` | fighting styles (2014), invocations, metamagic, pact boons |
| `subclass.optionalfeatureProgression` | maneuvers, infusions, arcane shots, runes, elemental disciplines |
| `class.featProgression` | 2024 fighting-style feats and epic boons |
| `classFeatures[].gainSubclassFeature` | the level a subclass is chosen |
| `classTableGroups` / `cantripProgression` | cantrips known, prepared spells |

So adding a book adds its options with no code change, and the counts are the
real ones from the class table — a 2024 warlock has five invocations at 5th
level because that is what the progression array says, not because anyone typed
a five.

**Prerequisites are enforced and explained.** An option you cannot take is
greyed with the reason: *needs level 5 in Warlock*, *needs Pact of the Tome*,
*needs CHA 13*. They open up as you level. At 2nd level a warlock has 38 of 59
invocations locked; at 12th, 12.

**Both printings are handled.** 2024 reprinted most 2014 options under the same
names — 20 of the 43 battle-master maneuvers, 23 of the 82 invocations. Offering
both would let you take Ambush twice and bury the real choices in duplicates, so
each name appears once, in the printing that matches the class you actually
took.

**Picks become mechanics, not just text.** Defense is +1 AC. Archery is +2 to
hit with ranged weapons and nothing else. A feat that raises an ability score
does so from the record's own `ability` field — 55 of the 77 2024 feats carry
one — and asks which score when the field says "choose", including an epic
boon's cap of 30. A cantrip you pick becomes a rollable attack, and Agonizing
Blast adds your Charisma to its damage.

Everything else is listed with its full printed text, tagged with what it did if
it did anything. The honest boundary is the same as the feature engine's below:
"reroll 1s and 2s on damage" is not a number a statblock can hold.

---

## Level scaling and upcasting

**Scaling with level happens on its own**, because every level change re-derives
the sheet from the class tables:

| | |
| --- | --- |
| Bardic Inspiration | d6 → d8 at 5th → d10 at 10th → d12 at 15th |
| Sneak Attack | 1d6 → 2d6 at 3rd → 6d6 at 11th → 10d6 at 20th |
| Martial Arts | 1d4 → 1d6 at 5th → 1d8 at 11th → 1d10 at 17th |
| Cantrips | Fire Bolt 1d10 → 2d10 at 5th → 3d10 at 11th → 4d10 at 17th |
| Resources | Rage, Ki, Channel Divinity, Lay on Hands and the rest, from the class table |

Cantrips scale on **character** level, which is what the rule says and what
matters for a multiclass character.

**Upcasting** is a slot picker under every levelled spell on the sheet. Pick the
slot, see what the spell does at that level, and **Cast** spends it:

- **Fireball** 8d6 at 3rd, 10d6 at 5th, 14d6 at 9th
- **Cure Wounds** 2d8 at 1st, 4d8 at 2nd, 18d8 at 9th
- **Magic Missile** three darts at 1st, five at 3rd, eleven at 9th
- **Scorching Ray** three rays at 2nd, ten at 9th

5etools writes the rule into `entriesHigherLevel` and, for damage and healing,
writes it machine-readably — `{@scaledamage 8d6|3-9|1d6}` means 8d6 at 3rd plus
1d6 per level above. The other common shape is prose regular enough to read:
"one more dart for each spell slot level above 1". Both are handled; anything
stranger keeps its printed higher-level text and casts at its base numbers.

Warlock pact slots appear in the picker as **P**, so a Paladin/Warlock can
choose which pool to spend. Dice are merged rather than listed — 8d6 plus two
lots of 1d6 is `10d6`, because a dice tray with ten separate entries is
unreadable and crit doubling has to see one term.

### One thing the battle map still does differently

A spell that deals damage but names neither a saving throw nor an attack roll —
Magic Missile is the obvious one — **hits automatically**. The sheets say so and
roll it straight. The battle map has no "just hits" action kind, so it still
resolves such a spell as a Dexterity save. On the map, treat that save as
automatically failed.

---

## Importing a converted supplement

`tools/import-guide.js` turns a fan supplement's plain text into the **same
5etools schema the books use**, so its content is not a special case anywhere:

```bash
pdftotext -enc UTF-8 guide.pdf guide.raw.txt      # a PDF is the better source
node tools/clean-pdf-text.js guide.raw.txt guide.txt
node tools/import-guide.js guide.txt homebrew/guide.vthb.json --source ABC --map tools/guides/abc.json
```

### Getting it to every app at once

Put the file in a **`homebrew/` folder inside your 5etools data**, beside
`data/`, and every app that reads that folder picks it up on load — the Forge,
the Tale Sheet symbiote, and any other machine at the table pointed at the same
place. Nothing to import per device.

```
5etools-v2.33.3/
  data/                       the books
  homebrew/
    dark-sun.vthb.json        the converted supplement
    index.json                { "toImport": ["dark-sun.vthb.json"] }
```

`index.json` is 5etools' own convention and is only needed when the data is
served over http, where there is no directory listing. If you connect a folder
directly — which is what both apps do by default — the folder is listed and the
index is ignored.

The alternative, for a one-off file someone sends you, is an explicit import:
the Forge → **Homebrew** tab → **Import**, or the symbiote's **Setup** tab →
**Import a file**. A converted race is offered by
the character builder beside a PHB one; a converted subclass appears in the
choice tree with its features at the right levels; a converted class is a class.

`clean-pdf-text.js` undoes what the conversion did to the text: ligatures the
font dropped (one `U+FFFD` per lost pair, "ti" almost always but "ft" in a
closed set — guess "ti" everywhere and "after" becomes "atier"), doubled letters
flattened to one, and words hyphenated across a line break. `import-guide.js`
then handles the layout: page numbers stranded on their own lines, headings
glued onto the paragraph beneath them, and paragraphs that arrive either
one-per-line or wrapped mid-sentence.

**The side-car matters.** `tools/guides/*.json` names each book's subclasses and
subspecies, transcribed from its own contents page. Telling a subclass from its
first feature is a question about page layout, not about language — the
heuristic fallback gets it wrong often enough that a feature ends up in the
choice tree as a path you could take. Where the book states the answer, use the
book.

The importer prints what it could not work out rather than guessing, and says
which of the listed subclasses it failed to find.

Imported content is never hidden by the choice tree's source filter: a
supplement you converted yourself is not "some other book you did not ask for".

### Spells a setting adds — and takes away

A converted spell carries `classes.fromClassList`, which is how a record says
who may cast it, so an added spell reaches the right class lists without
touching `data/spells/sources.json`.

A setting can also **remove** spells. Athasian clerics lose Create Food and
Water and Flame Strike; Athasian druids and rangers lose Conjure Woodland
Beings, because Athas has no friendly forest sprites. That is carried by a
`spelllistchange` record, and the spell picker says how many a setting took off
the list rather than leaving a player to wonder where Flame Strike went.

The removals are transcribed into the side-car for the same reason as the
subclass list: they name Player's Handbook spells the importer has no copy of,
in a column-major table whose names cannot be split apart by position.

---

## Multiclassing

On the sheet — the Forge's Roster tab and the symbiote's Edit tab — and in the
character builder. Each class has its own level stepper and its own subclass;
**+ Multiclass…** adds another.

- **Requirements are checked when they can be.** The character builder asks for
  a class before it asks for ability scores, so on that step the requirement is
  shown against each class but not enforced — otherwise every class fails
  against the default 8s and the whole list is dead. The Choices step then warns
  about anything still unmet once the scores exist, and the sheet, where the
  scores are known, blocks properly.
- **Requirements are checked at both ends.** 5e asks that you qualify for the
  class you are leaving as well as the one you are joining, and the reason is
  shown on the row: *needs DEX 13*, *Fighter needs STR 13, or DEX 13 to
  multiclass out*. 2014 classes carry `multiclassing.requirements` outright;
  2024 classes use the primary ability, which is what the rule became.
- **Spell slots come from one combined caster level**, read off the full-caster
  table — not from adding each class's own row together. A Cleric 3 / Wizard 3
  is a 6th-level caster with 3rd-level slots.
- **Warlock pact slots stay separate**, and only they come back on a short rest.
  A Paladin 6 / Warlock 3 has 4×1st and 2×2nd from its caster level, plus two
  pact slots at 2nd level alongside.
- **Half-casters round the way their book says.** The 2014 paladin rounds down
  and has no slots at 1st level; the artificer — and the 2024 paladin and
  ranger, which 5etools marks with the same code — rounds up and has them from
  1st.
- **Hit dice, saves and proficiencies** follow the book: the first class gives
  its die at maximum and its full proficiencies, later classes give their own
  die and the shorter multiclass list. **No edition grants saving-throw
  proficiencies on a multiclass**, so neither does this.
- Each class casts off its own ability, so a Cleric/Wizard has two save DCs. The
  sheet leads with the highest and lists the rest.

Levelling one class leaves the others alone, and gold, inventory, conditions,
notes, hand-added actions and every choice already made carry across untouched.

Mixing a 2014 and a 2024 class is deliberately not offered: it would give one
character two incompatible feature trees for the same twenty levels.

### What the feature engine does and does not do

5etools stores features as prose. There is no machine-readable "this grants
expertise in two skills" field anywhere in the data, and no amount of parsing
gets one reliably out of English. So `src/data/features.js` is a **curated
table**: the core features of the PHB classes mapped to a small vocabulary of
effects — resources, actions, expertise, save bonuses, AC formulas, speed.

Everything outside that table still appears with its full printed text; it simply
is not wired to anything. Adding a feature is a two-line change to plain data.

Choices — fighting styles, feats, metamagic, invocations, maneuvers — are the
choice tree above, and are picked properly rather than written in Notes.

One thing worth knowing: a full data set carries **both the 2014 (PHB) and 2024
(XPHB) printing of every class**, each with its own feature tree. Features are
matched to the printing of the class record you actually picked, so a bard gets
two Expertise features and not four.

### A 5etools quirk worth knowing about

5etools records a race's **default ability bonuses on a subrace with no name at
all.** The base `Human` record has no `ability` field anywhere in it — the
standard Human's +1 to every score lives on a nameless subrace, and the same is
true of Dragonborn, Half-Elf, Half-Orc and Tiefling. Any importer that keys its
records by name drops those rows on the floor and silently builds humans with no
racial bonuses whatsoever.

The loader now keeps them, flagged, and treats one as the race's default when no
subrace is chosen. The race step shows the bonuses you are actually getting,
free-choice increases like Variant Human's included, so a silent zero cannot
happen again.

### Two honest limitations

- **Board state is read-only** for symbiotes. Linking a mini shows its board HP
  beside your sheet, but the sheet cannot write HP back to the token. That's an
  API restriction, not an oversight.
- **I could not test this inside TaleSpire.** The logic is verified against a
  faithful emulation of the API (`ts-shim.js`) that returns results in the real
  payload shape — advantage picked the higher roll in 50 of 50 trials — but the
  first run in the actual game is still the first run in the actual game.

The character derivation lives in `src/data/charbuild.js` and is shared with the
Forge, so a level-5 dwarf fighter comes out identical in both: AC 18, 49 HP,
+3 proficiency, STR/CON saves, 25 ft.

---

## Tale Shop

A shop window the GM runs and the party browses. `dist/tale-shop/`.

Every shop has a **shopkeeper** — a procedurally generated portrait in the same
pixel style as the game's creatures, with a name and a greeting the party sees
when the shop opens. Replace the portrait with your own image, reroll the face,
or write your own line.

### GM

**Preview** shows exactly what the party sees — the same public shop object they
actually receive, so the preview cannot drift from the real thing.

**Shops** is your shelf. Build one from a template — General Store, Blacksmith,
Fletcher, Alchemist, Magic Emporium, Inn & Tavern, Stable, Temple, or Empty —
and it stocks itself from your own item data. **Open to party** and everyone sees
it live. Shops are saved per campaign, reusable, and duplicable.

**Edit** changes anything: name, keeper, blurb, a price multiplier, and the stock
itself — quantities (`-1` is unlimited), prices, removals, anything from your item
data, or invented items. Players only ever see the adjusted price, never your
margin.

Adding goods is a search box over a short result list, not one dropdown holding
every item in your books: a native `<select>` that long misbehaves inside the
embedded webview, and is unusable in a narrow panel even when it opens.

### Players

The open shop appears by itself. Browse, pick a quantity, press **Buy**.

**Stock is authoritative on the GM's copy** — a purchase is a request their shop
applies and re-broadcasts, so two players cannot both take the last potion. Ask
for five when one remains and you get "Only 1 × Acid left."

### Pricing

5etools stores item values in copper, so list prices come straight from your
books. But **most magic items carry no price at all** — the books decline to give
one — so a Magic Emporium stocked naively would be a wall of dashes. Unpriced
items fall back to the DMG's rarity bands (common 75 gp, uncommon 300, rare
2,500, very rare 25,000, legendary 100,000), halved for consumables, and are
labelled *est. price* so you know it is a starting point. Artifacts are excluded:
they are not for sale.

Stock is sampled across the whole price range rather than taken cheapest-first,
then shelved alphabetically — otherwise every shop opened with a wall of 2 cp
blowgun needles.

About 11% of items (294 of 2,658 in a full set) cannot be priced at all —
artifacts, and magic items the books list as rarity *unknown*. Those are kept out
of generated stock, and if you add one by hand the shop says so rather than
shelving it silently at nothing.

### Currency

Standard D&D coins by default. Rename them or change their values in Setup for
another setting; everything is stored as an integer count of the base unit, so
prices convert automatically and never drift. Platinum and electrum are carried
and displayed but never used to quote a price or make change, because no table
says a longsword costs "1 pp 5 gp".

### One deliberate limitation

Buying does **not** deduct coin. A symbiote cannot reach another symbiote's
storage, so Tale Shop reports the price and Tale Sheet's **Spend** button does
the deduction. Both speak the same coin format, so `12 gp 5 sp` pastes across.

---

## Treasure

A hoard is **a shop with nothing to pay**: the same model, the same stock list,
the same broadcast, the same player window, with `free` set. Making it a flag
rather than a second kind of thing means every improvement to shops — the
shopkeeper, the preview, import and export — lands on treasure too.

**Roll it off the book's tables.** `data/loot.json` is one of the more completely
machine-readable parts of the data: a hoard is a CR band with a coin formula and
a d100 table whose rows point at the gem, art-object and magic-item tables.

    coins: { cp: "6d6*100", sp: "3d6*100", gp: "2d6*10" }
    { min: 7, max: 16, gems: { type: 10, amount: "2d6" } }
    { min: 51, max: 60, item: "{@item Spell Scroll (Cantrip)}" }

So the generator rolls rather than invents — every coin, gem and item came off a
table — and a hoard generated twice differs both times, for the same reason it
would at the table. Rolled items are matched back to real item records where one
exists, so they carry their own rarity and attunement.

Everything stays editable: a rolled hoard is just a stocked shop.

### What it looks like

A hoard draws its own picture, chosen by what it is worth, so the party can tell
a looted corpse from a dragon's bed before reading a word:

| Scene | Worth up to |
|---|---|
| a skull and a spilled purse | 100 gp |
| a bound strongbox | 2,500 gp |
| a heap of coin | 25,000 gp |
| a dragon's bed, crowned and gemmed | above that |

They are drawn on a 16x16 canvas rather than shipped as images — the symbiote
folder stays small and the pixels match everything else — and seeded from the
hoard's own id, so the same treasure looks the same every time it is opened.
The GM can override the scene, name the reward, and write a tagline that is read
out in place of a shopkeeper's greeting.

### Splitting the coin

Loose coin is split in **base units**, and the remainder goes round one coin at
a time rather than vanishing: a party that finds three copper and splits it four
ways still has three copper afterwards. The split defaults to however many other
people are at the table, and each share is sent straight to that player's purse.

A share with nobody to send it to **stays in the hoard** rather than being
quietly destroyed, so the GM can hand it over another way.

### Items go straight to the player's sheet

Tale Sheet and Tale Shop now **share an interop id**, which is what lets one
symbiote message the other, and the sheet listens for the shop's protocol as
well as its own — but only for `grant`, since the rest of what the shop says is
between it and the GM. Taking something from a hoard sends it to the
taker's character: items stack into the inventory, coin is added to the purse,
and a toast says what arrived. Nothing is destructive — a grant only ever adds.

That also fixes a limitation the shop used to state outright: buying no longer
ends at "deduct the coin yourself".

---

## Shopsmith — the shop editor

`shopsmith/index.html` is the browser-side twin of Tale Shop: the same shop
model, on a full screen with a keyboard. Build and stock shops at your desk,
then **Export** a `.taleshop.json` and import it in Tale Shop at the table.

It has the same nine templates, a searchable item picker, a spreadsheet-style
stock table, the shopkeeper editor, and a **Player view** that renders the
identical public shop object the party receives — so what you see is what they
get. Shops are saved in the browser and export singly or all at once.

Treasure works there too: roll a hoard off the same CR bands, choose its scene,
name it, write its tagline and set its coin, then export it in the same file. A
hoard is a shop with a flag, so it travels the same road. Both ends now share
one import/export path, so a file written by either is normalised the same way.

---

## Running the symbiote's sheet inside the Forge

The Forge's Sheet tab is not a second character sheet. It is `tale-sheet/sheet.js`
itself, loaded into the Forge page - two thousand lines of rolling, resting,
levelling, slots, death saves, attunement and wild shape that would otherwise
have to exist twice and drift apart, with the copy always being the stale one.

Three things have to be arranged for it to run outside TaleSpire:

**The DOM.** sheet.js looks up `#view` and `#toast` at boot, and boots on a
timer, so the skeleton lives in `builder/index.html` from the start and is
parked out of the way until the tab is opened - built on demand it would not
exist when the sheet went looking.

**Storage.** In the symbiote a character lives in TaleSpire's campaign storage.
Here it should be the Forge's roster, so an adapter maps the sheet's blob onto
`VT.store.campaign.roster` - the same objects the Roster tab edits. The roster
array is mutated in place rather than replaced, because the Roster tab holds a
reference to it. The sheet also reads its state only once at boot, which is
right when it owns its storage and wrong when another tab is editing the same
list, so `VT.sheetApp.reload()` exists for a host to call.

**Dice.** The dev shim already rolls for real and returns results through
`onRollResults`; it just had nowhere to show them. The roll log chains that
handler rather than replacing it - the sheet uses those same results for death
saves and hit dice, and quietly stealing them would break it in ways that only
appear mid-fight.

### Spells and their slots in one place

Spells used to be mixed into the Actions card, and the slots that pay for them
lived in a separate card further down. That meant a caster's actual attacks were
buried under forty spells, and answering "can I cast this" took two trips.

They are one card now, grouped by level, with each level's slots at the head of
its own section - cantrips first at will, then 1st level with its 4/4, and so
on. That is D&D Beyond's arrangement and it is right for the same reason: what
you can cast and what you have left to cast it with are the same question.

A level with slots but nothing prepared still gets a row, because an empty 3rd
level is how you notice you can upcast into it. Warlock pact slots keep their
own row, being a separate pool on a separate timer.

This lives in sheet.js, so the symbiote and the Forge both have it.

### Sections, not columns

The sheet is one long strip, which is right in a phone-width panel and tiring on
a monitor. The first attempt at that set `columns: 2`, which was worse: a
multi-column flow runs down the first column and back up to the top of the
second, so reading one character means scrolling down, up, and down again.

Sections instead. The cards keep their order and their single column - Play,
Magic, Gear, Character - and only one section is on screen at a time, which is
the part that was actually tiring. Nothing restructures the sheet's DOM: each
card is tagged with an attribute and CSS hides the rest, so sheet.js can
re-render whenever it likes and a MutationObserver simply tags them again.

Cards title themselves with an `h3`, except the collapsible ones - Skills,
Features, Choices - which use a `summary`. Reading only the `h3` put all three
in the wrong section, silently, because a card with no heading falls to the
default bucket rather than erroring.

The sheet's own Edit and Build tabs are left whole; sections apply only to the
Sheet tab, where the card count is the problem.

### Sizing it for a monitor

sheet.css is written for a phone-width panel in TaleSpire: 11px labels, 9px stat
captions, buttons sized for a thumb. Dropped into a 1600px page that reads as a
postage stamp in the middle of an empty desk.

The scaling happens in the same pass that scopes the selectors - lengths that
control apparent size are multiplied on the way past. An override list in
sheet-embed.css would have had to name every size in the file and would have
fallen out of step the first time one changed. Borders and radii are left alone,
because a 1px rule scaled to 1.3px is just a blurry 1px rule.

Two traps, both of which produced silent wrongness rather than errors:

**Do not walk `style[i]`.** Iterating a declaration block yields the *longhands*
of any shorthand, and a shorthand written with a `var()` - `background:
var(--panel)`, `border: 1px solid var(--line)` - cannot be decomposed before it
is computed, so every longhand comes back as the empty string. Doing that
stripped the background and border off every card while looking perfectly
reasonable in the code. Rewrite `cssText` instead.

**`font-size` may come back as `font`.** The browser re-serialises font-size,
font-family and line-height into the shorthand, so a font-size-only match misses
the one rule that sets the base size for the entire sheet.

Cards are laid out in a **grid**, not CSS columns - `auto-fit` so a section
holding one card lets it grow instead of stranding it in a narrow track, with a
max-width per card so a lone one stops at a readable width rather than becoming
a 1500px line of text.

### The stylesheet was the hard part

`sheet.css` was written for a page it owns: `:root` variables, `html`/`body`
sizing, `#app` filling the viewport, and plain names like `.card`, `.btn` and
`.row`. The Forge uses all of those. Loading it as-is put the Forge's own
toolbar through a hedge.

A hand-scoped duplicate would drift the first time either file changed, and
`tale-sheet` is what the table actually runs so it cannot be bent to suit an
embedder. So the rules are rewritten at load instead: walk the parsed
stylesheet, prefix every selector with `#sheetHost`, re-point the three that
mean "the whole page" at the host element, and disable the original. One copy of
the file, scoped automatically, nothing to keep in step by hand.

`*` is worth calling out - mapping it to the host alone silently dropped
`box-sizing: border-box` from every element inside the sheet. It has to become
the host *and* its descendants.

---

## Equipment you can take off

Armour used to be picked once at build time and then exist only as a name and an
AC number. That made three things impossible at once - seeing your armour in
your inventory, taking it off without deleting it, and applying the penalties
that come with wearing it - and they are all the same missing idea: equipment is
something you own that may or may not be worn right now.

So an inventory entry can carry a `gear` record and an `equipped` flag, and
armour class, Stealth and speed are all derived from what is equipped. Taking
off plate is unsetting a boolean; the plate is still in the bag.

Three penalties were simply absent. Heavy and medium armour give disadvantage on
Stealth. Armour with a Strength requirement you do not meet costs 10 feet. And a
monk's Unarmored Movement and a barbarian's Fast Movement both stop - which is
what the word "unarmoured" in the feature name has been saying all along, while
the code handed a monk in full plate the fastest speed on the board.

**Two bugs this uncovered**, both from the same root: `features.apply()` was
never meant to run twice.

Equipping something has to re-run the feature pass, because Unarmored Defense
and the speed features depend on what is worn. But the pass did
`actor.speed = actor.speed + bonus`, mutating rather than computing - so a
barbarian who put plate on and took it off twice ended up at **zero speed**.
Speed is now recomputed from a stored `baseSpeed` every time, which makes the
pass idempotent.

The second was ordering: the gear was being built a hundred lines before
`a.inventory = U.clone(c.inventory || [])`, which then silently threw it away.
The armour existed, had the right AC, and appeared nowhere.

### Speed features, swept

Seventeen class features mention increasing speed. Only two are permanent and
were implemented; three more were permanent and missing (Fast Movement, Superior
Mobility, Roving / Deft Explorer). The other twelve - Bladesong, Dread Ambusher,
Blade Flourish, Drunken Technique - are *activated*, and applying them passively
would be wrong, so they are deliberately left out rather than forgotten.

---

## The ranger's companion

Three different things are called a companion and they do not work alike: the
2014 Beast Master picks any beast of CR 1/4 or lower, the Primal Companion picks
one of three fixed stat blocks, and the Drakewarden gets a drake. The latter two
scale with ranger level.

The scaling ones are the whole difficulty, because their numbers are not numbers
in the data - they are English:

    ac: [{ special: "13 + PB (natural armor)" }]
    hp: { special: "5 + five times your ranger level" }

`convert.creature` reads the leading digits and stops, which gives a companion
**5 hit points**. Its attack is worse: `{@hitYourSpellAttack}` cannot become a
number without knowing the ranger, so the Maul came out as an ability with no
attack roll at all, and `{@damage 1d8 + 2 + PB}` had the proficiency bonus
guessed at 2 - correct only up to 4th level.

All of it is resolvable at the point where the owner is known, so that is where
it happens. Anything that cannot be resolved is said out loud on the panel
rather than quietly guessed at.

---

## Wild Shape, without swapping the character out

Wild Shape is not a modifier - it is a second stat block. Beast form replaces
AC, hit points, speed, size and attacks, while you keep your own mental scores,
proficiencies and features.

The obvious implementation is to push the character aside and adopt the beast.
The obvious implementation is also the one where a bug costs somebody their
character, because it has to put them back correctly and there is no undo at a
table. So a form is built as a **separate object shown beside the sheet**.
Dismissing it deletes one field and touches nothing else, and the character's
own hit points are provably untouched while shifted - which is the property
worth having.

The beast keeps its own hit points on that object, because that is the number
actually being tracked: damage goes to the form until it drops.

The beast's attacks are rendered through the sheet's own `actionRow`, extracted
for the purpose rather than reimplemented, so advantage, the crit toggle and the
dice tray behave identically whether a bear is biting or a monk is punching.

**One trap worth recording.** `convert.crOf` returns the printed challenge
rating as a *string*: `"1/2"`, `"24"`, or null. Comparing that to a number half
works - `"24" > 1` coerces and behaves - but `"1/2" > 0.25` is `NaN > 0.25`,
which is false, so every fractional CR silently passed whatever limit was set
and a 2nd-level druid was offered CR 1/2 beasts. Parsing the fraction first
fixes it; the half-working coercion is what made it invisible.

The level limits bound what is *offered*, and there is a button to ignore them,
because the list is a convenience and the last word at a table is never the
software's.

---

## Reading actions out of feature text

`features.js` is a curated table and says, correctly, that you cannot read an
arbitrary game effect out of English. But two shapes are not arbitrary. Attacks
and saving-throw effects are written to a house style that barely moves across
twenty years of books:

    a ranged spell attack with a range of 30 feet ... you add your Dexterity
    modifier to its attack and damage rolls ... its damage is radiant, and its
    damage die is a d4

Everything a clickable action needs is stated outright. `data/featuretext.js`
reads exactly those two shapes and refuses everything else, which turns about
thirty more features into rollable actions — Radiant Sun Bolt, Quivering Palm,
Radiance of the Dawn — with nothing hand-written.

**The rule is all-or-nothing.** A missing action leaves you reading the feature
yourself, which is where you already were. A wrong one is a sheet that lies. So
every part must be found in the text or nothing is produced, and four guards
exist because each one caught a real error during development:

| guard | what it caught |
|---|---|
| a d20 or d100 is never damage | *Tales from Beyond* rolls 1d20 on a table; it became a 1d20 attack |
| the type word needs the noun "damage" beside it | "you can **force** it to make a save" became force damage |
| more than one damage type named anywhere ⇒ abstain | "Bludgeoning, Piercing, or **Slashing damage**" made a slashing attack out of a damage-reduction reaction |
| text over 1500 characters is a container | *Psionic Disciplines* is thirty abilities under one name; one was picked arbitrarily |

The cost is false negatives, deliberately. *Wrath of the Storm* deals "lightning
or thunder damage (your choice)" and is refused, because there is no way to pick
from here. That is the right trade: the sheet marks everything it inferred with
**read from text**, so a player knows which numbers to glance at, and an action
it declined to guess at is one they were always going to read anyway.

A third shape was added later: healing. It is narrower than the other two,
because "hit points" appears in half the features in the game - the die has to
sit directly against the words that spend it. That is what turns the Stars
druid's Chalice into a rollable heal.

Two phrasings were costing more than they looked. The books say "targets one
creature **within** 60 feet" far more often than "a range of 30 feet", and
"1d8 **+ your** Wisdom modifier" as often as "you **add your** Dexterity
modifier". Missing either silently dropped every feature written that way,
Circle of the Stars' Archer among them.

**Later features that improve earlier ones** are read too, from one sentence
shape: "The {@damage 1d8} of the Archer and the Chalice becomes {@damage 2d8}"
names the features, the die it replaces, and the replacement. Without it a
10th-level Stars druid is shown 1d8 for an attack that has dealt 2d8 since they
levelled - the sheet being confidently out of date, which is the failure this
whole file exists to avoid.

Save DCs follow the same discipline. Most features name one ("against your spell
save DC"); a few lean on a class DC the table already set, so the monk's Ki save
DC is supplied and everything else abstains rather than inventing a number.

---

## The interop id is not optional

`api.interop.id` in the manifest is what makes `TS.sync.send` work at all.
Without one every call rejects with `symbioteManifestMissingInteropId`, and the
docs are explicit: it is "needed to use 'sync' calls in the API."

It is easy to read the name as being only about *inter*-symbiote messaging - one
symbiote talking to a different one - and conclude a symbiote that only talks to
copies of itself does not need it. That is wrong, and wrong in a way that hides:
everything works on one machine, where there is nobody to sync with, and fails
the moment a second person joins.

The id must be a UUIDv4, and ours are now **one per symbiote** rather than a
shared one. Sharing an id is the documented way to let two different symbiotes
message each other, and Tale Shop originally used it to write into Tale Sheet
directly - but TaleSpire would not load them while they shared one, and neither
needs it: each only has to reach its own copies on other clients, which works
because every player runs the same symbiote and so carries the same id.

Handing loot between them is done with a copied code instead, which needs no
link between the two symbiotes at all.

The build refuses to produce a symbiote whose manifest has no interop id, whose
id is not a valid UUIDv4, or whose id collides with the other symbiote's. The
dev shim reads the real manifest and rejects `sync.send` exactly as TaleSpire
does when the id is missing. Both guards exist because the failure is invisible
in single-machine testing, which is the only kind of testing that is cheap.

---

## Messages have to fit in 500 characters

`TS.sync.send` refuses any payload longer than 500 characters:

    sync failed: Error: string too long: max length is 500, length was 3853

It rejects the whole message rather than truncating it, and the rejection
arrives as a promise rejection nobody was reading closely, so the symptom is not
an error at the table - it is simply nothing happening. A shop with its stock is
around 3,500 characters and a mirrored character sheet about 700, so in practice
**every message that mattered was being dropped** while every small one got
through. Opening a shop did nothing; the Party tab stayed empty.

`src/core/sync.js` puts each message out in frames instead:

    VTF|<msgId>|<index>|<total>|<chunk of the payload>

Plain text, deliberately. Wrapping a chunk of JSON inside another JSON object
escapes every quote in it, which inflates the exact thing being kept small - by
about a third for our payloads, and unpredictably enough that a frame sized
against the limit could still cross it.

Frames are budgeted in **UTF-8 bytes**, not characters. The limit is stated in
characters, but being wrong in that direction loses the message with no way to
tell, and counting bytes is never an underestimate. The chunker also refuses to
split a surrogate pair, so an emoji in a shop name cannot arrive as two broken
halves.

Reassembly is keyed by sender *and* message id, so two people talking at once
cannot interleave into each other's message, and indexed rather than sequential,
so frames may arrive in any order. Half-assembled messages are dropped after
thirty seconds. If a frame is genuinely lost the message never completes and the
player sees nothing - which is what the **Check again** button on the Shops tab
is for.

The dev shim now enforces the same limit. It did not before, which is the whole
reason this shipped: everything worked perfectly against the shim and failed
against the real thing. A fake that is more permissive than what it stands in
for will eventually cost you exactly one bug of this shape.

---

## Reading results back from the dice tray

The symbiote does not only put dice in the tray — it **reads the result back**.
Every roll it starts is tagged, and `onRollResults` picks its own out, evaluates
the group, and does something with the number. That is how advantage already
works (both dice roll, the better is kept and sent back to the tray) and how a
hit die already heals you without being told.

Two things now use it:

**Death saves are tracked.** Rolled in the tray, recorded on the sheet: three
successes and three failures as pips, because that is how the rule reads. The
result is judged on the **face of the die, not the total** — a natural 20 stands
you up on 1 hit point and clears the count, a natural 1 costs two failures.
Damage taken while already at zero is itself a failed save, and two if the hit
was a critical. Three failures says so plainly. The pips are clickable, for when
the table has already rolled somewhere else.

**Tool checks work.** Tool proficiency is now part of a character. 5etools
writes it as tagged prose rather than a list —

    "{@item thieves' tools|PHB}"                      a fixed grant
    "Choose three {@item Musical Instrument|XPHB}"     a choice

— so a single tagged item with no words of choosing is granted outright, and
anything else becomes a choice in the choice tree, drawn from the right category
of tool. A rogue gets thieves' tools; a bard chooses three instruments; a monk
chooses one artisan's tool or instrument.

The sheet then rolls it with proficiency applied. Which ability a tool check
uses is the DM's call and moves with the task — picking a lock is Dexterity,
spotting a forgery Intelligence — so the sensible default is offered and can be
changed per roll.

---

## Magic items and attunement

**"+1 Plate Armor" is not a record in 5etools.** It is generated: 214
`magicvariant` templates each say which base items they apply to and what they
overlay. Apply them and 25 base armours and 37 base weapons become **3,026**
concrete magic ones — every +1/+2/+3 weapon and armour, Adamantine Plate,
Elven Chain. That is why searching for "+1 breastplate" used to find nothing.

Variants apply to **base items only**. Overlay "+1 Armor" onto everything
magical and you get "+1 Armor of Invulnerability" and "+1 Animated Shield" —
nine thousand of them, most nonsense.

Armour is offered **by type**, not by the `armor` flag. Only the 25 plain
armours carry that flag, which is why the picker used to show nothing magical;
every enchanted one is typed LA/MA/HA/S. The list is now 776.

A separate picker covers everything else magical — rings, amulets, wondrous
items, wands, potions: anything with a rarity or an attunement requirement that
is not already a weapon or armour.

### Attunement

Three slots on the sheet, in both the Forge's Roster tab and the symbiote,
shown as slots because the limit is the point. Attuning drops the item into the
inventory too, so it is not tracked in two places, and the fourth attempt is
refused with the reason. The limit is editable for a table that plays it
differently, and it survives a level-up.

---

## Rules implemented

Attack rolls, damage and criticals (dice double, modifiers don't), advantage and
disadvantage with correct cancellation, saving throws, area effects with half
damage on a success, healing, temporary HP, resistance / vulnerability /
immunity, conditions, opportunity attacks, Dash / Dodge / Disengage, cover, sneak
attack, regeneration, falling, and hazardous terrain.

Everything is a toggle in **Settings**:

- **High ground** — advantage from 5 ft up. *House rule, on by default, because it's
  what makes a tactics map worth building.*
- **Cover**, **Opportunity attacks**, **Falling damage**, **Climb costs**
- **Diagonals** — every square 5 ft (PHB basic) or 5/10/5 (DMG variant)
- **Foes act on their own** — turn it off to move every enemy by hand
- **Dice seed** — set one and every roll becomes reproducible

The bestiary and class archetypes are ordinary game numbers in
`src/rules/srd.js`. Edit any of them in the Roster tab, or replace that one file
to run a different d20 system — nothing else hard-codes those values.

---

## Saving

The campaign autosaves to your browser's local storage. **Export** writes a
`.vtcampaign.json` file containing everything — maps, roster, and your imported
sprites inline — so it's one self-contained file to back up or pass to another
player. **Import** loads it back.

Browser storage caps out around 5 MB and custom sprites are stored inline, so if
you import a lot of large art you may hit the limit. The app tells you when that
happens; use Export and keep the file.

---

## Playing as a group

This runs on one screen. In practice that means the DM drives it and shares their
screen (Discord, a TV, a tablet propped on the table) while players call their
moves — which is how most tables use a VTT anyway.

There's no networked multiplayer: that needs a server, accounts, and sync, which
is a different and much larger project. The state model is built for it — the
whole session is one serialisable object in `src/core/store.js` and every change
goes through `src/rules/combat.js` and emits an event — so it's a reasonable
thing to add later.

---

## Layout

```
index.html            the game — markup + script order
styles.css
src/
  core/    util.js  dice.js  store.js         helpers, dice notation, campaign state
  map/     iso.js  gridmap.js  path.js        projection, map model, movement + line of sight
  render/  tileart.js  spriteart.js           procedurally generated tiles and characters
           camera.js  renderer.js             pan/zoom/rotate, the isometric painter
  rules/   srd.js  actor.js  combat.js  ai.js statblocks, creatures, the engine, monster turns
  data/    tags.js                            5etools {@markup} parser -> text, HTML, mechanics
           fivetools.js                       folder/URL ingest, indexing, search, IDB cache
           convert.js                         5etools records -> Virtual Tactics statblocks
           charbuild.js                       choices -> statblock (shared with the symbiotes)
           choices.js                         the class choice tree, read from the books
           homebrew.js                        local storage for converted and authored content
           choicefx.js                        picks -> AC, to-hit, ability scores, actions
           multiclass.js                      combined caster level, hit dice, requirements
           currency.js                        coins, prices, purses
           features.js                        class features -> resources, actions, modifiers
           shops.js                           shop templates, stocking, the shopkeeper
           homebrew.js                        local store for user-authored content
  ui/      ui.js  editor.js  sheet.js  sprites.js
           choiceui.js  choiceui.css       the choice tree as UI, shared with the symbiote
  app.js                                      boot, input, turn flow
builder/   index.html  builder.css            The Forge
           builder.js                         character builder, creature forge, compendium
           roster.js                          level and edit anything in the campaign
           homebrew.js                        homebrew authoring forms
  dev/     ts-shim.js                       TaleSpire API emulation for development
tale-sheet/  manifest.json  sheet.html       symbiote: character sheet
             sheet.css  sheet.js
tale-shop/   manifest.json  shop.html        symbiote: GM shop window
             shop.css  shop.js
shopsmith/   index.html  shopsmith.css       webapp: build shops at a desk
             shopsmith.js
test/      fixture-data/                      synthetic 5etools-shaped data (invented content)
tools/     serve.js  build-single.js  build-symbiote.js
```

`test/fixture-data/` is a small hand-written data set in the 5etools schema,
containing invented creatures, spells, races and items. It exercises the importer
without needing your real data — and if the Forge ever misbehaves, pointing it at
`http://localhost:5173/test/fixture-data` tells you whether the problem is the
tool or the data.

Plain `<script>` tags and one `window.VT` namespace — deliberately, so the thing
runs from `file://` with no toolchain and stays easy to poke at.
