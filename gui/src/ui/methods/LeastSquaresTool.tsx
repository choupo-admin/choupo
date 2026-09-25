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
  LeastSquaresTool -- what a fitted parameter is worth, on one real fit.

  EVERY NUMBER ON THIS PAGE IS THE ENGINE'S.  The page runs
  `props/curation/curate02_vle_heldout_ethanol_water` in the browser under
  `choupoProps` and draws three things the run publishes: its own
  `fit_history.csv` (the Levenberg-Marquardt trace), its own `parity.csv` (the
  fitted points against the model), and the operation's `diagnostics` +
  `curation` objects (the held-out deviation, the identifiability statistics
  and the VERDICT).  Nothing is recomputed here -- see the header of
  `leastSquaresRun.ts` for why this page, unlike its three neighbours on the
  numerics shelf, carries no transcription of its own.

  THREE PANELS, IN THE ORDER THE CONTRACT RUNS.

  THE SEARCH shows the optimiser doing its work: chi2 falling, lambda being
  repriced up and down, the parameters wandering.  Its two knobs are the
  damping and the iteration ceiling, and the honest lesson there is that they
  move the PATH a great deal and the ANSWER very little -- on this problem,
  from this start.

  THE VERDICT shows the half a numerical-methods course does not teach.  Its
  one knob is the acceptance band, and turning it flips a published word while
  the residual underneath does not move by so much as a digit.  That is the
  page's whole argument made visible: the verdict is a JUDGEMENT the band
  carries, which is exactly why the band must be declared before the fit and
  not after.  The panel says so in as many words, because a knob that lets a
  reader do the forbidden thing must name it as forbidden.

  IDENTIFIABILITY shows that this fit is `validated` and NOT individually
  identifiable at the same time.  Two questions, two answers, one run.

  ACCESSIBILITY.  Both drawings have a table or a worded readout beside them
  and neither carries information in colour alone; the verdict is a word.

  WHAT WAS VERIFIED WHEN THIS PAGE WAS WRITTEN, AND WHAT WAS NOT.  The witness
  runs to exit 0 under the NATIVE `choupoProps`, and it runs SEALED: with
  `CHOUPO_HOME` unset and no catalogue reachable it produces the same answer to
  the last digit, because the case carries its own component records.  Its
  evidence lives in `constant/experiments/`, which the bundle's glob includes
  and the browser worker mkdir-p's into MEMFS; it is a `choupoProps` case,
  which `useMethodRun` dispatches; and both CSVs this page reads are `.csv`
  files at the case root, which the worker's harvest collects.  The catalogue
  marks it with no `unsupportedReason`, and `tests/leastSquaresRun.test.ts`
  pins each of those facts.  WHAT COULD NOT BE CHECKED is the last link: no
  emscripten toolchain was available, so nobody has watched this page fetch a
  `.wasm` and come back with an answer.  If that link is broken the page says
  so in words and draws nothing in place of the engine -- which is the correct
  failure and not a substitute for having run it.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Group, Loader, Stack, Table, Text, Title,
} from "@mantine/core";

import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { useNarrowViewport } from "./methodsChrome.js";
import { LS_LIMITS, LS_STEPS } from "./leastSquaresLesson.js";
import { KnobSlider, PanelNote, type PanelKnob } from "./knobPanel.js";
import { useMethodRun } from "../../case/methodRun.js";
import {
  LS_BAND_DEFAULT_PCT, LS_FIT_LOG, LS_LAMBDA0_DEFAULT_EXP,
  LS_MAXITER_DEFAULT, LS_OP, LS_PARITY, LS_WITNESS,
  dampingMove, evidenceLines, lambda0Of, lsOverrides, readFitHistory,
  readParity,
  type FitHistory, type ParityRow,
} from "./leastSquaresRun.js";

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const CHI = "#26c6da";
const LAM = "#ffb74d";
const MEAS = "#90a4ae";
const MODEL = "#ce93d8";

const VW = 460, VH = 300, PAD = 46;

