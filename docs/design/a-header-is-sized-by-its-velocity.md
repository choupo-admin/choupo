# A header is sized by its velocity

*2026-11-02, DEV.md 4c C199 (the pipe and header sizer; phases A-C left the
three rack headers drawn dashed and said "not sized").  Companions:
[`a-desalination-plant-is-trains-and-racks.md`](a-desalination-plant-is-trains-and-racks.md)
(the plant), [`the-rack-drawn-from-its-sheet.md`](the-rack-drawn-from-its-sheet.md)
(the drawing that reads `headerNominalDiameter`).*

## 1. The user's task, in one sentence

An engineer laying out a vessel rack must know how wide the feed, brine and
permeate headers are, how fast the water moves in them and what they lose per
metre, so that the rack elevation and the plot plan are drawn from a size and
not from a mark.

## 2. The smallest honest sizer

`pipeHeader` (`src/postProcessing/sizing/PipeHeaderSize.{H,cpp}`, registered in
`EquipmentSize.cpp`).  One postDict entry per bank (`unitName RO1; type
pipeHeader;`) lists its headers, `headers ( { role feed; stream roFeed; } ...
)`, and yields ONE ITEM PER HEADER PER TRAIN, tagged `train<k>.<role>` on the
bank's own unit (`RO1/train1.feed`), so the join to the bank is the unit and
the train.  `perTrain yes;` divides the stream's volumetric flow by the
declared trains (`TrainSplit.H`).

The rule:

```
Q          = m_stream / rho / trains          rho: the case's package, at the stream's own state
D_required = sqrt(4 Q / (pi v_max))           the smallest bore that stays under v_max
D_nominal  = the smallest DECLARED bore >= D_required, provided v = 4Q/(pi D^2) >= v_min
Re         = rho v D / mu ;  f = FrictionFactorCorrelation(Re, eps/D)
dP/L       = f / D x rho v^2 / 2                Darcy-Weisbach, per metre
```

Everything else is declared.  `velocity { min; max; origin; source; reason; }`,
`nominalSizes { sizes ( { insideDiameter <m>; } ... ); origin; source; reason;
}`, `roughness { value; source; reason; }`, `frictionModel <word>;` (a registered
correlation; no default) and `viscosity { value; source; reason; }`.  A block
may sit on the entry or on one header (which wins).  A missing block, a window
with `min >= max`, an empty or non-positive list, no viscosity (the package
declares none here) each REFUSE by name; **no size that fits REFUSES, naming
the window, the required bore, the list and the way out** (a larger bore, a
higher maximum, more trains; or, when the nearest bore is too wide, a bore
between the required one and the one that keeps `v_min`).

**No pipe schedule table is carried.**  ASME B36.10, DIN and ISO tables are
no-grant standards (`check_source_licence`); the case declares its own list of
inside diameters, author-set, with the reason.  The list stands for "the bores
the plant can buy" and nothing more.

## 3. What is published

