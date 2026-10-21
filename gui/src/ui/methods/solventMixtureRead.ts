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
  solventMixtureRead -- READERS for the solvent-selection EduTool (DEV.md 4c
  C128).  Two CSV shapes, both written by someone else:

    * the `hansenMixture` operation's own CSV (one row per blend point or per
      pure solvent: the composition in both bases, the blended triple, the
      Teas fractions, Ra, RED, the phase word, the TPD tm, and the target's
      Teas point repeated on every row);
    * the observation table a witness ships under constant/experimental/
      (Hansen 1967, Table 2.3 column G: one rating per solvent, 1..6, with
      the citation on every row).

  NOTHING IS COMPUTED HERE.  A reader turns text into numbers and words and
  stops; every Ra, every RED and every phase word on the page is the
  engine's, and the test bans the arithmetic from this module and the tool
  alike.  Shared by the tool and by tests/solventMixtureLesson.test.ts so
  the two cannot parse the same file two ways.
\*---------------------------------------------------------------------------*/

export interface BlendPoint {
  /** 0-based point index, as the engine numbered it. */
  point: number;
  /** The engine's label: a pure solvent's name at the ends, `A+B` between. */
  label: string;
  /** The second solvent's fraction in the DECLARED basis; NaN on a screen row. */
  s: number;
  /** `volume` | `mass` | `mole` on a sweep, `pure` on a screen. */
  basis: string;
  /** Volume fraction of each declared solvent, keyed by name. */
  phi: { [solvent: string]: number };
  /** The blended triple, MPa^1/2; NaN on a refused (twoPhase) point. */
  dD: number; dP: number; dH: number;
  /** The Teas fractions of the point; NaN on a refused point. */
  fd: number; fp: number; fh: number;
  /** The Hansen distance, MPa^1/2; NaN on a refused point. */
  Ra: number;
  /** Ra / R0; NaN where the target declares no R0 or the point is refused. */
  RED: number;
  /** pure | homogeneous | twoPhase | notVerified */
  phase: string;
  /** Michelsen's tm_min where the test ran; NaN otherwise. */
  tm: number;
  /** The target's own Teas point, the same on every row. */
  fdT: number; fpT: number; fhT: number;
}

export interface BlendTable {
  /** The declared solvents, in the engine's order. */
  solvents: string[];
  rows: BlendPoint[];
}

const num = (s: string | undefined): number => (s === undefined || s === "" ? NaN : Number(s));

/** Parse the hansenMixture CSV.  Throws on a header it does not recognise,
 *  so a renamed engine column fails loudly rather than drawing NaN. */
export function readBlendCsv(text: string): BlendTable {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { solvents: [], rows: [] };
  const cols = lines[0]!.split(",");
  const need = ["point", "label", "s_declared", "basis", "dD_mix_MPa05", "dP_mix_MPa05",
    "dH_mix_MPa05", "fd", "fp", "fh", "Ra_MPa05", "RED", "phase", "tm", "fd_target",
    "fp_target", "fh_target"];
  for (const c of need) if (!cols.includes(c)) throw new Error(`hansenMixture CSV has no column ${c}`);
  const solvents = cols.filter((c) => c.startsWith("phi_")).map((c) => c.slice(4));
  const ix = (c: string) => cols.indexOf(c);
  const rows = lines.slice(1).map((l) => {
    const f = l.split(",");
    const phi: { [s: string]: number } = {};
    for (const s of solvents) phi[s] = num(f[ix(`phi_${s}`)]);
    return {
      point: num(f[ix("point")]), label: f[ix("label")] ?? "", s: num(f[ix("s_declared")]),
      basis: f[ix("basis")] ?? "", phi,
      dD: num(f[ix("dD_mix_MPa05")]), dP: num(f[ix("dP_mix_MPa05")]), dH: num(f[ix("dH_mix_MPa05")]),
      fd: num(f[ix("fd")]), fp: num(f[ix("fp")]), fh: num(f[ix("fh")]),
      Ra: num(f[ix("Ra_MPa05")]), RED: num(f[ix("RED")]), phase: f[ix("phase")] ?? "",
      tm: num(f[ix("tm")]),
      fdT: num(f[ix("fd_target")]), fpT: num(f[ix("fp_target")]), fhT: num(f[ix("fh_target")]),
    };
  });
  return { solvents, rows };
}

/** The row of the smallest Ra among the rows that have one -- the engine's
 *  own minimum, re-read rather than recomputed: the engine publishes it as
 *  the diagnostic `Ra_min_MPa05`, and this is the row it came from. */
export function minimumRow(t: BlendTable): BlendPoint | null {
  let best: BlendPoint | null = null;
  for (const r of t.rows) if (Number.isFinite(r.Ra) && (!best || r.Ra < best.Ra)) best = r;
  return best;
}

export interface Observation {
  solvent: string;
  thesisRow: number;
  thesisLabel: string;
  /** 1 soluble ... 6 no visible effect (Hansen 1967, page 20). */
  rating: number;
  ratingMeaning: string;
  source: string;
}

/** Parse a witness's constant/experimental observation table. */
export function readObservationsCsv(text: string): Observation[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const cols = lines[0]!.split(",");
  const ix = (c: string) => {
    const i = cols.indexOf(c);
    if (i < 0) throw new Error(`observation CSV has no column ${c}`);
    return i;
  };
  const iS = ix("solvent"), iR = ix("thesisRow"), iL = ix("thesisLabel"), iG = ix("rating"),
    iM = ix("ratingMeaning"), iSrc = ix("source");
  return lines.slice(1).map((l) => {
    const f = l.split(",");
    return {
      solvent: f[iS] ?? "", thesisRow: num(f[iR]), thesisLabel: f[iL] ?? "",
      rating: num(f[iG]), ratingMeaning: f[iM] ?? "", source: f[iSrc] ?? "",
    };
  });
}
