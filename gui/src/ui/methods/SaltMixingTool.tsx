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
  SaltMixingTool -- "Salt mixtures: Pitzer mixing parameters from ternary
  solubility" (DEV.md 4c C316, the architect's decision at Vitor's request).

  THE TASK (CLAUDE.md section 10): a student holding a measured solubility
  curve of NaCl + KCl + water has to say what a second salt does to the
  first one's solubility and why, how much of that the single-salt data
  already predict, what the two mixing parameters theta and psi add, and
  whether a value fitted at one temperature can be trusted at another.

  THREE MOMENTS (C305): Understand (the lesson steps), Experiment (a
  prediction before each computation, the fit, the figures, the design
  question), Verify (the page's gamma beside the engine's, every record and
  measured row it reads, its assumptions and references).

  EVERY NUMBER HERE IS THE PAGE'S OWN (saltMixingModel.ts, pure and tested)
  except the Verify table marked `engine`, which is a recorded engine run
  (saltMixingEngineRecord.ts).  Nothing is graded: a guess and the computed
  value are printed side by side.
\*---------------------------------------------------------------------------*/

import { useMemo, useState, type ReactNode } from "react";
import {
  Badge, Box, Button, Checkbox, Group, SegmentedControl, Slider, Table, Text, Title,
} from "@mantine/core";

import { formatSig } from "../../state/displayUnits.js";
import { Plot, darkLayout } from "../plotting/plotly.js";
import { SortTh, useSortable } from "../SortableTable.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { OriginMark } from "./origin.js";
import {
  SALT_DESIGN_QUESTION, SALT_MIXING_LIMITS, SALT_MIXING_STEPS, SALT_PREDICTIONS,
  type SaltPrediction,
} from "./saltMixingLesson.js";
import {
  FARELO_1993, FARELO_2005, FARELO_TABLE1, FARELO_TABLE2, LITERATURE_MIXING,
} from "./saltMixingData.js";
import { ENGINE_MIXTURES, ENGINE_RECORD, ENGINE_SINGLE_SALT } from "./saltMixingEngineRecord.js";
import { lnGammaPair, lnGammaPMSingle, MOLAR_MASS } from "./saltMixingMath.js";
import {
  binaryFromKsp, branchCurve, commonIonTable, coolingDesign, eutonicAt, FIT_HALF_WIDTH,
  FIT_TEMPERATURES, fitAt, isothermAt, KCL, KSP_KCL, KSP_NACL, lnKspCatalogue, lnKspMeasured,
  measuredBinaryMolality, MODELS, NACL, PSI_CAT, rowPredictions, scoreModels, sixSystems,
  THETA_CAT, type ModelId,
} from "./saltMixingModel.js";

const BORDER = "var(--mantine-color-default-border)";
const g = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : formatSig(v);
const step = lessonStepper(SALT_MIXING_STEPS);

// ---- the three moments -------------------------------------------------------

type MomentId = "understand" | "experiment" | "verify";
export const SALT_MOMENTS: readonly { id: MomentId; title: string; lead: string }[] = [
  { id: "understand", title: "Understand · the physical problem",
    lead: "What a second salt does to the first one's solubility, what the "
      + "single-salt Pitzer parameters already predict, and the two mixing "
      + "parameters they cannot." },
  { id: "experiment", title: "Experiment · predictions, the fit and a design",
    lead: "Before each computation, write what you expect; the page then "
      + "prints its number beside your guess.  Fit θ and ψ to one "
      + "temperature and watch what happens at the others." },
  { id: "verify", title: "Verify · every number, its record and its assumptions",
    lead: "The page's activity coefficients beside the engine's, the "
      + "catalogue records and the measured rows it reads, what the model "
      + "assumes, and where to read further." },
];

