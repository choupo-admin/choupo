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
  CO2aq-formation               reachable from component CO2
  H2CO3-formation               reachable via CO2aq-formation  [derived]
  CO3-formation                 reachable from component CO2
  NH3aq-formation               reachable from component NH3
  H2Saq-formation               reachable from component H2S
  HAc-formation                 reachable from component aceticAcid
  calcite dissolution           component CaCO3, solidPhases

  CaHCO3-formation              cross-family (chemistry/)
      Ca+2(aq)    reachable from component CaCO3
      HCO3-(aq)   reachable from component CO2
      aqueous phase admits CaHCO3+(aq)
      -> activated: it couples two families, so it belongs to neither
         component; the closure found it, not the author

  CaCO3aq-formation             cross-family (chemistry/)
      Ca+2(aq)    reachable from component CaCO3
      CO3-2(aq)   reachable via bicarbonateDissociation
      -> activated

  CaOH-formation                cross-family (chemistry/)
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
  (2) CO2(aq) + H2O = H+(aq) + HCO3-(aq)              pK =  6.31  [measuredK]
  (2b) H+(aq) + HCO3-(aq) = H2CO3(aq)             log K =  3.47  [derived]
  (3) HCO3-(aq) = H+(aq) + CO3-2(aq)                  pK = 10.22  [measuredK]
  (4) NH4+(aq) = NH3(aq) + H+(aq)                     pK =  9.05  [measuredK]
  (5) H2S(aq) = H+(aq) + HS-(aq)                      pK =  6.94  [measuredK]
  (6) HAc(aq) = H+(aq) + Acetate-(aq)                 pK =  4.74  [measuredK]
  (7) Ca+2(aq) + HCO3-(aq) = CaHCO3+(aq)          log K =  1.09  [measuredK]
  (8) Ca+2(aq) + CO3-2(aq) = CaCO3(aq)            log K =  3.15  [measuredK]
  (9) Ca+2(aq) + H2O = CaOH+(aq) + H+(aq)         log K = -12.78 [measuredK]

[chemistry] the carbonate ladder is SPLIT: reaction (2) is the AGGREGATE the
            experiment measures (no method separates CO2(aq) from H2CO3), and
            (2b) is DERIVED from it -- 6.352 + (-2.886) = 3.466.  True H2CO3
            is ~0.13 % of dissolved carbon and a MODERATELY STRONG acid
            (pKa 3.47); the famous pK1 6.35 is weak only because almost none
            of the CO2 has hydrated.  That hydration is the kinetic
            bottleneck of CO2 absorption (k ~ 0.04 1/s at 25 C).

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
  CO2aq-formation                 (measured)     UNAVAILABLE
      -> CO2(aq) carries no aqueous formation datum (curationRequired)
  H2CO3-formation                 derivedFrom-   n/a: its parents are the
                                  Reactions      check (6.352 - 2.886)
  NH3aq-formation                 (measured)     UNAVAILABLE  (NH3aq)
  H2Saq-formation                 (measured)     UNAVAILABLE  (H2Saq)
  HAc-formation                   (measured)     UNAVAILABLE  (HAc)
  calcite dissolution             (measured)     OK
  ammoniumBicarbonate             --             REFUSED: no authority is
                                                 declarable, see below

[thermo] `authority` is printed only where it was WRITTEN -- twice.  A record
         carrying its own measured logK25 got that number from a measurement
         of its own reaction; there is nothing to declare.

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

A converged stream file (`converged/bottoms`), showing what each level is
**for**.  Two corrections are folded in, and the second one was mine.

**Elements are the invariant that balances, not the carrier.** C, H and O
cannot tell benzene from ethanol from acetate, and no equilibrium relates
them, so identity must travel as species. That correction stands.

**The split is not `reacting` / `passThrough`.** That was the replacement I
proposed, and it repeats the same family of error: it conflates two
independent axes. Ethanol does not react — and it partitions between three
phases, so its distribution *must* be re-solved downstream. Calling it
*pass through* invites someone to carry it intact and never re-solve it. The
only true pass-through would be a species confined to one phase with no
chemistry, and not even N₂ is that, because it dissolves.

The axis that matters is **conserved vs re-solved**:

* **what is conserved** — the totals (per component, or per element and
  charge, according to whether the family is reactive): these cross the
  boundary as *data*;
* **what is re-solved** — the distribution over species **and over phases**:
  this crosses as a *warm start*, always.

Ethanol has a conserved total and a re-solved distribution. An ion has a
conserved family total and a re-solved distribution. Neither is pass-through.

```
/* converged/aqueous -- written by the solver */

//  (1) WHAT IS RE-SOLVED.  The physical state, per phase, in species -- a
//      WARM START for the next unit, never an answer to be carried intact.
//      Everything here is re-solved downstream: the ions because the network
//      redistributes them, the neutrals because they re-partition between
//      the phases.  The distinction that matters is against level (2), which
//      is conserved; it is not a distinction WITHIN this level.
speciesDistribution
{
    aqueous
    {
        H         1.02e-5;   OH        3.11e-4;
        Ca        4.40e-3;   CaHCO3    9.10e-4;   CaCO3aq  2.20e-4;  CaOH  1.1e-8;
        NH4       5.31;      NH3aq     0.69;
        HCO3      4.02;      CO3       1.55e-3;   CO2aq    0.11;
        HS        0.83;      H2Saq     0.17;
        HAc       0.06;      Acetate   1.94;
        // unit: kmol/h
    }
        water    58.9;   ethanol  1.83;   N2aq  2.1e-3;
    }
    organic
    {
        benzene  19.4;   ethanol  6.11;
    }
    calcite  { CaCO3  0.31; }
    //  ethanol appears in BOTH liquids.  That is exactly why there is no
    //  `passThrough` bucket: a species that does not react still moves.
}

//  (2) WHAT IS CONSERVED.  The invariant, written for audit -- every unit
//      boundary checks it, and it is what a mixer adds.  This is the level
//      that crosses as DATA.  It is NOT what identifies the molecules.
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

The block below is the **design sketch** — what the case was specified to
print, written before it ran. The numbers in it are illustrative and are not
the run's: the case now converges at V/F 0.0635 and pH 8.341 with NH4HCO3 still
withheld (its equilibrium is uncurated, see `constant/components/NH4HCO3.dat`),
so no SI is quoted for it. Read `system/controlDict` for the answer of record.

The last line was a specification and is now behaviour: every speciation prints
its converged charge balance, labelled by whether electroneutrality was imposed
(pH solved) or merely reported (pH given), and `bin/curate/check_charge_balance.py`
gates it.

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
