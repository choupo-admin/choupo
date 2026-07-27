# flashComplex — the glass-box output, as it must read

The **specification of what the run prints**.  Numbers are illustrative; the
*shape* is the contract.  Nothing below is implemented.

---

## 1. The chemistry, assembled — with the reason for every activation

The student never wrote a reaction.  The closure built the system from the
components fed, and it must show its work, or the assembly is magic.

```
[chemistry] seeding the reachability closure
[chemistry]   from the feed:      water benzene ethanol N2 CO2 NH3 H2S aceticAcid CaCO3
[chemistry]   from declared phases: NH4HCO3   (solid `ammoniumBicarbonate`)
[chemistry]   master species reachable at seed: H OH Ca NH4 HCO3 HS Acetate

[chemistry] closure reached a fixed point after 3 sweeps:
            15 equilibria activated, 10 species introduced that nobody wrote

[chemistry] activation trace (why each entry is in the problem)

  water-autoprotolysis          component water declares it
  carbonicFirstDissociation     component CO2 declares it
  bicarbonateDissociation       component CO2 declares it
  ammoniumDissociation          component NH3 declares it
  sulfideFirstDissociation      component H2S declares it
  aceticDissociation            component aceticAcid declares it
  calciteDissolution            component CaCO3 declares it

  CaHCO3-formation              SHARED (chemistry/aqueousComplexes/)
      Ca+2(aq)    reachable from component CaCO3
      HCO3-(aq)   reachable from component CO2
      aqueous phase admits CaHCO3+(aq)
      -> activated: it couples two families, so it belongs to neither
         component; the closure found it, not the author

  CaCO3aq-formation             SHARED (chemistry/aqueousComplexes/)
      Ca+2(aq)    reachable from component CaCO3
      CO3-2(aq)   reachable via bicarbonateDissociation
      -> activated

  CaOH-formation                SHARED (chemistry/aqueousComplexes/)
      Ca+2(aq)    reachable from component CaCO3
      H2O         solvent of the aqueous phase
      -> activated

  ... gas-liquid: CO2 NH3 H2S N2 aceticAcid water   (each from its component)
  ... vapour:     aceticDimerisation                (component aceticAcid)
  ... solid:      calciteDissolution, ammoniumBicarbonateDissolution

[chemistry] NOT activated (present in the catalogue, unreachable here):
            56 further equilibria -- no path from this feed.  Chemistry is
            not activated because it exists globally.

[chemistry] excluded by declaration: none
```

**Rule made visible:** a reaction enters because a *path* exists from what was
fed — never because the catalogue happens to hold it.

## 2. The system, written as the course writes it

```
[chemistry] the equilibrium condition, everywhere:   sum(nu_i * mu_i) = 0

[chemistry] aqueous equilibria at 308.15 K
  (1) H2O = H+(aq) + OH-(aq)                          pK = 13.68  [measuredK]
  (2) CO2*(aq) + H2O = H+(aq) + HCO3-(aq)             pK =  6.31  [measuredK]
  (3) HCO3-(aq) = H+(aq) + CO3-2(aq)                  pK = 10.22  [measuredK]
  (4) NH4+(aq) = NH3(aq) + H+(aq)                     pK =  9.05  [measuredK]
  (5) H2S(aq) = H+(aq) + HS-(aq)                      pK =  6.94  [measuredK]
  (6) HAc(aq) = H+(aq) + Acetate-(aq)                 pK =  4.74  [measuredK]
  (7) Ca+2(aq) + HCO3-(aq) = CaHCO3+(aq)          log K =  1.09  [measuredK]
  (8) Ca+2(aq) + CO3-2(aq) = CaCO3(aq)            log K =  3.15  [measuredK]
  (9) Ca+2(aq) + H2O = CaOH+(aq) + H+(aq)         log K = -12.78 [measuredK]

[chemistry] CO2*(aq) is an AGGREGATE species:  CO2(aq) + H2CO3(aq)
            the tabulated pK1 belongs to the sum -- true H2CO3 is ~0.13 % of
            it (pKa 3.45); 3.45 + 2.89 = 6.34 recovers the tabulated 6.352

[chemistry] every equation checked before solving:
            charge balance OK (9/9), element balance OK (9/9)

[chemistry] closure: 19 aqueous unknowns
            =  9 mass action  +  6 family totals  +  1 electroneutrality
             + 2 saturation complementarities  +  1 solvent
```

Species appear in equations **only** in presentation form with the phase —
`H+(aq)`, never the internal identifier `H`.

## 3. Where each standard part came from — and whether the routes agree

```
[thermo] standard-Gibbs authority, per reaction

  reaction                        authority      cross-check
  ------------------------------  -------------  --------------------------
  water-autoprotolysis            measuredK      OK    dH 56400 vs 55840
                                                       (560 J/mol, 0.016 logK)
  bicarbonateDissociation         measuredK      OK    dH 14899 vs 14850
                                                       (49 J/mol, 0.001 logK)
  carbonicFirstDissociation       measuredK      UNAVAILABLE
      -> CO2*(aq) carries no aqueous formation datum (curationRequired)
  ammoniumDissociation            measuredK      UNAVAILABLE  (NH3aq)
  sulfideFirstDissociation        measuredK      UNAVAILABLE  (H2Saq)
  aceticDissociation              measuredK      UNAVAILABLE  (HAc)
  calciteDissolution              measuredK      OK
  ammoniumBicarbonateDissolution  speciesData    REFUSED -- see below

[thermo] cross-check coverage: 3 of 9 aqueous reactions.  The 6 unavailable
         are the quantified curation debt, not a silent pass.
```

