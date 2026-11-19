# EduTools batches I and J: ten wrong statements in eight lessons

Read-only on main, 2026-11-19, at Vitor's request.  Evidence with file:line:
[edutools-i.md](edutools-i.md) (overpressure, poolFire, stackDispersion,
letdown) and [edutools-j.md](edutools-j.md) (plantCost, economicsErrors,
leastSquares, dataReconciliation).  No formula or unit error in batch I; the
relief C++ and TypeScript are still one procedure (constants rederived).

## Wrong

1. **leastSquares: the tool describes the curate02 that C439 replaced
   yesterday** (`LeastSquaresTool.tsx:208,352,457-462,508,700-703`;
   `leastSquaresRun.ts:52`).  It says 8 fitted points, 4 coefficients
   not separately determined, and 3 withheld at x = 0.20/0.50/0.80.  The run
   it draws has 10 fitted, 2 identifiable parameters and 4 held out at
   0.10/0.39/0.63/0.85.
2. **leastSquares:** `fdStep` is quoted as 1e-3 (`leastSquaresLesson.ts:334`);
   the case declares 1.0e-4.
3. **leastSquares steps 1-2: "unweighted, cannot read a per-point sigma"**
   (`:100-125`).  `weighting uncertainty` has been accepted since 2026-09-28
   (`FitWeighting.H`, `FitParameters.cpp:953`); curate02 chooses `equal`.
4. **leastSquares, limit at `:569`:** "the dataset declares no per-point
   uncertainty".  It does, and step 8's 0.18 K band is built from it.
5. **plantCost: the Lang print line is stale** (`plantCostLesson.ts:79`:
   `EconomicsPass.cpp:3802` -> `:3807`).  The tool's citations are one line
   off (`PlantCostTool.tsx:367-368`: 254/403/409/2879 ->
   255/404/410/2880).
6. **economicsErrors: class 6 is labelled "the same plant as classes 2 and
   3"** (`EconomicsErrorsTool.tsx:264`), but it has its own inputs.
7. **overpressure: "the same declared blocked-outlet flow"**
   (`OverpressureTool.tsx:327`, registry `teaches`).  The two loops relieve
   about 155 t/h and 264 t/h (the page's own W row).  The 4.6x area ratio is
   about 1.70 (flow) x 3.02 (pressure), not pressure alone.
8. **stackDispersion: the wind help says plume rise falls "as 1/u"**
   (`stackDispersionToy.ts`, KNOB_U).  In classes E and F the page's own
   `finalRise` gives u^(-1/3).
9. **letdown: the noise bench says "the noise relations, as the fluids
   library implements them, evaluated on this page"** (`LetdownTool.tsx`).
   None is run: the page computes Q dP, an expander work and 10 log10.

## Suspect, the most useful

- **Licence: overpressure step 11 quotes an API 526 letter area**
  (`overpressureLesson.ts:597`: "the largest, T, is 26 in2").  CLAUDE.md
  rules that the letter areas are a no-grant standard's table and that
  `check_source_licence` refuses them by value; one value has reached the
  prose.  Check the gate's reach over gui/ and remove the number.
- **overpressure:**
  - The P2 slider can exceed the 50-bar loop's relieving pressure (the area
    goes NaN, shown "-").
  - F can be 0, which the engine refuses.
  - The engine counts the whole wetted area while step 3 says only the area
    within the fire height.
- **letdown:**
  - The gas row's "power dissipated" is the isentropic work (17.7 kW), while
    the throttle's lost work is about 30.7 kW (about 3 dB).
  - Steps 2 and 9 predate C390's liquid pressure term (the first throttle now
    warms the liquid about 2 K).
- **stackDispersion:**
  - "Stack height over sqrt 2" should be the effective height.
  - Class F is "moderately stable" in Turner.
- **economicsErrors:** class 6's IRR is 120 % at the defaults, not "hundreds
  of per cent".

## Verified

- dataReconciliation has no wrong statement (nine citations, the golden
  numbers).
- poolFire: every typed number reproduces from the catalogue.
- stackDispersion: Briggs, Turner and GEP.
- plantCost: the FCI, 1.18, working capital and the loan.
- Every batch-I citation lands on its line.
