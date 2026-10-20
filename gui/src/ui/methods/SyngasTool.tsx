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
  SyngasTool -- "Synthesis gas: one gas, many products" (DEV.md 4c C109).
  A scrolling lesson in eight parts; seven of them carry an EXERCISE on an
  in-browser copy of a bundled tutorial (syngasExercise.ts), and the eighth
  names what the model does not do.

  THE ENGINE DECIDES, THE PAGE DRAWS.  Every exercise writes its edits into
  the host's declared text, runs the copy, and tabulates what the engine
  published: outlet flows, the reactor's KPIs, and two ratios of the outlet
  flows (H2/CO and the module) whose arithmetic is in syngasExercise.ts and
  is recomputed by the test from a native run.  The sentence each guided move
  carries sits BESIDE the engine's answer and is held to it by the test.

  NOTHING RUNS ON LOAD.  An exercise runs the engine when its reader picks a
  move or types a number -- seven boxes solving at once on load would make
  the page wait on work nobody asked for (the C101 rule).
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useState } from "react";

import {
  Alert, Anchor, Box, Button, Code, Group, Loader, ScrollArea, Stack, Table, Text, Title,
} from "@mantine/core";

import { useCaseFilesRun } from "../../case/methodRun.js";
import { caseTabSearch, openAppTab } from "../openInTab.js";
import { KnobNumber, PanelNote } from "./knobPanel.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { setActiveMethodTool } from "./registry.js";
import {
  BENCHES, BENCH_STAGES, COLUMNS, KNOBS, MOVES, READOUTS, START,
  benchCase, fmtReadout, outletFlows, readout, runDataOf,
  type BenchId, type CaseEdit, type ReadoutId, type RunData, type Stage, type SyngasMove, type SyngasPart,
} from "./syngasExercise.js";
import { SYNGAS_LIMITS, SYNGAS_STEPS } from "./syngasLesson.js";

const step = lessonStepper(SYNGAS_STEPS);
const BORDER = "var(--mantine-color-default-border)";

/** The declaration a move changes, as a diff a reader can copy. */
function EditDiff({ edits, title }: { edits: readonly CaseEdit[]; title: string }): JSX.Element | null {
  if (edits.length === 0) return null;
  return (
    <Box mt={8}>
      <Text size="xs" fw={600}>{title}</Text>
      {edits.map((e, i) => (
        <Code key={i} block mt={4} style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>
          {`// ${e.file}${e.unit ? `, unit ${e.unit}` : ""}\n`
            + `- ${e.from.trim()}\n+ ${e.to.trim()}`}
        </Code>
      ))}
    </Box>
  );
}

