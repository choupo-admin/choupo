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
  Choupo GUI -- one colour legend drawn on the canvas (DEV.md 4c C114)

  Draws a `ColourLegend` (case/colourLegend.ts) -- the same model the
  exported figure draws -- as a ParaView-style colour bar: the field and its
  unit, the bar with min / mid / max, the colours that are NOT on the bar
  (no data, below a log range), and the sentences the drawing needs said.
  A legend that floats over the canvas carries its own opaque surface
  (docs/ai/gui-credo.md, "an indicator that floats over the canvas").
\*---------------------------------------------------------------------------*/

import { Box, Text } from "@mantine/core";

import type { ColourLegend } from "../case/colourLegend.js";

const SURFACE = "light-dark(rgba(255,255,255,0.92), rgba(0,0,0,0.6))";

export function LegendBox({ legend }: { legend: ColourLegend }) {
  const bar = legend.stops.length > 1;
  return (
    <Box
      data-testid="canvas-legend"
      style={{
        padding: "6px 10px",
        borderRadius: 4,
        background: SURFACE,
        pointerEvents: "none",
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
        maxWidth: 560,
      }}
    >
      <Text size="11px" c="dimmed" ff="monospace" tt="uppercase" style={{ letterSpacing: 0.4 }}>
        {legend.title}{legend.unit ? ` [${legend.unit}]` : ""}
        {legend.qualifiers.length ? ` · ${legend.qualifiers.join(" · ")}` : ""}
      </Text>
      {bar && (
        <Box style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box style={{ width: 160, height: 9, borderRadius: 2,
                        background: `linear-gradient(to right, ${legend.stops.join(", ")})` }} />
          <Box style={{ display: "flex", justifyContent: "space-between", width: 160 }}>
            {legend.ticks.map((t, i) => (
              <Text key={i} size="11px" c="dimmed" ff="monospace">{t}</Text>
            ))}
          </Box>
        </Box>
      )}
      {!bar && legend.stops.length === 1 && (
        <Box style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <Box style={{ width: 18, height: 3, borderRadius: 2, background: legend.stops[0] }} />
          <Text size="11px" c="dimmed" ff="monospace">{legend.ticks[0]}</Text>
        </Box>
      )}
      {legend.extras.map((sw) => (
        <Box key={sw.label} style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <Box style={{ width: 18, height: 3, borderRadius: 2, background: sw.colour }} />
          <Text size="11px" c="dimmed" ff="monospace">{sw.label}</Text>
        </Box>
      ))}
      {legend.notes.map((n) => (
        <Text key={n} size="11px" c="dimmed" ff="monospace">· {n}</Text>
      ))}
    </Box>
  );
}
