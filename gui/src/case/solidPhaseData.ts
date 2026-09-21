/*---------------------------------------------------------------------------*\
  Solid-phase data for the pure-compound P-T phase diagram — the triple point,
  enthalpies of fusion + sublimation, and the fusion volume change needed to
  draw the sublimation (solid-vapour) and fusion (solid-liquid) lines.

  These are intrinsic, cited pure-compound constants.  They live here (a small
  GUI table fed into the engine op's `solid {}` block) rather than in the frozen
  data/standards/ catalogue, mirroring how unifacGroups.ts supplies group data:
  the GUI provides the constants, the ENGINE (purePhaseDiagram) does the
  Clapeyron physics.  A compound absent here gets the liquid-vapour + critical
  diagram only (graceful).

  ENGINE PRECEDENCE (2026-06-14): the engine now ALSO reads a curated
  `sublimation { tripleT; tripleP; Hfus; Hsub; }` reference-state block off the
  component itself, and that wins over this op-dict `solid{}` block.  The
  fusion-line slope `deltaVfus` is NOT carried on the component (it is a
  sample/measurement quantity), so this GUI table remains the source of
  `deltaVfus` (and the fallback for compounds whose .dat carries no
  `sublimation{}` yet).  When a compound's component data already curates the
  triple point + enthalpies, only `deltaVfus` need be supplied here.

  Provenance (Vítor's to confirm):
    water — Tt, Pt: IAPWS-95 / ITS-90 triple point (273.16 K, 611.657 Pa).
            ΔH_fus 6010 J/mol @ 0 °C, ΔH_sub 51059 J/mol: CRC Handbook / NIST.
            ΔV_fus from ρ_ice 916.7 & ρ_water 999.84 kg/m³, MW 18.0153
            → −1.63e-6 m³/mol (the negative value is water's density anomaly,
            giving the backward-sloping melting line).
\*---------------------------------------------------------------------------*/

export interface SolidPhase {
  tripleT: number;   // K
  tripleP: number;   // Pa
  Hfus: number;      // J/mol
  Hsub: number;      // J/mol
  deltaVfus: number; // m^3/mol  (V_liquid - V_solid; < 0 for water)
}

export const SOLID_PHASE: Record<string, SolidPhase> = {
  water: { tripleT: 273.16, tripleP: 611.657, Hfus: 6010, Hsub: 51059, deltaVfus: -1.63e-6 },
};

export function solidPhaseFor(name: string): SolidPhase | undefined {
  return SOLID_PHASE[name];
}

/*---------------------------------------------------------------------------*\
  WHAT THE PICTURE ACTUALLY DREW.

  The P-T lens's caption was a literal ending "Solid region omitted -- needs
  triple-point / dHfus data", and for water the engine had drawn the
  sublimation (S-V) and fusion (S-L) lines and marked the triple point.  The
  legend said one thing and the sentence beside it said the opposite.

  Deriving the caption from the SPEC (does the case hand the op a `solid {}`
  block?) would be right today and wrong tomorrow: since 2026-06-14 the engine
  ALSO reads a curated `sublimation { tripleT; tripleP; Hfus; Hsub; }` block off
  the component itself, and that WINS over the op-dict block.  Three components
  carry one (water, CO2, acetylene) and only water is in the table above -- so
  a spec-derived caption would tell a CO2 reader the solid region was omitted
  while the sublimation curve was on screen.

  So the caption is derived from the CSV: the op labels every row with its
  `curve` (saturation / critical / sublimation / triple / fusion), and reading
  that is reading the picture.  It also distinguishes the THIRD state the old
  two-way sentence could not express -- the sublimation curve drawn WITHOUT the
  melting line, which is exactly what a component carrying `sublimation{}` but
  no dVfus gets (PurePhaseDiagram.cpp: `hasFusion = hasSub && Hfus > 0 &&
  dVfus != 0`, and dVfus is a sample quantity that lives only in the table
  above).
\*---------------------------------------------------------------------------*/

/** Which branches a purePhaseDiagram CSV actually contains. */
export interface PhaseCurvesDrawn {
  sublimation: boolean;
  fusion: boolean;
  triple: boolean;
}

/** Read the `curve` column of a purePhaseDiagram CSV.  An unreadable or absent
 *  CSV reports NOTHING drawn -- the caption then makes no claim about a solid
 *  region, which is correct: there is no picture yet. */
export function phaseCurvesDrawn(csv: string | null | undefined): PhaseCurvesDrawn {
  const none = { sublimation: false, fusion: false, triple: false };
  if (!csv) return none;
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return none;
  const col = lines[0]!.split(",").map((s) => s.trim()).indexOf("curve");
  if (col < 0) return none;
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const cell = lines[i]!.split(",")[col];
    if (cell) seen.add(cell.trim());
  }
  return {
    sublimation: seen.has("sublimation"),
    fusion: seen.has("fusion"),
    triple: seen.has("triple"),
  };
}

/** The sentence the P-T caption ends with, describing THE SOLID REGION AS
 *  DRAWN.  Three states, because the engine has three. */
export function solidRegionCaption(drawn: PhaseCurvesDrawn): string {
  if (drawn.sublimation && drawn.fusion)
    return "Solid region drawn: the sublimation (S–V) and fusion (S–L) lines, "
      + "meeting the saturation curve at the marked triple point.";
  if (drawn.sublimation)
    return "Solid region partly drawn: the sublimation (S–V) line and the triple point. "
      + "The fusion (S–L) line needs the volume change on melting, which this "
      + "compound's record does not carry.";
  return "Solid region omitted — this compound carries no triple-point / ΔHfus data.";
}
