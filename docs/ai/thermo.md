# thermoPhysPropDict — declaring the thermophysical system

A case's `constant/thermoPhysPropDict` declares the case's whole
thermophysical system: the components, the equilibrium **formulation** (which
K-value structure the VLE runs on), the model in each phase slot, the caloric
routes, and any transport correlations.  It always opens with its record
identity:

```
recordType    thermophysicalPropertySystem;
schemaVersion 2;

components       ( benzene  toluene );

equilibrium
{
    formulation gammaPhi;

    liquid
    {
        activityModel ideal;        // gamma = 1 identically (Raoult)
        standardState pureLiquid;
    }

    vapour
    {
        fugacityModel idealGas;
    }
}
```

That is a complete system for an ideal flash.  Everything is DECLARED — the
formulation, the standard state, the vapour route — even when the choice is
the obvious one.  There are no defaults to assume and no hidden fallbacks: a
shape the builder does not recognise gets a named refusal, never a guess.

## components

A list of component names.  In a **sealed** case (the shipped tutorials) every
name resolves to a record in the case's own `constant/components/<name>.dat`,
verified by `constant/propertyManifest`; in an unsealed case names may also
resolve from the installation catalogue `data/standards/components/` (see
`components.md` for the inventory).

```
components ( water  ethanol  CO2 );
```

Order matters: it sets the indexing the solver uses internally.

## The formulations — the `formulation` keyword IS the VLE world

The `equilibrium.formulation` keyword selects which of the five K-value
structures the whole VLE runs on:

| `formulation` | World | K-value | Reference tutorial |
|---|---|---|---|
| `gammaPhi` | **γ-φ** | `K_i = γ_i·Psat_i / (φ_i·P)` | `flash02_ethanol_water` (NRTL) |
| `gammaGamma` | **γ-γ (liquid-liquid)** | `K_i = γ_i^II / γ_i^I` — TWO OR MORE liquid phases, one γ surface each, from the SAME activity model | `vlle01_waterButanol` (UNIQUAC) |
| `diluteSolution` | **dilute solution** | solvent on Raoult; each solute on the full Krichevsky-Kasarnovsky / Krichevsky-Ilinskaya Henry form `y φ_V P = x γ* H(T) exp[v_∞(P−Ps)/RT]` | `flash08_co2_water_package` |
| `phiPhi` | **φ-φ** | `K_i = φ_i^L / φ_i^V` — the SAME cubic's two roots | `flash09_n2ch4_stryjek` |
| `electrolyteGammaPhi` | **aqueous electrolyte** | ionic activity + osmotic coefficients on the aqueous-ion reference | `pitzer02_nacl_package` |

`gammaGamma` is the formulation that carries an explicit **phase list**: the
liquid phases are named (`liquidPhases ( { name waterRich; } { name
butanolRich; } );`, or the uniform `phases ( ... )` list, never both — two
authorities on one phase set refuse), and each takes its γ from the one
declared `liquid.activityModel`.  That is the "one Gibbs surface per phase"
rule below, seen from the liquid side: two liquids priced by two different
activity models would be two surfaces pretending to be one equilibrium.

Two hard rules ride on this:

* **One Gibbs surface per phase.**  In `phiPhi` both phase slots take their
  fugacity from the ONE declared `equationOfState` (`fugacityRoute
  equationOfState; root liquid|vapour;`) — two different cubics, or a cubic
  liquid against an ideal-gas vapour, are two Gibbs surfaces pretending to be
  one VLE and the builder refuses at assembly.
* **The world is announced.**  The run log's `[builder]` lines name the
  assembled formulation, each phase's model and reference rung, and every
  parameter file engaged.

### `gammaPhi` — activity liquid, fugacity vapour

```
equilibrium
{
    formulation gammaPhi;

    liquid
    {
        activityModel
        {
            model NRTL;
            binaryParameters            // the dict OWNS the numbers (inline)
            {
                ethanol-water
                {
                    i ethanol;  j water;
                    a_ij -0.8009;  b_ij  246.18;
                    a_ji  3.4578;  b_ji -586.0809;
                    alpha 0.30;
                }
            }
        }
        standardState pureLiquid;
    }

    vapour { fugacityModel idealGas; }
}
```

A parameter block may instead point at a catalogue file:

```
binaryParameters
{
    // Sander (2015) compilation, CC-BY
    CO2-water { source "data/standards/parameters/Henry/CO2-water.dat"; }
}
```

Every declared file is loaded and verified at assembly — a
declared-but-missing file REFUSES loudly, naming the entry to add.

Liquid `activityModel` choices:

