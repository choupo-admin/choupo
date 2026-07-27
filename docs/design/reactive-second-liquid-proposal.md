# Proposal — a second liquid phase on the reactive path

**Status: PROPOSAL. Nothing here is implemented.** For alignment before any
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
