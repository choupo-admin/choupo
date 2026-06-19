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
  Shared icon + label tables for unit-op types.  Used by:
    - UnitNode (canvas node, size 18)
    - CaseTree / Plant Outline (size 14)
  so the eye sees the SAME icon for "evaporator" or "crystalliser"
  whether reading the diagram or the outline.
\*---------------------------------------------------------------------------*/

import type { ReactNode } from "react";
import {
  IconAdjustments,
  IconArrowsExchange,
  IconBrandReact,
  IconBuildingFactory,
  IconColumns,
  IconDiamond,
  IconDroplet,
  IconDropletFilled,
  IconEngine,
  IconFilter,
  IconFlame,
  IconFlask,
  IconGitFork,
  IconGitMerge,
  IconPropeller,
  IconRoute,
  IconSpray,
  IconTornado,
  IconWind,
} from "@tabler/icons-react";

export function unitIconFor(type: string | undefined, size = 18): ReactNode {
  const Comp = (() => {
    switch (type) {
      case "cstr": return IconFlask;
      case "pfr":  return IconRoute;
      case "isothermalFlash":
      case "adiabaticFlash":
      case "bubbleT":
      case "dewT":             return IconDroplet;
      case "heater":           return IconFlame;
      case "heatExchanger":    return IconArrowsExchange;
      case "compressor":       return IconEngine;
      case "turbine":          return IconPropeller;
      case "pump":             return IconDropletFilled;
      case "distillationColumn":
      case "shortcutColumn":
      case "absorber":
      case "stripper":         return IconColumns;
      case "cyclone":          return IconTornado;
      case "bagFilter":        return IconFilter;
      case "gasSolidSplitter": return IconGitFork;
      case "sprayDryer":       return IconSpray;
      case "solidDryer":       return IconWind;
      case "crystalliser":     return IconDiamond;
      case "mixer":            return IconGitMerge;
      case "splitter":         return IconGitFork;
      case "reaction":         return IconBrandReact;
      case "sector":           return IconBuildingFactory;
      default:                 return IconAdjustments;
    }
  })();
  return <Comp size={size} />;
}

export const UNIT_LABEL: Record<string, string> = {
  cstr: "CSTR",
  pfr: "PFR",
  isothermalFlash: "Isothermal Flash",
  adiabaticFlash: "Adiabatic Flash",
  bubbleT: "Bubble-T",
  dewT: "Dew-T",
  heater: "Heater",
  heatExchanger: "Heat Exchanger",
  compressor: "Compressor",
  turbine: "Turbine",
  pump: "Pump",
  distillationColumn: "Distillation Column",
  shortcutColumn: "Shortcut Column (FUG)",
  absorber: "Absorber",
  stripper: "Stripper",
  cyclone: "Cyclone",
  bagFilter: "Bag filter",
  gasSolidSplitter: "Gas-solid splitter",
  sprayDryer: "Spray Dryer",
  solidDryer: "Solid Dryer",
  crystalliser: "Crystalliser",
  evaporator: "Evaporator",
  mixer: "Mixer",
  splitter: "Splitter",
  sector: "Sector",
};

export function unitTypeLabel(type: string | undefined): string {
  if (!type) return "unit";
  return UNIT_LABEL[type] ?? type;
}
