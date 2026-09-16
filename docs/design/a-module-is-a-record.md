# A module is a record — a spiral element and a laboratory cell

*2026-09-15.  Vítor asked for membrane MODULE records: a case names a
commercial element or a laboratory cell instead of typing its channel
geometry.  Three records first — the DuPont FilmTec NF270-4040 and
SW30HR-380 elements and the Sterlitech SEPA CF flat-sheet cell — and one
ruling on the numbers no document gives, verbatim: "onde faltam parâmetros
coloca um valor educado, com uma nota a dizer que tem de ser verificado".
Built on `223f8b520` (the Geraldes & Afonso polarisation slice of the same
morning).*

## 1. What a case typed before

A spiral-wound module was five numbers from four places:

```
operation
{
    membrane         NF270;             // the transport record
    area             7.6;               // m2   -- typed
    length           1.0;               // m    -- typed (element? leaf?)
    massTransfer { model SchockMiquel; channelHeight 0.7 mm; spacerPorosity 0.9; }
    pressureDrop { model SchockMiquel; }
}
```

and nothing in that text said which number was the manufacturer's and
which the author's guess, nor what the element is rated for.  membrane14
(the polarisation witness) carried `channelHeight 0.7 mm` with no source;
membrane01 carried `length 1.0` and the header could not say whether that
was the element or the leaf.  The nominal form (`moduleDiameter 4 in;`) is
a hand table INSIDE `SpiralWoundModule.cpp` — a catalogue-typical area with
no record behind it — and it stays, untouched, for the cases recorded on it.

## 2. The record

