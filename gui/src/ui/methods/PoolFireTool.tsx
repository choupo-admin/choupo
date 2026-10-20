/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  PoolFireTool -- "The radiation of a pool fire, and the distance it sets"
  (DEV.md 4c C83, commissioned by Vitor 2026-10-17), on the "Process safety"
  shelf beside the overpressure page.

  A CONSTRUCTION: the reader builds a fire from the fuel up.  Three small
  read-only tables sit after the steps that earn them (the heat of
  combustion; the burning rate and its calibration; the flame height against
  measurement), and the BENCH after Part 4 draws q(s) by both receiver models
  with the thresholds and the layout case's two separations on it.

  NO ENGINE RUN.  Every substance property is read from the catalogue record
  the engine reads (case/catalogue.ts rawRecordFor); the fire is the page's
  own arithmetic (poolFire.ts), on the overpressure.ts precedent.

  THE CHART COLOURS.  Point source and solid flame take the first two series
  colours of the app's plot kit (cyan and amber, PLOT_COLORS.series); every
  trace is also NAMED in the legend and drawn with its own dash, and the
  thresholds are grey dotted lines labelled with their value and source,
  because colour alone is not identity.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Anchor, Box, SegmentedControl, Stack, Table, Text, Title,
} from "@mantine/core";

import { rawRecordFor } from "../../case/catalogue.js";
import { tutorialByName } from "../../cases/tutorials.js";
import { Plot, PLOT_COLORS, darkLayout } from "../plotting/plotly.js";
import { KnobField, KnobNumber, PanelNote } from "./knobPanel.js";
import { LessonLimits, LessonStepView } from "./lessonStep.js";
import {
  AMBIENT_T_K, FUEL_PLANT, LAYOUT_CASE, MEASURED, POOL_FUELS, THRESHOLDS,
  USBM_TABLE21, HESKESTAD_RANGE, burgessMinf, burningFlux, distanceTo, formationEnthalpy,
  fuelFromRecord, gasificationHeat, heatRelease, heskestadGroup, heskestadHeight,
  epaDoseTime, kBetaFromMeasurement, lhvVapour, liquidDensity, perKg, poolFire,
  readSeparation, regressionToFlux, thomasHeight, airDensity, watsonHvap,
  type FlameHeightModel, type FuelRecord, type PoolFuel, type Products,
  type SepModel,
} from "./poolFire.js";
import { POOL_LIMITS, POOL_SOURCES, POOL_STEPS } from "./poolFireLesson.js";
import { setActiveMethodTool } from "./registry.js";

const HUE_POINT = PLOT_COLORS.series[0]!;
const HUE_SOLID = PLOT_COLORS.series[1]!;
const HUE_LINE = "#868e96";

const step = (n: number) => {
  const s = POOL_STEPS.find((q) => q.n === n);
  return s ? <LessonStepView key={n} step={s} /> : null;
};

const fx = (v: number | null | undefined, d: number): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—";
const kW = (w: number | null | undefined, d = 2): string =>
  typeof w === "number" ? fx(w / 1000, d) : "—";

const KNOB_GRID = {
  display: "grid", gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
} as const;

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>
        {children}
      </Table>
    </Box>
  );
}

// ---- The catalogue, read once ------------------------------------------------

interface Catalogue {
  fuels: Partial<Record<PoolFuel, FuelRecord>>;
  products: Products | null;
  M_air: number;
  err: string | null;
}

function readCatalogue(): Catalogue {
  try {
    const body = (n: string): string => {
      const b = rawRecordFor(n);
      if (!b) throw new Error(`the catalogue has no record '${n}'`);
      return b;
    };
    const fuels: Partial<Record<PoolFuel, FuelRecord>> = {};
    for (const f of POOL_FUELS) fuels[f] = fuelFromRecord(body(f));
    const products: Products = {
      dHf_CO2: formationEnthalpy(body("CO2")),
      dHf_H2O: formationEnthalpy(body("water")),
      dHf_O2: formationEnthalpy(body("O2")),
    };
    const m = /^\s*MW\s+([0-9.eE+-]+)\s*;/m.exec(body("air"));
    if (!m) throw new Error("the air record declares no MW");
    return { fuels, products, M_air: Number(m[1]), err: null };
  } catch (e) {
    return { fuels: {}, products: null, M_air: NaN, err: String(e) };
  }
}

