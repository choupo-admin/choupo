# Proposal — a second liquid phase on the reactive path

**Status: PROPOSAL, with §10 implemented.** The blocker this document named
in §7 turned out not to exist; §10 records what was found and what shipped
because of it. Everything else here is still a proposal.

**Was: PROPOSAL. Nothing here is implemented.** For alignment before any
code, per the house rule.

**Driven by:** `docs/design/flashComplex/` — the design driver's remaining
blocker, now that general salt reconstruction has shipped.

---

## 1. The gap is not the one the earlier text claimed

The `flashComplex` notes say there is "no slot in the grammar for a second
liquid phase". Reading the code, that is **wrong**, and the correction matters
because it changes what has to be built.

A second liquid phase already exists, and works. `IsothermalFlash` carries a
`PhaseSet` — `VL`, `LL`, `VLLE` — declared per unit
(`IsothermalFlash.cpp:1051`), and the VLLE path resolves vapour + two liquids
by direct Gibbs minimisation over the 2n-dimensional split. It has a passing
tutorial (`vlle03_audit_artificial`) and the multi-start seeding that keeps it
off the K = 1 saddle.

The real gap is a **fork**. `IsothermalFlash::solve` returns early for a
reactive package (line 89):

```cpp
if (thermo.hasReactiveEquilibrium())
{
    const auto r = thermo.equilibrate(in.T, in.P, in.F, in.z, opts.verbosity);
    ...
    return sol;                       // phaseSet is never consulted
}
```

Everything after that line — the whole `phaseSet` machinery — is the
**molecular** γ-φ path. So the engine today offers:

| | chemistry | liquids |
|---|---|---|
| reactive path (`ReactiveVLE`) | speciation, electroneutrality, solids | **one** |
| molecular path (`phaseSet`) | none | **up to two** |

The two capabilities are **mutually exclusive by construction**, and
`flashComplex` needs both at once: a speciated aqueous liquid *and* a
benzene-rich organic one. Stating it as "a missing slot" hid that half the
work is already done and pointed at the wrong file.

## 2. What actually couples the two liquids

A component present in both must have equal chemical potential in both. The
question is whether the two sides can even express that on a common reference,
and the answer is **yes, and it was built for another reason**.

Mixed-solvent electrolyte v1 (ratified 2026-07-26) gave the aqueous phase a
**molecular backbone**: the declared solvent plus the nonionising
co-volatiles, on an **ion-free mole-fraction basis**, priced by the full
curated NRTL pair model (`ReactiveVLE.H:137`). That is the Lewis-Randall,
pure-liquid reference — **the same reference an organic liquid uses**.

So ethanol's equality across the two liquids is expressible directly:

```
gamma_aq(x_backbone) * x_aq  =  gamma_org(x_org) * x_org
```

both sides NRTL, both on the same standard state, no transfer term, no
convention to invent. **The backbone is the bridge, and it already exists.**

This is the whole reason the slice is tractable. Without mixed-solvent v1 the
aqueous side would price ethanol on a molality/infinite-dilution reference and
the organic side on pure liquid, and crossing them would need exactly the
standard-state transfer term that is still a named gap
(`docs/design/standard-state-transfer-adr.md`).

**What cannot cross: ions.** The organic phase admits none. That is a
declaration, and §4.3 makes it an enforced one.

## 3. The proposal

**Give the reactive path a second liquid that lives entirely on the molecular
backbone, coupled to the aqueous phase by backbone-species equality.**

### 3.1 The unknowns

`ReactiveVLE`'s outer Newton solves for `ln V` plus the vapour split odds over
the volatiles. It gains:

* `ln L_org` — the organic phase amount;
* the organic composition over its declared members.

The inner speciation is untouched: it still receives aqueous family totals and
returns a speciated aqueous state. What changes is that the aqueous totals are
now feed **minus vapour minus organic**, instead of feed minus vapour.

### 3.2 The residuals

Per backbone species present in both liquids, one equality of activity. Per
volatile, the existing gas-liquid residual, now written against whichever
liquid it belongs to (the vapour sees both). Electroneutrality stays where it
is — inside the aqueous speciation, closed by H⁺ — because the organic phase
carries no charge to balance.

### 3.3 Declaration

The organic phase is declared where phases are declared, in the case's
`constant/thermoPhysPropDict`, beside `aqueous` and `vapour`:

