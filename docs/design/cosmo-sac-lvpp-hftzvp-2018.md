# COSMO-SAC on open profiles: the LVPP-HFTZVP-2018 variant

*Recorded 2026-11-11 (DEV.md 4c C310, reserved task #95 decided under rule 00).
Kind: design record.  Status: BUILT on branch `c310-cosmo-lvpp`.  Engine:
`src/thermo/activityCoefficient/CosmoSac.{H,cpp}`, `src/thermo/Component.{H,cpp}`
(the `protocol` key).  Tools: `bin/curate/lvpp_sigma_profile.py`,
`bin/curate/cosmo_lvpp_vs_nrtl.py`.  Gates: `check_cosmo_scrub` arms (vi),
(vii), (v'); `check_cosmo_lvpp_selection` (new); `check_gibbs_duhem` (two new
rows).  Cases: `tutorials/props/molecular/cosmoSAC02_lvpp_selection_lin2002`,
`tutorials/props/molecular/cosmoSAC03_ethanol_water_predictive`.
Predecessor: [`the-licence-of-a-sigma-profile.md`](the-licence-of-a-sigma-profile.md) §4.*

---

## 1  The question

COSMO-SAC needs one sigma profile per molecule.  The profiles the 2002
constants were fitted to (VT-2005) may not be shipped (§3 of the predecessor).
The LVPP database (github.com/lvpp/sigma) is MIT, but a profile is only usable
with the constants fitted to its own quantum-chemistry protocol: an LVPP v25
profile under the 2002 constants flips the sign of G^E on water/acetone
(`data/tmp/COSMO_VALIDATION_STUDY.md`).  So the question was which LVPP
parametrisation can be implemented from what is published.

## 2  Which variant, and why

| candidate | profiles | published equations and constants | verdict |
|---|---|---|---|
| CS25 (LVPP 2025) | release v25, NWChem B3LYP/def2-SVPD | constants in `pars/CS25/*.csv`; the dispersion term's equation, alpha' and the meaning of BETA unpublished -- Soares, Mejía-Rodriguez & Aprà, JCTC 21 (2025) 11573, §4.4: "details of this calibration will be published elsewhere"; validation only as plots | not implementable |
| GMHB1808 | release 18.07, GAMESS HF/TZVP | README only; the hydrogen-bond acceptor classes contradict their own example ("bonded to more than 2 atoms (e.g. ether)"); no paper | not implementable |
| **Ferrarini et al. 2018** | **release 18.07, GAMESS HF/TZVP** | **AIChE J. 64 (2018) 3443, p. 6 and p. 11: the 2002 equations (Lin & Sandler), the only modification an averaging radius r_avg; refitted r_avg 1.4 A, f_pol 0.8041, r_eff 1.1565 A, c_HB 58250.49 kcal A^4/(mol e^2), sigma_HB 0.01008 e/A^2** | **built, as `LVPP-HFTZVP-2018`** |

The 18.07 archive (`HF_TZVP.zip`, 84 901 966 bytes, sha256
`bd17aaeebb430641d704830b71b93637833d77a32e41cde38b528a0483659d49`, 1713
`.gout` files, MIT (c) 2017 LVPP) is Ferrarini's set: GAMESS 5 DEC 2014,
`scftyp=rhf`, `GBASIS=KTZVP`, geometry optimised with COSMO, `COSRAD=1.4`,
double-cavity outlying-charge correction -- read from the files.  It is
unpacked under `thirdParty/lvpp-sigma-1807/` (gitignored, never committed;
the card `thirdParty/lvpp-sigma/README.md` covers it).

## 3  What the paper leaves open, and how it was chosen

Ferrarini 2018 (accepted manuscript, 36 pages, no supporting information)
does not state:

* **(a)** the decay factor of the charge averaging and the unit of the
  segment distance -- Mullins' form (f_decay 1) or the Lin & Sandler erratum /
  Bell 2020 Eq. 4 form (f_decay 3.57, distances in A);
* **(b)** which area enters the misfit constant
  alpha' = 0.3 f_pol a^1.5 / eps0: pi r_eff^2 (the Lin & Sandler reading,
  where a_eff is the standard segment area) or pi r_avg^2 (what LVPP's later
  GMHB1808 README writes for its own code).