const fmt = (v: number, d = 4): string =>
  Number.isFinite(v) ? v.toFixed(d) : "—";

const sci = (v: number, d = 3): string =>
  Number.isFinite(v) ? v.toExponential(d) : "—";

// ---- Knobs ------------------------------------------------------------------

const LAMBDA: PanelKnob = {
  id: "lambda0", label: "starting damping, as a power of ten",
  min: -6, max: 4, step: 1,
  why: "The dict declares lambda0; this knob writes 10 to that power into it. "
    + "Small is nearly Gauss-Newton and, on this well-behaved problem from "
    + "this start, converges in a handful of iterations. Large is a short "
    + "cautious step down the gradient and costs many more. Push it far "
    + "enough and the search runs out of iterations before it arrives — and "
    + "watch what that does, and does not do, to the verdict below.",
};
const MAXITER: PanelKnob = {
  id: "maxIter", label: "iteration ceiling", min: 5, max: 120, step: 5,
  why: "How many Levenberg-Marquardt iterations the operation may spend. "
    + "Reaching it is not an error and the engine does not pretend it is: it "
    + "reports `max iters reached` and publishes the parameters it had. A "
    + "reader has to decide what that answer is worth.",
};
const BAND: PanelKnob = {
  id: "maxAAD", label: "acceptance band on the held-out deviation",
  min: 0.02, max: 0.5, step: 0.01, unit: "percent",
  why: "The criterion the case declares BEFORE the fit, with the reason it "
    + "was set where it was. Turning it here changes the published verdict "
    + "without moving the residual by a digit — which is the one thing this "
    + "page wants you to see, and the one thing a real curation must never "
    + "do.",
};

// ---- The Levenberg-Marquardt trace ------------------------------------------

/** chi2 and lambda against iteration, both on their own log decade scale.
 *  Two quantities of wildly different magnitude share one frame, so each gets
 *  its own axis label in words and the table below carries the numbers. */
function TracePlot({ hist }: { hist: FitHistory }): JSX.Element {
  const rows = hist.rows;
  const nMax = rows[rows.length - 1]!.iter;
  const logs = (pick: (r: typeof rows[number]) => number): number[] =>
    rows.map((r) => Math.log10(Math.max(pick(r), 1e-30)));
  const lc = logs((r) => r.chi2);
  const ll = logs((r) => r.lambda);
  const lo = Math.min(...lc, ...ll);
  const hi = Math.max(...lc, ...ll);
  const span = hi - lo < 1e-9 ? 1 : hi - lo;

  const X = (i: number): number =>
    PAD + (VW - 2 * PAD) * (nMax === 0 ? 0 : i / nMax);
  const Y = (v: number): number =>
    VH - PAD - (VH - 2 * PAD) * ((v - lo) / span);

  const path = (vals: number[]): string =>
    vals.map((v, k) => `${k === 0 ? "M" : "L"}${X(rows[k]!.iter)},${Y(v)}`)
      .join(" ");

  const decades: number[] = [];
  for (let d = Math.ceil(lo); d <= Math.floor(hi); ++d) decades.push(d);

  return (
    <Box style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%"
        style={{ maxWidth: VW, display: "block" }}
        role="img"
        aria-label={"Levenberg-Marquardt trace: chi-squared and the damping "
          + "against iteration number, both on a logarithmic scale"}>
        {decades.map((d) => (
          <g key={d}>
            <line x1={PAD} x2={VW - PAD} y1={Y(d)} y2={Y(d)}
              stroke={GRID} strokeWidth={0.5} />
            <text x={PAD - 6} y={Y(d) + 3} fontSize={9} fill={INK}
              textAnchor="end">1e{d}</text>
          </g>
        ))}
        <line x1={PAD} x2={VW - PAD} y1={VH - PAD} y2={VH - PAD}
          stroke={GRID} />
        <text x={VW / 2} y={VH - 10} fontSize={10} fill={INK}
          textAnchor="middle">iteration (0 = the declared starting guess)</text>
        <path d={path(lc)} fill="none" stroke={CHI} strokeWidth={2} />
        <path d={path(ll)} fill="none" stroke={LAM} strokeWidth={2}
          strokeDasharray="5 3" />
        <text x={PAD + 4} y={16} fontSize={10} fill={CHI}>
          chi2 (solid)
        </text>
        <text x={PAD + 4} y={30} fontSize={10} fill={LAM}>
          lambda (dashed)
        </text>
      </svg>
    </Box>
  );
}

