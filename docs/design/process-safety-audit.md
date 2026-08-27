# Process safety in Choupo — an audit, before any implementation

Requested 2026-08-27 by Vítor Geraldes.  The brief was explicit: **audit
first, architecture second, one minimal executable slice third.**  Nothing in
this document is implemented.  It answers the ten questions asked, and it
opens with the one finding that changes the shape of the answer.

---

## 0. The finding that constrains everything else

**API 520, API 521, API 526, API 2000 and API 537 are copyrighted standards
sold by the American Petroleum Institute.  Their equations, coefficients,
correction factors and — critically — the API 526 standard orifice
designations (D, E, F … T) and their effective areas cannot be transcribed
into this repository.**

This is the same class of exclusion the project already applies to DIPPR,
Yaws, CRC, NIST SRD and REFPROP: a no-grant source, where there is nothing to
honour.  It is not a copyleft question and no amount of attribution fixes it.

The consequence is not that Choupo cannot teach relief.  It is that **Choupo
must never present itself as an API-compliant sizing tool**, and must say so
in the output of every safety calculation it ever performs.  What it can do:

* **the physics is public.**  Isentropic nozzle flow, the choked-flow
  criterion, an energy balance on a vessel absorbing an external heat load,
  the Clausius-Clapeyron vapour generation rate — these are textbook
  thermodynamics.  They appear in Crowl & Louvar, *Chemical Process Safety*
  (Prentice Hall), in Perry, and in the open literature, and Choupo already
  computes every property they need.
* **the STANDARD's numbers are not.**  A discharge coefficient K_d, a
  back-pressure correction K_b, the fire-case wetted-area correlation and its
  constants, the accumulation percentages as a *rule*, the orifice letter
  table — these are API's contribution and are what a company buys the
  standard for.

