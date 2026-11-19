# EduTools batches C and D: eleven wrong statements in eight lessons

Read-only on main, 2026-11-19, at Vitor's request (the batch plan is on
SESSIONS.md).  Evidence with file:line: [edutools-c.md](edutools-c.md)
(rayleigh, residueCurves, hunterNash, slePair) and
[edutools-d.md](edutools-d.md) (reactionEnthalpy, standardState, vanHeerden,
approachToEquilibrium).  Nothing was run; the arithmetic was redone by hand.

## Wrong

1. **rayleigh: the staircase is drawn at the page's P knob, while the
   rectifier witness (still04) always runs at 1.013 bar**
   (`RayleighTool.tsx:719-742`).  Move P and the stages sit on the wrong
   curve, and the caption calls the gap "a finding".
2. **rayleigh: the write interval is named as a cause of the graphical-vs-
   engine gap** (`rayleighLesson.ts:71-72`).  Both sides read the same first
   and last rows; the causes are the curve's trapezoid grid and the time step.
3. **hunterNash: the tooltip says the cascade stops at a mass closure of
   1e-4** (`TieTriangleTool.tsx:574`).  It has been 1e-8 since C123
   (`Extractor.cpp:595-605`), and the test fixture predates the change.
4. **slePair: the b12 and b21 glosses are swapped**
   (`slePairLesson.ts:179-180`).  In NRTL, tau21 (G21) weighs molecule 2
   around a central molecule 1, so with the solute as component 1, b21 is
   "solvent around solute".
5. **slePair: step 7 compares with "the pair fitted to all of it"**; that
   pair was fitted on the 8 training points only (`SlePairTool.tsx:247`).
6. **reactionEnthalpy: step 5 says "every Choupo reactor" closes its energy
   balance at its own T on the formation datum.**  `batchReactor` and
   `dynamicCSTR` off their canonical route integrate a frozen dH
   (`BatchReactor.cpp:343/578/804-812`, `DynamicCSTR.cpp:319/841`).
7. **reactionEnthalpy: the red line is labelled as the witness run but is
   the typed constant -46.1** (`ReactionEnthalpyTool.tsx:63`).
8. **standardState, step 9:** "multiply by -T (positive)" -- -T is negative,
   which is why the inequality flips.
9. **standardState, step 7** calls dHf + ideal-gas rise + EoS residual "the
   whole of it", for every record.  `glucose.dat:54` is `pureSolid`, and
   liquids and electrolytes take other routes
   (`ThermoPackage.cpp:1697-1740`).
10. **vanHeerden, step 5:** "a steeper line cuts the sigmoid fewer times" is
    false in general.  Steepening a flat adiabatic line goes from one crossing
    to three before it returns to one.
11. **Stale citations:** vanHeerden step 1 (`CSTR.cpp:424-438` and `:898`,
    not 404-415 and 784-795); approachToEquilibrium step 4
    (`GibbsReactor.cpp:425`, not 375).

## Suspect, the most useful

- **rayleigh: the knobs can empty the pot** (minimum charge: dry at 67 s
  inside 600 s), and the drawing then vanishes.  The "charge T" knob changes
  nothing on the page, against the file's own rule (`:342`).
- **hunterNash step 5's walk** holds only from stage N back to stage 1, and
  the page does not say so.
- **vanHeerden: "B ~ 1.5"** is cstr05's value; cstr06, which the page names,
  gives about 0.76.
- **approachToEquilibrium:** dH_rxn is glossed as J per mol of reaction, but
  the engine reads kJ per kmol of feed (`GibbsReactor.cpp:103`); step 4
  writes "dT < 0" for a magnitude.
- **standardState:** H is glossed "total, not molar" with the unit kJ/mol.

## Verified

- residueCurves has no wrong statement.
- Every slePair number recomputes.
- Kirchhoff/Hess and the hydrogen and methane numbers check out.
- vanHeerden's R - G = phi and the bound B > 4 gamma/(gamma-4) = 4.574.
- The Gibbs two-run equivalence and gibbs10's 32.4 %.
