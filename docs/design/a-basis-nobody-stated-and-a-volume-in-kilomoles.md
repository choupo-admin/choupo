# A basis nobody stated, and a volume in kilomoles

> **STATUS: FINDING + RULE, executed 2026-09-05.**  Level 3 (deep reference
> under the specification-sheet record); the governing document is
> [`the-specification-sheet-a-project-is-audited-from.md`](the-specification-sheet-a-project-is-audited-from.md).

---

## 1. Where it started

Vítor opened the flagship plant's Reports panel on his phone and saw two
evaporators at 60.00 m² each, costed identically, with no design basis
beside either — while the panel's own header promised "size, material,
design basis and capital cost".  The header was not lying about the
column; it was lying about the coverage.  Of the eight sizers only
`VesselSize` stated the rule that produced its size key, and the sheet, the
CSV, the console and the GUI all drew `(not stated)` or nothing for the
other seven.

The 60.00 m² is not a defect.  The evaporator is a RATING model: it is
GIVEN its area (`operation { area 60 m2; }`) and computes what that area
does.  A declared size passed through a sizer is legitimate — but a reader
cannot tell it from a computed one unless the sizer says so, and that is
the whole subject of a design basis.

## 2. The rule

**Every sizer states the rule that produced its Guthrie size key, in the
`basis` field, at the site where the rule is applied.**  A pass-through
says it is one (`declared operation.area`); a derivation names its inputs
and which of them the author set (`A = Q/(U*LMTD)  U and LMTD author-set`).
The string is a WORD in the goldens (`exact`, whitespace normalised), so it
must be stable and must not carry a comma (`sizing.csv` does not quote).

One home: `EquipmentSizing::basis`.  The console line, `sizing.csv`, the
specification sheet and the GUI's design-basis list all read it and none
of them may invent one — `(not stated)` stays the rendering of an empty
field, so that the day a ninth sizer forgets, the omission is visible in
every surface at once rather than defaulted away in one of them.

## 3. What writing the basis found

Writing "which rule produced this size" for `CrystalliserSize` required
reading what its two inputs ARE, and the answer was a dimension error that
had been costed on the flagship plant since the sizer was written:

```
V_magma = liquorFlow * residenceTime          // declared m3
```

`liquorFlow` is the crystalliser's `kpis_["liquorFlow"] = F_liq; // kmol/s`
— a MOLAR flow, labelled so in the unit's own source — and the sizer
declared it `m3/s` and its product `m3`.  Measured on
`tutorials/plant/ChemicalPlantTutorial` (the case Vítor was looking at):

| | value |
|---|---|
| declared `operation.volume` | **1.0 m³** |
| `liquorFlow` KPI | 0.00911 kmol/s |
| `residenceTime` KPI | 2026.6 s |
| `V_magma` as sized and pinned | **18.464** — a molar holdup in kmol, written as m³ |
| purchased cost on that size | 807 k EUR (Guthrie anchor 3.0e5 USD @ 10 m³, exponent 0.6) |

The crystalliser was costed roughly an order of magnitude high, at exit 0,
with a golden pinning the wrong number to four decimals and every gate
green — a golden pins what a run PRINTS.  Nothing recomputed the volume
against the declaration, because nothing knew the sizer was supposed to be
reproducing a declaration: **the basis is what makes a size auditable, and
an unstated basis is a size nobody can check.**

The MSMPR crystalliser's residence time is `tau = V/Q` with `V` the declared
working volume and `Q` the volumetric throughput (both `kpis_`), so the
honest size is the declared volume itself.  The unit now publishes it
(`kpis_["V_magma"]`) on both paths that publish `residenceTime`; the sizer
passes it through with `basis "V_magma = declared operation.volume (MSMPR
working volume; pass-through)"`, keeps `liquorFlow` under its TRUE unit
(`kmol/s`) and adds `throughput` (`m3/s`) beside it, so the sheet shows
the two flows a reader would otherwise confuse, each with its dimension.
Deriving `V` as `throughput * residenceTime` was rejected: it reproduces
the declaration to round-off and hides that it is one.

## 4. What moved, what did not

* `ChemicalPlantTutorial`'s golden: `values.V_magma` 18.464 → 1.0 and the
  three crystalliser costs with it; every other row unmoved.  The sugar
  plant twin declares the same 1.0 m³ and ships no golden (a sweep — #77).
* The other seven sizers gained a `basis` and **no number moved** on them;
  `check_equipment_pinned` requires the new `basis` rows on all eight
  cases (published ⇒ pinned), so the goldens carry the words.
* Guthrie's crystalliser range is `[1, 200]` m³ and the declared volume
  sits on its lower bound; the range check is announced, never refused,
  and its wording is the reader's.

## 5. Gates

* `check_design_sheet` gains two arms: (i) SOURCE — every sizer under
  `postProcessing/sizing/` assigns `d.basis` (the rule is structural, not
  a list of expected strings, which would be a second home for the
  sizers' vocabulary); (ii) INDEPENDENT — on every case whose sheet names a
  `crystalliser`, `V_magma` equals the unit's own declared
  `operation.volume`, read from the case dict by the gate and never from
  the run.  The second arm is the one that would have fired for the whole
  life of the defect.
* NOT gated, said plainly: whether any basis string is TRUE of its sizer.
  A gate can require the sentence; only a reader can check it against the
  arithmetic four lines above it — which is exactly how this defect was
  found.