```
equilibrium
{
    formulation electrolyteGammaPhi;

    aqueous  { solvent water; activityModel { ionic davies; molecular NRTL; } ... }

    organic
    {
        solvent  benzene;
        members  ( benzene  ethanol );
        activityModel NRTL;
    }

    vapour    { fugacityModel idealGas; }
    volatiles ( ... );
}
```

`members` is an explicit list, not an inference. The reason is §4.3.

## 4. Three things this must not get wrong

### 4.1 The approximation must be declared by its LARGE part

The first `flashComplex` draft announced that the organic phase excluded
~0.2 mol% of water. That is the *small* exclusion. The large one is that
**water–benzene immiscibility — the thing that causes the split — is declared
rather than computed**, leaving ethanol's partition to two independent
binaries (ethanol–water, ethanol–benzene) with no ternary term. A tie-line
from that is an arithmetic coincidence between two pairs, not a tie-line of
the ternary. And ethanol is a co-solvent: above ~40 mol% it closes the
miscibility gap altogether.

The `members` list is therefore an **approximation with a stated reason**, and
the run must announce it every time, not once in a comment.

### 4.2 A declared phase is not a phase that exists

Declaring `organic` says the phase *may* exist. Whether it does is the answer.
The molecular path already knows this — `PhaseSet::VLLE` tests phase stability
and drops to two phases when the third is not a Gibbs minimum. The reactive
path must do the same: if the organic amount goes to zero, report a
two-phase answer and say so, never carry an empty phase with a meaningless
composition.

### 4.3 An ion in the organic phase must refuse, not be silently dropped

`members ( benzene ethanol )` is checkable against the classifier: every
member must be `aqueousSpeciation none`. Listing an ionising component is a
**refusal**, naming it. Without that, a case that listed `NH3` would get an
organic phase silently missing the ammonia the author thought was in it.

The mirror also refuses: a component that is *not* listed and *not* aqueous
has nowhere to go, and that must be named too rather than vanishing.

## 5. The vertical spike

Doctrine: end-to-end through every layer before any mass migration.

**System:** water + ethanol + benzene + **one** reactive solute, at a
condition where two liquids exist. Acetic acid is the natural solute — it is
already the reactive path's best-exercised species (flash10–13), and the
aqueous chemistry is a single dissociation.

Deliberately chosen:

* it is the **smallest** system with both a speciated aqueous phase and a
  second liquid — nothing decorative;
* ethanol partitions between the two liquids, so the backbone equality is
  genuinely exercised rather than trivially satisfied;
* the required NRTL pairs are a **short, nameable list**, and the curation
  debt is visible up front (§7).

### 5.1 Acceptance

1. **Backwards compatibility byte-exact.** Every reactive case (flash09–15)
   and every molecular VLLE case must be unmoved. A case that declares no
   `organic` block must take a code path indistinguishable from today's.
2. **The spike closes on elements and charge**, as every case must.
3. **Independent cross-check.** The ethanol partition, computed by the new
   coupled path, must agree with the existing molecular `PhaseSet::VLLE` path
   run on the same system with the chemistry switched off. Two routes, one
   answer — the same discipline that validated the salt-basis slice, and the
   only evidence worth having.
4. **The refusals of §4.3 have a gate that RUNS them.** Not an
   `.expect-nonconvergence` marker, which makes `runTests` skip the case; a
   gate that executes the refusal and asserts its message. This is settled
   practice now (`check_basis_rank.py`).
5. **The organic-phase-vanishes case is exercised**, so §4.2 is not theory.
6. `bin/runTests` green.

## 6. What this does NOT do

- **No standard-state transfer term.** The coupling rides the backbone's
  shared pure-liquid reference. A solute whose two sides do *not* share a
  reference is still the named gap it was.
- **No ions in the organic phase.** Refused, per §4.3. Ion partitioning into a
  low-permittivity solvent is a different physics with its own parameters.
- **No third liquid.** Two is what the physics of this case needs.
- **No LLE from stability analysis.** The organic phase is declared, not
  discovered. Discovering it is what `PhaseSet::VLLE` does on the molecular
  path; unifying the two is a later question, and worth asking then.
- **`flashComplex` still will not run afterwards** — it also needs the
  NH₄HCO₃ datum (§7) and the four NRTL pairs. This slice removes its
  *structural* blocker, not its data debt.

## 7. The curation debt this exposes, named now

The spike needs `ethanol-benzene`. `flashComplex` needs that plus
`aceticAcid-water` and `benzene-water`. The curated catalogue holds
`ethanol-water` and `benzene-toluene` and nothing else.