| `model` | What it is | When to use |
|---|---|---|
| `ideal`  | γᵢ = 1 (Raoult).  Trivial baseline. | Air, dilute, hydrocarbons-only. |
| `NRTL`   | Renon & Prausnitz (1968).  Handles LLE. | Polar non-ideal mixtures (ethanol/water, alcohols, …). |
| `UNIQUAC`| Abrams & Prausnitz (1975). | Alternative to NRTL where UNIQUAC pairs exist. |
| `Wilson` | Cheaper than NRTL but **cannot represent LLE** (structural). | Mild non-ideality, no expected liquid split. |
| `UNIFAC` | **Predictive** — γ from molecular GROUPS, NO fitted binary parameters (original UNIFAC; Fredenslund 1975 / Hansen 1991). | A binary with no regressed data: get a first VLE from structure alone, then SEE the error vs data.  Weak for alcohol-water (predicts the azeotrope but misplaces it — original-UNIFAC's known limit). |
| `cosmoSAC` | **Predictive** — γ from each component's COSMO σ-profile (Lin & Sandler 2002, NIST constants).  Multi-set: `source <setName>;` picks a named profile set. | A binary with no pairs where the components carry `cosmo {}` data. |

`UNIFAC` takes no pairs.  The group decomposition is COMPONENT data, resolved
from each component's own `.dat` — one home, never re-declared per case:

```
// each component's .dat carries its decomposition:
groups
{
    unifac ( { group CH3; count 1; } { group CH2; count 1; } { group OH; count 1; } );
}
```

An inline `groups {}` block inside the activity model is refused (it would let
the same molecule change structure per case); a pedagogical alternative
decomposition goes in a case-local component overlay
(`constant/components/<name>.dat`).  A UNIFAC system whose participating
component lacks a decomposition is an ERROR with the remedy — never a silent
γ = 1.

**Pair coverage (no silent crutch — REVISED 2026-08-11 by the
problem-divergence contract; this paragraph said "defaults to ideal" until
2026-08-23, which had been false for twelve days).**  NRTL/UNIQUAC/Wilson
need a pair for EVERY binary (N components ⇒ N(N−1)/2 pairs).  An uncovered
pair is **REFUSED** — running ideal where the case declared NRTL answers a
different question than the one posed — unless the case AUTHORISES the
approximation at the top level of its `thermoPhysPropDict`
(`approximations { idealBinaryPair { pairs ( a-b ); reason "…"; } }`
— the refusal message prints the paste-ready block, and the block sits
beside `idealMolecularVLE`, a statement about the CASE and never a model
parameter).  An authorised ideal
pair runs, is announced, and rides the result as a recorded divergence
(above the KPIs, never buried).  The GUI's pair-coverage matrix colours
every pair by where it resolved.
Resolution order for an uncovered pair: the owning node's
`constant/parameters/<MODEL>/<i>-<j>.dat` → the case root's → the standard
catalogue `data/standards/parameters/<MODEL>/` → the private, gitignored
`data/local/` tier (announced `[local] UNVERIFIED`).

### `diluteSolution` — Henry's law with a declared solvent

WHO dissolves in WHAT is declared structurally, not by flags:

```
equilibrium
{
    formulation diluteSolution;

    liquid
    {
        solvent
        {
            component     water;
            standardState pureLiquid;          // the Raoult rung
        }
        solutes
        {
            components    ( CO2 );
            standardState infiniteDilution;    // the Henry rung
            solutionModel henryDilute;
            binaryParameters
            {
                // Sander (2015) compilation, CC-BY
                CO2-water { source "data/standards/parameters/Henry/CO2-water.dat"; }
            }
        }
    }

    vapour { fugacityModel idealGas; }
}
```

Used by absorbers/strippers and aqueous gas absorption (CO2, NH3, O2, H2S,
SO2, CH4, Cl2, HCl in water all ship as Henry pairs).

### `phiPhi` — one cubic, both phases

```
equilibrium
{
    formulation phiPhi;

    equationOfState
    {
        model      SRK;                        // or PengRobinson (the phi-phi word; PR78 since 2026-10-21)
        mixingRule vanDerWaalsOneFluid;
        binaryInteractions
        {
            // Knapp et al., DECHEMA Chemistry Data Series VI (1982)
            N2-CH4 { source "data/standards/parameters/SRK/N2-CH4.dat"; }
            // a kij SET: every pair of a mixture, the PPR78 / E-PPR78 group
            // contribution evaluated ONCE at a declared T by the `ppr78Kij`
            // props op and written into the case (recordType
            // eosBinaryInteractionSet; DEV.md 4c C123, route P)
            ppr78 { source "constant/parameters/PengRobinson/ppr78_322K.dat"; }
            // an INLINE value is accepted ONLY under regression, the varying operation named
            // (fitParameters varies it per iteration); a finished fit is a record
            // (recordType eosBinaryInteraction) carrying its verdict -- a record
            // whose verdict is not `validated` is ANNOUNCED by every run that uses it
            CO2-methanol { i CO2; j methanol; kij 0.0; variedBy fitParameters; }
        }
    }

    liquid { fugacityRoute equationOfState; root liquid; }
    vapour { fugacityRoute equationOfState; root vapour; }
}

caloric
{
    energyBasis elementsDatum;
    liquid { departureRoute equilibriumEquationOfState; root liquid; }
    vapour { departureRoute equilibriumEquationOfState; root vapour; }
}
```

The cubics (SRK, PR) deliver BOTH roots — `phiLiquid` is the smallest
physical root above the co-volume.  `idealGas` refuses `phiLiquid` (it can
never fake a liquid root), so it is never a legal liquid slot.  No
`binaryInteractions` → `kij = 0`, announced (predictive-degraded;
near-critical splits will be off).  SRK/PR read each component's `Tc`, `Pc`,
`omega` — no model-specific data files.

In a `gammaPhi` system a cubic may still serve the VAPOUR slot alone
(`vapour { fugacityModel SRK; }`) — that is a γ-φ world with a real-gas φ,
not φ-φ.

### `electrolyteGammaPhi` — aqueous electrolytes

```
equilibrium
{
    formulation electrolyteGammaPhi;    // aqueous electrolyte x ideal vapour

    aqueous
    {
        solvent            water;       // the stream carries the salt as a
                                        //   component; its record's
                                        //   dissociatesTo names the ions
        activityModel { model Pitzer; } // single-salt VLE adapter
        compositionBasis molality;
    }

    vapour { fugacityModel idealGas; }
}

caloric
{
    energyBasis elementsDatum;
    aqueous { enthalpyRoute ionicReferencePlusExcess; }  // aq inf-dilution ion
    vapour  { enthalpyRoute idealGasCp; }                //   datum + L_phi
}
```

The stream carries the SALT (the flowsheet/component basis); the model
activates its ions from the component's `dissociatesTo` and the ion records
in `species/`.

**Temperature validity of an electrolyte pair (2026-11-12).**  A Pitzer or
eNRTL pair record states the temperatures its parameters are good for in
`provenance { validity { temperature { min 298.15 K; max 298.15 K; } } }`.
A record with no declared span is read as 298.15 K (the temperature of its
data), except a Pitzer record that carries temperature functions/slopes,
whose window is `TvalidLo`-`TvalidHi` (default 273.15-573.15 K).  Evaluated
outside it, EVERY route (the `pitzerActivity` op, the package route the units
use, the `pitzerHMW` speciation route, and the eNRTL package) prints ONE
`[pair-span]` line per pair per run and records it in the caveat block; no
number changes.  Two things to tell a user: 96 of the 99 Pitzer pair records
have no temperature dependence (only the Debye-Hueckel slope follows T), and
the eNRTL temperature rule is the engine's own `tau(T) = tau(25 C) x 298.15/T`,
NOT a fitted law -- against Archer (1992) NaCl it is off by tens of per cent at
273 K and 373 K at 3-6 mol/kg while Pitzer stays within 2.1 % (Theory Guide,
eNRTL "Temperature dependence").  For NaCl-water off 25 C use Pitzer.

**Boron in seawater and borax brines: the borate set of Felmy & Weare (C198, 2026-11-13).**
Under `pitzerHMW` the catalogue carries boric acid (`H3BO3`, neutral), the
orthoborate (`BOH4`), two polyborates (`B3O3OH4`, `B4O5OH4`) and the Ca / Mg
borate ion pairs (`CaBOH4`, `MgBOH4`), with their Pitzer terms read from
Felmy & Weare, Geochim. Cosmochim. Acta 50 (1986) 2771, Tables 3-5 (25 C,
every record names table and page): 8 binary pairs, 8 theta + 3 psi, 5 lambda
(H3BO3 with Cl, SO4, B3O3OH4, Na, K) and 2 zeta (H3BO3-H-Cl, H3BO3-Na-SO4).
Use them like any ion: list `H3BO3` in `analyticalTotals` and put the formation
records in the network (`networkScope restricted; network ( water-dissociation
BOH4-formation CaBOH4-formation MgBOH4-formation );`: the posture of the
parameterisation is the major ions UNPAIRED and the borate pairs explicit).
The Pitzer route's constant for `BOH4` is -9.239; the catalogue's
`BOH4-formation` is the Davies route's (-9.24 plus an enthalpy), so a Pitzer
case carries its own `constant/chemistry/BOH4-formation.dat` (see
`borate01_felmyWeare`).  Tell a user: 25 C only (no term has a temperature
dependence; a run away from 298.15 K is announced); the formation constants are
the public-domain databank's (they are derived from the mu0/RT of the two papers' tables and agree with the databank to 4e-4 in log K); no
polyborate-Mg or -Ca interaction exists in the paper; no borate solid is
shipped.  Seawater: the case anchors the free boric acid against Dickson (1990) Table 3,
ln(K*/m0) = -19.7556 (total scale, molality, +-0.004); the engine is 0.044 higher
(0.85 % in m_H3BO3), outside the paper's uncertainty and inside the 1.2 % tolerance;
partly independent.  Evidence: `data/curation/batches/boron_c198/readings.tsv`; regenerate
the records with `bin/curate/boron_c198.py`.  Theory Guide, section "Borate in
the HMW model".

