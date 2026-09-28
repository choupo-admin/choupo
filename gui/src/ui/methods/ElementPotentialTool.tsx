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
  ElementPotentialTool -- how the Gibbs reactor SOLVES (commission C15).

  A scrolling lesson (elementPotentialLesson.ts) with the engine running
  inside it.  Two runs in the browser, on the WASM build of `choupoSolve`:

    * tutorials/steady/gibbs/gibbs12_element_potential_newton -- three Gibbs
      reactors, each writing its `newtonLog`: the shift (steps 1-3, knob on
      its T), the steam-lean reformer (the solid of step 4), and 10 % ammonia
      in air (step 5, knob on its T);
    * tutorials/steady/gibbs/gibbs07_wgs_cooled -- the condensing reactor of
      step 4, which declares its own `newtonLog`.

  ZERO NEWTON IN TYPESCRIPT.  Every iterate, residual, step, test and search
  on this page is a row of the engine's own log, selected by
  elementPotentialRun.ts.  The page's only arithmetic is step 3's
  re-addition -- g/RT + ln(P/P0) + (ln n - ln N) beside sum_k pi_k A_ki --
  printed term by term so a reader can redo it on paper, which is the point
  of the step.

  THE LOG IS NEW (2026-09-27).  An in-browser engine built before it writes
  no `newtonLog` file; the page then says so by name and draws nothing in
  its place, rather than showing a Newton the engine did not report.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Anchor, Badge, Box, Group, Loader, Stack, Table, Text, Title,
} from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";
import type { RunResult } from "../../adapters/SolverAdapter.js";
import { KnobSlider, PanelNote } from "./knobPanel.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { EP_LIMITS, EP_STEPS } from "./elementPotentialLesson.js";
import {
  AMMONIA_T, EP_LIQUID_WITNESS, EP_LOGS, EP_UNITS, EP_WITNESS, SHIFT_ATOMS,
  SHIFT_T, bisection, elementPotentialOverrides, newtonRoute, pick,
  readNewtonLog, routeEnd, stagesOf, type LogRecord,
} from "./elementPotentialRun.js";
import { setActiveMethodTool } from "./registry.js";

function fmt(v: number | null | undefined, digits = 4): string {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return "non-finite";
  if (v === 0) return "0";
  const a = Math.abs(v);
  return a >= 1e-3 && a < 1e5 ? v.toFixed(digits) : v.toExponential(2);
}

/** The records of one log, or the reason there are none. */
function useLog(r: RunResult | null, file: string):
  { recs: LogRecord[] | null; why: string | null } {
  return useMemo(() => {
    if (!r) return { recs: null, why: null };
    const csv = r.csvFiles?.[file];
    if (csv === undefined)
      return { recs: null, why: `this run wrote no ${file}.  The in-browser `
        + "engine predates the `newtonLog` key (2026-09-27): the WASM build "
        + "must be rebuilt (`make wasm-gui`) before this page can draw it." };
    const read = readNewtonLog(csv);
    if (!read.ok) return { recs: null, why: read.why };
    return { recs: read.read.records,
             why: read.read.skipped > 0
               ? `${read.read.skipped} row(s) of ${file} could not be read and `
                 + "are not drawn" : null };
  }, [r, file]);
}

function Missing({ why }: { why: string | null }): JSX.Element | null {
  return why
    ? <Alert color="orange" variant="light" mt={6}><Text size="sm">{why}</Text></Alert>
    : null;
}

