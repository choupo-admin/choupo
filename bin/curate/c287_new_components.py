#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""c287_new_components.py -- NEW catalogue components from the ThermoML archive
(DEV.md 4c C287, slice 1; Vitor 2026-11-10: "o que eu quero e criar
componentes novos e binarios").

    bin/curate/c287_new_components.py plan
    bin/curate/c287_new_components.py write <name>... | all  [--provisional]

SLICE 2 (DEV.md 4c C292): CANDIDATES2 / ESTIMATED are the compounds whose archive
carries NO measured critical constant.  Tc and Pc are ESTIMATED by Joback (the
estimateComponent formulas, origin estimated, per value), the Tb a measured one
only (a Joback Tb is not stored: WRITE_ESTIMATED_TB), omega from the fitted
Antoine at 0.7 Tc(estimated) when within 50 K of the data else the candidate is
HELD and printed with the distance.  Flow per component: `write --provisional`,
`choupo-thermoml identity`, `choupo-curate vp <c> --number N`, `vp --promote`,
`write` (final omega), then `choupo-curate revert <c>` + `vp --promote` + `write`
again (the AmbroseWalton comparison the promotion records depends on omega).

WHAT IT DOES.  For compounds the catalogue does NOT carry, and that the local
ThermoML cache (thirdParty/thermoml, a finding aid -- the articles are the
sources) measures for vapour pressure, liquid density, liquid heat capacity
AND critical constants, it writes data/standards/components/<name>.dat:

  * Tc, Pc     MEASURED: the median of the per-article medians, every DOI
               named, the spread (min-max of every reported value) stated.
  * Tb         MEASURED where the archive reports a boiling temperature at
               100-102.5 kPa (median, DOIs); otherwise ABSENT, said in the
               header -- never a Tb read back off the fitted curve (that
               would make the vapour-pressure pipeline's Tb criterion test a
               curve against itself) and never a group estimate.
  * vaporPressure  written as the AmbroseWalton block `bin/choupo-curate vp`
               replaces; that pipeline (C281/C283/C285) fits, grades and
               promotes the Antoine.  THIS tool never fits a vapour pressure.
  * omega      from the vapour pressure the pipeline FITTED (its case's
               RESULT paragraph), omega = -log10(Psat(0.7 Tc)/Pc) - 1 (the
               definition), extrapolated where the data stop below 0.7 Tc --
               the distance is written in the provenance; beyond 50 K (a
               stated default) the component is HELD, not written.  `--provisional`
               writes a placeholder (0.5, origin placeholder) so the pipeline
               can run before the fit exists; a record is never committed so.
  * Vliq       FITTED: the one parameter of the engine's OWN liquid density
               (ThermoPackage::density, liquid branch: V(T) = Vliq
               Rackett(T)/Rackett(298.15 K) with the record's Tc, Pc, omega)
               to every measured liquid density at or below 200 kPa, every
               laboratory (C283 amended): least squares in the relative
               density error, points beyond 15 % discarded by name and the
               least squares repeated once, then the largest relative error
               minimised (closed form for one parameter); graded on that
               maximum, clean / warning / severe / refused at 5 / 10 / 20 %
               (C285).  `fitGrade` in its provenance entry.
  * liquidHeatCapacity  FITTED: a polynomial in T (degree 2 with >= 6 points
               over >= 30 K, 1 with >= 3 over >= 10 K, else a constant) to
               every measured liquid isobaric heat capacity at or below
               200 kPa, the same two-stage objective, outlier rule and grade.
  * idealGasHeatCapacity, standardThermochemistry  ESTIMATED by Joback
               (data/standards/parameters/Joback.dat, the table the engine's
               estimateComponent reads; the case
               data/curation/batches/new_components reproduces
               every number); s_298 DERIVED as (dHf - dGf)/298.15 plus the
               elements' standard entropies (CODATA Key Values).  The archive
               carries no enthalpy of formation or combustion block for any
               of them (searched; two articles name one in a title only).
  * reviewStatus autoPromoted; review { by none; } (C300) -- on the record AND on
               every per-value entry a machine decided, so the loader voices
               each (src/thermo/Database.cpp).

NO MEASURED SERIES IS WRITTEN INTO THE TREE (Vitor, 2026-11-10): the record
carries parameters, DOIs, the article files' sha256 and the counts; the points
are regenerated from the cache by this tool.

EXCLUDED, BY NAME (plan prints them): a compound the catalogue already holds
under an identity the bridge did not resolve (HFO-1234ze(E) = R1234zeE); an
identity that is not one substance (ethyl nonafluorobutyl ether: three CAS,
the commercial fluid an n/iso mixture); a structure Joback cannot express
(N-methylpiperidine, N-formylmorpholine: no ring tertiary-amine group in the
table); no usable vapour-pressure study for the pipeline (1,2-dimethoxyethane,
N-methylformamide: every study fewer than 5 points).
"""
import collections
import hashlib
import json
import math
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
import os
CACHE = (Path(os.environ["CHOUPO_THERMOML_HOME"]) if os.environ.get("CHOUPO_THERMOML_HOME")
         else ROOT / "thirdParty" / "thermoml")
STD = ROOT / "data" / "standards" / "components"
JOBACK = ROOT / "data" / "standards" / "parameters" / "Joback.dat"
sys.path.insert(0, str(ROOT / "bin" / "curate"))
import curation_roots  # noqa: E402  (where a curation case lives: ONE home, DEV.md 4c C295)
REPRO_CASE = f"{curation_roots.CURATION_REL}/batches/new_components"
REPRO_CASE2 = f"{curation_roots.CURATION_REL}/batches/new_components_estimated"
TOOL = "bin/curate/c287_new_components.py"

#  name, InChIKey, formula, CAS (PubChem by InChIKey; the identity bridge
#  re-derives InChIKey from CAS through two resolvers that must agree),
#  Joback groups (atom count checked against the formula below).
CANDIDATES = [
    ("di2EthylhexylPhthalate", "BJQHLKABXJIVAM-UHFFFAOYSA-N", "C24H38O4", "117-81-7",
     "bis(2-ethylhexyl) phthalate",
     [("CH3", 4), ("CH2", 10), ("CH", 2), ("ester", 2), ("arC", 2), ("arCH", 4)]),
    ("2Ethoxyethanol", "ZNQVEEAIQZEUHB-UHFFFAOYSA-N", "C4H10O2", "110-80-5",
     "2-ethoxyethanol", [("CH3", 1), ("CH2", 3), ("ether", 1), ("OH", 1)]),
    ("ethylOctanoate", "YYZUSRORWSJGET-UHFFFAOYSA-N", "C10H20O2", "106-32-1",
     "ethyl octanoate", [("CH3", 2), ("CH2", 7), ("ester", 1)]),
    ("13Propanediamine", "XFNJVJPLKCPIBV-UHFFFAOYSA-N", "C3H10N2", "109-76-2",
     "1,3-propanediamine", [("CH2", 3), ("NH2", 2)]),
    ("16Hexanediamine", "NAQMVNRVTILPCV-UHFFFAOYSA-N", "C6H16N2", "124-09-4",
     "1,6-hexanediamine", [("CH2", 6), ("NH2", 2)]),
    ("13Propanediol", "YPFDHNVEDLHUCE-UHFFFAOYSA-N", "C3H8O2", "504-63-2",
     "1,3-propanediol", [("CH2", 3), ("OH", 2)]),
    ("13Butanediol", "PUPZLCDOIYMWBV-UHFFFAOYSA-N", "C4H10O2", "107-88-0",
     "1,3-butanediol", [("CH3", 1), ("CH2", 2), ("CH", 1), ("OH", 2)]),
    ("methylTetradecanoate", "ZAZKJZBWRNNLDS-UHFFFAOYSA-N", "C15H30O2", "124-10-7",
     "methyl tetradecanoate (methyl myristate)", [("CH3", 2), ("CH2", 12), ("ester", 1)]),
    ("16Hexanediol", "XXMIOPMDWAUFGU-UHFFFAOYSA-N", "C6H14O2", "629-11-8",
     "1,6-hexanediol", [("CH2", 6), ("OH", 2)]),
    ("allylAlcohol", "XXROGKLTLUQVRX-UHFFFAOYSA-N", "C3H6O", "107-18-6",
     "allyl alcohol (prop-2-en-1-ol)", [("eCH2", 1), ("eCH", 1), ("CH2", 1), ("OH", 1)]),
    ("glycerylTrioctanoate", "VLPFTAMPNXLGLX-UHFFFAOYSA-N", "C27H50O6", "538-23-8",
     "glyceryl trioctanoate (tricaprylin)", [("CH3", 3), ("CH2", 20), ("CH", 1), ("ester", 3)]),
    ("33Oxydipropanol", "SZXQTJUDPRGNJN-UHFFFAOYSA-N", "C6H14O3", "2396-61-4",
     "3,3'-oxydipropan-1-ol", [("CH2", 6), ("ether", 1), ("OH", 2)]),
    ("glycerylTridecanoate", "LADGBHLMCUINGV-UHFFFAOYSA-N", "C33H62O6", "621-71-6",
     "glyceryl tridecanoate (tricaprin)", [("CH3", 3), ("CH2", 26), ("CH", 1), ("ester", 3)]),
    ("methylLevulinate", "UAGJVSRUFNSIHR-UHFFFAOYSA-N", "C6H10O3", "624-45-3",
     "methyl levulinate (methyl 4-oxopentanoate)",
     [("CH3", 2), ("CH2", 2), ("ketone", 1), ("ester", 1)]),
    ("ethylLevulinate", "GMEONFUTDYJSNV-UHFFFAOYSA-N", "C7H12O3", "539-88-8",
     "ethyl levulinate (ethyl 4-oxopentanoate)",
     [("CH3", 2), ("CH2", 3), ("ketone", 1), ("ester", 1)]),
    ("butylLevulinate", "ISBWNEKJSSLXOD-UHFFFAOYSA-N", "C9H16O3", "2052-15-5",
     "butyl levulinate (butyl 4-oxopentanoate)",
     [("CH3", 2), ("CH2", 5), ("ketone", 1), ("ester", 1)]),
]

CANDIDATES2 = [
    ('geraniol', 'GLZPCOQZEFWAFX-JXMROGBWSA-N', 'C10H18O', '106-24-1',
     '(E)-3,7-dimethyl-2,6-octadien-1-ol', [('CH3', 3), ('CH2', 3), ('eCH', 2), ('eC', 2), ('OH', 1)]),
    ('cis3Hexen1ol', 'UFLHIIWVXFIJGU-ARJAWSKDSA-N', 'C6H12O', '928-96-1',
     '(Z)-3-hexen-1-ol', [('CH3', 1), ('CH2', 3), ('eCH', 2), ('OH', 1)]),
    ('12Butanediol', 'BMRWNKZVCUKKSR-UHFFFAOYSA-N', 'C4H10O2', '584-03-2',
     '1,2-butanediol', [('CH3', 1), ('CH2', 2), ('CH', 1), ('OH', 2)]),
    ('12Dibromobenzene', 'WQONPSCCEXUXTQ-UHFFFAOYSA-N', 'C6H4Br2', '583-53-9',
     '1,2-dibromobenzene', [('arCH', 4), ('arC', 2), ('Br', 2)]),
    ('12Propanediol', 'DNIAPMSPPWPWGF-UHFFFAOYSA-N', 'C3H8O2', '57-55-6',
     '1,2-propanediol', [('CH3', 1), ('CH2', 1), ('CH', 1), ('OH', 2)]),
    ('eucalyptol', 'WEEGYLXZBRQIMU-UHFFFAOYSA-N', 'C10H18O', '470-82-6',
     '1,3,3-trimethyl-2-oxabicyclo[2.2.2]octane', [('CH3', 3), ('rC', 2), ('rCH', 1), ('rCH2', 4), ('etherRing', 1)]),
    ('13Dibromobenzene', 'JSRLURSZEMLAFO-UHFFFAOYSA-N', 'C6H4Br2', '108-36-1',
     '1,3-dibromobenzene', [('arCH', 4), ('arC', 2), ('Br', 2)]),
    ('13Dioxolane', 'WNXJIVFYUVYPPR-UHFFFAOYSA-N', 'C3H6O2', '646-06-0',
     '1,3-dioxolane', [('rCH2', 3), ('etherRing', 2)]),
    ('1Bromobutane', 'MPPPKRYCTPRNTB-UHFFFAOYSA-N', 'C4H9Br', '109-65-9',
     '1-bromobutane', [('CH3', 1), ('CH2', 3), ('Br', 1)]),
    ('1Chlorobutane', 'VFWCMGCRMGJXDK-UHFFFAOYSA-N', 'C4H9Cl', '109-69-3',
     '1-chlorobutane', [('CH3', 1), ('CH2', 3), ('Cl', 1)]),
    ('1Iodohexane', 'ANOOTOPTCJRUPK-UHFFFAOYSA-N', 'C6H13I', '638-45-9',
     '1-iodohexane', [('CH3', 1), ('CH2', 5), ('I', 1)]),
    ('1Octanamine', 'IOQPZZOEVPZRBK-UHFFFAOYSA-N', 'C8H19N', '111-86-4',
     '1-octanamine', [('CH3', 1), ('CH2', 7), ('NH2', 1)]),
    ('1Pentanamine', 'DPBLXKKOBLCELK-UHFFFAOYSA-N', 'C5H13N', '110-58-7',
     '1-pentanamine', [('CH3', 1), ('CH2', 4), ('NH2', 1)]),
    ('1Phenylethanol', 'WAPNOHKVXSQRPX-UHFFFAOYSA-N', 'C8H10O', '98-85-1',
     '1-phenylethanol', [('CH3', 1), ('CH', 1), ('arC', 1), ('arCH', 5), ('OH', 1)]),
    ('1Propoxy2Propanol', 'FENFUOGYJVOCRY-UHFFFAOYSA-N', 'C6H14O2', '1569-01-3',
     '1-propoxy-2-propanol', [('CH3', 2), ('CH2', 3), ('CH', 1), ('ether', 1), ('OH', 1)]),
    ('1HPerfluorooctane', 'KBHBUUBXEQUIMV-UHFFFAOYSA-N', 'C8HF17', '335-65-9',
     '1H-perfluorooctane', [('CH', 1), ('C', 7), ('F', 17)]),
    ('diethyleneGlycolMonohexylEther', 'GZMAAYIALGURDQ-UHFFFAOYSA-N', 'C10H22O3', '112-59-4',
     '2-(2-hexyloxyethoxy)ethanol', [('CH3', 1), ('CH2', 9), ('ether', 2), ('OH', 1)]),
    ('nEthylethanolamine', 'MIJDSYMOBYNHOT-UHFFFAOYSA-N', 'C4H11NO', '110-73-6',
     '2-(ethylamino)ethanol', [('CH3', 1), ('CH2', 3), ('NH', 1), ('OH', 1)]),
    ('2Butoxyethanol', 'POAOYUHQDCAZBD-UHFFFAOYSA-N', 'C6H14O2', '111-76-2',
     '2-butoxyethan-1-ol', [('CH3', 1), ('CH2', 5), ('ether', 1), ('OH', 1)]),
    ('2Chlorotoluene', 'IBSQPLPBRSHTTG-UHFFFAOYSA-N', 'C7H7Cl', '95-49-8',
     '2-chlorotoluene', [('CH3', 1), ('arC', 2), ('arCH', 4), ('Cl', 1)]),
    ('2Heptanol', 'CETWDUZRCINIHU-UHFFFAOYSA-N', 'C7H16O', '543-49-7',
     '2-heptanol', [('CH3', 2), ('CH2', 4), ('CH', 1), ('OH', 1)]),
    ('chavibetol', 'RRAFCDWBNXTKKO-UHFFFAOYSA-N', 'C10H12O2', '97-53-0',
     '2-hydroxy-5-allylanisole', [('CH3', 1), ('CH2', 1), ('eCH2', 1), ('eCH', 1), ('arCH', 3), ('arC', 3), ('OHar', 1), ('ether', 1)]),
    ('nIsopropylethanolamine', 'RILLZYSZSDGYGV-UHFFFAOYSA-N', 'C5H13NO', '109-56-8',
     '2-isopropylaminoethanol', [('CH3', 2), ('CH', 1), ('CH2', 2), ('NH', 1), ('OH', 1)]),
    ('2Methoxyethanol', 'XNWFRZJHXBZDAG-UHFFFAOYSA-N', 'C3H8O2', '109-86-4',
     '2-methoxyethan-1-ol', [('CH3', 1), ('CH2', 2), ('ether', 1), ('OH', 1)]),
    ('2Methyl24Pentanediol', 'SVTBMSDMJJWYQN-UHFFFAOYSA-N', 'C6H14O2', '107-41-5',
     '2-methyl-2,4-pentanediol', [('CH3', 3), ('C', 1), ('CH2', 1), ('CH', 1), ('OH', 2)]),
    ('2Methyltetrahydrofuran', 'JWUJQDFVADABEY-UHFFFAOYSA-N', 'C5H10O', '96-47-9',
     '2-methyltetrahydrofuran', [('CH3', 1), ('rCH', 1), ('rCH2', 3), ('etherRing', 1)]),
    ('2Octanol', 'SJWFXCIHNDVPSH-UHFFFAOYSA-N', 'C8H18O', '123-96-6',
     '2-octanol', [('CH3', 2), ('CH2', 5), ('CH', 1), ('OH', 1)]),
    ('2Propoxyethanol', 'YEYKMVJDLWJFOA-UHFFFAOYSA-N', 'C5H12O2', '2807-30-9',
     '2-propoxyethanol', [('CH3', 1), ('CH2', 4), ('ether', 1), ('OH', 1)]),
    ('3Chlorotoluene', 'OSOUNOBYRMOXQQ-UHFFFAOYSA-N', 'C7H7Cl', '108-41-8',
     '3-chlorotoluene', [('CH3', 1), ('arC', 2), ('arCH', 4), ('Cl', 1)]),
    ('4Chlorotoluene', 'NPDACUSDTOMAMK-UHFFFAOYSA-N', 'C7H7Cl', '106-43-4',
     '4-chlorotoluene', [('CH3', 1), ('arC', 2), ('arCH', 4), ('Cl', 1)]),
    ('3Methyl2Butanol', 'MXLMTQWGSQIYOW-UHFFFAOYSA-N', 'C5H12O', '598-75-4',
     '3-methyl-2-butanol', [('CH3', 3), ('CH', 2), ('OH', 1)]),
    ('3Methyl1Butanol', 'PHTQWCKDNZKARW-UHFFFAOYSA-N', 'C5H12O', '123-51-3',
     '3-methylbutan-1-ol', [('CH3', 2), ('CH', 1), ('CH2', 2), ('OH', 1)]),
    ('3Pentanol', 'AQIXEPGDORPWBJ-UHFFFAOYSA-N', 'C5H12O', '584-02-1',
     '3-pentanol', [('CH3', 2), ('CH2', 2), ('CH', 1), ('OH', 1)]),
    ('diethyleneGlycolDibutylEther', 'KZVBBTZJMSWGTK-UHFFFAOYSA-N', 'C12H26O3', '112-73-2',
     '5,8,11-trioxapentadecane', [('CH3', 2), ('CH2', 10), ('ether', 3)]),
    ('NMethyl13Diaminopropane', 'QHJABUZHRJTCAR-UHFFFAOYSA-N', 'C4H12N2', '6291-84-5',
     'N-methyl-1,3-diaminopropane', [('CH3', 1), ('CH2', 3), ('NH', 1), ('NH2', 1)]),
    ('methylRicinoleate', 'XKGDWZQXVZSXAO-UHFFFAOYSA-N', 'C19H36O3', '23224-20-6',
     '[R]-methyl 12-hydroxy-9-octadecenoate', [('CH3', 2), ('CH2', 13), ('CH', 1), ('eCH', 2), ('OH', 1), ('ester', 1)]),
    ('benzylamine', 'WGQKYBSKWIADBV-UHFFFAOYSA-N', 'C7H9N', '100-46-9',
     'benzylamine', [('arC', 1), ('arCH', 5), ('CH2', 1), ('NH2', 1)]),
    ('cyclopentanol', 'XCIXKGXIYUWCLL-UHFFFAOYSA-N', 'C5H10O', '96-41-3',
     'cyclopentanol', [('rCH2', 4), ('rCH', 1), ('OH', 1)]),
    ('1Decanol', 'MWKFXSUHUHTGQN-UHFFFAOYSA-N', 'C10H22O', '112-30-1',
     'decan-1-ol', [('CH3', 1), ('CH2', 9), ('OH', 1)]),
    ('diethyleneGlycolDiethylEther', 'RRQYJINTUHWNHW-UHFFFAOYSA-N', 'C8H18O3', '112-36-7',
     'diethylene glycol diethyl ether', [('CH3', 2), ('CH2', 6), ('ether', 3)]),
    ('diIsobutylEther', 'SZNYYWIUQFZLLT-UHFFFAOYSA-N', 'C8H18O', '628-55-7',
     'diisobutyl ether', [('CH3', 4), ('CH', 2), ('CH2', 2), ('ether', 1)]),
    ('diphenylEther', 'USIUVYZYUHIAEV-UHFFFAOYSA-N', 'C12H10O', '101-84-8',
     'diphenyl ether', [('arCH', 10), ('arC', 2), ('ether', 1)]),
    ('ethylDecanoate', 'RGXWDWUGBIJHDO-UHFFFAOYSA-N', 'C12H24O2', '110-38-3',
     'ethyl decanoate', [('CH3', 2), ('CH2', 9), ('ester', 1)]),
    ('ethylDodecanoate', 'MMXKVMNBHPAILY-UHFFFAOYSA-N', 'C14H28O2', '106-33-2',
     'ethyl dodecanoate', [('CH3', 2), ('CH2', 11), ('ester', 1)]),
    ('exoTetrahydrodicyclopentadiene', 'LPSXSORODABQKT-FIRGSJFUSA-N', 'C10H16', '2825-82-3',
     'exo-tetrahydrodicyclopentadiene', [('rCH', 4), ('rCH2', 6)]),
    ('hexafluorobenzene', 'ZQBFAOFFOQMSGJ-UHFFFAOYSA-N', 'C6F6', '392-56-3',
     'hexafluorobenzene', [('arC', 6), ('F', 6)]),
    ('methylButanoate', 'UUIQMZJEGPQKFD-UHFFFAOYSA-N', 'C5H10O2', '623-42-7',
     'methyl butanoate', [('CH3', 2), ('CH2', 2), ('ester', 1)]),
    ('methylDecanoate', 'YRHYCMZPEVDGFQ-UHFFFAOYSA-N', 'C11H22O2', '110-42-9',
     'methyl decanoate', [('CH3', 2), ('CH2', 8), ('ester', 1)]),
    ('methylDodecanoate', 'UQDUPQYQJKYHQI-UHFFFAOYSA-N', 'C13H26O2', '111-82-0',
     'methyl dodecanoate', [('CH3', 2), ('CH2', 10), ('ester', 1)]),
    ('methylHeptanoate', 'XNCNNDVCAUWAIT-UHFFFAOYSA-N', 'C8H16O2', '106-73-0',
     'methyl heptanoate', [('CH3', 2), ('CH2', 5), ('ester', 1)]),
    ('methylHexanoate', 'NUKZAGXMHTUAFE-UHFFFAOYSA-N', 'C7H14O2', '106-70-7',
     'methyl hexanoate', [('CH3', 2), ('CH2', 4), ('ester', 1)]),
    ('methylOctanoate', 'JGHZJRVDZXSNKQ-UHFFFAOYSA-N', 'C9H18O2', '111-11-5',
     'methyl octanoate', [('CH3', 2), ('CH2', 6), ('ester', 1)]),
    ('1Nonanol', 'ZWRUINPWMLAQRD-UHFFFAOYSA-N', 'C9H20O', '143-08-8',
     'nonan-1-ol', [('CH3', 1), ('CH2', 8), ('OH', 1)]),
    ('1Octanol', 'KBPLFHHGFOOTCA-UHFFFAOYSA-N', 'C8H18O', '111-87-5',
     'octan-1-ol', [('CH3', 1), ('CH2', 7), ('OH', 1)]),
    ('pentaerythritolTetranonanoate', 'IBKKMFMBXQARGV-UHFFFAOYSA-N', 'C41H76O8', '14450-05-6',
     'pentaerythritol tetranonanoate', [('CH3', 4), ('CH2', 32), ('C', 1), ('ester', 4)]),
    ('pentaerythritolTetrapentanoate', 'ZQYCVIGMGPFQQS-UHFFFAOYSA-N', 'C25H44O8', '15834-04-5',
     'pentaerythritol tetrapentanoate', [('CH3', 4), ('CH2', 16), ('C', 1), ('ester', 4)]),
    ('tetradecanoicAcid', 'TUNFSRHWOTWDNC-UHFFFAOYSA-N', 'C14H28O2', '544-63-8',
     'tetradecanoic acid', [('CH3', 1), ('CH2', 12), ('acid', 1)]),
    ('tetrahydropyran', 'DHXVGJBLRPWPCS-UHFFFAOYSA-N', 'C5H10O', '142-68-7',
     'tetrahydropyran', [('rCH2', 5), ('etherRing', 1)]),
]

#  DEV.md 4c C292 (slice 2): compounds whose archive carries NO measured critical
#  constant.  Tc, Pc are ESTIMATED by Joback (the estimateComponent formulas)
#  and marked so; Tb is measured where the archive reports it, else Joback.
ESTIMATED = {c[0] for c in CANDIDATES2}
CANDIDATES = CANDIDATES + CANDIDATES2

#  HELD (DEV.md 4c C287): every value fitted and graded, the vapour-pressure
#  fit PROMOTABLE, but 0.7 Tc lies more than OMEGA_MAX_EXTRAPOLATION_K
#  beyond the measured vapour pressures, so omega (the definition, at
#  Tr = 0.7) would be an extrapolation of an Antoine by 58-237 K.  Their
#  records and cases are not shipped until Vitor rules how omega is taken.
HELD = ["25Dimethylfuran", "epichlorohydrin", "222Trifluoroethanol", "2HydroxyethylAcetate",
        "methylTetradecanoate", "13Propanediamine", "di2EthylhexylPhthalate",
        "ethylLevulinate", "16Hexanediamine", "butylLevulinate",
        "glycerylTrioctanoate", "glycerylTridecanoate"]

EXCLUDED = [
    ("CDOOAUSHHFGWSA-OWOJBTEDSA-N", "HFO-1234ze(E)",
     "already in the catalogue as R1234zeE (its CAS did not resolve in the identity bridge)"),
    ("DFUYAWQUODQGFF-UHFFFAOYSA-N", "1-ethoxy-nonafluorobutane",
     "identity ambiguous: PubChem lists three CAS (631897-30-8, 163702-05-4, "
     "813458-04-7); the commercial fluid is an n/iso isomer mixture"),
    ("PAMIQIKDUOTOBW-UHFFFAOYSA-N", "N-methylpiperidine",
     "Joback has no ring tertiary-amine group: its Cp_ig and formation data cannot be estimated"),
    ("LCEDQNDDFOCWGG-UHFFFAOYSA-N", "N-formylmorpholine",
     "Joback has no ring tertiary-amine group: its Cp_ig and formation data cannot be estimated"),
    ("XTHFKEDIFFGKHM-UHFFFAOYSA-N", "1,2-dimethoxyethane",
     "no vapour-pressure study with >= 5 points (four articles, one point each)"),
    ("ATHHXGZTWNVVOU-UHFFFAOYSA-N", "N-methylformamide",
     "no vapour-pressure study with >= 5 points (three articles, four points)"),
]

# --------------------------------------------------------------------------
#  DEV.md 4c C309 (Vitor, "o maximo de compostos"): slice 3.  The compounds
#  outside the catalogue that block the most archive VLE pairs, with the
#  literature Vitor added to ~/Choupo-Literature on 2026-11-11.
#
#  Tc, Pc: the IUPAC series RECOMMENDED value where it gives one (the newest
#  part that lists the compound wins: Part 12 revises Parts 7-10), with the
#  evaluators' uncertainty and the citation of THAT part; else the ThermoML
#  median (slice 1's route); else Joback, marked (slice 2's route).  Each of
#  Tc and Pc takes its own route: a Part that recommends Tc alone leaves Pc to
#  Joback.  Every value below was transcribed by hand from the PDF's Table 1
#  (pdftotext -layout), one row per compound, and re-read.
#
#  liquid Cp: every measured value the archive locates (slice 1's fit); where
#  it locates none, the Zabransky RECOMMENDED polynomial (Supplement I or II,
#  their Eq. 19, C/R = sum_j A_{j+1} (T/100)^j, R = 8.31451 J/(mol K)) where
#  the supplement gives one (a supplement lists only compounds with new data;
#  the 1996 monograph's correlations are not in hand); else the
#  Rowlinson-Bondi corresponding-states ESTIMATE (rowlinson_bondi below),
#  marked so -- never silently.
# --------------------------------------------------------------------------
IUPAC_PARTS = {
    "P7": ("Kudchadker, A.P.; Ambrose, D.; Tsonopoulos, C. Vapor-Liquid Critical Properties of "
           "Elements and Compounds. 7. Oxygen Compounds Other Than Alkanols and Cycloalkanols. "
           "J. Chem. Eng. Data 46 (2001) 457-479, Table 1 (recommended values)", "10.1021/je0001680"),
    "P8": ("Tsonopoulos, C.; Ambrose, D. Vapor-Liquid Critical Properties of Elements and Compounds. "
           "8. Organic Sulfur, Silicon, and Tin Compounds (C + H + S, Si, and Sn). J. Chem. Eng. Data "
           "46 (2001) 480-485, Table 1 (recommended values)", "10.1021/je000210r"),
    "P9": ("Marsh, K.N. et al. Vapor-Liquid Critical Properties of Elements and Compounds. 9. Organic "
           "Compounds Containing Nitrogen. J. Chem. Eng. Data 51 (2006) 305-314, Table 1 "
           "(recommended values)", "10.1021/je050221q"),
    "P10": ("Marsh, K.N. et al. Vapor-Liquid Critical Properties of Elements and Compounds. 10. Organic "
            "Compounds Containing Halogens. J. Chem. Eng. Data 52 (2007) 1509-1538, Table 1 "
            "(recommended values)", "10.1021/je700336g"),
    "P12": ("Ambrose, D.; Tsonopoulos, C.; Nikitin, E.D.; Morton, D.W.; Marsh, K.N. Vapor-Liquid "
            "Critical Properties of Elements and Compounds. 12. Review of Recent Data for Hydrocarbons "
            "and Non-hydrocarbons. J. Chem. Eng. Data (2015, the ASAP article; volume and pages not in "
            "the file), Table 1 (recommended values, revising Parts 1-11)", "10.1021/acs.jced.5b00571"),
}
#  name: {"Tc": (K, +-K, part), "Pc": (MPa, +-MPa, part)}; a key absent = the
#  series recommends no value for it.
IUPAC = {
    "tetrachloroethylene":   {"Tc": (611.0, 5.0, "P10")},
    "ethylPropionate":       {"Tc": (546.3, 0.4, "P12"), "Pc": (3.39, 0.2, "P12")},
    "nButylFormate":         {"Tc": (566.0, 2.0, "P12")},
    "ethylButanoate":        {"Tc": (569.6, 0.3, "P12"), "Pc": (2.90, 0.05, "P12")},
    "nButylPropionate":      {"Tc": (594.5, 1.0, "P7")},
    "pyrrole":               {"Tc": (640.0, 2.0, "P9"), "Pc": (5.7, 0.8, "P9")},
    "isopentylAcetate":      {"Tc": (586.1, 1.0, "P7"), "Pc": (2.76, 0.05, "P7")},
    "2Chlorobutane":         {"Tc": (518.6, 0.6, "P10")},
    "1Methoxy2Propanol":     {"Tc": (579.8, 0.5, "P7"), "Pc": (4.11, 0.02, "P7")},
    "nPropylPropionate":     {"Tc": (570.0, 1.0, "P7"), "Pc": (3.06, 0.05, "P7")},
    "26Dimethylpyridine":    {"Tc": (624.0, 0.3, "P9"), "Pc": (3.85, 0.05, "P9")},
    "dichloromethane":       {"Tc": (508.0, 0.5, "P10"), "Pc": (6.35, 0.05, "P10")},
    "diethylSuccinate":      {"Tc": (665.0, 7.0, "P12"), "Pc": (2.20, 0.04, "P12")},
    "furan":                 {"Tc": (490.2, 0.5, "P7"), "Pc": (5.3, 0.2, "P7")},
    "perfluorooctane":       {"Tc": (497.0, 0.2, "P12"), "Pc": (1.50, 0.05, "P12")},
    #  batch 2
    "cyclohexylamine":       {"Tc": (626.8, 0.4, "P9")},
    "diNPropylEther":        {"Tc": (531.0, 1.0, "P12"), "Pc": (3.03, 0.05, "P12")},
    "methylPentanoate":      {"Tc": (590.0, 10.0, "P7"), "Pc": (3.20, 0.05, "P7")},
    "tertButylAcetate":      {"Tc": (541.2, 2.0, "P12"), "Pc": (3.04, 0.06, "P12")},
    "1Methoxy2PropylAcetate": {"Tc": (597.8, 1.0, "P7"), "Pc": (3.01, 0.05, "P7")},
    "fluoroethane":          {"Tc": (375.3, 0.5, "P10"), "Pc": (5.04, 0.02, "P10")},
    "pentanenitrile":        {"Tc": (610.3, 0.5, "P9"), "Pc": (3.58, 0.05, "P9")},
    "11Diethoxyethane":      {"Tc": (540.0, 3.0, "P7"), "Pc": (3.22, 0.10, "P7")},
    "pentanoicAcid":         {"Tc": (637.2, 1.0, "P7"), "Pc": (3.63, 0.05, "P7")},
    "cyclopentanone":        {"Tc": (624.0, 3.0, "P7"), "Pc": (4.60, 0.10, "P7")},
    "benzoBThiophene":       {"Tc": (764.0, 2.0, "P8"), "Pc": (4.76, 0.20, "P8")},
    "benzaldehyde":          {"Tc": (693.0, 7.0, "P12"), "Pc": (4.41, 0.1, "P12")},
    "2Methylfuran":          {"Tc": (528.0, 2.0, "P7"), "Pc": (4.7, 0.2, "P7")},
    "nButylButanoate":       {"Tc": (612.1, 1.0, "P7")},
    "ethylHexanoate":        {"Tc": (615.2, 0.1, "P12"), "Pc": (2.53, 0.02, "P12")},
    "diphenylmethane":       {"Tc": (770.0, 10.0, "P12"), "Pc": (2.9, 0.3, "P12")},
    #  UPGRADES (C309 item 2): slice-2 (C292) records that carried Joback Tc/Pc
    #  where the IUPAC series recommends a value.  Only Tc, Pc and the omega
    #  derived from them change; the vapour pressure, liquid Cp and the Joback
    #  ideal-gas/formation values stay as they were.
    "12Butanediol":          {"Tc": (680.0, 5.0, "P7"), "Pc": (5.2, 0.5, "P7")},
    "12Propanediol":         {"Tc": (676.4, 0.6, "P12"), "Pc": (6.0, 0.01, "P12")},
    "1Chlorobutane":         {"Tc": (539.2, 0.5, "P10")},
    "1Propoxy2Propanol":     {"Tc": (605.0, 1.0, "P7"), "Pc": (3.0, 0.05, "P7")},
    "2Butoxyethanol":        {"Tc": (634.0, 1.0, "P7"), "Pc": (3.27, 0.05, "P7")},
    "2Methoxyethanol":       {"Tc": (597.6, 0.2, "P7"), "Pc": (5.28, 0.02, "P7")},
    "2Methyltetrahydrofuran": {"Tc": (537.0, 2.0, "P7"), "Pc": (3.76, 0.1, "P7")},
    "2Propoxyethanol":       {"Tc": (615.0, 1.0, "P7"), "Pc": (3.65, 0.05, "P7")},
    "3Methyl1Butanol":       {"Tc": (577.2, 0.5, "P12"), "Pc": (3.93, 0.02, "P12")},
    "diethyleneGlycolDiethylEther": {"Tc": (612.0, 10.0, "P7")},
    "hexafluorobenzene":     {"Tc": (516.7, 0.1, "P12"), "Pc": (3.28, 0.01, "P12")},
    "methylButanoate":       {"Tc": (554.5, 1.0, "P7"), "Pc": (3.47, 0.05, "P7")},
    "methylDecanoate":       {"Tc": (675.0, 7.0, "P12"), "Pc": (1.93, 0.06, "P12")},
    "methylHeptanoate":      {"Tc": (628.0, 1.0, "P12"), "Pc": (2.53, 0.08, "P12")},
    "methylHexanoate":       {"Tc": (612.0, 6.0, "P12"), "Pc": (2.88, 0.09, "P12")},
    "methylOctanoate":       {"Tc": (646.0, 6.0, "P12"), "Pc": (2.34, 0.07, "P12")},
    "tetradecanoicAcid":     {"Tc": (763.0, 8.0, "P12"), "Pc": (1.64, 0.05, "P12")},
    "tetrahydropyran":       {"Tc": (572.0, 2.0, "P7"), "Pc": (4.77, 0.1, "P7")},
}
#  Zabransky et al. recommended liquid heat capacity: name -> (supplement,
#  table, [A1, A2, ...], (Tlo, Thi), level, type, note).  Eq. 19:
#  C/R = sum_{j>=0} A_{j+1} (T/100)^j.  Levels (their Sect. 4.2.3): I < 0.1 %,
#  II < 0.3 %, III < 0.5 %, IV < 1 %, V < 3 %, VI > 3 %.
ZAB_SUPPLEMENTS = {
    "S1": ("Zabransky, M.; Ruzicka, V., Jr.; Domalski, E.S. Heat Capacity of Liquids: Critical Review "
           "and Recommended Values. Supplement I. J. Phys. Chem. Ref. Data 30 (2001) 1199",
           "10.1063/1.1407866"),
    "S2": ("Zabransky, M.; Kolska, Z.; Ruzicka, V., Jr.; Domalski, E.S. Heat Capacity of Liquids: "
           "Critical Review and Recommended Values. Supplement II. J. Phys. Chem. Ref. Data 39 (2010) "
           "013103", "10.1063/1.3182831"),
}
ZAB_R = 8.31451
ZAB_LEVEL = {"I": "below 0.1 %", "II": "below 0.3 %", "III": "below 0.5 %", "IV": "below 1 %",
             "V": "below 3 %", "VI": "above 3 %"}
ZAB = {
    "isopentylAcetate":   ("S2", "Table 45.43.3 (regression polynomial)", [15.2660, 5.02324],
                           (310.0, 385.0), "II", "sat", ""),
    "26Dimethylpyridine": ("S1", "Table 33.27.3 (cubic spline, first sub-interval)",
                           [14.8696, 1.14493, 0.490649, -0.0136343], (272.6, 520.0), "II", "p",
                           "the second spline piece, 520-600 K (level IV), is not carried: the record "
                           "holds one polynomial"),
    "2Ethyl1Hexanol":     ("S1", "Table 42.67.3 (regression polynomial)", [33.5616, -10.6242, 4.07540],
                           (153.3, 353.1), "IV", "p", ""),
    "2Chlorobutane":      ("S1", "Table 22.52.3 (regression polynomial)", [19.3517],
                           (298.1, 298.1), "V", "p",
                           "ONE selected value at 298.1 K: a constant, no temperature dependence"),
    "nButylFormate":      ("S1", "Table 45.12.3 (regression polynomial)", [24.1116],
                           (298.1, 298.1), "IV", "p",
                           "ONE temperature, 298.1 K: a constant, no temperature dependence"),
    #  batch 2
    "222Trifluoroethanol":    ("S1", "Table 61.8.3 (regression polynomial)", [4.42059, 5.68885],
                               (298.1, 308.1), "III", "p", ""),
    "2Amino2Methyl1Propanol": ("S1", "Table 62.28.3 (regression polynomial)", [2.88532, 8.30421],
                               (298.1, 397.8), "V", "p", ""),
    "cyclopentanone":         ("S1", "Table 43.8.3 (regression polynomial)",
                               [32.5531, -20.1713, 7.79034, -0.870682], (217.8, 327.5), "III", "p", ""),
    "diphenylmethane":        ("S2", "Table 14.62.3 (regression polynomial, the isobaric row)",
                               [9.68345, 8.33547, -0.285938], (302.0, 700.0), "III", "p", ""),
}
#  UNIFAC (original, data/standards/parameters/UNIFAC/groups.dat) subgroups of
#  the C309 compounds, atom-checked against the formula like the Joback list.
#  A compound absent here has no decomposition into the table's subgroups.
UNIFAC = {}
UNIFAC_ATOMS = {"CH3": "CH3", "CH2": "CH2", "CH": "CH", "C": "C", "CH2=C": "CH2C",
                "OH": "OH", "CH3COO": "C2H3O2", "CH2COO": "C2H2O2", "HCOO": "CHO2",
                "COO": "CO2", "CH3O": "CH3O", "C2H4O2": "C2H4O2", "CHCl": "CHCl",
                "CHCl2": "CHCl2", "CH2Cl2": "CH2Cl2", "C4H3S": "C4H3S", "C5H3N": "C5H3N",
                "CF3": "CF3", "CF2": "CF2", "CH2Cl": "CH2Cl", "ACH": "CH", "AC": "C",
                "CH2CO": "C2H2O", "CH3CO": "C2H3O", "CHO": "CHO", "CH2O": "CH2O",
                "CH3N": "CH3N", "CH2NH2": "CH4N", "CHNH2": "CH3N", "CH2CN": "C2H2N",
                "COOH": "CHO2", "FCH2O": "CH2O", "Br": "Br", "I": "I", "CH2=CH": "C2H3",
                "CH=CH": "C2H2", "CH=C": "C2H", "C=C": "C2", "Morpholine": "C4H9NO",
                "C4H4S": "C4H4S", "C4H2S": "C4H2S", "ACCH3": "C2H3", "ACCH2": "C2H2", "CH2N": "CH2N",
                "ACOH": "COH", "CH2SH": "CH3S", "CH3SH": "CH4S"}

CANDIDATES3 = [
    #  name, InChIKey, formula, CAS, label, Joback groups, UNIFAC groups (None = no
    #  decomposition into the table's subgroups)
    ("1122Tetrachloroethane", "QPFMBZIOSGYJDE-UHFFFAOYSA-N", "C2H2Cl4", "79-34-5",
     "1,1,2,2-tetrachloroethane", [("CH", 2), ("Cl", 4)], [("CHCl2", 2)]),
    ("tetrachloroethylene", "CYTYCFOTNPOANT-UHFFFAOYSA-N", "C2Cl4", "127-18-4",
     "tetrachloroethene", [("eC", 2), ("Cl", 4)], None),
    ("ethylPropionate", "FKRCODPIKNYEAC-UHFFFAOYSA-N", "C5H10O2", "105-37-3",
     "ethyl propanoate", [("CH3", 2), ("CH2", 2), ("ester", 1)],
     [("CH3", 2), ("CH2", 1), ("CH2COO", 1)]),
    ("nButylFormate", "NMJJFJNHVMGPGM-UHFFFAOYSA-N", "C5H10O2", "592-84-7",
     "butyl methanoate (butyl formate)", [("CH3", 1), ("CH2", 3), ("aldehyde", 1), ("ether", 1)],
     [("CH3", 1), ("CH2", 3), ("HCOO", 1)]),
    ("ethylButanoate", "OBNCKNCVKJNDBV-UHFFFAOYSA-N", "C6H12O2", "105-54-4",
     "ethyl butanoate", [("CH3", 2), ("CH2", 3), ("ester", 1)],
     [("CH3", 2), ("CH2", 2), ("CH2COO", 1)]),
    ("nButylPropionate", "BTMVHUNTONAYDX-UHFFFAOYSA-N", "C7H14O2", "590-01-2",
     "butyl propanoate", [("CH3", 2), ("CH2", 4), ("ester", 1)],
     [("CH3", 2), ("CH2", 3), ("CH2COO", 1)]),
    ("pyrrole", "KAESVJOAVNADME-UHFFFAOYSA-N", "C4H5N", "109-97-7",
     "pyrrole (1H-pyrrole)", [("arCH", 4), ("rNH", 1)], None),
    ("3Methylthiophene", "QENGPZGAWFQWCZ-UHFFFAOYSA-N", "C5H6S", "616-44-4",
     "3-methylthiophene", [("CH3", 1), ("arCH", 3), ("arC", 1), ("rS", 1)],
     [("CH3", 1), ("C4H3S", 1)]),
    ("isopentylAcetate", "MLFHJEHSLIIPHL-UHFFFAOYSA-N", "C7H14O2", "123-92-2",
     "3-methylbutyl ethanoate (isopentyl acetate)", [("CH3", 3), ("CH", 1), ("CH2", 2), ("ester", 1)],
     [("CH3", 2), ("CH", 1), ("CH2", 2), ("CH3COO", 1)]),
    ("2Chlorobutane", "BSPCSKHALVHRSR-UHFFFAOYSA-N", "C4H9Cl", "78-86-4",
     "2-chlorobutane", [("CH3", 2), ("CH2", 1), ("CH", 1), ("Cl", 1)],
     [("CH3", 2), ("CH2", 1), ("CHCl", 1)]),
    ("1Methoxy2Propanol", "ARXJGSRGQADJSQ-UHFFFAOYSA-N", "C4H10O2", "107-98-2",
     "1-methoxy-2-propanol", [("CH3", 2), ("CH2", 1), ("CH", 1), ("ether", 1), ("OH", 1)],
     [("CH3", 2), ("C2H4O2", 1)]),
    ("ethylLactate", "LZCLXQDLBQLTDK-UHFFFAOYSA-N", "C5H10O3", "97-64-3",
     "ethyl 2-hydroxypropanoate (ethyl lactate, racemic)",
     [("CH3", 2), ("CH2", 1), ("CH", 1), ("OH", 1), ("ester", 1)],
     [("CH3", 2), ("CH2", 1), ("CH", 1), ("OH", 1), ("COO", 1)]),
    ("nPropylPropionate", "MCSINKKTEDDPNK-UHFFFAOYSA-N", "C6H12O2", "106-36-5",
     "propyl propanoate", [("CH3", 2), ("CH2", 3), ("ester", 1)],
     [("CH3", 2), ("CH2", 2), ("CH2COO", 1)]),
    ("26Dimethylpyridine", "OISVCGZHLKNMSJ-UHFFFAOYSA-N", "C7H9N", "108-48-5",
     "2,6-dimethylpyridine (2,6-lutidine)", [("CH3", 2), ("arCH", 3), ("arC", 2), ("reN", 1)],
     [("CH3", 2), ("C5H3N", 1)]),
    ("2Ethyl1Hexanol", "YIWUKEYIRIRTPP-UHFFFAOYSA-N", "C8H18O", "104-76-7",
     "2-ethylhexan-1-ol", [("CH3", 2), ("CH2", 5), ("CH", 1), ("OH", 1)],
     [("CH3", 2), ("CH2", 5), ("CH", 1), ("OH", 1)]),
    ("dichloromethane", "YMWUJEATGCHHMB-UHFFFAOYSA-N", "CH2Cl2", "75-09-2",
     "dichloromethane", [("CH2", 1), ("Cl", 2)], [("CH2Cl2", 1)]),
    ("diethylSuccinate", "DKMROQRQHGEIOW-UHFFFAOYSA-N", "C8H14O4", "123-25-1",
     "diethyl butanedioate (diethyl succinate)", [("CH3", 2), ("CH2", 4), ("ester", 2)],
     [("CH3", 2), ("CH2", 2), ("CH2COO", 2)]),
    ("244Trimethyl1Pentene", "FXNDIJDIPNCZQJ-UHFFFAOYSA-N", "C8H16", "107-39-1",
     "2,4,4-trimethylpent-1-ene", [("eCH2", 1), ("eC", 1), ("CH3", 4), ("CH2", 1), ("C", 1)],
     [("CH2=C", 1), ("CH3", 4), ("CH2", 1), ("C", 1)]),
    ("furan", "YLQBMQCUIZJEEH-UHFFFAOYSA-N", "C4H4O", "110-00-9",
     "furan", [("arCH", 4), ("etherRing", 1)], None),
    ("perfluorooctane", "YVBBRRALBYAZBM-UHFFFAOYSA-N", "C8F18", "307-34-6",
     "octadecafluorooctane (perfluoro-n-octane)", [("C", 8), ("F", 18)], [("CF3", 2), ("CF2", 6)]),
    #  batch 2
    ("cyclohexylamine", "PAFZNILMFXTMIY-UHFFFAOYSA-N", "C6H13N", "108-91-8",
     "cyclohexanamine", [("rCH2", 5), ("rCH", 1), ("NH2", 1)], [("CH2", 5), ("CHNH2", 1)]),
    ("diNPropylEther", "POLCUAVZOMRGSN-UHFFFAOYSA-N", "C6H14O", "111-43-3",
     "dipropyl ether (1-propoxypropane)", [("CH3", 2), ("CH2", 4), ("ether", 1)],
     [("CH3", 2), ("CH2", 3), ("CH2O", 1)]),
    ("epichlorohydrin", "BRLQWZUYTZBJKN-UHFFFAOYSA-N", "C3H5ClO", "106-89-8",
     "1-chloro-2,3-epoxypropane (epichlorohydrin, racemic)",
     [("rCH2", 1), ("rCH", 1), ("etherRing", 1), ("CH2", 1), ("Cl", 1)], None),
    ("2Ethylthiophene", "JCCCMAAJYSNBPR-UHFFFAOYSA-N", "C6H8S", "872-55-9",
     "2-ethylthiophene", [("CH3", 1), ("CH2", 1), ("arCH", 3), ("arC", 1), ("rS", 1)],
     [("CH3", 1), ("CH2", 1), ("C4H3S", 1)]),
    ("methylPentanoate", "HNBDRPTVWVGKBR-UHFFFAOYSA-N", "C6H12O2", "624-24-8",
     "methyl pentanoate", [("CH3", 2), ("CH2", 3), ("ester", 1)],
     [("CH3", 2), ("CH2", 2), ("CH2COO", 1)]),
    ("222Trifluoroethanol", "RHQDFWAXVIIEBN-UHFFFAOYSA-N", "C2H3F3O", "75-89-8",
     "2,2,2-trifluoroethanol", [("CH2", 1), ("C", 1), ("F", 3), ("OH", 1)],
     [("CH2", 1), ("OH", 1), ("CF3", 1)]),
    ("tertButylAcetate", "WMOVHXAZOJBABW-UHFFFAOYSA-N", "C6H12O2", "540-88-5",
     "1,1-dimethylethyl ethanoate (tert-butyl acetate)", [("CH3", 4), ("C", 1), ("ester", 1)],
     [("CH3", 3), ("C", 1), ("CH3COO", 1)]),
    ("2HydroxyethylAcetate", "HXDLWJWIAHWIKI-UHFFFAOYSA-N", "C4H8O3", "542-59-6",
     "2-hydroxyethyl ethanoate (ethylene glycol monoacetate)",
     [("CH3", 1), ("CH2", 2), ("OH", 1), ("ester", 1)], [("CH2", 2), ("OH", 1), ("CH3COO", 1)]),
    ("1Methoxy2PropylAcetate", "LLHKCFNBLRBOGN-UHFFFAOYSA-N", "C6H12O3", "108-65-6",
     "1-methoxy-2-propyl ethanoate (propylene glycol monomethyl ether acetate)",
     [("CH3", 3), ("CH2", 1), ("CH", 1), ("ether", 1), ("ester", 1)],
     [("CH3", 1), ("CH2", 1), ("CH", 1), ("CH3COO", 1), ("CH3O", 1)]),
    ("morpholine", "YNAVUWVOSKDBBP-UHFFFAOYSA-N", "C4H9NO", "110-91-8",
     "morpholine (tetrahydro-1,4-oxazine)", [("rCH2", 4), ("rNH", 1), ("etherRing", 1)],
     [("Morpholine", 1)]),
    ("fluoroethane", "UHCBBWUQDAVSMS-UHFFFAOYSA-N", "C2H5F", "353-36-6",
     "fluoroethane (R161)", [("CH3", 1), ("CH2", 1), ("F", 1)], None),
    ("pentanenitrile", "RFFFKMOABOFIDF-UHFFFAOYSA-N", "C5H9N", "110-59-8",
     "pentanenitrile (valeronitrile)", [("CH3", 1), ("CH2", 3), ("CN", 1)],
     [("CH3", 1), ("CH2", 2), ("CH2CN", 1)]),
    ("23Butanedione", "QSJXEFYPDANLFS-UHFFFAOYSA-N", "C4H6O2", "431-03-8",
     "butane-2,3-dione (diacetyl)", [("CH3", 2), ("ketone", 2)], [("CH3CO", 2)]),
    ("dibutylSuccinate", "YUXIBTJKHLUKBD-UHFFFAOYSA-N", "C12H22O4", "141-03-7",
     "dibutyl butanedioate (dibutyl succinate)", [("CH3", 2), ("CH2", 8), ("ester", 2)],
     [("CH3", 2), ("CH2", 6), ("CH2COO", 2)]),
    ("11Diethoxyethane", "DHKHKXVYLBGOIT-UHFFFAOYSA-N", "C6H14O2", "105-57-7",
     "1,1-diethoxyethane (acetal)", [("CH3", 3), ("CH2", 2), ("CH", 1), ("ether", 2)],
     [("CH3", 3), ("CH", 1), ("CH2O", 2)]),
    ("pentanoicAcid", "NQPDZGIKBAWPEJ-UHFFFAOYSA-N", "C5H10O2", "109-52-4",
     "pentanoic acid (valeric acid)", [("CH3", 1), ("CH2", 3), ("acid", 1)],
     [("CH3", 1), ("CH2", 3), ("COOH", 1)]),
    ("2Amino2Methyl1Propanol", "CBTVGIZVANVGBH-UHFFFAOYSA-N", "C4H11NO", "124-68-5",
     "2-amino-2-methylpropan-1-ol (AMP)", [("CH3", 2), ("C", 1), ("CH2", 1), ("NH2", 1), ("OH", 1)], None),
    ("cyclopentanone", "BGTOWKSIORTVQH-UHFFFAOYSA-N", "C5H8O", "120-92-3",
     "cyclopentanone", [("rCH2", 4), ("ketoneRing", 1)], [("CH2", 3), ("CH2CO", 1)]),
    ("benzoBThiophene", "FCEHBMOGCRZNNI-UHFFFAOYSA-N", "C8H6S", "95-15-8",
     "benzo[b]thiophene", [("arCH", 6), ("arC", 2), ("rS", 1)], [("ACH", 4), ("C4H2S", 1)]),
    ("benzaldehyde", "HUMNYLRZRPPJDN-UHFFFAOYSA-N", "C7H6O", "100-52-7",
     "benzaldehyde", [("arCH", 5), ("arC", 1), ("aldehyde", 1)], [("ACH", 5), ("AC", 1), ("CHO", 1)]),
    ("2Methylfuran", "VQKFNUFAXTZWDK-UHFFFAOYSA-N", "C5H6O", "534-22-5",
     "2-methylfuran", [("CH3", 1), ("arCH", 3), ("arC", 1), ("etherRing", 1)], None),
    ("nButylButanoate", "XUPYJHCZDLZNFP-UHFFFAOYSA-N", "C8H16O2", "109-21-7",
     "butyl butanoate", [("CH3", 2), ("CH2", 5), ("ester", 1)], [("CH3", 2), ("CH2", 4), ("CH2COO", 1)]),
    ("methylLactate", "LPEKGGXMPWTOCB-UHFFFAOYSA-N", "C4H8O3", "547-64-8",
     "methyl 2-hydroxypropanoate (methyl lactate, racemic)",
     [("CH3", 2), ("CH", 1), ("OH", 1), ("ester", 1)], [("CH3", 2), ("CH", 1), ("OH", 1), ("COO", 1)]),
    ("ethylHexanoate", "SHZIWNPUGXLXDT-UHFFFAOYSA-N", "C8H16O2", "123-66-0",
     "ethyl hexanoate", [("CH3", 2), ("CH2", 5), ("ester", 1)], [("CH3", 2), ("CH2", 4), ("CH2COO", 1)]),
    ("2Methoxyphenol", "LHGVFZTZFXWLCP-UHFFFAOYSA-N", "C7H8O2", "90-05-1",
     "2-methoxyphenol (guaiacol)", [("CH3", 1), ("ether", 1), ("OHar", 1), ("arCH", 4), ("arC", 2)],
     [("ACH", 4), ("AC", 1), ("ACOH", 1), ("CH3O", 1)]),
    ("diphenylmethane", "CZZYITDELCSZES-UHFFFAOYSA-N", "C13H12", "101-81-5",
     "diphenylmethane", [("arCH", 10), ("arC", 2), ("CH2", 1)], [("ACH", 10), ("AC", 1), ("ACCH2", 1)]),
    ("23Pentanedione", "TZMFJUDUGYTVRY-UHFFFAOYSA-N", "C5H8O2", "600-14-6",
     "pentane-2,3-dione", [("CH3", 2), ("CH2", 1), ("ketone", 2)],
     [("CH3", 1), ("CH3CO", 1), ("CH2CO", 1)]),
    ("vinylPropionate", "UIWXSTHGICQLQT-UHFFFAOYSA-N", "C5H8O2", "105-38-4",
     "ethenyl propanoate (vinyl propionate)", [("eCH2", 1), ("eCH", 1), ("ester", 1), ("CH2", 1), ("CH3", 1)],
     [("CH3", 1), ("CH2=CH", 1), ("CH2COO", 1)]),
    ("2Ethoxypropene", "FSGHEPDRMHVUCQ-UHFFFAOYSA-N", "C5H10O", "926-66-9",
     "2-ethoxyprop-1-ene", [("eCH2", 1), ("eC", 1), ("CH3", 2), ("CH2", 1), ("ether", 1)],
     [("CH3", 2), ("CH2=C", 1), ("CH2O", 1)]),
    ("3Diethylaminopropylamine", "QOHMWDJIBGVPIF-UHFFFAOYSA-N", "C7H18N2", "104-78-9",
     "N,N-diethylpropane-1,3-diamine", [("CH3", 2), ("CH2", 5), ("N", 1), ("NH2", 1)],
     [("CH3", 2), ("CH2", 3), ("CH2NH2", 1), ("CH2N", 1)]),
    ("ethylTetradecanoate", "MMKRHZKQPFCLLS-UHFFFAOYSA-N", "C16H32O2", "124-06-1",
     "ethyl tetradecanoate (ethyl myristate)", [("CH3", 2), ("CH2", 13), ("ester", 1)],
     [("CH3", 2), ("CH2", 12), ("CH2COO", 1)]),
    #  batch 3.  C292 excluded 2,5-dimethylfuran for "no ring =CH / =C< group";
    #  C309 reads Joback's ring =CH- and =C< as the table's arCH / arC (the
    #  same two rows), which is how furan, 2-methylfuran, pyrrole and the
    #  thiophenes above are written: an aromatic five-membered ring.
    #  HELD (2026-11-11), NOT under the 50 K rule (0.7 Tc is 24.4 K beyond the
    #  fit): its omega came out 0.031 from Joback's Tc 596.6 K and Pc 41.7 bar,
    #  physically impossible for a C6 aromatic ether (furan's, from IUPAC
    #  constants, is 0.20), so the estimated critical pair is wrong and the
    #  record is not shipped; the case is removed, its declaration is in the
    #  history.  It needs a measured Tc and Pc.
    ("25Dimethylfuran", "GSNUFIFRDBKVIE-UHFFFAOYSA-N", "C6H8O", "625-86-5",
     "2,5-dimethylfuran", [("CH3", 2), ("arCH", 2), ("arC", 2), ("etherRing", 1)], None),
]
C309 = {c[0] for c in CANDIDATES3}
CANDIDATES = CANDIDATES + CANDIDATES3
for _c in CANDIDATES3:
    if _c[6]:
        UNIFAC[_c[0]] = _c[6]
REPRO_CASE3 = f"{curation_roots.CURATION_REL}/batches/new_components_c309"


def rowlinson_bondi(cp_ig, Tc, omega, T):
    """Liquid isobaric heat capacity by the Rowlinson-Bondi corresponding-states
    equation, Poling, Prausnitz & O'Connell, The Properties of Gases and Liquids,
    5th ed. (2001), Eq. (6-6.4), p. 6.22:

        (Cp_L - Cp_ig)/R = 1.586 + 0.49/(1 - Tr)
                           + omega [4.2775 + 6.3 (1 - Tr)^(1/3)/Tr + 0.4355/(1 - Tr)]

    Cp_ig is the record's ideal-gas polynomial (here Joback's).  Poling reports
    2.5 % AAD on 194 substances at 298 K and more than 10 % on 18 others, most
    of them hydrogen-bonded (C1-C4 alcohols and acids, water, amines).  An
    ESTIMATE, written as one; never used where a measurement or a recommended
    correlation exists."""
    Rg = 8.314462618
    Tr = T / Tc
    cpi = sum(c * T ** k for k, c in enumerate(cp_ig))
    return cpi + Rg * (1.586 + 0.49 / (1.0 - Tr)
                       + omega * (4.2775 + 6.3 * (1.0 - Tr) ** (1.0 / 3.0) / Tr + 0.4355 / (1.0 - Tr)))


def rb_polynomial(cp_ig, Tc, omega, Tlo, Thi, n=31):
    """The quadratic in T the record carries, least squares on n points of
    rowlinson_bondi over [Tlo, Thi]; returns (coef, max relative deviation %)."""
    Ts = [Tlo + (Thi - Tlo) * i / (n - 1) for i in range(n)]
    ys = [rowlinson_bondi(cp_ig, Tc, omega, T) for T in Ts]
    Tm, S = 0.5 * (Tlo + Thi), 100.0
    A = [[0.0] * 3 for _ in range(3)]
    b = [0.0] * 3
    for T, y in zip(Ts, ys):
        t = (T - Tm) / S
        phi = [1.0, t, t * t]
        for i in range(3):
            b[i] += phi[i] * y
            for j in range(3):
                A[i][j] += phi[i] * phi[j]
    c = solve(A, b)
    mono = [0.0] * 3
    for k, ck in enumerate(c):
        for j in range(k + 1):
            mono[j] += ck * math.comb(k, j) * (-Tm) ** (k - j) / S ** k
    dev = max(abs(sum(mono[k] * T ** k for k in range(3)) / y - 1.0) * 100 for T, y in zip(Ts, ys))
    return mono, dev


#  CODATA Key Values for Thermodynamics (Cox, Wagman & Medvedev, Hemisphere,
#  1989), standard molar entropies at 298.15 K and 1 bar, J/(mol K), per
#  ELEMENT REFERENCE STATE: C(cr, graphite); H2, O2, N2 (g).
S_EL = {"C": 5.74, "H": 130.680 / 2, "O": 205.152 / 2, "N": 191.609 / 2,
        "F": 202.791 / 2, "Cl": 223.081 / 2, "Br": 152.206 / 2, "I": 116.139 / 2,
        "S": 32.054}
S_EL_CITE = ("CODATA Key Values for Thermodynamics (Cox, Wagman & Medvedev, 1989): "
             "S(C, graphite) 5.74, S(H2, g) 130.680, S(O2, g) 205.152, "
             "S(N2, g) 191.609, S(F2, g) 202.791, S(Cl2, g) 223.081, "
             "S(Br2, l) 152.206, S(I2, cr) 116.139 J/(mol K)")
S_EL_CITE_S = S_EL_CITE[:-len(" J/(mol K)")] + ", S(S, cr, rhombic) 32.054 J/(mol K)"
ATOMIC = {"C": 12.011, "H": 1.008, "O": 15.999, "N": 14.007, "F": 18.998,
          "Cl": 35.45, "Br": 79.904, "I": 126.904, "S": 32.06}
#  DESIGN QUESTION (DEV.md 4c C292, put to Vitor): a Joback Tb written into the
#  record would be READ by `choupo-curate vp --promote` and by
#  check_regressed_pairs arm (i) as if measured -- where it lies outside the kept
#  vapour-pressure range the fitted curve is graded by its gap to it (tetradecanoic
#  acid: -72.6 K, refused), so an estimate would veto a measured curve.  So the
#  estimated Tb is NOT stored (the case data/curation/batches/new_components_estimated prints it); flip this flag only
#  together with a judge that ignores a Tb whose provenance origin is estimated.
WRITE_ESTIMATED_TB = False
TB_IMPLAUSIBLE_K = 60.0
OUTLIER_PCT = 15.0
GRADES = ("clean", "warning", "severe", "refused")
LIMITS = (5.0, 10.0, 20.0)
P_MAX_KPA = 200.0
RACKETT_TREF = 298.15
#  STATED DEFAULT (DEV.md 4c C287): omega is read off the fitted Antoine at
#  0.7 Tc only when 0.7 Tc lies within this distance of the fitted range;
#  beyond it the component is HELD, not written (see HELD).
OMEGA_MAX_EXTRAPOLATION_K = 50.0
#  OMEGA SANITY (DEV.md 4c C309, the architect's rule of 2026-11-11), applied to
#  every record C309 writes: (a) Tc or Pc estimated and |omega - omega_LK| >
#  0.10, or omega outside [0, 0.8] for a molecule below C12 -> HELD; (b) Tc and
#  Pc measured, 0.7 Tc more than 25 K beyond the fitted vapour pressures and
#  |omega - omega_LK| > 0.05 -> written, omega graded warning, both values kept.
OMEGA_LK_TOL_EST = 0.10
OMEGA_LK_TOL_MEAS = 0.05
OMEGA_LK_EXTRAP_K = 25.0


def lee_kesler_omega(Tb, Tc, Pc_bar):
    """Lee & Kesler, AIChE J. 21 (1975) 510, the vapour-pressure form solved for
    omega at the normal boiling point, Pc in atm:
        omega = [-ln Pc - 5.92714 + 6.09648/t + 1.28862 ln t - 0.169347 t^6]
              / [15.2518 - 15.6875/t - 13.4721 ln t + 0.43577 t^6],  t = Tb/Tc.
    Checked: benzene (353.24, 562.05 K, 48.95 bar) 0.208 against 0.210; n-hexane
    0.298 against 0.300.  NOTE: src/thermo/DerivedClosures.H leeKeslerOmega
    carries 5.97214 (two digits transposed), which raises omega by 0.013-0.018
    on those two; reported, not changed here (DEV.md 4c C309)."""
    th = Tb / Tc
    Pa = Pc_bar / 1.01325
    a = -math.log(Pa) - 5.92714 + 6.09648 / th + 1.28862 * math.log(th) - 0.169347 * th ** 6
    b = 15.2518 - 15.6875 / th - 13.4721 * math.log(th) + 0.43577 * th ** 6
    return a / b


class Held(Exception):
    """A candidate not written: the omega route is Vitor's (DEV.md 4c C287/C292)."""


def refuse(msg):
    print("c287_new_components: REFUSED\n  " + msg)
    sys.exit(1)


def formula_counts(f):
    c = collections.Counter()
    for el, n in re.findall(r"([A-Z][a-z]?)(\d*)", f):
        c[el] += int(n or 1)
    return c


def mw_of(f):
    return sum(ATOMIC[el] * n for el, n in formula_counts(f).items())


# --------------------------------------------------------------------------
#  the archive (cache only; regex on the published dialect, single-component
#  blocks only)
# --------------------------------------------------------------------------
R = lambda p: re.compile(p, re.S)
RE_CMP = R(r"<Compound>(.*?)</Compound>"); RE_ORG = R(r"<nOrgNum>(\d+)</nOrgNum>")
RE_KEY = R(r"<sStandardInChIKey>([^<]+)</sStandardInChIKey>")
RE_BLK = R(r"<PureOrMixtureData>(.*?)</PureOrMixtureData>"); RE_COMP = R(r"<Component>(.*?)</Component>")
RE_PROP = R(r"<Property>(.*?)</Property>"); RE_PN = R(r"<ePropName>([^<]+)</ePropName>")
RE_PNUM = R(r"<nPropNumber>(\d+)</nPropNumber>"); RE_PPH = R(r"<ePropPhase>([^<]+)</ePropPhase>")
RE_VAR = R(r"<Variable>(.*?)</Variable>"); RE_VNUM = R(r"<nVarNumber>(\d+)</nVarNumber>")
RE_VT = R(r"<VariableType>\s*<\w+>([^<]+)</\w+>")
RE_NV = R(r"<NumValues>(.*?)</NumValues>"); RE_VV = R(r"<VariableValue>(.*?)</VariableValue>")
RE_PV = R(r"<PropertyValue>(.*?)</PropertyValue>")
RE_VVAL = R(r"<nVarValue>([^<]+)</nVarValue>"); RE_PVAL = R(r"<nPropValue>([^<]+)</nPropValue>")


def family(name, phases):
    p = name.lower()
    liq = any("Liquid" in x for x in phases)
    if p.startswith("boiling temperature"):
        return "Tboil"
    if p.startswith("mass density") and liq:
        return "rho"
    if p.startswith("molar heat capacity at constant pressure") and liq:
        return "Cp"
    if p.startswith("specific heat capacity at constant pressure") and liq:
        return "cp_spec"
    if p.startswith("critical temperature"):
        return "Tc"
    if p.startswith("critical pressure"):
        return "Pc"
    return None


def harvest(keys):
    """{key: {family: [ {doi, T, P_kPa, val} ]}}, plus {doi: sha256}."""
    ix = json.loads((CACHE / "index.json").read_text())
    files = sorted({e["doi"] for e in ix["entries"]
                    if any(c.get("inchikey") in keys for c in e.get("compounds", []))})
    out = {k: collections.defaultdict(list) for k in keys}
    sha = {}
    for doi in files:
        path = CACHE / (doi + ".xml")
        if not path.exists():
            continue
        t = path.read_text(encoding="utf-8", errors="replace")
        org = {}
        for c in RE_CMP.findall(t):
            o, k = RE_ORG.search(c), RE_KEY.search(c)
            if o and k:
                org[o.group(1)] = k.group(1).strip()
        for b in RE_BLK.findall(t):
            cs = RE_COMP.findall(b)
            if len(cs) != 1:
                continue
            o = RE_ORG.search(cs[0])
            if not o or org.get(o.group(1)) not in keys:
                continue
            k = org[o.group(1)]
            props = {}
            for p in RE_PROP.findall(b):
                n, m = RE_PN.search(p), RE_PNUM.search(p)
                if n and m:
                    props[m.group(1)] = (n.group(1), RE_PPH.findall(p))
            vars_ = {}
            for v in RE_VAR.findall(b):
                m, vt = RE_VNUM.search(v), RE_VT.search(v)
                if m and vt:
                    vars_[m.group(1)] = vt.group(1)
            for nv in RE_NV.findall(b):
                vv = {}
                for x in RE_VV.findall(nv):
                    m, val = RE_VNUM.search(x), RE_VVAL.search(x)
                    if m and val and m.group(1) in vars_:
                        vv[vars_[m.group(1)]] = float(val.group(1))
                if set(vv) - {"Temperature, K", "Pressure, kPa"}:
                    continue            # a third variable: not a pure (T, P) point
                for pv in RE_PV.findall(nv):
                    m, val = RE_PNUM.search(pv), RE_PVAL.search(pv)
                    if not (m and val) or m.group(1) not in props:
                        continue
                    f = family(*props[m.group(1)])
                    if not f:
                        continue
                    out[k][f].append({"doi": doi, "T": vv.get("Temperature, K"),
                                      "P": vv.get("Pressure, kPa"),
                                      "val": float(val.group(1))})
                    sha[doi] = None
    for doi in sha:
        sha[doi] = hashlib.sha256((CACHE / (doi + ".xml")).read_bytes()).hexdigest()
    return out, sha


def median(xs):
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])


