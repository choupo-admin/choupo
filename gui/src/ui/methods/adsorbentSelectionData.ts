/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  adsorbentSelectionData -- the DATA of the `adsorbent-selection` EduTool
  (DEV.md 4c C459: "Which adsorbent for which separation"): eight industrial
  adsorbents, five separations, and for every value the page of the book it
  was read at.

  THE RULE OF THIS FILE.  Nothing here is recalled.  Every number and every
  sentence of guidance carries a `Cite` -- the source, the PRINTED page, the
  page of the PDF in ~/Choupo-Literature that holds it, and what sits there --
  and was read on that page (the two scans without a text layer were read as
  images).  A value the folder does not give is `null`, and the page draws
  "not in the cited sources": a visible gap is better than an invisible
  falsehood (the standing rule of data/standards/heuristics/README.md, which
  this file follows without being a record: nothing in the engine reads it and
  the values are reference quotations, not rules of the engine).

  WHAT IS NOT HERE, and the page says so: any market share, tonnage or ranking
  of industrial use.  Nothing in the folder gives one (searched 2026-11-21 in
  Perry 9th ed. section 16, Ruthven 1984 chapters 1-4, Ruthven-Farooq-Knaebel
  1994, Wankat 2nd ed. chapter 17 and the Zhou review), so the "Pareto" of the
  tool is a COUNT of how many of the five separations a cited page names each
  adsorbent for -- computed from the matrix below, not a measurement of use.

  WHERE THE SOURCES DISAGREE they are both shown (alumina pore size, 5A bulk
  density, silica gel in PSA); this file does not reconcile what the books do
  not.
\*---------------------------------------------------------------------------*/

/** The four books the values are read from.  `file` is under
 *  ~/Choupo-Literature; `pdfOffset` is what to ADD to a printed page to get
 *  the PDF page (Perry and Ruthven 1984 and Wankat are one printed page per
 *  PDF page; Ruthven-Farooq-Knaebel is a two-page spread per PDF page and
 *  says so in `spread`). */
export type SourceId = "perry" | "ruthven84" | "ruthvenPSA" | "wankat";

export interface Source {
  id: SourceId;
  short: string;
  cite: string;
  file: string;
  /** The PDF is a two-page spread per sheet (PDF page = (printed + 28) / 2). */
  spread: boolean;
}

export const SOURCES: Readonly<Record<SourceId, Source>> = {
  perry: {
    id: "perry", short: "Perry 9th ed.",
    cite: "Green, D. W.; Southard, M. Z. (eds.) (2019). Perry's Chemical Engineers' Handbook, 9th ed. McGraw-Hill, Section 16, Adsorption and Ion Exchange.",
    file: "Handbooks-DataCompilations/perry-chemical-engineers-handbook-9ed.pdf", spread: false,
  },
  ruthven84: {
    id: "ruthven84", short: "Ruthven 1984",
    cite: "Ruthven, D. M. (1984). Principles of Adsorption and Adsorption Processes. Wiley, New York.",
    file: "Books/ruthven-principles-of-adsorption-and-adsorption-processes-1ed.pdf", spread: false,
  },
  ruthvenPSA: {
    id: "ruthvenPSA", short: "Ruthven, Farooq & Knaebel 1994",
    cite: "Ruthven, D. M.; Farooq, S.; Knaebel, K. S. (1994). Pressure Swing Adsorption. VCH, New York.",
    file: "Books/ruthven-pressure-swing-adsorption-1ed.pdf", spread: true,
  },
  wankat: {
    id: "wankat", short: "Wankat 2nd ed.",
    cite: "Wankat, P. C. (2007). Separation Process Engineering, 2nd ed. Prentice Hall, chapter 17, Adsorption, Chromatography and Ion Exchange.",
    file: "Books/wankat-separation-process-engineering-2ed.pdf", spread: false,
  },
};

/** Where a value was read: the printed page, the PDF page that holds it and
 *  what is on it (a table number, or the sentence). */
export interface Cite {
  src: SourceId;
  page: string;
  pdfPage: number;
  what: string;
}

export interface Sourced<T> { value: T; cite: Cite }

/** A cited value, or a stated absence. */
export type Maybe<T> = Sourced<T> | null;

const perry = (page: string, pdfPage: number, what: string): Cite =>
  ({ src: "perry", page, pdfPage, what });
const r84 = (page: number, what: string): Cite =>
  ({ src: "ruthven84", page: String(page), pdfPage: page + 20, what });
/** `page` is the PRINTED page of the 1994 book, left or right of its sheet. */
const rpsa = (page: number, what: string): Cite =>
  ({ src: "ruthvenPSA", page: String(page), pdfPage: Math.floor((page + 28) / 2), what });
