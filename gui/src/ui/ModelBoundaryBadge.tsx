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
  ModelBoundaryBadge -- a small chip docked on a stream edge whose producer
  and consumer use different thermo models ("information follows the
  streams": the audit is visible AT the stream it names, not only in the
  summary band).

  "ΔH" (indigo info register) for a numeric boundary; "REFUSED" (red
  register) for a speciation-change refusal.  Rendered via EdgeLabelRenderer
  next to the edge's label point -- it never touches the edge STROKE, whose
  colour stays the solver's semantic phase colour.
\*---------------------------------------------------------------------------*/

import { EdgeLabelRenderer } from "@xyflow/react";

export interface BoundaryBadgeData {
  refused: boolean;
}

export function ModelBoundaryBadge({ x, y, refused }: {
  x: number; y: number; refused: boolean;
}) {
  return (
    <EdgeLabelRenderer>
      <div
        title={refused
          ? "Model-boundary audit: REFUSED — speciation change across this stream (a single ΔH would lie). See the Streams summary band."
          : "Model-boundary audit: producer and consumer use different thermo models — ΔH is what they disagree by. See the Streams summary band."}
        style={{
          position: "absolute",
          transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
          pointerEvents: "none",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 0.3,
          lineHeight: "12px",
          padding: "1px 4px",
          borderRadius: 3,
          ...(refused
            ? {
                color: "light-dark(var(--mantine-color-red-7), var(--mantine-color-red-4))",
                background: "light-dark(var(--mantine-color-red-0), rgba(224,49,49,0.18))",
              }
            : {
                color: "light-dark(var(--mantine-color-indigo-7), var(--mantine-color-indigo-4))",
                background: "light-dark(var(--mantine-color-indigo-0), rgba(92,124,250,0.18))",
              }),
        }}
      >
        {refused ? "REFUSED" : "ΔH"}
      </div>
    </EdgeLabelRenderer>
  );
}