That is a curation act, not a coding one, and it is **on the critical path**:
without the pairs the spike cannot run at all. It should start before the code
does, not after.

## 8. Cost

| piece | size | risk |
|---|---|---|
| organic block: parse, classify, refuse (§4.3) | ~80 lines | low |
| outer Newton: extra unknowns + backbone equality residuals | ~150 lines | **high** — it is the solver's core |
| phase-vanishes handling (§4.2) | ~40 lines | medium |
| spike case + goldens + cross-check + refusal gate | 2 cases, 1 gate | low |
| `ethanol-benzene` NRTL pair | curation | blocks everything |

The outer Newton is the risk and should be said plainly: it is a working,
converging solver that every reactive tutorial depends on, and this adds
unknowns to it. The mitigation is criterion 1 — a case with no `organic` block
must not merely *give the same answer*, it must take a path that cannot
diverge from today's.

## 9. The ask

1. **Is the reframing accepted** — that this is unforking two existing
   capabilities rather than building a missing slot, and that mixed-solvent
   v1's backbone is what makes the coupling expressible?
2. **Is the spike right** — water/ethanol/benzene/acetic acid, or would you
   rather it carried CO₂ so it composes with the calcite work?
3. **Does the `ethanol-benzene` curation start now**, in parallel, given it
   blocks the spike?


---

## 10. The blocker in §7 does not exist (2026-07-27)

§7 named the `ethanol-benzene` NRTL pair as being on the critical path:
without it the spike could not run at all, so the curation should start before
the code. **That was wrong, and testing rather than assuming is what showed
it.**

**UNIFAC is a registered activity model** (`ActivityModel.cpp:99`), and both
benzene and ethanol already carry their group decomposition:

```
benzene   groups { unifac ( { group ACH; count 6; } ); }
ethanol   groups { unifac ( { group CH3; count 1; } { group CH2; count 1; }
                            { group OH;  count 1; } ); }
```

A direct check gives γ(benzene) = 1.696, γ(ethanol) = 1.457 at x = 0.5,
313.15 K — the right magnitude for a strongly positive-deviation pair with a
minimum-boiling azeotrope. **No pair record is needed**: UNIFAC is predictive
from the groups.

### 10.1 But the two liquids must share the model

This is the constraint the proposal did not state, and it matters more than
the pair.

The coupling of §2 is `gamma_aq * x_aq = gamma_org * x_org`. Equality of
chemical potential means equality of *activity*, so the same physical state
must give the same γ on both sides. **Pricing one liquid with NRTL and the
other with UNIFAC would make the equality meaningless** — not an approximation
with an error bar, but a residual that measures the disagreement between two
models rather than the distance from equilibrium.

So the organic phase can only be UNIFAC if the **aqueous backbone** can be
too. It could not: `ThermoPackageBuilder` refused any molecular backbone that
was not NRTL.

### 10.2 What shipped

The refusal gave its own reason as *"the curated pair records live in
parameters/NRTL/"* — a **data-availability** argument, which simply does not
apply to a method that needs no pairs. The backbone now serves NRTL **or**
UNIFAC, and refuses anything else by name.

The UNIFAC backbone resolves each component's decomposition through
`injectUnifacGroups`, the same helper the molecular γ-φ path uses — one
injection contract, not two, so a case-local component overlay is respected
identically on both paths. A backbone component with no `groups { unifac }`
block refuses by name, with both remedies stated.

And it announces itself as what it is:

```
[resolver] liquid molecular backbone: UNIFAC (water ethanol) -- PREDICTIVE
           group contribution, an ESTIMATE: no pair was regressed for this
           system
```

A student must never mistake a group-contribution γ for a regressed one.

### 10.3 What it costs, measured

`flash13` run on both backbones, everything else identical:

| molecular backbone | V/F | pH |
|---|---|---|
| NRTL (regressed pair) | 0.580449 | 5.0259 |
| UNIFAC (predictive) | 0.595242 | 5.0425 |

2.5 % in V/F. That is a *result*, not a defect — it is what the estimate costs
against a regressed pair on the same system, and it is the kind of number a
student should be able to produce by changing one word.

### 10.4 Consequences for the rest of the slice

* **§7 is withdrawn.** No curation blocks the spike. `ethanol-benzene` NRTL
  remains desirable — a regressed pair beats an estimate — but it is no longer
  on the critical path, and it is now a comparison the case can *make* rather
  than a prerequisite.
