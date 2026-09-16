# Polarisation of a multi-ionic solution — one field at the interface

*2026-09-15.  Vítor asked for the model of Geraldes & Afonso, "Prediction of
the concentration polarization in the nanofiltration/reverse osmosis of
dilute multi-ionic solutions", J. Membr. Sci. 300 (2007) 20–27,
doi:10.1016/j.memsci.2007.04.025, to become the ONE home of the wall
concentration in the membrane units.  It is his own paper; the equations
were read from the PDF and are cited by number, no prose transcribed.*

## 1. What was measured before anything was built

Three transport laws carried three copies of the film model:

| law | where | what it read |
|-----|-------|--------------|
| `solutionDiffusion` | `SolutionDiffusion.cpp`, the closed form `c_m = E c_b/(1 + B(E−1)/φ)` | one `k_film`, `E = exp(J_w/k)` |
| `DSPM-DE` | `wallIons` lambda, the same closed form per ion via the parent salt's `B_s` | one `k_film` |
| `SDEM` | `wallOf` inside `solveInner`, `c_m = c_p + (c_b − c_p) E` | one `k_film` |

and one `k_film` meant one diffusivity: `kFilmAt` evaluated the registered
`MassTransferModel` with a single `D_solute` (declared, priced for the FIRST
nonvolatile solute, or the legacy 1.6e-9), so on an ion-declared feed with a
correlation every ion would have polarised at the SAME rate — Na⁺ with the
diffusivity of Cl⁻.  No corpus case had that combination (membrane04/05 use
a lumped NaCl; every ionic case declares a constant `k_film`), which is why
nothing was wrong on the day and why it would have been wrong silently on
the first case that combined them.  The SDEM banner said the other half out
loud every run: *"polarisation film computed PER ION with no field in the
film (the diffusion potential exists there too): an approximation of this
version, announced"* — the sentence the SDEM record's §6 and CLAUDE.md
both filed under NOT done.

## 2. The model, and why it costs no parameter and no film thickness

At the feed-solution/membrane interface the flux of ion *i* that the
permeate carries away (Eq. 1, `J_v C_{i,p}`) equals back-diffusion plus
convection plus MIGRATION in the electrical potential gradient ξ that the
ions' different mobilities set up (Eqs. 2, 3, 7):

    J_v C_{i,p} = −k*_{c,i} (C_{i,m} − C_{i,b}) + J_v C_{i,m} − z_i C_{i,m} D_i (F/(R T)) ξ

with `k*_{c,i} = k_{c,i} Ξ_i` (Eq. 4) the ion's mass-transfer coefficient
corrected for the suction of the permeation, and electroneutrality at the
wall closing the system (Eq. 8): `Σ z_i C_{i,m} = 0`.  Unknowns: the *n*
wall concentrations and ξ.  Each `k_{c,i}` comes from the module's own
correlation `Sh_i = a Re^b Sc_i^c` on the ion's OWN diffusivity — the main
assumption of the model is that one ion's coefficient does not depend on
the others, and the paper validates it against the exact single-salt
solution (within 10 % for 0.16 < D₁/D₂ < 5.5 and φ < 3).  Two corrections:
Eq. 5, `Ξ = φ + (1 + 0.26 φ^1.4)^−1.7` (Geraldes & Afonso, AIChE J. 52 (2006)
3353; φ < 20), and Eq. 6, `Ξ = φ + φ/(e^φ − 1)` (film theory).

