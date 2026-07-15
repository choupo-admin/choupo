/*---------------------------------------------------------------------------*\
  Polymer group-contribution tables — bundled for the EstimateForm.

  These mirror the engine's curated group catalogues so the GUI can show the
  GLASS-BOX additive breakdown (group | count | MW·count | contribution·count)
  BEFORE/ALONGSIDE the engine's authoritative number.  The GUI computes NOTHING
  physical for the result — the estimate is always the engine's (via WASM); these
  tables are used only to render the per-group sum the engine also prints to its
  console, plus the picker labels.

  Provenance (cite the PRIMARY per value — CLAUDE.md §10):
    • VanKrevelen Vw — Bondi, J. Phys. Chem. 68 (1964) 441, derived from the
      UNIFAC R_k Choupo already ships (Vw = R_k·15.17).  See
      data/standards/parameters/vanKrevelen.dat.
    • Yang2020 Yg — Yang et al., ACS Omega 5 (2020) 19655 (CC-BY 4.0), Table S3.
      See data/standards/parameters/Yang2020.dat.

  Keep these in lock-step with the two .dat files (a new group is added there
  AND here together — same rule as JOBACK_GROUPS in EstimateForm.tsx).
\*---------------------------------------------------------------------------*/

/** One polymer group: its name, molar mass MW [g/mol], and the additive
 *  contribution value (Van Krevelen: Vw [cm³/mol]; Yang: Yg [10³ g·K/mol]). */
export interface PolymerGroup {
  name: string;
  mw: number;       // g/mol
  contrib: number;  // Vw (cm³/mol) for VanKrevelen | Yg (1e3 g·K/mol) for Yang
  label?: string;   // optional human hint
}

// --- Van Krevelen DENSITY groups (data/standards/parameters/vanKrevelen.dat) -----
export const VAN_KREVELEN_GROUPS: PolymerGroup[] = [
  { name: "CH3",   mw: 15.035, contrib: 13.670, label: "CH3 (methyl)" },
  { name: "CH2",   mw: 14.027, contrib: 10.231, label: "CH2 (methylene)" },
  { name: "CH",    mw: 13.019, contrib: 6.780,  label: "CH (methine)" },
  { name: "C",     mw: 12.011, contrib: 3.330,  label: "C (quaternary)" },
  { name: "ACH",   mw: 13.019, contrib: 8.060,  label: "ACH (aromatic =CH–)" },
  { name: "AC",    mw: 12.011, contrib: 5.540,  label: "AC (aromatic =C<, substituted)" },
  { name: "CHCl",  mw: 48.472, contrib: 18.781, label: "CHCl (>CHCl)" },
  { name: "CH2Cl", mw: 49.480, contrib: 22.230, label: "CH2Cl (–CH2Cl)" },
];