**Caustic soda to 50 wt %: `model OlssonNaOH;` (C377 b, 2026-11-12).**  The
Na-OH Pitzer pair is fitted to Parker's heats of dilution up to 6 mol/kg
(19 wt %) at 25 C.  For concentrated caustic (an evaporator to 50 wt %, 25
mol/kg) select `activityModel { model OlssonNaOH; }` in the same
`electrolyteGammaPhi` system: the water activity (boiling-point rise) and the
heat of dilution L_phi come from the correlations of Olsson, Jernqvist & Aly,
Int. J. Thermophys. 18 (1997) 779 (vapour pressure and enthalpy, 0-200 C,
water mass fraction 0.2-1), record
`data/standards/parameters/OlssonNaOH/NaOH-water.dat`.  Below 4 mol/kg it
is the Na-OH Pitzer pair, blended to the correlation by 6 mol/kg.  It
refuses any salt but NaOH and any solvent but water.  It announces, once per
property, a point outside the paper's windows, and at the evaporator's
concentrate the Gibbs-Helmholtz gap between its two correlations when that
gap exceeds the paper's 2.15 kJ/kg (it does above ~100 C and 40 wt %: the
paper's enthalpies there rest on extrapolated heat capacities).  Tell a user
two things: off 25 C the Pitzer pair's L_phi is an extrapolation and sits
2-11 kJ/mol below this model at 4-6 mol/kg, 60-200 C; and above 100 C the
package still prices the water itself on a 75.5 J/mol/K liquid Cp fitted
to 373 K (about -34 kJ/kg of water at 200 C).  Bench:
`tutorials/props/electrolyte/olsson01_naoh_high_concentration`
(`electrolyteActivity` with a `table { massFractions (...); temperatures
(...); file ...; }` block: a_w, exact and linearised BPE, L_phi, chart
enthalpy, Gibbs-Helmholtz gap); evaporator:
`tutorials/steady/evaporation/evaporator11_naoh_olsson_50wt`.  Theory Guide
`sec:olsson-naoh`.

**The evaporator's boiling-point rise is exact (C377 b).**  With an
electrolyte package the evaporator solves a_w(m,T_b) Psat_w(T_b) =
Psat_w(T_b - BPE) by Newton on the package's own Psat (it used the
linearised -(R T_b^2/dHvap) ln a_w, which overstates a 40 K rise by 6-11 K
at 50 wt % NaOH).  Theory Guide `sec:evap-exact-bpe`.

**Temperature validity of a molecular pair (NRTL, Wilson, UNIQUAC; PO-01..03, 2026-11-12).**
A catalogue pair outside its declared span prints ONE `[pair-span]` line per pair per run
and is recorded in the caveat block; no number changes.  Three rules: (i) a pair is "used"
when both components are present, except in `activityCoefficients`, whose subject is the
value at exactly the composition given -- a component at zero is the infinite-dilution
coefficient and the pair is announced when either component is present; (ii) a
bubble-point search's advisories at the temperatures it VISITS (its start is the
mole-weighted normal boiling point) are filed as the solver's path, and only the converged
state speaks as a caveat about the answer; (iii) a record that declares NO span (three
UNIQUAC records of Popken et al.) says so when it is used -- silence there would read as
"inside the span".

