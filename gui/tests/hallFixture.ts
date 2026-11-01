/*---------------------------------------------------------------------------*\
  The desalination plant's REAL run output, for the tests that draw it
  (DEV.md 4c C199 phase B).  Nothing here is a transcription: the sheets and
  the structured result are generated from this tree's engine by
  `witnessSetup.ts` (see the entries of `witnessOutputs.ts`) and read back
  through `witnessOutput()`, which REFUSES by name when the engine has not run.
\*---------------------------------------------------------------------------*/

import { extractStructured } from "../src/adapters/WasmAdapter.js";
import type { PlantLayout } from "../src/adapters/SolverAdapter.js";
import type { GmpBuilding } from "../src/adapters/buildingPayload.js";
import type { CaseFiles } from "../src/case/types.js";
import { withBanks } from "../src/case/withBanks.js";
import { witnessOutput } from "./witnessRead.js";

export const SWRO = "tutorials/plant/swro01_campoDalias";
export const SWRO_UNITS = ["HPpump", "Booster", "Pass2Pump", "PX", "RO1", "RO2a", "RO2b"] as const;
export const SWRO_TRAINS = 6;

const emptyCase: CaseFiles = { thermoPackage: {}, controlDict: {} };

export interface Hall {
  designFiles: { [relPath: string]: string };
  layout: PlantLayout;        // as the engine published it (no banks attached)
  attached: PlantLayout;      // with each bank attached from its sheet (withBanks)
  building: GmpBuilding;
}

let cache: Hall | null = null;

export function loadHall(): Hall {
  if (cache) return cache;
  const designFiles: { [relPath: string]: string } = {};
  for (const u of SWRO_UNITS)
    for (let k = 1; k <= SWRO_TRAINS; k++)
      designFiles[`design/${u}/train${k}`] = witnessOutput(SWRO, `design/${u}/train${k}`);
  const r = extractStructured(witnessOutput(SWRO, "log.choupoSolve"), emptyCase);
  if (!r.layout || !r.building) throw new Error("swro01 published no layout/building block");
  const attached = withBanks(r.layout, designFiles);
  if (!attached) throw new Error("withBanks returned nothing");
  cache = { designFiles, layout: r.layout, attached, building: r.building };
  return cache;
}
