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
/*  A case's COMPONENT record, as the engine resolves it (DEV.md 4c C413): the
 *  case's own `constant/components/<c>.dat` when it carries one, else the
 *  catalogue's `data/standards/components/<c>.dat` -- unless the case is SEALED
 *  (its propertyManifest says `sealed true;`), which never falls back (the rule of
 *  bin/curate/case_records.py `record_path`).  A tutorial that REFERENCES the
 *  catalogue holds no copy of the records it reads, so a reader of "the case's
 *  record" asks here.  The catalogue is the one the app bundles
 *  (`rawRecordFor`, import.meta.glob over data/standards/components).  Only
 *  components are bundled, so only components resolve here.                      */
import { rawRecordFor } from "./catalogue.js";

type Raw = { [rel: string]: string } | undefined;

const isSealed = (raw: Raw): boolean =>
  /\bsealed\s+true\s*;/.test(raw?.["constant/propertyManifest"] ?? "");

/** The record body of component `comp` for this case's raw files, or undefined. */
export function caseComponentRecord(raw: Raw, comp: string): string | undefined {
  const own = raw?.[`constant/components/${comp}.dat`];
  if (own) return own;
  if (isSealed(raw)) return undefined;
  return rawRecordFor(comp) ?? undefined;
}

/** One top-level scalar (`Vliq`, `MW`, ...) of a component record, or undefined. */
export function caseComponentScalar(raw: Raw, comp: string, key: string): number | undefined {
  const body = caseComponentRecord(raw, comp);
  if (!body) return undefined;
  const m = new RegExp(`^${key}\\s+([0-9.eE+-]+)\\s*;`, "m").exec(body);
  return m ? Number(m[1]) : undefined;
}

/** The components a referencing case pins (`"components/<c>.dat"` in its manifest). */
export function pinnedComponentNames(raw: Raw): string[] {
  const m = raw?.["constant/propertyManifest"] ?? "";
  return [...m.matchAll(/^\s*"components\/([^/"]+)\.dat"\s+"[^"]*"\s*;/gm)].map((x) => x[1]!);
}