function FuelSelect({ value, onChange }: {
  value: PoolFuel; onChange: (f: PoolFuel) => void;
}): JSX.Element {
  return (
    <KnobField label="fuel">
      <SegmentedControl size="xs" fullWidth value={value}
        data={POOL_FUELS.map((f) => ({ value: f, label: f }))}
        onChange={(v) => onChange(v as PoolFuel)} />
    </KnobField>
  );
}

/** The calibrated k-beta of a fuel: the curve through its FIRST measurement. */
function calibration(f: FuelRecord, p: Products, fuel: PoolFuel) {
  const dHc = perKg(lhvVapour(f, p) - watsonHvap(f, AMBIENT_T_K), f.MW);
  const dHg = gasificationHeat(f);
  const mInf = burgessMinf(dHc, dHg);
  const cal = MEASURED[fuel][0]!;
  const kBeta = kBetaFromMeasurement(mInf, cal.m_kg_m2s, cal.D_m);
  return { dHc, dHg, mInf, kBeta, cal };
}

// ---- Table after step 2: the heat of combustion -----------------------------------

function CombustionTable({ cat, fuel, onFuel }: {
  cat: Catalogue; fuel: PoolFuel; onFuel: (f: PoolFuel) => void;
}): JSX.Element {
  const f = cat.fuels[fuel];
  const p = cat.products;
  if (!f || !p) return <></>;
  const vap = lhvVapour(f, p);
  const hv = watsonHvap(f, AMBIENT_T_K);
  const liq = vap - hv;
  const ox = f.C + f.H / 4 - f.O / 2;
  return (
    <Box>
      <Title order={5}>The heat of combustion of your fuel, from its record</Title>
      <Box mt={8} style={KNOB_GRID}><FuelSelect value={fuel} onChange={onFuel} /></Box>
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>quantity</Table.Th><Table.Th>value</Table.Th><Table.Th>from</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr><Table.Td>formula; a, b, c</Table.Td><Table.Td>{f.formula}; {f.C}, {f.H}, {f.O}</Table.Td><Table.Td>record</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>O2 per mole of fuel</Table.Td><Table.Td>{fx(ox, 2)}</Table.Td><Table.Td>a + b/4 − c/2</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>ΔH_f of the fuel, ideal gas [kJ/mol]</Table.Td><Table.Td>{fx(f.dHf / 1000, 3)}</Table.Td><Table.Td>record</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>ΔH_f of CO2 / H2O(g) / O2 [kJ/mol]</Table.Td><Table.Td>{fx(p.dHf_CO2 / 1000, 3)} / {fx(p.dHf_H2O / 1000, 3)} / {fx(p.dHf_O2 / 1000, 1)}</Table.Td><Table.Td>records</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>lower heating value of the vapour [kJ/mol]</Table.Td><Table.Td>{fx(vap / 1000, 2)}</Table.Td><Table.Td>Hess, step 2</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>latent heat at 298.15 K [kJ/mol]</Table.Td><Table.Td>{fx(hv / 1000, 2)}</Table.Td><Table.Td>Watson from Tb = {fx(f.Tb, 2)} K, Tc = {fx(f.Tc, 2)} K, ΔH_v,b = {fx(f.HvapTb / 1000, 2)} kJ/mol</Table.Td></Table.Tr>
          <Table.Tr><Table.Td><b>lower heating value of the liquid [kJ/mol]</b></Table.Td><Table.Td><b>{fx(liq / 1000, 2)}</b></Table.Td><Table.Td>vapour − latent</Table.Td></Table.Tr>
          <Table.Tr><Table.Td><b>Δh_c [MJ/kg]</b></Table.Td><Table.Td><b>{fx(perKg(liq, f.MW) / 1e6, 3)}</b></Table.Td><Table.Td>÷ M = {fx(f.MW, 3)} g/mol</Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
      <PanelNote>
        No engine run: the catalogue&apos;s records, read in your browser, and
        step 2&apos;s arithmetic on them.  {fuel} appears in the corpus in
        tutorials/{FUEL_PLANT[fuel]}.
      </PanelNote>
    </Box>
  );
}

// ---- Table after step 4: the burning rate and its calibration ------------------------

