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
  Adapter selection.

  Tries the WasmAdapter first.  If the .wasm bundle cannot be loaded, the
  behaviour DEPENDS ON THE BUILD:

    * DEV (`npm run dev`, before `make wasm`): fall back to the MockAdapter so
      the GUI keeps working for UI demos.  Mock numbers are clearly flagged.

    * PRODUCTION (the built/hosted site): a missing WASM means the host is
      misconfigured or the visitor is offline.  We must NEVER silently fall
      back to the mock there -- that would render FAKE numbers as if they were
      a real solve (the "no silent crutch" rule).  Instead we return an
      `unavailable` adapter that REFUSES to run, so the UI shows a loud,
      blocking error.
\*---------------------------------------------------------------------------*/

import { MockAdapter } from "./MockAdapter.js";
import type { CaseFiles } from "../case/types.js";
import type { RunResult, SolverAdapter } from "./SolverAdapter.js";
import { WasmAdapter } from "./WasmAdapter.js";
import { probeWasm } from "./wasmModule.js";

export type AdapterKind = "wasm" | "mock" | "unavailable";

export interface ResolvedAdapter {
  kind: AdapterKind;
  adapter: SolverAdapter;
  /** Set when we wanted Wasm but had to fall back (mock) or refuse (unavailable). */
  fallbackReason?: string;
}

/** Production fallback: an adapter that REFUSES to run rather than fabricate
 *  numbers with the mock.  Its run() rejects with the reason, so the caller
 *  surfaces a blocking error instead of fake results. */
class UnavailableAdapter implements SolverAdapter {
  constructor(private readonly reason: string) {}
  run(_caseFiles: CaseFiles): Promise<RunResult> {
    return Promise.reject(new Error(this.reason));
  }
}

export async function resolveAdapter(preferred: AdapterKind = "wasm",
): Promise<ResolvedAdapter> {
  if (preferred === "mock") {
    return { kind: "mock", adapter: new MockAdapter() };
  }

  // Probe for the glue (HEAD-style fetch + content-type check).  The
  // worker handles instantiation and actual solving in its own thread.
  try {
    await probeWasm();
    return { kind: "wasm", adapter: new WasmAdapter() };
  } catch (e) {
    const reason = `The real (WebAssembly) solver could not be loaded — ${(e as Error).message}`;
    if (import.meta.env.PROD) {
      // Hosted: refuse to run.  Never fabricate numbers with the mock.
      return {
        kind: "unavailable",
        adapter: new UnavailableAdapter(
          reason + ".  This is the REAL solver, served by the site and run in "
          + "your browser; it is missing (the host is misconfigured, or you are "
          + "offline).  No results are shown rather than fake ones — reload when "
          + "back online."),
        fallbackReason: reason,
      };
    }
    // Dev convenience only (before `make wasm`): mock, clearly flagged.
    return {
      kind: "mock",
      adapter: new MockAdapter(),
      fallbackReason: reason + " (dev build: using the MOCK solver — numbers are NOT real).",
    };
  }
}

export { MockAdapter } from "./MockAdapter.js";
export { WasmAdapter } from "./WasmAdapter.js";
export type { SolverAdapter, RunResult } from "./SolverAdapter.js";
