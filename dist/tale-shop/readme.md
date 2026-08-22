# Tale Shop

A shop window for TaleSpire. The GM keeps a shelf of reusable shops — stocked
from their own 5etools item data at real list prices — and opens one for the
party to browse and buy from.

Every shop has a shopkeeper: a generated portrait in the game's own pixel style,
with a name and a greeting. Swap in your own image, reroll the face, or write
their line yourself.

Shops can also be built at a desk in **Shopsmith** (`shopsmith/index.html`) and
imported here as JSON.

## GM

**Shops** — your shelf. Make one from a template (General Store, Blacksmith,
Fletcher, Alchemist, Magic Emporium, Inn & Tavern, Stable, Temple, or Empty),
then **Open to party** and everyone sees it live. Shops are saved per campaign
and reusable; duplicate one to make a variant.

**Edit** — rename it, name the keeper, write a blurb, set a price multiplier, and
change the stock: quantities, prices, remove things, add anything from your item
data, or invent a custom item. Quantity `-1` means unlimited. Players only ever
see the adjusted price, never your margin.

**Setup** — connect your 5etools data, and define the currency.

## Players

The open shop appears automatically. Browse the goods, pick a quantity, press
**Buy**. Stock lives on the GM's copy, so two players cannot both take the last
potion — your purchase is applied there and the window updates for everyone.

Your purchases are listed under **Purchases**.

## Currency

Standard D&D coins by default (pp / gp / ep / sp / cp). Rename them or change
their values in Setup for another setting; prices convert automatically because
everything is stored as an integer count of the base unit.

## One deliberate limitation

Buying does **not** deduct your coin. A symbiote cannot reach another symbiote's
storage, so Tale Shop tells you the price and Tale Sheet's **Spend** button does
the deduction. Both understand the same coin format, so `12 gp 5 sp` pastes
straight across.

## Treasure hoards

A hoard is a shop with nothing to pay. Make an empty one and stock it by hand,
or roll one off the treasure tables by challenge rating — coins, gems, art
objects and magic items, straight from the book's own d100 tables.

Players open it like a shop and **Take** instead of Buy. What they take goes
directly into their Tale Sheet inventory, and the loose coin into their purse,
because the two symbiotes share an interop id and can talk to each other.

Give it a name and a tagline of your own. Its picture is chosen by what it is
worth — a skull and a spilled purse, a strongbox, a heap of coin, or a dragon's
bed — and you can override that from the hoard panel.

**Splitting the coin.** Set how many ways (it starts at however many other
people are at the table) and press *Hand it out*. Each share goes straight to a
player's purse. Nothing is lost to rounding, and a share with nobody to send it
to stays in the hoard so you can pass it on yourself.

Hoards built in Shopsmith import here unchanged.
