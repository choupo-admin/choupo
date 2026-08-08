# The solid-equilibrium spike — C2's proposition, demonstrated (with one honest limit)

> **KIND: SPIKE (the finding is the record).**  Commissioned by Vítor
> 2026-08-08: *"prove that ONE solid-equilibrium architecture can represent
> the three required classes; build only enough machinery to demonstrate or
> falsify that proposition; stop at the architectural evidence and return for
> review before migration."*  Ruling: `queue-ruling-2026-08-08.md` §C2.
>
> **Status: RETURNED FOR REVIEW.  Migration stays unauthorised.**  Gate:
> `check_solid_equilibrium_spike` (live evidence, sabotage-verified;
> the purity arm is falsification clause (a) made executable).

---

## 1. The proposition, and what would have falsified it

One architecture: a solid — any solid — is a candidate whose presence is
decided by the complementarity every solubility problem shares,

    either  n = 0  and  ln(IAP/K) ≤ 0        (absent)
    or      n > 0  and  ln(IAP/K) = 0        (present, at equilibrium),

with the solid's own thermodynamic MODEL behind the `lnSI` closure and all
material leaving the solution through ONE `remove` closure — the one ledger.

Falsified if: **(a)** any class needs a name- or kind-keyed branch inside the
common solver; **(b)** any solid must be forced into another's thermodynamic
form; **(c)** a multi-solid state cannot close atoms in one ledger; **(d)**
reproducing the reactive path requires modifying `SpeciationSolver`.

**None fired.**  The machinery built: one ~60-line header
(`src/thermo/solidEquilibrium/SolidEquilibrium.H` — candidate struct + damped
sequential complementarity) and one probe.  Nothing else was touched.

## 2. The evidence, class by class

| demo | class · solid model behind the closure | result |
|---|---|---|
| D1 | **molecular crystal** (ice) · fusion, via an actual `SolidPhase` | freeze-concentration at fixed T converges; the brine molality inverts back through the fpd01 freezing curve to **7·10⁻⁹ K**; above the curve the candidate stays exactly absent |
| D2 | **ordinary salt** (NaCl(s)) · dissolution Ksp anchored on the cited Pinho & Macedo m_sat | supersaturated brine relaxes to **m = 6.144 exactly**; mole ledger −2·10⁻¹⁵; subsaturated forms nothing |
| D3 | **reactive mineral** (calcite) · ln(IAP/K) over the **speciated** solution | reproduces `SpeciationSolver`'s own `equilibrate` — called through its public surface, **not modified** — to **3·10⁻¹⁰ rel in n**, 4·10⁻¹⁰ in SI, identical pH (6.82999) |
| D4 | **two candidates, one solve** | ice active at lnSI = 7·10⁻¹¹, salt registered-but-absent (lnSI = −2.29), water ledger 1.3·10⁻¹⁶, salt ledger 0 — the coupling is real (ice concentrates the brine 2.0 → 2.86 mol/kg) and nothing double-counts |
| D5 | **negative control** — the banned shape by hand | the same solid solved by two mutually-blind mechanisms: each "converges", the recombined state satisfies neither equilibrium (residual −0.105), and the one-ledger closure is violated by **−30 %** — the bug the ruling bans, measured, and visible to the same metric D2/D4 close at 10⁻¹⁵ |

Three different thermodynamic models — fusion, dissolution-K, speciated
IAP — behind one closure signature; the solver's code names no solid (the
gate greps it, comments stripped, every run).

## 3. The one honest limit — D4b, the eutectic attempt

At 252.15 K / 6 mol/kg, **both candidates stay subsaturated**: the both-active
(ice + salt simultaneously) state is **undemonstrated with current data**.
The cause is data, not architecture, and the spike says which data: the SP77
temperature extension is an announced extrapolation below 0 °C, and the salt's
Ksp(T) here is a first-order van 't Hoff on the record's cited dissolution
enthalpy (+3 880 J/mol) — under those surfaces the model's implied eutectic
is not where the physical one is.  **The named gap: a curated sub-zero
Ksp(T) for NaCl.**  The mechanism that would serve the both-active state is
the same loop that served D4; the gate's D4b arm fails-forward if richer data
ever activates both, so the record cannot silently understate improved
evidence.

## 4. What was deliberately NOT built

No flash integration; no unit operation; no case grammar; no change to
`SpeciationSolver`, `SolidPhase`, or any corpus case; no golden moved.  The
solver is spike-grade (damped sequential; fine for 1–2 coupled solids) — the
production form is a review question, below.

## 5. Questions the review should answer before migration

1. **The production solver.**  Simultaneous Newton over the active set, or
   keep sequential with better damping?  Where do appearance/disappearance
   announcements live (the flash's `[plan]`-style header?)?
2. **Who owns the candidates.**  The natural reading: `chemistryDict`'s
   `solidPhases ( … )` declares mineral candidates (as today), a `phases {}`
   solid declares a crystal candidate (C3 grammar), and BOTH feed the one
   complementarity — the speciation's internal mineral transfer then becomes
   a *client* of this interface rather than a second mechanism.  That is the
   migration this spike is evidence for, and it is not authorised here.
3. **Ksp(T)** — the D4b data gap: curation-ledger item, or part of the
   migration's scope?
4. **Where the interface lives** — `thermo/solidEquilibrium/` is layering-
   clean today (same band, no upward edge); confirm or relocate.

## 6. Related

`queue-ruling-2026-08-08.md` §C2 (the ruling and its amendment) ·
`dwsim-solids-study.md` (the peer evidence that suggested unification) ·
`solid-formation-routes.md` (the two-route problem this dissolves) ·
`ice-as-a-solid-phase-of-the-solvent.md` · `check_solid_equilibrium_spike.py`
(the live evidence) · `check_ice_freezing.py` (the crystal's own gate).