def measured_constant(rows):
    """Median of the per-article medians; (value, dois, all values)."""
    per = collections.defaultdict(list)
    for r in rows:
        per[r["doi"]].append(r["val"])
    meds = [median(v) for v in per.values()]
    return median(meds), sorted(per), [x for v in per.values() for x in v]


# --------------------------------------------------------------------------
#  fits
# --------------------------------------------------------------------------
def grade(x):
    for g, lim in zip(GRADES, LIMITS):
        if x <= lim:
            return g
    return "refused"


def rackett(T, Tc, Pc_Pa, omega):
    """src/thermo/DerivedClosures.H rackettVliq, the same arithmetic."""
    Rg = 8.314462618
    Zra = 0.29056 - 0.08775 * omega
    return (Rg * Tc / Pc_Pa) * Zra ** (1.0 + (1.0 - T / Tc) ** (2.0 / 7.0))


def fit_vliq(rows, MW, Tc, Pc_bar, omega):
    """The one parameter of V(T) = Vliq R(T)/R(298.15).  With u = 1/Vliq the
    relative density error is u a_i - 1, a_i = MW/(1000 f_i rho_i): least
    squares u = sum a / sum a^2; minimax u = 2/(min a + max a)."""
    pts = [r for r in rows if r["T"] is not None and (r["P"] is None or r["P"] <= P_MAX_KPA)
           and r["T"] < Tc]
    if not pts:
        return None
    f = lambda T: rackett(T, Tc, Pc_bar * 1e5, omega) / rackett(RACKETT_TREF, Tc, Pc_bar * 1e5, omega)
    a = [MW / (1000.0 * f(r["T"]) * r["val"]) for r in pts]
    u = sum(a) / sum(x * x for x in a)
    keep = [i for i, x in enumerate(a) if abs(u * x - 1.0) * 100 <= OUTLIER_PCT]
    dropped = [pts[i] | {"err": 100 * (u * a[i] - 1)} for i in range(len(pts)) if i not in keep]
    if dropped:
        ak = [a[i] for i in keep]
        u = sum(ak) / sum(x * x for x in ak)
    ak = [a[i] for i in keep]
    u_mm = 2.0 / (min(ak) + max(ak))
    errs = [abs(u_mm * x - 1.0) * 100 for x in ak]
    kept = [pts[i] for i in keep]
    return {"value": 1.0 / u_mm, "valueLS": 1.0 / u, "max": max(errs),
            "aad": sum(errs) / len(errs), "kept": kept, "dropped": dropped,
            "Tmin": min(r["T"] for r in kept), "Tmax": max(r["T"] for r in kept)}


