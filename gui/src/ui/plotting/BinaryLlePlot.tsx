/*---------------------------------------------------------------------------*\
  BinaryLlePlot — the binary liquid-liquid teaching diagram.

  Renders the propertyScanBinary CSV (x1,gmix_J_per_mol,role,beta): the molar
  Gibbs energy of mixing g_mix(x1) as a curve, plus the two coexisting liquid
  compositions (role=binodal) as markers joined by the COMMON TANGENT.  The two
  binodal points sit on the curve and share that tangent — so the student reads
  the liquid-liquid split (the two mutual solubilities) straight off the picture,
  the concept the dome-style binodal only asserts.  Miscible system → no binodal
  rows → just a convex curve, honestly.
\*---------------------------------------------------------------------------*/

import { useComputedColorScheme } from "@mantine/core";
import { Plot, PLOT_CONFIG, PLOT_COLORS, darkLayout } from "./plotly.js";

interface Pt { x: number; g: number; beta: number; }

export function BinaryLlePlot(
  { csv, compA, compB }: { csv: string; compA: string; compB: string },
) {
  const scheme = useComputedColorScheme("dark");
  const rows = csv.trim().split("\n");
  // GUARD: only render OUR csv shape (a stale csv mid tab-switch would parse junk).
  if ((rows[0] ?? "").trim() !== "x1,gmix_J_per_mol,role,beta") {
    return <div style={{ padding: 16, color: "#888", fontSize: 12 }}>Computing binary LLE diagram…</div>;
  }

  const curve: { x: number[]; y: number[] } = { x: [], y: [] };
  const binodal: Pt[] = [];
  for (let i = 1; i < rows.length; i++) {
    const p = rows[i]!.split(",");
    if (p.length < 3) continue;
    const x = Number(p[0]), g = Number(p[1]), role = (p[2] ?? "").trim();
    if (!Number.isFinite(x) || !Number.isFinite(g)) continue;
    if (role === "curve") { curve.x.push(x); curve.y.push(g); }
    else if (role === "binodal") binodal.push({ x, g, beta: Number(p[3]) });
  }
  // sort the curve by composition so the line is monotone in x
  const order = curve.x.map((_, i) => i).sort((a, b) => curve.x[a]! - curve.x[b]!);
  const cx = order.map((i) => curve.x[i]!), cy = order.map((i) => curve.y[i]!);

  const accent = scheme === "dark" ? "#4dabf7" : "#1c7ed6";
  const tangent = scheme === "dark" ? "#ffa94d" : "#e8590c";

  const data: Record<string, unknown>[] = [
    {
      type: "scattergl", mode: "lines", name: "g_mix",
      x: cx, y: cy, line: { color: accent, width: 2 },
      hovertemplate: `x(${compA}) = %{x:.4f}<br>g_mix = %{y:.1f} J/mol<extra></extra>`,
    },
  ];

  if (binodal.length === 2) {
    const a = binodal[0]!, b = binodal[1]!;
    data.push({
      // the common tangent = the line through the two coexisting compositions
      type: "scattergl", mode: "lines", name: "common tangent (tie-line)",
      x: [a.x, b.x], y: [a.g, b.g],
      line: { color: tangent, width: 2, dash: "dash" },
      hovertemplate: "common tangent<extra></extra>",
    });
    data.push({
      type: "scattergl", mode: "markers+text", name: "coexisting liquids",
      x: [a.x, b.x], y: [a.g, b.g],
      text: [`x=${a.x.toFixed(4)}\nβ=${a.beta.toFixed(3)}`, `x=${b.x.toFixed(4)}\nβ=${b.beta.toFixed(3)}`],
      textposition: "bottom center",
      textfont: { size: 10, color: tangent },
      marker: { color: tangent, size: 11, symbol: "circle", line: { color: "#fff", width: 1 } },
      hovertemplate: `coexisting liquid: x(${compA}) = %{x:.4f}<extra></extra>`,
    });
  }

  const title = binodal.length === 2
    ? `${compA}/${compB} — two liquid phases: x(${compA}) = ${binodal[0]!.x.toFixed(4)} ⇄ ${binodal[1]!.x.toFixed(4)}`
    : `${compA}/${compB} — single liquid (miscible: g_mix stays convex)`;

  return (
    <Plot
      data={data as never}
      layout={{
        ...darkLayout,
        autosize: true,
        title: { text: title, font: { size: 13 } },
        showlegend: true,
        legend: {
          x: 0.5, y: 0.02, xanchor: "center", orientation: "h",
          bgcolor: scheme === "dark" ? "rgba(31,31,31,0.6)" : "rgba(255,255,255,0.85)",
          bordercolor: scheme === "dark" ? "#3b3b3b" : "#ced4da", borderwidth: 1,
        },
        xaxis: {
          ...darkLayout.xaxis,
          title: { text: `mole fraction x(${compA})` }, range: [0, 1],
        },
        yaxis: {
          ...darkLayout.yaxis,
          title: { text: "molar Gibbs energy of mixing  g_mix  (J/mol)" },
          zeroline: true, zerolinecolor: PLOT_COLORS.grid,
        },
      } as never}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
