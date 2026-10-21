# External review of the Computers & Chemical Engineering draft (2026-10-21)

An external reviewer read the draft at this branch's commit f5ba3a918
(29 pages) and played a demanding referee.  Vítor asked for the review to
be kept so the second article can be revised from it on Saturday.  The
review was given in Portuguese.  Below is a faithful English rendering;
page and line numbers refer to that draft.

**Verdict: major revision; do not submit this version yet.**  The proposal
is interesting, but the article demonstrates the ability to **detect and
document problems** better than the ability to **produce correct,
reproducible results on the problems it chose**.  The likely overall
impression of a referee: "I understand Choupo's philosophy, but I cannot
yet determine precisely enough its scientific novelty, the domain in which
its results are reliable, and the version actually evaluated."

## 1. Show the scientific contribution against the state of the art (introduction, pp. 1-3)

- Defining *glass box* by six observable properties is a good basis.  But
  the comparison with IDAES, the open reference simulator, CoolProp and
  Cantera reduces to naming their categories.
- Unanswered: which of the six properties already exist in those systems,
  which need extra configuration, and which are actually new in Choupo?
- Text files, open source, a model registry, logs and automated tests are
  useful choices, but their existence alone is not scientific novelty.  The
  novelty may lie in **integrating and systematically enforcing** those
  requirements, and that needs evidence.
- Ask: a small, verifiable functional comparison centred on those
  properties.  Feature parity with industrial simulators is NOT required.

## 2. The Cavett case leaves a central objection unanswered (section 5.2 and Figure 5, pp. 17-18)

- The main integration example with recycles shows an energy imbalance of
  **88 %, about 549 MW**, located in the mixers.
- Transparency about it is positive, but the reader meets a research
  simulator whose central demonstration converges numerically and does not
  conserve energy.  **Recording the error does not satisfy the need to
  solve the problem correctly.**
- Ask:
  - A corrected Cavett, with balances and the comparison documented.
  - The earlier result kept as an example of defect detection.
  - An explicit distinction between **numerical convergence**, **physical
    consistency** and **acceptance of the result**.
- `converged/` may legitimately mean numerical convergence only; if so,
  say so and show how a user sees that the solution is still physically
  inconsistent.
- Figure 5 lacks the **Cavett flowsheet** itself, with streams and recycles
  labelled; today it is mostly text in boxes.

## 3. The comparison with the open reference simulator is not yet a controlled benchmark (section 5.4, pp. 18-22)

This would be one of the main comments.

- Choupo's runs are compared with **states stored in the reference's sample
  files**, without re-executing those samples in an identified version.
  That allows auditing the files but limits conclusions about the
  simulator's behaviour.
- Properties, parameters, models and some specifications change at the
  same time:

  | Case | Problem for interpretation |
  |---|---|
  | A | Different thermodynamic data and parameters; the mixers carry imposed temperatures to work around a defect. |
  | B | Feed stage and column specifications changed; results predate the column corrections. |
  | C | Extraction isothermal in Choupo and adiabatic in the reference, with different models. |
  | D/E | Differences in kinetics, constants and thermodynamic data. |

- In case C **temperature also affects the separation and the phase flows**,
  so saying the flows are comparable but the temperatures are not does not
  resolve the difference between the two problems.
- Ask for two distinct exercises: (i) comparison of IMPLEMENTATIONS with
  conditions and models as equal as possible; (ii) comparison of
  PREDICTIONS with different models, treating those differences as part of
  the study.
- The inconsistencies in the reference files can stay in an audit
  supplement; they must not carry the main weight of demonstrating
  Choupo's quality.

## 4. Some causal conclusions are stronger than the experiments shown

| Claim | Objection |
|---|---|
| 5.4 A: the difference comes from the equation of state and the parameters, not the valve. | The test shown demonstrates sensitivity to the thermodynamics; on its own it does not exclude a problem in the valve's implementation. |
| 5.4 D: being closer to equilibrium explains the difference and favours Choupo's result. | In a finite-size kinetic reactor, being closer to equilibrium is not automatically more correct. |
| 5.4 D: an experimental volatility at one composition decides which minimum stage number is right. | The comparison must be justified against the effective mean volatility used in the stage calculation. |
| 3.3: the models put the azeotrope in about the same place, so the column design is not sensitive to the choice. | Sensitivity also depends on the equilibrium along the column, the specifications and how close the separation is to difficult conditions. |

Run additional tests, or reduce each conclusion to what was observed.

## 5. Curation is one of the most promising parts, but the acceptance criterion is under-argued (section 3, pp. 11-13)

- Separating studies, declaring the criterion beforehand and showing a
  rejected candidate are good decisions.
- But the rule that adds the largest experimental uncertainty to the
  vapour-pressure error at the ends needs grounding.  The reader does not
  know:
  - whether the uncertainties are standard or expanded;
  - how the pressure and composition uncertainties enter;
  - how a systematic model error is combined with experimental
    uncertainty;
  - why the LARGEST value defines a threshold applied to a MEAN;
  - the physical or statistical justification of the rule.