The four readings are discrete.  They were run outside the engine, by an
independent Python implementation of the 2002 equations over the 18.07
profiles, against the measured ln gamma-inf of Lin & Sandler, Ind. Eng. Chem.
Res. 41 (2002) 899, Table 2 ("expt" columns, 298.15 K, 33 solutes in water
and 18 in n-hexane):

| reading | mean abs dev, water | n-hexane | all | R^2 |
|---|---|---|---|---|
| f_decay 1, alpha' on pi r_eff^2 | 4.46 | 1.26 | 3.33 | -0.29 |
| f_decay 1, alpha' on pi r_avg^2 | 2.71 | 0.79 | 2.03 | 0.56 |
| **f_decay 3.57 (d in A), alpha' on pi r_eff^2** | **1.02** | **0.40** | **0.80** | **0.92** |
| f_decay 3.57, alpha' on pi r_avg^2 | 2.50 | 2.19 | 2.39 | 0.35 |

Two readings are excluded on physics (R^2 below zero or near 0.5 on a table
whose spread is ten log units); of the other two only the third is plausible.
f_decay 3.57 is LVPP's own published value (GMHB1808 README; Bell 2020) and
alpha' on r_eff is the natural Lin & Sandler reading.  The architect selected
it (2026-11-11).  For scale: Lin & Sandler's own 2002/VT-2005 errors on the
same table are rms 1.65 in water and 0.50 in n-hexane.

The table is reproduced by `bin/curate/cosmo_lvpp_readings.py` (numpy only,
independent of `src/`).  On the subset the catalogue covers (32 solutes in
water without n-butylamine, 18 in n-hexane) the selected reading gives
0.993786 / 0.403765 / 0.781379, and the engine, run on the witness, gives the
same within 5e-7 (`check_cosmo_lvpp_selection`, tolerance 1e-3).

**THIS TABLE IS SELECTION DATA, NOT VALIDATION.**  It chose the reading, so
agreement with it proves only that the engine implements the reading chosen.
Every run of the variant says so on stderr, and the witness case
`cosmoSAC02_lvpp_selection_lin2002` exists to hold the engine to the outside
computation, nothing more.  The acceptance is §6.

## 4  The engine

* ONE set of equations, TWO constant sets (`CosmoSac.cpp`): the 2002
  constants unchanged (lines 18-27); the LVPP ones in their own block, with
  a_eff = pi r_eff^2 = 4.2019 A^2 and alpha' = 0.3 f_pol a_eff^1.5 / eps0 =
  8675.4 kcal A^4/(mol e^2), eps0 = 2.395e-4 e^2 mol/(kcal A) (the value Bell
  2020 gives for the 2002 constant).  z, r0, q0, R and the Staverman-Guggenheim
  combinatorial are the 2002 ones ("the original COSMO-SAC model").
* A set's `variant` picks the constants; every component of a mixture must
  carry the same variant; a `variant "2002"` set with a `protocol` or an LVPP
  source refuses; a `variant "LVPP-HFTZVP-2018"` set whose `protocol` is not
  exactly `LVPP18_PROTOCOL` refuses.  The protocol string is the ONE home of
  r_av 1.4 A, f_decay 3.57, distances in A and sigma = q/a: the curation tool
  and the scrub gate read it from the engine.
* The announcement, once per run, names the paper, says the model is
  predictive, names the two open choices, the reading used, and that it was
  selected on Lin & Sandler Table 2.

## 5  The profiles in the catalogue

`bin/curate/lvpp_sigma_profile.py match --write` joins the archive to the
catalogue by IDENTITY: each file's InChIKey is computed from its own final
geometry (RDKit: connectivity and bond orders from 3-D, neutral, stereo from
3-D) and matched to the InChIKey `thirdParty/thermoml/identity.json` resolved
for the component (PubChem and CACTUS agreeing); the formula must also agree.

