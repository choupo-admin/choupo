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
  loadCase -- load the user's OWN case INTO the GUI from explicit input, with
  NO bridge and NO disk snooping.  Two paths, both fully client-side (so they
  work on the hosted site):

    * openCaseZip()    -- pick a .zip (the one "Download case (.zip)" produced,
                          a collaborator's, or one a student made with the
                          OS's own "Compress"); unzip in memory and locate the
                          ONE case in it (caseArchive.ts holds that rule).
                          EVERY browser.
    * openCaseFolder() -- pick a real folder via the File System Access API and
                          read it (one-shot).  CHROMIUM only (Firefox/Safari
                          lack showDirectoryPicker); guarded by SUPPORTS_DIR_PICKER.

  Both build the in-memory CaseFiles through the SAME `filesToCaseFiles` contract
  the bundled tutorials use, then the caller hands it to `loadExternalCase`.
  The browser never reaches the disk on its own -- the user explicitly hands
  over the .zip or grants the folder.
\*---------------------------------------------------------------------------*/

import { caseFromZipBytes, isGeneratedOutput } from "./caseArchive.js";
import { filesToCaseFiles } from "./tutorials.js";
import type { CaseFiles } from "../case/types.js";

/** True on Chromium (Chrome/Edge/Brave); false on Firefox/Safari. */
export const SUPPORTS_DIR_PICKER =
  typeof window !== "undefined" &&
  typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";

/** Run outputs and tool trees are not read (one home: caseArchive.ts). */
const SKIP = isGeneratedOutput;

/** What an open picker yields: the display name, the parsed in-memory CaseFiles,
 *  AND the pre-parse raw {relPath: rawText} source map.  The raw map is the exact
 *  source bytes the workspace importer must write to disk ("Open materialises"),
 *  so the on-disk case is byte-identical to what the student handed over. */
export interface OpenedCase {
  name: string; files: CaseFiles; raw: { [rel: string]: string };
  /** Files left out that the student should be told about (a .zip's
   *  non-text files, files outside its case folder).  Absent = none. */
  notices?: string[];
}

/** The picker's filter: .zip by extension and by the two MIME types browsers
 *  report for it (Windows says application/x-zip-compressed).  Other archive
 *  formats are refused by caseFromZipBytes, naming what they are. */
export const ZIP_ACCEPT = ".zip,application/zip,application/x-zip-compressed";

/** Open a hidden file picker for a single .zip and return its parsed case.
 *  Throws a CaseArchiveRefusal (message for the student) when the file is not
 *  a .zip or holds no case / several cases. */
export async function openCaseZip(): Promise<OpenedCase | null> {
  const file = await pickFile(ZIP_ACCEPT);
  if (!file) return null;
  return openedCaseFromZip(new Uint8Array(await file.arrayBuffer()), file.name);
}

/** A .zip's bytes -> the OpenedCase every open route feeds the same funnel.
 *  Exported for the round-trip test. */
export function openedCaseFromZip(bytes: Uint8Array, fileName: string): OpenedCase {
  const c = caseFromZipBytes(bytes, fileName);
  return { name: c.name, files: filesToCaseFiles(c.name, c.files), raw: c.files,
    notices: c.notices.length > 0 ? c.notices : undefined };
}

/**
 * Open a real folder and read it one-shot into a case.  Uses the File System
 * Access API `showDirectoryPicker` on Chromium; falls back to an
 * `<input webkitdirectory>` element on Firefox / Safari (which lack the picker
 * but DO support the directory input).  Works in every modern browser now.
 */
export async function openCaseFolder(): Promise<OpenedCase | null> {
  const picker = (window as unknown as {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandleLike>;
  }).showDirectoryPicker;
  if (typeof picker !== "function") return openCaseFolderInput();  // Firefox / Safari
  let dir: FileSystemDirectoryHandleLike;
  try {
    dir = await picker();
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;  // user cancelled
    throw e;
  }
  const raw: { [rel: string]: string } = {};
  await readDir(dir, "", raw);
  const name = dir.name || "opened-folder";
  return { name, files: filesToCaseFiles(name, raw), raw };
}

/**
 * Firefox / Safari fallback: pick a folder via `<input type="file" webkitdirectory>`
 * and read every file (one-shot, no live handle to write back).  `webkitRelativePath`
 * carries the in-folder path ("caseName/system/controlDict"); we strip the top
 * segment so the case root matches the showDirectoryPicker path.
 */
async function openCaseFolderInput(): Promise<OpenedCase | null> {
  const list = await pickFolder();
  if (!list || list.length === 0) return null;
  const raw: { [rel: string]: string } = {};
  let root = "";
  for (const f of Array.from(list)) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const slash = rel.indexOf("/");
    if (!root && slash > 0) root = rel.slice(0, slash);
    const sub = slash >= 0 ? rel.slice(slash + 1) : rel;
    raw[sub] = await f.text();
  }
  const name = root || "opened-folder";
  return { name, files: filesToCaseFiles(name, raw), raw };
}

// --- helpers ----------------------------------------------------------------

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    input.addEventListener("change", () => {
      const f = input.files && input.files[0] ? input.files[0] : null;
      document.body.removeChild(input);
      resolve(f);
    }, { once: true });
    // If the dialog is dismissed with no file, there is no reliable event; the
    // input is simply left detached on next pick. Good enough for a picker.
    document.body.appendChild(input);
    input.click();
  });
}

/** Firefox / Safari folder picker via `<input webkitdirectory>` (one-shot read). */
function pickFolder(): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    (input as unknown as { webkitdirectory: boolean }).webkitdirectory = true;
    input.multiple = true;
    input.style.display = "none";
    input.addEventListener("change", () => {
      const fl = input.files;
      document.body.removeChild(input);
      resolve(fl && fl.length ? fl : null);
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/** Minimal structural type for the FS Access API (TS lib may lack it). */
interface FileSystemDirectoryHandleLike {
  name: string;
  values(): AsyncIterable<FileSystemHandleLike>;
}
interface FileSystemHandleLike {
  kind: "file" | "directory";
  name: string;
  getFile?: () => Promise<File>;
  values?: () => AsyncIterable<FileSystemHandleLike>;
}

async function readDir(dir: FileSystemDirectoryHandleLike, prefix: string,
  out: { [rel: string]: string }): Promise<void> {
  for await (const entry of dir.values()) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (SKIP(rel)) continue;
    if (entry.kind === "directory" && entry.values) {
      await readDir(entry as unknown as FileSystemDirectoryHandleLike, rel, out);
    } else if (entry.kind === "file" && entry.getFile) {
      const f = await entry.getFile();
      // Read text only; dicts are text. Skip obvious binaries by size guard.
      if (f.size <= 4 * 1024 * 1024) out[rel] = await f.text();
    }
  }
}