What is NOT in it is the point: no film thickness δ (the extended
Nernst–Planck alternative needs one and Bowen & Mohammad had to assign it
from the slowest ion), no diffusion potential INSIDE a film (the interface
is a plane between the double layer and the bulk), no new parameter (the
correlation and the ions' D are what a module already has).

**Solving it.**  For a given ξ' = Fξ/(RT) every wall is explicit,
`C_{i,m} = (k*_i C_{i,b} − J_v C_{i,p})/(k*_i − J_v + z_i D_i ξ')`, with
`k*_i − J_v = k_i(Ξ_i − φ_i) > 0` for both corrections.  Electroneutrality is
then ONE scalar equation g(ξ') = 0; on the interval where every denominator
keeps its sign (bounded below by the cations, above by the anions) g falls
monotonically from +∞ to −∞, so it is bracketed, bisected and Newton-polished.
If no bracket leaves every C_{i,m} > 0 the wall is REFUSED by name, never
clamped: a wall BELOW the bulk is legitimate (the paper's Table 1 has Cl⁻
with negative observed rejection and negative Γ), a negative one is not.

**The reduction that keeps every golden.**  With Eq. 6 and z = 0 (or ξ = 0):
`k* − J_v = J_v/(e^φ − 1)` and `k* C_b − J_v C_p = J_v(e^φ C_b/(e^φ − 1) − C_p)`,
so the explicit wall is EXACTLY `c_m = c_p + (c_b − c_p) e^{J_v/k}`.  The
defaults `filmTheory` / `none` are therefore the film the corpus was recorded
on, to round-off; all 15 membrane and diafilter goldens pass unchanged, and
the solution-diffusion law's joint solve (wall + permeate closure) lands on
the old closed form in ZERO Newton iterations because that closed form is its
seed and its residual is affine.

## 3. Where it lives

* `src/unitOperations/membrane/massTransfer/Polarisation.{H,cpp}` — the ONE
  home: the policy, the kernel `wallConcentrations` (Eqs. 2–8), the joint
  `wallWithSolutionDiffusion` (the wall with `c_p = B c_m/(J_v + B)`), and
  the per-unit `Polarisation` object (policy + per-solute z, D + the k
  supplier).  `buildPolarisation` resolves each solute's charge through its
  DECLARED bridge (`singleMaster` → `ionCharge`, never a name; a salt or an
  unmapped solute is neutral/lumped), an ion's D from its species record's
  `D0` — only when a correlation or the coupling needs it, refusing by name
  with the curation remedy otherwise — and announces every default used.
* `TransportContext` carries `const Polarisation&` and the station's
  `MassTransferContext` (u, d_h, μ, ρ) in place of `scalar k_film`; the three
  laws ask it for their wall and compute none.  `TransportSolution` gained
  `xi`/`hasXi`.
* The module publishes `Gamma_<solute>_avg` (every case), profile columns
  `Gamma_<solute>`, `k_film_<solute>` per solute when a correlation prices a
  different k per solute (else the single `k_film`, so no profile moves),
  `xi_V_per_m` + `xi_V_per_m_avg` when coupled.
* `StirredCell` mass-transfer model: `Sh = a (ω r²/ν)^b Sc^c`, `k = Sh D/r`;
  ω and r are PARAMETERS of the model, not fields of the context (the context
  carries what the module marches — u and d_h — and a stirred cell has
  neither; two slots every channel model would ignore).
* Props op `polarisationIndex`: the glass-box surface, one row per operating
  point.
* `BatchDiafilter` builds the same object over its constant `k_film`, so a
  vessel fed ion by ion can couple its film; not exercised by a case.

## 4. The grammar, and why the block is its own

    operation
    {
        ...
        polarisation
        {
            suctionCorrection  GeraldesAfonso2006 | filmTheory | none;   // Ξ: Eq. 5 | Eq. 6 | 1
            ionCoupling        electroneutral | none;                   // Eq. 8 with migration | per ion, field-free
        }
    }

The two words are the FILM'S POLICY and are declared once whichever way k
arrives.  Inside `massTransfer {}` they would be declarable only by a case
that uses a correlation, and the SDEM witnesses — deliberately intrinsic on a
bare `k_film 1e-2` — could never switch the coupling on; the policy is about
the film's physics, not the correlation's.  So the block sits beside
`massTransfer {}` and the two words inside it REFUSE naming the block.  An
unknown word refuses through `registryRefusal::message` with the accepted
list (the 2026-09-07 rule); an unknown KEY in the block refuses too (a typo
in `ionCoupling` would otherwise select the default in silence).  Defaults
`filmTheory` and `none` — a default that is USED is ANNOUNCED once per run
(AdvisoryLog + console): the suction default always; the coupling default on
an ion-declared feed (≥ 2 charged solutes), saying the film is per ion and
field-free and naming `ionCoupling electroneutral;`.  `none` for the suction
correction is a real choice (what the correlation gives before any
correction) and is kept.

## 5. The witnesses

**`props/membrane/polarisation01_geraldes_afonso_table1`** — the paper's own
case study: Table 1 (Bowen & Mohammad 1998; Amicon 8200, r = 2.4 cm,
ω = 41.9 rad/s, ν = 8.97e-7 m²/s, Re = 26 907, `Sh = 0.23 Re^0.567 Sc^0.33`)
as a case-local dataset, the dye a case-local species (z = −3, D = 0.36e-9,
the paper's footnote; MW a flagged NOMINAL placeholder — the sources do not
identify the compound and nothing reads it), Na⁺ derived by electroneutrality
as the table's footnote says (`closeBy Na;`).  Headline numbers (Γ per ion):

| row | dye feed | Cl⁻ feed | Γ_dye | Γ_Na | Γ_Cl | ξ [V/m] |
|-----|----------|----------|-------|------|------|---------|
| 1   | 4        | 5.20     | +0.504 | +0.310 | −0.137 | −60.3 |
| 10  | 37       | 87.26    | +0.273 | +0.120 | −0.074 | −30.0 |

The engine's Re is 26 906 against the paper's 26 907 (their rounding of ν).
The rows at 37 mol/m³ read off the paper's Fig. 7b open symbols to the
figure's resolution (dye 0.18 → 0.27, Cl⁻ −0.24 → −0.07); the rows at
4 mol/m³ sit within ~0.05 of Fig. 7a.  The Fig. 7 FILLED symbols (extended
Nernst–Planck in the dye's film) are not reproduced.

**`steady/membranes/membrane14_polarisation_multiionic`** — membrane12's
feed and law (NF270, NaCl 0.01 M + NO₃⁻/NH₄⁺ traces, SDEM) on a REAL spacer
channel: one nominal 4-inch element, 4 m³/h (u ≈ 0.45 m/s), `massTransfer
{ model SchockMiquel; }` + `pressureDrop { model SchockMiquel; }`, the film
per ion on each ion's own D0 (NO₃⁻ and NH₄⁺ carry case-local species records
with a Nernst–Einstein D0 from λ₀, Robinson & Stokes App. 6.1 — the standards
records have none), `suctionCorrection GeraldesAfonso2006; ionCoupling
electroneutral;`.  Γ_avg: Na⁺ 0.163, Cl⁻ 0.163, NO₃⁻ 0.064, NH₄⁺ 0.118;
ξ_avg 33.7 V/m beside the membrane's ψ 31.4 mV; R_obs Cl⁻ 68.9 % against
membrane12's intrinsic 77.5 %; recovery 15.7 %, ΔP 0.66 bar.  The
`ionCoupling none` twin: Na⁺ 0.187, Cl⁻ 0.135, NO₃⁻ 0.043, NH₄⁺ 0.143 — the
coupling moves the trace anion's Γ by 50 %.  The trace anion's Γ is positive
here (the README had said "possibly negative"; on this feed it is not).

## 6. The gate, and the sabotages as measured

`bin/curate/check_polarisation_coupling.py`, wired beside `check_sdem`:
(a) the props witness against an independent Python solve of Eqs. 25–28 from
the case's own data file, Γ per ion AND ξ to 1e-8 on all 10 rows; (b) the
single-salt identity, Eq. 20 with Eqs. 19, 23, 24, to 1e-10 through the op on
a two-ion table; (c) the film-theory reduction to 1e-11 (the JSON's 12
digits — 1e-12 failed on correct code at 4e-12, and the band is the
channel's); (d) four refusals; (e) the announcement on membrane12, its
silence on membrane14, and SDEM's two banners; (f) membrane14's wall
electroneutral to 1e-9 on every node from the PUBLISHED `c_b(1 + Γ)`, per-ion
`k_film_<ion>` columns, ξ published, and the `none` twin moving a trace ion's
Γ.

| # | sabotage (engine, by hand, rebuilt, restored) | result |
|---|---|---|
| S1 | Eq. 5 constant 0.26 → 0.30 | CAUGHT by (a), every row |
| S2 | migration sign flipped in the kernel | CAUGHT **structurally**: the bracket is derived from the un-flipped sign, the root left it, the witness REFUSED; no arm fired.  Predicted "Γ survives, ξ catches it" — that is S2b |
| S2b | the REPORTED ξ sign flipped | CAUGHT by (a) on ξ ONLY; every Γ agreed.  The sabotage that justifies pinning ξ beside Γ |
| S3 | bisection + polish disabled (midpoint) | CAUGHT by (a): Γ_dye 0.112 vs 0.504 |
| S4 | film theory's expm1 → exp(φ(1+1e-3)) − 1 | CAUGHT by (c) at 1.4e-3 |
| S5 | SDEM's wall ignoring the policy | CAUGHT by (f) three ways |
| S6 | unknown word → default | CAUGHT by (d) |
| S7 | default announcement removed | CAUGHT by (e) |
| S8 | `closeBy` sign in the op | CAUGHT **structurally**: the op refuses a non-positive derived bulk, exit 1; arm (a) did not fire |

Two structural catches are recorded as such: a gate that stops at "did not
run" has not shown its arm fires, and the docstring says so.

## 7. Not done, named

* ~~Module RECORDS and a SEPA-cell witness (Vítor's step 2).~~  DONE the
  same day: `docs/design/a-module-is-a-record.md` — `module <name>;` names
  a `kind membraneModule` record (NF270-4040, SW30HR-380, the SEPA CF cell),
  and `membrane17_sepa_cf_flat_cell` runs this coupled film on the
  laboratory cell.  What remains of the item: no MEASURED polarisation
  index is compared with anywhere: arm (a) proves the engine solves the
  paper's equations, not that the paper is right.
* The paper's own Fig. 7 comparison (extended Nernst–Planck in the dye's
  film, filled symbols) is not reproduced.
* Fouling under the coupled film; a film with a potential INSIDE it for
  non-dilute solutions (outside the model).
* DSPM-DE and the batch vessel under the coupled film are wired and not
  exercised by any case.
* The standards species records of NO₃⁻ and NH₄⁺ still carry no `D0`; the
  witness carries case-local copies with a cited one, not promoted (a
  curation act).  Na.dat's `D0` in the standards carries no citation of its
  own (found, not fixed).
* `--record-append` of `Gamma_<solute>_avg` on the 13 pre-existing membrane
  goldens (a new KPI on every membrane case, published and not pinned there);
  left to Vítor with the full sweep.
* The WASM bundle was not rebuilt (no emscripten here).

## 8. Traps paid for

* **A default announced where nothing reads it.**  The module's legacy
  `D_solute 1.6e-9 ASSUMED` advisory fired on membrane14, an all-ion feed on
  a correlation where no solute reads `D_solute`.  The announcement is now
  deferred until the polarisation object knows whether a neutral solute
  exists (the 2026-08-04 banner trap, one band down).
* **A sign flip the observable cannot see.**  ξ → −ξ leaves every C_m
  unchanged; Γ alone would have passed S2b.  Pin the quantity the sign lives
  in.
* **A tolerance tighter than the channel.**  Arm (c) at 1e-12 failed correct
  code: the result JSON prints 12 significant digits.  A band must be the
  channel's, and the docstring says which channel.
* **A trial is not an answer.**  The kernel does not throw on a wall it
  cannot satisfy; it returns `ok = false`, so a law's Newton can back away
  from a trial permeate (SDEM's inner Newton probes walls a converged answer
  never has).  The ACCEPTED answer is refused by name (`requireOk`).  The
  uncoupled kernel stays permissive (a negative trial wall is computed, as
  today's arithmetic computed it) so membrane12/13 keep their trajectories.
* **A record grammar that requires a number the source does not give.**  A
  component must carry `MW`; the dye's is unknown.  The record carries a
  NOMINAL placeholder flagged in the record and in the case, read by nothing
  — a visible gap, not a false source.
* **Two structural catches.**  S2 and S8 were caught by the case refusing to
  run, which proves the gate fails but not that the named arm fires.  Both
  are recorded as measured; S2b was added so the ξ arm has a sabotage that
  reaches it.
