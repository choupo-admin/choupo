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
  caseArchive -- find the ONE case inside a .zip a student made, pure.
  (DEV.md 4c C107.)

  The zips students actually produce are not the one "Download case (.zip)"
  writes.  macOS "Compress" adds a `__MACOSX/` tree of `._*` resource forks
  beside the folder (and `.DS_Store` inside it); Windows "Send to compressed
  folder" wraps the case in one folder; selecting the case's CONTENTS and
  zipping them gives no wrapping folder at all; zipping a parent folder puts
  the case two levels deep.  The old rule -- strip ONE common top folder --
  fails on the first and the last.

  THE RULE, and this is its one home: THE CASE ROOT IS THE OUTERMOST FOLDER
  THAT CONTAINS `system/controlDict`.  Outermost, because a sectored plant
  carries further `system/controlDict` files inside its own sector folders
  (measured: tutorials/plant/twoSectorDemo has three) and those are parts of
  the case, not other cases.  Zero roots refuses, and so do two roots that
  are not nested (the roots are named) -- the GUI opens one case at a time
  and choosing between them is the student's act, never a guess.

  What is dropped, and how loudly:
    * OS junk BY NAME (`__MACOSX/`, `._*`, `.DS_Store`, `Thumbs.db`,
      `desktop.ini`) -- silently: it was never part of anybody's case.
    * Run outputs and tool trees (`.git/`, `build/`, `reports/`,
      `node_modules/`, `log.choupo*`) -- silently, the same SKIP the folder
      reader and the download apply: they rebuild.
    * Files OUTSIDE the case root (a README beside the case folder) and
      files that are NOT TEXT (a PDF or a picture kept in the folder) --
      dropped and NAMED in `notices`.  A case in the GUI is a map of TEXT
      (`CaseFiles.rawFiles`, `extraFiles`, the importer's raw map are all
      `string`); decoding a PDF as UTF-8 would hand the engine and the disk
      a mangled copy under the original's name, which is worse than leaving
      it out and saying so.  "Not text" is decided by the bytes, never the
      extension: a NUL byte, or bytes that are not valid UTF-8.
\*---------------------------------------------------------------------------*/

import { unzipSync } from "fflate";

/** A refusal a student can act on.  Its message is shown verbatim. */
export class CaseArchiveRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaseArchiveRefusal";
  }
}

/** What a .zip yields once its case is found. */
export interface UnpackedCase {
  /** The case's display name: the root folder's own name, else the archive's. */
  name: string;
  /** Path of the case root inside the archive ("" when the zip holds the
   *  case's contents directly). */
  root: string;
  /** {path relative to the case root: text}, ready for filesToCaseFiles. */
  files: { [rel: string]: string };
  /** One sentence per file left out that the student might miss. */
  notices: string[];
}

/** OS junk, by name: never part of a case. */
export function isOsJunk(path: string): boolean {
  const segs = path.split("/");
  if (segs.includes("__MACOSX")) return true;
  const base = segs[segs.length - 1] ?? "";
  return base === ".DS_Store" || base.startsWith("._")
    || /^thumbs\.db$/i.test(base) || /^desktop\.ini$/i.test(base);
}

/** Run outputs and tool trees -- the same set the folder reader skips. */
export function isGeneratedOutput(rel: string): boolean {
  return /(^|\/)\.git\//.test(rel) || /(^|\/)\.?build\//.test(rel)
    || /(^|\/)reports\//.test(rel) || /(^|\/)node_modules\//.test(rel)
    || /(^|\/)log\.choupo/.test(rel);
}

const MARKER = "system/controlDict";

/** The case roots of a set of paths: every folder D with D/system/controlDict,
 *  keeping only the OUTERMOST (a sector's own controlDict is part of its
 *  plant).  "" is the archive's top. */
export function findCaseRoots(paths: readonly string[]): string[] {
  const all = new Set<string>();
  for (const p of paths) {
    if (p === MARKER) all.add("");
    else if (p.endsWith("/" + MARKER)) all.add(p.slice(0, -(MARKER.length + 1)));
  }
  const inside = (child: string, parent: string) =>
    parent === "" ? child !== "" : child.startsWith(parent + "/");
  return [...all]
    .filter((r) => ![...all].some((o) => o !== r && inside(r, o)))
    .sort();
}

/** Normalise one archive entry name: backslashes (old Windows tools), a
 *  leading "./" or "/". */
function normalisePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
}

