# State of things

A handover note: what is solid, what is half-finished, and what to watch out
for. Written to be read by someone — or some model — coming to this cold, so
that nothing has to be re-derived from the code.

For *how* things work and why, see [design-notes.md](design-notes.md). For
getting the apps running, see the [README](../README.md).

---

## What the pieces are

| | what it is | where |
| --- | --- | --- |
| **Tale Sheet** | the character sheet, a TaleSpire symbiote | `tale-sheet/`, built to `dist/tale-sheet/` |
| **Tale Shop** | shops and treasure, a TaleSpire symbiote | `tale-shop/`, built to `dist/tale-shop/` |
| **The Forge** | character builder, compendium, roster, and a Sheet tab that runs Tale Sheet itself | `builder/` |
| **Shopsmith** | desk-sized shop editor, plus the item forge | `shopsmith/` |
| **The battle map** | isometric skirmish game | `index.html`, `src/` |

`tale-sheet/sheet.js` is the single character sheet. The Forge hosts that same
file rather than a copy — see *Running the symbiote's sheet inside the Forge* in
the design notes. **A change to the sheet changes both.**

The battle map deliberately does **not** load the 5etools stack (no
`convert.js`, `tags.js` or `fivetools.js`). It runs on its own SRD statblocks.
Do not assume `VT.convert` exists there.

---

## Solid

Things that work and have been checked against real data.

- **Character building** — races, classes, subclasses, multiclassing, the choice
  tree (fighting styles, invocations, metamagic, maneuvers, feats, cantrips,
  prepared spells), ability scores, backgrounds.
- **Levelling** re-derives from the original build while keeping damage taken,
  conditions, spent resources and hand-added items.
- **Spells** grouped by level with each level's slots at the head of its
  section; upcasting; pact magic.
- **Equipment** — worn or carried, equip and unequip without deleting, heavy
  armour stealth disadvantage, Strength-requirement speed penalty, and both
  correctly suppressing Unarmored Movement and Fast Movement.
- **Proficiencies** — languages, skills, tools, weapons and armour, worked out
  from class, race and background and editable by hand, with a flat per-skill
  bonus you set yourself. A weapon you are not trained
  with loses your proficiency bonus; armour you are not trained with is
  disadvantage on Strength and Dexterity rolls, and no spellcasting.
- **Magic item effects** — ability scores, AC, saves, resistances, speed, spell
  attack and DC, gated on attunement or being worn.
- **Item actions** — wands and staves offer their spells with charges.
- **Resistances** from race, class features and items, merged into one list,
  with conditional ones listed rather than claimed.
- **Wild Shape, ranger companions, summons** — each a separate stat block beside
  the sheet with its own hit points.
- **The item forge** in Shopsmith, with a saved library.
- **Sync between symbiotes** — framed to fit TaleSpire's 500-character limit.
- **Treasure** — hoards rolled off the books' tables, coin splitting, loot codes
  that carry full item records.
- **Items bought in a shop arrive as items** — wearable, attunable, and folding
  open to their own description. A shop sends a name and a printing; the sheet
  resolves it back into the record.
- **A bundled SRD** — shipped in `srd/`, layered under whatever data the user
  connects, de-duplicated so nothing appears twice. Ships empty from a source
  checkout; see `srd/README.md`.

---

## Half-finished

Real limitations, not bugs. Each is a small piece of work if it starts to annoy
anyone.

**Item charges do not auto-spend.** A wand's charges are tracked on the
inventory entry with `+`/`−` controls, but rolling the action does not deduct
one. The action knows its `chargeCost`; wiring it into the roll button is the
missing half.

**A forged weapon's extra-damage rider is descriptive only.** "An extra 2d6 fire
damage on a hit" is stored as `__riderText` and shown, but not folded into the
weapon's damage roll — deliberately, so the base attack does not overstate
itself. Making it a second damage line on the action would be the fix.

**Scaling companions and summons do not re-derive on level-up.** A Beast of the
Land's AC and hit points come from the ranger's level at the moment it was
taken. Re-take it after levelling. Storing the *choice* rather than the built
block would fix this properly.

**Summoning does not spend a spell slot.** The summon card puts the creature on
the board; you spend the slot yourself on the spell. Kept separate on purpose —
you often want the block up while deciding whether to cast.

**Charges, riders and summons all share a shape:** the data is read correctly,
the display is right, and only the *spending* is manual.

**Magic Missile is modelled as a save with `autoHit`.** The combat engine has no
"just hits" action kind, so auto-hit spells are a DEX save that everything
downstream is told to skip. Both sheets print "auto"; the map skips the save.
It works, but the record carries a `save` and `dc` that are not real.

**Tools need proficiency to appear.** Owning a tool and being proficient with it
are separate; only the second puts it on the sheet. The Edit tab's Tool picker
grants both.

