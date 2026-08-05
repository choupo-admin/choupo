# Audit: invariant I5 (silent fallbacks) swept across `src/` — 2026-08-05

> **STATUS: EVIDENCE.**  Second read-only fleet audit under
> [`development-governance.md`](development-governance.md).  Every finding
> below re-verified by the architect against the quoted code.

**Invariant I5** — *silent fallbacks are forbidden; where the engine cannot do
what a case declared it refuses by name with a remedy, and where it substitutes
it announces.  A warning that lets a wrong answer through with exit code 0 is
the failure this project treats most seriously.*

---

## The systemic finding — every one of these is a SECOND implementation

Four of the eight confirmed violations have a **correct sibling already in this
codebase**, deciding the same question the right way:

| the silent path | its correct sibling |
|---|---|
| `ComputedReport.cpp:112` prints the SI number under the user's affine label | `DisplayUnits.cpp:125` — `if (s->affine) return false;`, and `:205` announces *"ignored 'temperature degC;' — unit not in catalogue"* |
| `DistillationColumn.cpp:1153` drops to the sensible datum in an empty catch | `Flowsheet.cpp:3388` — the identical downgrade, with an `AdvisoryLog` entry and *"a degraded datum … fix the species data to close it"* |
| `PSA.cpp:150` / `TSATwinBed.cpp:102` treat an unlisted adsorbate as non-adsorbing | `BatchAdsorber.cpp:196` refuses by name with the record path as remedy |
| `RateLaw.cpp:55` defaults a forward `order` to 0 | `RateLaw.cpp:57` — **the next line** — defaults `orderRev` to the stoichiometric coefficient, with a comment on why |

**This is not eight independent lapses.  It is the arity failure applied to
DECISIONS rather than to values.**  The project enforces one home per derived
*number*; it does not enforce one home per *policy*, so a second site
re-decides "what do I do when the datum is missing" and takes the easy branch.

The first audit of the day found the same root cause in numbers (a gas constant
with four spellings, a corpus tally with six homes). Two independent sweeps,
two different invariants, one disease.

## Confirmed — verified by the architect

Ranked by how badly a user is misled, not by tidiness.

**S1 — a temperature in °C prints as the kelvin number.**
`src/reporting/ComputedReport.cpp:112-119`. `disp` is only converted when the
unit is non-affine; `degC`/`degF` are registered `affine = true`
(`Units.cpp:119-128`), so `unit degC;` writes the raw SI value **under the
user's own label**, to `computed/values.csv` and to the console. A case asking
for a boiling-water outlet in °C reads `T_out = 373.15 degC`. Undetectable: the
label is exactly what was requested and the number is plausible. Any misspelt
unit does the same.
*A teaching simulator printing a wrong temperature to a student is the worst
single defect in this list.*

**S2 — a reactant omitted from the rate law becomes zero-order.**
`src/thermo/reaction/RateLaw.cpp:55`, consumed at `:142`
(`if (order_[i] != 0.0) rf *= pow(conc[i], order_[i])`). Omitting one `order 1;`
token yields a rate independent of reactant concentration; conversion no longer
falls as the feed dilutes, and a residence-time sweep returns a flat,
physically impossible response. Converges, exits 0. Every reactions dict in the
corpus writes `order` on every line, so the grammar's intent is not in doubt —
and `fromDict` refuses six other malformed kinetics blocks by name.