Units declared on every key: `flowPlant`, `flow` (m3/h), `density` (kg/m3),
`viscosity` (Pa.s), `velocityMin`, `velocityMax`, `velocity` (m/s),
`requiredInsideDiameter`, `nominalInsideDiameter`, **`headerNominalDiameter`**
(m; the nominal bore, the key the GUI's rack elevation reads), `reynolds`,
`relativeRoughness`, `frictionFactor` (-), `pressureDropPerMetre` (Pa/m),
plus `trains` and `trainIndex`.  `basis` states the rule and names the origin
and source of the window and of the list.  NOT COSTED (no cost set is read;
`notCostedBecause`) and NOT PLACED (a header is part of the rack the plot plan
places; the routed pipes of C80 stay the layout's).  The item is attached to the
stream it carries (`EquipmentSizing::stream`, as a storage tank is), so its
sheet draws that stream's state as its inlet; the sheet's comment about
"a storage item" was reworded to say "an item attached to a stream".

## 4. `swro01_campoDalias`

Nine header declarations (feed, brine, permeate of RO1, RO2a, RO2b), six
trains each: 54 items.  Window 1.0-2.0 m/s, friction Churchill, roughness
0.045 mm, viscosity 1.0e-3 Pa.s, twelve bores from 0.15 to 0.80 m.  Per train:

| bank | header | stream | Q (m3/h) | D required (m) | D nominal (m) | v (m/s) | dP/L (Pa/m) |
|---|---|---|---|---|---|---|---|
| RO1 | feed | roFeed | 1715.5 | 0.551 | 0.60 | 1.69 | 30.9 |
| RO1 | brine | brine | 925.6 | 0.405 | 0.45 | 1.62 | 40.3 |
| RO1 | permeate | perm1 | 790.0 | 0.374 | 0.40 | 1.75 | 53.7 |
| RO2a | feed | feed2 | 790.0 | 0.374 | 0.40 | 1.75 | 53.7 |
| RO2a | brine | conc2a | 240.2 | 0.206 | 0.25 | 1.36 | 58.7 |
| RO2a | permeate | perm2a | 549.8 | 0.312 | 0.35 | 1.59 | 52.5 |
| RO2b | feed | conc2a | 240.2 | 0.206 | 0.25 | 1.36 | 58.7 |
| RO2b | brine | conc2 | 102.7 | 0.135 | 0.15 | 1.62 | 151.0 |
| RO2b | permeate | perm2b | 137.5 | 0.156 | 0.20 | 1.22 | 62.3 |

## 5. What is READ and what is ASSUMED (the limits, said plainly)

* **The velocity window is ASSUMED.**  The only figure found in an open page
  was Netsol Water's "typically 1-2 m/s" (How to design pipe size in a
  commercial RO plant, read 2026-11-02): a vendor blog for small commercial
  plants, not about seawater and not about a header.  The FilmTec/DuPont
  design-guideline excerpt for midsize elements (Form 45-D01588) was opened and
  states no piping velocity; the CuNi seawater-piping guidance at copper.org
  returned 403 and a search summary of it (3.5 m/s for 90/10 CuNi from 100 mm)
  was NOT used: it concerns another material and was not read.  The window is
  one window for the three headers; a real plant sizes the high-pressure line,
  the brine and the low-pressure permeate differently, and the case says so.
* **The bores and the roughness are author-set.**  The roughness 0.045 mm is the
  textbook commercial-steel value; the real wall (duplex steel, GRP) differs.
* **The density is the package's** (997 kg/m3 for these streams: the package
  prices the water and leaves the lumped NaCl out of the density, announced;
  the case's modules declare 1025 kg/m3).  The flows per train are 2.7 % above
  what seawater density would give, so a bore chosen near a window edge could
  move.  This is the package's honest answer, announced on every run; it is not
  tuned.
* **Not modelled**: the header's length and fittings (the drop is per metre), its
  wall and pressure class, the change of flow along a manifold (each header is
  sized at the full flow of its train, the most severe reading), surge.

## 6. Alternatives rejected

* **A pipe schedule table in the engine** (nominal pipe sizes with inside
  diameters).  Rejected: the tables are no-grant standards, and a size the
  engine "knew" would be an invented authority.  The case declares the list.
* **Computing the diameter and publishing it unrounded.**  Rejected: nobody
  buys 0.5508 m.  Both numbers are published (`requiredInsideDiameter`,
  `nominalInsideDiameter`), so a reader sees the rounding.
* **Writing `headerNominalDiameter` on the bank's own sheet.**  Rejected: the
  bank sizer would need three more declarations and would own pipes; the
  header is its own item with its own basis.  The consequence is that the GUI
  must read the header sheets (`unit` = the bank, `tag` = `train<k>.<role>`),
  not a key of the bank sheet; see the report that came with this slice.
* **A velocity default.**  Rejected by the no-silent-crutch rule: a window is the
  case's, with its source or its `assumed`.

## 7. Gate

`check_swro_plant` arms (l) and (m): (l) recomputes every header's flow,
required and nominal bore, velocity, Reynolds number, Churchill friction factor
(written out in the gate) and pressure drop per metre from the postDict and the
stream masses, 54 items, to 1e-6; (m) four fixtures refuse by name (no velocity
window, no bore that fits, a window the nearest bore falls under, no
viscosity).  Not checked: that the window or the list is a standard's, and the
density (range-checked only).