const wk = (page: number, what: string): Cite =>
  ({ src: "wankat", page: String(page), pdfPage: page + 31, what });

// ---- 1. The eight adsorbents ----------------------------------------------

export type AdsorbentId =
  | "activatedCarbon" | "zeolite3A" | "zeolite4A" | "zeolite5A" | "zeolite13X"
  | "silicaGel" | "activatedAlumina" | "carbonMolecularSieve";

export const ADSORBENT_IDS: readonly AdsorbentId[] = [
  "activatedCarbon", "zeolite3A", "zeolite4A", "zeolite5A", "zeolite13X",
  "silicaGel", "activatedAlumina", "carbonMolecularSieve",
];

export type Polarity = "hydrophobic" | "hydrophilic";

/** One printed heat of adsorption: a sorbate and a value in kcal/mol, as the
 *  book prints it (the page converts to kJ/mol, marked as its own arithmetic). */
export interface HeatValue {
  sorbate: string;
  kcalPerMol: number;
  cite: Cite;
}

export interface Adsorbent {
  id: AdsorbentId;
  label: string;
  /** What the source calls the structure and cation. */
  family: string;
  /** The catalogue record in data/standards/assets/ (kind adsorbent), or
   *  null when Choupo ships none. */
  catalogue: string | null;
  /** Pore (or window) size in nm: [low, high], and what the figure is. */
  poreNm: Sourced<{ range: [number, number]; of: string }>;
  /** A second source for the pore size, where one is printed -- shown beside,
   *  never merged. */
  poreAlt: readonly Sourced<string>[];
  polarity: Sourced<Polarity>;
  /** Packed bulk density in kg/m3 as a range, from each source that prints
   *  one for this adsorbent. */
  bulkDensity: readonly Sourced<{ range: [number, number]; of: string }>[];
  /** Heats of adsorption the folder prints for THIS adsorbent, by sorbate. */
  heats: readonly HeatValue[];
  /** The temperature at which a TSA reactivates it, in deg C. */
  reactivationC: Maybe<{ range: [number, number]; of: string }>;
  /** How it is regenerated in the applications the cited pages name. */
  regeneration: readonly Sourced<string>[];
}