The engine never mixes a measured K for speciation with an *incompatible*
species enthalpy for the energy balance: where both exist they are compared;
where only one exists the absence is announced.

## 4. Two refusals, both by name

**A missing standard-state datum, where the case declared the species route:**

```
[REFUSAL] ammoniumBicarbonateDissolution declares `authority speciesData`,
          but NH4HCO3(ammoniumBicarbonate) carries no standard formation
          datum (species record: status curationRequired, required
          ( dGf_298 dHf_298 s_298 )).

          The reaction cannot be built from species data.

          Remedies, both explicit:
            * curate the solid's formation datum from a primary, or
            * declare `authority measuredK` and accept, in writing, the
              order-of-magnitude constant logK25 0.25 (~220 g/L solubility).

          The engine will NOT quietly fall back to the weaker route.
```

**An apparent-component basis that cannot span the state** (§6):

```
[REFUSAL] cannot project the converged state onto the requested
          apparent-component basis.

          requested: ( water  NaCl  K2SO4  CaCO3 )
          conserved: Na 2.0  K 2.0  Cl 2.0  SO4 1.0  Ca 0.5  C 0.5 ... mol/h

          The basis cannot span the conserved elemental inventory: the
          converged state contains Ca paired with SO4 (0.31 mol/h of the
          sulfate is charge-balanced by calcium), and no declared component
          carries both.

          Add an independent representational component containing Ca and
          SO4 (e.g. CaSO4), or drop the apparent projection -- it is a
          REPORTING view, and the physics does not need it.
```

## 5. The stream, at three levels

A converged stream file (`converged/aqueous`), showing what each level is
**for**.  Note the correction to the naive form: elements are the
**invariant that balances**, not the carrier — C, H and O cannot tell benzene
from ethanol from acetate, so identity must travel as species.

```
/* converged/aqueous -- written by the solver */

//  (1) WHAT TRAVELS.  The physical state, per phase, in species.
//      Split by role, because they are not the same kind of thing:
//        * reacting: the network re-solves this distribution downstream
//          from its element+charge totals -- here it is a warm start;
//        * passThrough: no equilibrium relates these to anything, so the
//          numbers ARE the answer and must survive the boundary intact.
speciesMolarFlows
{
    reacting
    {
        H         1.02e-5;   OH        3.11e-4;
        Ca        4.40e-3;   CaHCO3    9.10e-4;   CaCO3aq  2.20e-4;  CaOH  1.1e-8;
        NH4       5.31;      NH3aq     0.69;
        HCO3      4.02;      CO3       1.55e-3;   CO2aq    0.11;
        HS        0.83;      H2Saq     0.17;
        HAc       0.06;      Acetate   1.94;
        // unit: kmol/h
    }
    passThrough
    {
        water    58.9;   ethanol  1.83;   N2aq  2.1e-3;
    }
}

//  (2) WHAT MUST BALANCE.  The invariant, written for audit -- every unit
//      boundary checks it, and it is what a mixer adds.  It is NOT what
//      identifies the molecules.
materialInventory
{
    elementMolarFlows { H 121.7;  O 71.4;  C 8.06;  N 6.00;  S 1.00;  Ca 0.0055; }
    netCharge         0;                       // exact, not a residual
    enthalpy          -1.7392e+07 kJ/h;
}

//  (3) WHAT THE HUMAN PUT IN.  Historical, never confused with the state:
//      the solution has no memory of which bottle it came from.
inputLedger
{
    componentMolarFlows
    {
        water 60.0;  benzene 20.0;  ethanol 8.0;  N2 5.0;  CO2 4.0;
        NH3 6.0;     H2S 1.0;       aceticAcid 2.0;  CaCO3 0.5;
    }
    note "as fed to flash01; the outlet composition is NOT this ledger";
}
```

## 6. The apparent-component projection — optional, declared, reporting only

Never automatic.  A case that wants it asks for it:

```
reporting
{
    apparentComponentBasis ( water  NH3  CO2  aceticAcid  H2S  CaCO3  NH4HCO3 );
}
```

and the output says exactly what it is:

```
[report] apparent-component projection, FOR REPORTING ONLY
         basis: ( water NH3 CO2 aceticAcid H2S CaCO3 NH4HCO3 )

         water 58.9   NH3 6.00   CO2 4.15   aceticAcid 2.00
         H2S 1.00     CaCO3 0.0055   NH4HCO3 0.00

         This representation is NOT unique and does not alter the physical
         species inventory.  With c cations and a anions the salt pairing has
         (c-1)(a-1) degrees of freedom -- here 0 (one cation family per
         anion), so this projection happens to be unique; a Na/K x Cl/SO4
         brine would have 1, and a full brine 9.
```

**No universal pairing convention.**  Choupo never silently decides that a
solution "is" NaCl + K₂SO₄ rather than KCl + Na₂SO₄ — because in solution it
is neither.

## 7. The result

```
[flash]  phases formed
         vapour   12.31 kmol/h    aqueous  61.24    organic  25.83
         calcite   0.0055          NH4HCO3  0.00  (undersaturated, SI -0.42)

         pH 8.71
         SI(calcite)  0.000   -> present, at saturation (complementarity)
         SI(NH4HCO3) -0.42    -> absent, amount exactly 0

[flash]  reaction affinities at the solution: max |sum(nu*mu)| = 3.1e-9 J/mol
[flash]  charge balance residual: 2.2e-16 (exact to round-off)
```

The saturation indices are the complementarity made visible: a solid is
present **iff** its SI is zero; an absent solid shows its distance from
saturation, so the student sees *why* it did not form.
