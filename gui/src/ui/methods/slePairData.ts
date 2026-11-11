/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  slePairData -- THE MEASURED EVIDENCE of the `sle-pair` EduTool (DEV.md 4c
  C316): benzoic acid, a molecular solid, dissolved in four solvents, and
  the fusion properties of the solid.  A TypeScript FIXTURE and not a props
  case, because no engine operation fits or predicts the solubility of a
  molecular solid from these numbers (measured 2026-11-11 and said on the
  page's Verify moment): the data live here, with the citation block a
  case's `constant/experiments/*.dat` would carry.

  HOW EVERY NUMBER WAS OBTAINED, the same route curate14's evidence took
  (tutorials/props/curation/curate14_nrtl_butanol_water/constant/experiments):
  located through the NIST/TRC ThermoML Archive (ThermoML.v2020-09-30.tgz,
  doi:10.18434/mds2-2422; a FINDING AID, thirdParty/thermoml/README.md),
  read from the archive's file for the article named below, and transcribed
  as printed there.  The article is the source, the archive is the route.
  reviewStatus transcribedNotCheckedAgainstArticle: the values were NOT
  compared against the articles' own tables (no PDF of any of the three is
  in the literature folder); the DOIs, authors, titles, volumes and pages
  were checked on Crossref (api.crossref.org, 2026-11-11).  Uncertainties
  are the archive's combined expanded values (95 % level) as recorded.

  WHY BENZOIC ACID.  It is the archive's best-documented molecular solid for
  this lesson: ONE article (Long et al. 2010) measured it in four solvents
  by one method (gravimetric) and one laboratory, so the ranking of solvents
  is not a comparison of laboratories; and its fusion properties are
  measured by several laboratories, so the spread of a fusion enthalpy can
  be shown with numbers rather than asserted.
\*---------------------------------------------------------------------------*/

/** One measured saturation point: T and the mole fraction of the solid in
 *  the saturated liquid, with its combined expanded uncertainty. */
export interface SolubilityPoint {
  T: number;            // K
  x1: number;           // mole fraction of the solute in the saturated liquid
  u_x1: number;         // combined expanded uncertainty (95 %), same units
}

export interface SleSource {
  text: string;
  doi: string;
  /** What was taken from it, and how it was checked. */
  taken: string;
}

export interface SolventSeries {
  id: "cyclohexane" | "acetone" | "propan-2-ol" | "acetic-acid";
  label: string;
  points: readonly SolubilityPoint[];
  source: SleSource;
}

export const ARCHIVE = "NIST/TRC ThermoML Archive, ThermoML.v2020-09-30.tgz, doi:10.18434/mds2-2422";
export const REVIEW_STATUS = "transcribedNotCheckedAgainstArticle";

export const LONG_2010: SleSource = {
  text: "Long, B.; Li, J.; Zhang, R.; Wan, L. (2010). Solubility of benzoic acid in acetone, "
    + "2-propanol, acetic acid and cyclohexane: Experimental measurement and thermodynamic "
    + "modeling. Fluid Phase Equilib. 297(1), 113–120.",
  doi: "10.1016/j.fluid.2010.06.021",
  taken: "the four solubility series (gravimetric method); read from the archive's file "
    + "10.1016/j.fluid.2010.06.021.xml, transcribed as printed there",
};

/** The fusion properties of the solid: the default. */
export const WANG_2010: SleSource = {
  text: "Wang, T.-C.; Lai, T.-Y.; Chen, Y.-P. (2010). Solid–Liquid Equilibria for Hexanedioic "
    + "Acid + Benzoic Acid, Benzoic Acid + Pentanedioic Acid, and Hexanedioic Acid + "
    + "Pentanedioic Acid. J. Chem. Eng. Data 55(12), 5797–5800.",
  doi: "10.1021/je100749m",
  taken: "benzoic acid T_fus = 396.08 ± 0.53 K (DTA) and ΔH_fus = 18.05 ± 0.55 kJ/mol (DSC); "
    + "archive file 10.1021/je100749m.xml",
};

/** A second laboratory's fusion properties, and the heat capacities. */
export const YANG_2012: SleSource = {
  text: "Yang, H.; Thati, J.; Rasmuson, Å. C. (2012). Thermodynamics of molecular solids in "
    + "organic solvents. J. Chem. Thermodyn. 48, 150–159.",
  doi: "10.1016/j.jct.2011.12.015",
  taken: "benzoic acid T_fus = 394.95 ± 0.5 K, ΔH_fus = 16.82 ± 0.52 kJ/mol, and the molar "
    + "heat capacity of the crystal (16 points, 281–369 K) and of the liquid (16 points, "
    + "407–432 K); archive file 10.1016/j.jct.2011.12.015.xml",
};

/** The fusion properties a page computes with: a melting temperature, an
 *  enthalpy of fusion, and the heat-capacity jump Cp(liquid) − Cp(crystal). */
export interface SolidFusion {
  label: string;
  Tfus: number;          // K
  u_Tfus: number;        // K
  dHfus: number;         // J/mol
  u_dHfus: number;       // J/mol
  source: SleSource;
}