export const ADSORBENTS: readonly Adsorbent[] = [
  {
    id: "activatedCarbon", label: "Activated carbon",
    family: "amorphous carbon, micropores plus meso- and macropores",
    catalogue: "activatedCarbon",
    poreNm: {
      value: { range: [1, 4], of: "average pore diameter, the shell-, petroleum-, peat-, lignite- and bituminous-coal-based rows" },
      cite: perry("16-9", 1454, "Table 16-5, Carbons, average pore diameter column"),
    },
    poreAlt: [
      { value: "typical carbons: micropores (below 2 nm) 0.15-0.5 cm3/g, mesopores (2-50 nm) 0.02-0.1 cm3/g, macropores (above 50 nm) 0.2-0.5 cm3/g",
        cite: r84(8, "Table 1.2, Pore sizes in typical activated carbons") },
      { value: "bimodal pore-size distribution, specific area 200-2000 m2/g",
        cite: rpsa(20, "Table 2.3, Act. carbon row") },
    ],
    polarity: {
      value: "hydrophobic",
      cite: perry("16-7", 1452, "Table 16-3, hydrophobic amorphous column: activated carbon"),
    },
    bulkDensity: [
      { value: { range: [400, 600], of: "bituminous-coal-based" },
        cite: perry("16-9", 1454, "Table 16-5, bulk dry density 0.40-0.60 kg/L") },
      { value: { range: [500, 515], of: "gas-phase and liquid-phase (coal base) carbon, average" },
        cite: wk(614, "Table 17-1, bulk density 515 and 500 kg/m3 (avg)") },
    ],
    heats: [],
    reactivationC: {
      value: { range: [100, 140], of: "gas-phase carbon, by steaming" },
      cite: wk(614, "Table 17-1, Reactivation T row"),
    },
    regeneration: [
      { value: "Steam regeneration, with slightly superheated steam near 130 deg C countercurrent to adsorption, is most commonly applied to carbon used for solvent recovery from gases.",
        cite: perry("16-49", 1494, "the paragraph on steam regeneration") },
      { value: "Carbon used in water treatment holds 1 to 5 kg of water per kg, so steam regeneration is not usual; spent carbon is sent to a kiln off the column, or discarded in small units.",
        cite: wk(639, "the paragraph on liquid-phase carbon") },
    ],
  },
  {
    id: "zeolite3A", label: "Zeolite 3A",
    family: "zeolite A, potassium form (KA)",
    catalogue: null,
    poreNm: {
      value: { range: [0.3, 0.3], of: "pore diameter (nominal opening of KA)" },
      cite: perry("16-9", 1454, "Table 16-5, Type 3A (dehydration), average pore diameter; the nominal opening 0.3 nm for KA is stated on page 16-7"),
    },
    poreAlt: [
      { value: "with K+ in place of Na+ only water and other very small molecules such as NH3 penetrate at an appreciable rate",
        cite: rpsa(22, "text on the cation form of zeolite A") },
    ],
    polarity: {
      value: "hydrophilic",
      cite: perry("16-7", 1452, "Table 16-3, hydrophilic structured column: 3A (KA)"),
    },
    bulkDensity: [
      { value: { range: [620, 680], of: "Type 3A" },
        cite: perry("16-9", 1454, "Table 16-5, bulk dry density 0.62-0.68 kg/L") },
      { value: { range: [670, 740], of: "3A" },
        cite: wk(614, "Table 17-1, bulk density 670-740 kg/m3") },
    ],
    heats: [],
    reactivationC: {
      value: { range: [200, 350], of: "the four molecular sieves 3A, 4A, 5A and 13X (one range for all)" },
      cite: wk(614, "Table 17-1, Reactivation T row"),
    },
    regeneration: [
      { value: "Temperature swing: 3A and pore-closed 4A dry reactive streams such as cracked gas, because they take water and exclude hydrocarbons.",
        cite: perry("16-40", 1485, "the TSA applications paragraph on drying") },
    ],
  },
  {
    id: "zeolite4A", label: "Zeolite 4A",
    family: "zeolite A, sodium form (NaA)",
    catalogue: null,
    poreNm: {
      value: { range: [0.4, 0.4], of: "pore diameter (nominal opening of NaA)" },
      cite: perry("16-9", 1454, "Table 16-5, Type 4A (dehydration); the nominal opening 0.4 nm for NaA is stated on page 16-7"),
    },
    poreAlt: [
      { value: "the sodium cation partly blocks each window and reduces the effective aperture from about 4.4 to 3.8 angstrom (0.38 nm)",
        cite: r84(13, "text on zeolite A, sodium form") },
    ],
    polarity: {
      value: "hydrophilic",
      cite: perry("16-7", 1452, "Table 16-3, hydrophilic structured column: 4A (NaA)"),
    },
    bulkDensity: [
      { value: { range: [610, 670], of: "Type 4A" },
        cite: perry("16-9", 1454, "Table 16-5, bulk dry density 0.61-0.67 kg/L") },
      { value: { range: [660, 720], of: "4A" },
        cite: wk(614, "Table 17-1, bulk density 660-720 kg/m3") },
    ],
    heats: [
      { sorbate: "O2", kcalPerMol: 3.2, cite: rpsa(32, "Table 2.4, O2 on 4A") },
      { sorbate: "N2", kcalPerMol: 4.35, cite: rpsa(32, "Table 2.4, N2 on 4A") },
    ],
    reactivationC: {
      value: { range: [200, 350], of: "the four molecular sieves 3A, 4A, 5A and 13X (one range for all)" },
      cite: wk(614, "Table 17-1, Reactivation T row"),
    },
    regeneration: [
      { value: "Temperature swing: 4A removes CO2 ahead of natural-gas liquefaction, and sulfur compounds from wellhead gas without co-adsorbing CO2.",
        cite: perry("16-40", 1485, "the TSA applications paragraphs") },
      { value: "4A is also named, with a carbon molecular sieve, for nitrogen from air by a pressure-swing cycle that exploits the faster diffusion of oxygen.",
        cite: rpsa(85, "section 3.4, the only widely used PSA process based on kinetic selectivity") },
    ],
  },
  {
    id: "zeolite5A", label: "Zeolite 5A",
    family: "zeolite A, calcium form (CaA)",
    catalogue: "zeolite5A",
    poreNm: {
      value: { range: [0.5, 0.5], of: "pore diameter (nominal opening of CaA)" },
      cite: perry("16-9", 1454, "Table 16-5, Type 5A (separations); the nominal opening 0.5 nm for CaA is stated on page 16-7"),
    },
    poreAlt: [
      { value: "the eight-ring window has a free diameter of about 4.3 angstrom and molecules up to about 5.0 angstrom penetrate it, hence the name 5A",
        cite: rpsa(21, "text on zeolite A, calcium form") },
    ],
    polarity: {
      value: "hydrophilic",
      cite: perry("16-7", 1452, "Table 16-3, hydrophilic structured column: 5A (CaA)"),
    },
    bulkDensity: [
      { value: { range: [600, 660], of: "Type 5A" },
        cite: perry("16-9", 1454, "Table 16-5, bulk dry density 0.60-0.66 kg/L") },
      { value: { range: [670, 720], of: "5A" },
        cite: wk(614, "Table 17-1, bulk density 670-720 kg/m3") },
    ],
    heats: [
      { sorbate: "O2", kcalPerMol: 3.3, cite: rpsa(32, "Table 2.4, O2 on 5A") },
      { sorbate: "N2", kcalPerMol: 5.0, cite: rpsa(32, "Table 2.4, N2 on 5A") },
      { sorbate: "Ar", kcalPerMol: 3.36, cite: rpsa(32, "Table 2.4, Ar on 5A") },
      { sorbate: "NH3", kcalPerMol: 25.0, cite: r84(41, "Table 2.7, limiting heat of sorption on 5A") },
    ],
    reactivationC: {
      value: { range: [200, 350], of: "the four molecular sieves 3A, 4A, 5A and 13X (one range for all)" },
      cite: wk(614, "Table 17-1, Reactivation T row"),
    },
    regeneration: [
      { value: "Pressure swing: the IsoSiv process separates n-paraffins from branched and cyclic hydrocarbons by size, in one version with an inert hydrogen purge.",
        cite: perry("16-43", 1488, "the paragraphs on IsoSiv and on inert purge") },
    ],
  },
  {
    id: "zeolite13X", label: "Zeolite 13X",
    family: "zeolite X, sodium form (NaX)",
    catalogue: "zeolite13X",
    poreNm: {
      value: { range: [1.0, 1.0], of: "pore diameter (nominal opening of NaX)" },
      cite: perry("16-9", 1454, "Table 16-5, Type 13X (purification); the nominal opening 1.0 nm for NaX is stated on page 16-7"),
    },
    poreAlt: [
      { value: "twelve-membered oxygen rings of free diameter about 7.5 angstrom; molecules up to about 8.5 angstrom penetrate with little steric hindrance",
        cite: rpsa(22, "text on zeolites X and Y") },
    ],
    polarity: {
      value: "hydrophilic",
      cite: perry("16-7", 1452, "Table 16-3, hydrophilic structured column: 13X (NaX)"),
    },
    bulkDensity: [
      { value: { range: [580, 640], of: "Type 13X" },
        cite: perry("16-9", 1454, "Table 16-5, bulk dry density 0.58-0.64 kg/L") },
      { value: { range: [610, 710], of: "13X" },
        cite: wk(614, "Table 17-1, bulk density 610-710 kg/m3") },
    ],
    heats: [
      { sorbate: "N2", kcalPerMol: 5.0, cite: r84(41, "Table 2.6, N2 on NaX") },
      { sorbate: "CO2", kcalPerMol: 10.0, cite: r84(41, "Table 2.6, CO2 on NaX") },
      { sorbate: "H2O", kcalPerMol: 18.5, cite: r84(41, "Table 2.6, H2O on NaX") },
      { sorbate: "NH3", kcalPerMol: 16.0, cite: r84(41, "Table 2.6, NH3 on NaX") },
    ],
    reactivationC: {
      value: { range: [200, 350], of: "the four molecular sieves 3A, 4A, 5A and 13X (one range for all)" },
      cite: wk(614, "Table 17-1, Reactivation T row"),
    },
    regeneration: [
      { value: "Pressure swing in the enriching cycles the handbook describes: xenon concentrated 80 times from air, nitrogen from air as the heavy product, CO2 from a spacecraft cabin.",
        cite: perry("16-43", 1488, "the paragraphs on enriching and dual-reflux cycles") },
    ],
  },
  {
    id: "silicaGel", label: "Silica gel",
    family: "amorphous silica, unimodal pores",
    catalogue: null,
    poreNm: {
      value: { range: [2, 5], of: "average pore diameter" },
      cite: perry("16-9", 1454, "Table 16-5, Silica gel (drying, separations)"),
    },
    poreAlt: [
      { value: "22 angstrom (2.2 nm) for the high-area gel and 140 angstrom (14 nm) for the low-area gel, both unimodal",
        cite: rpsa(20, "Table 2.3, Silica gel (1) and (2)") },
    ],
    polarity: {
      value: "hydrophilic",
      cite: perry("16-7", 1452, "Table 16-3, hydrophilic amorphous column: silica gel"),
    },
    bulkDensity: [
      { value: { range: [700, 820], of: "silica gel" },
        cite: perry("16-9", 1454, "Table 16-5, bulk dry density 0.70-0.82 kg/L") },
      { value: { range: [700, 820], of: "silica gel (720 typical)" },
        cite: wk(614, "Table 17-1, bulk density 700-820 kg/m3") },
    ],
    heats: [],
    reactivationC: {
      value: { range: [120, 280], of: "silica gel" },
      cite: wk(614, "Table 17-1, Reactivation T row"),
    },
    regeneration: [
      { value: "Regenerated at moderate temperature, 150-200 deg C; above 300 deg C most of the hydroxyls are lost and area and polarity fall.",
        cite: rpsa(20, "text under Table 2.3") },
      { value: "Instrument-air dryers still use a pressure-swing cycle of the Skarstrom type with activated alumina or silica gel.",
        cite: perry("16-42", 1487, "the paragraph on the Skarstrom cycle") },
      { value: "The 1994 book says the opposite for PSA in general: silica gel is not commonly used in PSA processes because its physical strength is inferior to that of alumina or zeolite desiccants.  The two sources are shown, not reconciled.",
        cite: rpsa(21, "text on silica gel") },
    ],
  },
  {
    id: "activatedAlumina", label: "Activated alumina",
    family: "amorphous Al2O3, unimodal pores",
    catalogue: null,
    poreNm: {
      value: { range: [4, 14], of: "average pore diameter, the high-porosity (drying, separations) row; the low-porosity fluoride sorbent is about 7 nm" },
      cite: perry("16-9", 1454, "Table 16-5, Aluminas"),
    },
    poreAlt: [
      { value: "30-3000 angstrom (3-300 nm), unimodal, specific area 320 m2/g: the two books print different ranges",
        cite: rpsa(20, "Table 2.3, Act. alumina row") },
    ],
    polarity: {
      value: "hydrophilic",
      cite: perry("16-7", 1452, "Table 16-3, hydrophilic amorphous column: activated alumina"),
    },
    bulkDensity: [
      { value: { range: [850, 850], of: "high-porosity alumina" },
        cite: perry("16-9", 1454, "Table 16-5, bulk dry density 0.85 kg/L") },
      { value: { range: [800, 800], of: "activated alumina, about" },
        cite: wk(614, "Table 17-1, bulk density about 800 kg/m3") },
    ],
    heats: [],
    reactivationC: {
      value: { range: [150, 315], of: "activated alumina" },
      cite: wk(614, "Table 17-1, Reactivation T row"),
    },
    regeneration: [
      { value: "The pressure-swing air prepurification unit ahead of a cryogenic plant usually holds activated alumina and regenerates at ambient pressure with a nitrogen purge near 40 percent of the feed.",
        cite: perry("16-43", 1488, "the paragraph on PSA prepurification units") },
      { value: "Instrument-air dryers use a Skarstrom pressure-swing cycle with alumina or silica gel.",
        cite: perry("16-42", 1487, "the paragraph on the Skarstrom cycle") },
    ],
  },
  {
    id: "carbonMolecularSieve", label: "Carbon molecular sieve",
    family: "amorphous carbon with a narrow micropore distribution",
    catalogue: null,
    poreNm: {
      value: { range: [0.3, 0.6], of: "average pore diameter" },
      cite: perry("16-9", 1454, "Table 16-5, Carbon molecular sieve (air separation)"),
    },
    poreAlt: [
      { value: "effective micropore diameters from about 4 to 9 angstrom (0.4-0.9 nm)",
        cite: r84(8, "text on carbon molecular sieves") },
    ],
    polarity: {
      value: "hydrophobic",
      cite: perry("16-7", 1452, "Table 16-3, hydrophobic structured column: carbon molecular sieves"),
    },
    bulkDensity: [
      { value: { range: [500, 700], of: "carbon molecular sieve" },
        cite: perry("16-9", 1454, "Table 16-5, bulk dry density 0.5-0.7 kg/L") },
    ],
    heats: [
      { sorbate: "O2", kcalPerMol: 3.8, cite: rpsa(32, "Table 2.4, O2 on CMS") },
      { sorbate: "N2", kcalPerMol: 3.8, cite: rpsa(32, "Table 2.4, N2 on CMS") },
      { sorbate: "Ar", kcalPerMol: 4.0, cite: rpsa(32, "Table 2.4, Ar on CMS") },
    ],
    reactivationC: null,
    regeneration: [
      { value: "Pressure swing, rate-selective: nitrogen from air, because oxygen diffuses in much faster than nitrogen although the equilibrium capacities differ little.",
        cite: perry("16-5", 1450, "Table 16-1, Rate row: nitrogen from air by PSA using carbon molecular sieve") },
    ],
  },
];

