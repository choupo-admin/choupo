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
  WegsteinTool — the accelerator that closes a recycle, with the two numbers
  that ARE the method put on screen, because no run in this tree prints them.

  TWO PANELS, AND THE PAGE SAYS WHICH IS WHICH AT THE TOP OF EACH.

  THE RECURSION panel drives `wegsteinStep` — a line-for-line transcription of
  src/solver/Wegstein.cpp:49-92 — over a two-variable map declared in full in
  wegsteinMath.  Everything a reader turns there is arithmetic they can check:
  the secant slope, the coefficient it produces, the clamp binding, and the
  three solvers' error curves on one axis.  It is a toy and the page says so
  in those words and again in the limits block.

  THE ENGINE panel runs `tutorials/steady/flowsheets/process03_recycle` in the
  browser with the solver and the tolerance written into its own solverDict,
  and draws the engine's own published per-iteration residual.  Nothing on
  that panel is computed here.

  WHY THE TABLE IS THE MAIN OBJECT AND THE PLOT IS BESIDE IT.  The owner's
  question was not "does Wegstein converge" — the guide answers that and plots
  it.  It was how ONE accelerator serves a vector holding a molar flow and a
  temperature at once.  That is answered by a table with one row per variable
  per iteration, showing that the two rows never meet: separate slopes,
  separate coefficients, separate updates.  The unit selector is there so the
  claim can be checked rather than believed — every coefficient is identical
  in all three unit systems, and the unscaled convergence norm beside them is
  not.

  ACCESSIBILITY.  The three error curves are told apart by DASH PATTERN and by
  a marker shape as well as by colour, and each is labelled at its own end;
  the clamp mark in the table is the word "clamped" and not a colour.  Colour
  never carries meaning alone here.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Group, Loader, SegmentedControl, Stack, Switch, Table,
  Text, Title,
} from "@mantine/core";

import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { useNarrowViewport } from "./methodsChrome.js";
import { WEGSTEIN_LIMITS, WEGSTEIN_STEPS } from "./wegsteinLesson.js";
import { KnobSlider, PanelNote, type PanelKnob } from "./knobPanel.js";
import { useMethodRun } from "../../case/methodRun.js";
import {
  DISPLAY_UNITS, RECYCLE_DEFAULTS, RECYCLE_QMAX_DEFAULT,
  RECYCLE_QMIN_DEFAULT, TOY_DEFAULTS, TOY_F_SEED, TOY_F_STAR, TOY_T_SEED,
  TOY_T_STAR, WEGSTEIN_WITNESS, WITNESS_TEAR,
  driveDirect, driveNewton, driveWegstein, recycleOverrides, recycleResidual,
  rescale, toyEigenvalues, toySpectralRadius,
  type DisplayUnits, type RecycleKnobs, type RecycleSolver, type SolveTrace,
  type ToyMap,
} from "./wegsteinMath.js";

/** The engine's own unit system, named once so no reader of this file has to
 *  know that it is the first entry of the list. */
const SI_UNITS: DisplayUnits = DISPLAY_UNITS[0] ?? {
  id: "si", label: "SI", scale: [1, 1], offset: [0, 0], names: ["kmol/s", "K"],
};

// ---- Drawing constants ------------------------------------------------------

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const DIRECT = "#ef9a9a";
const WEGSTEIN = "#ffb74d";
const NEWTON = "#64b5f6";
const MEASURED = "#26c6da";

const VW = 720;
const VH = 220;
const X0 = 56, X1 = VW - 96, Y0 = 16, Y1 = VH - 30;

const fmt = (v: number | null | undefined, d = 4): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(d);
const fmtExp = (v: number | null | undefined, d = 3): string =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "—" : v.toExponential(d);

/** A semilog-y error plot over an integer iteration axis.  Hand-drawn rather
 *  than reached through the plotting bundle: three short polylines and a
 *  decade grid do not justify pulling Plotly into this module. */