**The SRD folder ships empty.** The loading, the layering and the
de-duplication are all in place and tested; the content is not there until
someone drops a data set into `srd/` and lists it in `srd/index.json`. Until
then a fresh install still asks for a data source, exactly as before.

**Nothing spends a language.** "Two of your choice" is counted and shown as
still-to-pick, but nothing stops you adding three, and nothing checks that what
you typed is a real language. Deliberate — a DM invents languages, and the
alternative is refusing the one the table actually uses.

**Armour proficiency is not inferred downwards.** A class trained in heavy
armour is, in every list the books print, also trained in light and medium — but
nothing in the data says so, so nothing here assumes it. In practice every class
record lists all three, so this has not bitten; a homebrew class that lists only
"heavy" would leave its wearer penalised in leather.

---

## Hazards

Things that have already cost real debugging time.

**Shell heredocs silently corrupt backslashes.** Writing a patch script through
`python - <<'PY'` mangles `\b`, `\s` and `\\` — three times this session a regex
came out containing literal **backspace characters** (0x08) where `\b` was
intended. The pattern then never matches, the source *looks* correct, and `grep`
renders the backspace as nothing so it looks correct there too. Symptom: a regex
that plainly should match, doesn't.

> Write patch scripts to a file first, then run the file. If you must use a
> heredoc, avoid backslash escapes entirely, or check afterwards:
> `python -c "print(open('file.js').read().count(chr(8)))"`

**Two files claim the same CSS names.** `sheet.css` is written for a page it
owns (`:root`, `html`, `body`, `#app`, `.card`, `.btn`). The Forge rewrites its
rules at load to scope them under `#sheetHost` — see the design notes. Do not
"fix" `sheet.css` to suit the Forge; tale-sheet is what the table runs.

**`features.apply()` runs more than once.** Equipping something re-runs it, so
anything it computes must be *recomputed from a base*, never accumulated.
`baseSpeed` and `baseAbilities` exist for exactly this. A version that did
`speed = speed + bonus` sent a barbarian to zero after two equip cycles.

**Any render destroys focus; that is why `data-k` exists.** `render()` clears
the view and rebuilds it, so a field being typed into loses its focus and caret
unless it carries a `data-k` key for `render()` to restore it by. This is not
theoretical - inside TaleSpire the Edit tab was dropping focus after every
single character, caused by events the sheet does not control. **A new text
field in the Edit tab needs a `data-k`**, or it reintroduces the bug for itself.

> A number field that renders on every keystroke fights the caret even with a
> key, because the value is rewritten underneath it. The skill-bonus input
> updates its neighbouring total in place and deliberately does not render.

**A monster's `languages` is prose, a character's `langProf` is a list.** They
are different fields for that reason. Writing a character's language list onto
`languages` puts half a sentence into a statblock — see the design notes.

**`convert.crOf` returns a string.** `"1/2"`, `"24"`, or null. Comparing to a
number half-works: `"24" > 1` coerces, `"1/2" > 0.25` is `NaN > 0.25` and is
false. Use `VT.wildshape.crNumber`.

**5etools data is inconsistent about class spell lists.** Older books use
`spell.classes.fromClassList`; newer ones do not carry it at all. Always use
`FT.spellsForClass(name, source)`, which reads both and honours settings that
remove spells from a list.

---

## Working practice

- **Verify against the real data**, not fixtures. Run `node tools/serve.js` and
  drive the app in a browser. `test/fixture-data/` exists to tell "the tool is
  broken" from "the data is odd", not as a substitute.
- **Rebuild after any change** to `src/`, `tale-sheet/`, `tale-shop/` or
  `builder/`: `node tools/build-symbiote.js` and `node tools/build-single.js`.
  `dist/` is committed so nobody else needs Node.
- **Install to TaleSpire** by copying `dist/tale-sheet/*` and
  `dist/tale-shop/*` over the installed folders — *file by file*, never
  replacing the folders, because TaleSpire keeps `.localStorage` and `.debug`
  inside them.
- **Run the battle-map regression** before committing: open `index.html`, roll
  initiative, drive turns, confirm no console errors. It catches shared-module
  breakage that the sheets do not.
- **Never bundle game content.** The builds ship no 5etools data; every app asks
  for a source at runtime. The one exception is `homebrew/`, which travels with
  the symbiotes by deliberate decision — see the note on source books in the
  README.

---

## The line on content

The SRD is freely shareable; published book content is not. The apps are a
client that reads a data set the user supplies. `build-single.js` and
`build-symbiote.js` bundle no data, and that is worth keeping true — check with
a grep after any build change.

The repo is public and contains `homebrew/dark-sun.vthb.json`, a conversion of a
fan supplement, included by the owner's explicit decision.

`srd/` is the second deliberate exception, and a narrower one: the SRD is the
freely shareable set, so it may travel with a build where a data folder may not.
Only SRD-licensed material belongs there. The grep after a build change should
now expect `homebrew/` and `srd/` and nothing else.