export const KCAL_TO_KJ = 4.184;

/** The one heat range every common adsorbent shares in the source, kJ per kg
 *  of adsorbate, with its average. */
export const GENERIC_HEAT: Sourced<{ lowKjPerKg: number; highKjPerKg: number; avgKjPerKg: number }> = {
  value: { lowKjPerKg: 1000, highKjPerKg: 4000, avgKjPerKg: 2500 },
  cite: wk(640, "the paragraph before Eq. (17-25): the typical range of the heat of adsorption"),
};

/** The one statement of the heat of adsorption of a small polar molecule on a
 *  zeolite, not tied to one zeolite. */
export const ZEOLITE_POLAR_HEAT: Sourced<string> = {
  value: "for the small dipolar molecules H2O and NH3 on zeolite adsorbents the electrostatic contribution is very large and the heat of adsorption reaches 25-30 kcal/mol, a size generally associated with chemisorption",
  cite: r84(30, "section 2.1, opening paragraph"),
};

// ---- 2. The five separations and the matrix --------------------------------

export type SeparationId = "drying" | "h2Psa" | "airSeparation" | "vocRecovery" | "waterTreatment";

export interface Separation {
  id: SeparationId;
  label: string;
  phase: "gas" | "liquid";
  /** The question in one line. */
  asks: string;
  /** What the cited pages say about this separation that no cell of the
   *  matrix can hold: a zeolite named without a type, an adsorbent outside
   *  the eight. */
  notes: readonly Sourced<string>[];
}