function ErrorPlot({ traces }: {
  traces: readonly { label: string; colour: string; dash: string;
    marker: "circle" | "square" | "triangle"; values: number[] }[];
}): JSX.Element {
  const all = traces.flatMap((t) => t.values)
    .filter((v) => v > 0 && Number.isFinite(v));
  const kMax = Math.max(4, ...traces.map((t) => t.values.length - 1));
  const hi = all.length > 0 ? Math.max(...all) : 1;
  const lo = all.length > 0 ? Math.min(...all) : 1e-10;
  const eHi = Math.ceil(Math.log10(hi));
  const eLo = Math.min(eHi - 2, Math.floor(Math.log10(Math.max(lo, 1e-14))));
  const x = (k: number) => X0 + ((X1 - X0) * k) / kMax;
  const y = (v: number) => {
    const e = Math.log10(Math.max(v, Math.pow(10, eLo)));
    return Y1 - ((Y1 - Y0) * (e - eLo)) / (eHi - eLo);
  };
  const decades: number[] = [];
  for (let e = eLo; e <= eHi; ++e) decades.push(e);
  const kTicks: number[] = [];
  const kStep = Math.max(1, Math.round(kMax / 8));
  for (let k = 0; k <= kMax; k += kStep) kTicks.push(k);
  return (
    <Box style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%"
        style={{ display: "block", minWidth: 320 }}
        role="img"
        aria-label={"Scaled distance to the fixed point against sweep number, "
          + "one curve per solver"}>
        {decades.map((e) => (
          <g key={e}>
            <line x1={X0} x2={X1} y1={y(Math.pow(10, e))} y2={y(Math.pow(10, e))}
              stroke={GRID} strokeWidth={1} strokeDasharray="2 4" />
            <text x={X0 - 6} y={y(Math.pow(10, e)) + 3} textAnchor="end"
              fontSize={9} fill={INK}>1e{e}</text>
          </g>
        ))}
        {kTicks.map((k) => (
          <text key={`k${k}`} x={x(k)} y={Y1 + 14} textAnchor="middle"
            fontSize={9} fill={INK}>{k}</text>
        ))}
        <line x1={X0} x2={X1} y1={Y1} y2={Y1} stroke={GRID} strokeWidth={1} />
        <text x={X0} y={Y1 + 26} fontSize={9} fill={INK}>
          sweep k (each is one full pass through the plant)
        </text>
        <text x={X0 - 48} y={Y0 - 4} fontSize={9} fill={INK}>
          distance to the answer (scaled)
        </text>
        {traces.map((t) => {
          const pts = t.values
            .map((v, k) => (v > 0 && Number.isFinite(v)
              ? `${x(k).toFixed(1)},${y(v).toFixed(1)}` : ""))
            .filter(Boolean).join(" ");
          const last = t.values.length - 1;
          const lastV = t.values[last] ?? 0;
          return (
            <g key={t.label}>
              <polyline points={pts} fill="none" stroke={t.colour}
                strokeWidth={2} strokeDasharray={t.dash} />
              {t.values.map((v, k) => (v > 0 && Number.isFinite(v) ? (
                t.marker === "circle"
                  ? <circle key={k} cx={x(k)} cy={y(v)} r={2.6} fill={t.colour} />
                  : t.marker === "square"
                  ? <rect key={k} x={x(k) - 2.4} y={y(v) - 2.4} width={4.8}
                      height={4.8} fill={t.colour} />
                  : <polygon key={k} fill={t.colour}
                      points={`${x(k)},${y(v) - 3} ${x(k) - 3},${y(v) + 2.4} `
                        + `${x(k) + 3},${y(v) + 2.4}`} />
              ) : null))}
              {last >= 0 && lastV > 0 && (
                <text x={Math.min(x(last) + 6, X1 + 4)} y={y(lastV) + 3}
                  fontSize={9} fill={t.colour}>{t.label}</text>
              )}
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

// ---- Knobs ------------------------------------------------------------------

const GAIN_F: PanelKnob = {
  id: "a", label: "loop gain on the FLOW", min: 0, max: 0.98, step: 0.01,
  why: "How much of a disturbance in the assumed recycle flow survives one "
    + "pass round the loop. Near 1 is a plant that recycles most of what it "
    + "makes, and it is what makes direct substitution crawl.",
};
const GAIN_T: PanelKnob = {
  id: "b", label: "loop gain on the TEMPERATURE", min: 0, max: 0.98, step: 0.01,
  why: "The same, for the temperature direction. The two are independent "
    + "until the coupling below is turned up — which is the whole point of "
    + "the panel.",
};
const COUPLE: PanelKnob = {
  id: "c", label: "coupling between them", min: 0, max: 0.4, step: 0.01,
  why: "How much a disturbance in the flow comes back as a disturbance in "
    + "the temperature, and the reverse. Wegstein's per-variable secants "
    + "cannot see it; Newton's Jacobian is exactly this number.",
};
const QMIN: PanelKnob = {
  id: "qmin", label: "clamp floor q_min", min: -8, max: 0, step: 0.1,
  why: "The most negative coefficient allowed. 0 collapses the clamp to a "
    + "point and Wegstein becomes direct substitution; -1 is the engine's "
    + "recycle default; -5 is the Wegstein class default the Theory Guide "
    + "quotes.",
};
const QMAX: PanelKnob = {
  id: "qmax", label: "clamp ceiling q_max", min: 0, max: 0.9, step: 0.05,
  why: "Zero in every shipped case, and it is what forbids a step in the "
    + "wrong direction. Raise it to let a positive coefficient through and "
    + "watch what a secant slope above 1 does when nothing stops it.",
};
const TOL: PanelKnob = {
  id: "tol", label: "recycleTol", min: -9, max: -3, step: 1,
  why: "The engine's declared tear tolerance, as a power of ten. Tighten it "
    + "and the outer loop takes more sweeps; loosen it far enough and the "
    + "run stops while the recycle is still visibly moving.",
};
const MAXIT: PanelKnob = {
  id: "maxit", label: "recycleMaxIter", min: 2, max: 120, step: 1,
  why: "The cap. Exceeding it is a FAILED solve in Choupo, not a warning: "
    + "the run returns a non-zero exit code and converged/ is not written, "
    + "because the name of that directory is a contract.",
};

// ---- The recursion panel ----------------------------------------------------

function VariableTable({ trace, units }: {
  trace: SolveTrace; units: DisplayUnits;
}): JSX.Element {
  const rows = trace.iterates.slice(0, 12);
  return (
    <Box style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder fz="xs" miw={620}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>k</Table.Th>
            <Table.Th>variable</Table.Th>
            <Table.Th>assumed x</Table.Th>
            <Table.Th>returned G(x)</Table.Th>
            <Table.Th>secant s</Table.Th>
            <Table.Th>q before clamp</Table.Th>
            <Table.Th>q used</Table.Th>
            <Table.Th>why</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.flatMap((it) => {
            const xd = rescale(it.x, units);
            const gd = rescale(it.gx, units);
            return [0, 1].map((i) => (
              <Table.Tr key={`${it.k}-${i}`}>
                {i === 0
                  ? <Table.Td rowSpan={2} ff="monospace">{it.k}</Table.Td>
                  : null}
                <Table.Td>
                  {i === 0 ? "F" : "T"}{" "}
                  <Text span c="dimmed">[{units.names[i]}]</Text>
                </Table.Td>
                <Table.Td ff="monospace">
                  {i === 0 ? fmtExp(xd[0]) : fmt(xd[1], 3)}
                </Table.Td>
                <Table.Td ff="monospace">
                  {i === 0 ? fmtExp(gd[0]) : fmt(gd[1], 3)}
                </Table.Td>
                <Table.Td ff="monospace">{fmt(it.vars[i]?.s ?? null)}</Table.Td>
                <Table.Td ff="monospace">{fmt(it.vars[i]?.qRaw ?? null)}</Table.Td>
                <Table.Td ff="monospace" fw={600}>
                  {it.vars[i] ? fmt(it.vars[i].q) : "—"}
                </Table.Td>
                <Table.Td>{it.vars[i]?.why ?? "stopped here"}</Table.Td>
              </Table.Tr>
            ));
          })}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

// ---- The tool ---------------------------------------------------------------

export function WegsteinTool(): JSX.Element {
  const step = lessonStepper(WEGSTEIN_STEPS);

  /*  ONE COLUMN ON A PHONE.  Every panel here is a knob rail beside a drawing,
   *  and at 400 px a two-column grid leaves each of them about 190 px: the
   *  sliders collide with their own labels and the plot is a stripe.  The
   *  posture comes from `useNarrowViewport`, the ONE detection home
   *  (methodsChrome), rather than from a CSS media query this file would then
   *  own a second copy of.  */
  const narrow = useNarrowViewport();
  const rail = narrow ? "1fr" : "minmax(200px, 250px) 1fr";

  // ---- The recursion (declared toy) ----------------------------------------
  const [map, setMap] = useState<ToyMap>(TOY_DEFAULTS);
  const [qMin, setQMin] = useState(RECYCLE_QMIN_DEFAULT);
  const [qMax, setQMax] = useState(RECYCLE_QMAX_DEFAULT);
  const [unitId, setUnitId] = useState<string>(SI_UNITS.id);
  const [showNewton, setShowNewton] = useState(true);

  const units: DisplayUnits =
    DISPLAY_UNITS.find((u) => u.id === unitId) ?? SI_UNITS;
  const opts = { tol: 1e-10, maxIter: 40, units };

  const weg = useMemo(
    () => driveWegstein(map, { ...opts, qMin, qMax }),
    // opts is rebuilt each render; the unit object is the only part that moves
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, qMin, qMax, units]);
  const dir = useMemo(
    () => driveDirect(map, { ...opts, qMin: 0, qMax: 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, units]);
  const newt = useMemo(
    () => driveNewton(map, { ...opts, qMin, qMax }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, units]);

  const rho = toySpectralRadius(map);
  const eig = toyEigenvalues(map);
  const e1 = eig[0], e2 = eig[1];
  const contracting = rho < 1;

  /** The same run, re-expressed: the coefficients must not move and the
   *  unscaled norm must.  Computed here so the page can PRINT the comparison
   *  rather than assert it. */
  const invariance = useMemo(() => {
    const si = driveWegstein(map, { ...opts, qMin, qMax, units: SI_UNITS });
    const k = Math.min(3, si.iterates.length - 1, weg.iterates.length - 1);
    const a = si.iterates[k], b = weg.iterates[k];
    if (k < 0 || !a || !b) return null;
    let worst = 0;
    for (let i = 0; i < 2; ++i)
      worst = Math.max(worst, Math.abs((a.vars[i]?.q ?? 0) - (b.vars[i]?.q ?? 0)));
    return { k, qGap: worst, siNorm: a.deltaL2, displayNorm: b.deltaL2Display };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, qMin, qMax, units, weg]);

  // ---- The engine ----------------------------------------------------------
  const [knobs, setKnobs] = useState<RecycleKnobs>(RECYCLE_DEFAULTS);
  const [tolExp, setTolExp] = useState(-5);
  const engineKnobs: RecycleKnobs = { ...knobs, tol: Math.pow(10, tolExp) };
  const run = useMethodRun(
    WEGSTEIN_WITNESS, recycleOverrides(engineKnobs),
    `${engineKnobs.solver}:${tolExp}:${engineKnobs.maxIter}`, "choupoSolve");

  const massCurve = recycleResidual(run.result?.convergence, "mass");
  const energyCurve = recycleResidual(run.result?.convergence, "energy");
  /** The engine's own verdict line, quoted rather than reconstructed. */
  const verdict = (run.result?.log ?? run.log ?? "").split("\n")
    .map((l) => l.trim())
    .find((l) => /^(Recycle converged|WARNING: recycle)/.test(l)) ?? null;
  const planLine = (run.result?.log ?? run.log ?? "").split("\n")
    .map((l) => l.trim()).find((l) => l.startsWith("[plan] material recycle"))
    ?? null;
  const tearStream = run.result?.streams
    .find((s) => s.name === WITNESS_TEAR || s.name.endsWith(`.${WITNESS_TEAR}`));

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>

        <Box>
          <Title order={3}>
            Wegstein: closing a recycle, one variable at a time
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            A recycle has no beginning, so a sequential solver guesses the cut
            stream and runs the plant to see what comes back. Wegstein is how
            it stops guessing badly. The question this page is built around:
            the cut stream is a molar flow, a set of mole fractions and a
            temperature all in one list — how does one accelerator serve them
            at once?
          </Text>
        </Box>

        {step(1)}
        {step(2)}
        {step(3)}
        {step(4)}

        {/* ---------------- THE RECURSION ---------------- */}
        <Box style={{ borderLeft: `3px solid ${WEGSTEIN}`, paddingLeft: 12 }}>
          <Title order={4}>The recursion, with the coefficients on screen</Title>
          <Text size="sm" mt={4}>
            Everything below this line is arithmetic drawn in your browser,
            and the map it runs on is a TOY: two variables, a straight line
            with a coupling knob, declared in full in{" "}
            <Text span ff="monospace" size="xs">wegsteinMath.ts</Text>. It is
            not a reactor and no number in it came from one. What IS the
            engine&apos;s is the recursion consuming it — a line-for-line
            transcription of{" "}
            <Text span ff="monospace" size="xs">
              src/solver/Wegstein.cpp:49-92
            </Text>, both degeneracy guards and both epsilons included.
          </Text>
          <Text size="sm" mt={6}>
            It is here because the engine does not publish these two numbers.{" "}
            <Text span ff="monospace" size="xs">Wegstein::lastQ()</Text> exists
            and says in its own comment that it is for logging
            (src/solver/Wegstein.H:86-87); nothing prints it. The secant slope
            and the coefficient are the method, and there is no run in this
            tree from which a student can read them.
          </Text>
        </Box>

        <Box style={{ display: "grid", gap: 16,
          gridTemplateColumns: rail }}>
          <Stack gap={8}>
            <KnobSlider knob={GAIN_F} value={map.a} showWhy
              onChange={(v) => setMap((m) => ({ ...m, a: v }))} />
            <KnobSlider knob={GAIN_T} value={map.b} showWhy
              onChange={(v) => setMap((m) => ({ ...m, b: v }))} />
            <KnobSlider knob={COUPLE} value={map.c} showWhy
              onChange={(v) => setMap((m) => ({ ...m, c: v }))} />
            <KnobSlider knob={QMIN} value={qMin} showWhy
              onChange={setQMin} />
            <KnobSlider knob={QMAX} value={qMax} showWhy
              onChange={setQMax} />
            <Box>
              <Text size="xs" fw={600} mb={4}>express the tear vector in</Text>
              <SegmentedControl size="xs" fullWidth orientation="vertical"
                value={unitId} onChange={setUnitId}
                data={DISPLAY_UNITS.map((u) => ({ value: u.id, label: u.label }))} />
            </Box>
            <Switch size="xs" checked={showNewton} label="show Newton too"
              onChange={(e) => setShowNewton(e.currentTarget.checked)} />
            <PanelNote>
              The fixed point is F = {TOY_F_STAR.toExponential(1)} kmol/s at
              T = {TOY_T_STAR} K and the seed is{" "}
              {TOY_F_SEED.toExponential(1)} kmol/s at {TOY_T_SEED} K, both
              declared. Choupo packs the tear in canonical SI always; the
              selector above asks what a different choice of unit would have
              done, and is not a switch the engine has.
            </PanelNote>
          </Stack>

          <Stack gap={10}>
            {!contracting && (
              <Alert color="orange" title="This loop is no longer a contraction">
                The larger eigenvalue of the map is {fmt(Math.max(Math.abs(e1),
                  Math.abs(e2)), 3)}, which is at or above 1. DIRECT
                SUBSTITUTION diverges here too, so what you are watching is
                the problem and not the accelerator. Turn the coupling or a
                loop gain back down.
              </Alert>
            )}
            <ErrorPlot traces={[
              { label: "direct substitution", colour: DIRECT, dash: "6 3",
                marker: "triangle", values: dir.iterates.map((i) => i.errScaled) },
              { label: "Wegstein", colour: WEGSTEIN, dash: "",
                marker: "square", values: weg.iterates.map((i) => i.errScaled) },
              ...(showNewton ? [{ label: "Newton", colour: NEWTON,
                dash: "2 3", marker: "circle" as const,
                values: newt.iterates.map((i) => i.errScaled) }] : []),
            ]} />
            <Group gap="xs" wrap="wrap">
              <Badge variant="light" color="red">
                direct substitution: {dir.iterates.length} sweeps
                {dir.converged ? "" : " (did not converge)"}
              </Badge>
              <Badge variant="light" color="orange">
                Wegstein: {weg.iterates.length} sweeps
                {weg.converged ? "" : ` (${weg.stop})`}
              </Badge>
              {showNewton && (
                <Badge variant="light" color="blue">
                  Newton: {newt.iterates.length} sweeps
                  {newt.converged ? "" : ` (${newt.stop})`}
                </Badge>
              )}
              <Badge variant="outline">
                eigenvalues {fmt(e1, 3)} / {fmt(e2, 3)}
              </Badge>
            </Group>
            <Text size="sm">
              On a LINEAR map Newton lands on the fixed point in a single step
              whatever the coupling, because its Jacobian is exact. Every
              sweep Wegstein spends past the first is therefore the price of
              two scalar secants where Newton has the whole matrix — and a
              Newton step in the real engine costs 2(N<sub>c</sub>+1) sweeps
              to build that matrix, which is why Wegstein is still on offer.
            </Text>
          </Stack>
        </Box>

        {step(5)}

        <Box>
          <Title order={5}>
            One row per variable per sweep — and the two rows never meet
          </Title>
          <Text size="sm" mt={4} mb={8}>
            The flow and the temperature each carry their own secant and their
            own coefficient, formed from their own history alone. Change the
            unit on the left and read the two{" "}
            <Text span ff="monospace" size="xs">q used</Text> columns again:
            they do not move.
          </Text>
          <VariableTable trace={weg} units={units} />
          {invariance && (
            <Text size="sm" mt={8}>
              Measured on this run at sweep {invariance.k}: the largest
              difference between a coefficient computed in SI and the same
              coefficient computed in the selected units is{" "}
              <Text span ff="monospace">{fmtExp(invariance.qGap, 1)}</Text>.
              The convergence norm over the same step is{" "}
              <Text span ff="monospace">{fmtExp(invariance.siNorm)}</Text> in
              SI and{" "}
              <Text span ff="monospace">{fmtExp(invariance.displayNorm)}</Text>{" "}
              in the selected units. One of those two numbers is a property of
              the method; the other is a property of the bookkeeping.
            </Text>
          )}
        </Box>

        {step(6)}
        {step(7)}
        {step(8)}

        {/* ---------------- THE ENGINE ---------------- */}
        <Box style={{ borderLeft: `3px solid ${MEASURED}`, paddingLeft: 12 }}>
          <Title order={4}>Measured: a real recycle, solved in your browser</Title>
          <Text size="sm" mt={4}>
            Everything below this line is one complete run of{" "}
            <Text span ff="monospace" size="xs">
              tutorials/{WEGSTEIN_WITNESS}
            </Text>{" "}
            — a mixer, a CSTR, an isothermal flash and a splitter, with the
            splitter returning 60 % of the liquid to the mixer. The stream{" "}
            <Text span ff="monospace" size="xs">{WITNESS_TEAR}</Text> is the
            declared tear. The controls write three keys into the case&apos;s
            own <Text span ff="monospace" size="xs">system/solverDict</Text>{" "}
            and nothing else, so the same edits by hand in the case directory
            give the same answer.
          </Text>
        </Box>

        <Box style={{ display: "grid", gap: 16,
          gridTemplateColumns: rail }}>
          <Stack gap={8}>
            <Box>
              <Text size="xs" fw={600} mb={4}>recycleSolver</Text>
              <SegmentedControl size="xs" fullWidth value={knobs.solver}
                onChange={(v) =>
                  setKnobs((k) => ({ ...k, solver: v as RecycleSolver }))}
                data={[{ value: "Newton", label: "Newton" },
                  { value: "Wegstein", label: "Wegstein" }]} />
            </Box>
            <KnobSlider knob={TOL} value={tolExp} showWhy onChange={setTolExp} />
            <KnobSlider knob={MAXIT} value={knobs.maxIter} showWhy
              onChange={(v) => setKnobs((k) => ({ ...k, maxIter: Math.round(v) }))} />
            {run.busy && (
              <Group gap={6}><Loader size="xs" />
                <Text size="xs" c="dimmed">solving the flowsheet…</Text></Group>
            )}
            <PanelNote>
              recycleTol is written as 1e{tolExp}. The clamp keys
              recycleWegsteinQmin / Qmax are real and read by the engine
              (src/unitOperations/flowsheet/Flowsheet.cpp:3328-3329), but this
              case carries them commented out and a knob can only replace a
              value a case declares — so the clamp is turned on the recursion
              above instead.
            </PanelNote>
          </Stack>

          <Stack gap={10}>
            {run.err && (
              <Alert color="red" title="The run did not finish">
                <Text size="sm">{run.err}</Text>
                {knobs.maxIter < 6 && (
                  <Text size="sm" mt={6}>
                    With the cap this low that is the expected answer, and it
                    is the honest one: a recycle that exhausts its iterations
                    without meeting its declared tolerance is a FAILED solve
                    in Choupo — non-zero exit, and{" "}
                    <Text span ff="monospace" size="xs">converged/</Text> is
                    not written, because the name of that directory is a
                    contract.
                  </Text>
                )}
              </Alert>
            )}
            {planLine && (
              <Box px="sm" py={6}
                style={{ borderLeft: `3px solid ${GRID}` }}>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
                  the engine announcing its own cut
                </Text>
                <Text size="xs" ff="monospace"
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {planLine}
                </Text>
              </Box>
            )}
            {(massCurve || energyCurve) ? (
              <>
                <ErrorPlot traces={[
                  ...(massCurve ? [{ label: "mass imbalance", colour: MEASURED,
                    dash: "", marker: "square" as const, values: massCurve }] : []),
                  ...(energyCurve ? [{ label: "energy imbalance",
                    colour: NEWTON, dash: "4 3", marker: "circle" as const,
                    values: energyCurve }] : []),
                ]} />
                <Text size="sm">
                  These are the engine&apos;s own curves and this page computes
                  neither. They are PHYSICAL residuals — the recycle mass and
                  energy mismatch divided by what enters the plant — published
                  precisely because the solver&apos;s own convergence figure
                  mixes flows and temperatures into one dimensionless number
                  and the engine declined to plot that
                  (src/unitOperations/flowsheet/Flowsheet.cpp:2066-2071).
                </Text>
              </>
            ) : !run.busy && !run.err ? (
              <Text size="sm" c="dimmed">
                This run published no recycle convergence curve.
              </Text>
            ) : null}
            {verdict && (
              <Text size="sm" ff="monospace"
                style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {verdict}
              </Text>
            )}
            {tearStream && (
              <Group gap="xs" wrap="wrap">
                <Badge variant="light">
                  tear F = {tearStream.F.toExponential(4)} kmol/s
                </Badge>
                <Badge variant="light">
                  tear T = {tearStream.T.toFixed(2)} K
                </Badge>
              </Group>
            )}
            <Text size="sm" c="dimmed">
              Turn the solver over and watch the number of points change while
              the two badges do not. That is the property worth having: the
              fixed point belongs to the topology and the feeds, and the
              solver only decides the path taken to it.
            </Text>
          </Stack>
        </Box>

        <LessonLimits limits={WEGSTEIN_LIMITS} />
      </Stack>
    </Box>
  );
}
