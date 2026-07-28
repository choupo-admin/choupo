# Proposal — declaring a stream's basis: apparent components, aqueous species, or both

**Status: HALF IMPLEMENTED (2026-07-27).** The INPUT side shipped -- a stream
may be written in the aqueous-species basis, with the three refusals of §3.1 --
and `tutorials/steady/flash/flash18_water_analysis_basis` is the vertical spike
of §6, gated by `bin/curate/check_stream_basis.py`. The OUTPUT side of §3.2
(the closing `speciation {}` decomposition) is NOT built; §9 records why the
proposal was wrong about how easy it was, and what it needs.

One correction the spike forced on §3.1, and it matters: the input block also
needs **`basis analytical|stoichiometric;`**, REQUIRED. See §9.1.

**Asked for by Vítor (2026-07-27):** *"No caso de soluções aquosas de iões,
tem de ser possível especificar que os sais aparentes (ou bases ou ácidos) ou
as espécies. Nas correntes intermédias o ideal é aparecerem os componentes
aparentes e as especiações."*

**Relation to the roadmap:** this is the **vertical spike** that
`CLAUDE.md` requires before any mass migration toward general basis
reconciliation — *"build a vertical spike end-to-end through all layers BEFORE
any mass migration"*. It is deliberately one case deep, not a corpus sweep.

---

## 1. The gap is an ASYMMETRY, and it is accidental

The engine already reads both bases. Not as a plan — today, in shipped code.
A `propsDict` speciation op accepts either:

```
totals            { Na 0.1 mol/kg;  Cl 0.1 mol/kg; }   // alias analyticalTotals
composition       { NaCl 0.1 mol/kg; }                 // formula-unit salts
```

`analyticalTotals` is the mode for *"waters measured directly in ions/masters"*;
`composition` is the analysis given as *"FORMULA-UNIT SALTS (component basis),
each expanded to ion totals through its component.speciesMap"*, with
**electroneutrality VALIDATED** so a formulated-salts input can never silently
unbalance charge (`src/propertyOps/Speciate.cpp`).

The engine even distinguishes the two *provenances* internally:
`SpeciationInput::stoichiometricTotals` marks totals that came from neutral
apparent components through the declared bridge, *"not from a lab water
analysis"*, and suppresses the charge-imbalance advisory that would otherwise
fire on a weak acid delivered as its conjugate base.

A **stream** knows one basis: `componentMolarFlows` / `componentMassFlows`.

So the props bench can read a water analysis and a flowsheet cannot. That is
not a decision anybody made; it is where the two worlds happened to grow.

## 2. The mathematics decides most of the shape

With `m = A n` (component amounts `n`, species totals `m`):

* **`n → m` is always well defined.** Every component declares its bridge.
* **`m → n` requires `A` to have full column rank.** Otherwise several
  component vectors give the same species state and any component-named
  report is silently picking one.

That asymmetry is already enforced: `flash15_refused_salt_basis_rank` refuses
K/Na × Cl/SO₄ by name, with the `(components, families, deficiency)` triple,
because `(c−1)(a−1) = 1`. And it is not academic — on 2026-07-27 the same test
threw `NH4HCO3` out of `flashComplex`'s basis, because its column is exactly
`NH3`'s plus `CO2`'s.

Two consequences worth stating plainly:

**A species-basis INPUT relaxes a condition rather than adding one.** A water
analysis arrives in ions (Na⁺, Cl⁻, SO₄²⁻, alkalinity). Forcing the author to
convert it into salts forces them to *choose labels* — NaCl + KBr and
NaBr + KCl give the same ions — which is precisely the degree of freedom the
rank test polices. Reading the analysis as it was measured needs no inverse.

**But a species-basis input into a component-basis flowsheet still needs the
inverse**, to state the stream on the basis the units share. So the rank
condition moves rather than disappears, and the SAME test guards both
directions. Nothing new to build there.

**A choice of apparent salts is a choice of LABELS.** It must therefore be
declared, never inferred. Inferring it from key names (is `Na` a species or a
component?) is name identity, which the typed-identifier rule bans outright.

## 3. The proposal

### 3.1 Input: a stream declares which basis it is written in

Two mutually exclusive material blocks, following the STREAM vocabulary (a
stream carries flows, not molalities — molality is an intensive liquid-phase
property that needs the water amount to mean anything):

```
// today, unchanged, and the default when nothing else is written
componentMolarFlows
{
    NaCl        0.5   kmol/h;
    water     100.0   kmol/h;
}
```