export const SEPARATIONS: readonly Separation[] = [
  { id: "drying", label: "Gas drying", phase: "gas",
    asks: "Take water from a gas down to a dew point the downstream plant can bear.",
    notes: [
      { value: "Zeolites, activated alumina and silica gel all dry pipeline natural gas; alumina and silica gel have the higher equilibrium capacity and are more easily regenerated with waste-level heat, and the low dew point a zeolite reaches matters when the feed goes to a cryogenic plant.  The zeolite type is not named there.",
        cite: perry("16-40", 1485, "the TSA applications paragraph on drying") },
    ] },
  { id: "h2Psa", label: "Hydrogen purification (PSA)", phase: "gas",
    asks: "Take a 60-70 vol% hydrogen stream to a hydrogen of 99.9 vol% or more.",
    notes: [
      { value: "A typical bed has three layers of alumina, activated carbon and zeolites.  The impurities are water vapour, ammonia, carbon oxides, nitrogen, oxygen, methane and heavier hydrocarbons; the handbook does not say which layer takes which, and does not name the zeolite type.  Choupo's case psa01_h2_psa uses zeolite 5A, a choice of the case, not a statement of the handbook.",
        cite: perry("16-42", 1487, "the paragraph on hydrogen purification") },
    ] },
  { id: "airSeparation", label: "Nitrogen and oxygen from air", phase: "gas",
    asks: "Split air into a nitrogen-rich or an oxygen-rich product by a pressure swing.",
    notes: [
      { value: "Oxygen of 85 to 95 percent purity: a LiLSX zeolite has been the preferred adsorbent since the mid-1980s.  Nitrogen up to 99.99 percent: zeolites and carbon molecular sieves in PSA and VSA.  LiX and LiLSX are not among the eight.",
        cite: perry("16-43", 1488, "the paragraph on ambient air separation") },
    ] },
  { id: "vocRecovery", label: "Solvent and VOC recovery from air", phase: "gas",
    asks: "Remove organic vapours from an air stream, and recover them when it pays.",
    notes: [
      { value: "Reticulated styrene-type polymeric resins are in growing use for VOC removal from air; they are not among the eight.",
        cite: perry("16-49", 1494, "the end of the paragraph on steam regeneration") },
    ] },
  { id: "waterTreatment", label: "Water and wastewater treatment", phase: "liquid",
    asks: "Remove dissolved organics, taste, odour or fluoride from water.",
    notes: [
      { value: "In wastewater treatment powdered activated carbon is dosed to enhance biological treatment and is not regenerated: it stays with the sludge.",
        cite: perry("16-38", 1483, "the paragraph on nonregenerative systems") },
    ] },
];

