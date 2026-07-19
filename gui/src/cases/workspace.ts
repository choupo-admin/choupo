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
  workspace -- the GUI's client for the local bridge's case + filesystem API.

  User cases are FOLDERS on disk.  The WASM bundle's import.meta.glob is resolved
  at build time and cannot see a case created at runtime, nor browse the disk, so
  we discover + create + read user cases through the local bridge that also hosts
  the Assistant console (gui/bridge/claudeBridge.mjs):

    GET  /api/browse?dir=<abs>          -> navigate folders (default: workspace)
    POST /api/cases  {dir,name,statement} -> scaffold an EMPTY case in `dir`
    GET  /api/case?dir=<abs>            -> the case's dict tree { relPath: rawText }

  Creating a case must know its target folder UP FRONT (the folder is
  initialised, not just written at the end), so the New/Open dialogs are folder
  navigators: they open at the workspace but can browse anywhere in the user's
  tree (the bridge fences browse + write to $HOME / project / workspace).

  Each case's files map goes through filesToCaseFiles -- the SAME contract the
  bundled tutorials use.  The bridge is LOCAL ONLY; if it is not running these
  reject and the caller surfaces a "start bin/runGui" hint.
\*---------------------------------------------------------------------------*/

import { filesToCaseFiles } from "./tutorials.js";
import type { CaseFiles } from "../case/types.js";

// Same port the Assistant console uses (gui/bridge/claudeBridge.mjs).
const BRIDGE_PORT = 7682;

function bridgeBase(): string {
  const host = typeof location !== "undefined" ? location.hostname : "127.0.0.1";
  return `http://${host}:${BRIDGE_PORT}`;
}

async function asJson(r: Response): Promise<Record<string, unknown>> {
  return (await r.json().catch(() => ({}))) as Record<string, unknown>;
}

async function get(path: string): Promise<Record<string, unknown>> {
  let r: Response;
  try { r = await fetch(`${bridgeBase()}${path}`); }
  catch { throw new Error("bridge not reachable -- start it with  bin/runGui  (or  bin/agentBridge)"); }
  const body = await asJson(r);
  if (!r.ok) throw new Error(String(body.error ?? `bridge returned ${r.status}`));
  return body;
}

/** Capability probe: is the local bridge serving?  Fast + silent (800 ms
 *  abort) -- the landing uses it to only offer actions that can finish
 *  (creating on disk needs the bridge; tutorials/Explore/ZIP do not). */
export async function bridgeUp(): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 800);
  try {
    const r = await fetch(`${bridgeBase()}/api/browse`, { signal: ctl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export interface BrowseEntry { name: string; isCase: boolean; description: string; }
export interface BrowseResult {
  dir: string;
  parent: string | null;   // null when navigating up would leave the fence
  workspace: string;
  home: string;
  isCase: boolean;
  entries: BrowseEntry[];
}

/** List a folder's sub-folders (cases flagged) for the navigator.  Pass no dir
 *  to start at the workspace. */
export async function browse(dir?: string): Promise<BrowseResult> {
  const q = dir ? `?dir=${encodeURIComponent(dir)}` : "";
  const b = await get(`/api/browse${q}`);
  return {
    dir: String(b.dir ?? ""),
    parent: b.parent ? String(b.parent) : null,
    workspace: String(b.workspace ?? ""),
    home: String(b.home ?? ""),
    isCase: !!b.isCase,
    entries: Array.isArray(b.entries) ? (b.entries as BrowseEntry[]) : [],
  };
}

/** Scaffold a new EMPTY case at `dir`/`name` and return it as CaseFiles plus
 *  its absolute directory (the bridge writes the 5 skeleton files). */
export async function createCase(dir: string, name: string, statement: string,
): Promise<{ name: string; dir: string; caseFiles: CaseFiles }> {
  let r: Response;
  try {
    r = await fetch(`${bridgeBase()}/api/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir, name, statement }),
    });
  } catch { throw new Error("bridge not reachable -- start it with  bin/runGui"); }
  const body = await asJson(r);
  if (!r.ok) throw new Error(String(body.error ?? `bridge returned ${r.status}`));
  const files = body.files as { [rel: string]: string };
  return { name: String(body.name), dir: String(body.dir), caseFiles: filesToCaseFiles(String(body.name), files) };
}

/** "Open materialises": write an OPENED case (a .zip/folder file-map) into the
 *  workspace as a REAL on-disk case, so the Assistant console can run there and
 *  the canvas live-reloads the agent's edits.  We POST the raw {relPath: rawText}
 *  source map; the bridge slugifies the name, filters + path-guards every write,
 *  normalises the `.cho` marker, makes it born-taught, and resolves collisions
 *  (identical content -> reopen the SAME folder; different -> auto-suffix).  The
 *  returned `name` is the ACTUAL folder name used (possibly suffixed). */
export async function importCase(name: string, files: { [rel: string]: string },
): Promise<{ name: string; dir: string; caseFiles: CaseFiles }> {
  let r: Response;
  try {
    r = await fetch(`${bridgeBase()}/api/cases/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, files }),
    });
  } catch { throw new Error("bridge not reachable -- start it with  bin/runGui"); }
  const body = await asJson(r);
  if (!r.ok) throw new Error(String(body.error ?? `bridge returned ${r.status}`));
  const out = body.files as { [rel: string]: string };
  return { name: String(body.name), dir: String(body.dir), caseFiles: filesToCaseFiles(String(body.name), out) };
}