**S3 — a reactive column deletes the heat of reaction from the reboiler duty.**
`src/unitOperations/distillation/DistillationColumn.cpp:1149-1156`. One species
lacking `standardThermochemistry` flips `elem` false in an **empty catch**, and
`Q_reboiler_kW` loses the full Σν·ΔH_f. That KPI sizes the exchanger and drives
the utility cost. The justification comment ("dH is datum-independent for a
non-reacting unit") is copied from the non-reactive block, where it is true;
here the composition has changed by reaction, so it is false.

**S4 — the utility bill sums unpriced rows as €0/h.**
`src/postProcessing/EconomicsPass.cpp:407-410` sums `a.eur_h` across
`utilityAllocation` **without consulting `a.allocated`**, though the comment
says "allocated". Unallocated rows carry `eur_h = 0`. With no catalogue loaded —
a documented common case — `C_UT` is `0 EUR/yr` and NPV/IRR are printed strongly
positive for a plant whose steam is free. The printed line reads
`C_UT (utilities, allocated) = 0 EUR/yr`: a zero, not a refusal, and the
parenthetical actively asserts completeness.

**S5 — a declared utility absent from the catalogue is silently auto-picked.**
`src/reporting/UtilityAllocationReport.cpp:211-221`. The lookup failure is
erased to `nullptr`, which is indistinguishable from "none declared", so control
falls to the auto-pick. A case declaring `steamHP` against a catalogue shipping
only MP/LP is costed at MP and never contradicted — and this function feeds the
result JSON, so the substitution is what the GUI and the economics read. The
same function elsewhere distinguishes "(none adequate)" from "(no catalogue
loaded)" precisely so a message never asserts a check it did not perform.

**S6 — costing/sizing failures are counted, then discarded.**
`CostingPass.cpp:97-101`, `SizingPass.cpp:107-111` increment `failures`; both
call sites (`choupoSolve/main.cpp:960`, `EconomicsReport.cpp:45`) throw the
return value away. A unit whose material is not in the registry drops out of
`TOTALS` and `costs.csv`; FCI, NPV and IRR are computed as if the most expensive
item did not exist. Exit 0, `converged/` written, one `FAILED:` line on stderr.

**S7 — and the sweep driver discards even that.**
`SweepDriver.cpp:174-185` redirects `cerr` as well as `cout` into a sink that is
never read, around the whole post-processing chain. The stated intent is to
suppress N repeated economics tables; the effect is to destroy S6's only
channel. A sweep then plots NPV against feed rate where half the curve is costed
on a different equipment set, with no `nan`, no flag, nothing to distinguish the
rows.

**S8 — an unlisted adsorbate is treated as non-adsorbing.**
`Adsorbent.cpp:115` returns `0.0`; `PSA.cpp:150` does not even test, and
`TSATwinBed.cpp:102` re-labels the species as raw product with a bare
`continue;`. A component named `H2O` against a record keyed `water` passes 100 %
into the light product and the purity table looks fine.

## Suspected — recorded, not acted on

`Membrane::B_s` returning 0 for an unlisted solute (announced, but on `cout` at
`verbosity ≥ 1` while a lesser finding twelve lines above uses `AdvisoryLog`);
`Flowsheet::computeTearImbalance` returning a 0 energy residual it did not
compute (a wrong *assurance*, no wrong answer traced); CSTR/PFR emitting no
`Q_kW` when formation data is missing (correct posture — unless a consumer
treats the absent key as zero duty, which was not traced).

## Actions

| id | action |
|---|---|
| **AS1** | `ComputedReport` uses the `DisplayUnits` conversion path, or refuses the unit by name. **No second implementation.** |
| **AS2** | A forward `order` on a species with `nu < 0` is REQUIRED; absence refuses. |
| **AS3** | The reactive column announces the datum downgrade through `AdvisoryLog`, exactly as `Flowsheet` does — same message, same channel. |
| **AS4** | `C_UT` filters on `allocated`, and an unallocated duty with a service temperature refuses or is reported as UNAVAILABLE, never as 0. |
| **AS5** | A declared-but-absent utility refuses by name; it never falls through to the auto-pick. |
| **AS6** | Post-processing failures propagate: a total computed over an incomplete set is labelled incomplete or refuses. |
| **AS7** | `SweepDriver` suppresses `cout` only. |
| **AS8** | PSA/TSATwinBed adopt `BatchAdsorber`'s refusal verbatim. |

**Sequencing: AS1, AS2, AS3 first** — those three change numbers a user reads.
AS4–AS8 change numbers a user *prices*, which matters less than what a student
is taught.

**AS9, and it outranks all of them: the arity doctrine must extend to
decisions.** Eight violations, four with a correct sibling in-tree. Patching
eight sites without fixing that leaves the ninth to be written next week.
