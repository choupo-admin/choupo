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
  artifactChannel -- the bridge's CSV-artifact side channel.

  The live-reload watch DELIBERATELY skips .csv files (anti reload-loop --
  see isCaseSourceFile in claudeBridge.mjs), so a sweep CSV the in-case agent
  writes (e.g. an outerDict sweep's `sweep_results.csv`) was invisible to the
  GUI.  This module watches the open case for *.csv changes on a SEPARATE
  channel and serves their text on request, so the Assistant console can offer
  the student a one-click plot chip.

  Pure logic (path guard, mtime diff) is exported separately so vitest can
  cover it (gui/tests/artifactChannel.test.ts); the watcher itself is plain
  fs.watch + debounce, mirroring claudeBridge's watchCaseTree.

  Manual test (the fs-watch path):
    1. bin/runGui, open a local case, open the Assistant console.
    2. In a shell:  echo "point,T,duty\n1,300,2\n2,310,3" > <case>/sweep.csv
    3. A "sweep.csv · plot" chip appears above the console terminal;
       clicking it pops the CSV plot out in a new tab.
\*---------------------------------------------------------------------------*/

import { resolve, join, sep, relative } from "node:path";
import {
  readdirSync, statSync, existsSync, readFileSync, watch as fsWatch,
} from "node:fs";

/** Artifacts above this size are neither announced nor served (~5 MB). */
export const ARTIFACT_MAX_BYTES = 5 * 1024 * 1024;

// Folders never scanned for artifacts: build output, agent state, vendored
// code, the scaffolded teaching.  `reports/` is deliberately INCLUDED -- it is
// exactly where the reports chain writes its CSVs.
const SKIP_DIRS = new Set([".build", ".claude", ".git", "node_modules", "code", "ai"]);

/** An artifact is a .csv (case-insensitive) by relative path. */
export function isArtifactCsv(rel) {
  return typeof rel === "string" && /\.csv$/i.test(rel);
}

/** Resolve an artifact's absolute path INSIDE the case dir, or null.
 *  Refuses anything that is not a .csv, escapes the case (../, absolute
 *  paths), or aliases the case dir itself -- same confinement stance as
 *  claudeBridge's resolveUnder(). */
export function safeArtifactPath(caseDir, rel) {
  if (!isArtifactCsv(rel) || rel.includes("\0")) return null;
  const base = resolve(caseDir);
  const abs = resolve(base, rel);
  if (abs === base || !abs.startsWith(base + sep)) return null;
  return abs;
}

/** Diff a fresh scan against the previous rel->mtimeMs map.
 *  Returns { next, changed }: the new map and the entries that are new or
 *  carry a different mtime (unchanged mtimes are NOT re-announced; deleted
 *  files silently drop out of the map). */
export function diffArtifacts(prev, entries) {
  const next = new Map();
  const changed = [];
  for (const e of entries) {
    next.set(e.rel, e.mtimeMs);
    if (prev.get(e.rel) !== e.mtimeMs) changed.push(e);
  }
  return { next, changed };
}

/** All sub-directories of a case worth scanning for artifacts (INCLUDING
 *  reports/, which the live-reload watch skips).  Depth-limited like
 *  claudeBridge's collectDirs. */
export function collectArtifactDirs(root, depth = 4) {
  const out = [root];
  if (depth <= 0) return out;
  let kids = [];
  try { kids = readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const ent of kids) {
    if (!ent.isDirectory()) continue;
    if (SKIP_DIRS.has(ent.name) || ent.name.startsWith(".")) continue;
    out.push(...collectArtifactDirs(join(root, ent.name), depth - 1));
  }
  return out;
}

/** Scan a case dir for CSV artifacts: [{ rel, size, mtimeMs }], sorted by rel.
 *  Oversized files (> ARTIFACT_MAX_BYTES) are excluded outright. */
export function scanCsvArtifacts(dir) {
  const entries = [];
  for (const d of collectArtifactDirs(dir)) {
    let kids = [];
    try { kids = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const ent of kids) {
      if (!ent.isFile() || !isArtifactCsv(ent.name)) continue;
      const abs = join(d, ent.name);
      try {
        const st = statSync(abs);
        if (st.size > ARTIFACT_MAX_BYTES) continue;
        entries.push({
          rel: relative(dir, abs).split(sep).join("/"),
          size: st.size,
          mtimeMs: Math.round(st.mtimeMs),
        });
      } catch { /* vanished mid-scan -- skip */ }
    }
  }
  entries.sort((a, b) => a.rel.localeCompare(b.rel));
  return entries;
}

/** Watch a case dir and emit { type:"artifact", rel, size, mtimeMs } for every
 *  .csv that changes or appears (debounced; unchanged mtimes are silent).
 *  Pre-existing CSVs are seeded silently -- chips are for what happens DURING
 *  the session.  Lazily picks up new sub-folders (e.g. a first run creating
 *  reports/).  Returns a close(). */
export function createArtifactWatcher(dir, emit, debounceMs = 300) {
  let prev = new Map();
  for (const e of scanCsvArtifacts(dir)) prev.set(e.rel, e.mtimeMs); // silent seed

  const watchers = new Map();
  let timer = null;
  const onFsEvent = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      rescanDirs();             // a run may have created reports/ etc.
      const { next, changed } = diffArtifacts(prev, scanCsvArtifacts(dir));
      prev = next;
      for (const e of changed) emit({ type: "artifact", ...e });
    }, debounceMs);
  };
  const addDir = (d) => {
    if (watchers.has(d)) return;
    try { watchers.set(d, fsWatch(d, onFsEvent)); } catch { /* gone */ }
  };
  const rescanDirs = () => { for (const d of collectArtifactDirs(dir)) addDir(d); };
  rescanDirs();

  return {
    close() {
      if (timer) clearTimeout(timer);
      for (const w of watchers.values()) { try { w.close(); } catch { /* */ } }
      watchers.clear();
    },
  };
}

/** Read an artifact's text for { type:"readArtifact", rel }.
 *  Returns { text } or { error } -- never throws. */
export function readArtifactText(caseDir, rel) {
  const abs = safeArtifactPath(caseDir, rel);
  if (!abs) return { error: "refused: not a .csv inside this case" };
  if (!existsSync(abs)) return { error: "no such artifact" };
  try {
    const st = statSync(abs);
    if (st.size > ARTIFACT_MAX_BYTES) return { error: "artifact too large (> 5 MB)" };
    return { text: readFileSync(abs, "utf8") };
  } catch (e) {
    return { error: e.message };
  }
}
