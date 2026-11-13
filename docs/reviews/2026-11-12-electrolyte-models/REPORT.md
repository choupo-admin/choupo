# Review by measurement: are the electrolyte activity models redundant?

Date: 2026-11-12.  Reviewed at main 2c1cedeeb5.  Cell: the electrolyte
activity models (Davies, Pitzer single-salt, pitzerHMW, eNRTL single-salt,
multi-salt and mixed-solvent, the composite Davies + molecular route,
edwardsPitzer), columns VERIFIED and VALIDATED.  The reviewer changed no
tracked file.  `run_all.sh <repo root> [work dir]` regenerates every table
(about a minute); the commander re-ran it and read the rows of EL-01 again.

## 1. The answer to the question

No family is a duplicate that could be deleted without losing something.
Two pairs are ONE model in two kernels (they agree to round-off), and one
model gives wrong numbers away from 25 C without saying so (EL-01).

| pair | measured | conclusion |
|---|---|---|
| Pitzer single-salt vs pitzerHMW on one salt | 1.6e-14 (gamma), 1.9e-15 (phi) over 99 binaries by the engine's own check; 1e-7 to 2e-5 in speciation probes, the trace H+/OH- of the given pH | the same model; one shared kernel (`PitzerForm.H`); HMW adds mixing terms and speciation, single-salt is the surface the units read |
| eNRTL single-salt vs multi-salt on one salt | 3.6e-15 in ln gamma, 3.1e-13 in phi | the same model, but TWO separate implementations (and a third for the mixed solvent); the multi-salt one is reachable only from a props op |
| composite (Davies ions + molecular model) vs eNRTL mixed-solvent | not comparable: different reference states, different inputs | two routes to one problem; neither carries a transfer term |

## 2. Against measurement

Tables already in the tree (Hamer and Wu; Goldberg and Nuttall; Goldberg;
Archer 1992 for NaCl from 273 to 373 K).

| model | where | error in the mean activity coefficient |
|---|---|---|
| Pitzer | NaCl, KCl, 25 C | 0.06-0.19 % (parameters independent of these tables) |
| Pitzer | CaCl2 to 2 mol/kg; Na2SO4 | up to 2.2 %; 0.8-0.9 % |
| Pitzer | NaCl, 273-373 K | 2.0 % at most |
| eNRTL | NaCl, 25 C | 1.4 % (3.6 % at most) |
| eNRTL | KCl, CaCl2, Na2SO4, 25 C | 0.2-2.4 %, IN-SAMPLE (fitted to these tables) |
| eNRTL | NaCl, 373 K | -8 % (0.5 m), -33 % (3 m), -54 % (6 m) |
| eNRTL | NaCl, 273 K | +55 % (3 m), +96 % (6 m) |
| Davies | 1-1 salts | +0.3 % at I = 0.1; +8 to +13 % at I = 0.5 |
| Davies | Na2SO4 | within 3 % with the ion pair, +21 to +50 % without |

An independent implementation (Python, standard library) of single-salt
Pitzer and of Davies agrees with the engine to the nine figures the output
carries.

## 3. Findings (full text in `findings.tsv`)

* **EL-01 (S1)** single-salt eNRTL off 25 C: the interaction parameters are
  scaled as tau(T) = tau(25 C) x 298.15/T and nothing else, no record
  declares a temperature range, and the caveat block says nothing.  Reach in
  the corpus: `evaporator07` (the same brine boils with an elevation of
  3.945 K where Pitzer gives 5.200 K), `crystalliser07`, `crystalliser09`.
* **EL-02 (S2)** a Pitzer pair with no temperature extension (96 of 99) used
  at 373 K is announced by the props op only; the route the units use, and
  the speciation route, are silent.
* **EL-03 (S3)** the declared `tCorrelationForm` of three records is dropped
  on the way in, so every run says it is not declared.
* **EL-04 (S3)** stale temperature claims in three headers.
* **EL-05 (S3)** "one Debye-Hueckel constant" is claimed; four 25 C anchors
  exist, 0.3 % apart.
* **EL-06 (S3)** a hard-coded 8.886 in the mixed-solvent kernel against
  8.885 in the catalogue.
* **EL-07 (S3)** `PitzerHMW::verify` gates the gamma deviation only.
* **EL-08 (S3)** headers document `model pitzer;`; the builder accepts only
  `Pitzer` and `eNRTL`.
* **EL-09 (S3)** Davies' stated band (I about 0.5) is already 8-13 % off at
  its edge for 1-1 salts.

## 4. Not examined

edwardsPitzer accuracy (no common salt with the tables); any salt but NaCl
off 25 C (no data in the tree, so EL-02's disagreement between the two
package models cannot be settled here); the mixed-solvent routes against
measurement; how far EL-01 moves the two crystallisers; HMW mixing terms
against multi-salt data; the enthalpy surfaces.

## 5. The cells

VERIFIED can be filled for single-salt Pitzer and Davies (the independent
script) and for the two round-off identities.  VALIDATED can be filled for
Pitzer on NaCl and KCl at 25 C and NaCl over temperature; it stays empty for
eNRTL (in-sample at 25 C, failing off it).

## 6. Note on `enrtl_kernel_probe.cpp` after the fixes (2026-11-13)

The probe is the record of the measurements of items 2b and 5, taken at
56ccdb41ce.  It is NOT maintained and is not to be repaired.  Measured against
branch `fix/el-03-09` (7d7c8dfa4e), which answers EL-03..09:

* it still compiles, and its `salt` mode still prints the same numbers;
* its `mixed` mode prints `nan` in the two columns of the segment route
  (`gpm_segment_mixedRef`, `gpm_segment_yAlc0_Aphi0.3915`).  The probe builds
  `ENRTLMixedSolvent` with its default parameters, and the fix of EL-06 removed
  the default of the aqueous pair (`tau_OH_ca`, `tau_ca_OH`): its one home is
  now the catalogue record `parameters/eNRTL/Na-Cl.dat`, read by the
  `ENRTLMixedSolvent` operation, and the kernel carries a quiet NaN until a
  caller fills it.

So `item5_mixed_solvent_kernels.tsv` cannot be regenerated with `run_all.sh`
once that branch is on main.  The table stands as measured at 56ccdb41ce; a
new measurement of the segment route goes through the operation
(`ENRTLMixedSolvent` in a propsDict), which is what a case runs.
