# Adsorption units and their EduTools: a double check, units included

Read-only on main at 5f51313a21, 2026-11-19 (nothing built, nothing edited),
at Vitor's request, before adding dispersion and film correlations.  Two
independent readings with file:line evidence: [engine.md](engine.md)
(fixedBedAdsorber, batchAdsorber, PSA, TSA, ion exchanger, isotherms) and
[edutools.md](edutools.md) (isotherms, batch adsorption, breakthrough).

## Engine: the physics is right; two latent unit traps

Verified:
- u is superficial everywhere and the bulk density is used consistently.
- The Danckwerts inlet, Ergun, LDF, van 't Hoff, the conservative energy
  rows and the ledger units are right.
- The numerical dispersion v dz/2 is compared with D_L = Dax/eps on the same
  interstitial basis.
- Goldens recomputed by hand: batch13 (t_st 3040.51 s, Pe 250), batch29
  (moments), batch16 (dP 106.6 Pa), batch20 (adiabatic rise 125.8 K),
  batch09, tsa01 (1.045 kW), psa01.

To fix:
1. **Loadings read with no dimension.**  `initialLoading`
   (`FixedBedAdsorber.cpp:517`, `BatchAdsorber.cpp:287`), `q_max` and `H_298`
   (`thermo/adsorbent/IsothermModel.cpp:163`, `:126`) are used as mol/kg.
   The canonical amount is kmol, so `q_max 5 mol/kg;` would run silently
   1000x small.  Every record writes a bare number today.
2. **`IonExchanger.H:50` documents `CEC 2.0 eq/L`, which the code refuses**
   (`IonExchanger.cpp:114-120`: `resinDose`).
3. **`Dax` is on the bed (superficial) basis, `Dax = eps D_L`, and nothing
   says so where it is declared.**  A textbook D_L pasted under `Dax`
   overstates dispersion by 1/eps.
4. **Thermal bed:**
   - Ergun's gas viscosity is taken at the declared T, not the cell T
     (`:1447/1455`, about 20 % low in a 400 K purge).
   - The announced thermal-wave velocity omits the adsorbed phase's heat
     capacity (`:882`, about 11 % high).
5. **Smaller items:**
   - The announced t_st assumes a clean bed.
   - The numerical-dispersion figures of batch14-16 are published but not
     pinned.
   - The `k_LDF` provenance "Glueckauf gives the order" yields 0.009 1/s
     against the 0.05 declared.
   - Particle porosity and axial heat conduction are absent.

## EduTools: seven wrong statements

1. **The counter-current balance counts the solid of every stage**
   (`batchAdsorptionLesson.ts`).  The code correctly uses V c0 = V cN + M q_1.
2. **"The solid that leaves is in equilibrium with the FEED"** is true only
   as N grows without limit.
3. **"Just as steep at the end" is false for Freundlich.**  Each decade of
   removal costs about 2x the adsorbent, against 10x for a linear isotherm.
4. **Langmuir `b` has two units in one list** (`breakthroughLesson.ts`: 1/Pa
   beside b_i in 1/bar; the engine uses 1/bar).
5. **The retention-factor caption is off by 1/eps** (`BreakthroughTool.tsx`).
   The front lags R_f/eps hold-up times, not R_f.  A test pins the false
   sentence.
6. **"About ten digits"** is about 7.6.
7. **Batch step 4 gives V in m³, but alpha = V/(MK) needs litres.**  A
   student's alpha comes out 1000x small.

Suspect: `D_ax`'s basis is never stated (as engine item 3); rho_p is
described two ways; the mesh claims are fixed at defaults while the knobs move
dz and Pe.

## Where the correlations plug in

- **Dax:** a per-species value filled at initialise from a correlation and fed
  to `rhs_`, the stability bound and the Pe/dispersion figures.  It is stored
  as eps D_L, because the correlations give the interstitial D_L.
- **k_f and resistances in series:** a new `kLDF.basis` beside `solidFilm`
  (FB:333-396).  This needs a particle-porosity datum on the adsorbent record.
- **The interface to copy is `FrictionFactorCorrelation`** (validity window,
  citation, `verify()` anchor).  `HeatTransferCorrelation` has no citation,
  and the existing Sherwood family has none of the three.
