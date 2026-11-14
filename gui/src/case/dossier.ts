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
  dossier — the curation dossiers the corpus actually carries.

  A `<case>/curation/<component>.dossier` is a scientific WORK RECORD: which
  evidence was declared, which half was frozen as held-out BEFORE the fit, what
  the held-out residual was, and the verdict that follows from the acceptance
  band.  `CurationDossier.cpp` writes it; nothing in the solver reads it, by
  construction.

  UNTIL THIS MODULE EXISTED THE GUI READ NONE OF THEM.  Every capability row in
  the component inspector carried a hard-wired `notClaimed`, and the panel below
  said, in prose, that "no curation dossier is attached to this component" — a
  claim about the world made by code that had never looked.  Four dossiers ship
  in the corpus right now, two of them about `ethanol` and one about `water`,
  both catalogue components.  An absence nobody checked is not a finding.

  THE DOSSIER'S VOCABULARY IS THE ENGINE'S, AND IT IS NOT TRANSLATED.  Its
  property keys are `binaryVLE.T_bubble` and `vapourPressure`; the inspector's
  capability rows are `psat`, `criticals`, `cpLiquid`, …  Mapping one onto the
  other would be a second home for that correspondence, and `binaryVLE.T_bubble`
  has no pure-component row to map ONTO — it is a binary pair's property.  So a
  dossier is rendered as itself, in its own words, and the capability column
  keeps saying `notClaimed`, which stays true: no dossier claims anything about
  those rows.

  EVERY ENTRY NAMES ITS CASE.  A dossier from `curate02` is about the NRTL pair
  fitted in THAT case, not a property of the catalogue record; without the case
  beside it the row would read as the second thing.
\*---------------------------------------------------------------------------*/

import type { JsonDict, JsonValue } from "../dict/index.js";
import { parse, toJson } from "../dict/index.js";

/** The five verdicts `CurationDossier::verdictOf` computes.  Mirrored, never
 *  extended — a sixth word here would be a classification the engine never
 *  made. */
export type DossierVerdict =
  | "validated"
  | "notValidated"
  | "heldOutPerformed"
  | "validationRefused"
  | "notClaimed";

export interface DossierDataset {
  role: string;
  dataset: string;
  /** the dataset's OWN declared provenance word (`measured`, `synthetic`, …),
   *  or "" when it declares none.  A structural fixture reading like an
   *  experiment months later is exactly what this field prevents. */
  provenance: string;
}

export interface DossierProperty {
  /** the case the curation ran in — `tutorials/props/curation/curate02_…` or `data/curation/pairs/<a>-<b>` */
  casePath: string;
  /** the case's own folder name, for a compact row */
  caseName: string;
  component: string;
  /** the ENGINE's property key, verbatim */
  property: string;
  operation: string;
  model: string;
  verdict: DossierVerdict;
  partitionFingerprint: string;
  datasets: DossierDataset[];
  /** held-out AAD in per cent, or null when the operation reported none */
  aadHeldOutPct: number | null;
  /** the band DECLARED BEFORE the fit, or null when none was declared */
  acceptanceMaxAADPct: number | null;
  acceptanceOrigin: string;
}

//  Two homes (DEV.md 4c C295): the hand-written lessons keep theirs under
//  `tutorials/**/curation/`; the GENERATED curation cases live in
//  `data/curation/{pairs,components,batches}/<name>/curation/`.  Only the
//  `.dossier` files are matched, and the negatives lock run outputs out of
//  the bundle as `tutorials.ts` does for the case files.
const RAW = import.meta.glob([
  "../../../tutorials/**/curation/*.dossier",
  "../../../data/curation/**/curation/*.dossier",
  "!../../../data/curation/**/reports/**",
  "!../../../data/curation/**/converged/**",
  "!../../../data/curation/**/log.*",
  "!../../../data/curation/**/*.csv",
], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function str(v: JsonValue | undefined): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function num(v: JsonValue | undefined): number | null {
  return typeof v === "number" ? v : null;
}

function dict(v: JsonValue | undefined): JsonDict | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as JsonDict) : null;
}

