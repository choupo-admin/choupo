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
  THE ENGINE VERSION THE APP SHOWS -- one reading, two readers (DEV.md 4c
  C81).

  The top bar's badge reads `wasm/version.json`, written by the WASM build
  beside the binaries the app loads (TopBar.tsx says why that stamp can lag
  a half-finished build, and why an unreadable stamp shows NO badge rather
  than a guess).  The page "Export as page" saves names the same version in
  its footer, so both ask THIS module how the stamp reads; a footer that
  formatted the version its own way would be a second home for one word.
\*---------------------------------------------------------------------------*/

export interface EngineVersion { version: string; commit?: string }

/** The stamp, or null when it is not one (absent, malformed, empty). */
export function parseEngineVersion(v: unknown): EngineVersion | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { version?: unknown; commit?: unknown };
  if (typeof o.version !== "string" || !o.version) return null;
  return typeof o.commit === "string" && o.commit
    ? { version: o.version, commit: o.commit } : { version: o.version };
}

/** The words the badge prints: a development build carries its commit. */
export function engineVersionLabel(v: EngineVersion): string {
  return v.version === "Choupo-dev"
    ? `Choupo-dev${v.commit ? ` · ${v.commit}` : ""}`
    : v.version;
}

/** Read the stamp beside the binaries.  Null on any failure -- never a
 *  plausible default. */
export async function fetchEngineVersion(baseUrl: string): Promise<EngineVersion | null> {
  try {
    const r = await fetch(`${baseUrl}wasm/version.json`);
    return r.ok ? parseEngineVersion(await r.json()) : null;
  } catch {
    return null;
  }
}