```
// NEW: the analysis as it was measured
speciesMolarFlows
{
    network   seawaterCarbonate;      // WHICH chemistry set these names belong to
    Na        0.5   kmol/h;
    Cl        0.5   kmol/h;
    HCO3      0.02  kmol/h;
    water   100.0   kmol/h;
}
```

Rules:

1. **Exactly one of the two.** Both present is refused — that is two homes for
   one quantity, and the file cannot say which one the author meant.
2. **`network` is REQUIRED** in the species form. A species name is only
   meaningful relative to a declared chemistry set; an `NH4` written by one
   network is not the `NH4` of another. Absent = refused.
3. **Electroneutrality is validated**, exactly as `composition` validates it
   today. A species-basis stream that does not balance charge is an error in
   the analysis, announced with the residual charge.
4. **Projection onto the case's component basis is a rank question**, and the
   existing refusal fires unchanged.
5. **Absent the new block, nothing changes** — byte-identical, which is the
   only acceptable mitigation for touching the constitutional stream layer.

### 3.2 Output: apparent stays the STATE; speciation is a decomposition that CLOSES

Vítor's second sentence — intermediate streams should show both — is right,
and the shape it must take already exists in the contract. Every `0/` file
carries this header today:

> *`componentMolarFlows` is the OVERALL material (all phases); a `phases{}`
> block, when present, is a decomposition that sums back to it exactly.*

The speciation takes the same form:

```
componentMolarFlows                     // THE state
{
    NaCl        0.5   kmol/h;
    CO2         0.02  kmol/h;
    water     100.0   kmol/h;
}

speciation                              // a DECOMPOSITION that must close
{
    network   seawaterCarbonate;
    basis     stoichiometric;           // vs `analytical` -- the existing
                                        //   SpeciationInput distinction
    Na        0.5      kmol/h;
    Cl        0.5      kmol/h;
    HCO3      1.83e-2  kmol/h;
    CO3       4.1e-5   kmol/h;
    H         1.2e-6   kmol/h;
    ...
}
```

Rules:

1. **It is written by the solver and VERIFIED on read**, never a free input.
   `A · n` must reproduce the declared species totals to tolerance, through
   the same bridges the case declares. It does not close → refuse, naming the
   worst-offending master and the residual.
2. **It is not state.** Delete the block and nothing about the case changes.
   That is the test of whether a field is a second home: if removing it loses
   information, it was state and this design is wrong.
3. **The apparent side remains the invariant that crosses a model boundary.**
   A unit in another thermodynamic world reads `componentMolarFlows` and
   ignores `speciation` — it cannot do otherwise, because the species list is
   a property of the network, not of the matter.

### 3.3 What this buys

The intermediate stream becomes readable as chemistry without becoming
model-dependent: the student opens `converged/bottoms` and sees both the 0.5
kmol/h of NaCl they fed and the ions the model actually solved, with the
guarantee that the second sums back to the first.

## 4. Four things this must not get wrong

1. **Two sources of truth.** Guarded by (3.2.1) and (3.2.2): the decomposition
   is verified and deletable. If either property is dropped, the design has
   become the arity sin.
2. **A model choice leaking into persisted state.** Guarded by the mandatory
   `network` and by the apparent side staying primary. A stream file must not
   become unreadable because the case that reads it declared a different set.
3. **A silent basis switch.** Guarded by exclusivity and by the absent-block
   default. There is no `basis` switch in `controlDict`: the basis is a
   property of the STREAM, because a plant can perfectly well receive a lab
   analysis on one inlet and a recipe on another.
4. **Rank treated as an inconvenience.** It is the reason the apparent
   projection is legitimate at all. A species-basis feed into a rank-deficient
   component basis refuses, with the same message flash15 already prints.

## 5. Rejected

* **Species as a second independent state block.** Drifts the moment anyone
  hand-edits a file, and nothing can adjudicate. This is the whole reason for
  the decomposition-that-closes form.
* **Inferring the basis from the key names.** `Na` vs `NaCl` is name identity;
  banned by the typed-identifier rule, and wrong in practice (a component may
  be homonymous with a species — that is what the `aq` suffix exists for).
* **A global basis switch in `controlDict`.** Wrong altitude: makes a stream
  property a run property, and breaks the moment two inlets differ.
* **Persisting molalities instead of flows.** A stream is a flow. Molality is
  intensive, liquid-phase, and needs the solvent amount; writing it into the
  stream layer would put a phase-dependent quantity where the overall material
  belongs.