/** A Newton route as the engine logged it: unknowns, |F|, and the step. */
function NewtonTable({ recs, stage, elements, species, showLnn }: {
  recs: readonly LogRecord[]; stage: string;
  elements: readonly string[]; species: readonly string[]; showLnn: boolean;
}): JSX.Element {
  const rows = newtonRoute(recs, stage, elements, species);
  const end = routeEnd(recs, stage);
  return (
    <Box style={{ overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>iteration</Table.Th>
            {elements.map((e) => <Table.Th key={e}>π_{e}</Table.Th>)}
            <Table.Th>ln N</Table.Th>
            <Table.Th>|F| [mol/s]</Table.Th>
            <Table.Th>α</Table.Th>
            {showLnn && species.map((s) => <Table.Th key={s}>ln n_{s}</Table.Th>)}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.iteration}>
              <Table.Td>{r.iteration}</Table.Td>
              {r.pi.map((v, k) => <Table.Td key={k}>{fmt(v)}</Table.Td>)}
              <Table.Td>{fmt(r.lnN)}</Table.Td>
              <Table.Td>{fmt(r.normF, 5)}</Table.Td>
              <Table.Td>{r.alpha === null ? "no step" : fmt(r.alpha, 6)}</Table.Td>
              {showLnn && r.lnn.map((v, k) => <Table.Td key={k}>{fmt(v, 3)}</Table.Td>)}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Text size="xs" c="dimmed" mt={4}>
        {end === null ? "The log records no end for this route."
          : end.converged
            ? `Converged at iteration ${end.iteration}: |F| under 10⁻⁸ mol/s.`
            : `STOPPED at iteration ${end.iteration}, not converged.`}
        {" "}α is the fraction of the Newton step taken FROM that iterate;
        the last row takes none.
      </Text>
    </Box>
  );
}

/** Step 3's hand check, on the last iterate of the shift route. */
function StationarityTable({ recs }: { recs: readonly LogRecord[] }):
  JSX.Element | null {
  const end = routeEnd(recs, "leastSquaresSeed");
  if (!end) return null;
  const it = end.iteration;
  const els = EP_UNITS.shift.elements;
  const lnN = pick(recs, "leastSquaresSeed", it, "lnN");
  const lnP = pick(recs, "standardState", 0, "lnP");
  const pi = els.map((e) => pick(recs, "leastSquaresSeed", it, `pi_${e}`));
  return (
    <Box style={{ overflowX: "auto" }} mt={6}>
      <Table striped withTableBorder withColumnBorders fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>species</Table.Th>
            <Table.Th>g°/RT</Table.Th>
            <Table.Th>ln(P/P°)</Table.Th>
            <Table.Th>ln y = ln n − ln N</Table.Th>
            <Table.Th>μ/RT (their sum)</Table.Th>
            <Table.Th>Σ π_k A_ki</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {EP_UNITS.shift.species.map((sp) => {
            const g = pick(recs, "standardState", 0, `gRT_${sp}`);
            const lnn = pick(recs, "leastSquaresSeed", it, `lnn_${sp}`);
            const lnY = lnn !== null && lnN !== null ? lnn - lnN : null;
            const mu = g !== null && lnP !== null && lnY !== null
              ? g + lnP + lnY : null;
            const atoms = SHIFT_ATOMS[sp]!;
            const sum = pi.every((v) => v !== null)
              ? atoms.reduce((s, a, k) => s + a * (pi[k] as number), 0) : null;
            return (
              <Table.Tr key={sp}>
                <Table.Td>{sp} ({els.map((e, k) => `${e}${atoms[k]}`).join(" ")})</Table.Td>
                <Table.Td>{fmt(g)}</Table.Td>
                <Table.Td>{fmt(lnP)}</Table.Td>
                <Table.Td>{fmt(lnY)}</Table.Td>
                <Table.Td>{fmt(mu)}</Table.Td>
                <Table.Td>{fmt(sum)}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      <Text size="xs" c="dimmed" mt={4}>
        Every term is a number the engine logged at the converged iterate
        (π_C = {fmt(pi[0])}, π_H = {fmt(pi[1])}, π_O = {fmt(pi[2])}); the only
        arithmetic here is the addition you can redo by hand.
      </Text>
    </Box>
  );
}

/** A one-dimensional phase search, first and last few fluid solves. */
function SearchTable({ rows, xLabel, rLabel }: {
  rows: { iteration: number; x: number; r: number }[];
  xLabel: string; rLabel: string;
}): JSX.Element {
  const shown = rows.length <= 8 ? rows
    : [...rows.slice(0, 4), ...rows.slice(-3)];
  return (
    <Table striped withTableBorder withColumnBorders fz="xs" mt={4}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>fluid solve</Table.Th><Table.Th>{xLabel}</Table.Th>
          <Table.Th>{rLabel}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {shown.map((r, i) => (
          <Table.Tr key={r.iteration}>
            <Table.Td>{i === 4 && rows.length > 8 ? `… ${r.iteration}` : r.iteration}</Table.Td>
            <Table.Td>{fmt(r.x, 6)}</Table.Td>
            <Table.Td>{fmt(r.r, 6)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export function ElementPotentialTool(): JSX.Element {
  const [shiftT, setShiftT] = useState<number>(SHIFT_T.default);
  const [ammoniaT, setAmmoniaT] = useState<number>(AMMONIA_T.default);

  const ov = useMemo(() => elementPotentialOverrides(shiftT, ammoniaT),
    [shiftT, ammoniaT]);
  const run = useMethodRun(EP_WITNESS, ov, JSON.stringify([shiftT, ammoniaT]),
    "choupoSolve");
  const liquidRun = useMethodRun(EP_LIQUID_WITNESS, [], "liquid", "choupoSolve");

  const shift = useLog(run.result, EP_LOGS.shift);
  const coking = useLog(run.result, EP_LOGS.coking);
  const ammonia = useLog(run.result, EP_LOGS.ammonia);
  const liquid = useLog(liquidRun.result, EP_LOGS.liquid);

  const step = lessonStepper(EP_STEPS);
  const busy = run.busy || liquidRun.busy;

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>How a Gibbs reactor solves: the element-potential Newton</Title>
          <Text size="sm" c="dimmed" mt={4}>
            What a Gibbs reactor IS — the atoms declared, no reaction written,
            one multiplier per element — is the page{" "}
            <Anchor component="button" type="button"
              onClick={() => setActiveMethodTool("claus-gibbs")}>
              The allotrope nobody declared
            </Anchor>. This one opens the engine and watches it work: the
            unknowns it actually moves, every Newton iterate it logged, what
            the answer&apos;s element potentials mean, how a liquid or a solid
            is added, and the feed on which its first seed fails.
          </Text>
        </Box>

        {(run.err || liquidRun.err) && (
          <Alert color="red" variant="light" title="The engine did not finish">
            <Text size="sm">{run.err ?? liquidRun.err}</Text>
          </Alert>
        )}
        {busy && (
          <Group gap="sm"><Loader size="xs" />
            <Text size="xs" c="dimmed">running the witnesses in your browser</Text>
          </Group>
        )}

        {step(1)}
        {step(2)}

        <Box>
          <Title order={5}>The shift reactor&apos;s Newton, as the engine logged it</Title>
          <Box mt={8} style={{ display: "grid", gap: 14,
            gridTemplateColumns: "minmax(200px, 250px) 1fr" }}>
            <Stack gap={8}>
              <KnobSlider knob={SHIFT_T} value={shiftT} onChange={setShiftT} showWhy />
              <PanelNote>
                Runs <code>tutorials/{EP_WITNESS}</code>; its <code>shift</code>{" "}
                reactor declares <code>newtonLog {EP_LOGS.shift};</code> and
                the table is that file.
              </PanelNote>
            </Stack>
            <Box style={{ minWidth: 0 }}>
              <Missing why={shift.why} />
              {shift.recs && (
                <NewtonTable recs={shift.recs} stage="leastSquaresSeed"
                  elements={EP_UNITS.shift.elements}
                  species={EP_UNITS.shift.species} showLnn />
              )}
            </Box>
          </Box>
        </Box>

        {step(3)}
        {shift.recs && <StationarityTable recs={shift.recs} />}

        {step(4)}
        <Box>
          <Title order={5}>The liquid (gibbs07, 350 K) and the solid (the reformer, 1000 K)</Title>
          <Missing why={liquid.why} />
          {liquid.recs && (() => {
            const L = bisection(liquid.recs, "liquidBisection", "L", "r");
            return (
              <Box mt={6}>
                <Text size="sm">
                  The test on the gas-only answer: y_water P ={" "}
                  <b>{fmt(pick(liquid.recs, "liquidTest", 0, "yP_water"), 1)} Pa</b>{" "}
                  against Psat ={" "}
                  <b>{fmt(pick(liquid.recs, "liquidTest", 0, "Psat_water"), 1)} Pa</b>.
                  Then {L.length} gas solves on the liquid amount L (r is the
                  water the gas holds beyond saturation):
                </Text>
                <SearchTable rows={L} xLabel="L [mol/s]" rLabel="r [mol/s]" />
              </Box>
            );
          })()}
          <Missing why={coking.why} />
          {coking.recs && (() => {
            const S = bisection(coking.recs, "solidBisection", "n_graphite",
              "lnActivity_graphite");
            const it = routeEnd(coking.recs, "leastSquaresSeed")?.iteration ?? -1;
            return (
              <Box mt={10}>
                <Text size="sm">
                  The test on the graphite-free gas: π_C ={" "}
                  <b>{fmt(pick(coking.recs, "leastSquaresSeed", it, "pi_C"))}</b>,
                  g_graphite/RT ={" "}
                  <b>{fmt(pick(coking.recs, "solidTest", 0, "gRT_graphite"))}</b>,
                  so ln a_C ={" "}
                  <b>{fmt(pick(coking.recs, "solidTest", 0, "lnActivity_graphite"))}</b>.
                  Then {S.length} gas solves on the deposited amount:
                </Text>
                <SearchTable rows={S} xLabel="n_graphite [mol/s]" rLabel="ln a_C" />
              </Box>
            );
          })()}
        </Box>

        {step(5)}
        <Box>
          <Title order={5}>Which route answered?</Title>
          <Box mt={8} style={{ display: "grid", gap: 14,
            gridTemplateColumns: "minmax(200px, 250px) 1fr" }}>
            <Stack gap={8}>
              <KnobSlider knob={AMMONIA_T} value={ammoniaT} onChange={setAmmoniaT} showWhy />
            </Stack>
            <Box style={{ minWidth: 0 }}>
              <Missing why={ammonia.why} />
              {ammonia.recs && (() => {
                const recs = ammonia.recs;
                const stages = stagesOf(recs).filter((s) =>
                  ["leastSquaresSeed", "primalSeed", "primalReseed"].includes(s));
                return (
                  <Stack gap={6}>
                    <Group gap="xs">
                      {stages.map((s) => {
                        const e = routeEnd(recs, s);
                        return (
                          <Badge key={s} variant="light"
                            color={e?.converged ? "teal" : "red"}>
                            {s}: {e?.converged ? "converged" : "stopped"} at
                            iteration {e?.iteration ?? "—"}
                          </Badge>
                        );
                      })}
                    </Group>
                    <Text size="xs" c="dimmed">The first route, from the least-squares seed:</Text>
                    <NewtonTable recs={recs} stage="leastSquaresSeed"
                      elements={EP_UNITS.ammonia.elements}
                      species={EP_UNITS.ammonia.species} showLnn />
                    {stages.includes("primalReseed") && (
                      <>
                        <Text size="xs" c="dimmed">
                          The primal re-seed took{" "}
                          {routeEnd(recs, "primalSeed")?.iteration ?? "—"} primal
                          iterations; the same Newton from where it left off:
                        </Text>
                        <NewtonTable recs={recs} stage="primalReseed"
                          elements={EP_UNITS.ammonia.elements}
                          species={EP_UNITS.ammonia.species} showLnn />
                      </>
                    )}
                  </Stack>
                );
              })()}
            </Box>
          </Box>
        </Box>

        <LessonLimits limits={EP_LIMITS} />

        <Text size="sm">
          The declared-reaction counterpart — equilibrium along only the
          reactions you allow, solved on ln n — is the page{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("declared-pathways")}>
            Declared pathways
          </Anchor>.
        </Text>
      </Stack>
    </Box>
  );
}