| outcome | count |
|---|---|
| LVPP 18.07 files | 1713 (1662 perceived by RDKit; 51 not -- ions, and some nitro compounds whose bond orders RDKit cannot assign as neutral) |
| catalogue components with a resolved InChIKey | 483 of 649 (the other 166 were not considered) |
| **matched and written** | **352** -- 23 on the connectivity block (the LVPP geometry is one stereoisomer of a record that carries no stereo layer; said in each record); 4 the archive files twice with byte-identical profiles (R11, R12, R21, isopropanol: both files cited) |
| ambiguous, NOT written | 17 -- the archive holds two or more DIFFERENT calculations for one InChIKey: water (WATER / DEUTERIUM_OXIDE, an H2O run from another start), ethanol (three conformers), 1Methyl4NPropylbenzene, 3Heptanone, 4Heptanone, diEthylCarbonate, diisopropylKetone, ethylacetylene, ethyleneGlycol, isobutylbenzene, isoprene, methylIsobutylKetone, methylIsopropylKetone, methylPalmitate, nButylcyclopentane, nButyricAcid, propionicAcid |
| unmatched | 114 -- 113 with no LVPP file under the key (gases, salts, long alkanes, siloxanes, several S and N compounds, 2Butanol, nitrobenzene ...), 1 formula mismatch (HCl against the chloride-ion file) |

Each set carries `licence MIT;`, the LVPP and Ferrarini citations, the file,
the identity evidence and Choupo's derivation.  `area` is the sum of the 51
printed numbers, not GAMESS's 2-decimal cavity figure: with the printed figure
the mixture probability does not sum to one and the residual term violated
Gibbs-Duhem at R = 3e-4 on acetone/chloroform (check_gibbs_duhem); with the
sum, R = 8e-9.  Choosing a conformer is a modelling decision the join does not
take: the two cases that need water and ethanol take WATER.gout and
ETHANOL.gout case-locally, the files LVPP's own calibration list names
(`pars/GMHB1808/README.md`), and say so in their records.

## 6  Acceptance: the held-out comparison

**Data.**  Every catalogue NRTL pair graded `clean` or `warning` (103) whose
two components both carry an LVPP set: **86 pairs, 2744 measured bubble
points** (31 isobaric series scored in K on T_bubble, 55 isothermal in % on
P_bubble).  The points are the ThermoML series (articles cited in each pair
record) the NRTL pair was fitted to, regenerated by `bin/choupo-curate fetch`
from the declared DOIs and sha256 sums into a scratch copy of the pair's
curation case.  17 pairs are not predictable: a component without a profile
(2Butanol, ethanol, ethyleneGlycol, methylIsobutylKetone).

**Method.**  `fitParameters mode evaluate` over the SAME evidence and residual
the fit used, in the SAME case (same pure-component records, same vapour
pressures, ideal-gas vapour): NRTL with the promoted record's parameters --
which SAW these points, so its score is in-sample -- and COSMO-SAC
LVPP-HFTZVP-2018 with no parameter at all, for which every point is held out.
Families are read from each molecule's LVPP geometry (RDKit SMARTS), never
from its name.  Per-pair numbers:
`docs/audits/2026-11-11-cosmo-lvpp-vs-nrtl.json`; the tool:
`bin/curate/cosmo_lvpp_vs_nrtl.py` (re-run, or `--summarise` that file).

**Result (median aad per family pairing).**