def solve(A, b):
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        for r in range(n):
            if r != c:
                k = M[r][c] / M[c][c]
                for j in range(c, n + 1):
                    M[r][j] -= k * M[c][j]
    return [M[i][n] / M[i][i] for i in range(n)]


def nelder_mead(fn, x0, step, iters=4000):
    n = len(x0)
    pts = [x0[:]] + [[x0[j] + (step[j] if j == i else 0.0) for j in range(n)] for i in range(n)]
    val = [fn(p) for p in pts]
    for _ in range(iters):
        o = sorted(range(n + 1), key=lambda i: val[i])
        pts, val = [pts[i] for i in o], [val[i] for i in o]
        if abs(val[-1] - val[0]) < 1e-13:
            break
        c = [sum(p[j] for p in pts[:-1]) / n for j in range(n)]
        xr = [c[j] + (c[j] - pts[-1][j]) for j in range(n)]
        fr = fn(xr)
        if fr < val[0]:
            xe = [c[j] + 2 * (c[j] - pts[-1][j]) for j in range(n)]
            fe = fn(xe)
            pts[-1], val[-1] = (xe, fe) if fe < fr else (xr, fr)
        elif fr < val[-2]:
            pts[-1], val[-1] = xr, fr
        else:
            xc = [c[j] + 0.5 * (pts[-1][j] - c[j]) for j in range(n)]
            fc = fn(xc)
            if fc < val[-1]:
                pts[-1], val[-1] = xc, fc
            else:
                pts = [pts[0]] + [[pts[0][j] + 0.5 * (p[j] - pts[0][j]) for j in range(n)]
                                  for p in pts[1:]]
                val = [val[0]] + [fn(p) for p in pts[1:]]
    i = min(range(n + 1), key=lambda i: val[i])
    return pts[i], val[i]