// --- Yang 2020 GLASS-TRANSITION groups (data/standards/parameters/Yang2020.dat) --
// 58 groups; Yg in 10³ g·K/mol.  Negative Yg (O, S, SiCH3CH3) are legitimate
// linker contributions, kept faithfully.
export const YANG2020_GROUPS: PolymerGroup[] = [
  { name: "CH2",                mw: 14,   contrib: 4.026,   label: "CH2  –CH2–" },
  { name: "CHCH3",              mw: 28,   contrib: 8.222,   label: "CHCH3  –CH(CH3)– (propylene)" },
  { name: "CHOCH3",             mw: 44,   contrib: 10.611,  label: "CHOCH3  –CH(OCH3)–" },
  { name: "CHCOOH",             mw: 58,   contrib: 18.820,  label: "CHCOOH  –CH(COOH)–" },
  { name: "CHOH",               mw: 30,   contrib: 4.697,   label: "CHOH  –CH(OH)– (vinyl alcohol)" },
  { name: "CHCONH2",            mw: 57,   contrib: 29.918,  label: "CHCONH2  –CH(CONH2)–" },
  { name: "CHcyclopentyl",      mw: 82,   contrib: 29.607,  label: "CHcyclopentyl" },
  { name: "CHcyclohexyl",       mw: 96,   contrib: 38.934,  label: "CHcyclohexyl" },
  { name: "CHphenyl",           mw: 90,   contrib: 42.153,  label: "CHphenyl  –CH(C6H5)– (styrene)" },
  { name: "CHCl",               mw: 48.5, contrib: 17.911,  label: "CHCl  –CHCl– (vinyl chloride)" },
  { name: "CHvinyl",            mw: 40,   contrib: 10.770,  label: "CHvinyl" },
  { name: "CHeqCH",             mw: 26,   contrib: 1.344,   label: "CHeqCH  –CH=CH–" },
  { name: "CCH3eqCH",           mw: 40,   contrib: 6.228,   label: "CCH3eqCH" },
  { name: "CCleqCH",            mw: 60.5, contrib: 13.807,  label: "CCleqCH" },
  { name: "CH4pyridyl",         mw: 91,   contrib: 40.704,  label: "CH4pyridyl  (4-vinylpyridine)" },
  { name: "CH2pyrrolidinone",   mw: 97,   contrib: 46.146,  label: "CH2pyrrolidinone  (NVP)" },
  { name: "CHCN",               mw: 39,   contrib: 15.637,  label: "CHCN  –CH(CN)– (acrylonitrile)" },
  { name: "CHcarbazolyl",       mw: 179,  contrib: 93.246,  label: "CHcarbazolyl  (NVC)" },
  { name: "CCH3CH3",            mw: 42,   contrib: 18.234,  label: "CCH3CH3  –C(CH3)2– (isobutylene)" },
  { name: "CCH3COOCH3",         mw: 86,   contrib: 37.503,  label: "CCH3COOCH3  (MMA)" },
  { name: "CCOOCH3COOCH3",      mw: 130,  contrib: 57.666,  label: "CCOOCH3COOCH3" },
  { name: "CCH3phenyl",         mw: 104,  contrib: 54.475,  label: "CCH3phenyl  (α-methylstyrene)" },
  { name: "CClCOOCH3",          mw: 106.5,contrib: 43.597,  label: "CClCOOCH3" },
  { name: "CFF",                mw: 50,   contrib: 17.503,  label: "CFF  –CF2– (TFE)" },
  { name: "CClCl",              mw: 83,   contrib: 23.910,  label: "CClCl  –CCl2–" },
  { name: "CFCl",               mw: 66.5, contrib: 26.884,  label: "CFCl" },
  { name: "CFCF3",              mw: 100,  contrib: 32.682,  label: "CFCF3" },
  { name: "CHCF3",              mw: 82,   contrib: 25.254,  label: "CHCF3" },
  { name: "CCF3CF3",            mw: 150,  contrib: 80.103,  label: "CCF3CF3" },
  { name: "NCOCH3",             mw: 57,   contrib: 23.331,  label: "NCOCH3" },
  { name: "O",                  mw: 16,   contrib: -14.718, label: "O  –O– (ether linker)" },
  { name: "Oend",              mw: 16,   contrib: 12.011,  label: "Oend" },
  { name: "Ooxide",             mw: 16,   contrib: 4.989,   label: "Ooxide" },
  { name: "S",                  mw: 32,   contrib: -2.887,  label: "S  –S– (thioether linker)" },
  { name: "CO",                 mw: 28,   contrib: 4.370,   label: "CO  >C=O" },
  { name: "SO2",                mw: 64,   contrib: 15.373,  label: "SO2  –SO2–" },
  { name: "OCSO",               mw: 76,   contrib: 14.676,  label: "OCSO" },
  { name: "COO",                mw: 44,   contrib: 7.025,   label: "COO  ester linker" },
  { name: "CONH",               mw: 43,   contrib: 19.247,  label: "CONH  amide linker" },
  { name: "OCOO",               mw: 60,   contrib: 13.663,  label: "OCOO  carbonate linker" },
  { name: "OCONH",              mw: 59,   contrib: 16.108,  label: "OCONH  urethane linker" },
  { name: "pPhenylene",         mw: 76,   contrib: 42.182,  label: "pPhenylene  –C6H4–" },
  { name: "methylPhenylene",    mw: 90,   contrib: 43.893,  label: "methylPhenylene" },
  { name: "dimethylPhenylene",  mw: 104,  contrib: 68.975,  label: "dimethylPhenylene" },
  { name: "cyclohexylene",      mw: 82,   contrib: 36.274,  label: "cyclohexylene" },
  { name: "naphthylene",        mw: 126,  contrib: 111.805, label: "naphthylene" },
  { name: "pyromelliticDiimide",mw: 214,  contrib: 187.952, label: "pyromelliticDiimide" },
  { name: "glutarimide",        mw: 111,  contrib: 44.226,  label: "glutarimide" },
  { name: "phthalimide",        mw: 145,  contrib: 103.180, label: "phthalimide" },
  { name: "quinoxaline",        mw: 128,  contrib: 112.517, label: "quinoxaline" },
  { name: "phenylQuinoxaline",  mw: 204,  contrib: 141.851, label: "phenylQuinoxaline" },
  { name: "benzoxazole",        mw: 117,  contrib: 88.241,  label: "benzoxazole" },
  { name: "thiophene",          mw: 82,   contrib: 35.372,  label: "thiophene" },
  { name: "dioxane",            mw: 86,   contrib: 33.723,  label: "dioxane" },
  { name: "SiCH3CH3",           mw: 58,   contrib: -1.059,  label: "SiCH3CH3  –Si(CH3)2– (PDMS)" },
  { name: "SiCH3phenyl",        mw: 120,  contrib: 21.853,  label: "SiCH3phenyl" },
  { name: "CH2oxide",           mw: 14,   contrib: 3.412,   label: "CH2oxide" },
  { name: "backboneSideChain",  mw: 0,    contrib: 2.771,   label: "backboneSideChain  (Nb term)" },
];

