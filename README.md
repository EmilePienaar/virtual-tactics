# Virtual Tactics

A set of D&D 5e tools for our table: two **TaleSpire symbiotes** — a character
sheet and a shop/treasure window — and **The Forge**, a browser app for building
characters.

Everything runs in a browser. There is nothing to install, no account, no server,
and nothing phones home.

---

## What you'll be using

| | What it is | Where |
| --- | --- | --- |
| **Tale Sheet** | Your character sheet, inside TaleSpire. Rolls go through the real dice tray. | TaleSpire symbiote |
| **Tale Shop** | The GM's shop window and treasure hoards. Hands you a code you paste into your sheet. | TaleSpire symbiote |
| **The Forge** | Build and level characters in a browser, then send them to your sheet. | `dist/the-forge.html` |

There are two extras you can ignore unless you want them: an isometric battle map
(`dist/virtual-tactics.html`) and **Shopsmith** (`shopsmith/index.html`), a
desk-sized shop editor for the GM. Shopsmith also has a **Forge item** tab:
describe what a magic item does in plain sentences and it becomes a real item
record — the same shape as the ones in the books, so it works everywhere without
a special case. It asks the three things prose cannot answer (weapon, armour or
wondrous; attunement; rarity) and reads the rest; anything it could not place is
listed back to you and kept as the description rather than silently dropped. Out
comes a code you paste into a player's sheet, or an item you drop into a shop.
Saved items go to a library that keeps each one with its effects and its code,
so the same item can be handed out again months later without rebuilding it.

---

## First: your own 5e data

**These tools ship with no game content.** They're an empty frame — they read a
**5etools-format data folder** that you point them at, and they only ever read
what you give them.

You need a copy of that data on your own machine. Everything below assumes you
have one, in a folder with a `data/` directory inside it.

The sheet works without it — you just can't *build* new characters in-game, only
import ones made elsewhere.

---

## Installing the symbiotes

**1. Get the files.** On the GitHub page, click the green **Code** button →
**Download ZIP**, and unzip it somewhere.

**2. Copy two folders.** Inside `dist/` you'll find `tale-sheet` and `tale-shop`.
Copy both into your TaleSpire symbiotes folder:

```
C:\Users\<your name>\AppData\LocalLow\BouncyRock Entertainment\TaleSpire\Symbiotes\
```

> Quickest way there: press `Win+R`, paste
> `%AppData%\..\LocalLow\BouncyRock Entertainment\TaleSpire\Symbiotes`, press Enter.