/** What a cited page says about one adsorbent in one separation.
 *    dominant  the page names it as the adsorbent of the duty
 *    layer     one of several adsorbents the page names for the same bed
 *    named     the page names it for a particular duty inside the separation
 *  An adsorbent with no cell is NOT NAMED IN THE CITED PAGES -- it is not a
 *  claim that it is not used. */
export type Role = "dominant" | "layer" | "named";

export interface Cell {
  sep: SeparationId;
  ads: AdsorbentId;
  role: Role;
  why: string;
  cite: Cite;
}

export const MATRIX: readonly Cell[] = [
  // -- drying
  { sep: "drying", ads: "silicaGel", role: "dominant",
    why: "Cheaper than a zeolite and higher in capacity above about 10 mm Hg of water vapour, but it cannot dry the fluid as low; a silica gel layer at the feed end over a zeolite layer at the product end is common.",
    cite: wk(615, "text on silica gel, section 17.1") },
  { sep: "drying", ads: "activatedAlumina", role: "dominant",
    why: "Competes with silica gel with a capacity a bit lower above about 1 mm Hg, but it is physically more robust and is not damaged by liquid water, which silica gel can be.",
    cite: wk(615, "text on activated alumina, section 17.1") },
  { sep: "drying", ads: "zeolite3A", role: "named",
    why: "Takes water and excludes hydrocarbons, so reactive streams such as cracked gas are dried without losing product to co-adsorption.",
    cite: perry("16-40", 1485, "the TSA applications paragraph on drying") },
  { sep: "drying", ads: "zeolite4A", role: "named",
    why: "Pore-closed 4A does the same as 3A: water in, hydrocarbons out.",
    cite: perry("16-40", 1485, "the TSA applications paragraph on drying") },
  // -- hydrogen PSA
  { sep: "h2Psa", ads: "activatedAlumina", role: "layer",
    why: "One of the three layers of a typical hydrogen PSA bed.",
    cite: perry("16-42", 1487, "the paragraph on hydrogen purification: layers of alumina, activated carbon and zeolites") },
  { sep: "h2Psa", ads: "activatedCarbon", role: "layer",
    why: "One of the three layers of a typical hydrogen PSA bed.",
    cite: perry("16-42", 1487, "the paragraph on hydrogen purification") },
  { sep: "h2Psa", ads: "carbonMolecularSieve", role: "named",
    why: "Layered beds of activated carbon, zeolite and carbon molecular sieve have also been used.",
    cite: perry("16-42", 1487, "the same paragraph, second sentence") },
  // -- air
  { sep: "airSeparation", ads: "carbonMolecularSieve", role: "dominant",
    why: "A rate-selective separation: little difference in equilibrium but oxygen diffuses in far faster, so the product at pressure is nitrogen.",
    cite: rpsa(85, "section 3.4 and Figure 3.15: equilibrium and kinetic data on a carbon molecular sieve") },
  { sep: "airSeparation", ads: "zeolite4A", role: "named",
    why: "The same book names 4A, in the form of a modified 4A sieve, for the kinetic route to nitrogen.",
    cite: rpsa(85, "section 3.4, first paragraph") },
  { sep: "airSeparation", ads: "zeolite5A", role: "named",
    why: "Equilibrium route to oxygen: the handbook lists oxygen from air by PSA using LiX and 5A zeolites, and says a LiLSX zeolite has been preferred for oxygen since the mid-1980s.  LiX and LiLSX are not among the eight.",
    cite: perry("16-5", 1450, "Table 16-1, Equilibrium row; and page 16-43") },
  { sep: "airSeparation", ads: "zeolite13X", role: "named",
    why: "Used in an enriching two-bed cycle that separated nitrogen from air as the heavy product, at an N2 recovery of 23.7 percent.",
    cite: perry("16-43", 1488, "the paragraph on enriching PSA cycles") },
  // -- VOC
  { sep: "vocRecovery", ads: "activatedCarbon", role: "dominant",
    why: "Steam regeneration is most commonly applied to carbon in solvent recovery; recovering the VOC from the regeneration stream pays between 500 and 15,000 ppm, and below about 500 ppm adsorption is followed by destruction.",
    cite: perry("16-49", 1494, "the paragraph on steam regeneration") },
  // -- water treatment
  { sep: "waterTreatment", ads: "activatedCarbon", role: "dominant",
    why: "The largest application of liquid adsorption is carbon treating drinking water and wastewater; contaminant levels are very low and adsorption is strong, so a feed step can last months.",
    cite: wk(639, "the paragraph on liquid-phase carbon") },
  { sep: "waterTreatment", ads: "activatedAlumina", role: "named",
    why: "Used in water treatment to remove excess fluoride selectively.",
    cite: wk(615, "text on activated alumina, section 17.1; the handbook's Table 16-5, page 16-9, lists a low-porosity alumina as the fluoride sorbent") },
];