| families | data | pairs | points | NRTL aad (fitted, in-sample) | COSMO-SAC aad (predicted, held out) | COSMO-SAC worst pair |
|---|---|---|---|---|---|---|
| alcohol + alcohol | P_bubble | 1 | 19 | 1.50 % | 4.11 % | 1Hexanol-nButanol 4.11 % |
| alcohol + alcohol | T_bubble | 1 | 111 | 0.63 K | 0.65 K | isopropanol-methanol 0.65 K |
| alcohol + alkane/cycloalkane | P_bubble | 10 | 237 | 1.70 % | 2.68 % | nButanol-nDodecane 5.22 % |
| alcohol + alkane/cycloalkane | T_bubble | 1 | 38 | 0.17 K | 2.41 K | 224Trimethylpentane-isopropanol 2.41 K |
| alcohol + alkene/alkyne | P_bubble | 2 | 50 | 1.72 % | 4.12 % | 1Hexene-1Pentanol 4.50 % |
| alcohol + aromatic hydrocarbon | P_bubble | 7 | 182 | 0.96 % | 5.16 % | 2Methyl1Propanol-benzene 8.22 % |
| alcohol + aromatic hydrocarbon | T_bubble | 1 | 23 | 0.43 K | 0.97 K | benzene-methanol 0.97 K |
| alcohol + ester/carbonate | P_bubble | 1 | 21 | 3.46 % | 23.32 % | 1Hexanol-nButylAcetate 23.32 % |
| alcohol + ester/carbonate | T_bubble | 4 | 175 | 0.17 K | 1.45 K | 2Methyl1Propanol-isobutylAcetate 2.43 K |
| alcohol + ether | P_bubble | 4 | 89 | 0.44 % | 17.65 % | 2Methyl1Propanol-diisopropylEther 26.84 % |
| alcohol + ether | T_bubble | 4 | 281 | 0.29 K | 1.87 K | methanol-tetrahydrofuran 3.57 K |
| alcohol + halogenated | P_bubble | 1 | 11 | 0.66 % | 13.19 % | 1Propanol-Dichloroethane 13.19 % |
| alcohol + ketone | T_bubble | 3 | 219 | 0.19 K | 1.78 K | 1Pentanol-2Hexanone 2.02 K |
| alcohol + nitrile | T_bubble | 2 | 109 | 0.37 K | 1.13 K | acetonitrile-methanol 1.38 K |
| alcohol + sulfur | P_bubble | 1 | 11 | 0.21 % | 2.06 % | 1Propanol-diethylSulfide 2.06 % |
| alkane/cycloalkane + alkane/cycloalkane | P_bubble | 1 | 22 | 0.28 % | 1.32 % | 224Trimethylpentane-nHeptane 1.32 % |
| alkane/cycloalkane + alkane/cycloalkane | T_bubble | 1 | 19 | 0.31 K | 0.70 K | cyclohexane-nHeptane 0.70 K |
| alkane/cycloalkane + alkene/alkyne | T_bubble | 1 | 81 | 0.25 K | 0.17 K | cyclohexane-cyclohexene 0.17 K |
| alkane/cycloalkane + amide | P_bubble | 1 | 40 | 1.25 % | 18.93 % | nHeptane-nNDimethylacetamide 18.93 % |
| alkane/cycloalkane + aromatic amine/N-heterocycle | P_bubble | 1 | 19 | 0.48 % | 10.83 % | aniline-nOctane 10.83 % |
| alkane/cycloalkane + aromatic hydrocarbon | P_bubble | 2 | 44 | 1.00 % | 5.01 % | nHexane-toluene 9.36 % |
| alkane/cycloalkane + aromatic hydrocarbon | T_bubble | 4 | 87 | 0.27 K | 0.66 K | nOctane-oXylene 0.76 K |
| alkane/cycloalkane + ester/carbonate | T_bubble | 1 | 64 | 0.51 K | 1.17 K | methylPropionate-nHeptane 1.17 K |
| alkane/cycloalkane + ether | P_bubble | 6 | 138 | 0.79 % | 1.00 % | anisole-nHexane 15.79 % |
| alkane/cycloalkane + ether | T_bubble | 2 | 48 | 0.54 K | 0.75 K | 224Trimethylpentane-diisopropylEther 0.95 K |
| alkane/cycloalkane + sulfur | P_bubble | 2 | 17 | 0.20 % | 5.74 % | 224Trimethylpentane-dimethylDisulfide 5.97 % |
| alkane/cycloalkane + sulfur | T_bubble | 1 | 18 | 0.24 K | 0.71 K | nHeptane-thiophene 0.71 K |
| alkene/alkyne + ether | P_bubble | 2 | 48 | 0.30 % | 0.66 % | 1Hexene-tertButylEthylEther 1.13 % |
| amide + amide | T_bubble | 1 | 19 | 0.86 K | 2.29 K | nNDimethylacetamide-nNDimethylformamide 2.29 K |
| amide + aromatic amine/N-heterocycle | T_bubble | 1 | 27 | 0.96 K | 9.99 K | aniline-nNDimethylformamide 9.99 K |
| amide + aromatic hydrocarbon | P_bubble | 2 | 91 | 1.29 % | 6.97 % | nNDimethylacetamide-toluene 7.63 % |
| amide + ether | P_bubble | 1 | 52 | 1.54 % | 12.40 % | diNButylEther-nNDimethylacetamide 12.40 % |
| aromatic hydrocarbon + aromatic hydrocarbon | T_bubble | 1 | 71 | 1.08 K | 0.59 K | ethylBenzene-styrene 0.59 K |
| aromatic hydrocarbon + ether | P_bubble | 4 | 90 | 0.78 % | 3.47 % | tertButylEthylEther-toluene 6.21 % |
| aromatic hydrocarbon + halogenated | T_bubble | 1 | 26 | 0.13 K | 0.13 K | ethylBenzene-monochlorobenzene 0.13 K |
| aromatic hydrocarbon + sulfur | P_bubble | 1 | 12 | 0.29 % | 1.66 % | dimethylDisulfide-toluene 1.66 % |
| ester/carbonate + halogenated | P_bubble | 1 | 18 | 0.70 % | 6.48 % | Dichloroethane-ethylAcetate 6.48 % |
| ester/carbonate + nitrile | T_bubble | 1 | 30 | 0.15 K | 2.17 K | acetonitrile-ethylAcetate 2.17 K |
| ester/carbonate + sulfur | P_bubble | 1 | 9 | 0.11 % | 1.01 % | diethylSulfide-nPropylAcetate 1.01 % |
| ether + halogenated | P_bubble | 1 | 48 | 1.14 % | 32.03 % | chloroform-methylTertButylEther 32.03 % |
| ether + sulfur | P_bubble | 1 | 10 | 0.33 % | 8.09 % | dimethylDisulfide-tertButylEthylEther 8.09 % |
| halogenated + ketone | P_bubble | 1 | 20 | 1.16 % | 42.44 % | chloroform-methylEthylKetone 42.44 % |
| **all** | T_bubble | 31 | 1446 | 0.28 K | 0.96 K | |
| **all** | P_bubble | 55 | 1298 | 0.87 % | 4.50 % | |