* **§3.3's declaration gains a constraint:** the organic phase's
  `activityModel` must match the aqueous backbone's `molecular` model. A
  mismatch is a refusal, for the reason in §10.1, and it is a refusal that
  needs a gate that runs it.
* The rest of the proposal — the outer Newton's extra unknowns, the backbone
  equality residuals, the phase-vanishes handling, the ion refusal — is
  unchanged and still unimplemented.


---

## 11. Section 3.1 is WRONG, and here is the evidence (2026-07-27)

The proposal said the outer Newton "gains unknowns": `ln L_org` plus the
organic composition. That was implemented, in full, and **it does not
converge**. The implementation was reverted rather than committed; what
follows is what it cost and what it proved, because a disproved design with
evidence is worth more than a broken implementation.

### 11.1 What was built

* the builder factored into ONE `buildMolecularGamma(memberNames, model)`,
  so the aqueous backbone and the organic phase are constructed by the same
  wiring — the "same model on both liquids" rule becomes structural instead
  of a promise;
* `unpack` extended to `[ln V, z₁…z_{nV−1}, ln L, w₁…w_{nOrg−1}]` — the
  organic phase in exactly the vapour's coordinates, an amount in logs and a
  softmax over member odds;
* aqueous totals and the backbone state both computed from `n − vap − org`;
* one activity-equality residual per organic member,
  `ln(γ_org x_org) − ln(γ_aq x_aq)`;
* every branch gated on `nOrg == 0`, and the **no-organic path verified
  byte-exact** on flash09–16.

### 11.2 What it does

On the spike (water + benzene + ethanol + acetic acid, UNIFAC on both
liquids, 313.15 K, 0.6 atm) the Newton stalls immediately and the line search
rejects every step:

```
outer 0  |r|2 = 4.166  aceticAcid=0.326  benzene=-0.912  ethanol=2.406
                       water=0.115  LL:benzene=-2.466  LL:ethanol=2.129
outer 3  |r|2 = 4.062  aceticAcid=0.325  benzene=-0.901  ethanol=2.372
                       water=0.084  LL:benzene=-2.606  LL:ethanol=1.777
```

Six unknowns, six residuals, and the state barely moves between iterations.

### 11.3 Two real findings on the way, both worth keeping

**A volatile with two liquids must be priced by the liquid it LIVES in.**
Writing benzene's vapour balance through the aqueous backbone means a product
of a mole fraction near 10⁻⁴ and a UNIFAC γ near 10³ — arithmetically the
same equilibrium, numerically hopeless. Declaration should decide: a
component listed in the organic `members` is priced there. This was
implemented and it changed the residuals without fixing the stall, so it is
necessary and not sufficient.

**A segfault from an over-broad edit.** Renaming `nV → nU` across the Newton
block also caught the *vapour seed* loop, which indexes `act[k]` and is sized
by the number of volatiles, not by the unknown vector. Worth recording
because the failure was a crash, not a wrong number — the cheap kind.

### 11.4 Why the design is wrong

The molecular path does not solve two liquids with a Newton. It solves them
by **direct Gibbs minimisation** (`PhaseSet::VLLE`), with multi-start seeding,
and the reason is written in this repository's own known-limitations list: an
LL split on a symmetric γ-model collapses to the K = 1 saddle under
Newton/successive-substitution. The proposal bolted an LL split onto a Newton
built for gas-liquid transfer, and got the failure the corpus already
documents.