**Weak organic acids (carboxylic) in aqueous chemistry** (C372, 2026-11-12).
Families that exist, each a neutral master plus its ions and one ionisation record
per ion (declare the neutral master, or the fully dissociated ion, as the analytical
total with `totalsBasis stoichiometric; pH solve;`):
acetic (`Acetate`, `HAc-formation`), formic (`Formate`, `HFo-formation`, logK and dH
DERIVED from the NBS rows: theoryGuide `sec:carboxylic-ionisation`), tartaric
(`H2Tart`/`HTart`/`Tart`, Goldberg 2002 Table 7.63), **citric** (`H3Cit`/`H2Cit`/`HCit`/`Cit`;
Goldberg 2002 Table 7.22; ion hfAq Kochergina 2006), **malic** (`H2Malic`/`HMalic`/`Malic`,
Eden & Bates 1959, racemic acid; note `Malic*`, not `Mal*`), **lactic** (`HLac`/`Lac`, Nims &
Smith 1936), **succinic** (`H2Succ`/`HSucc`/`Succ`), **oxalic** (`H2Ox`/`HOx`/`Ox`),
**maleic** (`H2Male`/`HMale`/`Male`), **fumaric** (`H2Fumar`/`HFumar`/`Fumar`, Miller & Smith-Magowan 1990 Table 6),
**glycolic** (`HGlyc`/`Glyc`, Miller Table 6; formation data from Shock 1995 since C376).  C373 (2026-11-12) put formation data on the ions
of succinic, fumaric, malic and lactic acids from Miller & Smith-Magowan 1990 (`hfAq`, and `sAq` for succinate and
fumarate; derived from the acid's aqueous enthalpy plus the printed step enthalpies, theoryGuide
`sec:evaluated-ionisation-families`) and built the crystal components `succinicAcid`, `fumaricAcid`, `malicAcid` (d,l)
and `lacticAcid` with their heat-of-solution pairs.  The citrate family keeps Kochergina's ions; maleate, oxalate,
glycolate and tartrate are unchanged (maleate has none, oxalate NBS, glycolate from Shock 1995 since C376, where the crystal route closes).
The neutral masters carry no `hfAq` (their datum is component + solution pair); a balance that needs an ion
without one refuses by name.  No component carries a Cp or an entropy.  Malonic, gluconic, ascorbic,
gallic, propionic, butyric and benzoic acids have no ionisation record.  Inorganic ladders from Goldberg et al. 2002 (C373 phase 2): **pyrophosphate**
(`H4P2O7`/`H3P2O7`/`H2P2O7`/`HP2O7`/`P2O7`, navigation family `phosphate`), **arsenate** (`H3AsO4`/`H2AsO4`/`HAsO4`/`AsO4`),
**sulfite** (`H2SO3`/`Bisulfite`/`Sulfite`) and **hydrazine** (`N2H6`/`N2H5`/`Hydrazine`); ionisation records from
Goldberg.  Formation data (C376, route 1, NBS tables Wagman et al. 1982, read from page images): H2PO4, HPO4, all
five pyrophosphates, H2SO3, H3AsO4, AsO4, Hydrazine, N2H5 and the methylamine pair carry `hfAq`/`sAq`; the pyrophosphate ladder
and the two new arsenic species are ONE scale from the evaluated steps (the NBS rows disagree with Goldberg beyond the
Gibbs-identity tolerance of `check_logk_crosscheck`, both readings are tabulated in
`data/curation/batches/species_c373/formation_compare.tsv`); `N2H6` (no NBS row) still refuses an energy balance by name.  Carbonate, phosphate, hydrogensulfate, ammonia and borate keep their PHREEQC records (compared in the design note;
hydrogensulfate's ionisation enthalpy is 6.3 kJ/mol off Goldberg's).  Case: `inorganicLadders01_goldberg`.
Phase 3 (C373): **amines and amino acids** -- master = the compound AS WEIGHED (the base or the zwitterion), so a case
declares it directly and HCl or NaOH is the titrant: `Tris`/`HTris`, `TEOA`/`HTEOA` (triethanolamine), `TEA`/`HTEA`
(triethylamine), `AMP`/`HAMP`, `AMPD`/`HAMPD`, `DEA`/`HDEA`, `MEA`/`HMEA`, `MeNH2`/`HMeNH2`, `Piz` (piperazine: `HPiz`,
`H2Piz`), `Imz`/`HImz`, `MImz`/`HMImz`, `NEM`/`HNEM`, `GlyAmd`/`HGlyAmd`, glycylglycine `HGlyGly` (`H2GlyGly`, `GlyGly`),
triglycine `HGly3`, histidine `HHis` (`H3His`, `H2His`, `His`), cysteine `H2Cys`, and the amino acids with formation data
from Miller & Smith-Magowan 1990: glycine `HGly` (`H2Gly`, `Gly`), alanine `HAla`, aspartic `H2Aspt` (`H3Aspt`, `HAspt`,
`Aspt`), glutamic `H2Glu` (`H3Glu`, `HGlu`, `Glu`); zwitterions carry the printed aqueous enthalpy and entropy; crystal components
`glycine`, `alanine` (L), `asparticAcid`, `glutamicAcid` with heat-of-solution pairs.  The neutral amine species and the
volatile component of the same name (monoethanolamine, diethanolamine, triethanolamine, triethylamine, methylamine,
piperazine) are two identities, not linked by any gas-liquid record.  Case: `aminoBuffers01_tris_glycine`.
C376 route 2a: the four histidine species (`H3His`..`His`) and the four cysteine species (`H3Cys`..`Cys`) carry `hfAq`/`sAq` from
Amend & Helgeson 1997 Table 1 (kcal x 4.184; histidine on Goldberg's steps to 0.7 kJ/mol, cysteine's differ by up to 6.9 and the family is
held at tolerance 7.0, both stated in the design note); glycine, alanine, aspartic and glutamic acids keep Miller's values (Amend's
compared, differences listed); glycylglycine and triglycine have no formation datum in any work in hand.
C376 route 2b (Shock 1995, scan read from images): propionic, n-butyric, benzoic, malonic and glutaric acids are new ladders
(`HPropn`/`Propn`, `HBut`/`But`, `HBenz`/`Benz`, `H2Maln`/`HMaln`/`Maln`, `H2Glut`/`HGlut`/`Glut`; the neutral master carries its own `hfAq`/`sAq`);
glycolic acid carries DfH -648.06 kJ/mol (the crystal route) and lactic acid/lactate an entropy.  An entropy or an anion enthalpy the
paper marks as estimated has a per-value `provenance { sAq { origin estimated; method ...; } }` block in the record. A run that CONSUMES
such a datum (hfAq in the aqueous ion reference of a salt; cpAq on the constant ion-Cp tier) prints one `[estimate] species '<name>'` line per
species and datum and records it in the result advisories (category `provenance`, so the caveat block and the result's provenance carry it);
reading a record is not consuming it, and sAq has no consumer yet. Origin words that mean "not measured": estimated, predictive, assumed,
placeholder. Witness `estimatedSpecies01_announced`, gate `check_estimated_species_announced`.
C376 route 4 (Alberty 2003, Table 3.2, read from images): glycylglycine (`H2GlyGly`/`HGlyGly`/`GlyGly`) carries DfH -734.25 kJ/mol and an
entropy-equivalent for the zwitterion from DfG and DfH (CODATA element entropies), the ions by Goldberg's steps.  Alberty's other families are
compared against the catalogue and not entered (citrate differs by 8 to 13 kJ/mol from Kochergina's; Alberty's phosphate and pyrophosphate differ from
the NBS rows the catalogue keeps; malate has a blank DfH); the table has no entropy column and no blank is ever filled from another work.
Phase 4 (C373): **laboratory buffers**, every other section of Goldberg 2002 (ACES, ADA, AMPSO, APSA, barbital, BES, Bicine,
Bis-tris, Bis-tris propane, cacodylate, CAPS, CAPSO, CHES, diglycolate, 3,3-dimethylglutarate, DIPSO, glycerol 2-phosphate,
HEPES, HEPPS, HEPPSO, 2-mercaptoethanol, MES, MOPS, MOPSO, phthalate, PIPES, POPSO, TAPS, TAPSO, TES, Tricine): species
`H<acronym>` (the zwitterion or acid, the master) and `<acronym>` (the anion), `H2<acronym>` for a cationic acid; pK, dH and
the evaluation grade, NO formation data (the compilation prints none), the printed dCp not carried.  CABS, HEPBS, MOBS
and TABS have no evaluated data and are absent.  Case: `goodsBuffers01_hepes_mes` (HEPES and MES at 25 and 37 C).  Inventory, readings,
consistency checks and the works still missing: `docs/design/organic-acids-in-the-catalogue.md` and
`docs/design/species-from-evaluated-compilations.md`; the records are written by `bin/curate/species_c373.py` from
`data/curation/batches/species_c373/*.tsv` and held by `check_species_c373`.
Cases: `volatileAcids01_acetic_formic`, `citricAcid01_speciation`, `wineAcids01_tartaric_malic`.

**The REACTIVE shape** (a speciation network + volatiles, as in the
brine-CO₂ and sour-water flashes) declares its IONIC rung inside
`aqueous {}` and the engine serves what its speciation kernel serves:

```
    aqueous
    {
        activityModel { ionic davies; }      // charge-only teaching rung
        // or:
        activityModel { ionic pitzerHMW; }   // curated-pair engine (since
                                             //   2026-08-24) -- what a
                                             //   2 mol/kg brine needs
    }
    volatiles ( CO2 water );                 // at equilibrium{} level
```

`edwardsPitzer` is deliberately NOT served on this path (its Henry records
are a different convention — use a propsDict `speciate` op with a
`vapour {}` block for the Edwards stack), and the composite routes
(`molecular` backbone, `organic {}` second liquid) are ratified on
`ionic davies` only — each refusal names its remedy.  Witness case:
`flash21_brine_co2_pitzer`.

## caloric — the energy routes

The `caloric {}` block declares how enthalpy is computed per phase.
`energyBasis elementsDatum;` is the project convention: ONE datum — the
elements at 298.15 K / 1 bar — so energy balances may legally cross
reactors.  Routes per phase (`idealGasCp`, `equilibriumEquationOfState`
departures, `ionicReferencePlusExcess`) name where the sensible/latent legs
come from.  When the block is omitted the builder uses the formulation's
canonical routes and says so.

## pureFluids — a pure component on its own fundamental equation

A component that is effectively pure in a phase may be priced by a
fundamental equation instead of the generic chain:

```
pureFluids
{
    water { method IF97; }                          // IAPWS-IF97 (industrial)
    // or a REFERENCE (Helmholtz) equation of state, by its record name:
    // water { method Helmholtz; equation IAPWS95; }
    // CO2   { method Helmholtz; equation SpanWagner1996; }
    // N2    { method Helmholtz; equation Span2000; }
    // methane { method Helmholtz; equation SetzmannWagner1991; }
}
```

The Helmholtz records live in `data/standards/parameters/Helmholtz/` and are
checked against their publication's own values at every load.  h and s are
on the publication's datum, valid only where the phase is effectively pure
(x >= 0.999); a mixture refuses.  A SEALED case must carry the record in
`constant/parameters/Helmholtz/`.  To evaluate one state or a saturation
point without a flowsheet, use the props op `referenceEoS`.  Theory Guide:
"Reference equations of state (Helmholtz energy)".

## transport  (optional; for unit ops that need μ / k / D / σ)

Which unit takes which liquid property from where -- the property kernel or
its own number -- and how to read the run's liquid-properties table:
[thermophysical-properties.md](thermophysical-properties.md).

Transport correlations are declared per PHASE, and an interface block covers
surface tension:

```
transport
{
    vapour
    {
        viscosity           { model Chung; }    // gas mu (or ChapmanEnskog: needs lennardJones {} on each record)
        thermalConductivity { model Eucken; }   // gas k (Cp + mu; or modifiedEucken, Svehla eq. 2)
        diffusivity         { model Fuller; }   // binary gas D (Sigma v)
    }

    liquid
    {
        viscosity           { model Vogel; }      // or Andrade
        thermalConductivity { model SatoRiedel; }
        diffusivity         { model WilkeChang; }
    }

    interface
    {
        surfaceTension { model BrockBird; }
    }
}
```

Pick by need:

| Need | Sub-model |
|---|---|
| Gas viscosity (low pressure) | **`Chung`** — uses Tc/Pc/ω/MW, zero new data (non-polar truncation, Vc estimated, both announced); or **`ChapmanEnskog`** — kinetic theory over the record's `lennardJones { sigma [0 1 0 0 0] <m>; epsOverK <K> K; provenance {…} }` block (REFUSES by name without it; `bin/curate/propose_lennard_jones.py` drafts the block from Svehla 1962 into `data/local/`, a case may adopt it locally). |
| Gas thermal conductivity | **`Eucken`** — `λ = (Cp+5R/4)·μ/M`, no extra data (exact for a monatomic gas, an approximation for polyatomics, flagged); or **`modifiedEucken`** — Svehla 1962 eq. (2), `λ = (R/M)[15/4 + 1.32(Cp/R − 5/2)]·μ`, the internal modes weighted 1.32. |
| Gas binary diffusivity | **`Fuller`** — needs `diffusionVolume` on each component (water/N2/O2/CO2/CH4/H2/CO ship it). |
| Liquid viscosity | **no word** — each constituent on its record's preferred law (`viscosity { }`; C398 slice (b)); or **`Vogel`** / **`Andrade`** / **`chemsepEq101`** — the law of that NAME for every constituent (refuses a record without it). |
| Liquid thermal conductivity | **`SatoRiedel`** (parameter-free, organics). |
| Liquid binary diffusivity | **`WilkeChang`** (needs `associationFactor`). |
| Surface tension | **`BrockBird`** (corresponding states). |

When a unit op needs a transport property the system doesn't supply, the
solver throws a clear error naming the missing slot.

### One law per constituent, the legacy words, and a pin (C398 slice (b))

For liquid viscosity, liquid thermal conductivity and surface tension the
package holds ONE law per constituent, from its own record; the block's
`mixingRule` combines the pure values.  The block may name NO model:

```
transport { liquid { viscosity { } } }      // methanol vogel, 2-propanol chemsepEq101, water vogel
```

A word still reads as before: `Andrade` / `Vogel` / `chemsepEq101` /
`chemsepEq16` = a pin of the law of that NAME for every constituent;
`SatoRiedel` / `BrockBird` = predictive, no record law; `StoredCorrelation` =
the record's `tauPower` law, else Brock-Bird for that component (announced).
A CASE PIN of one constituent's law sits beside the property:

```
transport { liquid { viscosity { pin ( { component water; law andrade; reason "..."; } ); } } }
equilibrium { vaporPressure { pin ( { component water; law SR1; reason "..."; } ); } }
caloric { liquidHeatCapacity { pin ( ... ); } }     // idealGasHeatCapacity, solidHeatCapacity too
```

Refused: an unknown component, a law the record does not hold (the error
lists the laws it has), a component pinned twice, a pin without `law` or
`reason`.  The law is chosen ONCE per constituent, printed in the resolved
view (law, type, who chose it, window), never switched by the state; its
object is built at first evaluation, so a constituent at x = 0 is never
refused.  NO factory default answers for a block without a word: a vapour
property block must name its model (no record law exists for it), and a
`transport {}` with no vapour viscosity has NONE (a consumer is refused,
naming the line to write).  A `propertyPoint` whose package cannot supply a
gas viscosity, gas conductivity or surface tension omits that key and says
so in one line.  Witnesses: `props/transport/purelaws01_methanol_isopropanol_water`,
`props/thermo/purelaws02_water_two_vapour_pressure_laws`.

### Liquid mixing rules (`mixingRule`, C331)

The three LIQUID properties also select how the pure values are combined,
with `mixingRule` beside `model` (the gas rules, Wilke and
Wassiljewa-Mason-Saxena, are fixed and refuse the key).  The DEFAULT is the
best-practice rule (C331); the old rule stays selectable by name:

```
liquid
{
    viscosity
    {
        model       Vogel;
        mixingRule  GrunbergNissan;
        interaction ( { i water; j ethanol; A -5.51544; B 2572.66; C -11.528; D 4515.19;
                        Tmin 268.1 K; Tmax 328.15 K; source "..."; } );
    }
    thermalConductivity { model chemsepEq16; mixingRule Li; }
}
interface { surfaceTension { model StoredCorrelation; mixingRule Butler; } }
```

| Property | Rules | What the new rule needs |
|---|---|---|
| Surface tension | **`Butler`** (default) · `moleFractionAverage` | the case's activity model (bulk AND surface composition; Poling 5ed eqs. 12-5.16/17); falls back to the linear rule, announced, if the package has none |
| Liquid viscosity | **`GrunbergNissan`** (default) · `logMoleAverage` | `interaction` rows `G_ij(T,x) = A + B/T + (C + D/T)(x_i - x_j)` fitted to measured mixture data, with `source`; a pair with no row mixes with G = 0, announced |
| Liquid thermal conductivity | **`Li`** (default) · **`Filippov`** (binary only) · `massFractionAverage` | Li reads the package's liquid molar volumes |

Measured (ThermoML archive, `bin/curate/mixing_fit.py validate`): surface
tension of water + acetone 63 % mean error with the linear rule, 12 % with
Butler on UNIFAC; viscosity of water + ethanol 42 % with `logMoleAverage`,
10 % with the fitted G; conductivity of water + ethanol 17 % with the mass
average, 3 % Filippov, 6 % Li (tutorial `props/transport/mixing01_water_acetone`).

Every registered transport model states its **validity window**, its
**primary citation** and a **self-check anchor** (`verify()`), and the
`choupoProps` operation **`transportBench`** runs them all — verify table
plus, with a `compare { T; P; }` block, every gas model for every component
and the Wilke / Wassiljewa mixture values (tutorial
`props/transport/transport01_gas_bench`).  Two things it announces that a
reader should expect: Chung estimates `Vc` from `Zc(omega)` and applies its
NON-POLAR truncation to every component (once per component, in the caveat
block), and plain Eucken is an approximation for any polyatomic gas.  Every
`ChapmanEnskog` component is announced with the ORIGIN of both constants
(`measuredFit` = Svehla's least-squares fit to measured viscosities; `measured`;
`estimated`) and the report page they were read from.  With two models per gas
family the bench's spread column is a real disagreement (tutorial
`props/transport/transport02_chapman_enskog`: water's Chung and Chapman-Enskog
viscosities differ by a third at 300 K).  NOT available, and not to be
declared: `Sutherland` — no record carries a Sutherland constant; and a
Chapman-Enskog binary DIFFUSIVITY — the Ω(1,1)* collision-integral fit is not
citable from any source in the tree (record:
`docs/design/transport-correlations-as-objects.md` §8).