/** The "Pareto" the folder supports: for each adsorbent, in how many of the
 *  five separations a cited page names it.  A COUNT of readings, not a
 *  market share: nothing in the folder gives one. */
export function namedCount(): { id: AdsorbentId; count: number; dominantIn: number }[] {
  return ADSORBENT_IDS.map((id) => {
    const cells = MATRIX.filter((c) => c.ads === id);
    return {
      id,
      count: new Set(cells.map((c) => c.sep)).size,
      dominantIn: cells.filter((c) => c.role === "dominant").length,
    };
  }).sort((a, b) => b.count - a.count || b.dominantIn - a.dominantIn);
}

export function cell(sep: SeparationId, ads: AdsorbentId): Cell | undefined {
  return MATRIX.find((c) => c.sep === sep && c.ads === ads);
}

// ---- 3. Page arithmetic -----------------------------------------------------

/** Wankat Eq. (17-25): the largest adiabatic temperature rise of a bed taking
 *  a dilute adsorbate, (dT)max = y dH / Cp.  y a mass fraction, dH in kJ per
 *  kg of adsorbate, Cp in kJ/(kg K) of the carrier gas. */
export function maxTemperatureRise(yMass: number, dHkJperKg: number, cpKJperKgK: number): number {
  if (!(cpKJperKgK > 0)) throw new Error("maxTemperatureRise: Cp must be positive");
  return (yMass * dHkJperKg) / cpKJperKgK;
}