def fit_cp(rows, MW):
    pts = [dict(r) for r in rows if r["T"] is not None
           and (r["P"] is None or r["P"] <= P_MAX_KPA)]
    for r in pts:
        if r.get("spec"):
            r["val"] = r["val"] * MW / 1000.0
    if not pts:
        return None
    Ts = [r["T"] for r in pts]
    span = max(Ts) - min(Ts)
    deg = 2 if (len(pts) >= 6 and span >= 30) else (1 if (len(pts) >= 3 and span >= 10) else 0)
    Tm = 0.5 * (max(Ts) + min(Ts))
    S = 100.0

    def ls(P):
        # relative least squares: rows weighted by 1/Cp
        n = deg + 1
        A = [[0.0] * n for _ in range(n)]
        b = [0.0] * n
        for r in P:
            t = (r["T"] - Tm) / S
            w = 1.0 / r["val"]
            phi = [w * t ** k for k in range(n)]
            for i in range(n):
                b[i] += phi[i] * 1.0
                for j in range(n):
                    A[i][j] += phi[i] * phi[j]
        return solve(A, b)
    ev = lambda c, T: sum(c[k] * ((T - Tm) / S) ** k for k in range(len(c)))
    c = ls(pts)
    rel = [100 * (ev(c, r["T"]) / r["val"] - 1) for r in pts]
    kept = [r for r, e in zip(pts, rel) if abs(e) <= OUTLIER_PCT]
    dropped = [r | {"err": e} for r, e in zip(pts, rel) if abs(e) > OUTLIER_PCT]
    if dropped:
        c = ls(kept)
    mx = lambda cc: max(abs(ev(cc, r["T"]) / r["val"] - 1) for r in kept)
    cls = c
    cm, _ = nelder_mead(mx, cls, [0.01 * abs(x) + 1e-3 for x in cls])
    if mx(cm) > mx(cls):
        cm = cls
    # back to monomials in T: sum c_k ((T - Tm)/S)^k
    mono = [0.0] * (deg + 1)
    for k, ck in enumerate(cm):
        for j in range(k + 1):
            mono[j] += ck * math.comb(k, j) * (-Tm) ** (k - j) / S ** k
    errs = [abs(ev(cm, r["T"]) / r["val"] - 1) * 100 for r in kept]
    return {"coef": mono, "deg": deg, "max": max(errs), "aad": sum(errs) / len(errs),
            "maxLS": mx(cls) * 100, "kept": kept, "dropped": dropped,
            "Tmin": min(r["T"] for r in kept), "Tmax": max(r["T"] for r in kept)}


