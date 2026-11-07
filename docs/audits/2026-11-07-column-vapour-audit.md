# Column vapour-model audit, 2026-11-07 (DEV.md 4c C239)

A read-only multi-agent audit: 12 assessors (three cases each) computed the
Pitzer-Tsonopoulos second virial estimate of the vapour fugacity coefficient for
the dominant species of every case that holds a `distillationColumn` (36 cases),
at the column's own pressure; two independent refuters re-read and recomputed
every flagged case (66 votes, 12 refuted); one synthesis ranked the result.  The
estimate is a SCREEN, not a verdict: at 1 atm the pure-vapour phi largely cancels
against phi_sat in K since C235, which is why the 1-atm family is a measurement
(slice S5) and not an EoS change.  Numbers below are the agents', not re-run by
the solver.

**Vapour-model audit — architect's analysis (2026-11-07, read-only; pattern = column19: `vapour { fugacityModel SRK; }` in `constant/thermoPhysPropDict`, phi_sat + Poynting then ride automatically via `ThermoPackage::refFactor`, C235)**

**1. Confirmed cases, ranked by expected impact on duties and temperatures**

| # | Case | P bar | max dev | species | Fix (where) | Golden rows |
|---|---|---|---|---|---|---|
| 1 | column08_radfrac_multidraw | 16 | 21 % | C3/nC4/nC5/nC6, Tr 0.86-0.92 | SRK in case thermoPhysPropDict (replaces `idealGas` l.33) | 37, most move; it is check_energy_closure's worst kW entry |
| 2 | process05 + recycle02 (shared flowsheet) | 5 | 16 % | neoC5/nC5 | SRK in both dicts, one decision | 57 + 58; recycle02's eigenvalue pin (check_recycle_acceleration) may move |
| 3 | column20_mtbe_kinetic_mesh | 7 | 14 % (MeOH assoc.) | iC4/iC4=/MTBE/MeOH | SRK, exactly column19's dict; rewrite header l.8 "stays ideal" | 35; compare to column19's +2.5 % |
| 4 | column05_reactive_methylacetate | 1.02 | 3.9 % + unpriced dimer | AcOH (associating) | NOT SRK: declare the C201 `vapourDimerisation` the aceticAcid02 record already carries (one record, two vapours); drop the "deliberately unmodelled" comment | 36 |
| 5 | 1-atm benzene/toluene family: column02/04/06/09/10/12/17/18, heatlink01/02, optim01/06, pareto01, sensitivity01/02 | 1.01 | 3.3-5.1 % phi, ~1.5 % alpha | Bz/Tol/oXyl | Header sentence, no EoS — see §2: identical evidence refuted column01/11/16 | 0 |
| 6 | column07_naphtaliSandholm | 1.01 | 6 % | nC4/iC5/nC5 | Keep ideal (validation spec of the 1971 paper); say so in header | 0 |
| 7 | column03, crystalliser09, aceticAcid02, column13, stripper01/02 | 1-1.5 | 1.4-2.7 % | EtOH/water, H2O/NH3 | Header sentence; column03 optional SRK sensitivity (gamma-phi showcase) | 0 |

The "wrong" verdicts of row 5 rest on pure-vapour phi at total P; the two refuters of column01/11/16 showed that phi/phi_sat cancels in K at 1 atm and C235 now computes that cancellation. The confirmed/contested split is therefore inconsistent for the 1-atm family and I merge rows 5 and §2 under one measurement (slice S5). Real duty impact at 1 atm: H_res ~0.1-0.2 kJ/mol against latent ~31 kJ/mol, under 1 %.

**2. Contested cases and what settles each**
- column01, column11, column16, acetone06, acetone07, acetonePlant: all refuted on the phi_sat-cancellation argument. Settled by ONE measurement each: run a scratch copy with `fugacityModel SRK` and read the moved rows. If x_D, T_top and Q_cond move < 1 %, the header sentence is the fix; if > 1 % (column17/18 and heatlink price the condenser duty directly, so these are the candidates), the EoS is declared.
- acetone06/07: the IPA record discrepancy (finding: Joback 525.94/50.586/0.571; refuter: ChemSep 508.3/47.62/0.665) is settled by reading the case-local `constant/components/isopropanol.dat`; the verdict cannot be stated before that.

**3. Gates and lessons citing each confirmed case (git grep over bin/curate, gui/src, docs)**
- column08: check_energy_closure (kW ledger entry + radfrac arm l.786), settled-contracts.md, the-state-a-unit-computes-with.md, advisory-attribution.md.
- process05: 4 design records (a-negative-pressure-is-refused, review-c131, the-key-nobody-read, the-state-a-unit...); recycle02: check_recycle_acceleration only.
- column20: check_kinetic_mesh, docs/ai/packs/separations.md, docs/ai/unit-ops.md, decision-records.md, a-rate-law-in-the-full-mesh.md, tutorials-catalogue.md.
- column05: check_column_thermo_consistency, check_reactive_mesh, check_column_datum_downgrade, check_degenerate_limits; c201-item1-moved-rows.md, one-record-two-vapours-acetic-acid.md.
- column02: check_block_tridiagonal, check_degenerate_limits, check_model_default_registered, suite_lanes.txt; GUI witnesses `FUG_RIGOROUS_WITNESS` (fugShortcut.ts) and `COLUMN_CONTROL_WITNESS` (ColumnControlTool.tsx) — any change needs `--gui`.
- column09/10: check_design_sheet, check_internal_states, check_plant_layout; gui equipmentSchematic.ts, ColumnDatasheet.tsx. column17: check_design_sheet (199 rows). column04/06/12: check_energy_closure (+ check_stage_identity for 12, check_distillation_seed for 06).
- stripper01/02, column13: check_tray_chemistry, check_impossible_phase_pins, debt_registry, SourWaterTool.tsx. aceticAcid02: check_column_thermo_consistency, check_design_sheet, check_energy_closure, check_plant_layout, poolFire lessons, FASTSET excluded. column07, pareto01, sensitivity02: no gate.

**4. Order of work (slices <= 2 h; a general per slice, own worktree; moved-row list in each commit)**
- S1 (1 h): column08 -> SRK; run; list 37 rows with reasons (phi, H_res at 16 bar); check_energy_closure pin re-measured, check_column_thermo_consistency re-probed. ~35 rows move.
- S2 (1.5 h): process05 + recycle02 -> SRK; 115 rows; the dominant-eigenvalue pin re-read, not retyped. ~90 rows move.
- S3 (1.5 h): column20 -> SRK; header + packs/separations.md + a-rate-law record; compare duties to column19 and the reference. ~30 rows move; check_kinetic_mesh.
- S4 (2 h): column05 -> C201 dimerisation declaration; check_reactive_mesh/thermo_consistency/datum_downgrade; 36 rows, ~30 move.
- S5 (2 h, measurement only, zero goldens): scratch SRK copies of column01, column03, column17, column18, acetone06, acetonePlant C1; a decision table of moved x_D/T/Q; IPA record read. Output decides S6/S7.
- S6 (1.5 h, zero goldens): the header sentence on the ~22 1-atm cases ("ideal vapour: phi 0.95-0.97, alpha shifts ~1.5 %, cancels in K"); fix sensitivity02's stale header; check_process_prose.
- S7 (conditional on S5, 2 h): SRK on column17/18/heatlink if duties moved > 1 % (199 + 32 + ~60 rows), `--gui` for the witnesses.
No deeper multi-agent review is proposed: what remains open is a measurement (S5), not a judgement.
