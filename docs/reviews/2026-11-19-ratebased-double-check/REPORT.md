# Rate-based distillation and its EduTools: a double check, units included

Read-only on main at d0d2d1c1e5, 2026-11-19 (nothing built, nothing edited),
at Vitor's request.  Two independent readings, each with its own file:line
evidence: [engine.md](engine.md) (RateBasedSegment, the packing records,
ratebased01-04) and [edutools.md](edutools.md) (the lessons
"equilibrium or rate-based" and "one flux, many units").

## Engine: no wrong equation or unit on any path the four cases run

- Two-film Fickian model with the interface energy balance, as the design
  record describes; the rate factor is < 1e-3, so no high-flux correction is
  owed.
- Units traced from read to use are consistent; the goldens' boil-up, duty,
  a_e/a_p, holdup and bottom pressure recompute by hand.
- HETP 0.13-0.18 m and 0.7-1.6 mbar/m are plausible for a 500 m2/m3 gauze
  under vacuum; against Schulz Fig. 2b the four cases sit at -12, -16, -4 and
  -2 %, inside the record's bands.

To fix:
1. **Latent: the corrugation angle is converted to radians twice.**
   `RateBasedSegment.cpp:244` and `DistillationColumn.cpp:5599` multiply by
   pi/180, but `deg` is a registered unit (`core/Units.cpp:362`) the parser
   already converts.  `corrugationAngle 60 deg;` becomes 0.0183 rad, passes
   the 0-90 range check, and runs to exit 0 with every correlation wrong.
   Today every record writes a bare number, so no golden moves.  Remedy:
   declare the angle with its unit and drop the factor (or refuse a bare
   number).
2. The Delft branch is judged against Rocha-Bravo-Fair's 1025 Pa/m flood limit
   (`:476`, `:771-779`), and the flood message always names RBF (`:462-464`).
3. The film heat coefficient's Chilton-Colburn (alpha/D)^(2/3) (`:494`) is
   exact for RBF's Sc^(1/3) form, approximate for Delft's k_G; not announced.
4. The same Montz A3-500M is called `gauze` in the RBF cases and
   "unperforated" in the Delft cases.

## EduTools: four wrong statements, every formula dimensionally consistent

1. **Film control told backwards.**  `oneFluxManyUnitsLesson.ts:295` says
   that with the liquid film controlling "the interface sits close to the
   bulk liquid".  The page's own solve gives x_i = 0.001954 against
   x* = 0.001975 and x_b = 0.001: the interface sits at equilibrium with the
   bulk gas.
2. **The overall-coefficient panel prints a flux 27 % low.**
   `OneFluxManyUnitsTool.tsx:349` computes N = K_y (y_b - m x_b), taking
   y* = m x_b, but the default m is Seader's average chord, which does not pass
   through the origin: 0.00686 shown, 0.00945 exact (exercise 3 gives 0.00942).
3. **False claim about the engine.**  Step 4 says the resistances-in-series sum
   appears only in the first guess (`RateBasedSegment.cpp:679`); it also
   computes the per-segment H_OG and liquid-film share (`:690`, `:471`,
   `:853-855`), published as the profile column HOG (`:886`).
4. **Exercise 2 says "Antoine form"** (`oneFluxManyUnits.ts:676`, and the
   test comment `gui/tests/oneFluxManyUnits.test.ts:369`); `water.dat:96` is
   Wagner/IAPWS.

Weaker: the symbol `c` in step 2 is undefined there; Missen's Hatta equation
number appears three ways (9.2-55 / 9.2-40 / 9.2-54); two stale citations in
`docs/design/equilibrium-or-rate-based.md:51-52` (1597/1729 -> 1600/1732);
"ppm" is mole ppm and should say so; the scope text names only RBF while the
engine also takes Delft (`:457`); "a rate-based model computes the efficiency"
should say that the engine's rate-based model is a packed bed and computes an
HETP / H_OG.