# --------------------------------------------------------------------------
#  Joback (the table the engine reads; formulas of src/propertyOps/Joback.cpp)
# --------------------------------------------------------------------------
def joback_table():
    t = {}
    for m in re.finditer(r"\{\s*name\s+(\w+);([^}]*)\}", JOBACK.read_text()):
        t[m.group(1)] = {k: float(v) for k, v in re.findall(r"(\w+)\s+([-+0-9.eE]+);", m.group(2))}
    return t


def joback(groups):
    J = joback_table()
    s = lambda k: sum(J[g][k] * n for g, n in groups)
    nA = sum(J[g]["nA"] * n for g, n in groups)
    Tb = 198.2 + s("dTb")
    return {"Tb": Tb, "Tc": Tb / (0.584 + 0.965 * s("dTc") - s("dTc") ** 2),
            "Pc": 1.0 / (0.113 + 0.0032 * nA - s("dPc")) ** 2,      # bar
            "dHf": (68.29 + s("dHf")) * 1000.0, "dGf": (53.88 + s("dGf")) * 1000.0,
            "cp": [s("cpa") - 37.93, s("cpb") + 0.210, s("cpc") - 3.91e-4, s("cpd") + 2.06e-7]}


# --------------------------------------------------------------------------
#  omega from the pipeline's fitted Antoine
# --------------------------------------------------------------------------
def vp_case(name):
    p = curation_roots.COMPONENTS / name
    return p if curation_roots.is_case(p) else None


