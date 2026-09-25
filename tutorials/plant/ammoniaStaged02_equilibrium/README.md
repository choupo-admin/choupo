# `ammoniaStaged02_equilibrium` — stage B of the staged design sequence

**THE THERMODYNAMIC CEILING.**  The per-pass conversion this case reports is
a **ceiling that no real converter reaches**, and **sizing anything
downstream against it produces a fiction**.  That sentence is the case; the
numbers below are the evidence for it.

## 1. Where this sits

Three cases form a ladder of reactor fidelity over one unchanged ammonia
synthesis loop.  **Between consecutive stages exactly one thing moves: the
reactor model.**  Everything else — feed, pressure, components, property
package, recycle plan, tear seed, separator, let-down, purge — is
byte-identical.  Diff two `system/flowsheetDict` files and the only block that
differs is `converter`.

| | reactor | claims | must not claim |
|---|---|---|---|
| **A** `ammoniaStaged01_yield` | `conversionReactor`, declared conversion | a material balance | a reactor size; an equipment-factored cost |
| **B** *this case* | `gibbsReactor`, **true equilibrium** | the thermodynamic **ceiling** | any size, any cost, anything sized against its outlet |
| **C** `ammoniaStaged03_approach` | `gibbsReactor` **+ 5 K approach** | a realistic outlet | a bed volume the engine computed |
| D (**not built**) | kinetic PFR on a rate law | a bed volume the ENGINE computed | — |

Stage D does not exist.  `src/unitOperations/reactor/kinetics/AmmoniaSynthesisRate.{H,cpp}`
is included by its own `.cpp` and by `AmmoniaRateBench.cpp`, a props operation,
and **by no reactor**.  The rung is named here rather than implied, because a
visible gap beats an invisible falsehood.

Background: `docs/design/how-a-process-design-is-staged.md`, and DEV.md C8.

## 2. What this case claims

**One claim: the ceiling.**  With no conversion declared and no approach
declared, the converter outlet is the composition that minimises the Gibbs
energy of the four declared species at 700 K and 200 bar, subject to the feed's
own element balance, with SRK fugacities.

Measured from this run:

| quantity | value |
|---|---|
| converter inlet | 16 205.32 kmol/h, y(NH₃) = 0.008042 |
| converter outlet | 12 462.27 kmol/h, **y(NH₃) = 0.310807** |
| **per-pass N₂ conversion** | **47.9288 %** |
| recycle / makeup (molar) | 1.0257 |
| product | 3 794.41 kmol/h at 98.3902 mol% NH₃ → 1 525.9 t/d NH₃ |
| global first-law residual | +0.0007 kW (1.0e-6 %) |
| global mass closure | 99.9973 % |

It also claims a **converged heat and material balance**, and here that claim
holds: every unit closes at 100.00 % and the plant boundary closes at
1.0e-6 %.

## 3. What this case REFUSES to claim — the load-bearing half

* **It does not claim that 47.93 % is achievable.**  Equilibrium is the limit
  of infinite catalyst and infinite time.  A converter that reached it would
  be infinitely long.
* **It carries no `system/postDict`**, so it sizes nothing and costs nothing.
  That absence is the sequence's invariant working:
  **a stage may not cost what it did not size**, and nothing may be sized
  against a ceiling.
* **It does not claim to describe a real converter's outlet.**  For that, read
  stage C, which is this case plus one key.

## 4. What the ceiling is worth — measured, not asserted

The whole point of a ceiling is the distance from it.  Three numbers from the
ladder, all measured by running the cases:

| | per-pass N₂ conversion | converter outlet y(NH₃) | recycle / makeup |
|---|---|---|---|
| A — declared 25 % (an assumption) | 25.0000 % | 0.149843 | 2.5646 |
| **B — this case, the ceiling** | **47.9288 %** | **0.310807** | **1.0257** |
| C — 5 K approach | 46.6023 % | 0.300194 | 1.0778 |

