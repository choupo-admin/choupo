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
  Operation schema registry.

  Each unit-op type can ship a JSON schema for its `operation` block
  under gui/schemas/operations/<type>.schema.json.  We import them
  eagerly (cheap -- they are small) and expose a flat typed view that
  the Property panel consumes to render labelled, ranged, unit-tagged
  inputs.  Schemas we do not yet have just degrade to the generic
  "infer-from-value" form -- no GUI regression.
\*---------------------------------------------------------------------------*/

import cstrSchema from "../../schemas/operations/cstr.schema.json";
import pfrSchema from "../../schemas/operations/pfr.schema.json";
import isothermalFlashSchema from "../../schemas/operations/isothermalFlash.schema.json";
import adiabaticFlashSchema from "../../schemas/operations/adiabaticFlash.schema.json";
import heaterSchema from "../../schemas/operations/heater.schema.json";
import compressorSchema from "../../schemas/operations/compressor.schema.json";
import turbineSchema from "../../schemas/operations/turbine.schema.json";
import pumpSchema from "../../schemas/operations/pump.schema.json";
import evaporatorSchema from "../../schemas/operations/evaporator.schema.json";
import sprayDryerSchema from "../../schemas/operations/sprayDryer.schema.json";
import crystalliserSchema from "../../schemas/operations/crystalliser.schema.json";
import solidDryerSchema from "../../schemas/operations/solidDryer.schema.json";
import distillationColumnSchema from "../../schemas/operations/distillationColumn.schema.json";
import absorberSchema from "../../schemas/operations/absorber.schema.json";
import stripperSchema from "../../schemas/operations/stripper.schema.json";
import cycloneSchema from "../../schemas/operations/cyclone.schema.json";
import bagFilterSchema from "../../schemas/operations/bagFilter.schema.json";
import gasSolidSplitterSchema from "../../schemas/operations/gasSolidSplitter.schema.json";
import heatExchangerSchema from "../../schemas/operations/heatExchanger.schema.json";
import shortcutColumnSchema from "../../schemas/operations/shortcutColumn.schema.json";

export interface OperationField {
  key: string;
  title: string;
  description?: string;
  type: "number" | "string";
  integer?: boolean;  // true when the JSON Schema type was "integer"
  unit?: string;
  min?: number;       // numeric minimum (inclusive or exclusive — see strictMin)
  strictMin?: boolean;
  max?: number;
  strictMax?: boolean;
  default?: number | string;
  required: boolean;
}

export interface OperationSchema {
  title: string;
  description?: string;
  fields: OperationField[];
}

interface RawProperty {
  type?: string | string[];
  title?: string;
  description?: string;
  unit?: string;
  default?: number | string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
}

interface RawSchema {
  title?: string;
  description?: string;
  properties?: { [k: string]: RawProperty };
  required?: string[];
}

const RAW: { [unitType: string]: RawSchema } = {
  cstr: cstrSchema as RawSchema,
  pfr: pfrSchema as RawSchema,
  isothermalFlash: isothermalFlashSchema as RawSchema,
  adiabaticFlash: adiabaticFlashSchema as RawSchema,
  heater: heaterSchema as RawSchema,
  compressor: compressorSchema as RawSchema,
  turbine: turbineSchema as RawSchema,
  pump: pumpSchema as RawSchema,
  evaporator: evaporatorSchema as RawSchema,
  sprayDryer: sprayDryerSchema as RawSchema,
  crystalliser: crystalliserSchema as RawSchema,
  solidDryer: solidDryerSchema as RawSchema,
  distillationColumn: distillationColumnSchema as RawSchema,
  absorber: absorberSchema as RawSchema,
  stripper: stripperSchema as RawSchema,
  cyclone: cycloneSchema as RawSchema,
  bagFilter: bagFilterSchema as RawSchema,
  gasSolidSplitter: gasSolidSplitterSchema as RawSchema,
  heatExchanger: heatExchangerSchema as RawSchema,
  shortcutColumn: shortcutColumnSchema as RawSchema,
};

export function operationSchemaFor(unitType: string): OperationSchema | null {
  const raw = RAW[unitType];
  if (!raw || !raw.properties) return null;
  const required = new Set(raw.required ?? []);
  const fields: OperationField[] = Object.entries(raw.properties).map(
    ([key, p]) => parseField(key, p, required.has(key)),
  );
  return {
    title: raw.title ?? unitType,
    description: raw.description,
    fields,
  };
}

function parseField(key: string,
  p: RawProperty,
  required: boolean,
): OperationField {
  const t = Array.isArray(p.type) ? p.type[0] : p.type;
  const type = t === "number" || t === "integer" ? "number" : "string";
  const integer = t === "integer";

  // JSON Schema Draft 2020-12 uses numeric exclusiveMinimum / Maximum.
  // Old-style boolean is also accepted for compatibility.
  let min: number | undefined;
  let strictMin = false;
  if (typeof p.exclusiveMinimum === "number") {
    min = p.exclusiveMinimum;
    strictMin = true;
  } else if (p.exclusiveMinimum === true && typeof p.minimum === "number") {
    min = p.minimum;
    strictMin = true;
  } else if (typeof p.minimum === "number") {
    min = p.minimum;
  }

  let max: number | undefined;
  let strictMax = false;
  if (typeof p.exclusiveMaximum === "number") {
    max = p.exclusiveMaximum;
    strictMax = true;
  } else if (p.exclusiveMaximum === true && typeof p.maximum === "number") {
    max = p.maximum;
    strictMax = true;
  } else if (typeof p.maximum === "number") {
    max = p.maximum;
  }

  return {
    key,
    title: p.title ?? key,
    description: p.description,
    type,
    integer,
    unit: p.unit,
    min,
    strictMin,
    max,
    strictMax,
    default: p.default,
    required,
  };
}