## variants — named variants of the system, and the resolved view (C398)

`constant/thermoPhysPropDict` is the ONE place a case declares its
properties.  Its blocks are the case's system; `variants {}` adds named
variants, each stating ONLY what differs and deriving DIRECTLY from the
system (one base: no chain, no cycle).  A unit or a props operation selects
one with `thermo <name>;`; an inline `thermo { ... }` still reads, as an
unnamed variant.  Grammar, refusals and a worked example:
[`dict-syntax.md`](dict-syntax.md) → "Named variants".

- **The atom inside `transport` is the PROPERTY BLOCK**
  (`transport.<phase>.<property>`), inside `volumetric` the phase block; a
  variant, an inline fragment and a sector's `inherits` all replace that
  much and keep the rest.  `equilibrium` and `caloric` are replaced as
  before (a variant that changes them is a model boundary).  A transport
  name outside `vapour/liquid/interface` × {`viscosity`,
  `thermalConductivity`, `diffusivity`, `surfaceTension`} — e.g. the flat
  `liquidViscosity {}` — is REFUSED, not dropped.
- **THE RESOLVED VIEW**: before the solve (verbosity ≥ 2) the engine prints,
  for the system, each sector dictionary a unit uses, each named variant and
  each inline fragment, every property the package can be asked with two
  columns — CHOICE (where it was decided: system, sector file, parent via
  `inherits`, `variants.<name>`, a unit's inline block) and DATA (the law per
  constituent, the mixing rule — marked "default" when the case wrote none —
  the interaction pairs it reads or misses, the density routes, the energy
  basis and enthalpy routes).  Every line starts `[properties]`; a
  fingerprint heads each view.  Read it before asking "which viscosity did
  this unit use?".