**The likely right shape is nested, not flat**: keep the outer Newton on the
vapour, and solve the liquid-liquid split *inside* each residual evaluation by
the same Gibbs minimisation the molecular path already uses — the same
posture the class already takes toward speciation ("mathematically
simultaneous, numerically nested"). The speciation is nested; the LL split
should be too.

That is a different slice from the one this document proposed, and it needs
its own alignment before code. §3.1 and §3.2 above should be read as
superseded.

### 11.5 State

`flashComplex` is unchanged: it declares its organic phase, the declaration is
validated by four refusals, and the case stops with the honest message that
the solver does not carry the phase. That refusal is now known to be correct
for a deeper reason than "not implemented yet" — the implementation it named
was tried and is the wrong one.


## 12. Second attempt: NESTED. Better, and still not converged (2026-07-27)

§11 concluded the flat design was wrong and the shape should be nested. That
was built and measured. **It is clearly the right shape and it still does not
converge**; reverted again rather than committed.

### 12.1 The shape

The outer Newton keeps its own unknowns and its own dimension — `ln V` plus
the vapour odds, nothing added. The liquid-liquid split resolves **inside each
residual evaluation**, by direct Gibbs minimisation over
(β, x_org) with Nelder-Mead, exactly the posture the class already takes
toward speciation: *mathematically simultaneous, numerically nested*.

The aqueous side of the objective is the **full backbone, solvent included** —
what makes water and benzene separate is the water being there, so splitting
only the members against each other prices the wrong mixture.

### 12.2 What each change bought, measured

| | outer residual |
|---|---|
| flat design (§11), organic unknowns in the Newton | 4.166 → 4.062, **stuck** |
| nested Gibbs split | **1.025 → 0.710**, descending |
| + warm start of the inner search | one further step accepted |
| + volatile priced by the liquid it lives in | \|r\|max 0.70 → **0.53** |
| + FD step lifted above the inner noise floor | no effect |

A factor of four on the residual, and it moves instead of sitting. The
direction is not in doubt.

### 12.3 Where it stops, and the lead worth following

It now stalls at iteration **0**: the line search finds no descent at all from
the seed.

The most likely cause is a discontinuity **I built in**. The inner split
returns "no phase" when β lands within 10⁻⁴ of 0 or 1 — the honest guard from
§4.2, that a declared phase which does not exist must be reported as absent
rather than as an empty phase with a meaningless composition. But as written
it makes `org` jump discontinuously to zero, and a residual with a step in it
has no descent direction anywhere near the step.

The guard is right; its **placement** is wrong. Phase appearance/disappearance
belongs in an outer decision (test once, then solve with a fixed phase set),
not inside a function the Newton differentiates. That is how the molecular
path does it too — Michelsen TPD decides *whether* to split, and only then
does the minimisation run.

### 12.4 State, honestly

Not solved. Two designs built and reverted in one sitting; the second is the
right one and needs the phase-appearance decision lifted out of the
differentiated path, plus whatever that exposes next. The corpus is untouched
throughout — 321 PASS, and the no-organic path was verified byte-exact under
both attempts, so the gating held.

`flashComplex` still stops at its honest refusal.


## 13. Third attempt: phase decision lifted out. Best yet, still not converged

§12's lead was that the "phase does not exist" guard sat inside the function
the Newton differentiates. It was lifted: the split is tested ONCE on the
un-vaporised feed, the phase set is then FIXED for the solve, and the run
announces which way it went —

```
[phases] declared second liquid: PRESENT (Gibbs split found on the feed)
         -- solved with a fixed phase set
```

That is the right structure and it is the order the molecular path uses
(Michelsen TPD decides, then the minimisation runs). It helped:

| attempt | outer residual |
|---|---|
| flat, organic unknowns in the Newton | 4.166 → 4.062, stuck |
| nested Gibbs split | 1.025 → 0.710 |
| nested + phase decision lifted out | **0.712 → 0.575, smooth descent** |

But it converges to a **local minimum of the residual norm, not to a root**:
0.5766 → 0.5749 → 0.5747, steps dying out at |r| ≈ 0.575.

### 13.1 What the residual vector says, and the hypothesis it killed

All four volatile residuals are positive and of similar size:

```
aceticAcid=0.235  benzene=0.359  ethanol=0.330  water=0.194
```

Uniformly positive reads as "the liquid wants a higher total pressure than it
has" — i.e. subsaturation, with the Newton pushing V toward a zero it can
only approach. That hypothesis is attractive because the pre-check that
decides whether a vapour exists computes the partial-pressure sum with the
SINGLE-liquid model, before any organic split; with benzene moved into an
organic phase its partial pressure falls a long way, so the pre-check can wave
a case through into a Newton for a vapour that is not there. **That pre-check
does need to account for the declared phases, independently of everything
else here.**

But it is not the explanation. Lowering the pressure — which must cure
subsaturation — makes it *worse*: |r| goes 0.575 at 0.6 atm to 2.29 at
0.25 atm to 2.73 at 0.20 atm. So the stall is not the vapour running out.

### 13.2 State

Three designs built and reverted in one sitting. The structure is now right
and the numerics are not: the outer iteration reaches a point where the
residual norm has no descent direction but is not zero, which points at a
rank-deficient Jacobian rather than at a bad step — two of the four
residuals are probably near-parallel functions of the unknowns once both
benzene and ethanol are priced through the same organic phase whose
composition the inner minimisation fixes.

That is the next thing to look at, with fresh effort. The corpus is untouched:
321 PASS, no-organic path byte-exact under all three attempts.
