# CLAUDE.md -- Choupo case: steady/acetone03_luyben_reaction_section

Programme record:
[`docs/design/acetone-ipa-reference-case.md`](../../../../docs/design/acetone-ipa-reference-case.md).
Siblings: `props/compare/acetone01_ipa_water_azeotrope` (the thermodynamics,
measured) and `steady/reactors/acetone02_luyben_reactor` (the reaction, alone).

## Intent (this case) -- keep this updated as the project develops

- **Goal:** the first piece of Luyben's flowsheet whose answer **does** depend
  on the mixture thermodynamics — reactor plus the phase split that sends
  hydrogen and acetone one way and the aqueous liquid the other.

- **What is independent here.** `acetone02`'s outlet agreed with the paper
  because its feed had been derived from that same outlet — a closed loop, and
  its golden says so. **The flash split is not**: nothing in `0/Rin` was built
  from it, so Luyben's separator streams are a real test.

### The result, measured 2026-08-12

Separator at 318 K, 2.6 atm; predictive UNIFAC on a lake-estimated
isopropanol; H₂ authorised outside the activity model.

| | Luyben | Choupo | |
|---|---|---|---|
| vapour, kmol/h | 39.76 | **44.30** | +11.4 % |
| y H₂ | 0.8742 | 0.7835 | |
| y acetone | 0.0634 | **0.1833** | **2.9×** |
| liquid, kmol/h | 52.84 | 48.29 | −8.6 % |
| x acetone | 0.4427 | 0.5518 | |
| x water | 0.5041 | 0.3734 | |
| cooling duty, kW | −899.3 (his HX1) | −967.6 | +7.6 % |
| reactor duty, kW | 960 (his reactor) | **840.3** | **−12.5 %** |

**The energy is nearly right and the separation is not, and that split is the
finding.** The duty lands within 8 % of Luyben's cooling-water exchanger. The
phase split does not: the vapour carries **2.9× too much acetone**, which in
his design is precisely the loss the absorber exists to recover (he quotes
7.2 %). A plant built on this thermodynamics would be told it loses far more
product than it does.

The cause is not mysterious and was measured *before* this case was built —
that is why the sibling props case exists. Predictive UNIFAC on this binary
puts the IPA/water azeotrope at x 0.590 against a published 0.673, and the
lake-estimated isopropanol boils 4.5 K high. A separation resting on that
cannot reproduce one resting on fitted UNIQUAC pairs, and the question worth
asking was never *whether* but *how much*. The answer is: the duty survives,
the split does not.

**The reactor duty row was added on 2026-08-13 and could not have been written
before.** `conversionReactor` used to report the heat of reaction alone —
470.5 kW, 49 % of Luyben's 960 kW, and invariant to its own feed temperature.
It now reports the first law over the unit, 840.3 kW = 470.5 kW of reaction at
623 K plus 369.8 kW heating the feed from 389 K, and lands at 87.5 % of the
paper. See `acetone02`'s §3 for the defect, the fix, and the 602 kW that
remains — the feed's latent heat, which a gas-basis reactor does not price and
now says so.

### The separator pressure: argued, not fitted

The paper does not give it. Luyben states 1.5 atm for the **absorber** gas,
which is downstream; there is no compressor between reactor and separator and
pressure only falls, so the separator is placed at the reactor's 2.6 atm.
That is a physical argument.

The sweep that could have tempted a fit is recorded here rather than acted on:

| P | vapour kmol/h (39.76) | y acetone (0.0634) |
|---|---|---|
| 1.5 atm | 54.33 | 0.2987 |
| 2.0 atm | 48.09 | 0.2336 |
| **2.6 atm** | **44.30** | **0.1833** |
| 3.0 atm | 42.75 | 0.1600 |

Agreement improves monotonically with pressure right past 2.6 atm, so a fitted
value would have been *higher* and would have looked better for no reason
anyone could defend. **Choosing it that way would be tuning a design variable
to the answer**, which is the thing this project refuses.

### The declared approximation

`constant/thermoPhysPropDict` authorises H₂ outside the activity model. Without
it the package refuses by name — there is no UNIFAC group for hydrogen, none
exists, and inventing one would be fabrication. With it, γ = 1 for H₂ and the
substitution **rides the result** as a recorded divergence.

What that buys, stated in the case: H₂ leaves almost entirely in the vapour,
which is correct — but it does so because its liquid reference is a vapour
pressure extrapolated far above its 33.18 K critical temperature. **Right for
the wrong reason**, and the run says so in its caveats. Henry's law in a mixed
solvent is the principled route and is the deferred D3 transfer term.

- **Pending / in curation:**
  - the three UNIQUAC pairs, which is what would actually close the split;
  - a curated isopropanol;
  - the absorber and the two columns (the rest of Figure 1);
  - the gas-basis reactor's liquid inlet, inherited from `acetone02` §3:
    the duty defect is fixed, the latent-heat term is announced and open.