* **Carrying the species basis through EVERY stream (general reconciliation).**
  That is the endgame this spike exists to inform, not this slice. It stays
  `[ROADMAP]`.

## 6. The vertical spike — one case, end to end

Not a corpus sweep. ONE tutorial that exercises every layer:

* a feed declared in `speciesMolarFlows` (a real water analysis, ions),
* through a reactive flash (the existing `electrolyteGammaPhi` path),
* an outlet whose `speciation {}` block closes against its
  `componentMolarFlows`.

With four assertions, three of them refusals:

| assertion | why it matters |
|---|---|
| the species feed gives the SAME answer as the equivalent component feed | proves the projection is a coordinate change, not a model change |
| a species feed with net charge REFUSES, naming the residual | the analysis is wrong and must not be absorbed into pH |
| a species feed onto a rank-deficient component basis REFUSES | the labels are a choice; flash15's message, on the input path |
| a hand-broken `speciation {}` block REFUSES on closure | proves the decomposition is verified, not decorative |

Plus the gating one: **every existing case is byte-identical.** The stream
layer is constitutional; nothing less is acceptable.

## 7. Cost

Reader + writer in the stream-state layer, the closure check, the
electroneutrality check (the code exists in `Speciate.cpp` and moves), the
`network` plumbing, one tutorial, one gate. The engine work is small because
the two readers already exist in the props world; what is new is the
**contract** — exclusivity, mandatory network, verified closure, and the
deletability of the decomposition.

## 8. The ask

1. Is the split right — **input basis declared per stream**, **output
   apparent-primary with a closing speciation decomposition**?
2. Are the names right (`speciesMolarFlows`, `speciation {}`, `network`,
   `basis stoichiometric|analytical`)?
3. Is the spike the right shape, and which system should it be?


---

## 9. What the spike changed in this proposal (2026-07-27)

### 9.1 The input needs a `basis`, and the proposal missed it

§3.1 asked for `network` and electroneutrality validation. Building the spike
showed that is not enough, and the case that showed it is the obvious one.

The equivalent of `CO2 2.0 + CaCO3 0.0122` in masters is `HCO3 2.0122,
Ca 0.0122` — which has a net charge of −1.99 and would have been REFUSED by
the electroneutrality check this proposal asked for. Correctly, too: as an
*analysis* that water is impossible. But as a **stoichiometric** set it is
right, because H⁺ and OH⁻ are the network's own mediators and are excluded
from the masters — a neutral acid delivered as its conjugate base looks 200 %
imbalanced while being charge-balanced by construction.

The engine already draws that distinction internally
(`SpeciationInput::stoichiometricTotals`, whose comment says exactly this).
The proposal put it only on the OUTPUT block. It belongs on both, and it is
**required, not defaulted**: one reading refuses correct waters, the other
waves broken ones through, so there is no safe default to pick.

### 9.2 The output side is harder than §3.2 implies, and for a good reason

§3.2 says the speciation block is *"written by the solver and VERIFIED on
read"*. Verified on read is built and easy — it is `A n` against the declared
bridges. **Written by the solver is not**, and the reason is worth stating
because it is the arity doctrine again:

* Writing `A n` — the master totals — would be trivial, and **worthless**:
  every number in it is derivable from the `componentMolarFlows` block two
  lines above, through bridges the case already declares. That is the
  `introduces` sin in its purest form.
* What is NOT derivable without running the model is the **solved
  speciation** — HCO₃⁻ against CO₃²⁻ against CaCO₃(aq), the ion activities,
  the pH. That is the block worth writing, and it needs the converged
  `SpeciationResult` plumbed from the unit that solved it to the writer, which
  today receives only a `ProcessStream` and a `ThermoPackage`.

So the output half is a real slice with a named dependency, not a formatting
job. Building it as `A n` to look finished would have been worse than not
building it.

### 9.3 What shipped

* `speciesMolarFlows { network; basis; <species> <flow>; }` as a sixth
  canonical material form, exclusive with the other five.
* `ThermoPackage::reactiveConfig()` — read-only access to the declared bridge,
  so the stream layer reads the map instead of re-deriving one.
* Four refusals: no reactive package, unknown `network`, missing/invalid
  `basis`, unbalanced charge (analytical only), rank-deficient projection, and
  a master no component can carry.
* `flash18_water_analysis_basis` + `check_stream_basis.py`, whose first
  assertion is the one that matters: the species basis gives the **same** KPIs
  as the components it inverts to. A coordinate change that moves the answer
  was not a coordinate change.