// ---- The fitted points ------------------------------------------------------

/** Bubble temperature against composition, for the FITTED points only.
 *  Measured as open circles, the model's own answer as crosses. */
function ParityPlot({ rows }: { rows: readonly ParityRow[] }): JSX.Element {
  const ts = rows.flatMap((r) => [r.T_exp, r.T_model])
    .filter(Number.isFinite);
  const tLo = Math.min(...ts) - 0.6, tHi = Math.max(...ts) + 0.6;
  const X = (x: number): number => PAD + (VW - 2 * PAD) * x;
  const Y = (t: number): number =>
    VH - PAD - (VH - 2 * PAD) * ((t - tLo) / Math.max(tHi - tLo, 1e-9));

  return (
    <Box style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%"
        style={{ maxWidth: VW, display: "block" }}
        role="img"
        aria-label={"Bubble temperature against ethanol mole fraction for the "
          + "eight fitted points: the measurement and the model's answer"}>
        <line x1={PAD} x2={VW - PAD} y1={VH - PAD} y2={VH - PAD}
          stroke={GRID} />
        <line x1={PAD} x2={PAD} y1={PAD} y2={VH - PAD} stroke={GRID} />
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((x) => (
          <text key={x} x={X(x)} y={VH - PAD + 14} fontSize={9} fill={INK}
            textAnchor="middle">{x.toFixed(1)}</text>
        ))}
        <text x={VW / 2} y={VH - 10} fontSize={10} fill={INK}
          textAnchor="middle">x1, mole fraction of ethanol in the liquid</text>
        <text x={12} y={VH / 2} fontSize={10} fill={INK}
          transform={`rotate(-90 12 ${VH / 2})`}
          textAnchor="middle">bubble temperature / K</text>
        {rows.map((r, k) => (
          <circle key={`m${k}`} cx={X(r.x1)} cy={Y(r.T_exp)} r={4}
            fill="none" stroke={MEAS} strokeWidth={1.6} />
        ))}
        {rows.filter((r) => Number.isFinite(r.T_model)).map((r, k) => (
          <g key={`p${k}`} stroke={MODEL} strokeWidth={1.6}>
            <line x1={X(r.x1) - 4} x2={X(r.x1) + 4}
              y1={Y(r.T_model) - 4} y2={Y(r.T_model) + 4} />
            <line x1={X(r.x1) - 4} x2={X(r.x1) + 4}
              y1={Y(r.T_model) + 4} y2={Y(r.T_model) - 4} />
          </g>
        ))}
        <text x={PAD + 4} y={16} fontSize={10} fill={MEAS}>
          measured (circles)
        </text>
        <text x={PAD + 4} y={30} fontSize={10} fill={MODEL}>
          the fitted model (crosses)
        </text>
      </svg>
    </Box>
  );
}

// ---- The tool ---------------------------------------------------------------