/** kcal/mol -> kJ/mol, the page's own arithmetic. */
export function kcalToKj(kcalPerMol: number): number {
  return kcalPerMol * KCAL_TO_KJ;
}

// ---- 4. The catalogue records ----------------------------------------------

/** What a catalogue adsorbent record is compared with, read from the
 *  RAW text of data/standards/assets/<name>.dat by the tool. */
export interface CatalogueIdentity {
  name: string;
  type: string;
  rhoBulk: number;
}

/** Parse `kind adsorbent;` identity out of the raw record text, or null when
 *  the file is not an adsorbent record. */
export function parseAdsorbentRecord(raw: string): CatalogueIdentity | null {
  if (!/^\s*kind\s+adsorbent\s*;/m.test(raw)) return null;
  const name = /^\s*name\s+([^;\s]+)\s*;/m.exec(raw);
  const type = /^\s*type\s+"([^"]*)"\s*;/m.exec(raw);
  const rho = /^\s*rho_bulk\s+([0-9.eE+-]+)\s*;/m.exec(raw);
  if (!name || !type || !rho) return null;
  return { name: name[1]!, type: type[1]!, rhoBulk: Number(rho[1]) };
}

export interface PairIdentity {
  adsorbate: string;
  model: string;
  /** Isosteric heat of adsorption of the record, J/mol (negative). */
  dHads: number | null;
  qMax: number | null;
  quality: string;
}

/** Parse one `recordType adsorptionIsotherm` pair record. */
export function parsePairRecord(raw: string): PairIdentity | null {
  if (!/^\s*recordType\s+adsorptionIsotherm\s*;/m.test(raw)) return null;
  const ads = /^\s*adsorbate\s+([^;\s]+)\s*;/m.exec(raw);
  const model = /^\s*model\s+([^;\s]+)\s*;/m.exec(raw);
  if (!ads || !model) return null;
  const num = (key: string): number | null => {
    const m = new RegExp(`^\\s*${key}\\s+([0-9.eE+-]+)\\s*;`, "m").exec(raw);
    return m ? Number(m[1]) : null;
  };
  const q = /^\s*quality\s+([^;\s]+)\s*;/m.exec(raw);
  return {
    adsorbate: ads[1]!, model: model[1]!, dHads: num("dH_ads"), qMax: num("q_max"),
    quality: q ? q[1]! : "unstated",
  };
}

/** The cases that use a catalogue adsorbent, each opened by its tutorial id.
 *  `none` is stated for an adsorbent no case uses; a test recomputes the
 *  uses from the tutorials and holds this list to them. */
export const CASES_USING: Readonly<Record<string, readonly { id: string; why: string }[]>> = {
  activatedCarbon: [],
  zeolite5A: [
    { id: "steady/separation/psa01_h2_psa", why: "hydrogen recovery from reformer gas on a two-bed PSA" },
  ],
  zeolite13X: [
    { id: "props/adsorption/isotherm01_eval_13x_co2", why: "the 13X isotherms evaluated for CO2, CH4, H2, N2 and O2" },
    { id: "batch/adsorber/batch13_breakthrough_co2", why: "a CO2 breakthrough through a fixed bed of 13X" },
  ],
};