function BurningRateTable({ cat, fuel }: { cat: Catalogue; fuel: PoolFuel }): JSX.Element {
  const f = cat.fuels[fuel];
  const p = cat.products;
  if (!f || !p) return <></>;
  const c = calibration(f, p, fuel);
  const rho = liquidDensity(f);
  const usbm = USBM_TABLE21[fuel];
  return (
    <Box>
      <Title order={5}>The burning rate of {fuel}: correlation, calibration, check</Title>
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>quantity</Table.Th><Table.Th>value</Table.Th><Table.Th>from</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr><Table.Td>Δh_g, heat to gasify [MJ/kg]</Table.Td><Table.Td>{fx(c.dHg / 1e6, 4)}</Table.Td><Table.Td>record: ΔH_v,b + C_p,L (T_b − 298.15 K), C_p,L = {fx(f.CpLiq, 1)} J/(mol K)</Table.Td></Table.Tr>
          <Table.Tr><Table.Td><b>ṁ″_∞, Burgess [g/(m2 s)]</b></Table.Td><Table.Td><b>{fx(c.mInf * 1000, 2)}</b></Table.Td><Table.Td>0.001 Δh_c / Δh_g</Table.Td></Table.Tr>
          {usbm && (
            <Table.Tr><Table.Td>ṁ″_∞, Bureau of Mines Bulletin 680 [g/(m2 s)]</Table.Td><Table.Td>{fx(regressionToFlux(usbm.v_cm_min, rho) * 1000, 2)}</Table.Td><Table.Td>{usbm.v_cm_min} cm/min × ρ_L = {fx(rho, 1)} kg/m3 (record)</Table.Td></Table.Tr>
          )}
          <Table.Tr><Table.Td>calibration: measured at D = {c.cal.D_m} m [g/(m2 s)]</Table.Td><Table.Td>{fx(c.cal.m_kg_m2s * 1000, 2)}</Table.Td><Table.Td>NIST TN 2082</Table.Td></Table.Tr>
          <Table.Tr><Table.Td><b>k β that passes through it [1/m]</b></Table.Td><Table.Td><b>{fx(c.kBeta, 3)}</b></Table.Td><Table.Td>step 3, inverted</Table.Td></Table.Tr>
          {MEASURED[fuel].slice(1).map((m) => (
            <Table.Tr key={m.D_m}>
              <Table.Td>check at D = {m.D_m} m: predicted / measured [g/(m2 s)]</Table.Td>
              <Table.Td>{fx(burningFlux(c.mInf, c.kBeta, m.D_m) * 1000, 2)} / {fx(m.m_kg_m2s * 1000, 2)}</Table.Td>
              <Table.Td>NIST TN 2083, not used in the calibration</Table.Td>
            </Table.Tr>
          ))}
          {MEASURED[fuel].slice(1).map((m) => (
            <Table.Tr key={`Q${m.D_m}`}>
              <Table.Td>heat release at D = {m.D_m} m [kW]</Table.Td>
              <Table.Td>{kW(heatRelease(burningFlux(c.mInf, c.kBeta, m.D_m), m.D_m, c.dHc), 1)}</Table.Td>
              <Table.Td>step 4 (NIST measured 256 kW by calorimetry)</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
      <PanelNote>
        {MEASURED[fuel].length > 1
          ? "The calibration uses the 30 cm pan only; the 1 m row is a measurement the curve never saw."
          : `Only one public-domain measurement of ${fuel} was found, so its curve is calibrated and checked against nothing larger -- a limit the page states rather than hides.`}
      </PanelNote>
    </Box>
  );
}

// ---- Table after step 5: the flame height against measurement --------------------------

function FlameTable({ cat, fuel }: { cat: Catalogue; fuel: PoolFuel }): JSX.Element {
  const f = cat.fuels[fuel];
  const p = cat.products;
  if (!f || !p) return <></>;
  const c = calibration(f, p, fuel);
  const rhoA = airDensity(cat.M_air);
  return (
    <Box>
      <Title order={5}>Two flame heights against the measured ones ({fuel})</Title>
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>pan D [m]</Table.Th><Table.Th>ṁ″ [g/(m2 s)]</Table.Th><Table.Th>Q [kW]</Table.Th><Table.Th>Thomas L [m]</Table.Th><Table.Th>Heskestad L [m]</Table.Th><Table.Th>measured L ± spread [m]</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {MEASURED[fuel].map((m) => {
            const mm = burningFlux(c.mInf, c.kBeta, m.D_m);
            const Q = heatRelease(mm, m.D_m, c.dHc);
            return (
              <Table.Tr key={m.D_m}>
                <Table.Td>{m.D_m}</Table.Td>
                <Table.Td>{fx(mm * 1000, 2)}</Table.Td>
                <Table.Td>{kW(Q, 1)}</Table.Td>
                <Table.Td>{fx(thomasHeight(mm, m.D_m, rhoA), 2)}</Table.Td>
                <Table.Td>{fx(heskestadHeight(Q, m.D_m), 2)}</Table.Td>
                <Table.Td>{fx(m.L_m, 3)} ± {fx(m.L_sd_m, 3)}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </PanTable>
      <PanelNote>
        The burning flux is the calibrated curve of step 3; the measured heights
        are NIST&apos;s (TN 2082 Table 1 at 30 cm, TN 2083 at 1 m); air at
        298.15 K and 1 atm, ρ_a = {fx(rhoA, 4)} kg/m3 from the air record&apos;s
        molar mass.
      </PanelNote>
    </Box>
  );
}

// ---- The bench ----------------------------------------------------------------------

type ReadModel = "point" | "solid";

/** The sentence beside the receiver's flux: the exposure time at which the
 *  EPA endpoint's dose is reached there (step 11).  Recomputed on every knob
 *  move because it is a function of the flux the page just drew. */
export function exposureSentence(q: number): string {
  if (!(q > 0)) return "";
  const t = epaDoseTime(q);
  const span = t < 120 ? `${fx(t, 0)} s` : t < 7200 ? `${fx(t / 60, 1)} min` : `${fx(t / 3600, 1)} h`;
  return `At this flux the EPA endpoint's dose (5 kW/m2 for 40 s) is reached after ${span} of exposure: `
    + "a person's harm is a dose, so how long they stay matters as much as where they stand.";
}

/** Shown under the receiver's sentence whatever the knobs say. */
export const NOT_A_BOUNDARY = "No distance or flux on this page is a universal safe or harm boundary: "
  + "each threshold is a flux with the exposure its source states (or none), for a person or a building, "
  + "and real harm also depends on clothing, shelter, escape and on the fire's own variation.";

function Bench({ cat, fuel, onFuel }: {
  cat: Catalogue; fuel: PoolFuel; onFuel: (f: PoolFuel) => void;
}): JSX.Element {
  const f = cat.fuels[fuel]!;
  const p = cat.products!;
  const cal = calibration(f, p, fuel);
  const defaultChi = MEASURED[fuel][MEASURED[fuel].length - 1]!.chi_r ?? 0.2;
  const [D, setD] = useState(5);
  const [z, setZ] = useState(1.5);
  const [sR, setSR] = useState(30);
  const [flame, setFlame] = useState<FlameHeightModel>("heskestad");
  const [sep, setSep] = useState<SepModel>("energy");
  const [read, setRead] = useState<ReadModel>("solid");
  //  k-beta and chi_r are the reader's once moved; null means "the
  //  calibrated / measured value of the current fuel".
  const [kbUser, setKb] = useState<number | null>(null);
  const [chiUser, setChi] = useState<number | null>(null);
  const kBeta = kbUser ?? cal.kBeta;
  const chiR = chiUser ?? defaultChi;

  const fire = useMemo(() => poolFire({
    fuel: f, products: p, M_air: cat.M_air, D, kBeta, chiR, flame, sep, z, tau: 1,
  }), [f, p, cat.M_air, D, kBeta, chiR, flame, sep, z]);
  const R = D / 2;
  const hg = heskestadGroup(fire.Q, D);
  const hgInside = hg >= HESKESTAD_RANGE[0] && hg <= HESKESTAD_RANGE[1];
  const valid = Number.isFinite(fire.L) && fire.L > 0;

  const layoutRaw = tutorialByName(LAYOUT_CASE)?.files.rawFiles?.["system/layoutDict"];
  const sepTable = useMemo(() => {
    try { return layoutRaw ? readSeparation(layoutRaw) : null; } catch { return null; }
  }, [layoutRaw]);
  const pairs = (sepTable?.rules ?? []).filter((r) =>
    (r.a === "vessel" && r.b === "vessel") || (r.a === "building" && r.b === "vessel"));

  const dist = THRESHOLDS.map((t) => ({
    t,
    point: valid ? distanceTo(fire.qPoint, t.q, R) : null,
    solid: valid ? distanceTo(fire.qSolid, t.q, R) : null,
  }));
  const edge = (x: number | null): string => (x === null ? "not reached" : fx(x - R, 1));

  const plot = useMemo(() => {
    if (!valid) return null;
    const far = Math.max(200, ...dist.map((d) => (d.point ?? 0) - R) .map((v) => 2 * v));
    const n = 220;
    const s: number[] = [];
    for (let i = 0; i < n; i++) s.push(0.05 * Math.pow(far / 0.05, i / (n - 1)));
    const yP = s.map((v) => fire.qPoint(R + v) / 1000);
    const yS = s.map((v) => fire.qSolid(R + v) / 1000);
    const bold = (m: ReadModel) => (read === m ? 3 : 1.5);
    const traces: object[] = [
      { x: s, y: yP, type: "scatter", mode: "lines", name: "point source",
        line: { color: HUE_POINT, width: bold("point"), dash: "dash" } },
      { x: s, y: yS, type: "scatter", mode: "lines", name: "solid flame",
        line: { color: HUE_SOLID, width: bold("solid") } },
    ];
    const shapes: object[] = THRESHOLDS.map((t) => ({
      type: "line", xref: "paper", x0: 0, x1: 1, y0: t.q / 1000, y1: t.q / 1000,
      line: { color: HUE_LINE, width: 1, dash: "dot" },
    }));
    //  4.18 and 5 kW/m2 are close on a log axis: the lower of the pair is
    //  labelled under its line, every other one above it.
    const annotations: object[] = THRESHOLDS.map((t) => ({
      xref: "paper", x: 1, xanchor: "right", y: Math.log10(t.q / 1000),
      yanchor: t.id === "usbm-pain" ? "top" : "bottom", text: t.label, showarrow: false,
      font: { size: 10, color: HUE_LINE },
    }));
    for (const r of pairs) {
      shapes.push({ type: "line", yref: "paper", y0: 0, y1: 1, x0: r.distance_m,
        x1: r.distance_m, line: { color: HUE_LINE, width: 1, dash: "dashdot" } });
      annotations.push({ yref: "paper", y: 0.02, x: Math.log10(r.distance_m),
        xanchor: "left", text: ` ${r.a}–${r.b} ${r.distance_m} m`,
        showarrow: false, font: { size: 10, color: HUE_LINE } });
    }
    return { traces, shapes, annotations };
  }, [valid, fire, R, read, pairs, dist]);

  const ratioFar = valid ? fire.qSolid(R + 1000 * D) / fire.qPoint(R + 1000 * D) : NaN;
  const qAt = (sEdge: number) => ({
    point: fire.qPoint(R + sEdge), solid: fire.qSolid(R + sEdge),
  });
  const here = qAt(sR);
  const readName = read === "point" ? "point source" : "solid flame";
  const passes = (q: number) => THRESHOLDS.filter((t) => q > t.q).map((t) => t.label);
  const qHere = read === "point" ? here.point : here.solid;

  return (
    <Box>
      <Title order={5}>The bench: your pool, your receiver, both models</Title>
      <Box mt={8} style={KNOB_GRID}>
        <FuelSelect value={fuel} onChange={(v) => { setKb(null); setChi(null); onFuel(v); }} />
        <KnobNumber label="pool diameter D [m]" value={D} min={0.3} max={60}
          step={0.5} decimals={2} onChange={setD} />
        <KnobNumber label="receiver distance from the pool edge [m]" value={sR}
          min={0.5} max={500} step={1} decimals={1} onChange={setSR} />
        <KnobNumber label="receiver height z [m]" value={z} min={0} max={30}
          step={0.5} decimals={1} onChange={setZ} />
        <KnobField label="flame height">
          <SegmentedControl size="xs" fullWidth value={flame}
            data={[{ value: "heskestad", label: "Heskestad" },
                   { value: "thomas", label: "Thomas" }]}
            onChange={(v) => setFlame(v as FlameHeightModel)} />
        </KnobField>
        <KnobField label="emissive power">
          <SegmentedControl size="xs" fullWidth value={sep}
            data={[{ value: "energy", label: "energy (χ_r)" },
                   { value: "mudan", label: "Mudan & Croce" }]}
            onChange={(v) => setSep(v as SepModel)} />
        </KnobField>
        <KnobNumber label="radiative fraction χ_r" value={chiR} min={0.05}
          max={0.6} step={0.01} decimals={3} onChange={setChi} />
        <KnobNumber label="k β [1/m] (calibrated by default)" value={kBeta}
          min={0.1} max={20} step={0.1} decimals={3} onChange={setKb} />
        <KnobField label="model read at the receiver">
          <SegmentedControl size="xs" fullWidth value={read}
            data={[{ value: "solid", label: "solid flame" },
                   { value: "point", label: "point source" }]}
            onChange={(v) => setRead(v as ReadModel)} />
        </KnobField>
      </Box>
      {!valid && (
        <Alert color="orange" variant="light" mt={8} title="No flame height">
          Heskestad&apos;s height is not positive for this pool (its −1.02 D
          term wins on a fire this weak for its size); take Thomas&apos;s, or a
          smaller pool.
        </Alert>
      )}
      {plot && (
        <Box mt={10} style={{ width: "100%", height: 420 }}>
          <Plot data={plot.traces}
            layout={{
              ...darkLayout,
              title: { text: `Radiant flux from a ${fx(D, 1)} m ${fuel} pool, receiver ${fx(z, 1)} m up`,
                font: { ...darkLayout.font, size: 14 } },
              xaxis: { ...darkLayout.xaxis, type: "log",
                title: { text: "distance from the pool edge  [m]" } },
              yaxis: { ...darkLayout.yaxis, type: "log",
                title: { text: "q  [kW/m2]" } },
              shapes: plot.shapes, annotations: plot.annotations,
              legend: { ...darkLayout.legend, orientation: "h", y: -0.25 },
              margin: { ...darkLayout.margin, b: 110 },
            }}
            useResizeHandler style={{ width: "100%", height: "100%" }} />
        </Box>
      )}
      {plot && (
        <Text size="xs" c="dimmed" mt={4}>
          Each dotted line is a FLUX.  For a person, harm follows a dose -- the
          flux AND how long it lasts -- so where a curve crosses a line is not
          a boundary between safe and harmed; the table below gives the
          exposure each source attaches, and the building line is not about
          people.
        </Text>
      )}
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>the fire</Table.Th><Table.Th>value</Table.Th><Table.Th>step</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr><Table.Td>Δh_c [MJ/kg]</Table.Td><Table.Td>{fx(fire.dHc / 1e6, 3)}</Table.Td><Table.Td>2</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>ṁ″_∞ / ṁ″ at D [g/(m2 s)]</Table.Td><Table.Td>{fx(fire.mInf * 1000, 2)} / {fx(fire.m * 1000, 2)}</Table.Td><Table.Td>3</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>heat release Q [MW]</Table.Td><Table.Td>{fx(fire.Q / 1e6, 3)}</Table.Td><Table.Td>4</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>flame height L, Thomas / Heskestad [m]</Table.Td><Table.Td>{fx(fire.L_thomas, 2)} / {fx(fire.L_heskestad, 2)}</Table.Td><Table.Td>5</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>Heskestad&apos;s group Q^(2/5)/D [kW^(2/5)/m]</Table.Td><Table.Td>{fx(hg, 1)}</Table.Td><Table.Td>5: {hgInside ? "inside" : "OUTSIDE"} the tested {HESKESTAD_RANGE[0]}–{HESKESTAD_RANGE[1]}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>emissive power E, energy / Mudan &amp; Croce [kW/m2]</Table.Td><Table.Td>{kW(fire.E_energy, 1)} / {kW(fire.E_mudan, 1)}</Table.Td><Table.Td>6</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>radiative fraction the solid flame implies, χ_E</Table.Td><Table.Td>{fx(fire.chiImplied, 3)}</Table.Td><Table.Td>10</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>far-field ratio solid / point (1000 D away)</Table.Td><Table.Td>{fx(ratioFar, 3)}</Table.Td><Table.Td>10: 4/π × χ_E/χ_r = {fx(4 / Math.PI * fire.chiImplied / chiR, 3)}</Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>threshold</Table.Th><Table.Th>for, and the exposure its source attaches</Table.Th><Table.Th>point source: distance from the edge [m]</Table.Th><Table.Th>solid flame: distance from the edge [m]</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {dist.map((d) => (
            <Table.Tr key={d.t.id}>
              <Table.Td>{d.t.label}</Table.Td>
              <Table.Td>{d.t.target}: {d.t.exposure}</Table.Td>
              <Table.Td>{edge(d.point)}</Table.Td>
              <Table.Td>{edge(d.solid)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
      <Text size="sm" mt={6}>
        At your receiver, {fx(sR, 1)} m from the pool edge and {fx(z, 1)} m up,
        the {readName} gives <b>{kW(read === "point" ? here.point : here.solid)} kW/m2</b> (the
        {read === "point" ? " solid flame" : " point source"} gives{" "}
        {kW(read === "point" ? here.solid : here.point)}).
        {" "}{passes(qHere).length
          ? `That is above: ${passes(qHere).join("; ")}.`
          : "That is below every threshold on the page."}
        {" "}{exposureSentence(qHere)}
      </Text>
      <Text size="xs" c="dimmed" mt={4}>
        {NOT_A_BOUNDARY}
      </Text>
      {sepTable && pairs.length > 0 && (
        <Text size="sm" mt={6}>
          tutorials/{LAYOUT_CASE} declares{" "}
          {pairs.map((r, i) => {
            const q = qAt(r.distance_m);
            return (
              <span key={`${r.a}${r.b}`}>
                {i > 0 ? "; and " : ""}{r.distance_m} m between kinds {r.a} and {r.b},
                at which this pool gives {kW(q.solid)} kW/m2 by the solid flame
                and {kW(q.point)} by the point source
              </span>
            );
          })}
          {" "}-- measured {sepTable.measure}, as an author-set assumption (the
          file says so: {sepTable.source}).
        </Text>
      )}
      <PanelNote>
        No engine run: the catalogue&apos;s records and this page&apos;s
        arithmetic.  τ = 1 (step 9).  k β starts at the value calibrated on the
        NIST 30 cm pan and χ_r at the largest pan NIST measured for this fuel;
        move either and it stays yours until you change the fuel.  The layout
        distances are read from the case&apos;s own file, and the pool is put
        where its vessel stands.
      </PanelNote>
    </Box>
  );
}

// ---- The page -------------------------------------------------------------------

export function PoolFireTool(): JSX.Element {
  const cat = useMemo(readCatalogue, []);
  const [fuel, setFuel] = useState<PoolFuel>("methanol");
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>The radiation of a pool fire, and the distance it sets</Title>
          <Text size="sm" c="dimmed" mt={4}>
            How fast a pool burns, how tall and how bright its flame is, how much
            of its radiation reaches a receiver by two published models, and how
            far from it each published threshold lies -- beside the separation a
            layout case declares.
          </Text>
          <Text size="sm" mt={6}>
            The{" "}
            <Anchor component="button" type="button"
              onClick={() => setActiveMethodTool("plant-layout")}>
              plant-layout page
            </Anchor>{" "}
            is where a separation table is declared and checked; this page is
            where a number in it can come from.  Nothing on it is a consequence
            analysis of a real plant.
          </Text>
        </Box>
        {cat.err !== null && (
          <Alert color="red" variant="light" title="The catalogue could not be read">
            <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{cat.err}</Text>
          </Alert>
        )}

        <Title order={4}>Part 1 — why a distance</Title>
        {step(1)}

        <Title order={4}>Part 2 — the pool</Title>
        {step(2)}
        <CombustionTable cat={cat} fuel={fuel} onFuel={setFuel} />
        {step(3)}
        {step(4)}
        <BurningRateTable cat={cat} fuel={fuel} />

        <Title order={4}>Part 3 — the flame</Title>
        {step(5)}
        <FlameTable cat={cat} fuel={fuel} />
        {step(6)}

        <Title order={4}>Part 4 — the receiver</Title>
        {step(7)}
        {step(8)}
        {step(9)}
        {step(10)}

        <Title order={4}>Part 5 — thresholds, and the distance to each</Title>
        {step(11)}
        {step(12)}
        {cat.err === null && cat.products && <Bench cat={cat} fuel={fuel} onFuel={setFuel} />}

        <Title order={4}>Part 6 — limits</Title>
        {step(13)}
        <Text size="sm">
          Back to{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("overpressure")}>
            Designing for overpressure
          </Anchor>{" "}for the same pool fire seen from inside the vessel it
          heats: the heat it puts into a wetted wall, and the relief valve that
          must vent what boils.
        </Text>

        <LessonLimits limits={POOL_LIMITS} />
        <Box>
          <Title order={5}>Sources, how each was reached, and its licence</Title>
          {POOL_SOURCES.map((s) => (
            <Box key={s.id} mt={6}>
              <Text size="sm">{s.cite}</Text>
              <Text size="xs" c="dimmed">{s.used}</Text>
            </Box>
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