**Reading it.**  Where the molecules are alike -- hydrocarbons among
themselves, aromatics with halogenated aromatics, alkanes with ethers --
the prediction is within 0.1-1 K or about 1 %, close to the fit.  Alcohols
with anything are a few K or a few % off: the single hydrogen-bond constant
of the 2002 form is fitted to water only (Ferrarini p. 13).  The failures are
specific and teachable: chloroform with a ketone (42 %) or an ether (32 %),
the classic NEGATIVE deviators, where the C-H...O hydrogen bond decides the
sign (chloroform's profile does carry 7.9 A^2 beyond the 0.01008 e/A^2 cutoff,
so the term is not simply missing; why its single water-fitted c_HB misprices
it was not investigated);
amides (DMAc, DMF: 10-19 %); alcohol + ether by pressure (17.7 %).  Overall
the prediction is 3-5 times further from the measurements than the fit --
0.96 K against 0.28 K, 4.5 % against 0.87 % -- which is the honest size of
"no data needed".  The tutorial `cosmoSAC03_ethanol_water_predictive` shows
the same on one system: a good average temperature and no azeotrope.

## 7  What was not done

* **No measured plant or published COSMO-SAC table is reproduced.**
  Ferrarini 2018 gives only aggregate fit statistics over undisclosed data
  (AAD 0.2106 on 760 mixtures; 0.3769 on 3013) and two VLE pressure AARDs over
  plotted points; nothing was digitised.  Bell 2020 is the reference for the
  2002 equations, not for these constants.
* **The reading is a selection**, made on Lin & Sandler Table 2 by the
  architect; the paper does not state it.  A written statement from the LVPP
  group (or their JCOSMO source) would settle it.
* **CS25 / release v25 is not usable** (unpublished terms) and nothing from v25
  is shipped.  GMHB1808 (multi-hydrogen-bond, same profiles) is not built: its
  acceptor classes are defined only in a self-contradictory README.
* **17 ambiguous molecules** are not in the catalogue; choosing a conformer
  (lowest energy, or LVPP's own calibration file) is a decision left open.
* **Temperature dependence** of the hydrogen-bond term and any dispersion
  term are not in the 2002 form and are not added.
* **No WASM rebuild, no full sweep, no `--gui`** in this slice: see the
  commit messages for what was run.