const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** The text of a file, or null when its bytes are not text. */
export function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return UTF8.decode(bytes);
  } catch {
    return null;
  }
}

/** Locate the one case in a set of unzipped entries.  Pure; throws a
 *  CaseArchiveRefusal with a message for the student. */
export function caseFromEntries(
  entries: { [path: string]: Uint8Array },
  archiveName: string,
): UnpackedCase {
  const kept: { [path: string]: Uint8Array } = {};
  for (const [raw, bytes] of Object.entries(entries)) {
    const p = normalisePath(raw);
    if (!p || p.endsWith("/")) continue;               // directory entry
    if (isOsJunk(p)) continue;
    kept[p] = bytes;
  }
  const roots = findCaseRoots(Object.keys(kept));
  if (roots.length === 0) {
    throw new CaseArchiveRefusal(
      `“${archiveName}” holds no Choupo case: no folder in it contains `
      + `system/controlDict.  A case is a folder with system/, constant/ and 0/ `
      + `inside -- compress that folder (or its contents) and open the .zip.`);
  }
  if (roots.length > 1) {
    const named = roots.map((r) => (r === "" ? "(the top of the .zip)" : r));
    throw new CaseArchiveRefusal(
      `“${archiveName}” holds ${roots.length} cases, not one: ${named.join(", ")}.  `
      + `Choupo opens one case at a time -- compress each case folder on its own.`);
  }
  const root = roots[0]!;
  const prefix = root === "" ? "" : root + "/";
  const files: { [rel: string]: string } = {};
  const outside: string[] = [];
  const notText: string[] = [];
  for (const [p, bytes] of Object.entries(kept)) {
    if (!p.startsWith(prefix)) { outside.push(p); continue; }
    const rel = p.slice(prefix.length);
    if (isGeneratedOutput(rel)) continue;
    const text = decodeText(bytes);
    if (text === null) { notText.push(rel); continue; }
    files[rel] = text;
  }
  const notices: string[] = [];
  if (notText.length > 0)
    notices.push(`Left out ${notText.length} file(s) that are not text `
      + `(a case is read as text): ${notText.sort().join(", ")}.`);
  if (outside.length > 0)
    notices.push(`Left out ${outside.length} file(s) outside the case folder `
      + `“${root}”: ${outside.sort().join(", ")}.`);
  const leaf = root.split("/").pop() || "";
  const name = leaf || archiveName.replace(/\.zip$/i, "") || "uploaded-case";
  return { name, root, files, notices };
}

/** The archive format a file's first bytes announce, for a refusal that
 *  names it.  "zip" is the only one we read. */
export function sniffArchive(bytes: Uint8Array): "zip" | "rar" | "7z" | "gzip" | "unknown" {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0x50 && b(1) === 0x4b) return "zip";                     // PK
  if (b(0) === 0x52 && b(1) === 0x61 && b(2) === 0x72 && b(3) === 0x21) return "rar";
  if (b(0) === 0x37 && b(1) === 0x7a && b(2) === 0xbc && b(3) === 0xaf) return "7z";
  if (b(0) === 0x1f && b(1) === 0x8b) return "gzip";
  return "unknown";
}

const SAVE_AS_ZIP =
  "Choupo opens cases packed as .zip: save it as .zip instead (Windows: "
  + "right-click the case folder, Send to, Compressed (zipped) folder; macOS: "
  + "right-click the folder, Compress).";

/** Unzip a picked file's bytes and locate its case.  Pure; refuses a file
 *  that is not a .zip by NAMING what it is. */
export function caseFromZipBytes(bytes: Uint8Array, archiveName: string): UnpackedCase {
  const kind = sniffArchive(bytes);
  if (kind !== "zip") {
    const what = kind === "rar" ? "a RAR archive"
      : kind === "7z" ? "a 7-Zip archive"
      : kind === "gzip" ? "a .tar.gz / .gz archive"
      : "not a .zip archive";
    throw new CaseArchiveRefusal(`“${archiveName}” is ${what}.  ${SAVE_AS_ZIP}`);
  }
  let entries: { [path: string]: Uint8Array };
  try {
    entries = unzipSync(bytes);
  } catch (e) {
    throw new CaseArchiveRefusal(
      `“${archiveName}” could not be unzipped (${(e as Error).message}).  `
      + `It may be damaged or password-protected; compress the case folder `
      + `again and open the new .zip.`);
  }
  return caseFromEntries(entries, archiveName);
}
