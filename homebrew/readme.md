# Homebrew

Converted supplements, in the same 5etools schema the books use. Nothing here
is part of the app: the builds bundle no game content, and these files are read
at runtime like any other data source.

`dark-sun.vthb.json` is the **Dark Sun Player's Guide — Athascon 5e conversion
v2.1**, converted from the PDF (all 122 pages) with:

```bash
pdftotext -enc UTF-8 "Dark Sun Players Guide - Athascon V2.1.pdf" ds.raw.txt
node tools/clean-pdf-text.js ds.raw.txt ds.txt
node tools/import-guide.js ds.txt homebrew/dark-sun.vthb.json --source DSA --map tools/guides/dark-sun.json
```

The PDF is the better source: the Google Doc's `mobilebasic` view silently
truncates at page 78, losing the psionic disciplines and the spell chapter.

That guide is fan content published under Wizards of the Coast's Fan Content
Policy; this is a local conversion of it for one table's own use.

## Loading it

**It already ships with the symbiotes.** `tools/build-symbiote.js` copies this
folder into `dist/tale-sheet/` and `dist/tale-shop/`, and each symbiote reads
`homebrew/` from beside its own files on boot. Nothing to connect, nothing to
import, no directory picker — which is what makes it the one route that behaves
identically on every OS and in every browser. `index.json` names the files to
load, because http offers no directory listing.

To ship something else the same way, drop its `.json` in here and add it to
`index.json`. The build fails loudly if `index.json` names a file that is not
there.

**Or put it in your 5etools data folder.** Copy `dark-sun.vthb.json` into a
`homebrew/` folder beside `data/`, and the Forge, the Tale Sheet symbiote and
every other machine pointed at that folder pick it up automatically. Nothing to
import per device, and it survives a reload because it is cached with the rest.

    5etools-v2.33.3/
      data/
      homebrew/dark-sun.vthb.json

If the data is served over http rather than connected as a folder, add
`homebrew/index.json` with `{"toImport": ["dark-sun.vthb.json"]}` — that is
5etools' own convention, since http gives no directory listing.

**Or import the file directly**: the Forge → Homebrew tab → Import, or the
symbiote's Setup tab → Import a file. Content imported this way is stored in
that browser only, which is why the folder is the better answer for a table.

Either way it merges into the compendium, so a Dark Sun race is offered by the
character builder beside a PHB one and a Dark Sun subclass appears in the choice
tree with its features at the right levels.

## Re-running the conversion

`tools/import-guide.js` reads plain text. `tools/guides/dark-sun.json` is the
side-car that names the book's subclasses and subspecies — transcribed from its
own contents page, because telling a subclass from its first feature is a
question about page layout that prose cannot answer reliably.

## What the Dark Sun conversion contains

310 records: 9 races, 5 subspecies, the Psion class, 21 subclasses, 121 subclass
features, 36 psionic disciplines, 17 feats, 16 backgrounds, 6 new spells, the
three spell-list changes (clerics, druids and rangers each lose spells the
setting has no room for), and 63 pieces of equipment — 13 armours and 50
weapons, with damage dice, properties, weights and Athasian prices.

Prices are in **bits**, the smallest Athasian coin: 10 bits to a ceramic piece
(cr), 10 cr to a silver, 100 cr to a gold. Pick **Athasian (Dark Sun)** as the
currency in Tale Shop or Shopsmith and prices read back as the book prints
them — a dagger is 2 cr, a suit of carapace armour 1,500 cr.

One thing the app does not model: the cleric's removals apply "unless they are
domain spells for their chosen element". A Water domain cleric should put
Create or Destroy Water back by hand.

### How the equipment tables were read

They are the hardest thing in the book to extract, because `pdftotext` gives
two views and neither is usable alone: the layout view has one name per line
but shifts the name column against the data, and the default view has clean
data columns but runs the names together with no delimiter. The importer takes
names from the first and data from the second, then requires every column to be
the same length as the name list — a table whose columns disagree is refused
rather than emitted, because a weapon quietly wearing the next weapon's damage
die is worse than a weapon that never arrived.

As a second check, every weapon that also exists in the Player's Handbook is
compared against its printed damage die. **All 35 match**, which is what tells
you the columns did not slip.

Two weapons lose a property to a line wrap in the PDF: the longbow and the
heavy crossbow should both also be *two-handed*.
