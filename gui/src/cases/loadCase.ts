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
                          or a collaborator's); unzip in memory.  EVERY browser.
    * openCaseFolder() -- pick a real folder via the File System Access API and
                          read it (one-shot).  CHROMIUM only (Firefox/Safari
                          lack showDirectoryPicker); guarded by SUPPORTS_DIR_PICKER.

  Both build the in-memory CaseFiles through the SAME `filesToCaseFiles` contract
  the bundled tutorials use, then the caller hands it to `loadExternalCase`.
  The browser never reaches the disk on its own -- the user explicitly hands
  over the .zip or grants the folder.
\*---------------------------------------------------------------------------*/

import { strFromU8, unzipSync } from "fflate";

import { filesToCaseFiles } from "./tutorials.js";
import type { CaseFiles } from "../case/types.js";

/** True on Chromium (Chrome/Edge/Brave); false on Firefox/Safari. */
export const SUPPORTS_DIR_PICKER =
  typeof window !== "undefined" &&
  typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";

const SKIP = (rel: string) =>
  /(^|\/)\.git\//.test(rel) || /(^|\/)\.?build\//.test(rel)
  || /(^|\/)reports\//.test(rel) || /(^|\/)node_modules\//.test(rel)
  || /(^|\/)log\.choupo/.test(rel);

/** Strip a single common top-level folder from a {path:...} map, if one wraps
 *  everything (our .zip is "<case>/system/...", so we want "system/..."). */
function stripCommonTop(files: { [rel: string]: string }): { [rel: string]: string } {
  const keys = Object.keys(files);
  if (keys.length === 0) return files;
  const firstSeg = (p: string) => p.split("/")[0];
  const top = firstSeg(keys[0]!);
  if (!top || !keys.every((k) => firstSeg(k) === top && k.includes("/"))) return files;
  const out: { [rel: string]: string } = {};
  for (const [k, v] of Object.entries(files)) out[k.slice(top.length + 1)] = v;
  return out;
}

/** Open a hidden file picker for a single .zip and return its parsed case. */
export async function openCaseZip(): Promise<{ name: string; files: CaseFiles } | null> {
  const file = await pickFile(".zip,application/zip");
  if (!file) return null;
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(buf);
  const raw: { [rel: string]: string } = {};
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.endsWith("/")) continue;            // directory entry
    if (SKIP(path)) continue;
    raw[path] = strFromU8(bytes);
  }
  const flat = stripCommonTop(raw);
  const name = file.name.replace(/\.zip$/i, "") || "uploaded-case";
  return { name, files: filesToCaseFiles(name, flat) };
}

/** Open a real folder (Chromium only) and read it one-shot into a case. */
export async function openCaseFolder(): Promise<{ name: string; files: CaseFiles } | null> {
  const picker = (window as unknown as {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandleLike>;
  }).showDirectoryPicker;
  if (typeof picker !== "function") throw new Error("This browser has no folder picker (use Chrome/Edge, or upload a .zip).");
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
  return { name, files: filesToCaseFiles(name, raw) };
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