- The factory defaults the view names when no `mixingRule` is written:
  Grunberg–Nissan (liquid viscosity), Li (liquid conductivity), Butler
  (surface tension).  A `transport {}` block with no vapour viscosity has no
  gas viscosity since slice (b) (the Chung default was deleted, SL-04).
- Since slice (b) the view prints, per constituent, each record law the run
  uses (vapour pressure, the heat capacities, the liquid transport laws) —
  name, type, who chose it, window — and every law type's form with its
  coefficient units.

## The three-tier model-parameter rule

A model's parameter lives at the **highest tier where it is true** — the
same arity test as the component glossary, asked of the *model* (*does the
number require you to name the model?*).  See
[`data-doctrine.md`](data-doctrine.md) §4.

1. **Corresponding-states triad → stays on the component, untouched.**  Any
   model that needs only `{Tc, Pc, ω}` (every cubic: SRK, PR, a new
   α-function) reads the triad off the component and derives its own
   `a_c, b, m, α(T)` **in source**.  Adding such a model touches **zero data
   files**.  Never pre-bake `a_c` into a `.dat`.
2. **Model-specific PURE parameters that cannot be generated → a
   model-NAMED block on the component** (the `uniquac{}` / `cosmo{}` /
   `liquidViscosity{}` precedent).  The SHIPPED grammar for PC-SAFT —
   what you actually write in a `.dat` today:
   ```
   // inside the component .dat — ADDITIVE; never disturbs the triad
   pcsaft
   {
       m           2.3827;      // segment number [-]
       sigma       3.1771;      // segment diameter [Angstrom]
       epsilonK    198.24;      // segment energy eps/k [K]
       // association trio — ALL THREE or NONE (a partial trio refuses):
       assocScheme 2B;          // 2B | 4C  (absent = non-associating)
       epsAB_K     2653.4;      // association energy [K]
       kappaAB     0.032384;    // association volume [-]
       source      "Gross & Sadowski, IECR 41 (2002) 5510, Table 1";
   }
   ```
   **The scheme is part of the fit**: a published `(epsAB, kappaAB)` pair
   is meaningful only under the site scheme the paper regressed it with —
   read the paper's own site count, never assume one from the chemistry
   (the G&S-2002 water set is 2B; curated as 4C it collapsed the
   ethanol/water flash while the pure density looked fine).  A model with
   **no** required block on a component **fails with a remedy** — never a
   silent corresponding-states fallback.  (Ruled 2026-08-03: the flat
   model-named block IS the doctrine — a future EoS with fitted
   parameters adds its own `pengRobinson{}`-style block; the old
   `eosParameters{}` container idea is retired.  See
   [`data-doctrine.md`](data-doctrine.md) §4.)