export function LeastSquaresTool(): JSX.Element {
  const step = lessonStepper(LS_STEPS);
  const narrow = useNarrowViewport();
  const rail = narrow ? "1fr" : "minmax(190px, 240px) 1fr";

  const [bandPct, setBandPct] = useState(LS_BAND_DEFAULT_PCT);
  const [lamExp, setLamExp] = useState(LS_LAMBDA0_DEFAULT_EXP);
  const [maxIter, setMaxIter] = useState(LS_MAXITER_DEFAULT);

  //  ONE run feeds all three panels: the three knobs pose ONE question and
  //  the engine answers it once.
  const overrides = lsOverrides(bandPct, lamExp, maxIter);
  const run = useMethodRun(
    LS_WITNESS, overrides,
    JSON.stringify([bandPct, lamExp, maxIter]), "choupoProps");

  const op = run.result?.operationResults?.find((o) => o.name === LS_OP);
  const diag = op?.diagnostics;
  const cur = op?.curation;

  const hist = useMemo(() => {
    const csv = run.result?.csvFiles?.[LS_FIT_LOG];
    return csv ? readFitHistory(csv) : null;
  }, [run.result]);
  const parity = useMemo(() => {
    const csv = run.result?.csvFiles?.[LS_PARITY];
    return csv ? readParity(csv) : null;
  }, [run.result]);
  const evidence = evidenceLines(run.log);

  const nParams = diag?.["n_params"];
  const paramRows = useMemo(() => {
    if (!diag || !hist?.ok) return [];
    const out: { path: string; value: number; ci: number; atBound: boolean }[]
      = [];
    hist.read.paramPaths.forEach((path, j) => {
      const v = diag[`fit.${j}.value`];
      if (v === undefined) return;
      out.push({
        path,
        value: v,
        ci: diag[`fit.${j}.ci95`] ?? NaN,
        atBound: (diag[`fit.${j}.at_bound`] ?? 0) > 0.5,
      });
    });
    return out;
  }, [diag, hist]);

  const corrPairs = useMemo(() => {
    if (!diag || !hist?.ok) return [];
    const n = hist.read.paramPaths.length;
    const out: { a: number; b: number; rho: number }[] = [];
    for (let i = 0; i < n; ++i)
      for (let j = i + 1; j < n; ++j) {
        const v = diag[`corr.${i}.${j}`];
        if (v !== undefined) out.push({ a: i, b: j, rho: v });
      }
    return out;
  }, [diag, hist]);

  const busyNote = run.busy
    ? (
      <Group gap={6}><Loader size="xs" />
        <Text size="xs" c="dimmed">fitting…</Text></Group>
    )
    : null;

  const runFailed = run.err
    ? (
      <Alert color="red" title="The run did not finish">
        <Text size="sm">{run.err}</Text>
      </Alert>
    )
    : null;

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>

        <Box>
          <Title order={3}>
            Least squares: what a fitted parameter is worth
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            Levenberg-Marquardt is the easy half. A search that ends with small
            residuals has shown you that the model can reproduce the points it
            was handed, which is a statement about the model&apos;s flexibility
            before it is a statement about anything else. The half that makes a
            fitted parameter worth quoting is the apparatus around the
            optimiser: evidence withheld before the fit, a band declared before
            the fit, and a verdict published as a word. Choupo carries all of
            it, and every number below comes out of one run of one case in your
            browser.
          </Text>
        </Box>

        {step(1)}
        {step(2)}
        {step(3)}
        {step(4)}
        {step(5)}
        {step(6)}

        {/* ---------------- THE SEARCH ---------------- */}
        <Box style={{ borderLeft: `3px solid ${LAM}`, paddingLeft: 12 }}>
          <Title order={4}>The search, watched running</Title>
          <Text size="sm" mt={4}>
            Everything from here down is one run of{" "}
            <Text span ff="monospace" size="xs">
              tutorials/{LS_WITNESS}
            </Text>
            : eight measured ethanol/water bubble temperatures at atmospheric
            pressure, four NRTL coefficients, and three more measurements the
            fitter is never handed. The trace below is the engine&apos;s own{" "}
            <Text span ff="monospace" size="xs">{LS_FIT_LOG}</Text>, one row
            per iteration — nothing on this page recomputes the optimiser.
          </Text>
        </Box>

        <Box style={{ display: "grid", gap: 16, gridTemplateColumns: rail }}>
          <Stack gap={8}>
            <KnobSlider knob={LAMBDA} value={lamExp} showWhy
              onChange={setLamExp} />
            <KnobSlider knob={MAXITER} value={maxIter} showWhy
              onChange={setMaxIter} />
            {busyNote}
            <PanelNote>
              The damping knob writes{" "}
              <Text span ff="monospace" size="xs">
                lambda0 {lambda0Of(lamExp).toExponential(0)}
              </Text>{" "}
              into the case&apos;s own{" "}
              <Text span ff="monospace" size="xs">system/propsDict</Text>, and
              the ceiling writes{" "}
              <Text span ff="monospace" size="xs">maxIter</Text>. Both are
              declared options of the operation; neither is invented here.
            </PanelNote>
          </Stack>

          <Stack gap={10}>
            {runFailed}
            {hist?.ok ? (
              <>
                <TracePlot hist={hist.read} />
                <Group gap="xs" wrap="wrap">
                  <Badge variant="light"
                    color={(diag?.["converged"] ?? 0) > 0.5 ? "teal" : "orange"}>
                    {(diag?.["converged"] ?? 0) > 0.5
                      ? "converged" : "max iters reached"}
                  </Badge>
                  <Badge variant="outline">
                    {diag?.["iter"] ?? "—"} iterations
                  </Badge>
                  <Badge variant="outline">
                    chi2 {sci(diag?.["chi2"] ?? NaN)} K²
                  </Badge>
                  <Badge variant="outline">
                    rms {fmt(diag?.["rms"] ?? NaN, 4)} K
                  </Badge>
                  <Badge variant="outline">
                    reduced chi2 {sci(diag?.["chi2_reduced"] ?? NaN)}
                  </Badge>
                </Group>
                <Text size="sm">
                  Read the dashed line. Where it steps DOWN by a factor of 0.7
                  the step was accepted and the linearisation earned a little
                  more trust; where it jumps UP by 2.5 the step made the
                  objective worse, was thrown away, and only the damping moved.
                  The solid line is the objective, and it never rises — a
                  rejected step is not taken.
                </Text>
                <Box style={{ width: "100%", overflowX: "auto" }}>
                  <Table striped withTableBorder fz="xs" miw={560}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>iteration</Table.Th>
                        <Table.Th>chi2 / K²</Table.Th>
                        <Table.Th>lambda</Table.Th>
                        <Table.Th>what it did</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {hist.read.rows.map((r, k) => {
                        const prev = hist.read.rows[k - 1];
                        const what = !prev ? "the declared starting guess"
                          : dampingMove(prev.lambda, r.lambda);
                        return (
                          <Table.Tr key={r.iter}>
                            <Table.Td ff="monospace">{r.iter}</Table.Td>
                            <Table.Td ff="monospace">{sci(r.chi2, 5)}</Table.Td>
                            <Table.Td ff="monospace">{sci(r.lambda, 2)}</Table.Td>
                            <Table.Td>{what}</Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Box>
              </>
            ) : !run.busy && !run.err ? (
              <Text size="sm" c="dimmed">
                This run published no fit history, so there is no trace to
                draw. {hist && !hist.ok ? hist.why : ""} The page computes
                nothing in its place.
              </Text>
            ) : null}
          </Stack>
        </Box>

        {parity?.ok && (
          <Stack gap={10}>
            <ParityPlot rows={parity.read} />
            <Text size="sm">
              The eight points the fitter was handed, and where the finished
              model puts each of them. Look at the composition axis: there is
              nothing at 0.20, nothing at 0.50, nothing at 0.80. Those three
              compositions are not missing from the experiment — they were
              withheld from the fit before it started, and the next panel is
              what the model does on them.
            </Text>
            <Box style={{ width: "100%", overflowX: "auto" }}>
              <Table striped withTableBorder fz="xs" miw={520}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>x1</Table.Th>
                    <Table.Th>measured / K</Table.Th>
                    <Table.Th>model / K</Table.Th>
                    <Table.Th>residual / K</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {parity.read.map((r) => (
                    <Table.Tr key={r.x1}>
                      <Table.Td ff="monospace">{fmt(r.x1, 2)}</Table.Td>
                      <Table.Td ff="monospace">{fmt(r.T_exp, 2)}</Table.Td>
                      <Table.Td ff="monospace">{fmt(r.T_model, 3)}</Table.Td>
                      <Table.Td ff="monospace">{fmt(r.residual, 4)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>
          </Stack>
        )}

        {step(7)}
        {step(8)}
        {step(9)}

        {/* ---------------- THE VERDICT ---------------- */}
        <Box style={{ borderLeft: `3px solid ${CHI}`, paddingLeft: 12 }}>
          <Title order={4}>
            The verdict, and the band it is a judgement against
          </Title>
          <Text size="sm" mt={4}>
            The same run, asked the other question. The engine ran the finished
            parameters over the three withheld measurements, compared the
            deviation with the band the case declared, and published a word.
            The band knob below is here to make ONE point and it is a point
            about method, not about ethanol: turn it and the word changes while
            the deviation does not move at all. That is why a real curation
            declares the band before the fit and leaves it alone — and why the
            case states, in its own dict, the reason its band is where it is.
          </Text>
        </Box>

        <Box style={{ display: "grid", gap: 16, gridTemplateColumns: rail }}>
          <Stack gap={8}>
            <KnobSlider knob={BAND} value={bandPct} showWhy
              onChange={setBandPct} />
            {busyNote}
            <PanelNote>
              It writes{" "}
              <Text span ff="monospace" size="xs">acceptance.maxAAD</Text> in
              the case&apos;s{" "}
              <Text span ff="monospace" size="xs">system/propsDict</Text>, in
              per cent, and nothing else. The held-out deviation beside it is
              the engine&apos;s.
            </PanelNote>
          </Stack>

          <Stack gap={10}>
            {cur ? (
              <>
                <Group gap="xs" wrap="wrap">
                  <Badge variant="filled"
                    color={cur["verdict"] === "validated" ? "teal"
                      : cur["verdict"] === "notValidated" ? "red" : "gray"}>
                    verdict: {cur["verdict"] ?? "—"}
                  </Badge>
                  <Badge variant="outline">
                    held-out points {diag?.["n_heldout"] ?? "—"}
                  </Badge>
                  <Badge variant="outline">
                    AAD {fmt(diag?.["aad_heldout_pct"] ?? NaN, 4)} %
                    {" "}({fmt(diag?.["aad_heldout_K"] ?? NaN, 4)} K)
                  </Badge>
                  <Badge variant="outline">
                    band {cur["acceptanceMaxAADPct"] ?? "—"} %
                  </Badge>
                </Group>
                <Text size="sm">
                  The deviation is{" "}
                  <Text span ff="monospace">
                    {fmt(diag?.["aad_heldout_pct"] ?? NaN, 4)} %
                  </Text>{" "}
                  and the declared band is{" "}
                  <Text span ff="monospace">
                    {cur["acceptanceMaxAADPct"] ?? "—"} %
                  </Text>
                  , so the engine publishes{" "}
                  <Text span fw={700}>{cur["verdict"] ?? "—"}</Text>. The word
                  comes from five lines of the engine
                  (src/propertyOps/CurationDossier.cpp:59-63) and every sink —
                  this page, the console, the curation dossier and the
                  promotable record — reads that one word rather than deciding
                  for itself.
                </Text>
                {cur["acceptanceOrigin"] && (
                  <Box px="sm" py={6}
                    style={{ borderLeft: `3px solid ${GRID}` }}>
                    <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
                      why the band is where the case put it
                    </Text>
                    <Text size="sm">{cur["acceptanceOrigin"]}</Text>
                  </Box>
                )}
                {cur["partitionFingerprint"] && (
                  <Text size="xs" c="dimmed">
                    The partition was frozen before the fit and fingerprinted{" "}
                    <Text span ff="monospace">
                      {cur["partitionFingerprint"]}
                    </Text>
                    , so an edit to the declaration afterwards is detectable
                    rather than invisible.
                  </Text>
                )}
              </>
            ) : !run.busy && !run.err ? (
              <Text size="sm" c="dimmed">
                This run published no curation object, so there is no verdict
                to draw. The page does not compute one in its place — deciding
                whether a residual is small enough is a judgement, and it is
                the engine&apos;s to publish or nobody&apos;s.
              </Text>
            ) : null}

            {evidence.length > 0 && (
              <Box px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
                  what the run said about its own evidence
                </Text>
                {evidence.map((l, i) => (
                  <Text key={i} size="xs" ff="monospace"
                    style={{ whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere" }}>{l}</Text>
                ))}
              </Box>
            )}
          </Stack>
        </Box>

        {step(10)}

        {/* ---------------- IDENTIFIABILITY ---------------- */}
        {diag && paramRows.length > 0 && (
          <Stack gap={10}>
            <Group gap="xs" wrap="wrap">
              <Badge variant="filled"
                color={(diag["identifiable"] ?? 0) > 0.5 ? "teal" : "orange"}>
                {(diag["identifiable"] ?? 0) > 0.5
                  ? "parameters individually determined"
                  : "NOT individually identifiable"}
              </Badge>
              <Badge variant="outline">
                {diag["n_data"] ?? "—"} fitted points, {nParams ?? "—"}{" "}
                parameters, {diag["dof"] ?? "—"} degrees of freedom
              </Badge>
              <Badge variant="outline">
                cond(J&apos;J) {sci(diag["cond_JtJ"] ?? NaN, 2)}
              </Badge>
              <Badge variant="outline">
                t95 {fmt(diag["t_crit95"] ?? NaN, 3)}
              </Badge>
              <Badge variant="outline">
                max |correlation| {fmt(diag["max_abs_corr"] ?? NaN, 6)}
              </Badge>
            </Group>
            <Box style={{ width: "100%", overflowX: "auto" }}>
              <Table striped withTableBorder fz="xs" miw={620}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>parameter</Table.Th>
                    <Table.Th>fitted value</Table.Th>
                    <Table.Th>95 % interval</Table.Th>
                    <Table.Th>is the value bigger than its own interval?</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {paramRows.map((p) => (
                    <Table.Tr key={p.path}>
                      <Table.Td ff="monospace">
                        {p.path.split(".").slice(-1)[0]}
                      </Table.Td>
                      <Table.Td ff="monospace">{fmt(p.value, 4)}</Table.Td>
                      <Table.Td ff="monospace">± {fmt(p.ci, 4)}</Table.Td>
                      <Table.Td>
                        {Number.isFinite(p.ci)
                          ? (Math.abs(p.value) > Math.abs(p.ci)
                            ? "yes" : "no — the interval swallows it")
                          : "the interval could not be computed"}
                        {p.atBound ? "  (and it sits on its declared bound)"
                          : ""}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>
            {corrPairs.length > 0 && (
              <Box>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
                  how hard each pair of parameters trades off
                </Text>
                {corrPairs.map((c) => (
                  <Text key={`${c.a}.${c.b}`} size="xs" ff="monospace">
                    {hist?.ok
                      ? hist.read.paramPaths[c.a]?.split(".").slice(-1)[0]
                      : c.a}
                    {" / "}
                    {hist?.ok
                      ? hist.read.paramPaths[c.b]?.split(".").slice(-1)[0]
                      : c.b}
                    {"  "}{fmt(c.rho, 6)}
                    {Math.abs(c.rho) > 0.999
                      ? "   <-- the fit determines only their combination"
                      : ""}
                  </Text>
                ))}
              </Box>
            )}
            <Text size="sm">
              Read those two blocks together and then read the verdict again.
              This model PREDICTS measurements it never saw, and its four
              coefficients are not separately determined by the evidence it was
              given. Both are true, both come off the same run, and a reader
              who takes either one for the other has misread it.
            </Text>
          </Stack>
        )}

        {step(11)}

        <LessonLimits limits={LS_LIMITS} />
      </Stack>
    </Box>
  );
}