- **Declaring a threshold before the fit prevents some opportunistic
  choices, but does not make the threshold adequate.**
- Figure 4 draws the band as a visual limit on individual residuals while
  the verdict rests on the mean deviation; these are different criteria
  and must be distinguished.
- "UNIFAC saw neither study" needs care: it was not fitted in this work,
  but that does not show the data are independent of the model's
  historical parameterisation.
- Require checking the two original articles used in the central example:
  presenting a curation methodology while leaving exactly those sources
  unverified weakens the demonstration.

## 6. The nanofiltration section needs equations and a results figure (section 5.3, p. 18)

- This application could make the article much more interesting for
  research; today it gets little space and asks the reader to accept too
  many claims without demonstration.
- Ask: the transport equations, the zero-current condition, the boundary
  conditions, the treatment of concentration polarisation and the operating
  conditions.
- **Reproducing curves computed by another model is verification by
  comparison; it is not validation against the experimental points.**  The
  section's title and conclusions must reflect this.
- Needed figure: experimental data, the published curves and Choupo's
  predictions, distinguishing the real concentrations from the trace
  limit.
- The claim about determining individual ion permeances from single-salt
  tests must explain identifiability: obtaining one salt's ambipolar
  permeance does not by itself determine both ions' permeances separately.

## 7. The tests are described with guarantees that are too absolute (section 4, pp. 14-15)

- The text acknowledges coverage limits but also says a class of error
  cannot come back without a test failing.  That exceeds what the examples
  show: a test protects the behaviours and conditions it actually
  exercises.
- Missing:
  - the residual formulas and their normalisations;
  - the justification of the tolerances **0.5 % mass**, **1 % energy** and
    **1 kW**;
  - a reconciled account of coverage: 482 cases in total, 252 in the mass
    balance, and the different groups in the energy balance;
  - examples of independent verification of the balance reports
    themselves.
- Centralising the balances in the engine avoids discrepancies with the
  interface, but verifying that layer should include independent hand
  calculations on a few simple cases.
- The opening flash, fed at the separation's own T and P, is useful to
  explain the program; **its zero energy balance is not a demanding test of
  the energy calculation.**

## 8. A single frozen, fully re-run version is missing

- The article mixes the published release, a development line, results
  from before corrections, and features still being integrated.
- Lines 615-616 matter most: the table was computed before the column
  corrections and will be recomputed.  **That table cannot yet support the
  final conclusions.**
- Before submission: an identified version, every result regenerated on
  it, and a reproducible package with inputs, commands and outputs.  The
  essential commands must be in the article or a supplement; comments
  hidden in the LaTeX source are not enough.
- The reviewer disagrees with leaving the benchmarks out of the tests
  because the reference has defects: Choupo's conservation and its
  corrected results can be tested without requiring agreement with a
  defective reference.

## 9. Less internal history, more method

- Too much repetition that the interface computes no physics, that errors
  are named and that the code is readable.  Terms such as *gate*,
  *ratchet*, *witness*, *debt* and internal codes like "C16" need
  translating into concepts an outside reader recognises.
- The long OpenFOAM comparison and the class-registration details can be
  shortened.  The space is needed for: the essential equations and
  algorithms; the formal definition of the acceptance criteria; the
  benchmarks' flowsheets; the nanofiltration results.
- A pedagogical study is not required for a software article (the
  manuscript correctly says none exists yet); but the educational benefits
  must be presented as goals, without generalising about what other
  simulators do or do not let the user see.

## 10. Point corrections that affect credibility

- **"Hand-written C++"** in the introduction conflicts with the statement
  that agents implemented substantial parts of the software; the
  description must be consistent.
- References **[16] and [17]** need complete bibliographic identification;
  a reference title must not be deliberately shortened to omit a
  commercial simulator's name.
- Xu-Froment and Vanden Bussche-Froment are central to the benchmarks but
  their full references are missing.
- The claim of provenance and licence for every value must be reconciled
  with the four records still pending mentioned in the limitations.
- Figure 2's text is too small to read comfortably.  Figure 3 shows a
  feature but contributes little to demonstrating the scientific
  conclusions.
- Affiliations, contributions, funding and the version archive are still
  to be finalised.

## Recommended order of revision

1. Freeze and correct the central cases.
2. Redo the benchmark in a controlled way.
3. Strengthen the nanofiltration and the curation.
4. Then rewrite the introduction and shorten the internal description.

The article does not need to show that all 52 operations are
experimentally validated.  It needs to present **a bounded set of
contributions supported by solid cases**.  Transparency is a relevant
contribution; for this manuscript to convince, it must let the reader
follow both the detection of the problems and the demonstration that the
final results withstand verification.