/** The readouts of each stage, and the outlet flows, as the engine published them. */
function StageTable({ data, stages, cols }: {
  data: RunData; stages: readonly Stage[]; cols: readonly ReadoutId[];
}): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }} mt={6}>
      <Table striped withTableBorder fz="xs">
        <Table.Thead><Table.Tr>
          <Table.Th>stage</Table.Th>
          {cols.map((c) => (
            <Table.Th key={c} ta="right" title={READOUTS[c].meaning}>
              {READOUTS[c].label}{READOUTS[c].unit !== "-" ? ` [${READOUTS[c].unit}]` : ""}
            </Table.Th>
          ))}
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {stages.map((s) => (
            <Table.Tr key={s.unit + s.out}>
              <Table.Td>{s.label}</Table.Td>
              {cols.map((c) => (
                <Table.Td key={c} ta="right" ff="monospace">{fmtReadout(c, readout(data, s, c))}</Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Text size="xs" fw={600} mt={8}>Outlet flows [kmol/h]</Text>
      <Table withTableBorder fz="xs" mt={2}>
        <Table.Tbody>
          {stages.map((s) => (
            <Table.Tr key={s.out}>
              <Table.Td style={{ whiteSpace: "nowrap" }}>{s.out}</Table.Td>
              <Table.Td ff="monospace">
                {outletFlows(data, s).map((f) => `${f.c} ${f.kmolh.toPrecision(4)}`).join("   ")}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

/** A point on the ratio map: one gas the reader has run in part 5. */
interface GasPoint { id: string; label: string; r: number; m: number }

/** H2/CO (log) against the module, with the stoichiometric targets of step 10.
 *  It draws only gases the engine produced on this page, and no line between
 *  them: a point is a run, a line would be a claim nothing evaluated. */
function RatioMap({ points }: { points: readonly GasPoint[] }): JSX.Element {
  const W = 560, H = 300, L = 52, R = 16, T = 14, B = 40;
  const xMin = Math.log10(0.5), xMax = Math.log10(500);
  const X = (r: number) => L + ((Math.log10(r) - xMin) / (xMax - xMin)) * (W - L - R);
  const Y = (m: number) => T + (1 - m / 3.5) * (H - T - B);
  const INK = "var(--mantine-color-text)";
  const GUIDE = "var(--mantine-color-dimmed)";
  const ticks = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  return (
    <Box mt={8} style={{ maxWidth: W }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label="H2/CO against the module for the gases run in part 5">
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke={INK} />
        <line x1={L} y1={T} x2={L} y2={H - B} stroke={INK} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={X(t)} y1={H - B} x2={X(t)} y2={H - B + 4} stroke={INK} />
            <text x={X(t)} y={H - B + 15} fontSize={10} fill={INK} textAnchor="middle">{t}</text>
          </g>
        ))}
        {[0, 1, 2, 3].map((m) => (
          <g key={m}>
            <line x1={L - 4} y1={Y(m)} x2={L} y2={Y(m)} stroke={INK} />
            <text x={L - 7} y={Y(m) + 3} fontSize={10} fill={INK} textAnchor="end">{m}</text>
          </g>
        ))}
        <text x={(L + W - R) / 2} y={H - 6} fontSize={11} fill={INK} textAnchor="middle">
          H₂/CO [mol/mol, log scale]
        </text>
        <text x={12} y={(T + H - B) / 2} fontSize={11} fill={INK} textAnchor="middle"
          transform={`rotate(-90 12 ${(T + H - B) / 2})`}>module M</text>
        <line x1={L} y1={Y(2)} x2={W - R} y2={Y(2)} stroke={GUIDE} strokeDasharray="4 3" />
        <text x={W - R - 2} y={Y(2) - 4} fontSize={10} fill={GUIDE} textAnchor="end">methanol: M ≈ 2</text>
        <line x1={X(2)} y1={T} x2={X(2)} y2={H - B} stroke={GUIDE} strokeDasharray="4 3" />
        <text x={X(2) + 3} y={T + 10} fontSize={10} fill={GUIDE}>Fischer-Tropsch: H₂/CO ≈ 2</text>
        <line x1={X(1)} y1={T} x2={X(1)} y2={H - B} stroke={GUIDE} strokeDasharray="4 3" />
        <text x={X(1) - 3} y={T + 10} fontSize={10} fill={GUIDE} textAnchor="end">oxo ≈ 1</text>
        {points.filter((p) => Number.isFinite(p.r) && Number.isFinite(p.m) && p.r > 0).map((p) => (
          <g key={p.id}>
            <circle cx={X(Math.min(Math.max(p.r, 0.5), 500))} cy={Y(Math.min(Math.max(p.m, 0), 3.5))}
              r={4.5} fill="var(--mantine-color-accent-6)" />
            <text x={X(Math.min(Math.max(p.r, 0.5), 500)) + 7}
              y={Y(Math.min(Math.max(p.m, 0), 3.5)) - 6} fontSize={10} fill={INK}>{p.label}</text>
          </g>
        ))}
      </svg>
      <Text size="xs" c="dimmed">
        {points.length === 0
          ? "No gas run yet: pick a move above and its outlet is placed here."
          : `${points.length} gas(es) run so far; each point is the outlet of the move's last stage.`}
      </Text>
    </Box>
  );
}

/** One part's exercise: its guided moves (and its numbers, where it has
 *  them), the engine's answer, and -- in part 5 -- the ratio map. */
function Exercise({ part, title }: { part: SyngasPart; title: string }): JSX.Element {
  const moves: readonly SyngasMove[] = [START[part], ...MOVES[part]];
  const kn = KNOBS[part];
  const [chosen, setChosen] = useState<string | null>(null);
  const [values, setValues] = useState<{ [id: string]: number }>({});
  const [points, setPoints] = useState<GasPoint[]>([]);

  const move = chosen && chosen !== "knob" ? moves.find((m) => m.id === chosen) : undefined;
  const bench: BenchId | null = move ? move.bench : chosen === "knob" && kn ? kn.bench : null;
  const edits: readonly CaseEdit[] = move ? move.edits
    : chosen === "knob" && kn
      ? kn.knobs.filter((k) => values[k.id] !== undefined && values[k.id] !== k.shipped)
        .map((k) => k.edit(values[k.id]!))
      : [];
  const stageIdx = move?.stages ?? (chosen === "knob" ? kn?.stages : undefined);
  const stages: readonly Stage[] = bench
    ? (stageIdx ?? BENCH_STAGES[bench].map((_, i) => i)).map((i) => BENCH_STAGES[bench][i]!)
    : [];
  const run = useCaseFilesRun(bench ? () => benchCase(bench, edits) : null,
    `syngas\u0000${bench}\u0000${JSON.stringify(edits)}`, "choupoSolve");
  const data = useMemo(() => (run.result && run.err === null ? runDataOf(run.result) : null),
    [run.result, run.err]);

  //  Part 5 collects each gas the reader runs onto the ratio map.
  useEffect(() => {
    if (part !== "destinations" || !data || !move || stages.length === 0) return;
    const last = stages[stages.length - 1]!;
    const p: GasPoint = { id: move.id, label: move.label,
      r: readout(data, last, "H2_CO"), m: readout(data, last, "M") };
    setPoints((ps) => [...ps.filter((q) => q.id !== p.id), p]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <Box p="sm" style={{ border: `1px solid ${BORDER}`, borderRadius: 6 }} data-syngas-exercise={part}>
      <Title order={5}>Exercise: {title}</Title>
      <Group gap={6} mt={8}>
        {moves.map((m) => (
          <Button key={m.id} size="compact-xs" variant={chosen === m.id ? "filled" : "default"}
            onClick={() => { setChosen(m.id); setValues({}); }}>
            {m.label}
          </Button>
        ))}
      </Group>
      {kn && (
        <Group mt={10} gap="md" align="flex-end">
          {kn.knobs.map((k) => (
            <Box key={k.id} w={200}>
              <KnobNumber label={`${k.label} [${k.unit}]`} value={values[k.id] ?? k.shipped}
                min={k.min} max={k.max} step={k.step} decimals={k.step < 1 ? 2 : 0}
                onChange={(v) => { setValues((vs) => ({ ...vs, [k.id]: v })); setChosen("knob"); }} />
            </Box>
          ))}
        </Group>
      )}
      {chosen === null ? (
        <Text size="sm" mt={10} c="dimmed">
          Pick a move{kn ? " or type a number" : ""} to run the engine on its bench, in your browser.
        </Text>
      ) : (
        <>
          {move && move.expect && (
            <Text size="sm" mt={10}><Text span fw={600}>What you should see: </Text>{move.expect}</Text>
          )}
          {chosen === "knob" && (
            <Text size="sm" mt={10} c="dimmed">Your own numbers: read the engine&apos;s answer below.</Text>
          )}
          {bench && <EditDiff edits={edits} title="The declaration you changed" />}
          {run.err !== null ? (
            <Alert color="red" variant="light" mt={8} title="The engine refused or did not finish">
              <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{run.err}</Text>
            </Alert>
          ) : run.busy || !data ? (
            <Group gap="sm" mt={8} wrap="nowrap">
              <Loader size="xs" />
              <Text size="xs" c="dimmed">solving the bench …</Text>
            </Group>
          ) : (
            <StageTable data={data} stages={stages} cols={COLUMNS[part]} />
          )}
          {bench && (
            <Text size="xs" c="dimmed" mt={6}>Bench: {BENCHES[bench].host} — {BENCHES[bench].about}</Text>
          )}
        </>
      )}
      {part === "destinations" && <RatioMap points={points} />}
    </Box>
  );
}

/** The benches: which tutorial each copies and what the copy changes. */
function Benches(): JSX.Element {
  const [open, setOpen] = useState<BenchId | null>(null);
  const ids = Object.keys(BENCHES) as BenchId[];
  return (
    <Box p="sm" style={{ border: `1px solid ${BORDER}`, borderRadius: 6 }}>
      <Title order={5}>The benches, and what each copy changes</Title>
      <Text size="xs" c="dimmed" mt={4}>
        No case was written for this page.  Each exercise runs an in-browser copy of a
        bundled tutorial, edited as shown; the tutorial on disk is never changed, and you
        can open each one in its own tab.
      </Text>
      {ids.map((id) => {
        const b = BENCHES[id];
        return (
          <Box key={id} mt={8}>
            <Text size="sm"><Text span fw={600}>{id}</Text> — {b.host}: {b.about}</Text>
            <Group gap={6} mt={4}>
              <Button size="compact-xs" variant="default"
                onClick={() => openAppTab(caseTabSearch(b.host))}>
                Open {b.host} in a new tab
              </Button>
              {(b.base.length > 0 || b.adds) && (
                <Button size="compact-xs" variant="default"
                  onClick={() => setOpen((o) => (o === id ? null : id))}>
                  {open === id ? "Hide" : "Read"} what the copy changes
                </Button>
              )}
            </Group>
            {open === id && (
              <ScrollArea.Autosize mah={360} mt={4}>
                <EditDiff edits={b.base} title="Edits to the host" />
                {Object.entries(b.adds ?? {}).map(([rel, body]) => (
                  <Box key={rel} mt={6}>
                    <Text size="xs" fw={600}>Added file {rel}</Text>
                    <Code block style={{ fontSize: 11 }}>{body}</Code>
                  </Box>
                ))}
              </ScrollArea.Autosize>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

export function SyngasTool(): JSX.Element {
  const link = (id: Parameters<typeof setActiveMethodTool>[0], label: string) => (
    <Anchor component="button" type="button" onClick={() => setActiveMethodTool(id)}>{label}</Anchor>
  );
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Synthesis gas: one gas, many products</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Where syngas comes from, why reforming is run hot and at low pressure, how a
            reformer cokes, how the water-gas shift sets the ratio, what ratio each product
            asks for, how the gas is cleaned, where the idea came from and where it is
            going -- each with an exercise the engine runs in your browser; and what the
            model does not do.  The equilibrium methods under the exercises have their own
            pages: {link("approach-to-equilibrium", "Approach to equilibrium")},{" "}
            {link("declared-pathways", "Declared pathways")},{" "}
            {link("equilibrium-landscapes", "Equilibrium landscapes")} and{" "}
            {link("element-potential", "How a Gibbs reactor solves")}; the loop a syngas
            feeds is {link("limiting-reactant", "Limiting reactant and feed ratio in a recycle loop")}.
          </Text>
        </Box>

        <Title order={4}>Part 1 — where syngas comes from</Title>
        {step(1)}
        {step(2)}
        {step(3)}
        <Exercise part="reformer" title="the three knobs of a steam reformer" />
        {step(4)}
        <Exercise part="routes" title="four routes, one methane" />

        <Title order={4}>Part 2 — why hot, and why at low pressure</Title>
        {step(5)}
        <Exercise part="pressure" title="pressure against conversion" />
        {step(6)}

        <Title order={4}>Part 3 — carbon on the catalyst</Title>
        {step(7)}
        <Exercise part="carbon" title="where the carbon disappears" />

        <Title order={4}>Part 4 — the water-gas shift</Title>
        {step(8)}
        <Exercise part="shift" title="two stages of shift" />
        {step(9)}

        <Title order={4}>Part 5 — each product asks its own ratio</Title>
        {step(10)}
        {step(11)}
        <Exercise part="destinations" title="which gas suits which product" />

        <Title order={4}>Part 6 — cleaning the gas</Title>
        {step(12)}
        {step(13)}
        <Exercise part="cleaning" title="pure hydrogen by pressure swing" />

        <Title order={4}>Part 7 — the family, old and new</Title>
        {step(14)}
        {step(15)}
        <Exercise part="future" title="CO2 and green hydrogen" />
        {step(16)}

        <Title order={4}>Part 8 — what the model does not do</Title>
        <LessonLimits limits={SYNGAS_LIMITS} />

        <Benches />
        <PanelNote>
          Every number in an exercise is the engine&apos;s, from the run you asked for;
          H₂/CO, the module and the methane conversion are ratios of the flows it
          published.  No industrial figure on this page is quoted from a source: the
          pressures named are those the corpus cases declare, and the targets are the
          stoichiometry of the equations.
        </PanelNote>
      </Stack>
    </Box>
  );
}