const VERDICTS: readonly string[] = [
  "validated", "notValidated", "heldOutPerformed", "validationRefused", "notClaimed",
];

/** Parse one dossier body.  Returns [] when it does not parse or declares no
 *  component — a malformed file is reported as nothing rather than as an empty
 *  claim about a component it might have named. */
export function readDossier(raw: string, casePath: string): DossierProperty[] {
  let j: JsonDict;
  try { j = toJson(parse(raw)); } catch { return []; }
  const component = str(j.component);
  if (!component) return [];
  const caseName = casePath.split("/").filter(Boolean).slice(-1)[0] ?? casePath;

  //  A LIST, and that is load-bearing.  `curate01` curates `vapourPressure`
  //  TWICE with opposite verdicts, so a collection keyed by the property name
  //  drops one of them — and the one it drops is the `validationRefused` half,
  //  which is the half a reader most needs to see.  Measured: the first
  //  version of this reader's sibling gate counted 4 property blocks where the
  //  corpus declares 5.
  const list = Array.isArray(j.properties) ? j.properties : [];
  const out: DossierProperty[] = [];
  for (const v of list) {
    const blk = dict(v);
    if (!blk) continue;
    //  An entry counts when it names its property AND declares a verdict.
    //  Structural, like the per-value provenance rule next door: a list of
    //  property names would go stale the first time an op curates something new.
    const key = str(blk.property);
    if (!key) continue;
    const verdictWord = str(blk.verdict);
    if (!VERDICTS.includes(verdictWord)) continue;

    const ev = dict(blk.evidence);
    const datasets: DossierDataset[] = [];
    const dsList = ev?.datasets;
    if (Array.isArray(dsList)) {
      for (const d of dsList) {
        const dd = dict(d);
        if (!dd) continue;
        datasets.push({
          role: str(dd.role),
          dataset: str(dd.dataset),
          provenance: str(dd.provenance),
        });
      }
    }
    const metrics = dict(blk.metrics);
    out.push({
      casePath,
      caseName,
      component,
      property: key,
      operation: str(blk.operation),
      model: str(blk.model),
      verdict: verdictWord as DossierVerdict,
      partitionFingerprint: ev ? str(ev.partitionFingerprint) : "",
      datasets,
      aadHeldOutPct: metrics ? num(metrics.aadHeldOutPct) : null,
      acceptanceMaxAADPct: metrics ? num(metrics.acceptanceMaxAADPct) : null,
      acceptanceOrigin: metrics ? str(metrics.acceptanceOrigin) : "",
    });
  }
  return out;
}

let INDEX: Map<string, DossierProperty[]> | null = null;

function index(): Map<string, DossierProperty[]> {
  if (INDEX) return INDEX;
  const m = new Map<string, DossierProperty[]>();
  for (const [path, raw] of Object.entries(RAW)) {
    //  `.../tutorials/props/curation/curate02_x/curation/ethanol.dossier`
    //  or `.../data/curation/pairs/a-b/curation/b.dossier`
    //  -> the case is everything above the `curation/` directory, shown
    //  with its real repository path.
    const casePath = path.replace(/^.*?(tutorials|data\/curation)\//, (_m, h) => `${h}/`)
                         .replace(/\/curation\/[^/]+$/, "");
    for (const d of readDossier(raw, casePath)) {
      const list = m.get(d.component) ?? [];
      list.push(d);
      m.set(d.component, list);
    }
  }
  //  Stable order: by case, then by the engine's property key.
  for (const list of m.values())
    list.sort((a, b) => a.caseName.localeCompare(b.caseName)
                     || a.property.localeCompare(b.property));
  INDEX = m;
  return m;
}

/** Every dossier property the CORPUS carries for this component.  Empty is a
 *  measured answer: this module looked. */
export function dossiersFor(component: string): DossierProperty[] {
  return index().get(component) ?? [];
}

/** How many dossier files the bundle carries at all — so a panel can tell
 *  "nobody curated this component" from "the reader found nothing anywhere",
 *  which are different failures and only one of them is about the component. */
export function dossierCorpusSize(): number {
  let n = 0;
  for (const list of index().values()) n += list.length;
  return n;
}
