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
  Mock solver: streams a realistic-looking log and returns structured
  results that match the log values, so the Streams and Plots tabs
  show correlated numbers.  Replaced by WasmAdapter in Phase 1.5.
\*---------------------------------------------------------------------------*/

import type { CaseFiles } from "../case/types.js";
import type {
  ConvergenceCurve,
  RunResult,
  SolverAdapter,
  StreamResult,
  TxyData,
} from "./SolverAdapter.js";

const SAMPLE_LOG = `Case directory: /tmp/steady/process01_reactor_flash
Database root:  /opt/Choupo/data

Components (2):  ethanol  water
Phases (1):      liquid+vapor[VLE]
solverDict:        loaded
reactions library: loaded

[reactor] cstr  V_R=0.005 m^3
  Newton iter 1   X = 0.4231   r = 1.18e-02
  Newton iter 2   X = 0.5141   r = 8.42e-04
  Newton iter 3   X = 0.5238   r = 4.10e-06
  Newton iter 4   X = 0.5238   r = 9.31e-12   converged.
  outlet  T=349.8 K  P=1.013 bar
          ethanol  0.4762
          water    0.5238

[separator] isothermalFlash  T=355 K  P=1.0 bar
  Wegstein outer 1   V/F = 0.4612   |dx| = 3.21e-02
  Wegstein outer 2   V/F = 0.4587   |dx| = 7.04e-04
  Wegstein outer 3   V/F = 0.4587   |dx| = 5.86e-07   converged.
  liqProd  F=0.541  T=355.0  P=1.0
           ethanol  0.302   water  0.698
  vapProd  F=0.459  T=355.0  P=1.0
           ethanol  0.681   water  0.319

End.`;

const STREAMS: StreamResult[] = [
  {
    name: "feed",
    role: "feed",
    F: 1.0,
    T: 350.0,
    P: 1.01325,
    composition: { ethanol: 1.0, water: 0.0 },
  },
  {
    name: "reactorOut",
    role: "intermediate",
    F: 1.0,
    T: 349.8,
    P: 1.013,
    composition: { ethanol: 0.4762, water: 0.5238 },
  },
  {
    name: "liqProd",
    role: "product",
    F: 0.541,
    T: 355.0,
    P: 1.0,
    composition: { ethanol: 0.302, water: 0.698 },
  },
  {
    name: "vapProd",
    role: "product",
    F: 0.459,
    T: 355.0,
    P: 1.0,
    composition: { ethanol: 0.681, water: 0.319 },
  },
];

const CONVERGENCE: ConvergenceCurve[] = [
  { label: "reactor (Newton)", residuals: [1.18e-2, 8.42e-4, 4.1e-6, 9.31e-12] },
  { label: "separator (Wegstein)", residuals: [3.21e-2, 7.04e-4, 5.86e-7] },
];

// Per-unit KPIs the PropertyPanel reads when a unit is selected (so the
// student sees solver OUTPUTS, not just the inputs in the dict).
const KPIS: { [unit: string]: { [k: string]: number } } = {
  reactor: { conversion: 0.812, T_out: 358.4, V_R: 0.004, Q: 2.34e3 },
  separator: { V_over_F: 0.304, T: 355.2, P: 1.013e5, recovery_ethanol: 0.913 },
};

// Ethanol(1) / water(2) VLE at 1.01325 bar.
// Bubble: xBubble -> Tbubble.  Dew: yDew -> Tdew.  Both feature the
// minimum-boiling azeotrope near x = 0.894, T ~ 351.3 K.
const TXY: TxyData = {
  P: 1.01325,
  components: ["ethanol", "water"],
  xBubble: [0.0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.894, 0.95, 1.0],
  Tbubble: [373.15, 361.95, 359.95, 358.05, 357.30, 356.85, 356.20, 355.30, 354.50, 353.30, 352.65, 351.32, 351.45, 351.50],
  yDew:   [0.0, 0.336, 0.443, 0.531, 0.575, 0.612, 0.652, 0.697, 0.753, 0.818, 0.853, 0.894, 0.95, 1.0],
  Tdew:   [373.15, 361.95, 359.95, 358.05, 357.30, 356.85, 356.20, 355.30, 354.50, 353.30, 352.65, 351.32, 351.45, 351.50],
};

export class MockAdapter implements SolverAdapter {
  constructor(private readonly stepMs = 35) {}

  async run(
    _caseFiles: CaseFiles,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    _binaryOverride?: string,
  ): Promise<RunResult> {
    const lines = SAMPLE_LOG.split("\n");
    let full = "";
    for (const line of lines) {
      if (signal?.aborted) {
        return { status: "error", log: full + "\n[user] cancelled\n", streams: [], convergence: [] };
      }
      await new Promise((r) => setTimeout(r, this.stepMs));
      const chunk = line + "\n";
      full += chunk;
      onChunk(chunk);
    }
    return {
      status: "done",
      log: full,
      streams: STREAMS,
      convergence: CONVERGENCE,
      kpis: KPIS,
      txy: TXY,
    };
  }
}