3. **PAIR parameters (NRTL τ, Henry, Pitzer β, `k_ij`) → the parameter
   catalogue**, `data/standards/parameters/<MODEL>/<i>-<j>.dat`, referenced
   from a `binaryParameters`/`binaryInteractions` block by `source`, loaded
   and verified at assembly with a LOUD `[builder]` line — with the inline
   numbers form staying first-class.

## The aqueous solution tier + the default-solvent rule

A solute property whose **definition names a solvent** — an "in-water"
ΔH_soln, an aqueous Hf°, a solubility curve — is arity-2 PAIR data.  It does
**not** go in the component `.dat`; it lives in a by-name catalogue tier:

| Solute kind | Tier | Carries |
|---|---|---|
| **ions** (∞-dilution) | `data/standards/species/<name>.dat` (one `recordType modelSpecies` file per species) | `hfAq / sAq / cpAq` on the H⁺(aq)=0 convention (Wagman/NBS 1982) |
| **molecular solutes** | `data/standards/parameters/solution/<solute>-<solvent>.dat` | ΔH_soln and other solution thermo, primary-cited |

Water earns **one canonical, named, by-name aqueous reference tier** — never
an *implied component slot*.  When a solution property is needed and no
solvent is named at the call site, the resolver uses the declared default
**and announces it on every run**; off-default it **fails with a remedy** —
never a silent water substitution.  See [`data-doctrine.md`](data-doctrine.md) §2.

## The folder cascade — where a refined number goes

A datum lives at the **highest level where it is TRUE**; a lower node only
**overlays** it when the lower scope makes it *more true*.  The overlay merges
**block-by-block** (top-level-key replacement of the whole reference-state
block), never field-by-field.