/** Client-side mirror of the bridge's import slugify -- ONLY so the open toast
 *  can tell whether a collision suffix was applied (returned name !== this slug).
 *  The bridge remains authoritative for what actually lands on disk. */
export function slugifyCaseName(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[-_]+$/, "") || "case";
}

/** Write ONE file into an existing case folder on disk (via the bridge).  Used
 *  by "Save layout to case" to drop the `<name>.cho` layout marker straight
 *  into the case dir -- no download dance, no browser File-System-Access API.
 *  The case is addressed by EITHER an absolute `dir` (a workspace/local case)
 *  OR a `tutorial` relative path (a bundled tutorial, resolved under
 *  `tutorials/`).  Returns the absolute path written; throws if the bridge is
 *  unreachable or rejects the path. */
export async function writeCaseFile(
  loc: { dir?: string; tutorial?: string }, rel: string, content: string,
): Promise<string> {
  let r: Response;
  try {
    r = await fetch(`${bridgeBase()}/api/case/file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({...loc, rel, content }),
    });
  } catch { throw new Error("bridge not reachable -- start it with  bin/runGui"); }
  const body = await asJson(r);
  if (!r.ok) throw new Error(String(body.error ?? `bridge returned ${r.status}`));
  return String(body.path ?? "");
}

/** Read an existing case at an absolute directory into CaseFiles. */
export async function readCaseAt(dir: string): Promise<{ name: string; dir: string; caseFiles: CaseFiles }> {
  const body = await get(`/api/case?dir=${encodeURIComponent(dir)}`);
  const files = body.files as { [rel: string]: string };
  return { name: String(body.name), dir: String(body.dir), caseFiles: filesToCaseFiles(String(body.name), files) };
}

/** Duplicate a case to a sibling folder (same parent) under a new name -- a
 *  design VARIANT.  Copies source only (no generated output). */
export async function duplicateCase(srcDir: string, name: string, statement?: string,
): Promise<{ name: string; dir: string; caseFiles: CaseFiles }> {
  let r: Response;
  try {
    r = await fetch(`${bridgeBase()}/api/cases/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ srcDir, name, statement: statement ?? "" }),
    });
  } catch { throw new Error("bridge not reachable -- start it with  bin/runGui"); }
  const body = await asJson(r);
  if (!r.ok) throw new Error(String(body.error ?? `bridge returned ${r.status}`));
  const files = body.files as { [rel: string]: string };
  return { name: String(body.name), dir: String(body.dir), caseFiles: filesToCaseFiles(String(body.name), files) };
}

/** The sibling cases living in the same parent folder as `dir` (variants kept
 *  together), each as { name, dir }.  Used by the case quick-switch. */
export async function siblingCases(dir: string): Promise<{ name: string; dir: string; description: string }[]> {
  const parent = dir.replace(/[/\\][^/\\]+[/\\]?$/, ""); // drop the last segment
  const b = await browse(parent || dir);
  const sep = b.dir.includes("\\") ? "\\" : "/";
  return b.entries
    .filter((e) => e.isCase)
    .map((e) => ({ name: e.name, dir: `${b.dir}${b.dir.endsWith(sep) ? "" : sep}${e.name}`, description: e.description }));
}

/** Change the workspace folder (persisted by the bridge to the user config so
 *  it survives restarts).  `dir` must be an existing folder in the user's tree. */
export async function setWorkspace(dir: string): Promise<string> {
  let r: Response;
  try {
    r = await fetch(`${bridgeBase()}/api/workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir }),
    });
  } catch { throw new Error("bridge not reachable -- start it with  bin/runGui"); }
  const body = await asJson(r);
  if (!r.ok) throw new Error(String(body.error ?? `bridge returned ${r.status}`));
  return String(body.workspace);
}

// A case name is a single folder slug (mirrors bin/newCase + the bridge).
export const CASE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