function MomentsNav(): JSX.Element {
  const go = (id: MomentId) => {
    const el = typeof document === "undefined" ? null
      : document.querySelector(`[data-moment="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <Group gap={6} data-moments-nav="">
      {SALT_MOMENTS.map((m, i) => (
        <Button key={m.id} size="compact-sm" variant="light" onClick={() => go(m.id)}>
          {i + 1} · {m.title.split(" · ")[0]}
        </Button>
      ))}
    </Group>
  );
}

function Moment({ id, children }: { id: MomentId; children: ReactNode }): JSX.Element {
  const m = SALT_MOMENTS.find((x) => x.id === id)!;
  const n = SALT_MOMENTS.indexOf(m) + 1;
  return (
    <Box data-moment={id} pt="sm" style={{ borderTop: `2px solid ${BORDER}`, scrollMarginTop: 8 }}>
      <Title order={4}>{n} · {m.title}</Title>
      <Text size="sm" c="dimmed" mt={2} mb="sm">{m.lead}</Text>
      <Box style={{ display: "flex", flexDirection: "column", gap: 16 }}>{children}</Box>
    </Box>
  );
}

function Card({ id, title, accent = "accent", children }: {
  id: string; title: string; accent?: string; children: ReactNode;
}): JSX.Element {
  return (
    <Box px="sm" py="xs" data-card={id}
      style={{ border: `1px solid ${BORDER}`, borderRadius: 6,
        borderLeft: `3px solid var(--mantine-color-${accent}-5)` }}>
      <Title order={5} mb={4}>{title}</Title>
      {children}
    </Box>
  );
}

function PredictionCard({ p, children }: { p: SaltPrediction; children: ReactNode }): JSX.Element {
  return (
    <Box data-prediction={p.id}>
      <Card id={`prediction-${p.id}`} title={p.title}>
        <Text size="sm">{p.prompt}</Text>
        <Text size="xs" c="dimmed" mt={4}>{p.check}</Text>
        <Box mt={8}>{children}</Box>
      </Card>
    </Box>
  );
}

/** The guess first; the computed answer appears only after it. */
function Guess({ options, value, onChange, onReveal, revealed }: {
  options: { label: string; value: string }[];
  value: string; onChange: (v: string) => void;
  onReveal: () => void; revealed: boolean;
}): JSX.Element {
  return (
    <Group gap={8} align="center" wrap="wrap">
      <SegmentedControl size="xs" value={value} onChange={onChange} data={options} />
      <Button size="xs" disabled={value === "" || revealed} onClick={onReveal}>
        compute
      </Button>
      {value === "" && (
        <Text size="xs" c="dimmed">Choose first: the computation waits for your guess.</Text>
      )}
    </Group>
  );
}

const plotBox = (h = 360) => ({ width: "100%", height: h });
const layout = (title: string, x: string, y: string, extra: Record<string, unknown> = {}) => ({
  ...darkLayout,
  title: { text: title, font: { ...darkLayout.font, size: 13 } },
  xaxis: { ...darkLayout.xaxis, title: { text: x } },
  yaxis: { ...darkLayout.yaxis, title: { text: y } },
  legend: { ...darkLayout.legend, orientation: "h", y: -0.25 },
  margin: { ...darkLayout.margin, b: 110 },
  ...extra,
});

// ---- Experiment pieces ---------------------------------------------------------

function BinaryFigure(): JSX.Element {
  const data = useMemo(() => {
    const Ts = Array.from({ length: 36 }, (_, i) => 293 + i * 2);
    const tr: unknown[] = [];
    for (const s of ["NaCl", "KCl"] as const) {
      const mw = MOLAR_MASS[s]!;
      const pts = FARELO_TABLE1[s];
      tr.push({ x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), type: "scatter",
        mode: "markers", name: `${s} measured (Farelo 1993, Table 1)` });
      tr.push({ x: Ts, y: Ts.map((T) => measuredBinaryMolality(s, T) * mw), type: "scatter",
        mode: "lines", line: { dash: "dot" }, name: `${s} Farelo's correlation (Table 2)` });
      tr.push({ x: Ts, y: Ts.map((T) => binaryFromKsp(s, T, lnKspCatalogue(s, T)) * mw),
        type: "scatter", mode: "lines", name: `${s} from the catalogue K_sp (logK25, dH) + Pitzer` });
    }
    return tr;
  }, []);
  return (
    <Box data-figure="binary" style={plotBox()}>
      <Plot data={data} useResizeHandler style={{ width: "100%", height: "100%" }}
        layout={layout("Binary solubility: the catalogue's K_sp(T) against the measurement",
          "T  [K]", "solubility  [g salt / kg water]")} />
    </Box>
  );
}

function BranchFigures({ model, fitRep }: { model: ModelId; fitRep: ReturnType<typeof fitAt> }): JSX.Element {
  const figs = useMemo(() => (["NaCl", "KCl"] as const).map((sat) => {
    const tr: unknown[] = [];
    for (const c of [50, 100, 150]) {
      const curve = branchCurve(sat, c, model, fitRep.fit);
      tr.push({ x: curve.T, y: curve.S, type: "scatter", mode: "lines",
        name: `model, ${c} g ${sat === "NaCl" ? "KCl" : "NaCl"}/kg` });
      const rows = fitRep.inRows.concat(fitRep.outRows)
        .filter((r) => r.src.sat === sat && r.src.otherGkg === c);
      tr.push({ x: rows.map((r) => r.T), y: rows.map((r) => r.src.satGkg), type: "scatter",
        mode: "markers", name: `measured, ${c} g/kg` });
    }
    return { sat, tr };
  }), [model, fitRep]);
  return (
    <Group grow align="flex-start" data-figure="branches">
      {figs.map((f) => (
        <Box key={f.sat} style={plotBox(380)}>
          <Plot data={f.tr} useResizeHandler style={{ width: "100%", height: "100%" }}
            layout={layout(`${f.sat} saturated, in ${f.sat === "NaCl" ? "KCl" : "NaCl"} solutions`,
              "T  [K]", `${f.sat} solubility  [g / kg water]`)} />
        </Box>
      ))}
    </Group>
  );
}

function ResidualFigure({ model, fitRep }: { model: ModelId; fitRep: ReturnType<typeof fitAt> }): JSX.Element {
  const data = useMemo(() => {
    const pr = rowPredictions(model, fitRep);
    const ins = pr.filter((p) => p.inWindow), outs = pr.filter((p) => !p.inWindow);
    return [
      { x: ins.map((p) => p.row.T), y: ins.map((p) => p.errGkg), type: "scatter", mode: "markers",
        marker: { size: 9 }, name: "rows in the fit window (in-sample)" },
      { x: outs.map((p) => p.row.T), y: outs.map((p) => p.errGkg), type: "scatter", mode: "markers",
        name: "rows outside it (held out)" },
      { x: pr.map((p) => p.row.T), y: pr.map((p) => -p.row.src.delta), type: "scatter", mode: "markers",
        marker: { symbol: "x", size: 6 }, name: "Farelo et al.'s own model (−Δ, Tables 3-4)" },
    ];
  }, [model, fitRep]);
  return (
    <Box data-figure="residuals" style={plotBox()}>
      <Plot data={data} useResizeHandler style={{ width: "100%", height: "100%" }}
        layout={layout("Predicted − measured, every row of Tables 3 and 4", "T  [K]",
          "predicted − measured  [g / kg water]")} />
    </Box>
  );
}