| Question about your number | Home |
|---|---|
| stands alone with one molecule (MW, Tc, ω, crystalline ΔH_f) | the component record (`constant/components/<name>.dat` in a sealed case; `data/standards/components/` in the catalogue) |
| names a second species (NRTL τ, Henry, Pitzer β, k_ij, ΔH_soln-in-water) | a catalogue, keyed by the pair, referenced by `source` |
| a sample-specific refinement of a molecular block (this powder's sorption) | `<case>/constant/components/<name>.dat` overlay (whole block) |
| a sample-specific pair/model-param refinement | `<case>/constant/parameters/<MODEL>/<pair>.dat` or an `eosParameters{}` overlay |
| a RATE (kinetics) or GEOMETRY (PSD) — the molecule-in-a-machine | the operation's `constant/` (`crystallisation`, `dryingKinetics`, `reactions`); PSD is a **stream** attribute |

Precedence, lowest → highest: `local < standard < case < sector < unit`.
Full rule + the merge semantics: [`data-doctrine.md`](data-doctrine.md) §3.

## membrane (only for spiralWoundModule)

A membrane case declares which membrane the spiral-wound module uses
on a per-unit basis (see `unit-ops.md > spiralWoundModule`), not at
the system level — but the components include the solute(s),
and the solute must have `nonvolatile true;` + `dissociation <nu>;`
in its `.dat` (NaCl, glucose, MgSO4 ship this).

## What does the simulator do with thermoPhysPropDict?

The five binaries all hand the authored dict to
`ThermoPackageBuilder::build(dict, db, chemistry)` at startup, which:

1. Verifies `recordType thermophysicalPropertySystem;` (any other shape is a
   named refusal).
2. Loads each component's `.dat` — from the case's sealed `constant/`
   records (manifest-verified) or, unsealed, from the catalogue.
3. Assembles the declared formulation natively: instantiates the activity /
   EoS / transport models via the explicit factories, loads + verifies every
   declared parameter file, resolves the reference rungs.
4. Caches Antoine, Cp, Hvap polynomials for fast K-value / enthalpy calls.

The builder **assembles, never estimates** — a missing datum is a curation
problem solved before the run (`curation-protocol.md`), not a runtime guess.
After assembly the package is passed to every unit op's `solve(dict, thermo,
verbosity)`.  Units consume only the slice they need.  A unit (or a props
operation) that selects a variant -- `thermo <name>;`, or an inline `thermo
{}` -- gets that variant's package for itself only (components stay global);
a variant that changes `equilibrium` or `caloric` is a model boundary, see
`energy.md` §model boundaries.  Before the solve the engine prints the
RESOLVED VIEW of every property context the run uses (see "variants" above).

## Enthalpy reference state (the `phase` field in `standardThermochemistry`)

Choupo uses the **elements-at-298.15 K / 1 bar** datum for any
energy balance that crosses a reactor (this is the same convention as
NIST and JANAF).  Each component's
`standardThermochemistry { dHf_298; s_298; phase; }` block carries the
formation enthalpy plus a one-word **`phase`** field declaring in
which phase `dHf_298` is tabulated:

| `phase`  | Required Cp model                  | Typical species |
|----------|------------------------------------|-----------------|
| `gas`    | `idealGasHeatCapacity`             | the convention --- volatiles + radicals |
| `liquid` | `liquidHeatCapacity`               | compounds tabulated in the condensed datum (rare) |
| `solid`  | `liquidHeatCapacity` (used as $c_p^{\mathrm{solid}}$) | crystalline non-volatiles that never honestly vaporise (sucrose) |

The solver uses `phase` to walk the **enthalpy ladder** (theoryGuide
§"The reference state, and why a reaction needs the elements"):
starting from the tabulated rung, it adds / subtracts Hvap and Hfus
jumps as needed to reach the rung the energy balance asks for.  A
`solid`-tagged species is *never* asked to integrate through a gas
leg, so sucrose does not need an ideal-gas Cp.  An attempt to send a
`phase = solid` component into a vapour stream throws a clear error
rather than fabricating a sublimation enthalpy.

New components should always declare `phase` explicitly so the datum is
unambiguous at the source of truth.  The same rule applies to per-case
overlays under `<case>/constant/components/<name>.dat`.

## The rules in one paragraph

Models are per PHASE (the formulation's slots); reference conventions
(Raoult / infinite-dilution Henry / aqueous-ion) are per COMPONENT-GROUP
within a phase (`standardState` on the solvent/solutes groups); correlations
(Antoine, Cp) stay per COMPONENT; parameters (Henry, NRTL, Pitzer, k_ij)
stay per PAIR, declared by `source` and verified at assembly — a
declared-but-missing file REFUSES loudly, naming the entry to add.  The run
log announces the assembled formulation, each phase's model and reference
rung (`[builder]`), and each engaged Henry pair with constants + source
(`[henry]`).  Never mix two gamma-models or two EoS in one phase — one Gibbs
surface per phase.

## Glossary: the course's words for what the engine does

Phase equilibrium is ONE equation, always: f̂ᵢV = f̂ᵢL per species.  Every
Choupo formulation is an instance of it; this table maps the classroom
vocabulary (standard states + conventions) onto the engine's declarations.

| course concept | engine home |
|---|---|
| **Raoult / Lewis–Randall convention** (pure-liquid reference, γ→1 as x→1) | `gammaPhi` liquids (NRTL/Wilson/UNIQUAC/COSMO-SAC); the co-volatile leg of the reactive flash (`p = γ·x·psat`) |
| **Henry convention** (infinite-dilution reference, γ*→1 as x→0) | `diluteSolution`; `parameters/Henry/` pairs; the network's gas-liquid records (molal basis) |
| **unsymmetric convention** (solvent on Raoult + solutes on Henry, one liquid) | the reactive `electrolyteGammaPhi` shape — water on a_w, NH3/HAc on molal K's tied to the speciation network |
| **standard states** (per-species reference choice) | a consequence of the declared formulation (the one-knob rule): solid · pure-liquid Raoult · aqueous-infinite-dilution · fused-salt |
| **law of mass action on activities** | the SpeciationSolver (mass action + electroneutrality, pH solved) |
| **mean-ionic activity, γ±** | Davies / Pitzer / eNRTL on molality |
| **fugacity coefficient φ̂ from an EoS** | `phiPhi` (SRK, PC-SAFT) |
| **ideal-solution approximation** | `approximations { idealMolecularVLE { components (...); reason "..."; } }` — authorised, delimited, announced; the `reason` is required and an unknown word is refused |
| **ideal binary pair** (a declared γ-model pair with no parameters) | `approximations { idealBinaryPair { pairs (...); reason "..."; } }` — **REFUSED unless authorised** (2026-08-11), then recorded as a `problemDivergence` |
| **composite mixed-solvent electrolyte v1** | NRTL molecular backbone + Davies ions + multiplicative a_w — a COMPOSITE whose limits are PROVEN each sweep (`check_composite_limits`): x_co→0 recovers the aqueous electrolyte, I→0 recovers molecular NRTL, NRTL→0 recovers the authorised ideal |

Rule of reading: when an announcement names a *convention* it is telling
you which standard state a γ or K is referred to; when it names an
*approximation* it is telling you which physics was deliberately, visibly
neglected — and which named slice will replace it.

---

## When Choupo refuses because a binary pair has no parameters

If you declare NRTL, UNIQUAC or Wilson and a pair has no parameter record,
that pair does **not** run the model you declared — it runs **ideal**.  Since
2026-08-11 the engine refuses rather than announcing it and carrying on,
because the problem solved would not be the problem you posed.

You have four ways forward, and the refusal prints all of them:

1. **Add the record** under `constant/parameters/<MODEL>/<a>-<b>.dat` (or the
   sealed snapshot) — the best answer when a curated pair exists.
2. **Fit it** from experimental data: `fitParameters`, residual kind
   `T_bubble` (or `T_bubble+LLE` when the pair is partially miscible and tie
   lines are measured; see `tutorials/props/curation/`).
3. **Declare a predictive model that needs no pair** — UNIFAC, if every
   component carries group decompositions.
4. **Authorise the approximation.**  It then runs, and every ideal-defaulted
   pair is recorded as a divergence that rides the result:

```
//  TOP LEVEL of constant/thermoPhysPropDict -- NOT inside activityModel {}.
//  The authorisation is a statement about your CASE, not a parameter of the
//  model, and it has exactly one home.
approximations
{
    idealBinaryPair
    {
        pairs  ( acetone-water isopropanol-water );
        reason "no curated parameters; ideal accepted for this screening pass";
    }
}
```

The block is **delimited**: authorising one pair does not authorise another.
The `reason` is not decoration — it is what a reader (or a marker) sees beside
the number, so write the engineering argument, not "TODO".

Do NOT invent parameter values to get past the refusal.  A fabricated pair
looks exactly like a curated one and no gate can tell them apart; an
authorised ideal pair is visible forever.