def fitted_antoine(name):
    case = vp_case(name)
    if case is None:
        return None, None
    t = " ".join((case / "system" / "propsDict").read_text().split())
    m = re.search(r"Antoine log10\(Psat/bar\) = ([-0-9.]+) - ([-0-9.]+)/\(T \+ ([-0-9.]+)\)", t)
    rng = re.search(r"kept points, ([0-9.]+)-([0-9.]+) K", t)
    if not m:
        return case, None
    return case, {"A": float(m.group(1)), "B": float(m.group(2)), "C": float(m.group(3)),
                  "Tmin": float(rng.group(1)), "Tmax": float(rng.group(2))}


# --------------------------------------------------------------------------
#  record
# --------------------------------------------------------------------------
def ev_list(rows_by_doi, sha, kept_count, drop_count, ind="            "):
    out = ""
    for doi in sorted(rows_by_doi):
        out += (f"{ind}{{ doi \"{doi}\"; articleSha256 \"{sha[doi]}\"; "
                f"pointsKept {kept_count.get(doi, 0)}; pointsDropped {drop_count.get(doi, 0)}; "
                "provenance measured; }\n")
    return out


def fit_entry(key, fit, sha, method, unit_word):
    kc = collections.Counter(r["doi"] for r in fit["kept"])
    dc = collections.Counter(r["doi"] for r in fit["dropped"])
    dois = set(kc) | set(dc)
    drop_txt = "; ".join(f"{r['doi']} T={r['T']:g} K {unit_word}={r['val']:g} err {r['err']:+.1f} %"
                         for r in fit["dropped"]) or "none"
    g = grade(fit["max"])
    return (f"    {key}\n    {{\n"
            "        origin        fitted;\n"
            f'        method        "{method}";\n'
            f'        fittedBy      "{TOOL}";\n'
            "        reviewStatus  autoPromoted;\n"
            "        review        { by none; }   // DEV.md 4c C300 rule 4 (C297): nobody has reviewed it\n"
            f"        fitGrade      {g};   // DEV.md 4c C285 limits 5 / 10 / 20 %\n"
            "        fitGradeBasis inSample;   // DEV.md 4c C300 rule 1: the residual of the points it was fitted to\n"
            f"        fitGradeMaxRelativeError_pct {fit['max']:.6f};\n"
            '        reviewReason  "regressed by a machine from archive-transcribed measurements; not yet read back against the articles";\n'
            '        reuse         "Choupo\'s own regression; the measured points belong to the cited articles and are not reproduced in this record or this tree";\n'
            "        evidence\n        (\n" + ev_list(dois, sha, kc, dc) + "        );\n"
            "        acceptance\n        {\n"
            '            rule        "the default graded acceptance of DEV.md 4c C285 on the max relative error over the kept points (clean / warning / severe up to 5 / 10 / 20 %); every laboratory fitted, points beyond 15 % after the least-squares stage discarded by name (C283 amended)";\n'
            "            verdict     accepted;\n"
            f"            studies     {len(dois)};\n"
            f"            pointsKept  {len(fit['kept'])};\n"
            f"            pointsDropped {len(fit['dropped'])};\n"
            f'            dropped     "{drop_txt}";\n'
            f"            aad_pct     {fit['aad']:.6f};\n"
            f"            max_pct     {fit['max']:.6f};\n"
            + (f"            Trange      ({fit['Tmin']:g} {fit['Tmax']:g});   // K, the kept points\n"
               if fit["Tmax"] > fit["Tmin"] else
               f"            measuredAt  {fit['Tmin']:g};   // K: ONE measurement -- the parameter reproduces it exactly and the grade says nothing about its temperature dependence\n")
            + "        }\n    }\n")


def constant_entry(key, val, dois, allv, unit, note=""):
    lo, hi = min(allv), max(allv)
    return (f"    {key}\n    {{\n"
            "        origin        measured;\n"
            f'        method        "median of the per-article medians of every value the ThermoML archive locates ({len(allv)} value(s), {len(dois)} article(s)){note}";\n'
            f'        uncertainty   "spread of the reported values {lo:g} - {hi:g} {unit}";\n'
            f'        doi           "{"; ".join(dois)}";\n'
            f'        combinedBy    "{TOOL}";\n'
            "        reviewStatus  autoPromoted;\n"
            "        review        { by none; }   // DEV.md 4c C300 rule 4 (C297): nobody has reviewed it\n"
            '        reviewReason  "combined by a machine from archive-transcribed values; not yet read back against the articles";\n'
            "    }\n")


def est_entry(key, J, fp, JTAB, repro, why):
    return (f"    {key}\n    {{\n"
            "        origin           estimated;\n"
            '        method           "Joback";\n'
            f'        methodVersion    "{JTAB}";\n'
            "        input            joback;\n"
            f'        inputFingerprint "{fp}";\n'
            f'        reproducedInCase "{repro}";\n'
            '        uncertainty      { status unquantified; reason "Joback group contribution (Joback & Reid 1987); '
            'Tc within a few per cent and Pc within about 5-10 per cent for ordinary organics, worse for polyfunctional molecules"; }\n'
            f'        notes            "{why}; all groups of the structure are in the Joback table";\n'
            "    }\n")


def crit_entry(key, route, J, fp, JTAB, repro, lit, dois, allv, c309):
    """The provenance entry of Tc or Pc by its route (C309: each its own)."""
    if route == "joback":
        what = "critical temperature" if key == "Tc" else "critical pressure"
        why = (f"neither the IUPAC series (Parts 7-10, 12) nor the archive gives a {what} for this compound"
               if c309 else f"the archive carries no {what} for this compound")
        return est_entry(key, J, fp, JTAB, repro, why)
    if route == "thermoml":
        if key == "Tc":
            return constant_entry("Tc", None, dois, allv, "K")
        return constant_entry("Pc", None, dois, [x / 100 for x in allv], "bar",
                              "; the archive reports kPa, divided by 100")
    v, u, part = lit[key]
    cite, doi = IUPAC_PARTS[part]
    unit, val = ("K", f"{v:g}") if key == "Tc" else ("MPa", f"{v:g}")
    return (f"    {key}\n    {{\n"
            "        origin        measured;\n"
            '        method        "IUPAC recommended value: the critical evaluation of every published '
            f'measurement by the IUPAC critical-properties group ({val} {unit}'
            + (f', stored as {v * 10:g} bar' if key == "Pc" else "") + ')";\n'
            f'        uncertainty   "+-{u:g} {unit}, the evaluators\' estimate";\n'
            f'        source        "{cite}";\n'
            f'        doi           "{doi}";\n'
            f'        transcribedBy "{TOOL} (IUPAC table, hand-transcribed from the PDF, one row per compound)";\n'
            "        reviewStatus  autoPromoted;\n"
            "        review        { by none; }   // DEV.md 4c C300 rule 4 (C297): nobody has reviewed it\n"
            '        reviewReason  "transcribed by a model from the article\'s Table 1 and re-read once; not yet read back by a human";\n'
            "    }\n")


def zab_entry(name):
    sup, tab, A, (lo, hi), lev, ztype, note = ZAB[name]
    cite, doi = ZAB_SUPPLEMENTS[sup]
    acoef = ", ".join(f"A{j + 1} = {a:g}" for j, a in enumerate(A))
    kind = {"p": "isobaric", "sat": "saturation (equal to the isobaric one below Tr ~ 0.8, Poling 5e Sect. 6-6)"}[ztype]
    return ("    liquidHeatCapacity\n    {\n"
            "        origin        literature;\n"
            f'        method        "Zabransky et al. recommended {kind} heat capacity, their Eq. 19, '
            f'C/R = sum_j A(j+1) (T/100)^j with R = {ZAB_R} J/(mol K): {acoef}, converted to the record\'s '
            'polynomial in T (a_j = R A(j+1) / 100^j)";\n'
            f'        source        "{cite}, {tab}";\n'
            f'        doi           "{doi}";\n'
            f'        uncertainty   "level {lev} ({ZAB_LEVEL[lev]}), the evaluators\' assignment over {lo:g}-{hi:g} K"'
            ";\n"
            + (f'        notes         "{note}";\n' if note else "")
            + f'        transcribedBy "{TOOL} (hand-transcribed from the PDF, one row per compound)";\n'
            "        reviewStatus  autoPromoted;\n"
            "        review        { by none; }   // DEV.md 4c C300 rule 4 (C297): nobody has reviewed it\n"
            '        reviewReason  "transcribed by a model from the review\'s parameter table and re-read once; not yet read back by a human";\n'
            "    }\n")


def rb_entry(cp, Tc, omega, Tc_route, fp, JTAB, repro):
    return ("    liquidHeatCapacity\n    {\n"
            "        origin           estimated;\n"
            '        method           "Rowlinson-Bondi corresponding states, Poling, Prausnitz & O\'Connell, '
            'The Properties of Gases and Liquids, 5th ed. (2001), Eq. (6-6.4): (Cp_L - Cp_ig)/R = 1.586 + '
            '0.49/(1 - Tr) + omega [4.2775 + 6.3 (1 - Tr)^(1/3)/Tr + 0.4355/(1 - Tr)], with this record\'s '
            f'Joback Cp_ig, Tc ({ "Joback ESTIMATE" if Tc_route == "joback" else Tc_route}) and omega; '
            f'represented by a quadratic in T least-squares fitted to the equation over {cp["Tmin"]:g}-'
            f'{cp["Tmax"]:g} K (the fitted vapour pressure\'s span within 0.40-0.80 Tc), max deviation '
            f'{cp["dev"]:.3f} % from it";\n'
            f'        computedBy       "{TOOL} (rowlinson_bondi)";\n'
            f'        inputFingerprint "{fp}";\n'
            f'        reproducedInCase "{repro}";\n'
            '        uncertainty      { status unquantified; reason "Poling 5e p. 6.22: 2.5 % AAD on 194 '
            'substances at 298 K, more than 10 % on 18 others, most hydrogen-bonded (C1-C4 alcohols and acids, '
            'water, amines); the archive locates no liquid Cp for this compound and no Zabransky supplement in '
            'hand recommends one"; }\n'
            "        reviewStatus     autoPromoted;\n"
            "        review           { by none; }   // DEV.md 4c C300 rule 4 (C297): nobody has reviewed it\n"
            "    }\n")