**3. Add your data.** Copy your 5etools `data` folder *inside* each of those two
folders, so you end up with `Symbiotes\tale-sheet\data\`. This is the easiest
option by far — the symbiote finds it on its own, never asks you anything, and
works the same on Windows, Linux and macOS.

*(If you'd rather not duplicate it, open the symbiote's **Setup** tab and use
**Choose folder & remember…** instead. One click the first time and none after
that — but that button only exists in Chrome and Edge. On Firefox use **Choose
data folder…**, or the bundled folder above.)*

Dark Sun already ships inside each symbiote in its own `homebrew/` folder, so
there is nothing to do for it — Setup will say "310 records shipped with this
symbiote".

**4. Restart TaleSpire** and add the symbiotes from the symbiote menu.

That's it. Your characters are saved in the TaleSpire campaign, so they follow the
campaign rather than your PC.

---

## Tale Sheet — your character

Open the **Build** tab and walk through it: race, class, subclass, level, ability
scores, background, gear, spells. Everything your class lets you choose — fighting
styles, invocations, metamagic, maneuvers, feats, cantrips, prepared spells — is
on the **Choices** step. Multiclassing is supported.

Already have a character from the Forge? **Setup → Import** takes its file.

Day to day:

- **Rolling** — tap any skill, save, attack or damage and the dice go into
  TaleSpire's tray like any other roll. Advantage and disadvantage roll two and
  keep the right one. There's a **Crit** toggle that doubles damage dice.
- **Levelling** — the Edit tab re-derives HP, proficiency and attack bonuses from
  your original build, and keeps your damage taken, conditions and anything you
  added by hand.
- **Spells are grouped by level**, with each level's slots at the head of its own
  section — cantrips at will, then 1st level with its 4/4, and so on. What you
  can cast and what you have left to cast it with sit together.
- **Resources** — Ki, Rage, Bardic Inspiration, Channel Divinity,
  Superiority Dice, Lay on Hands, Action Surge. Short and long rests restore the
  right ones; a short rest lets you spend hit dice, which roll in the tray.
- **Equipment is worn, not welded on.** Armour, shields and weapons sit in your
  inventory with a Wear button, so you can take the mail off before sneaking and
  put it back without losing it. Heavy and medium armour give disadvantage on
  Stealth, armour you lack the Strength for costs 10 feet, and both stop a
  monk's Unarmored Movement and a barbarian's Fast Movement.
- **Damage resistances** come from your race, your class features and your
  items, merged into one list. Conditional ones — Rage, Bear Totem, anything you
  switch on — are listed as reminders rather than claimed, because a sheet that
  overstates a defence is worse than one that says nothing.
- **Wands and staves offer their spells.** A Wand of Magic Missiles held in
  your hand puts Magic Missile in your action list with its charges beside it.
  An item that requires attunement offers nothing until it is attuned.
- **Magic items do what they say.** An attuned Belt of Hill Giant Strength sets
  your Strength, a Ring of Protection adds its +1 to AC and saves, a Ring of
  Fire Resistance gives you resistance, Boots of Speed double your movement. An
  item that needs attunement does nothing until attuned; anything else has to be
  worn. Attunement offers what is in your pack, not the whole compendium.
- **Summoning spells put the creature on your sheet.** Cast Summon Beast and
  its stat block appears with buttons for the shape (Land, Water, Air) and the
  slot level — both rebuild the block, so AC, hit points, speeds, traits and
  attacks all follow. One implementation covers all two dozen summon spells.
- **The ranger's companion** works like Wild Shape: pick the animal and its stat
  block appears below yours with its own hit points. Beast Master gets both the
  Primal Companions and the 2014 beast list; Drakewarden gets the drake. The
  scaling ones work their AC, hit points and attacks out from your ranger level.
- **Wild Shape** lists the beasts you can become, filtered by your druid level,
  and shows the chosen form's stat block below your own — its AC, hit points,
  speed and attacks, all rollable. Its hit points are tracked separately, and
  closing the panel is all it takes to revert; your own sheet is never altered.
- **Class features become rollable actions** where they can be. The common ones
  are hand-written; beyond those, attack and saving-throw features are read out
  of their own printed text — Radiant Sun Bolt, Quivering Palm and around thirty
  others turn into buttons that roll. Anything inferred that way is labelled
  *read from text*, so you know which numbers to check. Features it cannot read
  confidently are left as printed text rather than guessed at.
- **Death saves** are tracked as you roll them — three and three, judged on the
  face of the die, so a natural 20 puts you back up.
- **Coin and inventory** — a purse that takes "12 gp 5 sp" and refuses what you
  can't afford, and somewhere to put what you buy.
- **Everything is editable by hand.** HP, AC, ability scores, spell DC — type over
  any of it and nothing recalculates behind your back.

If you're running the game, the **Party** tab shows everyone's HP, AC and
conditions live, and lets you apply damage or ask a specific player for a saving
throw — which rolls on *their* machine, in *their* tray.

---

## Tale Shop — shops and treasure

**GM:** build a shop from a template (General Store, Blacksmith, Alchemist, Magic
Emporium and so on) and it stocks itself from your item data at book prices. Set a
price multiplier, edit the stock, then **Open to party**.

For treasure, make a **hoard** — a shop with nothing to pay. Roll one straight off
the treasure tables by challenge rating, or stock it by hand. Give it a name and a
tagline; it draws its own picture based on what it's worth, from a skull and a
spilled purse up to a dragon's bed.

Loose coin can be **split between the party** — set how many ways and press *Hand
it out*. Each share becomes its own code: anyone with Tale Shop open gets theirs
on the Purchases tab, and every share is listed for you to copy and paste into
chat for whoever isn't looking. Nothing is lost to rounding.

**Players:** the open shop appears on its own. Browse, pick a quantity, and press
**Buy** (or **Take**, in a hoard). What you took comes back as a short code on the
**Purchases** tab — press **Copy**, then paste it into Tale Sheet under
*Inventory → Collect from Tale Shop*. Items and coin go to the right places, and
the code can be pasted into chat if someone missed it.

Stock lives on the GM's copy, so two people can't both take the last potion.

---

## The Forge — building characters in a browser

The Forge is the same character builder as the sheet's, with a full screen and a
keyboard. It also holds a searchable compendium of everything in your data, a
**Roster** tab for levelling and editing anything you've made, and a **Sheet**
tab that runs the real character sheet — the same one as the symbiote, not a
copy of it. Pick anyone from your roster and play from it: rolls go into a dice
log beside the sheet instead of TaleSpire's tray, and everything else behaves
identically.

Export a character from the Forge and import it in Tale Sheet.

**Easiest way to run it:** open `dist/the-forge.html` by double-clicking. It's one
self-contained file — you can copy it anywhere, and it works offline.

The one catch: opened that way, your browser may ask you to re-pick your data
folder each time. If that annoys you, run it from a local address instead — you'll
need [Node.js](https://nodejs.org):

```bash
node tools/serve.js
```

Then open <http://localhost:5173/builder/index.html>. Now the folder is remembered
and it loads straight in.

---

## If something goes wrong

**"It keeps asking me to pick my data folder."** You're opening the page as a file
rather than an address. Use `node tools/serve.js` and the `http://localhost:5173`
link above — that's the whole fix. (For symbiotes, put the `data` folder inside
the symbiote's folder as in step 3.)