So the architectural answer is the one this project already uses twice:
**compute the physics from first principles, glass-box; refuse to supply the
standard's numbers; and where the user has their own licensed copy, let them
supply them.**  That is exactly `bin/curate/verify_against_poling.py` (reads
the curator's own book, writes to `data/local/`, deliberately not a gate) and
the VT-2005 COSMO separation (`licence externalRestricted; installed false;`,
refuses by name with the install command).

A Choupo relief calculation should therefore end with a sentence of this
shape, always:

> This is not an API 520 sizing.  The isentropic mass flux above is computed
> from this case's own thermodynamics; the discharge coefficient, the
> back-pressure and superimposed-back-pressure corrections, and the standard
> orifice selection are NOT reproduced here and must be applied from your own
> copy of the standard.  The area reported is the *required* area under the
> stated assumptions, not a device selection.

---

## 1. What Choupo already has

**More than expected, and none of it is a relief calculation.**

*Documentation.*  `docs/designGuide.tex` §"Pressure relief, flare & safety
basics" already exists and is substantial: it names API 520/521/526/537 and
NFPA 30 as governing, states when a device is mandatory ("the trigger is the
credible-cause inventory, not size"), explains set vs design pressure with the
`design P = max(1.1 × operating, operating + 1.7 bar)` heuristic, gives the
accumulation allowances (+10 % single non-fire, +16 % multiple, +21 % fire)
*with the reason* — momentary overshoot is tolerable, permanent yield is not —
and carries a scenario table attributed to API 521.  The Design Guide's own
preamble already names pressure relief first in its list of safety-critical
decisions that "can cost lives or breach the law if wrong".  HAZOP and LOPA
are mentioned.

That prose is the seed of the chapter.  It is a *Pareto orientation, not a
safety course*, in its own words, and it says so.

*Engine.*  Nothing.  A grep for relief / safety valve / PSV / rupture disk /
blowdown / flare / API 52x across `src/` returns only false positives (`PSA`
the adsorber, `SQP` the optimiser).  There is no relief device, no scenario,
no relief load, no orifice sizing, no depressurisation, no flare.

*Foundations a relief calculation would stand on, all present:*

| need | what exists |
|---|---|
| mixture Cp, hence k = Cp/(Cp − R) for the ideal-gas critical ratio | `ThermoPackage::Cp_ig(T, y)` |
| Psat, K-values, flash, two-phase state | the whole thermo stack |
| latent heat at T | `Component::Hvap_latent` (Watson) |
| vessel volume from throughput and a design basis | `VesselSize` |
| wall thickness, ASME §VIII Div. 1 thin-wall hoop | `StirredTank` (already implemented) |
| pipe pressure drop, four friction correlations as objects | `hydraulics/`, `FrictionFactorCorrelation` (2026-08-25) |
| an isenthalpic throttle | `valve/Valve` — **not** a relief device |
| announce / refuse / caveat-block / ProblemDivergence | the honesty surface |
| costing, utilities | `postProcessing/` |

*Theory Guide.*  Eight occurrences of "safety", none of them about process
safety — they are numerical safety factors and `maxIter` safety nets.  **The
Theory Guide has no process-safety content at all.**

---

## 2. What a minimal process-safety capability requires

For ONE scenario end to end, with nothing invented:

1. a **vessel with a declared inventory** and a declared design pressure
   (MAWP) — the case states it; the engine must not guess a MAWP;
2. a **scenario** that states the physical event and its cause;
3. an **energy or material input rate** the scenario implies (a fire heat
   flux, a blocked-outlet feed rate, a failed control valve's C_v);
4. the **relieving state** — pressure at set + accumulation, and the
   temperature and phase there, which is a flash;
5. the **relief load** — mass rate that must leave to hold that state, from
   an energy balance, not a correlation;
6. the **required flow area** from isentropic nozzle flow at the relieving
   state, choked or not, decided by the pressure ratio and k;
7. a **report** carrying every assumption, the limiting case, and the refusal
   of §0.

Steps 1–6 are all computable from what Choupo already has.  Step 7 is where
the project's existing machinery does the work.

---

## 3. What Aspen demonstrates is industry-relevant

Its public capability surface connects: process model → overpressure scenario
→ relief load → device sizing → inlet/outlet piping → blowdown → flare network
→ dynamic emergency analysis, over scenarios including fire, blocked outlet,
control-valve failure and exchanger tube rupture.

**Read as a capability map, not an architecture.**  What it establishes is
that the chain is real engineering work and that the scenarios above are the
ones practitioners actually run.  What it does not establish is that a
teaching simulator should have a Safety subsystem; Aspen's shape follows from
being a commercial suite that must cover a customer's whole workflow.

The honest use of the comparison in the guide is one sentence about what the
industry does, with no product named — the doctrine bans naming a commercial
competitor in the user-facing manuals (`check_doctrine` enforces it).

---

## 4. What belongs in the Theory Guide even if Choupo cannot calculate it

**Most of it, and this is the important half of the answer.**  The chapter's
value does not depend on the engine.

* **Why component PASS ≠ system SAFE** — Leveson's thesis, and it needs no
  valve to demonstrate.
* The **system boundary**: equipment, control, relief, procedures, operators,
  maintenance, operating limits, organisational decisions.
* **Layers of protection** and why a relief device is the last one that works
  with zero operator action and zero instrument power (the Design Guide
  already says this).
* **Scenario thinking**: the worst *credible single* cause, and why "credible"
  and "single" are both load-bearing words.
* Set vs design pressure, accumulation, and the reason for each.
* What a relief device does NOT protect against.
* **Runaway reaction, and why a steady-state simulator cannot see one.**
* HAZOP / LOPA as method, not as paperwork.
* Uncertainty and provenance in safety numbers.

### The opening example should be Choupo's own, not a valve

This is the strongest thing in the brief and it can be made concrete from
this repository, today, with no relief calculation in sight.

On 2026-08-27, a student-authored styrene flowsheet in this very session
reported:

```
Recycle converged in 3 Newton iteration(s)  (|r|2 = 1.128e-07).
```

wrote `converged/`, and **exited 0**.  Every unit solved.  Every unit's own
contract was satisfied.  And the same run had already printed a proof, from a
Rachford-Rice residual, that the reactor's inlet could not be the liquid its
state file called it — with that reactor's energy balance closing at **167 %**.

Component PASS + component PASS + component PASS, system wrong.

It is not an isolated case: seven shipped tutorials carry the same
proven-impossible label, five with a real energy residual beside it, up to
899 kW (`check_impossible_phase_pins`, pinned 2026-08-27).

**That is Leveson's argument, demonstrated inside the tool the student is
using, before any discussion of valves.**  A chapter that opens there earns
the PSV rather than announcing it.

---

## 5. What should be refused rather than faked

* **API-compliant sizing.**  See §0.  Choupo computes a required area; it does
  not select a device and must say so on every run.
* **A MAWP the case did not declare.**  Guessing a design pressure is
  guessing how much the vessel can take.
* **A fire-case heat input from the API correlation.**  The correlation and
  its constants are the standard's.  Choupo can take a declared heat flux, or
  a declared wetted area and flux, and compute from there.
* **Two-phase relief by an unstated method.**  Two-phase relief sizing (the
  DIERS work) is a research literature of its own; an omega-method
  implementation without its own witness would be a plausible number.
* **Any scenario the case did not declare.**  The engine must never decide
  which scenario is controlling; it computes the ones it is given and reports
  which was largest.
* **Relief for a runaway reaction.**  A steady-state solver cannot see the
  thermal runaway that sets the load.  `choupoBatch` might, one day, with a
  real kinetic model — until then this refuses by name.
* **A flare network.**  Not without back-pressure interaction, which is a
  hydraulic network solve.

---

## 6. The smallest coherent first implementation

**One scenario, one device, one vessel, one report.**  Concretely:

`reliefLoad` — a **PostProcessor**, not a unit operation.

That choice matters and is the architectural answer to §8.  A relief device
does not sit in the material path of a converged flowsheet: it passes nothing
in normal operation.  It is a *statement about* a unit, computed after the
solve from that unit's state — which is exactly what `SizingPass` and
`CostingPass` already are, and they already run over designed equipment.  A
relief calculation is sizing under an abnormal state.

Declared in `system/postDict`:

```
reliefLoad
{
    unit            knockout;
    designPressure  10 bar;          // MAWP -- the case declares it
    scenario
    {
        kind          externalHeatInput;
        Q             450 kW;        // the author's, from their own basis
        reason        "pool fire, wetted area and flux from the user's own
                       API 521 calculation -- not computed here";
    }
    accumulation    0.21;            // author's, with the standard's reason
}
```

and it reports: the relieving pressure and the flash state there, the vapour
generation rate from an energy balance on the inventory, whether flow is
choked at the stated back pressure, the isentropic mass flux, the required
area, and §0's refusal.

**No new abstraction.**  No SafetyManager, no ReliefFramework, no scenario
engine.  One `PostProcessor` subclass, registered like `SizingPass`.  If a
second scenario kind needs one, build it then.

---

## 7. Witness cases

**`relief01_fire_case_knockout`** — the minimal one.  A knock-out drum with a
declared inventory and MAWP, a declared external heat input, vapour relief of
a pure-ish hydrocarbon, choked flow.  Every number traceable: the latent heat
from the record's Watson correlation, k from `Cp_ig`, the relieving state from
a flash.  It proves the chain scenario → physics → equations → properties →
load → area.

**`relief02_two_scenarios`** — the same vessel under external heat input AND a
blocked outlet, showing that the controlling case is a *comparison the
engineer makes* and that the engine reports both rather than picking.  This is
where the pedagogy lives: the second scenario exists to show that "the worst
credible single cause" is a judgement.

Both are **structural witnesses** — no number validated against a measured or
published relief case, and they must say so, on the `edwards01` precedent.

---

## 8. Architectural changes truly necessary

**None.**  That is the answer and it should be defended rather than
apologised for.

`reliefLoad` is a `PostProcessor`; the base class, the factory, the
registration and the postDict chain all exist.  The thermodynamics is
`ThermoPackage` unchanged.  The refusal, the announcement, the caveat block
and the ProblemDivergence surface all exist and are what a safety calculation
most needs.

The one thing that may need adding later, and only when a case demands it, is
a place for **equipment design limits** (MAWP, design temperature) as
first-class data rather than a postDict field — because a MAWP belongs to the
vessel, not to the calculation asking about it.  `design/` is the ratified
home for equipment realisation and would take it.  Not now.

---

## 9. Standards and references needed

*Cannot be reproduced, must be named:* API STD 520 Pt I & II, API STD 521,
API STD 526, API STD 537, API STD 2000, NFPA 30, ASME BPVC §VIII.

*Usable, and the actual basis for the implementable physics:*

* Crowl, D. A. & Louvar, J. F., *Chemical Process Safety: Fundamentals with
  Applications* — the standard teaching text; relief sizing from first
  principles.
* Leveson, N. G., *Engineering a Safer World* (MIT Press, 2011) — open access
  from MIT Press; the system-safety argument that opens the chapter.
* Reason, J., *Human Error* (CUP, 1990) and *Managing the Risks of
  Organizational Accidents* (1997).
* Kletz, T., *What Went Wrong?* and *An Engineer's View of Human Error*.
* The CSB (US Chemical Safety Board) investigation reports — public domain,
  and the best available teaching material on system accidents.
* Perry's, §Process Safety.

**None of these has been read back for this audit.**  They are named as what
would be needed, not as sources already consulted — the
`transcribedNotCheckedAgainstArticle` distinction.

---

## 10. Staged roadmap (Gall's Law)

**S0 — the chapter, with no engine work at all.**  The system-safety argument,
opened on Choupo's own converged-but-wrong run.  This is the largest value and
carries zero implementation risk.  It can ship alone.

**S1 — `reliefLoad` with ONE scenario kind (`externalHeatInput`) and vapour
relief only.**  `relief01`.  Refuses everything else by name.

**S2 — a second scenario kind (`blockedOutlet`) and the comparison report.**
`relief02`.  Still vapour only.

**S3 — liquid relief and the sub-critical branch.**  A different mass-flux
equation, same structure.

**S4 — inlet/outlet piping pressure drop**, reusing
`FrictionFactorCorrelation`.  This is where the 3 % inlet-loss rule lives —
the *rule* is API's, the pressure drop is ours.

**Beyond S4** — two-phase relief, rupture disks, blowdown, flare networks,
dynamic emergency analysis.  Each needs its own justification and its own
witness.  **None is scheduled**, and saying so is part of the plan: a roadmap
that lists everything Aspen does is feature parity wearing a schedule.

---

## The dedication

Vítor asked for this, unembellished, in the chapter opening:

> In memory of my friend Jorge Neto, who lost his life in a workplace accident
> at Portucel, Setúbal.

It is his to place, in his own words, in a guide whose authorship is his.  It
is recorded here so the next reader knows it is part of the chapter's design
and not an afterthought — and so that nobody, human or otherwise, "improves"
it.

The lesson it carries is the one the chapter exists for: **a simulator that
teaches the equations but teaches the wrong system boundary produces engineers
who are numerically competent and dangerously incomplete.**
