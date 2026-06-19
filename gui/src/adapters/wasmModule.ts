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
  Availability probe for the Emscripten-generated WASM solver.

  We do NOT instantiate the module on the main thread -- the solver is
  synchronous and would freeze the UI.  WasmAdapter does the heavy
  lifting inside a Web Worker (gui/public/workers/solverWorker.js).

  This module only checks that the glue script is reachable and is a
  real JavaScript file (Vite's SPA fallback may serve HTML for unknown
  paths, so we cannot trust the status code alone).
\*---------------------------------------------------------------------------*/

export const WASM_GLUE_URL = "/wasm/choupoSolve.js";
export const WASM_WORKER_URL = "/workers/solverWorker.js";

let cached: Promise<void> | null = null;

export function probeWasm(): Promise<void> {
  if (cached) return cached;
  cached = (async () => {
    const res = await fetch(WASM_GLUE_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} at ${WASM_GLUE_URL}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!/javascript|ecmascript/.test(ct)) {
      throw new Error(
        `not built yet (Content-Type: ${ct || "unknown"}).  ` +
          "Run `make wasm` from the project root.",
      );
    }
  })().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}
