/*---------------------------------------------------------------------------*\
  PsychroPlot — the psychrometric chart render.

  Long-format CSV from the `psychrometricChart` engine op: rows `T_C, Y, curve`
  where curve is `saturation`, `rh:<phi>`, or `wetbulb:<Tas>`.  Grouped by curve
  into colour-coded Plotly traces (saturation bold blue, relative-humidity teal,
  wet-bulb / adiabatic-saturation dashed orange).  Pure render -- physics is in
  the C++ op.
\*---------------------------------------------------------------------------*/

import { useComputedColorScheme } from "@mantine/core";
import { Plot, PLOT_CONFIG, PLOT_COLORS, darkLayout } from "./plotly.js";
import { useStore } from "../../state/store.js";
import { kToDisplay, temperatureLabel } from "../../state/displayUnits.js";

// Curve colours per scheme.  The dark palette is the bright Mantine accents;
// on a WHITE background those light cyans/oranges vanish, so light mode uses
// saturated, darker hues that read on white (the chart is the same physics).
type CurvePalette = { sat: string; rh: string; adia: string; wb: string };
const DARK_CURVES: CurvePalette = {
  sat: PLOT_COLORS.accent, rh: PLOT_COLORS.accent2, adia: PLOT_COLORS.warm, wb: PLOT_COLORS.warm2,
};
const LIGHT_CURVES: CurvePalette = {
  sat: "#00838f", rh: "#0097a7", adia: "#ef6c00", wb: "#c62828",
};

interface Series { x: number[]; y: number[]; }
interface Trace {
  type: "scattergl"; mode: "lines"; name: string; x: number[]; y: number[];
  legendgroup: string; showlegend: boolean;
  line: { color: string; width: number; dash: string };
  hovertemplate?: string; hoverinfo?: "skip";
}

