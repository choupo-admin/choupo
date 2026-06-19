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
  saveCase --- "Save case as..." helpers for edited cases.

  Phase-1 minimum-viable Save: the GUI lets the user edit numeric
  scalars in unit `operation` blocks (see PropertyPanel + store.ts
  `setOperationScalar`).  This module turns those edits into a downloaded
  file the user can drop back into their case directory on disk.

  Phase 1 ships ONE button: "Download flowsheetDict".  Operation scalars
  + (eventually) stream conditions live there; that's 95 % of the edit
  surface.  Other dicts (controlDict / thermoPackage / constant/*) become
  separate downloads if/when their editing arrives.

  The download uses a Blob + anchor; no File-System-Access-API dance.
  Works on every browser, no native permission prompts.

  IMPORTANT: per Choupo's "dict-on-disk is the truth" credo, the edit
  state lives in browser memory only.  The user MUST save and copy the
  file back into their case for the edit to survive a page reload.
\*---------------------------------------------------------------------------*/

import { strToU8, zipSync } from "fflate";

import { dictToText } from "../adapters/WasmAdapter.js";
import { caseDisplayName } from "./caseName.js";
import { caseTeachingFiles } from "./caseTeaching.js";
import type { CaseFiles } from "./types.js";

/** Download the WHOLE case as a .zip, every file under its REAL path
 *  (system/..., constant/..., code/...), so the student takes it to their PC
 *  (or a collaborator unzips + `runCase`s it).  Generated outputs (build
 *  artefacts, logs, reports) are excluded -- they rebuild.  The case is
 *  self-contained: its components, pairs, reactions, and any code/ travel with
 *  it.  Pure download (a Blob) -- works on every browser, the GUI never writes. */
export function downloadCaseZip(caseFiles: CaseFiles, tutorialName: string): void {
  const raw = caseFiles.rawFiles;
  if (!raw || Object.keys(raw).length === 0) return;
  const skip = (p: string) =>
    /(^|\/)\.?build\//.test(p) || /(^|\/)code\/\.build\//.test(p)
    || /(^|\/)reports\//.test(p) || /(^|\/)log\.choupo/.test(p)
    || /(^|\/)_dist\//.test(p);
  const base = stem(tutorialName);
  const files: Record<string, Uint8Array> = {};
  for (const [p, text] of Object.entries(raw)) {
    if (skip(p)) continue;
    files[`${base}/${p}`] = strToU8(text);
  }
  if (Object.keys(files).length === 0) return;
  // Make the downloaded case "born taught" for the student's OWN local AI agent
  // (vendor-neutral, offline): add ai/choupo-authoring.md + AGENTS.md + CLAUDE.md
  // -- but only those the case does not already ship (keep any case-specific one).
  for (const [p, text] of Object.entries(caseTeachingFiles())) {
    if (raw[p] === undefined) files[`${base}/${p}`] = strToU8(text);
  }
  const zipped = zipSync(files, { level: 6 });
  // fflate returns a Uint8Array; copy into a fresh ArrayBuffer-backed view so
  // the Blob gets exactly these bytes (avoids a possible pooled-buffer offset).
  const blob = new Blob([zipped.slice()], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${base}.zip`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Trigger a browser download of the current (possibly edited)
 *  flowsheetDict, serialised as plain text the user can drop back into
 *  `system/flowsheetDict`.  No-op if the case has no flowsheet
 *  (e.g. a choupoProps case). */
export function downloadFlowsheetDict(caseFiles: CaseFiles,
  tutorialName: string,
): void {
  if (!caseFiles.flowsheet) return;
  const text = dictToText(caseFiles.flowsheet, "flowsheetDict");
  triggerDownload(text, "flowsheetDict", `${stem(tutorialName)}_flowsheetDict.txt`);
}

/** Download an arbitrary case file (used by the clipboard bridge to persist an
 *  agent edit to disk).  `relPath` like "system/flowsheetDict"; the filename
 *  flattens it so it is recognisable in the Downloads folder. */
export function downloadCaseFile(relPath: string, content: string, tutorialName: string): void {
  const flat = relPath.replace(/\//g, "_");
  triggerDownload(content, relPath, `${stem(tutorialName)}__${flat}.txt`);
}

/** Download a component proposal (estimateComponent promote) under its EXACT
 *  dated filename, e.g. "acetone.estimate-2026-06-02.dat" -- so the student
 *  can drop it straight into the case's constant/components/ and promote it
 *  later with the `mv` the file's own header prints.  Unlike downloadCaseFile,
 *  we keep the real .dat name (not a flattened .txt): the artefact IS a dict
 *  file the engine reads, and the DATED name keeps promotion a deliberate,
 *  visible act (never the bare <name>.dat by accident). */
export async function downloadComponentProposal(fileName: string, content: string): Promise<void> {
  // Prefer a real "Save As" dialog (the student CHOOSES the folder) via the
  // File System Access API; fall back to a plain download (lands in the
  // browser's default folder, usually ~/Downloads) where it's unsupported.
  const picker = (window as unknown as {
    showSaveFilePicker?: (opts: unknown) => Promise<{
      createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }>;
    }>;
  }).showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [{ description: "Choupo component", accept: { "text/plain": [".dat"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    } catch (e) {
      // User dismissed the picker -> respect that, no surprise download.
      if (e instanceof DOMException && e.name === "AbortError") return;
      // Any other failure: fall through to the plain download.
    }
  }
  triggerDownload(content, fileName, fileName);
}

/** Save the canvas layout into the case's `.cho` marker.  Prefers a real
 *  "Save As" dialog (the student picks the case folder, keeps the exact
 *  `<caseName>.cho` name so it overwrites the marker in place) via the File
 *  System Access API; falls back to a plain download where unsupported.  This
 *  is the ONLY path that writes the marker -- explicit, never on a drag. */
export async function saveLayoutMarker(markerName: string, content: string): Promise<void> {
  const picker = (window as unknown as {
    showSaveFilePicker?: (opts: unknown) => Promise<{
      createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }>;
    }>;
  }).showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName: markerName,
        types: [{ description: "Choupo case", accept: { "text/plain": [".cho"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;  // user cancelled
      // any other failure -> fall through to the plain download
    }
  }
  triggerDownload(content, markerName, markerName);
}

function triggerDownload(content: string,
  _name: string,
  filename: string,
): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function stem(name: string): string {
  // caseDisplayName reduces a "local:/abs/path" or "external:x" tag to its
  // basename; a tutorial id like "steady/flash01" keeps its shape but has its
  // slash flattened for a clean filename.
  return caseDisplayName(name)
.replace(/^tutorials\//, "")
.replace(/\//g, "_")
.replace(/[^A-Za-z0-9_-]/g, "_");
}