**"It says it can't read my folder."** Pick the folder that *contains* `data/`, or
`data/` itself — not one above them.

**"I'm on Linux / Firefox and there's no 'remember folder' button."** That button
uses an API only Chrome and Edge have. Everything else works everywhere: put the
`data` folder inside the symbiote folder (step 3), use **Choose data folder…**,
or point it at a URL. Nothing here is Windows-only.

**"The symbiote doesn't appear in TaleSpire."** Check the folder went in whole —
`Symbiotes\tale-sheet\manifest.json` should exist — and restart TaleSpire.

**"Nothing arrives in my sheet when I take an item."** Nothing is sent directly —
copy the code from Tale Shop's **Purchases** tab and paste it into Tale Sheet
under *Inventory → Collect from Tale Shop*.

**"TaleSpire refuses to load the symbiote."** Make sure you are on the current
build. An older one gave both symbiotes the same interop id; they now have one
each.

**"We can't see each other."** The GM opens a shop and nobody sees it, or a
player builds a character and the Party tab stays empty. Everyone needs the
current build — earlier ones either sent messages too big for TaleSpire to carry
or had no interop id at all, and in both cases it dropped them silently. If it happens on the current build, press
**Check again** on the player's Shops tab, which asks the GM to resend.

Both symbiotes keep a log at `.debug\log.txt` inside their own folder. If
something is going wrong between machines, that file usually says what.

---

## For whoever maintains this

Rebuild after changing anything in `src/`, `tale-sheet/`, `tale-shop/` or
`builder/`:

```bash
node tools/build-symbiote.js
```

```bash
node tools/build-single.js
```

The first writes `dist/tale-sheet/` and `dist/tale-shop/`; the second writes
`dist/the-forge.html` and `dist/virtual-tactics.html`. Commit `dist/` so nobody
else needs Node at all.

There's no build step otherwise — plain `<script>` tags and one `window.VT`
namespace, deliberately, so it runs from a plain file with no toolchain.

Two documents carry the rest:

- **[docs/state-of-things.md](docs/state-of-things.md)** — what is solid, what is
  half-finished, and the traps that have already cost debugging time. Read this
  first if you are picking the project up cold.
- **[docs/design-notes.md](docs/design-notes.md)** — how each piece works and why
  it is built that way.

---

## A note on source books

The SRD is Creative Commons and freely shareable. **Published book content is
not** — in 2024 Wizards issued takedowns against the 5etools mirrors on exactly
that basis.

So these tools bundle no data at all, on purpose. Handing someone
`the-forge.html` or a symbiote folder gives them the tool, not the books; they
supply their own data, same as you. Keep it that way and everyone stays on the
right side of the line. If you want something you *can* hand to anyone, point it
at SRD data in the same format — everything above still works.
