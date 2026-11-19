# EduTools batches M and N: five wrong statements in eight lessons

Read-only on main, 2026-11-19, at Vitor's request.  Evidence with file:line:
[edutools-m.md](edutools-m.md) (processSafety, bund, plantLayout, gmpLayout)
and [edutools-n.md](edutools-n.md) (materials, treeOfChemistry,
routeScreening, declaredPathways).  About 80 layout and safety citations all
land; no no-grant value in batch M (HSG176 and SI 2001/2954 are OGL, Annex 1's
10 Pa is under the Commission's reuse policy); all 140 route equations
balance and no biological route uses H2.

## Wrong

1. **processSafety: the Tool kept the text that C259 removed from the
   lesson** (`ProcessSafetyTool.tsx:860-865`: "these cases size no vessel,
   so there is no volume to hold anything").  Step 15 and the goldens give
   192.8 kg of converter gas and 4.3 t / 23.4 t of separator liquid.  The
   test that bans the old wording checks only the lesson; the registry blurb
   (`registry.ts:1951`) is stale the same way.
2. **bund step 11: "one volume with three walls"** (`bundLesson.ts:440-441`);
   the table that follows is "four walls", 4 rows (`BundTool.tsx:342-347`).
   Stale "three walls" comments remain at `BundTool.tsx:25,340` and
   `bund.ts:523`.
3. **bund step 15: "the largest tank, or a quarter of the total, the
   larger"** matches neither rule in `RULES`.  The default prints 22 m3, not
   20, because the 110 % is dropped.
4. **treeOfChemistry step 4: the walk "stops on a loop" at the balanced VCM
   plant** (`treeOfChemistryLesson.ts:173-175`).  It does not.  The loop stop
   fires only for a substance already on the path
   (`chemistryGraphMath.ts:267`), and the recycled HCl is a co-product.
   Picking oxychlorination then expands HCl through `HClSynthesis`, charging
   fresh Cl2 and H2 for HCl the plant makes itself.
5. **routeScreening, registry `teaches`: methane oxidation "wins the first
   four" filters** (`registry.ts:2219-2221`).  Filter 4 is heat, and route C
   removes the most, 127 kJ/mol methanol against 98 (A) and 59 (B); it only
   ties A on atom economy.

## Suspect, the most useful

- **materials step 18: "the material enters twice" (F_M and F_P)** describes
  the engine's own F_P (`Turton.cpp:323-328`).  Turton's vessel F_P uses a
  fixed carbon-steel S E; check against the book before teaching it.
- **materials steps 22-23: "density moves no euro"** holds for Turton-costed
  vessels only.  The pressure stores are costed by steel mass
  (`SteelMassCost.cpp:40,124`).
- **declaredPathways limit "ideal-gas-at-fifty-bar"**: the equilibrium reactor
  now folds fugacity coefficients into ln Q (`EquilibriumReactor.cpp:328,
  352, 682-721`).  The step 4 citations are one line off (163/174 ->
  164/175).
- **routeScreening: "this repository curates no prices"**, while the utility
  records carry costs labelled as assumptions; it holds for chemicals only.
  Section 2's "upper bound because conversion is never complete" contradicts
  section 4's recycle argument.
- **processSafety:** `n_A` is defined as reactant B.
- **bund:** an HSG176 paragraph range disagrees with its own source list.
- **plantLayout step 9:** "a bare number is read as radians"; the engine
  refuses it.

## Verified

- The criticality classes, Stoessel's T_cf and TMR_ad units.
- The sloped-floor volume and the wall forces.
- The layout distances and the GMP cascade.
- The SS316 converter weight (60011 kg).
- The reformer's a_C = 1.5800.
- The route margins, K and conversions.