`kind membraneModule;` in the ONE flat assets home, read by a new
`MembraneModuleRegistry` (same shape as `MembraneRegistry`: standards tier,
then every case-local `constant/assets/` under one guard, a case record
overriding the catalogue's by name aloud).  Not folded into the membrane
registry: a membrane knows nothing about geometry and a module nothing
about transport, and one map keyed by name could not say which of the two
`NF270` names.  The record:

```
name           NF270-4040;
kind           membraneModule;
manufacturer   "DuPont FilmTec";
membrane       NF270;              // the membrane it is wound with
format         spiralWound;        // spiralWound | flatSheetCell
activeArea     7.6 m2;             // 82 ft2 (data sheet)
channelHeight  0.7112 mm;          // 28 mil -- ESTIMATE
spacerPorosity 0.90;               // ESTIMATE
leafLength     0.95 m;             // ESTIMATE
limits    { P_max 41 bar; T_max 318.15 K; dP_max 1.0 bar; feedFlow_max 3.6 m3/h; pH_min 3; pH_max 10; }
ratedTest { solute MgSO4; feedMassFraction 2.0e-3; P 4.8 bar; T 298.15 K; recovery 0.15; permeateFlow 9.5 m3/d; rejection 0.97; }
provenance
{
    source  "DuPont FilmTec NF270 Element Product Data Sheet, Form No. 45-D01529-en, Rev. 8, January 2025";
    channelHeight  { origin estimate; reviewStatus unverified; notes "..."; }
    spacerPorosity { origin estimate; reviewStatus unverified; notes "..."; }
    leafLength     { origin estimate; reviewStatus unverified; notes "..."; }
}
```

Grammar decisions, each with its other value:

* `format` has two words and the reader dispatches on it through
  `registryRefusal::message(..., "Accepted")` — the 2026-09-07 rule.
* A spiral **names** its membrane (it is wound with one); a flat cell
  **may not** (it takes any coupon, so the case declares `membrane` beside
  `module`).  Both directions refuse.
* A flat cell stores `slotWidth` and `slotDepth` (the manual's facts) and
  NO channel length: `L = activeArea / slotWidth` is derived where it is
  used.  A spiral stores `leafLength`, not the element length: the module
  marches the LEAF (`W = A/(2L)` needs it), and the 1.016 m element length
  is the note's business.
* `limits {}`: a limit the sheet does not state is ABSENT (a `has*` flag),
  never a zero.  The SW30HR-380 sheet states no maximum feed flow; the
  SEPA CF manual states no pH band ("membrane dependent"); neither record
  declares one and neither is checked.
* `ratedTest {}` in fractions (2,000 ppm → `2.0e-3`), all or nothing; a
  cell has none.
* Per-value provenance under `provenance {}` keyed by the field, the
  `lennardJones` form (2026-09-06); `notes` is the corpus's key (2138 uses
  against 5 of `note`), so the brief's `note` became `notes`.
* `m3/d` joined the unit table: a data sheet quotes gpd (m³/d), and the
  transcription writes the sheet's number.

## 3. The estimates, and the ruling made structural

The reader REFUSES an `origin estimate` block with no `reviewStatus` or no
`notes`: an educated value that does not say it is one, and how to check
it, is the silence the ruling forbids.  The module ANNOUNCES every estimate
on every run — `[estimate] module 'NF270-4040': \`channelHeight\` = ... is an
ESTIMATE, reviewStatus unverified -- <the record's note>` — under the same
tag Database.cpp gives a Joback component, on `AdvisoryLog` so it reaches
the caveat block and the result JSON.  A record with no estimate prints
nothing: silence keeps meaning "nothing was assumed" (the 2026-09-06 rule).

| record | value | educated number | the note says |
|---|---|---|---|
| NF270-4040 | `channelHeight` | 28 mil (0.7112 mm) | the spacer DuPont states for its 8-inch SW30HR-380; the NF270-4040 sheet states none, **and neither does the sibling BW30 PRO-4040 sheet** (Form 45-D03970-en Rev. 5, fetched and read 2026-09-15 — the brief had assumed it would); verify by measuring the spacer on an unrolled leaf |
| NF270-4040 | `spacerPorosity` | 0.90 | typical for commercial diamond spacers; verify by weighing a coupon, ε = 1 − m/(ρ_PP·A·h) |
| NF270-4040 | `leafLength` | 0.95 m | the element is 1.016 m with end caps; the leaf is not published; unroll one |
| SW30HR-380 | `spacerPorosity` | 0.90 | as above |
| SW30HR-380 | `leafLength` | 0.95 m | as above |
| SEPA_CF | `channelHeight` | 31 mil (0.7874 mm) | the channel is the installed spacer plus shims (the 1.09 mm slot is shimmed down to it); 31 mil is one of the four spacers Sterlitech ships; verify for your own stack |
| SEPA_CF | `spacerPorosity` | 0.90 | as above |

SW30HR-380's spacer is a data-sheet fact (28 mil, Typical Properties) and
carries `origin literature` with the sheet named — the gate holds that a
sheet value is never marked an estimate, and that a value the sheet does
not state always is.  No fourth kind of number was needed: every field the
module reads is either on a page or in the table above.

## 4. The engine

`module <name>;` in `spiralWoundModule`'s operation.  With it: the
membrane (spiral) or `membrane` required beside it (cell), the area, the
channel geometry and the length come from the record; `area`, `length`,
`moduleDiameter`, `nModules`, `channelHeight`/`spacerPorosity` inside
`massTransfer`/`pressureDrop`, and `membrane` beside a spiral module each
REFUSE, every offending key listed (one home).  `elements N` stays allowed
on a spiral (a count is not geometry) and refuses on a cell.

**One face or two.**  `facesPerLeaf` is 2 for a spiral and 1 for a cell,
and `W_ch = A/(facesPerLeaf·L)` — the ONE change to the channel arithmetic
(the legacy path keeps `A/(2L)` byte for byte).  The `[spec]` line says
which was used.  On the SEPA cell at 0.2 m/s that is the difference
between 48.6 L/h and 97 L/h of feed.

**Limits announce.**  After the march (the pressure drop is known then):
P_max, T_max, feedFlow_max, dP_max per element, and the pH band when the
case declares a numeric `scaling { pH }`.  `[limit] module '...': feed P
60.00 bar EXCEEDS the maximum operating pressure 41.00 bar -- the run
continues outside the manufacturer's rating (<source>)`, plus a `rating`
advisory.  Never a refusal.

**One new KPI, only under `module`:** `u_crossflow_inlet`, the velocity in
the record's channel — the number a laboratory protocol prescribes.
Published only when a module is declared, so no pre-existing golden gains
an unpinned KPI (the `Gamma_<solute>_avg` lesson of the morning).

## 5. The rated test, measured

The gate builds each spiral at its sheet's conditions — the solute, the
mass fraction, the pressure, the temperature, and the feed flow the sheet's
recovery implies (permeate / recovery) — runs it through the existing
module and PRINTS:

```
[rated test] NF270-4040: 2000 ppm MgSO4, 4.8 bar, 298.15 K, feed 63.3 m3/d --
    engine permeate 15.52 m3/d (recovery 24.5 %), rejection 99.66 %
    | data sheet: 9.5 m3/d at 15 %, rejection 97.00 %   (ratio permeate 1.63x)
[rated test] SW30HR-380: 32000 ppm NaCl, 55.0 bar, 298.15 K, feed 325.0 m3/d --
    engine permeate 51.77 m3/d (recovery 15.9 %), rejection 99.84 %
    | data sheet: 26.0 m3/d at 8 %, rejection 99.70 %   (ratio permeate 1.99x)
```

Two findings, recorded and not tuned.  **The fitted `A_w` of both membrane
records is high against the manufacturer's own test — 1.6× on the NF270,
2.0× on the SW30HR** — under a spacer channel with a computed film, where
membrane01 was recorded with a constant `k_film 5e-5` and 35 g/L.  Both
records say in their own headers that their permeabilities are fits to a
teaching case (`provenance fittedToCase`), and task #67 already names
NF270's `A_w` as off; this is the first number that says by how much,
against a primary.  The rejections are on the high side of the sheet on
both (MgSO4 99.66 vs > 97; NaCl 99.84 vs 99.7), consistent with the same
fits.  A re-fit against the rated test is a curation act and is Vítor's.

## 6. The witnesses

* `membrane15_module_nf270_4040` — NaCl 2 g/L at the sheet's rated 4.8 bar
  and the feed its rated test implies (2.6 m³/h): recovery 19.9 %,
  R_obs(NaCl) 72.4 %, 68 LMH, u 0.28 m/s; three `[estimate]` lines.
* `membrane16_module_sw30hr_8040` — seawater 32 g/L at 55 bar, 13.5 m³/h
  (the 8 % test point's feed): recovery 16.0 %, R_obs 99.84 %, 62 LMH,
  u 0.32 m/s; two `[estimate]` lines (the spacer is measured).  Beside
  membrane01 (35 m², typed, constant k, 35 g/L: 15.6 %, 99.78 %).
* `membrane17_sepa_cf_flat_cell` — the SEPA cell with membrane12's NF270
  coupon and feed under SDEM, the coupled film, at 0.2 m/s (48.6 L/h,
  arithmetic in `0/feed`, `u_crossflow_inlet` = 0.2001 published):
  recovery 2.5 %, R_obs Na 66.5 / Cl 67.6 / NO3 18.1 / NH4 71.4 %,
  ξ 34.4 V/m, ψ 33.4 mV; W = A/L = 95.3 mm, L = 146.9 mm derived.

`tutorials/FASTSET` needed no line: the family is `steady/membranes` and
membrane01 represents it.  `check_sdem` keys on membrane12/13 by path and
is unaffected.

## 7. The gate, and its sabotages

`bin/curate/check_membrane_modules.py`, six arms — (a) the records against
a SECOND transcription of the same pages inside the gate, through the
gate's own parser; (b) each witness announces exactly its record's
estimates with the record's note and a provenance advisory each; (c) five
refusals; (d) the published inlet crossflow times the record's section
recomputes the feed flow to 1e-9 on `A/L` for the cell and `A/(2L)` for the
spiral, and the profile's last z is the channel length; (e) a 60 bar,
5 m³/h twin prints both `[limit]` lines and exits 0, no witness prints one;
(f) the two rated tests run and print.  Wired into `bin/runTests` beside
the polarisation gate.

Sabotages by hand (S1–S8 in the docstring): all caught.  S2 (a note
removed) was caught by the ENGINE first — the reader refuses the record and
every witness dies — so the gate stopped at "did not run"; with the
engine's refusal disabled too, arms (a) and (b) fire.  S8 (the cell's
length taken as the slot width) is the discriminating one for arm (d): the
u·W·h·ε product survives it (W and L cancel) and only the profile's last z
catches it — which is why the arm holds both.

One trap paid for in the gate: **a URL inside a quoted string carries
`//`**, and the gate's first comment stripper ate the SEPA manual's address
and everything after it, so arm (a) read a provenance block with no
`channelHeight` in it.  The engine's tokenizer reads quoted strings before
it looks for comments (verified: the `[limit]` line prints the full URL);
the gate's stripper is quote-aware now.

## 8. Not done, named

* More elements (BW30, NF90, the 2540 and 8040 siblings): each is one
  record and one row in the gate's table; no code.
* A spacer GEOMETRY model (filament diameter, mesh angle → porosity and
  hydraulic diameter): today porosity is a number, estimated.
* Hollow fibres and tubular modules: a different channel, a new format
  word and a new W.
* Re-fitting `A_w`/`B_s` against the rated tests (§5) — a curation act.
* The pH limit is checked only from a numeric `scaling { pH }`; no witness
  declares one, and the gate says so.
* The batch vessel (`batchDiafilter`) reads no module record.
* The WASM bundle was not rebuilt (no emscripten here); §13 of CLAUDE.md
  applies on the next publish.
