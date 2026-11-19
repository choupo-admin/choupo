# EduTools batches G and H: six wrong statements, one engine defect

Read-only on main, 2026-11-19, at Vitor's request.  Evidence with file:line:
[edutools-g.md](edutools-g.md) (bjerrum, electrolyteModels, saltMixing,
elementPotential) and [edutools-h.md](edutools-h.md) (tear, wegstein,
relaxation, reactorLadder; reactorLadder is the water-gas-shift ladder of
stoichiometry, equilibrium and rate, not CSTRs in series).

## Engine defect, found through a lesson

**`recycleWegsteinQmin/Qmax` are read unchecked and unannounced**
(`Flowsheet.cpp:3539-3540`).  A declared `qmin > qmax` reaches
`std::clamp(s/(s-1), qMin_, qMax_)` (`Wegstein.cpp:83`), which is undefined
behaviour when lo > hi.  Relaxation step 8 says every knob is announced and
refused out of range; for these two, neither holds.  Refuse `qmin > qmax` by
name and announce non-default bounds.

## Wrong (lessons)

1. **bjerrum, `one-family` limit** (`bjerrumLesson.ts:320-330`): "boron is
   not curated".  `species/H3BO3.dat` and `chemistry/BOH4-formation.dat`
   exist (a8bd986844, 2026-11-01), and `borate01_felmyWeare` speciates
   boron.
2. **electrolyteModels: about 12 prose citations are stale by 10-30 lines**
   (`PitzerForm.H` 88 -> 106; `AqueousActivity.cpp` 131/142 -> 164/175;
   `SpeciationSolver.cpp` 1569 -> 1599; `ENRTLSingleSalt.H` 84/90/154 ->
   94/100/164).  The test checks only `EM_CITATIONS`, not the prose.
3. **electrolyteModels, `in-sample` limit:** credits the catalogue's Pitzer
   records to Pitzer & Mayorga (1973).  Every record cites Appelo (2015), the
   values differ (NaCl beta0 0.07534 vs 0.0765), and the tool prints Appelo
   in the same table.
4. **reactorLadder: "at 550 K the same bed delivers only 0.866, the rate
   binds"** predates C421 (the PFR then priced the feed as a liquid).
   Integrating the case's own kinetics on today's gas basis gives
   X = 0.8835028 against X_eq 0.8835029: the bed reaches the limit.  It is in
   the lesson (`:250-252`), the `rate-binds` quiz, the T-knob text
   (`ReactorLadderTool.tsx:127`) and the header; section 5 still says
   "liquid-basis PFR".
5. **tear: "move the reactor above the mixer and the tear count falls to
   one"** (`tearMath.ts`).  `judgePlan` on that order gives three tears; one
   needs the mixer moved last.
6. **relaxation step 8:** see the engine defect above.

## Suspect, the most useful

- **Prose citations drift with no gate** (electrolyteModels, wegstein
  `:85` -> `:92` and `:3639` -> `:3675`, `tearMath.ts` 44xx -> 5078-5195).
  This recurs in every batch.  A gate that resolves every `file.ext:NNN` in
  lesson prose against a needle, as `EM_CITATIONS` already does, would close
  the class.
- **wegstein:** the third guard (`Wegstein.cpp:84-88`, no acceleration
  toward a negative pressure) is omitted from a "line-for-line" transcription.
  P is glossed in bar for the Newton row, which packs Pa
  (`Flowsheet.cpp:3748`).  "The default accelerator" contradicts Choupo's
  Newton default.
- **saltMixing:** the T sliders take the KCl Pitzer record past its 4.8 mol/kg
  validity (I 7.2-9.1 at the eutonic) without saying so.
- **electrolyteModels:** "Davies' band has no source", while the engine cites
  Davies (1962).

## Verified

- saltMixing and elementPotential have no wrong statement.
- bjerrum's crossovers 6.341/10.262 and its closure.
- Debye-Hückel 3A_phi/ln 10 = 0.510; the Pitzer and eNRTL forms;
  ln a_w = -nu m M_w phi.
- Wegstein q = s/(s-1), its ranges and default clamps; w_opt = 1/(1-a).
- The tear counts and the seven refusals.
