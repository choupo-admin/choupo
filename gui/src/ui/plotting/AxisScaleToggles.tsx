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
  AxisScaleToggles -- the small lin/log buttons laid over a figure's corner
  (DEV.md 4c C486).  Presentational: the rule is in axisScale.ts.  One tiny
  button per axis that can carry one, "x lin" / "y log" ...; a disabled
  button carries the reason as its tooltip.  Not part of the Plotly canvas,
  so it never changes what the figure draws.
\*---------------------------------------------------------------------------*/

import type { AxisInfo, AxisTypes } from "./axisScale.js";
import { MIN_TEXT_PX } from "../../case/legibility.js";

export function AxisScaleToggles(props: {
  axes: ReadonlyArray<AxisInfo>;
  types: AxisTypes;
  onToggle: (key: string) => void;
}): JSX.Element | null {
  if (props.axes.length === 0) return null;
  return (
    <div
      data-axis-toggles
      style={{ position: "absolute", right: 8, bottom: 2, display: "flex", gap: 4, zIndex: 2, opacity: 0.85 }}
    >
      {props.axes.map((a) => {
        const log = props.types[a.key] === "log";
        const tip = a.enabled
          ? `${a.name} axis: ${log ? "log" : "linear"} (click for ${log ? "linear" : "log"})`
          : a.reason ?? "";
        return (
          <span key={a.key} title={tip}>
            <button
              type="button"
              data-axis-toggle={a.key}
              disabled={!a.enabled}
              aria-pressed={log}
              aria-label={`${a.name} axis scale: ${log ? "log" : "linear"}`}
              onClick={() => props.onToggle(a.key)}
              style={{
                fontSize: MIN_TEXT_PX, lineHeight: 1.2, padding: "0 5px", borderRadius: 3,
                border: "1px solid currentColor", background: "transparent", color: "inherit",
                cursor: a.enabled ? "pointer" : "not-allowed", opacity: a.enabled ? 1 : 0.4,
              }}
            >
              {a.name} {log ? "log" : "lin"}
            </button>
          </span>
        );
      })}
    </div>
  );
}