function IsothermFigure({ T, model, fitRep }: { T: number; model: ModelId; fitRep: ReturnType<typeof fitAt> }): JSX.Element {
  const data = useMemo(() => {
    const tr: unknown[] = [];
    for (const id of (model === "zero" ? ["zero"] : ["zero", model]) as ModelId[]) {
      const iso = isothermAt(T, id, fitRep.fit);
      const lab = MODELS.find((m) => m.id === id)!.label;
      tr.push({ x: iso.branchM.map((p) => p.mM), y: iso.branchM.map((p) => p.mN), type: "scatter",
        mode: "lines", name: `NaCl branch, ${lab}` });
      tr.push({ x: iso.branchN.map((p) => p.mM), y: iso.branchN.map((p) => p.mN), type: "scatter",
        mode: "lines", name: `KCl branch, ${lab}` });
      if (iso.eu) tr.push({ x: [iso.eu.mM], y: [iso.eu.mN], type: "scatter", mode: "markers",
        marker: { size: 11, symbol: "diamond" }, name: `eutonic, ${lab}` });
    }
    const near = fitRep.inRows.concat(fitRep.outRows).filter((r) => Math.abs(r.T - T) <= FIT_HALF_WIDTH);
    tr.push({ x: near.map((r) => (r.sat === "M" ? r.mSat : r.mOther)),
      y: near.map((r) => (r.sat === "M" ? r.mOther : r.mSat)), type: "scatter", mode: "markers",
      marker: { size: 8, symbol: "circle-open" }, name: `measured rows within ±${FIT_HALF_WIDTH} K` });
    return tr;
  }, [T, model, fitRep]);
  return (
    <Box data-figure="isotherm" style={plotBox(400)}>
      <Plot data={data} useResizeHandler style={{ width: "100%", height: "100%" }}
        layout={layout(`Phase diagram at ${g(T)} K`, "m NaCl  [mol / kg water]", "m KCl  [mol / kg water]")} />
    </Box>
  );
}