export const FUSION_WANG: SolidFusion = {
  label: "Wang, Lai & Chen 2010", Tfus: 396.08, u_Tfus: 0.53, dHfus: 18050, u_dHfus: 550,
  source: WANG_2010,
};
export const FUSION_YANG: SolidFusion = {
  label: "Yang, Thati & Rasmuson 2012", Tfus: 394.95, u_Tfus: 0.5, dHfus: 16820, u_dHfus: 520,
  source: YANG_2012,
};

/** Yang et al. 2012, the crystal's molar heat capacity [T K, Cp J/(mol K)]. */
export const CP_CRYSTAL: readonly (readonly [number, number])[] = [
  [281.06, 137.3865075], [287.01, 140.07317698], [293.02, 142.8819678], [299, 145.20227326],
  [305.01, 147.40045738], [311.02, 149.72076284], [317, 152.16318964], [323.03, 154.4834951],
  [329.02, 156.9259219], [335.02, 159.49047004], [341.01, 161.93289684], [347.02, 164.37532364],
  [353, 166.6956291], [359.01, 168.89381322], [365.01, 171.21411868], [369.32, 172.8016961],
];
/** Yang et al. 2012, the liquid's molar heat capacity [T K, Cp J/(mol K)]. */
export const CP_LIQUID: readonly (readonly [number, number])[] = [
  [407.4, 230.44296858], [409, 231.4199393], [410.6, 232.15266734], [413.2, 233.00751672],
  [414.8, 233.49600208], [416.5, 233.74024476], [418, 233.98448744], [419.6, 234.35085146],
  [421.2, 234.71721548], [422.8, 235.0835795], [424.4, 235.44994352], [426, 235.81630754],
  [427.6, 236.06055022], [429.2, 236.42691424], [430.8, 236.79327826], [432, 237.15964228],
];

const pts = (rows: readonly (readonly [number, number, number])[]): SolubilityPoint[] =>
  rows.map(([T, x1, u_x1]) => ({ T, x1, u_x1 }));

/** Long et al. 2010, Fluid Phase Equilib. 297, 113-120: benzoic acid (1) in
 *  each solvent (2), mole fraction of the acid in the saturated liquid. */
export const SOLVENTS: readonly SolventSeries[] = [
  {
    id: "cyclohexane", label: "cyclohexane", source: LONG_2010,
    points: pts([
      [283.15, 0.003179, 0.000172], [287.95, 0.004724, 0.000251], [293.16, 0.007413, 0.000391],
      [298, 0.01095, 0.00057], [303.3, 0.01528, 0.00079], [308.02, 0.02052, 0.00107],
      [313.18, 0.03023, 0.00155], [317.75, 0.03701, 0.00189], [322.91, 0.04678, 0.00237],
      [328.18, 0.05656, 0.00288], [333.11, 0.07254, 0.00371], [337.98, 0.09341, 0.00479],
      [342.8, 0.1223, 0.0062],
    ]),
  },
  {
    id: "acetone", label: "acetone", source: LONG_2010,
    points: pts([
      [277.59, 0.1267, 0.0027], [282.21, 0.143, 0.003], [287.03, 0.1576, 0.0033],
      [287.19, 0.1571, 0.0033], [293.2, 0.1753, 0.0037], [298.15, 0.1925, 0.0041],
      [302.95, 0.2111, 0.0045], [307.75, 0.2312, 0.0049], [313.05, 0.2531, 0.0054],
      [317.63, 0.2765, 0.0059], [322.72, 0.3033, 0.0065],
    ]),
  },
  {
    id: "propan-2-ol", label: "2-propanol", source: LONG_2010,
    points: pts([
      [278.06, 0.1286, 0.0027], [282.96, 0.1429, 0.003], [288.15, 0.1595, 0.0033],
      [293.11, 0.1738, 0.0037], [297.79, 0.1922, 0.0041], [303.45, 0.2146, 0.0045],
      [308.09, 0.2321, 0.0049], [312.8, 0.2525, 0.0053], [317.85, 0.278, 0.0059],
      [322.78, 0.2959, 0.0063], [328.2, 0.3251, 0.0069], [333.2, 0.3465, 0.0074],
      [338.15, 0.3735, 0.008], [343.1, 0.4107, 0.0089],
    ]),
  },
  {
    id: "acetic-acid", label: "acetic acid", source: LONG_2010,
    points: pts([
      [292.95, 0.1285, 0.0027], [298.45, 0.1481, 0.0031], [303.05, 0.1655, 0.0035],
      [307.75, 0.1877, 0.004], [312.15, 0.2107, 0.0045], [318.35, 0.2367, 0.005],
      [323.15, 0.2662, 0.0057], [327.95, 0.2967, 0.0063], [332.75, 0.3281, 0.007],
      [337.15, 0.3536, 0.0076], [342.75, 0.4008, 0.0087], [346.65, 0.425, 0.0092],
    ]),
  },
];

/** The witness series the page fits. */
export const WITNESS = SOLVENTS[0];