/** Mantine Select `data` for a group table. */
export function selectData(groups: PolymerGroup[]): { value: string; label: string }[] {
  return groups.map((g) => ({ value: g.name, label: g.label ?? g.name }));
}

/** Lookup helper (name → group), for the per-group contribution breakdown. */
export function groupBy(groups: PolymerGroup[]): Record<string, PolymerGroup> {
  return Object.fromEntries(groups.map((g) => [g.name, g]));
}

// --- Quick-pick repeat units (pre-fill the group picker) ---------------------
export interface QuickPick {
  name: string;             // suggested component name
  label: string;            // menu label
  rows: { group: string; count: number }[];
}

// Van Krevelen (density) quick-picks — backbone + pendant decomposition.
export const VK_QUICKPICKS: QuickPick[] = [
  { name: "polystyrene", label: "Polystyrene  –[CH2–CH(C6H5)]–",
    rows: [{ group: "CH2", count: 1 }, { group: "CH", count: 1 },
           { group: "ACH", count: 5 }, { group: "AC", count: 1 }] },
  { name: "pvc", label: "PVC  –[CH2–CHCl]–",
    rows: [{ group: "CH2", count: 1 }, { group: "CHCl", count: 1 }] },
  { name: "polyethylene", label: "Polyethylene  –[CH2–CH2]–",
    rows: [{ group: "CH2", count: 2 }] },
];

// Yang 2020 (Tg) quick-picks — main-chain Yang groups (Nb = 0 for these vinyls).
export const YANG_QUICKPICKS: QuickPick[] = [
  { name: "pvc", label: "PVC  –[CH2–CHCl]–  (≈351 K)",
    rows: [{ group: "CH2", count: 1 }, { group: "CHCl", count: 1 }] },
  { name: "polystyrene", label: "Polystyrene  –[CH2–CH(phenyl)]–  (≈444 K)",
    rows: [{ group: "CH2", count: 1 }, { group: "CHphenyl", count: 1 }] },
  { name: "pmma", label: "PMMA  –[CH2–C(CH3)(COOCH3)]–  (≈378 K)",
    rows: [{ group: "CH2", count: 1 }, { group: "CCH3COOCH3", count: 1 }] },
];