And two probes run outside the shipped cases, by editing stage C's approach to
the ends of the range its source states (US 5,352,428: "0 °C. to 30 °C. and
preferably 1 °C. to 10 °C."):

| approach | per-pass N₂ conversion | recycle / makeup |
|---|---|---|
| 10 K | 45.2867 % | 1.1323 |
| 30 K | 40.1644 % | 1.3739 |

**Read the last column.**  At the outer end of the source's own range the
recycle is 34 % larger than the ceiling says it needs to be — so a compressor,
a converter and an interchanger sized on stage B's answer are all under-sized
by that much, at exit 0, with every balance closing.  *The fiction is not that
the arithmetic is wrong; it is that the arithmetic is answering a different
question.*

## 5. Honest limitations of this loop — read before quoting a conversion

**The per-pass conversions here are HIGHER than an industrial loop's, and the
reason is the separator, not the reactor.**  The converter inlet carries only
0.80 mol% NH₃, and a leaner inlet buys a larger per-pass conversion.  (How lean
is lean is answered below from a source rather than from memory; no "typical"
industrial inlet figure is asserted here that a document does not carry.)  Two
causes, both inherited from the structural reference
`tutorials/steady/flowsheets/ammonia01_synthesis_loop`:

1. The separator runs at 250 K / 200 bar and condenses nearly all the ammonia.
2. The SRK package declares no binary interaction parameters — all six pairs
   run k_ij = 0, which the engine announces on every run.

So **47.93 % is this flowsheet's ceiling, not the ammonia industry's.**  For an
industrial comparison of converter concentrations, US 5,352,428 describes a
commercial converter going from 3.5 vol% NH₃ in to 16.1 vol% NH₃ out, at
conditions the patent calls "typical and optimum in many commercial process
designs".  That inlet is four times richer than this one.

Also inherited and unchanged: the loop is isobaric at 200 bar (makeup
compression and feed/effluent interchange are folded into the unit duties, not
drawn as machines), and the let-down gas leaves as a secondary product instead
of being recompressed.

## 6. Scale, and why it is not `ammonia01`'s

The makeup is 8 000 kmol/h (N₂ 1 980, H₂ 5 940, Ar 80 — H₂:N₂ exactly 3.0,
argon 1.00 mol%), where `ammonia01_synthesis_loop` runs 1 kmol/h.  The reason is
stage C: at 1 kmol/h the catalyst charge is about 2 litres, below the lower
bound of every vessel cost correlation the engine carries, so stage C could not
honestly cost it.

**The scale-up changes no intensive answer, and that is checked rather than
asserted**: this case's converter reports y(NH₃) = 0.310807360246 against
`ammonia01`'s own golden value of 0.310807360284, and both cases close their
mass balance at 99.9973 %.

## 7. Running it

```bash
bin/choupo-lint  tutorials/plant/ammoniaStaged02_equilibrium   # validate, no solve
bin/choupo-init0 tutorials/plant/ammoniaStaged02_equilibrium   # materialise 0/
runCase          tutorials/plant/ammoniaStaged02_equilibrium
bin/runTests     tutorials/plant/ammoniaStaged02_equilibrium   # golden-master check
```

```bash
# the sequence, as a diff
diff tutorials/plant/ammoniaStaged02_equilibrium/system/flowsheetDict \
     tutorials/plant/ammoniaStaged03_approach/system/flowsheetDict
```

## 8. Sources

* AACE International Recommended Practice No. 18R-97, *Cost Estimate
  Classification System — As Applied in Engineering, Procurement, and
  Construction for the Process Industries*, Table 1 (rev. 7 August 2020).
  Transcribed in `src/postProcessing/EstimateClass.H`, which is this
  repository's ONE home for the table; do not restate its bands elsewhere.
* US 5,352,428, *High conversion ammonia synthesis*, M. L. Bhakta and
  B. J. Grotz, CF Braun and Co, issued 4 October 1994.
