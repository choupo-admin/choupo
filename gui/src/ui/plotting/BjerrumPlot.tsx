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
  BjerrumPlot — the species-distribution diagram.

  One trace per aqueous species, molality on a LOG axis against pH: the shape
  every distribution diagram has, and the axis molality physically wants (a
  carbonate family runs from 1e-2 down past 1e-12 across the range, and a
  linear axis shows one band and four flat lines).  The CSV is the merged
  engine output from case/bjerrumSweep.ts; nothing here computes anything.

  WHY THIS IS NOT `CsvAutoPlot`.  The generic 1-D scan renderer would draw the
  curves — it groups by unit and puts a secondary column on the right axis, and
  both are what this needs.  What it cannot do is SAY the one thing this
  picture must say.  `pH` here is not a variable that was observed; it was
  IMPOSED, one value per point, and imposing a pH asserts a strong acid or base
  that nobody declared, supplying the charge that closes the balance.  The
  classical Bjerrum plot is drawn exactly that way and there is nothing wrong
  with it; drawing it without saying so is the wrong part.  So the x-axis title
  states the closure, and the right-hand axis carries the engine's OWN
  measurement of the titrant — the charge residual it prints beside every
  imposed-pH answer.  A claim with a measurement beside it beats a sentence.

  When the engine did not publish that residual for every point the axis is not
  drawn and the axis title says the closure in words alone; the caller reports
  the absence in the honesty footer.  It is never faked from the species list —
  summing z_i m_i here would be arithmetic dressed as a verification, over
  charges this file does not have.
\*---------------------------------------------------------------------------*/

import { useComputedColorScheme } from "@mantine/core";
import { Plot, PLOT_CONFIG, PLOT_COLORS, darkLayout } from "./plotly.js";

/** Pretty-print a species name the way the chemistry records spell it:
 *  a trailing `aq` is the interim lexical-disambiguation suffix (CO2aq is the
 *  dissolved neutral, distinct from the component CO2), so it is shown as the
 *  "(aq)" it means rather than silently stripped — the suffix is a contract,
 *  not a typo.  Nothing else is transformed: charges are not invented from
 *  names, because the name is not the identity here. */
function speciesLabel(name: string): string {
  return name.endsWith("aq") && name.length > 2
    ? `${name.slice(0, -2)}(aq)`
    : name;
}

export function BjerrumPlot({ csv, family, T, master, open }: {
  /** The merged sweep: `pH,<species>…[,netCharge]`. */
  csv: string;
  /** Family label for the title (from BJERRUM_FAMILIES). */
  family: string;
  /** The temperature every point was solved at [K]. */
  T: number;
  /** The master ion the family was declared through. */
  master: string;
  /** Gas + partial pressure when the system is open, else null. */
  open: { gas: string; pAtm: number } | null;
}) {
  const scheme = useComputedColorScheme("dark");

  const lines = csv.trim().split(/\r?\n/).filter((l) => l.length > 0);
  const header = (lines[0] ?? "").split(",").map((s) => s.trim());
  // GUARD (credo: defensive rendering): only render OUR shape.  A stale CSV
  // from another lens mid-switch would otherwise parse into junk traces.
  if (header[0] !== "pH" || header.length < 2 || lines.length < 2)
    return <div style={{ padding: 16, color: "#888", fontSize: 12 }}>
      Computing the species distribution…
    </div>;

  const chargeIdx = header.indexOf("netCharge");
  const speciesIdx = header
    .map((_, i) => i)
    .filter((i) => i > 0 && i !== chargeIdx);

  const pH: number[] = [];
  const cols = new Map<number, (number | null)[]>();
  speciesIdx.forEach((i) => cols.set(i, []));
  const charge: (number | null)[] = [];
  for (let r = 1; r < lines.length; ++r) {
    const cells = lines[r]!.split(",");
    const x = Number(cells[0]);
    if (!Number.isFinite(x)) continue;
    pH.push(x);
    for (const i of speciesIdx) {
      const v = Number(cells[i]);
      // an EMPTY cell is a species the engine did not report at this point:
      // a gap in the line, never a zero (absent and negligible differ).
      cols.get(i)!.push((cells[i] ?? "").trim() !== "" && Number.isFinite(v) ? v : null);
    }
    if (chargeIdx >= 0) {
      const q = Number(cells[chargeIdx]);
      charge.push(Number.isFinite(q) ? q : null);
    }
  }

  const data: Record<string, unknown>[] = speciesIdx.map((i, k) => ({
    type: "scattergl",
    mode: "lines",
    name: speciesLabel(header[i]!),
    x: pH,
    y: cols.get(i)!,
    // A phosphate family plus its counter-ion runs past the 6 series colours,
    // and two identically-coloured bands on one chart is a legend the reader
    // cannot use.  The second lap around the palette is dotted, so the pair is
    // still distinguishable when it happens.
    line: {
      color: PLOT_COLORS.series[k % PLOT_COLORS.series.length],
      width: 2,
      ...(k >= PLOT_COLORS.series.length ? { dash: "dot" as const } : {}),
    },
    hovertemplate:
      `${speciesLabel(header[i]!)}<br>pH = %{x:.2f}<br>m = %{y:.3e} mol/kg<extra></extra>`,
  }));

  const hasCharge = chargeIdx >= 0 && charge.some((q) => q !== null);
  if (hasCharge)
    data.push({
      type: "scattergl",
      mode: "lines",
      name: "net charge (implicit titrant)",
      x: pH,
      y: charge,
      yaxis: "y2",
      line: { color: PLOT_COLORS.warm, width: 2, dash: "dash" },
      hovertemplate:
        "implicit titrant<br>pH = %{x:.2f}<br>Σz·m / Σ|z|·m = %{y:.3f}<extra></extra>",
    });

  // The x-axis carries THE statement.  It is on the axis and not in a footnote
  // because the axis is what the reader is reading when they read this curve.
  const xTitle = hasCharge
    ? "pH — IMPOSED at every point, not solved; the dashed curve is the charge "
      + "the implicit strong acid/base supplies"
    : "pH — IMPOSED at every point, not solved: each point asserts a strong "
      + "acid or base that nobody declared";

  const title = `${family} — species distribution at ${(T - 273.15).toFixed(1)} °C`
    + (open
      ? `, OPEN to ${open.gas}(g) at ${open.pAtm} atm (total ${master} is a solved outcome)`
      : `, closed system, total ${master} held`);

  return (
    <Plot
      data={data as never}
      layout={{
        ...darkLayout,
        autosize: true,
        title: { text: title, font: { size: 13 } },
        showlegend: true,
        legend: {
          x: 1.0, y: 1.0, xanchor: "right", yanchor: "top",
          bgcolor: scheme === "dark" ? "rgba(31,31,31,0.6)" : "rgba(255,255,255,0.85)",
          bordercolor: scheme === "dark" ? "#3b3b3b" : "#ced4da", borderwidth: 1,
        },
        margin: { ...darkLayout.margin, r: hasCharge ? 76 : 24, b: 62 },
        xaxis: { ...darkLayout.xaxis, title: { text: xTitle } },
        yaxis: {
          ...darkLayout.yaxis,
          title: { text: "molality  (mol/kg water)   (log)" },
          type: "log",
        },
        ...(hasCharge
          ? {
              yaxis2: {
                ...darkLayout.yaxis,
                title: { text: "Σz·m / Σ|z|·m" },
                overlaying: "y", side: "right", showgrid: false,
                automargin: true, zeroline: true,
                zerolinecolor: PLOT_COLORS.warm2,
                range: [-1.05, 1.05],
              },
            }
          : {}),
      } as never}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