export function PsychroPlot({ csv, yMax = 0 }: { csv: string; yMax?: number }) {
  const Tu = useStore((s) => s.displayPrefs.temperature);   // respect the units menu
  const scheme = useComputedColorScheme("dark");
  const C = scheme === "dark" ? DARK_CURVES : LIGHT_CURVES;
  const toT = (tC: number) => kToDisplay(tC + 273.15, Tu);  // chart CSV is in °C
  const rows = csv.trim().split("\n");
  // GUARD: only render OUR csv (T_C,Y,curve).  A stale csv from another plot type
  // (e.g. a Psat scan, mid tab-switch) would otherwise parse into hundreds of
  // bogus traces and freeze the browser.
  if ((rows[0] ?? "").trim() !== "T_C,Y,curve") {
    return <div style={{ padding: 16, color: "#888", fontSize: 12 }}>Computing psychrometric chart…</div>;
  }
  const groups = new Map<string, Series>();
  for (let i = 1; i < rows.length; i++) {
    const parts = rows[i]!.split(",");
    if (parts.length < 3) continue;
    const t = Number(parts[0]);
    const y = Number(parts[1]);
    const curve = parts[2]!;
    if (!Number.isFinite(t) || !Number.isFinite(y)) continue;
    if (!groups.has(curve)) groups.set(curve, { x: [], y: [] });
    const g = groups.get(curve)!;
    g.x.push(t);
    g.y.push(y);
  }

  // DIAGNOSTIC: if no data points parsed, show what the worker actually returned
  // (so a screenshot reveals the cause without needing the browser console).
  const dataRows = csv.trim().split("\n").length - 1;
  const parsedPts = [...groups.values()].reduce((s, g) => s + g.x.length, 0);
  if (parsedPts === 0) {
    return (
      <div style={{ padding: 16, fontFamily: "monospace", fontSize: 12, color: "#ffb74d", whiteSpace: "pre-wrap" }}>
        {`Psychrometric chart — no plottable points.\ncsv length: ${csv.length} chars, ${dataRows} data row(s).\n--- first 400 chars of what the engine returned: ---\n${csv.slice(0, 400)}`}
      </div>
    );
  }

  // Order: RH (background) < adiabatic < wet-bulb < saturation (on top).
  const order = (c: string) =>
    c === "saturation" ? 3 : c.startsWith("wetbulb:") ? 2 : c.startsWith("adiabatic:") ? 1 : 0;
  const keys = [...groups.keys()].sort((a, b) => order(a) - order(b));

  const data: Trace[] = keys.map((curve): Trace => {
    const g = groups.get(curve)!;
    let name = curve;
    let color: string = C.rh;
    let dash = "solid";
    let width = 1;
    let showlegend = true;
    if (curve === "saturation") {
      name = "saturation (100% RH)"; color = C.sat; width = 3;
    } else if (curve.startsWith("rh:")) {
      name = `RH ${curve.slice(3)}%`; color = C.rh; width = 1; showlegend = false;
    } else if (curve.startsWith("adiabatic:")) {
      name = `adiabatic sat. ${curve.slice(10)}°C`; color = C.adia; dash = "dash"; width = 1; showlegend = false;
    } else if (curve.startsWith("wetbulb:")) {
      name = `wet-bulb ${curve.slice(8)}°C`; color = C.wb; dash = "dot"; width = 1; showlegend = false;
    }
    return {
      type: "scattergl" as const,
      mode: "lines" as const,
      name,
      x: g.x.map(toT),
      y: g.y,
      legendgroup: curve === "saturation" ? "sat" : curve.startsWith("wetbulb:") ? "twb"
        : curve.startsWith("adiabatic:") ? "wb" : "rh",
      showlegend,
      line: { color, width, dash },
      hovertemplate: `${name}<br>T = %{x:.1f} ${temperatureLabel(Tu)}   Y = %{y:.4f} kg/kg<extra></extra>`,
    };
  });

  // One legend proxy per family (the RH / wet-bulb members have showlegend off).
  const proxy = (nm: string, color: string, dash: string, group: string): Trace => ({
    type: "scattergl", mode: "lines", name: nm, x: [NaN], y: [NaN],
    legendgroup: group, showlegend: true, line: { color, width: dash === "dash" ? 1 : 2, dash },
    hoverinfo: "skip",
  });
  if (keys.some((k) => k.startsWith("rh:")))
    data.push(proxy("relative humidity", C.rh, "solid", "rh"));
  if (keys.some((k) => k.startsWith("adiabatic:")))
    data.push(proxy("adiabatic saturation", C.adia, "dash", "wb"));
  if (keys.some((k) => k.startsWith("wetbulb:")))
    data.push(proxy("wet-bulb (via Lewis nº)", C.wb, "dot", "twb"));

  // A drying chart focuses on the OPERATING region (low Y); the saturation curve
  // climbs fast and exits the top (at 80 °C, water sat. Y ~0.55 — way above the
  // useful range, like real high-T drying charts which cap ~0.1).  Default the
  // y-axis to the drying band (median of the saturation curve); the user can
  // override with "Y max" (set it large to see the full saturation curve).
  const satY = (groups.get("saturation")?.y ?? []).slice().sort((a, b) => a - b);
  const autoCap = satY.length > 2 ? Math.max(0.05, satY[Math.floor(satY.length * 0.5)]! * 1.3) : undefined;
  const yRange = yMax > 0 ? yMax : autoCap;

  return (
    <Plot
      data={data}
      layout={{
        ...darkLayout,
        autosize: true,
        showlegend: true,
        legend: {
          x: 0.02, y: 0.98,
          // Theme-aware backing: a dark box on a WHITE chart (the old hardcoded
          // rgba(31,31,31,.6)) read as a muddy smear -- match the paper instead.
          bgcolor: scheme === "dark" ? "rgba(31,31,31,0.6)" : "rgba(255,255,255,0.85)",
          bordercolor: scheme === "dark" ? "#3b3b3b" : "#ced4da",
          borderwidth: 1,
        },
        xaxis: {
          ...darkLayout.xaxis,
          title: { text: `Dry-bulb temperature (${temperatureLabel(Tu)})` },
          dtick: 20, minor: { dtick: 5, showgrid: true, gridcolor: PLOT_COLORS.grid },
        },
        yaxis: {
          ...darkLayout.yaxis,
          title: { text: "Humidity ratio  Y  (kg vapour / kg dry gas)" },
          minor: { dtick: (yRange ?? 0.1) / 10, showgrid: true, gridcolor: PLOT_COLORS.grid },
          ...(yRange ? { range: [0, yRange] } : { rangemode: "tozero" }),
        },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
