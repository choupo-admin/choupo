# PC-SAFT association term — proposal (roadmap #4)

**Status: PROPOSAL — awaiting Vítor's alignment.  No code is authorised by
this document.**  (The no-skip-alignment rule of CLAUDE.md §10 applies:
this is the propose-first half; building starts only on explicit
approval.)

Date: 2026-08-02.  Author: dev session, for Vítor's review.

---

## 1. Where we stand

The **non-associating PC-SAFT core is shipped and validated**
(`src/thermo/equationOfState/PCSAFT.{H,cpp}`): hard-sphere + hard-chain +
dispersion, exactly Gross & Sadowski, *Ind. Eng. Chem. Res.* 40 (2001)
1244, with pure-component parameters `pcsaft { m; sigma; epsilonK; }` in
the component `.dat` (n-hexane, methane, propane, … from the paper's own
Table 1).  Witnesses: `pcsaft01_pure_nhexane`,
`pcsaft02_states_crosscheck`, `flash10_ch4propane_pcsaft`; accuracy of
the core ~1 %.  The header already stages what is deliberately OUT:
**association, polar, ion terms**.  This proposal is the association
half, and only that.

**Why association is the next model growth** — the theory guide's own
SRK "power and limit" says it: cubics (and the PC-SAFT core alike) are
poor exactly for the hydrogen-bonded fluids — water, alcohols, acids —
where much of the physics *is* the directional bond.  Today those
systems ride on activity models (NRTL/UNIQUAC fits) or Antoine; an
associating PC-SAFT gives them a *predictive-leaning*, single-surface
EoS route — the same differentiation argument (membranes brines,
mixed-solvent) that motivated the electrolyte work.

## 2. The physics: Wertheim TPT1, as published

The association contribution to the residual Helmholtz energy
(Chapman et al. 1990; the working form in Gross & Sadowski 2002,
*Ind. Eng. Chem. Res.* 41 (2002) 5510):

```
a_assoc / RT = Σ_i x_i [ Σ_{A ∈ sites(i)} ( ln X_i^A − X_i^A / 2 ) + M_i / 2 ]
```

where `X_i^A` is the fraction of molecules *i* NOT bonded at site A and
`M_i` the number of sites on *i*.  The site fractions solve the
mass-action closure

```
X_i^A = 1 / ( 1 + ρ Σ_j x_j Σ_{B ∈ sites(j)} X_j^B Δ^{A_i B_j} )
```

with the association strength

```
Δ^{A_i B_j} = d_ij³ g_ij^hs(d⁺) κ^{A_i B_j} [ exp( ε^{A_i B_j} / kT ) − 1 ]
```

Every ingredient except the two new constants is ALREADY in the core:
`d_ij` from the temperature-dependent segment diameter, `g_ij^hs` from
the hard-sphere RDF the chain term uses.  The two new *per-component*
constants are the **association energy** `ε^AB/k` [K] and the
**association volume** `κ^AB` [-] — exactly the two numbers Gross &
Sadowski 2002 tabulate per associating fluid.

**Site schemes** (Huang & Radosz vocabulary, the field standard):

* `2B` — one donor + one acceptor (alcohols; the scheme the PCSAFT.H
  staging note already names).
* `4C` — two donors + two acceptors (water).
* Cross-association in mixtures: the standard Wolbach–Sandler combining
  rules (ε cross = arithmetic mean; κ cross = geometric mean with the
  σ³ correction) — published, no new fitted binary constant by default.

## 3. Data model (glass-box, arity-1)

Extend the existing `pcsaft {}` block — no new block, no new file kind:

```
pcsaft
{
    m           1.0656;
    sigma       3.0007;
    epsilonK    366.51;
    // -- association (this proposal) --
    assocScheme 2B;          // 2B | 4C  (absent = non-associating, exactly today)
    epsAB_K     2500.7;      // K
    kappaAB     0.034868;
    source      "Gross & Sadowski, Ind. Eng. Chem. Res. 41 (2002) 5510, Table 1";
}
```

(The numbers above are the paper's 2B ethanol set, cited for shape.)
`assocScheme` ABSENT keeps the component non-associating — every
existing record and golden is untouched by construction.  A record
carrying `epsAB_K`/`kappaAB` without `assocScheme` (or vice versa)
REFUSES loudly at load.  Water's 4C set enters `water.dat` the same
way, primary-cited.

## 4. Grammar impact: none

The case still declares `equationOfState { model PCSAFT; }`.  Whether
the association term is active is decided by the FACTS on the component
records (the resolver posture: classification from canonical record
facts, never from case lists).  At package assembly the engine
ANNOUNCES the association roster — `[pcsaft] associating: water (4C),
ethanol (2B); cross: Wolbach-Sandler` — so the student sees which
molecules bond, and a mixture of associating + inert species costs the
inert ones nothing.

## 5. Numerics

`X_i^A` is an inner fixed-point at every (T, ρ, x) evaluation.  Plan:
successive substitution with the standard Michelsen (2006) damping
(guaranteed monotone on this closure), tolerance 1e-12, typically 4–8
iterations; for the pure 2B/4C symmetric cases the closure collapses to
a quadratic solved in closed form — the fast path AND the oracle the
iterative path is tested against.  The density solver and fugacity
derivative reuse the existing numeric-derivative choice of the core
(the analytic Appendix-A route stays the staged follow-up it already
is).

## 6. Validation plan (the gate for "done")

1. **Pure water (4C) and ethanol (2B)**: Psat(T) and liquid density
   against Gross & Sadowski 2002's own reported deviations (<2 % /
   <1 % class) over their fitted ranges — golden-locked as a props
   tutorial (`pcsaft03_association_pure`).
2. **Closed-form vs iterative X^A** cross-check at 1e-10 (the internal
   oracle).
3. **Non-associating regression**: every existing PC-SAFT golden
   byte-identical (the term vanishes with no sites — provable, then
   proven by the suite).
4. **One mixture witness**: ethanol/water VLE vs measured data, stating
   up front what is predictive (cross-association rules) and what is
   fitted (pure parameters only) — the external-reference-battery
   pattern: one coherent primary source end to end.

## 7. Deliberately OUT (same staging discipline as the core)

Polar terms (PCP-SAFT), induced association, ion terms (that lane is
the electrolyte architecture's), association-parameter fitting tools
(records enter by curation with primary citations), and any migration
of existing cases onto PC-SAFT.

## 8. Cost estimate

One file pair touched (`PCSAFT.{H,cpp}`, est. +250–350 lines including
the closed-form oracle), 2–3 component records extended, one new props
tutorial + one mixture case, one theory-guide section (a feature is
incomplete without its manual — roadmap #5's own rule), gates via the
suite goldens.  No build-system, no new deps, no new interfaces —
a plain extension of an existing `EquationOfState` subclass.

---

**Decision requested from Vítor:** approve scheme scope (2B+4C only?),
the `pcsaft {}` field names above, and the validation battery — or amend.