def build(c, data, sha, provisional):
    name, key, formula, cas, label, groups = c[:6]
    d = data[key]
    fc = formula_counts(formula)
    gc = collections.Counter()
    atoms = {"CH3": "CH3", "CH2": "CH2", "CH": "CH", "C": "C", "eCH2": "CH2", "eCH": "CH",
             "OH": "OH", "ether": "O", "ester": "CO2", "ketone": "CO", "arC": "C",
             "arCH": "CH", "NH2": "NH2", "eC": "C", "OHar": "OH", "etherRing": "O",
             "acid": "COOH", "rCH2": "CH2", "rCH": "CH", "rC": "C", "NH": "NH",
             "F": "F", "Cl": "Cl", "Br": "Br", "I": "I",
             #  C309 additions (the same Joback table, groups slices 1-2 did not use)
             "aldehyde": "CHO", "ketoneRing": "CO", "rNH": "NH", "reN": "N", "N": "N",
             "eN": "N", "CN": "CN", "rS": "S", "S": "S", "SH": "SH"}
    for g, n in groups:
        for el, m in formula_counts(atoms[g]).items():
            gc[el] += m * n
    if gc != fc:
        refuse(f"{name}: Joback groups give {dict(gc)}, the formula {formula}")
    ugroups = UNIFAC.get(name)
    if ugroups:
        uc = collections.Counter()
        for g, n in ugroups:
            for el, m in formula_counts(UNIFAC_ATOMS[g]).items():
                uc[el] += m * n
        if uc != fc:
            refuse(f"{name}: UNIFAC subgroups give {dict(uc)}, the formula {formula}")
    MW = mw_of(formula)
    c309 = name in C309
    J = joback(groups)
    lit = IUPAC.get(name, {})
    #  Each critical constant takes its own route (C309): the IUPAC recommended
    #  value, else the archive's measured median, else Joback (marked).
    if c309:
        Tc_route = "iupac" if "Tc" in lit else ("thermoml" if d["Tc"] else "joback")
        Pc_route = "iupac" if "Pc" in lit else ("thermoml" if d["Pc"] else "joback")
    else:
        Tc_route = Pc_route = ("joback" if name in ESTIMATED else "thermoml")
        #  C309 item 2: an IUPAC recommended value replaces the Joback estimate
        Tc_route = "iupac" if "Tc" in lit else Tc_route
        Pc_route = "iupac" if "Pc" in lit else Pc_route
    est = Tc_route == "joback" or Pc_route == "joback"
    Tc_dois = Pc_dois = Tc_all = Pc_all = None
    if Tc_route == "iupac":
        Tc = lit["Tc"][0]
    elif Tc_route == "thermoml":
        if not d["Tc"]:
            refuse(f"{name}: no measured Tc in the archive")
        Tc, Tc_dois, Tc_all = measured_constant(d["Tc"])
    else:
        Tc = J["Tc"]
    if Pc_route == "iupac":
        Pc = lit["Pc"][0] * 10.0                         # MPa -> bar
    elif Pc_route == "thermoml":
        if not d["Pc"]:
            refuse(f"{name}: no measured Pc in the archive")
        Pc_kPa, Pc_dois, Pc_all = measured_constant(d["Pc"])
        Pc = Pc_kPa / 100.0
    else:
        Pc = J["Pc"]
    tb_rows = [r for r in d["Tboil"] if r["P"] is not None and 100.0 <= r["P"] <= 102.5]
    Tb = measured_constant(tb_rows) if tb_rows else None
    if Tb is not None and abs(Tb[0] - J["Tb"]) > TB_IMPLAUSIBLE_K:
        #  a reported "boiling temperature" 60 K or more from the group estimate is a
        #  unit or transcription defect of the article's table (chavibetol: 191.4, a
        #  Celsius value under a kelvin heading), not a measurement to grade a curve by
        print(f"{name}: measured Tb {Tb[0]:g} K ({', '.join(Tb[1])}) DISCARDED: "
              f"{abs(Tb[0] - J['Tb']):.0f} K from Joback's {J['Tb']:.1f} K, implausible")
        Tb = None
    #  An ESTIMATED Tb is written only on the final record: during the vapour-pressure
    #  run the record carries Tb only where it is MEASURED, so a Joback estimate
    #  (several K off) never grades a fitted curve (DEV.md 4c C292).
    Tb_est = J["Tb"] if (est and Tb is None and not provisional and WRITE_ESTIMATED_TB) else None
    repro = REPRO_CASE3 if c309 else (REPRO_CASE2 if name in ESTIMATED else REPRO_CASE)
    case, ant = fitted_antoine(name)
    if ant is None:
        if not provisional:
            refuse(f"{name}: no fitted Antoine yet ({'no case' if case is None else case.name}"
                   " has no RESULT) -- run `bin/choupo-curate vp` first, or --provisional")
        omega, omega_entry = 0.5, ("    omega\n    {\n        origin        placeholder;\n"
                                   '        method        "PROVISIONAL: replaced from the fitted vapour pressure before the record is committed";\n    }\n')
    else:
        crit_words = ("measured" if not c309 else
                      " and ".join(dict.fromkeys(
                          {"iupac": "IUPAC-recommended", "thermoml": "measured",
                           "joback": "Joback-estimated"}[r] for r in (Tc_route, Pc_route))))
        T7 = 0.7 * Tc
        P7 = 10 ** (ant["A"] - ant["B"] / (T7 + ant["C"]))     # bar
        omega = -math.log10(P7 / Pc) - 1.0
        beyond = max(0.0, T7 - ant["Tmax"], ant["Tmin"] - T7)
        if beyond > OMEGA_MAX_EXTRAPOLATION_K and (est or c309):
            raise Held(f"{name}: HELD, 0.7 Tc({'estimated' if Tc_route == 'joback' else Tc_route}) "
                       f"= {T7:.1f} K lies {beyond:.1f} K "
                       f"outside the fitted vapour pressures ({ant['Tmin']:g}-{ant['Tmax']:g} K)")
        if beyond > OMEGA_MAX_EXTRAPOLATION_K:
            refuse(f"{name}: omega would be read off the fitted Antoine {beyond:.1f} K outside "
                   f"its fitted range (0.7 Tc = {T7:.2f} K, data {ant['Tmin']:g}-{ant['Tmax']:g} K), "
                   f"more than the stated {OMEGA_MAX_EXTRAPOLATION_K:g} K -- HELD for Vitor "
                   "(DEV.md 4c C287): a three-parameter Antoine carried that far gives an "
                   "omega nobody can defend (butylLevulinate: 0.096)")
        #  OMEGA SANITY (DEV.md 4c C309, architect's rule, 2026-11-11): a second,
        #  independent omega by Lee-Kesler from Tb, Tc, Pc (lee_kesler_omega).
        sane_note, sane_grade = "", None
        if c309 or name in IUPAC:
            if Tb:
                Tb_lk, tb_word = Tb[0], f"the measured Tb {Tb[0]:g} K"
            else:
                Tb_lk = ant["B"] / (ant["A"] - math.log10(1.01325)) - ant["C"]
                tb_word = f"the fitted Antoine's own normal boiling point {Tb_lk:.2f} K"
            w_lk = lee_kesler_omega(Tb_lk, Tc, Pc)
            dw = omega - w_lk
            nC = formula_counts(formula).get("C", 0)
            crit_est = Tc_route == "joback" or Pc_route == "joback"
            both = (f"omega {omega:.4f} from the Antoine at 0.7 Tc against Lee-Kesler {w_lk:.4f} "
                    f"from {tb_word}, Tc and Pc (difference {dw:+.4f})")
            if crit_est and abs(dw) > OMEGA_LK_TOL_EST:
                raise Held(f"{name}: HELD (C309 omega sanity, rule a): Tc or Pc is a Joback estimate "
                           f"and {both}, more than {OMEGA_LK_TOL_EST:g} apart")
            if crit_est and nC < 12 and not (0.0 <= omega <= 0.8):
                raise Held(f"{name}: HELD (C309 omega sanity, rule a): Tc or Pc is a Joback estimate "
                           f"and omega {omega:.4f} lies outside [0, 0.8] for a C{nC} molecule ({both})")
            if not crit_est and beyond > OMEGA_LK_EXTRAP_K and abs(dw) > OMEGA_LK_TOL_MEAS:
                sane_grade = "warning"
                sane_note = (f"; OMEGA SANITY (C309 rule b): 0.7 Tc lies {beyond:.1f} K beyond the "
                             f"fitted vapour pressures (more than {OMEGA_LK_EXTRAP_K:g} K) and {both}, "
                             f"more than {OMEGA_LK_TOL_MEAS:g} apart -- graded warning, both kept here")
            else:
                sane_note = f"; cross-check (C309): {both}"
        extra = ("inside the fitted range" if ant["Tmin"] <= T7 <= ant["Tmax"] else
                 f"EXTRAPOLATED {T7 - ant['Tmax']:+.1f} K beyond the fitted range "
                 f"({ant['Tmin']:g}-{ant['Tmax']:g} K)" if T7 > ant["Tmax"] else
                 f"EXTRAPOLATED {T7 - ant['Tmin']:+.1f} K below the fitted range")
        omega_entry = (
            "    omega\n    {\n"
            "        origin        regressed;\n"
            f'        method        "DERIVED from a fit: omega = -log10(Psat(0.7 Tc)/Pc) - 1 from the Antoine the vapour-pressure pipeline fitted ({case.relative_to(ROOT).as_posix()}) and the {crit_words} Tc, Pc; 0.7 Tc = {T7:.2f} K, {extra}{sane_note}";\n'
            + (f"        fitGrade      {sane_grade};   // DEV.md 4c C309 omega sanity, rule b\n" if sane_grade else "")
            + f'        derivedBy     "{TOOL}";\n'
            "        reviewStatus  autoPromoted;\n"
            "        review        { by none; }   // DEV.md 4c C300 rule 4 (C297): nobody has reviewed it\n"
            '        reviewReason  "derived by a machine; read it with the fitGrade of the vapour pressure it comes from";\n'
            "    }\n")
    rho = fit_vliq(d["rho"], MW, Tc, Pc, omega)
    cp_rows = d["Cp"] + [r | {"spec": True} for r in d["cp_spec"]]
    cp = fit_cp(cp_rows, MW)
    cp_route = "thermoml"
    if cp is None and c309:
        if name in ZAB:
            sup, tab, A, (zlo, zhi), lev, ztype, znote = ZAB[name]
            cp = {"coef": [ZAB_R * a / 100.0 ** j for j, a in enumerate(A)], "deg": len(A) - 1,
                  "Tmin": zlo, "Tmax": zhi}
            cp_route = "zabransky"
        else:
            #  The window: the fitted vapour pressure's span, clipped to
            #  0.40-0.80 Tc (the liquid well below its critical point).
            lo = max(ant["Tmin"] if ant else 0.5 * Tc, 0.40 * Tc)
            hi = min(ant["Tmax"] if ant else 0.7 * Tc, 0.80 * Tc)
            if hi - lo < 10.0:
                lo, hi = 0.45 * Tc, 0.75 * Tc
            coef, dev = rb_polynomial(J["cp"], Tc, omega, lo, hi)
            cp = {"coef": coef, "deg": 2, "Tmin": round(lo, 2), "Tmax": round(hi, 2), "dev": dev}
            cp_route = "rowlinsonBondi"
    if rho is None or cp is None:
        refuse(f"{name}: no usable liquid density or liquid Cp at or below {P_MAX_KPA:g} kPa")
    nel = formula_counts(formula)
    if set(nel) - set(S_EL):
        refuse(f"{name}: no element entropy for {set(nel) - set(S_EL)}")
    s298 = (J["dHf"] - J["dGf"]) / 298.15 + sum(S_EL[el] * n for el, n in nel.items())
    el_cite = S_EL_CITE_S if "S" in nel else S_EL_CITE
    today = date.today().isoformat()
    fp = ",".join(f"{g}:{n}" for g, n in sorted(groups))
    JTAB = re.search(r"^tableId\s+(\S+);", JOBACK.read_text(), re.M).group(1)
    jgroups = " ".join(f"{{ group {g}; count {n}; }}" for g, n in groups)
    cpig = J["cp"]
    cpl = cp["coef"]
    cp_trange = (f"Trange        ({cp['Tmin']:g}  {cp['Tmax']:g});" if cp["Tmax"] > cp["Tmin"] else
                 f"Trange        unknown;   // ONE measurement temperature ({cp['Tmin']:g} K): no interval can be claimed")
    vp_note = ("  Psat: fitted by `bin/choupo-curate vp`; its promotion replaces the\n"
               "  AmbroseWalton block this tool writes (provenance.vaporPressure).\n")
    nf = '.9g' if est else '.6g'   # an ESTIMATE must reproduce to round-off (check_estimates, 1e-6)
    nfT = '.9g' if Tc_route == "joback" else '.6g'
    nfP = '.9g' if Pc_route == "joback" else '.6g'
    word = {"joback": "Joback ESTIMATE", "thermoml": "measured", "iupac": "IUPAC recommended"}
    tb_line = (f"Tb          {Tb[0]:.6g};      // K, measured (provenance.Tb)\n" if Tb else
               f"Tb          {Tb_est:{nf}};      // K, Joback ESTIMATE (provenance.Tb)\n" if Tb_est else
               "//  Tb: NOT DECLARED -- the archive reports no boiling temperature at\n"
               "//  101.3 kPa for it, and a Tb read back off the fitted Antoine would be\n"
               "//  the curve tested against itself (the fitted normal boiling point is\n"
               "//  in provenance.vaporPressure.acceptance.Tnb_fit)."
               + ("  Joback's Tb is NOT stored either: the vapour-pressure\n"
                  "//  grade would read an estimate as a measurement (WRITE_ESTIMATED_TB in\n"
                  f"//  the tool); the case {repro} prints it.\n" if est else "\n"))
    if c309:
        by_route = collections.defaultdict(list)
        for v, r in (("Tc", Tc_route), ("Pc", Pc_route)):
            by_route[r].append(v)
        if Tb:
            by_route["thermoml"].append("Tb")
        fitted = ["vapour pressure (bin/choupo-curate vp)", "Vliq"] + (["liquid Cp"] if cp_route == "thermoml" else [])
        intro = (f"  NEW in the catalogue (DEV.md 4c C309, slice 3 of C287, {today}), built by\n"
                 f"  {TOOL} from the IUPAC critical-property series, the\n"
                 "  Zabransky liquid heat-capacity review and the measurements the NIST/TRC\n"
                 "  ThermoML Archive locates (the articles are the sources; every value's\n"
                 "  citation or DOIs are in provenance).\n")
        lines = []
        if by_route["iupac"]:
            lines.append("IUPAC RECOMMENDED (critically evaluated measurements): " + ", ".join(by_route["iupac"]))
        if by_route["thermoml"]:
            lines.append("MEASURED (archive median): " + ", ".join(by_route["thermoml"]))
        if cp_route == "zabransky":
            lines.append("RECOMMENDED (Zabransky): liquid Cp")
        lines.append("FITTED: " + ", ".join(fitted))
        lines.append("DERIVED: omega (from the fitted vapour pressure)")
        estd = by_route["joback"] + ["ideal-gas Cp", "dHf_298"]
        lines.append("ESTIMATED (Joback): " + ", ".join(estd) + "; s_298 derived from Joback's dHf and dGf")
        if cp_route == "rowlinsonBondi":
            lines.append("ESTIMATED (Rowlinson-Bondi, Poling 5e Eq. 6-6.4): liquid Cp -- no measurement or recommended correlation in hand")
        body = intro + "".join("  " + ln + ".\n" for ln in lines) + "  No measured series is reproduced here.\n"
    elif lit:
        upg = " and ".join(k for k in ("Tc", "Pc") if k in lit)
        still = [k for k, r in (("Tc", Tc_route), ("Pc", Pc_route)) if r == "joback"]
        body = ("  NEW in the catalogue by DEV.md 4c C292 (slice 2 of C287), built by\n"
                f"  {TOOL} from measurements the NIST/TRC ThermoML Archive\n"
                "  locates (the articles are the sources; their DOIs are in provenance).\n"
                f"  UPGRADED by DEV.md 4c C309 ({today}): {upg} replaced by the IUPAC recommended\n"
                "  value (critically evaluated measurements; citation in provenance) and omega\n"
                "  re-derived from them; nothing else refitted.\n"
                + ("  MEASURED: Tb.  " if Tb else "  ")
                + "FITTED: vapour pressure (bin/choupo-curate vp), Vliq, liquid Cp.\n"
                "  DERIVED: omega (from the fitted vapour pressure).\n"
                f"  ESTIMATED (Joback): {''.join(s + ', ' for s in still)}ideal-gas Cp, dHf_298; s_298 derived from Joback's\n"
                "  dHf and dGf.  No measured series is reproduced here.\n")
    else:
        body = (f"  NEW in the catalogue (DEV.md 4c {'C292, slice 2 of C287' if est else 'C287'}, {today}), built by\n"
                f"  {TOOL} from measurements the NIST/TRC ThermoML Archive\n"
                "  locates (the articles are the sources; their DOIs are in provenance).\n"
                f"  {('MEASURED: Tb' if Tb else 'MEASURED: no critical constant, no Tb') if est else ('MEASURED: Tc, Pc' + (', Tb' if Tb else ''))}.  FITTED: vapour pressure (bin/choupo-curate vp),\n"
                f"  Vliq, liquid Cp.  DERIVED: omega (from the fitted vapour pressure{' at the ESTIMATED Tc' if est else ''}).\n"
                f"  ESTIMATED (Joback): {'Tc, Pc, ' if est else ''}ideal-gas Cp, dHf_298; s_298 derived from Joback's\n"
                "  dHf and dGf.  No measured series is reproduced here.\n")
    cp_word = {"thermoml": "FITTED", "zabransky": "Zabransky RECOMMENDED",
               "rowlinsonBondi": "Rowlinson-Bondi ESTIMATE"}[cp_route]
    deg_terms = " + ".join(["a0", "a1 T", "a2 T^2", "a3 T^3", "a4 T^4"][:cp["deg"] + 1])
    if cp_route == "zabransky" and cp["Tmax"] <= cp["Tmin"]:
        cp_trange = (f"Trange        unknown;   // ONE temperature ({cp['Tmin']:g} K) in the review: "
                     "no interval can be claimed")
    groups_block = f"    joback ( {jgroups} );\n"
    if ugroups:
        groups_block = ("    unifac ( " + " ".join(f"{{ group {g}; count {n}; }}" for g, n in ugroups)
                        + " );\n" + groups_block)
    head = f"""/*--------------------------------*- Choupo -*-----------------------*\\
  Component: {name}  ({label}; CAS {cas})
{body}  reviewStatus autoPromoted, review by none: NO human has read it back.
{vp_note}\\*---------------------------------------------------------------------------*/

name        {name};
CAS         {cas};
formula     {formula};
reviewStatus autoPromoted;
review      {{ by none; }}   // DEV.md 4c C300 rule 4 (C297): nobody has reviewed it
MW          {MW:.4f};      // kg/kmol, from the formula (IUPAC standard atomic weights)
Tc          {Tc:{nfT}};      // K, {word[Tc_route]} (provenance.Tc)
Pc          {Pc:{nfP}};      // bar, {word[Pc_route]} (provenance.Pc)
omega       {omega:.6f};      // [-] (provenance.omega)
{tb_line}
standardThermochemistry
{{
    dHf_298   {J['dHf']:.0f};        // J/mol, ideal gas, Joback ESTIMATE (provenance.dHf_298)
    s_298     {s298:.2f};        // J/(mol K), ideal gas, DERIVED from Joback (provenance.s_298)
}}

vaporPressure
{{
    model AmbroseWalton;  // [origin=estimated method=Ambrose-Walton]
}}

Vliq        {rho['value']:.6e};      // m3/mol at 25 C, FITTED (provenance.Vliq)

idealGasHeatCapacity
{{
    model         polynomial;
    // Cp [J/(mol K)] = a0 + a1 T + a2 T^2 + a3 T^3, Joback ESTIMATE
    coefficients  ({cpig[0]:.6g}  {cpig[1]:.6g}  {cpig[2]:.6e}  {cpig[3]:.6e});
    Trange        (273  1000);
}}

liquidHeatCapacity
{{
    model         polynomial;
    // Cp [J/(mol K)] = {deg_terms}, {cp_word} (provenance.liquidHeatCapacity)
    coefficients  ({'  '.join(f'{x:.10g}' for x in cpl)});
    {cp_trange}
}}

groups
{{
{groups_block}}}

provenance
{{
    MW
    {{
        origin        literature;
        method        "sum of IUPAC standard atomic weights over the formula";
    }}
""" + crit_entry("Tc", Tc_route, J, fp, JTAB, repro, lit, Tc_dois, Tc_all, c309) \
    + crit_entry("Pc", Pc_route, J, fp, JTAB, repro, lit, Pc_dois, Pc_all, c309) \
    + (est_entry("Tb", J, fp, JTAB, repro,
                 "the archive reports no boiling temperature at 100 - 102.5 kPa for this compound; "
                 "NOT read off the fitted vapour pressure") if Tb_est else "") \
    + (constant_entry("Tb", Tb[0], Tb[1], Tb[2], "K",
                      "; boiling temperatures reported at 100 - 102.5 kPa") if Tb else "") \
    + omega_entry \
    + fit_entry("Vliq", rho, sha,
                "one-parameter fit of the engine's own liquid density, V(T) = Vliq Rackett(T)/Rackett(298.15 K) "
                "with this record's Tc, Pc, omega (ThermoPackage::density, liquid branch), to every measured "
                f"liquid mass density at or below {P_MAX_KPA:g} kPa; least squares in the relative density error, "
                "then its largest value minimised", "rho") \
    + (fit_entry("liquidHeatCapacity", cp, sha,
                f"polynomial of degree {cp['deg']} in T fitted to every measured liquid isobaric heat capacity "
                f"at or below {P_MAX_KPA:g} kPa (specific values converted with MW); least squares in the "
                "relative error, then its largest value minimised", "Cp") if cp_route == "thermoml" else
       zab_entry(name) if cp_route == "zabransky" else
       rb_entry(cp, Tc, omega, Tc_route, fp, JTAB, repro)) \
    + f"""    idealGasHeatCapacity
    {{
        origin           estimated;
        method           "Joback";
        methodVersion    "{JTAB}";
        input            joback;
        inputFingerprint "{fp}";
        reproducedInCase "{repro}";
        uncertainty      {{ status unquantified; reason "Joback group contribution (Joback & Reid 1987); a few percent for Cp_ig of ordinary organics"; }}
    }}
    dHf_298
    {{
        origin           estimated;
        method           "Joback";
        methodVersion    "{JTAB}";
        input            joback;
        inputFingerprint "{fp}";
        reproducedInCase "{repro}";
        uncertainty      {{ status unquantified; reason "Joback group contribution (Joback & Reid 1987); several kJ/mol, more for polyfunctional molecules"; }}
        notes            "the ThermoML archive carries no enthalpy of formation or combustion block for this compound (searched)";
    }}
    s_298
    {{
        origin           estimated;
        method           "derived from Joback: s_298 = (dHf_298 - dGf_298)/298.15 + the sum of the elements' standard entropies, with Joback's dGf_298 = {J['dGf']:.0f} J/mol (not stored: dGf derives from dHf and s_298)";
        methodVersion    "{JTAB}";
        input            joback;
        inputFingerprint "{fp}";
        elementEntropies "{el_cite}";
        reproducedInCase "{repro}";
        uncertainty      {{ status unquantified; reason "inherits the errors of Joback's dHf_298 and dGf_298"; }}
    }}
    vaporPressure
    {{
        origin        predictive;
        method        "Ambrose-Walton corresponding states";
        methodVersion "choupo-aw-1989";
        uncertainty   "not quantified; validate against saturation data";
        notes         "computed from ChemSep Tc/Pc/omega";
    }}
}}
"""
    #  The vaporPressure provenance entry above is the EXACT text
    #  `bin/choupo-curate vp --promote` replaces (its AW_PROV, whose note
    #  names ChemSep); the promotion overwrites it with the fit's entry.
    return head, {"rho": rho, "cp": cp, "Tc": Tc, "Pc": Pc, "Tb": Tb, "Tb_est": Tb_est, "omega": omega, "est": est,
                  "cp_route": cp_route, "routes": (Tc_route, Pc_route),
                  "J": J, "s298": s298, "ant": ant}


