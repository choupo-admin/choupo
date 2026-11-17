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
/*  A case's record, as the engine resolves it (DEV.md 4c C413): the case's own
 *  constant/<sub> when it carries one, else the installation catalogue's
 *  data/standards/<sub>.  A tutorial that REFERENCES the catalogue holds no copy of
 *  the records it reads, so a test that reads "the case's record" asks here.        */
import { existsSync, readFileSync } from "node:fs";

//  The app's resolver (gui/src/case/caseRecordRead.ts) is THE one: tests re-export it,
//  and `readCaseRecord` below is only its filesystem form (a path, not a bundle).
export { caseComponentRecord, caseComponentScalar, pinnedComponentNames }
  from "../src/case/caseRecordRead.js";

/** Read a file; when it is a `.../constant/<sub>` the case does not carry, read
 *  the catalogue's `data/standards/<sub>` instead. */
export function readCaseRecord(path: string): string {
  if (existsSync(path)) return readFileSync(path, "utf-8");
  const k = path.lastIndexOf("/constant/");
  if (k >= 0) {
    // the repository root is the directory that holds `tutorials/`
    const t = path.lastIndexOf("/tutorials/", k);
    const root = t >= 0 ? path.slice(0, t) : path.slice(0, k);
    const cat = `${root}/data/standards/${path.slice(k + "/constant/".length)}`;
    if (existsSync(cat)) return readFileSync(cat, "utf-8");
  }
  return readFileSync(path, "utf-8");      // the original ENOENT, naming the case's path
}
