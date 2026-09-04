# The hierarchy that only existed in the name

*Record of the 2026-09-04 slice.  Requested by Vítor: "no report do simulador
de processos tem de aparecer uma hierarquia de sectores e operações unitárias
com os resultados do design!  Essa info é depois usada na parte económica."*

## 1.  What was wrong

Choupo's flowsheet is **fractal**: composite sectors nest leaf units, and
`Flowsheet::flattenNode` collapses the tree to one flat solver problem with
`plant.sector.unit` names.  The hierarchy is real, it is authored, and the
engine builds it every run.

Then it threw it away.

`flattenNode` computes each leaf's qualified name as `nsPrefix + member`,
where `nsPrefix` is the parent chain — the sector path, held in hand, exactly
correct, at that precise moment.  It concatenated the two into one string and
kept only the string.  Every reader downstream — the sizing pass, the design
report, the costing pass, the economics report, the GUI — received a FLAT
LIST of dotted names and no structure.

So the design table printed:

```
  CONCENTRATION.Crystcrystalliser    SS304 ...
  CONCENTRATION.Evap1evaporator      SS304 ...
  DRYING.SD     sprayDryer           SS304 ...
  FERMENTATION.FermentorstirredTank  SS316 ...
```

Two defects in one line, and the second is the reason the first went
unnoticed for so long: there is no hierarchy in the output, and the name is
too long for its column, so it runs into the equipment type with no space.
The one structural fact a reader needs in order to allocate capital was on
the screen only as a prefix they had to parse by eye — in a table where the
prefix does not even end cleanly.

And the economics half was worse, because it is the half Vítor named: **"a
CONCENTRATION é 93 % do capex"** is the sentence a student takes away from a
plant, and the only route to it was adding up dotted names by hand.

## 2.  The decision: the sector travels as DATA

Two designs were possible and only one is admissible here.

**Rejected — split the dotted name in the report.**  `name.rfind('.')` gives
the sector for every case in the corpus today.  It is one line, it needs no
new field, and it is wrong for the same reason every other name crossing in
this project is refused: it is **name identity**.  The typed-identifier
contract (F2, 2026-07-26) says a crossing goes through a DECLARED bridge and
never through a name that happens to look right.  A unit named with a dot for
any other reason would be silently misfiled, and the report would be
confidently wrong with no way to notice.

**Adopted — stamp the sector where it is known.**  `nsPrefix` IS the sector
path.  The flatten seam writes it into the leaf's dictionary as a declared
`sector` key; `FlatUnit` carries it into `result.topology`; `SizingPass`
copies it onto `EquipmentSizing`; `CostingPass` copies that onto
`CostBreakdown`.  **One origin, four carriers, no re-derivation** — the arity
doctrine applied to a structural fact rather than to a number.

Ratified by Vítor ("faz como recomendas"), 2026-09-04.

## 3.  Empty is not a sector called "root"

The single hardest rule in this slice, and the one the acceptance condition
was written around: **a flat case has no hierarchy, and must not be given
one.**

`nsPrefix` is empty at the plant root, so a flat case's leaf dict gains no
key at all, `FlatUnit::sector` stays empty, and every surface falls back to
exactly what it printed the day before:

* the sizing table prints no sector banner and does not reorder;
* `sizing.csv` emits no `sector` column — an empty column on every flat case
  would be a format change claiming a structure that is not there;
* the costing console prints no `capital by sector` block;
* the name column is floored at the 14 it has always been.

Measured, not assumed: the longest `unitName` in every FLAT case in the
corpus is 11 characters, so the widened column changes nothing for any of
them.  Only the two fractal plants — `ChemicalPlantTutorial` and
`sugarPlantEconomicsSweep` — overflow, and those are precisely the cases
whose hierarchy this work exists to show.

A unit carrying no sector INSIDE a plant that has them is a different case
and is handled differently: it gets its own honest `(no sector)` heading
rather than being absorbed into whichever section happened to be open.  None
exists in the corpus today; the behaviour is declared so that the first one
is visible rather than misfiled.

## 4.  What the reader gets

```
  -- sector: CONCENTRATION
  CONCENTRATION.Evap1     evaporator      SS304       A [m²]   60.0000
  ...
  ---- capital by sector ----
  sector                  units   purchased     bare module   total module  share of C_TM
  CONCENTRATION           3       3529637       22973699      27108965      93.3 %
  DRYING                  1       347545        1531979       1807735       6.2 %
  FERMENTATION            1       13593         106043        125130        0.4 %
```

The subtotals are accumulated from the SAME `result.costs` entries the TOTALS
line sums, and the shares are taken against the SAME `totalModule` that line
prints, so the two cannot disagree.  The block sits BEFORE the incomplete-set
caveat deliberately: when a unit fails to cost, the caveat applies to the
sector subtotals exactly as it applies to the total, and a reader who has
already scrolled past the block would not know it.

**A share of zero is not zero per cent.**  With `totalModule == 0` the block
prints `(total is zero)` rather than `0.0 %`, which would be a number with no
arithmetic behind it.

## 5.  Deliberately NOT done

* **The `design` and `economics` reports still do not run by default.**  A
  case must declare them in `system/postDict`.  Making them default changes
  the behaviour of the entire corpus and is RESERVED for Vítor.
* **The GUI does not read the sector yet.**  The Plot menu is a flat list;
  turning it into a tree (global / sectors / unit operations) is Vítor's
  request of the same day and is its own slice, whose prerequisite this work
  is.  When it lands it must read `FlatUnit::sector` from the topology and
  must NOT split the dotted name, for the reason in §2.
* **No nesting beyond one level is exercised.**  The field holds the full
  dotted parent chain (`A.B` for a doubly nested unit) and the reports group
  on the whole string, so a two-level plant would produce one heading per
  distinct chain rather than a nested rendering.  No corpus case nests twice;
  said here rather than implied.

## 6.  Gate

`bin/curate/check_sector_hierarchy.py`, in both directions:

  (a) **STAMPED IS CARRIED** — every unit of a fractal plant reports a sector
      in its design and costing surfaces, and the value equals the authored
      sector folder, not a substring of anything;
  (b) **FLAT STAYS FLAT** — a flat case emits no sector banner, no `sector`
      CSV column and no `capital by sector` block;
  (c) **THE SUBTOTALS REPRODUCE THE TOTAL** — the per-sector `total module`
      column, recomputed independently by the gate from `costs.csv`, sums to
      the TOTAL row, and the shares sum to 100 % within rounding.

Arm (c) is the one that matters: it is the arithmetic a student would do, and
it fails the day a unit is counted in a sector but not in the total, or twice.
