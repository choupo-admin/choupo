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
  electrolyteModelsData -- the files of the tree the "Choosing an electrolyte
  activity model" EduTool reads, arriving as raw text through
  import.meta.glob, so no number of theirs is copied into the page:

    (1) the MEASURED tables: the curation datasets of the four salts
        (data/curation/electrolytes/<cation>-<anion>/constant/experiments/),
        the critically evaluated values of Hamer & Wu (1972), Goldberg &
        Nuttall (1978) and Goldberg (1981), each file citing its table;
    (2) the catalogue's PAIR RECORDS for the five salts, Pitzer and eNRTL,
        read only for two facts: whether the record exists, and the line
        that says where its numbers came from (`source`, `fittedInCase`).
        Whether the record was regressed to the measured table on screen --
        an in-sample comparison -- is decided from those two lines alone,
        by `inSampleAgainst`.
\*---------------------------------------------------------------------------*/

import {
  parseMeasuredTable, type MeasuredTable, type PkgModel, type SaltDef, type SaltId,
} from "../../case/electrolyteModels.js";

const TABLE_RAW = import.meta.glob(
  "../../../../data/curation/electrolytes/{Na-Cl,K-Cl,Ca-Cl,Na-SO4}/constant/experiments/*.dat",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

//  The glob lists only files that exist: Mg-SO4 has a Pitzer record and no
//  eNRTL record, and that absence is what step 6 is about.
const ENRTL_RAW = import.meta.glob(
  "../../../../data/standards/parameters/eNRTL/{Na-Cl,K-Cl,Ca-Cl,Na-SO4,Mg-SO4}.dat",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
const PITZER_RAW = import.meta.glob(
  "../../../../data/standards/parameters/Pitzer/pairs/{Na-Cl,K-Cl,Ca-Cl,Na-SO4,Mg-SO4}.dat",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const repoPath = (globKey: string): string => globKey.replace(/^(\.\.\/)+/, "");
export const pairStem = (s: SaltDef): string => `${s.cation}-${s.anion}`;

/** The measured table of a salt, parsed from the file the tree carries. */
export function measuredTable(s: SaltDef): MeasuredTable {
  const stem = pairStem(s);
  const key = Object.keys(TABLE_RAW).find((k) => k.endsWith(`/${stem}/constant/experiments/${stem}.dat`));
  if (!key) throw new Error(`electrolyteModelsData: no measured table bundled for ${stem}`);
  return parseMeasuredTable(s.id as SaltId, repoPath(key), TABLE_RAW[key]!);
}

/** The curation case a table belongs to (its folder). */
export const curationCaseOf = (t: MeasuredTable): string =>
  t.file.replace(/\/constant\/experiments\/[^/]+$/, "");

export interface PairRecord {
  model: PkgModel;
  /** Repository path of the record. */
  file: string;
  /** The record's `source` line. */
  source: string;
  /** The record's `fittedInCase`, when it declares one. */
  fittedInCase: string;
}

/** The catalogue's record for a salt under a model, or null when the
 *  catalogue holds none. */
export function pairRecord(s: SaltDef, model: PkgModel): PairRecord | null {
  const table = model === "eNRTL" ? ENRTL_RAW : PITZER_RAW;
  const stem = pairStem(s);
  const key = Object.keys(table).find((k) => k.endsWith(`/${stem}.dat`));
  if (!key) return null;
  const raw = table[key]!.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const str = (k: string): string => new RegExp(`\\b${k}\\s+"([^"]*)"\\s*;`).exec(raw)?.[1] ?? "";
  return { model, file: repoPath(key), source: str("source"), fittedInCase: str("fittedInCase") };
}

/** The where-it-came-from of a record, judged against a measured table.
 *
 *  `heldOutRows` is true when the record was regressed IN THE CURATION CASE
 *  of that table, which holds out every fourth row (ElectrolyteFit.H,
 *  line 70): those rows can then be scored apart.  `inSample` is true when
 *  that is so, or when the record's source line names the table's first
 *  author (a refit to the same table, rows unstated: every row is then
 *  counted in-sample). */
export interface SampleVerdict { inSample: boolean; heldOutRows: boolean; why: string }

export function inSampleAgainst(rec: PairRecord | null, t: MeasuredTable): SampleVerdict {
  if (!rec) return { inSample: false, heldOutRows: false, why: "no record" };
  if (rec.fittedInCase && rec.fittedInCase === curationCaseOf(t))
    return {
      inSample: true, heldOutRows: true,
      why: `regressed in ${rec.fittedInCase} to this table, every fourth row held out`,
    };
  //  The table's first author as its source line spells it: "W. J. Hamer and
  //  Y.-C. Wu, ..." -> "Hamer"; "R. N. Goldberg, ..." -> "Goldberg".
  const first = /^(?:[A-Z][.-]\s*)*(?:[A-Z]\.\s*)*([A-Z][a-z]+)/.exec(t.source.replace(/^\s+/, ""))?.[1] ?? "";
  if (first && new RegExp(`\\b${first}\\b`).test(rec.source))
    return {
      inSample: true, heldOutRows: false,
      why: `its source line names ${first}, the author of this table: a refit to it`,
    };
  return { inSample: false, heldOutRows: false, why: "not regressed to this table in the tree" };
}