function ModelTable({ fitRep }: { fitRep: ReturnType<typeof fitAt> }): JSX.Element {
  const rows = useMemo(() => scoreModels(fitRep), [fitRep]);
  const s = useSortable(rows, {
    model: (r) => r.label, theta: (r) => r.thetaText, psi: (r) => r.psi,
    win: (r) => r.window.rms, out: (r) => r.outside.rms, bias: (r) => r.outside.bias,
  });
  return (
    <Table withTableBorder fz="xs" data-table="models">
      <Table.Thead><Table.Tr>
        <SortTh s={s} k="model">model</SortTh><SortTh s={s} k="theta">θ [kg/mol]</SortTh>
        <SortTh s={s} k="psi">ψ [kg²/mol²]</SortTh>
        <SortTh s={s} k="win">rms, rows in the window [g/kg] (n = {fitRep.inRows.length})</SortTh>
        <SortTh s={s} k="out">rms, rows outside [g/kg] (n = {fitRep.outRows.length})</SortTh>
        <SortTh s={s} k="bias">bias outside [g/kg]</SortTh>
      </Table.Tr></Table.Thead>
      <Table.Tbody>
        {s.rows.map((r) => (
          <Table.Tr key={r.id} data-model={r.id}>
            <Table.Td>{r.label}{r.id === "fit" && <Badge ml={6} size="xs" variant="light">in-sample in the window</Badge>}</Table.Td>
            <Table.Td>{r.id === "holmes" ? r.thetaText : g(Number(r.thetaText))}</Table.Td>
            <Table.Td>{g(r.psi)}</Table.Td>
            <Table.Td>{g(r.window.rms)}</Table.Td>
            <Table.Td>{g(r.outside.rms)}</Table.Td>
            <Table.Td>{g(r.outside.bias)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function CommonIonPrediction({ model, fitRep }: { model: ModelId; fitRep: ReturnType<typeof fitAt> }): JSX.Element {
  const p = SALT_PREDICTIONS.find((x) => x.id === "common-ion")!;
  const [guess, setGuess] = useState("");
  const [shown, setShown] = useState(false);
  const rows = useMemo(() => commonIonTable(model, fitRep.fit), [model, fitRep]);
  return (
    <PredictionCard p={p}>
      <Guess value={guess} onChange={setGuess} revealed={shown} onReveal={() => setShown(true)}
        options={[{ label: "rises", value: "rise" }, { label: "falls", value: "fall" },
          { label: "stays", value: "stay" }]} />
      {shown && (
        <Box mt={8} data-revealed="common-ion">
          <OriginMark of={["page", "reference"]}
            note="solved on this page at 298.15 K; measured: Farelo et al. 1993, Tables 2 and 3" />
          <Text size="xs" mt={4}>your prediction: the NaCl solubility <b>{guess}s</b></Text>
          <Table withTableBorder fz="xs" mt={4}>
            <Table.Thead><Table.Tr>
              <Table.Th>KCl [g/kg water]</Table.Th><Table.Th>common ion alone (γ frozen) [g NaCl/kg]</Table.Th>
              <Table.Th>θ = ψ = 0 [g/kg]</Table.Th><Table.Th>{MODELS.find((m) => m.id === model)!.label} [g/kg]</Table.Th>
              <Table.Th>measured [g/kg] (at T)</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.kclGkg}>
                  <Table.Td>{r.kclGkg}</Table.Td><Table.Td>{g(r.frozen)}</Table.Td>
                  <Table.Td>{g(r.zero)}</Table.Td><Table.Td>{g(r.model)}</Table.Td>
                  <Table.Td>{g(r.measured)} ({g(r.measuredT)} K)</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed" mt={4}>
            The &quot;γ frozen&quot; column keeps γ_Na and γ_Cl at their values in the pure saturated
            NaCl solution: it is the common-ion effect alone.  The difference to the next column is
            what the change of ionic strength does to γ, and its sign is the answer to the second
            half of the question.
          </Text>
        </Box>
      )}
    </PredictionCard>
  );
}

function EutonicPrediction({ model, fitRep, T, setT }: {
  model: ModelId; fitRep: ReturnType<typeof fitAt>; T: number; setT: (t: number) => void;
}): JSX.Element {
  const p = SALT_PREDICTIONS.find((x) => x.id === "eutonic")!;
  const [guess, setGuess] = useState("");
  const [shown, setShown] = useState(false);
  const zero = useMemo(() => eutonicAt(T, "zero", fitRep.fit), [T, fitRep]);
  const fitted = useMemo(() => eutonicAt(T, "fit", fitRep.fit), [T, fitRep]);
  return (
    <PredictionCard p={p}>
      <Guess value={guess} onChange={setGuess} revealed={shown} onReveal={() => setShown(true)}
        options={[{ label: "higher", value: "higher" }, { label: "lower", value: "lower" }]} />
      <Box mt={8}>
        <Text size="xs">temperature of the phase diagram: {g(T)} K</Text>
        <Slider size="xs" min={293.15} max={353.15} step={5} value={T} onChange={setT} label={null} />
      </Box>
      {shown && zero && fitted && (
        <Box mt={8} data-revealed="eutonic">
          <OriginMark of={["page", "assumption"]}
            note={`eutonic solved on this page; fitted model: θ and ψ from the rows within ±${FIT_HALF_WIDTH} K of ${g(fitRep.Tfit)} K`} />
          <Text size="xs" mt={4}>your prediction: the θ = ψ = 0 eutonic lies <b>{guess}</b></Text>
          <Table withTableBorder fz="xs" mt={4}>
            <Table.Thead><Table.Tr><Table.Th /><Table.Th>m NaCl</Table.Th><Table.Th>m KCl</Table.Th>
              <Table.Th>total [mol/kg water]</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              <Table.Tr><Table.Td>θ = ψ = 0</Table.Td><Table.Td>{g(zero.mM)}</Table.Td>
                <Table.Td>{g(zero.mN)}</Table.Td><Table.Td>{g(zero.mM + zero.mN)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>fitted θ, ψ</Table.Td><Table.Td>{g(fitted.mM)}</Table.Td>
                <Table.Td>{g(fitted.mN)}</Table.Td><Table.Td>{g(fitted.mM + fitted.mN)}</Table.Td></Table.Tr>
            </Table.Tbody>
          </Table>
          {Math.abs(T - fitRep.Tfit) > FIT_HALF_WIDTH && (
            <Text size="xs" c="dimmed" mt={4}>
              This temperature is outside the fit window: the fitted row is a held-out prediction here.
            </Text>
          )}
        </Box>
      )}
      <Box mt={8}><IsothermFigure T={T} model={model} fitRep={fitRep} /></Box>
    </PredictionCard>
  );
}

function SixSystemsPrediction(): JSX.Element {
  const p = SALT_PREDICTIONS.find((x) => x.id === "largest-mixing")!;
  const [guess, setGuess] = useState("");
  const [shown, setShown] = useState(false);
  const rows = useMemo(() => sixSystems(), []);
  return (
    <PredictionCard p={p}>
      <Guess value={guess} onChange={setGuess} revealed={shown} onReveal={() => setShown(true)}
        options={rows.map((r) => ({ label: r.sys.label.replace(" + water", ""), value: r.sys.id }))} />
      {shown && (
        <Box mt={8} data-revealed="largest-mixing">
          <OriginMark of={["page", "reference"]}
            note="measured: Farelo, Fernandes & Avelino 2005 (rows 295-301 K); binaries-only and literature columns solved on this page" />
          <Text size="xs" mt={4}>your prediction: {rows.find((r) => r.sys.id === guess)?.sys.label}</Text>
          <Table withTableBorder fz="xs" mt={4}>
            <Table.Thead><Table.Tr>
              <Table.Th>system</Table.Th><Table.Th>T [K]</Table.Th><Table.Th>second salt [mol/kg]</Table.Th>
              <Table.Th>measured [mol/kg]</Table.Th><Table.Th>θ = ψ = 0 [mol/kg]</Table.Th>
              <Table.Th>Pitzer &amp; Kim θ, ψ [mol/kg]</Table.Th><Table.Th>source</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {rows.flatMap((s) => s.rows.map((r, i) => (
                <Table.Tr key={`${s.sys.id}-${i}`} data-system={s.sys.id}>
                  <Table.Td>{i === 0 ? s.sys.label : ""}</Table.Td><Table.Td>{g(r.T)}</Table.Td>
                  <Table.Td>{g(r.mSecond)}</Table.Td><Table.Td>{g(r.measured)}</Table.Td>
                  <Table.Td>{s.computed ? g(r.zero) : "not computed"}</Table.Td>
                  <Table.Td>{g(r.lit)}</Table.Td>
                  <Table.Td>Table {r.table}, p. {r.page}</Table.Td>
                </Table.Tr>
              )))}
            </Table.Tbody>
          </Table>
          {rows.map((s) => (
            <Text key={s.sys.id} size="xs" c="dimmed" mt={2}>
              {s.sys.label}: {s.computed
                ? `mean (measured − θ = ψ = 0) = ${g(s.meanDevZeroPct)} % of the measured solubility; ${s.why}`
                : `not computed: ${s.why}`}
            </Text>
          ))}
          <Text size="xs" c="dimmed" mt={4}>
            Read the AlCl₃ rows against the others with the charges in mind: each AlCl₃ brings
            three chlorides (a common-ion effect three times larger per mole) and an Al³⁺ that
            meets Na⁺ or K⁺ with unequal charge, the case where the electrostatic E_θ term is
            not zero.
          </Text>
        </Box>
      )}
    </PredictionCard>
  );
}

function DesignCard({ model, fitRep }: { model: ModelId; fitRep: ReturnType<typeof fitAt> }): JSX.Element {
  const [Thot, setThot] = useState(353.15);
  const [Tcold, setTcold] = useState(298.15);
  const r = useMemo(() => coolingDesign(Thot, Tcold, model, fitRep.fit), [Thot, Tcold, model, fitRep]);
  return (
    <Box data-design="">
      <Card id="design" title={SALT_DESIGN_QUESTION.title} accent="grape">
        <Badge color="grape" variant="light" mb={4} styles={{ root: { textTransform: "none" } }}>
          DESIGN EXERCISE — no energy balance, no kinetics
        </Badge>
        <Text size="sm">{SALT_DESIGN_QUESTION.prompt}</Text>
        <Text size="xs" c="dimmed" mt={4}>{SALT_DESIGN_QUESTION.note}</Text>
        <Group grow mt={8}>
          <Box><Text size="xs">hot brine, saturated with both: {g(Thot)} K</Text>
            <Slider size="xs" min={313.15} max={358.15} step={5} value={Thot} onChange={setThot} label={null} /></Box>
          <Box><Text size="xs">cooled to: {g(Tcold)} K</Text>
            <Slider size="xs" min={293.15} max={333.15} step={5} value={Tcold} onChange={setTcold} label={null} /></Box>
        </Group>
        <Box mt={8}>
          <OriginMark of={["page", "assumption"]}
            note={`solved on this page with the model "${MODELS.find((m) => m.id === model)!.label}"; temperatures are yours`} />
          {r && Tcold < Thot ? (
            <Table withTableBorder fz="xs" mt={4}>
              <Table.Tbody>
                <Table.Tr><Table.Td>hot brine (eutonic at {g(Thot)} K)</Table.Td>
                  <Table.Td>{g(r.hot.mM)} mol NaCl + {g(r.hot.mN)} mol KCl per kg water</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>KCl left in solution at {g(Tcold)} K</Table.Td>
                  <Table.Td>{g(r.coldN)} mol/kg water</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>KCl crystallised</Table.Td>
                  <Table.Td>{g(r.kclCrystallisedGkg)} g per kg water</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>NaCl saturation ratio at {g(Tcold)} K (IAP/K_sp)</Table.Td>
                  <Table.Td>{g(r.naclSaturationRatioCold)} {r.naclSaturationRatioCold < 1
                    ? "— below 1: NaCl stays dissolved" : "— at or above 1: NaCl would crystallise too"}</Table.Td></Table.Tr>
              </Table.Tbody>
            </Table>
          ) : <Text size="xs" c="dimmed" mt={4}>Choose a cold temperature below the hot one.</Text>}
        </Box>
      </Card>
    </Box>
  );
}

// ---- Verify pieces ------------------------------------------------------------------

function EngineTable(): JSX.Element {
  const rows = useMemo(() => [
    ...ENGINE_MIXTURES.flatMap((e) => {
      const p = lnGammaPair(e.mNa, e.mK, e.T, NACL, KCL, THETA_CAT.value, PSI_CAT.value);
      return [
        { key: `${e.name}-Na`, what: `γ Na⁺, ${e.mNa} NaCl + ${e.mK} KCl, ${e.T} K`, engine: e.gammaNa, page: Math.exp(p.lnM) },
        { key: `${e.name}-K`, what: `γ K⁺, same solution`, engine: e.gammaK, page: Math.exp(p.lnN) },
        { key: `${e.name}-Cl`, what: `γ Cl⁻, same solution`, engine: e.gammaCl, page: Math.exp(p.lnX) },
      ];
    }),
    ...ENGINE_SINGLE_SALT.map((e) => ({
      key: `${e.salt}-${e.T}-${e.m}`, what: `γ± ${e.salt} alone, ${e.m} mol/kg, ${e.T} K`,
      engine: e.gammaPM, page: Math.exp(lnGammaPMSingle(e.m, e.T, e.salt === "NaCl" ? NACL : KCL)),
    })),
  ], []);
  return (
    <Box data-table="engine">
      <OriginMark of={["engine", "page"]}
        note={`engine: a recorded ${ENGINE_RECORD.binary} run at commit ${ENGINE_RECORD.commit} (${ENGINE_RECORD.date}), pitzerHMW speciate and pitzerActivity, every record from data/standards/; page: this page's TypeScript`} />
      <Table withTableBorder fz="xs" mt={4}>
        <Table.Thead><Table.Tr><Table.Th>quantity</Table.Th><Table.Th>engine</Table.Th>
          <Table.Th>page</Table.Th><Table.Th>|Δ ln γ|</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.key}><Table.Td>{r.what}</Table.Td>
              <Table.Td ff="monospace">{r.engine.toPrecision(9)}</Table.Td>
              <Table.Td ff="monospace">{r.page.toPrecision(9)}</Table.Td>
              <Table.Td ff="monospace">{Math.abs(Math.log(r.page / r.engine)).toExponential(1)}</Table.Td></Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Text size="xs" c="dimmed" mt={4}>
        The mixtures differ by 1e-8 to 4e-7 in ln γ, and only there: the engine's `pH 7.0` keeps
        H⁺ and OH⁻ (10⁻⁸ to 10⁻⁶ mol/kg) in solution, so its ionic strength is larger by that much,
        growing with temperature as water dissociates more.  The single-salt rows agree to the
        nine digits the engine writes.  Full digits are shown here because this table is a check,
        not a result.
      </Text>
    </Box>
  );
}

function RecordsTable(): JSX.Element {
  const rows = [
    { what: "NaCl single-salt Pitzer", file: NACL.file,
      value: `β⁰ ${NACL.beta0}, β¹ ${NACL.beta1}, Cφ ${NACL.Cphi}; T form ${NACL.tForm}`, source: NACL.source },
    { what: "KCl single-salt Pitzer", file: KCL.file,
      value: `β⁰ ${KCL.beta0}, β¹ ${KCL.beta1}, Cφ ${KCL.Cphi}; T form ${KCL.tForm}`, source: KCL.source },
    { what: "θ(K, Na)", file: THETA_CAT.file, value: String(THETA_CAT.value), source: THETA_CAT.source },
    { what: "ψ(K, Na, Cl)", file: PSI_CAT.file, value: String(PSI_CAT.value), source: PSI_CAT.source },
    { what: `halite K_sp`, file: KSP_NACL.file,
      value: `logK25 ${KSP_NACL.logK25}, dH ${KSP_NACL.dH} J/mol (calorimetric ΔH_sol ${KSP_NACL.calorimetricDH ?? "—"} J/mol)`,
      source: KSP_NACL.source },
    { what: `sylvite K_sp`, file: KSP_KCL.file,
      value: `logK25 ${KSP_KCL.logK25}, dH ${KSP_KCL.dH} J/mol (calorimetric ΔH_sol ${KSP_KCL.calorimetricDH ?? "—"} J/mol)`,
      source: KSP_KCL.source },
  ];
  const s = useSortable(rows, { what: (r) => r.what, file: (r) => r.file });
  return (
    <Box data-table="records">
      <OriginMark of="reference" note="the catalogue records, read as the engine reads them (import.meta.glob of the same files)" />
      <Table withTableBorder fz="xs" mt={4}>
        <Table.Thead><Table.Tr><SortTh s={s} k="what">record</SortTh><SortTh s={s} k="file">file</SortTh>
          <Table.Th>values</Table.Th><Table.Th>source it names</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {s.rows.map((r) => (
            <Table.Tr key={r.what}><Table.Td>{r.what}</Table.Td><Table.Td ff="monospace">{r.file}</Table.Td>
              <Table.Td>{r.value}</Table.Td><Table.Td>{r.source}</Table.Td></Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

function KspTable(): JSX.Element {
  const rows = [293.15, 298.15, 323.15, 343.15].flatMap((T) => (["NaCl", "KCl"] as const).map((s) => ({
    key: `${s}-${T}`, salt: s, T,
    lnCat: lnKspCatalogue(s, T), lnMeas: lnKspMeasured(s, T),
    mCat: binaryFromKsp(s, T, lnKspCatalogue(s, T)), mMeas: measuredBinaryMolality(s, T),
  })));
  const st = useSortable(rows, { salt: (r) => r.salt, T: (r) => r.T,
    dev: (r) => 100 * (r.mCat - r.mMeas) / r.mMeas });
  return (
    <Box data-table="ksp">
      <OriginMark of={["page", "reference"]}
        note="catalogue: logK25 and dH of the solid phase; measured: Farelo et al. 1993 Table 2 with the single-salt γ± of this page" />
      <Table withTableBorder fz="xs" mt={4}>
        <Table.Thead><Table.Tr><SortTh s={st} k="salt">salt</SortTh><SortTh s={st} k="T">T [K]</SortTh>
          <Table.Th>log₁₀ K_sp, catalogue</Table.Th><Table.Th>log₁₀ K_sp, from the measured binary</Table.Th>
          <Table.Th>binary m from the catalogue K_sp [mol/kg]</Table.Th><Table.Th>measured binary m [mol/kg]</Table.Th>
          <SortTh s={st} k="dev">deviation [%]</SortTh></Table.Tr></Table.Thead>
        <Table.Tbody>
          {st.rows.map((r) => (
            <Table.Tr key={r.key}><Table.Td>{r.salt}</Table.Td><Table.Td>{g(r.T)}</Table.Td>
              <Table.Td>{g(r.lnCat / Math.LN10)}</Table.Td><Table.Td>{g(r.lnMeas / Math.LN10)}</Table.Td>
              <Table.Td>{g(r.mCat)}</Table.Td><Table.Td>{g(r.mMeas)}</Table.Td>
              <Table.Td>{g(100 * (r.mCat - r.mMeas) / r.mMeas)}</Table.Td></Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

function DataTable({ model, fitRep }: { model: ModelId; fitRep: ReturnType<typeof fitAt> }): JSX.Element {
  const rows = useMemo(() => rowPredictions(model, fitRep), [model, fitRep]);
  const s = useSortable(rows, {
    table: (r) => r.row.src.table, T: (r) => r.row.T, other: (r) => r.row.src.otherGkg,
    meas: (r) => r.row.src.satGkg, pred: (r) => r.predGkg, err: (r) => r.errGkg,
    delta: (r) => r.row.src.delta, win: (r) => (r.inWindow ? 0 : 1),
  });
  return (
    <Box data-table="rows">
      <OriginMark of={["reference", "page"]}
        note="measured and Δ: Farelo et al. 1993, Tables 3 and 4 (p. 143), as published; prediction: this page, with the model chosen above" />
      <Box style={{ maxHeight: 360, overflowY: "auto" }} mt={4}>
        <Table withTableBorder fz="xs" stickyHeader>
          <Table.Thead><Table.Tr>
            <SortTh s={s} k="table">table</SortTh><SortTh s={s} k="T">T [K]</SortTh>
            <SortTh s={s} k="other">other salt [g/kg]</SortTh><SortTh s={s} k="meas">measured [g/kg]</SortTh>
            <SortTh s={s} k="pred">predicted [g/kg]</SortTh><SortTh s={s} k="err">pred − meas [g/kg]</SortTh>
            <SortTh s={s} k="delta">Farelo Δ (exp − calc) [g/kg]</SortTh><SortTh s={s} k="win">fit window</SortTh>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {s.rows.map((r, i) => (
              <Table.Tr key={i}>
                <Table.Td>{r.row.src.table} ({r.row.src.sat})</Table.Td><Table.Td>{r.row.T}</Table.Td>
                <Table.Td>{r.row.src.otherGkg}</Table.Td><Table.Td>{r.row.src.satGkg}</Table.Td>
                <Table.Td>{g(r.predGkg)}</Table.Td><Table.Td>{g(r.errGkg)}</Table.Td>
                <Table.Td>{r.row.src.delta}</Table.Td><Table.Td>{r.inWindow ? "in-sample" : "held out"}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
    </Box>
  );
}

// ---- the page --------------------------------------------------------------------

export function SaltMixingTool(): JSX.Element {
  const [Tfit, setTfit] = useState<number>(FIT_TEMPERATURES[0]);
  const [fitPsi, setFitPsi] = useState(true);
  const [model, setModel] = useState<ModelId>("fit");
  const [Tiso, setTiso] = useState(298.15);
  const fitRep = useMemo(() => fitAt(Tfit, fitPsi), [Tfit, fitPsi]);
  const f = fitRep.fit;
  const scores = useMemo(() => scoreModels(fitRep), [fitRep]);
  const fitScore = scores.find((x) => x.id === "fit")!;

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Box style={{ maxWidth: 1100, display: "flex", flexDirection: "column", gap: 16 }}>
        <Box>
          <Title order={3}>Salt mixtures: Pitzer mixing parameters from ternary solubility</Title>
          <Text size="sm" c="dimmed" mt={2}>
            NaCl + KCl + water, 293-345 K.  The single-salt parameters come from the catalogue;
            the measured solubilities of Farelo, von Brachel &amp; Offermann (1993) then fix the
            two parameters only a mixture can show.
          </Text>
          <Box mt={8}><MomentsNav /></Box>
        </Box>

        <Moment id="understand">
          {step(1)}{step(2)}{step(3)}{step(4)}{step(5)}
        </Moment>

        <Moment id="experiment">
          <Card id="binary" title="First: the binary solubilities, from a K_sp record and from the measurement">
            <OriginMark of={["page", "reference"]}
              note="points and dotted lines: Farelo et al. 1993 Tables 1 and 2; solid lines: the catalogue K_sp (logK25, van't Hoff dH) solved with the catalogue's single-salt Pitzer on this page" />
            <BinaryFigure />
            <Text size="xs" c="dimmed">
              Above 300 K the catalogue's sylvite constant, carried by a van&apos;t Hoff enthalpy of{" "}
              {KSP_KCL.dH} J/mol, falls away from the measured KCl solubility; its own record lists a
              calorimetric dissolution enthalpy of {KSP_KCL.calorimetricDH ?? "—"} J/mol.  The ternary
              work below therefore anchors K_sp(T) on the measured binary (step 4, second route).
            </Text>
          </Card>

          <CommonIonPrediction model={model} fitRep={fitRep} />

          <Card id="fit" title="Fit θ and ψ to one temperature">
            <Group gap={12} align="flex-end" wrap="wrap">
              <Box>
                <Text size="xs" mb={2}>fit to the rows within ±{FIT_HALF_WIDTH} K of</Text>
                <SegmentedControl size="xs" value={String(Tfit)} onChange={(v) => setTfit(Number(v))}
                  data={FIT_TEMPERATURES.map((t) => ({ label: `${t} K`, value: String(t) }))} />
              </Box>
              <Checkbox size="xs" label="fit ψ as well as θ" checked={fitPsi}
                onChange={(e) => setFitPsi(e.currentTarget.checked)} />
              <Box>
                <Text size="xs" mb={2}>model drawn in the figures</Text>
                <SegmentedControl size="xs" value={model} onChange={(v) => setModel(v as ModelId)}
                  data={MODELS.map((m) => ({ label: m.label, value: m.id }))} />
              </Box>
            </Group>
            <Box mt={8} data-fit-result="">
              <OriginMark of={["page", "reference", "assumption"]}
                note={`fitted on this page to ${f.n} measured rows (Farelo et al. 1993, Tables 3-4); the window and whether ψ is fitted are your choices`} />
              <Text size="sm" mt={4}>
                θ = <b>{g(f.theta)}</b> kg/mol, ψ = <b>{f.fitPsi ? g(f.psi) : "0 (not fitted)"}</b> kg²/mol²
                {f.corr !== null && <> · correlation of the two estimates {g(f.corr)}</>}
              </Text>
              <Text size="sm">
                in-sample rms (the {fitScore.window.n} rows it was fitted to): <b>{g(fitScore.window.rms)}</b> g/kg ·
                held-out rms (the {fitScore.outside.n} rows at other temperatures): <b>{g(fitScore.outside.rms)}</b> g/kg,
                bias {g(fitScore.outside.bias)} g/kg
              </Text>
              <Text size="xs" c="dimmed" mt={2}>
                A mixing parameter fitted to one salt pair at one temperature is in-sample there:
                its small error at {g(Tfit)} K says only that two numbers can follow {f.n} points.
                The held-out rows are the only ones that could have contradicted it.  Farelo et
                al. report an experimental reproducibility of ±0.6 g/kg.
              </Text>
            </Box>
            <Box mt={8}><ModelTable fitRep={fitRep} /></Box>
            <Box mt={8}>
              <OriginMark of="reference" note="literature values found in ~/Choupo-Literature" />
              <Table withTableBorder fz="xs" mt={4}>
                <Table.Thead><Table.Tr><Table.Th>system</Table.Th><Table.Th>θ</Table.Th><Table.Th>ψ</Table.Th>
                  <Table.Th>basis</Table.Th><Table.Th>where read</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {LITERATURE_MIXING.map((l) => (
                    <Table.Tr key={l.system}><Table.Td>{l.system}</Table.Td><Table.Td>{l.theta}</Table.Td>
                      <Table.Td>{l.psi}</Table.Td><Table.Td>{l.basis}, {l.T}</Table.Td><Table.Td>{l.where}</Table.Td></Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>
            <Box mt={8}><BranchFigures model={model} fitRep={fitRep} /></Box>
            <Box mt={8}><ResidualFigure model={model} fitRep={fitRep} /></Box>
          </Card>

          <EutonicPrediction model={model} fitRep={fitRep} T={Tiso} setT={setTiso} />
          <SixSystemsPrediction />
          <DesignCard model={model} fitRep={fitRep} />
        </Moment>

        <Moment id="verify">
          <Card id="engine" title="The page's γ beside the engine's">
            <EngineTable />
          </Card>
          <Card id="ksp" title="Where each K_sp comes from">
            <KspTable />
          </Card>
          <Card id="records" title="The catalogue records this page reads">
            <RecordsTable />
          </Card>
          <Card id="rows" title="Every measured row, with the chosen model">
            <DataTable model={model} fitRep={fitRep} />
          </Card>
          <Box px="sm" py="xs" data-card="sources"
            style={{ border: `1px solid ${BORDER}`, borderRadius: 6,
              borderLeft: "3px solid var(--mantine-color-accent-5)" }}>
            <Title order={5} mb={4}>Sources of the measured data</Title>
            <Text size="xs">{FARELO_1993.cite} doi:{FARELO_1993.doi}.  Tables 1-4, pp. 142-143;
              Table 2 constants {FARELO_TABLE2.NaCl.c.join(", ")} (NaCl) and {FARELO_TABLE2.KCl.c.join(", ")} (KCl).
              Read from {FARELO_1993.file}.</Text>
            <Text size="xs" mt={4}>{FARELO_2005.cite} doi:{FARELO_2005.doi}.  Tables 1, 2, 5, 6, 8 and 9,
              pp. 1471-1473, rows between 295 and 301 K.  Read from {FARELO_2005.file}.</Text>
            <Text size="xs" c="dimmed" mt={4}>Each table was extracted with pdftotext and every row
              checked against the rendered page; one text-layer misreading was corrected (1993 Table 4,
              first row, Δ = 0.27, not 0.21).</Text>
          </Box>
          <LessonLimits limits={SALT_MIXING_LIMITS} title="What this page assumes" />
          <LessonReferences tool="salt-mixing" />
        </Moment>
      </Box>
    </Box>
  );
}