def splice_promoted_vp(old, new, p):
    """A record whose vapour pressure `bin/choupo-curate vp --promote` already
    replaced keeps THAT block and THAT provenance entry verbatim; everything
    else is rewritten by this tool."""
    blk = re.compile(r"^vaporPressure\n\{\n.*?\n\}\n", re.S | re.M)
    ent = re.compile(r"\n    vaporPressure\n    \{\n.*?\n    \}\n", re.S)
    ob, oe = blk.search(old), ent.search(old)
    if not (ob and oe and "promotedBy" in oe.group(0)):
        refuse(f"{p.relative_to(ROOT)}: its vapour pressure is neither the AmbroseWalton "
               "block nor one `vp --promote` wrote -- not rewritten")
    new = blk.sub(lambda _: ob.group(0), new, count=1)
    new = ent.sub(lambda _: oe.group(0), new, count=1)
    return new.replace("its promotion replaces the", "its promotion replaced the")


BANNER = """/*--------------------------------*- Choupo -*--------------------------------*\\
|       \\|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\\\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\\\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\\\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \\|/    P roperties    |  Tutorial case file -- part of Choupo         |
|        |     O ptimization  |                                               |
\\*-----------------------------------------------------------------------------*/
"""


def write_c309_case():
    """data/curation/batches/new_components_c309: the C309 records that exist,
    loaded and exercised -- their Joback estimates reproduced (one
    estimateComponent each, from the groups the record declares) and Psat,
    liquid Cp and liquid density evaluated (one propertyScan1D each)."""
    names = [c for c in CANDIDATES3 if (STD / f"{c[0]}.dat").exists()]
    if not names:
        refuse("no C309 record exists yet")
    case = ROOT / REPRO_CASE3
    (case / "system").mkdir(parents=True, exist_ok=True)
    (case / "constant").mkdir(parents=True, exist_ok=True)
    (case / f"{case.name}.cho").write_text("")
    n = len(names)
    (case / "system" / "controlDict").write_text(
        BANNER + "\n"
        f"application   choupoProps;\n"
        f'description   "The {n} C309 components (slice 3 of C287: Tc, Pc from the IUPAC series where it recommends them, '
        'liquid Cp from Zabransky where a supplement recommends it): their Joback estimates reproduced, and Psat, '
        'liquid Cp and liquid density evaluated";\n'
        "verbosity     2;\n")
    comps = "  ".join(c[0] for c in names)
    (case / "constant" / "thermoPhysPropDict").write_text(
        BANNER + "/*  The components DEV.md 4c C309 added (slice 3 of C287); an ideal liquid,\n"
        "    because every property this case asks is a pure-component one.  NOT\n"
        "    sealed: the case exists to load the catalogue records as they stand.  */\n\n"
        "recordType    thermophysicalPropertySystem;\nschemaVersion 2;\n\n"
        f"components       ( {comps} );\n\n"
        "equilibrium\n{\n    formulation gammaPhi;\n    liquid { activityModel { model ideal; } }\n"
        "    vapour { fugacityModel idealGas; }\n}\n")
    ops = []
    for c in names:
        g = " ".join(f"{{ group {x}; count {k}; }}" for x, k in c[5])
        ops.append(f"    {{\n        name        joback_{c[0]};\n        type        estimateComponent;\n"
                   f"        component   {c[0]};\n        groups      ( {g} );\n    }}\n")
    for c in names:
        ops.append(f"    {{\n        name        smoke_{c[0]};\n        type        propertyScan1D;\n"
                   "        vary        { variable T;  from 300 K;  to 340 K;  n 3; }\n"
                   f"        state       {{ P 1 bar;  composition {{ {c[0]} 1.0; }} }}\n"
                   f"        properties  ( Psat_{c[0]}  Cp_liquid_{c[0]}  rho_liquid_{c[0]} );\n"
                   f"        output      {{ file smoke_{c[0]}.csv; }}\n    }}\n")
    (case / "system" / "propsDict").write_text(
        BANNER + "/*---------------------------------------------------------------------------*\\\n"
        f"  new_components_c309 -- the {n} components DEV.md 4c C309 (slice 3 of\n"
        f"  C287) added to the catalogue, loaded and exercised.  Written by\n"
        f"  `{TOOL} case`.\n"
        "  Tc and Pc come from the IUPAC critical-property series where it recommends\n"
        "  them, else from the archive's measurements, else from Joback (marked, per\n"
        "  value); the ideal-gas Cp and dHf_298 are Joback for every one.\n"
        "  1. REPRODUCTION.  One `estimateComponent` per component with the Joback\n"
        "     groups its record declares (groups.joback): the run prints the Joback\n"
        "     Tb, Tc, Pc (a record whose Tc or Pc is IUPAC or measured does not carry\n"
        "     these: they are printed beside it, for comparison), the ideal-gas Cp,\n"
        "     dHf_298 and dGf_298 (s_298 = (dHf - dGf)/298.15 + the elements' CODATA\n"
        "     standard entropies).  A liquid Cp estimated by Rowlinson-Bondi uses\n"
        "     that Cp_ig.\n"
        "  2. SMOKE TEST.  One `propertyScan1D` per component, 300-340 K at 1 bar:\n"
        "     the vapour pressure (the Antoine its vp case promoted), the liquid\n"
        "     heat capacity and the liquid density.  Every value must evaluate;\n"
        "     outside a fitted range the engine announces the extrapolation, and\n"
        "     every autoPromoted value is voiced on the console and in the caveat\n"
        "     block.\n"
        "\\*---------------------------------------------------------------------------*/\n\n"
        "operations\n(\n" + "".join(ops) + ");\n")
    print(f"wrote {case.relative_to(ROOT)} ({n} components)")
    return 0


def upgrade_record(old, new, name):
    """C309 item 2 ("refit nothing else"): an existing record keeps every byte
    except Tc, Pc and omega -- the three value lines and their three provenance
    entries are taken from the freshly built text -- plus an UPGRADED note in
    its header.  Vliq (fitted with the Joback Tc/Pc), liquid Cp, groups and
    every later hand addition stay as they were."""
    out = old
    for k in ("Tc", "Pc", "omega"):
        ln = re.compile(r"^" + k + r" .*$", re.M)
        en = re.compile(r"\n    " + k + r"\n    \{\n.*?\n    \}\n", re.S)
        nl, ne = ln.search(new), en.search(new)
        if not (ln.search(out) and en.search(out) and nl and ne):
            refuse(f"{name}: no {k} line or provenance entry to upgrade")
        out = ln.sub(lambda _: nl.group(0), out, count=1)
        out = en.sub(lambda _: ne.group(0), out, count=1)
    lit = IUPAC[name]
    upg = " and ".join(k for k in ("Tc", "Pc") if k in lit)
    still = "".join(k + ", " for k in ("Tc", "Pc") if k not in lit)
    note = (f"  UPGRADED by DEV.md 4c C309 ({date.today().isoformat()}): {upg} replaced by the IUPAC\n"
            "  recommended value (critically evaluated measurements; citation in\n"
            "  provenance) and omega re-derived from them.  Nothing else refitted: Vliq\n"
            "  is the C292 fit, made with the Joback Tc/Pc, kept as it was.\n")
    anchor = "  locates (the articles are the sources; their DOIs are in provenance).\n"
    if anchor not in out:
        refuse(f"{name}: header anchor not found")
    out = out.replace(anchor, anchor + note, 1)
    out = out.replace("ESTIMATED (Joback): Tc, Pc, ", f"ESTIMATED (Joback): {still}", 1)
    out = out.replace("MEASURED: no critical constant, no Tb.",
                      "MEASURED: no Tb (critical constants: UPGRADED above).", 1)
    out = out.replace("(from the fitted vapour pressure at the ESTIMATED Tc)",
                      "(from the fitted vapour pressure)", 1)
    return out


def main(argv):
    if argv and argv[0] == "case":
        return write_c309_case()
    if not argv or argv[0] not in ("plan", "write"):
        print(__doc__)
        return 2
    keys = {c[1] for c in CANDIDATES}
    data, sha = harvest(keys)
    if argv[0] == "plan":
        for k, n, why in EXCLUDED:
            print(f"EXCLUDED  {n:<28} {why}")
        for n in HELD:
            print(f"HELD      {n:<28} 0.7 Tc beyond the measured vapour pressures by more "
                  f"than {OMEGA_MAX_EXTRAPOLATION_K:g} K")
        for c in CANDIDATES:
            d = data[c[1]]
            print(f"{c[0]:<24} Tc {len(d['Tc'])} Pc {len(d['Pc'])} Tb {len(d['Tboil'])} "
                  f"rho {len(d['rho'])} Cp {len(d['Cp']) + len(d['cp_spec'])}")
        return 0
    prov = "--provisional" in argv
    names = [a for a in argv[1:] if not a.startswith("--")]
    sel = ([c for c in CANDIDATES if c[0] not in HELD] if names == ["all"]
           else [c for c in CANDIDATES if c[0] in names])
    if not sel:
        refuse("no candidate named")
    for c in sel:
        try:
            text, facts = build(c, data, sha, prov)
        except Held as h:
            print(str(h))
            continue
        p = STD / f"{c[0]}.dat"
        if p.exists():
            old = p.read_text()
            if "C287" not in old and "C292" not in old and "C309" not in old:
                refuse(f"{p.relative_to(ROOT)} exists and was not written by this tool")
            if "model AmbroseWalton;" not in old:
                text = splice_promoted_vp(old, text, p)
            if c[0] in IUPAC and c[0] not in C309:
                text = upgrade_record(old, text, c[0])
        p.write_text(text)
        r, cp = facts["rho"], facts["cp"]
        print(f"{c[0]:<24} Tc {facts['Tc']:g} Pc {facts['Pc']:.4g} omega {facts['omega']:.4f} "
              f"Tb {facts['Tb'][0] if facts['Tb'] else '-'} | Vliq {r['value']:.4e} "
              f"max {r['max']:.2f}% ({grade(r['max'])}) n {len(r['kept'])}/{len(r['dropped'])} | "
              + (f"Cp deg {cp['deg']} max {cp['max']:.2f}% ({grade(cp['max'])}) n "
                 f"{len(cp['kept'])}/{len(cp['dropped'])}" if facts["cp_route"] == "thermoml" else
                 f"Cp {facts['cp_route']} deg {cp['deg']} {cp['Tmin']:g}-{cp['Tmax']:g} K"
                 + (f" (polynomial vs equation {cp['dev']:.3f} %)" if "dev" in cp else ""))
              + f" | Tc {facts['routes'][0]} Pc {facts['routes'][1]} | dHf {facts['J']['dHf']:.0f} "
              f"s298 {facts['s298']:.1f}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
