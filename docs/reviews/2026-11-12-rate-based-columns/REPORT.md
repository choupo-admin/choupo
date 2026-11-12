# Review by measurement: the tray-efficiency and packed-bed slice (C329)

Date: 2026-11-12.  Reviewed at main 2c1cedeeb5.  Cell: the `totalReflux`
column model with `efficiency {}` (trays) and `packing {}` (beds), column
VERIFIED and the honesty of its reporting.  The reviewer changed no tracked
file; scripts and tables are beside this report.

## 1. What the slice is

`TrayEfficiency`, `PackingRBF`, `PackingDelft` and
`DistillationColumn::solveTotalReflux[Packed]`; twelve cases
(`totalReflux01`, `trayEfficiency01`-`07`, `packing01`-`04`); Theory Guide
`ch:ratebased`; design record `docs/design/c329-ratebased-first-delivery.md`.
It has no gate of its own: its guards are self-recorded goldens.

**It is not a rate-based model.**  There are no separate phase balances, no
interface compositions or fluxes and no Maxwell-Stefan.  A tray efficiency or
a packing HETP is computed from mass-transfer correlations and applied to
equilibrium stages; the packed bed integrates dy/dz = (y* - y)/H_OG with
H_OG = H_G + lambda H_L (a two-film transfer-unit model).  It runs only under
`model totalReflux;` and only for a binary.  The Theory Guide and the case
headers say so plainly; two other documents do not (RB-08).

## 2. Answers to the questions put to the review

* **Trays as well as packing: yes.**  The unit of calculation is the real
  tray, each with its own E_MV from its local traffic.  Correlations: AIChE,
  Chan and Fair (1984), Syeda, Afacan and Chuang (2007); entrainment by
  Colburn on Fair's correlation (on by default); flooding by Fair.  The FLOW
  PATTERN IS NOT DECLARED and has no key: vapour mixed between trays, liquid
  by the eddy-diffusion model of the chosen correlation, single-pass
  crossflow.  Weeping enters no efficiency.
* **Multicomponent:** refused; binary only, where one E_MV per tray is exact.
* **Reactive absorption:** not covered (no enhancement factor anywhere).

## 3. Independent recomputation

Python, standard library, own property routes (`tray_efficiency_independent.py`,
`packing_rbf_independent.py`).  The primary papers were not available: the
correlations are written from the published forms as the reviewer knows them,
and the script headers say which constants are transcribed.

| quantity | independent | engine | difference |
|---|---|---|---|
| tray 5, AIChE (`trayEfficiency01`), E_OG | 0.6344 | 0.6346 | -0.04 % |
| same, E_MV with entrainment | 0.7461 | 0.7464 | -0.04 % |
| tray 5, Chan-Fair (`trayEfficiency05`), E_MV | 0.8870 | 0.8894 | -0.26 % |
| column, AIChE, overall efficiency | 0.7428 | 0.7377 | +0.5 points |
| column, Chan-Fair, overall efficiency | 0.8955 | 0.9011 | -0.6 points |
| bed (`packing01`), pressure drop, Pa/m | 120.05 | 120.11 | -0.05 % |
| bed, effective area ratio | 0.6520 | 0.652 | 0.0 % |
| bed, HETP, m | 0.1563 | 0.1553 | +0.6 % |

The Chan-Fair liquid-side term follows the engine's reading of the paper's
equation, which could not be checked against the paper.

## 4. Against the measurements the cases cite

Values as transcribed in the design record (the papers were not read).  Run
628, measured overall efficiency 70.8 %: AIChE 73.8, Chan-Fair 90.1,
Syeda-Chuang 62.1.  Packed bed at F = 1.5: 0.155 m against about 0.17-0.18 m
digitised.  AIChE, Rocha-Bravo-Fair and Delft are predictions; Chan-Fair and
Syeda-Chuang are IN-SAMPLE (these trays are in their regression data).

## 5. Sabotage

| sabotage | result |
|---|---|
| Chan-Fair exponent on the clear-liquid height 0.5 -> 0.6 | caught by the golden of `trayEfficiency05` |
| effective area set equal to the packing area | caught by the golden of `packing01` |
| reboiler duty multiplied by 1.10 | golden fails, but the energy report still prints VERIFIED (RB-02) |

## 6. Findings

Each reproduced twice by the review; RB-02 (by reading the march) and RB-03
(by running a copy of `column11` with the block added: same duties, exit 0,
one `[dict] ... never read` line, nothing in the end-of-run caveat block)
were reproduced again by the commander.  Full text in `findings.tsv`.

* **RB-01 (S2)** the design record reports the two highest measured loads at
  34 kPa on the 14 % tray as beyond the model's flood; the engine runs both
  (F_s 2.305 and 2.356) and first refuses between 2.356 and 2.40.  The error
  statistics leave out the only tabulated high-load run.
* **RB-02 (S2)** the total-reflux tray column prints its energy closure as
  verified by a second route.  Every V_j of the march is defined from Q_R,
  so -Q_C = Q_R is an identity: the check cannot fail.
* **RB-03 (S2)** an `efficiency {}` block on a column that is not
  `totalReflux` is ignored; the only notice is a dict-audit line mid-log.
* **RB-04 (S2)** the first header line of `trayEfficiency05`-`07` says "not
  fitted to"; the same headers say in-sample further down.
* **RB-05 (S3)** the packed bed sets Q_condenser = -Q_reboiler by assignment
  and publishes no closure-by-construction entry.
* **RB-06 (S3)** no golden row of the twelve cases is an `anchor`; the
  comparisons with measurement live only in documents.
* **RB-07 (S3)** the binary-only refusal always names AIChE.
* **RB-08 (S3)** the planning record calls the slice "rate-based columns";
  `column14` and the Tutorials Guide say Choupo deliberately has none.

## 7. Not examined

The 165 kPa and 8 % tray cases and `packing02`/`packing04` beyond the design
record; the Delft equations beyond flooding; the primary papers; the
pressure-drop routes; the GUI; the column datasheet.

## 8. The cell

VERIFIED can be filled for the AIChE and Chan-Fair tray efficiencies and the
Rocha-Bravo-Fair bed AT THE POINTS TESTED once the two scripts become a gate
(proposed rows: the tables beside this report).  VALIDATED stays empty: no
measured point is pinned (RB-06).
