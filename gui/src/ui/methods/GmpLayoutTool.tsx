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
  GmpLayoutTool -- "The GMP interior of a tablet plant: rooms, air and the
  ways through them" (DEV.md 4c C101).  A scrolling lesson in eight parts,
  each with an EXERCISE on the teaching building: the reader changes one
  declaration and the engine re-checks the building in the browser.

  THE ENGINE DECIDES, THE PAGE DRAWS.  Every exercise writes its edits into
  the teaching building's text (gmpLayoutExercise.ts), runs the host case
  with it, and shows three things the engine produced, and nothing else: its
  `[building]` lines and any refusal, VERBATIM; the findings of its
  `building {}` block; and the floor plan of that block (the same SVG plan
  Reports draws, a room the engine named outlined in orange).  No pressure,
  gown or crossing is computed in this file.  The sentence each move carries
  sits BESIDE the engine's answer, and the test holds it to a native run.

  ONE RUN ON LOAD.  The building as designed is run once, at the top, and
  drawn whole (3D cutaway, plans, room schedule) by the Reports section; an
  exercise box shows that run until its reader picks a move, and runs the
  engine only then -- eight boxes running at once on load would make the
  page wait on work nobody asked for.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Anchor, Box, Button, Code, Group, Loader, ScrollArea, SegmentedControl,
  Stack, Table, Text, Title,
} from "@mantine/core";

import type { GmpBuilding } from "../../adapters/buildingPayload.js";
import { floorPlans, type FloorPlan } from "../../case/gmpBuilding.js";
import { useCaseFilesRun, type MethodRunState } from "../../case/methodRun.js";
import { layoutScene } from "../../case/plantLayout.js";
import { FloorPlanSvg, GmpBuildingSection } from "../GmpBuildingSection.js";
import { caseTabSearch, openAppTab } from "../openInTab.js";
import { KnobNumber, PanelNote } from "./knobPanel.js";
import {
  AS_DESIGNED, GMP_HOST, GMP_TEACHING_FILE, GMP_WITNESS, KNOBS, MOVES,
  TEACHING_LAYOUT, buildingLines, gmpCase, type GmpMove, type GmpPart, type LayoutEdit,
} from "./gmpLayoutExercise.js";
import { GMP_LAYOUT_LIMITS, GMP_LAYOUT_STEPS, GMP_SOURCES } from "./gmpLayoutLesson.js";
import { LessonLimits, LessonStepView } from "./lessonStep.js";
import { setActiveMethodTool } from "./registry.js";

const step = (n: number) => {
  const s = GMP_LAYOUT_STEPS.find((q) => q.n === n);
  return s ? <LessonStepView key={n} step={s} /> : null;
};

const fx = (v: number): string => (Number.isFinite(v) ? String(Number(v.toFixed(3))) : "—");

/** What the engine said, and what it drew, for one run. */
function EngineAnswer({ run, building, plans }: {
  run: MethodRunState; building: GmpBuilding | undefined; plans: FloorPlan[];
}): JSX.Element {
  const [floor, setFloor] = useState("ground");
  const lines = buildingLines(run.log);
  const plan = plans.find((p) => p.floor === floor) ?? plans[0];
  const flows = { personnel: true, material: true, waste: true } as const;
  return (
    <>
      <Title order={6} mt="sm">What the engine said</Title>
      {run.err !== null ? (
        <Alert color="red" variant="light" mt={4}
          title="Refused -- the engine's message, verbatim">
          <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
            {(() => {
              //  The refusal as the engine printed it; the run's own summary
              //  line only when the log carries none (it repeats the same
              //  sentence behind a prefix otherwise).
              const refusal = lines.filter((l) => l.includes("layoutDict building: "));
              return (refusal.length > 0 ? refusal : [run.err]).join("\n");
            })()}
          </Text>
        </Alert>
      ) : run.busy || run.result === null ? (
        <Group gap="sm" mt={4} wrap="nowrap">
          <Loader size="xs" />
          <Text size="xs" c="dimmed">solving the host case and checking the building …</Text>
        </Group>
      ) : lines.length === 0 ? (
        <Text size="sm" mt={4}>
          Nothing to announce: every rule holds for this building.
        </Text>
      ) : (
        <Box mt={4} p={6}
          style={{ background: "var(--mantine-color-default-hover)", borderRadius: 4 }}>
          {lines.map((l, i) => (
            <Text key={i} size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{l}</Text>
          ))}
        </Box>
      )}
      {run.err === null && !run.busy && building && building.findings.length > 0 && (
        <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }} mt={6}>
          <Table striped withTableBorder fz="xs">
            <Table.Thead><Table.Tr>
              <Table.Th>finding</Table.Th><Table.Th>about</Table.Th>
              <Table.Th ta="right">value</Table.Th><Table.Th ta="right">limit</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {building.findings.map((f) => (
                <Table.Tr key={f.id}>
                  <Table.Td ff="monospace">{f.kind}</Table.Td>
                  <Table.Td>{[f.a, f.b].filter(Boolean).join(" · ")}</Table.Td>
                  <Table.Td ta="right">{fx(f.value)}</Table.Td>
                  <Table.Td ta="right">{fx(f.limit)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}
      {run.err === null && !run.busy && plan && (
        <Box mt={8}>
          {plans.length > 1 && (
            <SegmentedControl size="xs" mb={4} value={plan.floor} onChange={setFloor}
              data={plans.map((p) => ({ value: p.floor, label: `${p.floor} (${p.elevation} m)` }))} />
          )}
          <FloorPlanSvg plan={plan} flows={flows} />
        </Box>
      )}
    </>
  );
}

/** The declaration a move changes, as a diff a reader can copy. */
function EditDiff({ edits }: { edits: readonly LayoutEdit[] }): JSX.Element | null {
  if (edits.length === 0) return null;
  return (
    <Box mt={8}>
      <Text size="xs" fw={600}>The declaration you changed</Text>
      {edits.map((e, i) => (
        <Code key={i} block mt={4} style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>
          {(e.room ? `// in room ${e.room}\n` : "")
            + `- ${e.from.trim()}\n+ ${e.to.trim() || "(removed)"}`}
        </Code>
      ))}
    </Box>
  );
}

/** One part's exercise: its guided moves (and a number, where the part has
 *  one), the engine's answer and the plan. */
function Exercise({ part, base, title }: {
  part: GmpPart; base: MethodRunState; title: string;
}): JSX.Element {
  const moves = MOVES[part];
  const knob = KNOBS[part];
  const [chosen, setChosen] = useState<string>(AS_DESIGNED.id);
  const [value, setValue] = useState<number | null>(null);
  const move: GmpMove | undefined = chosen === "knob" ? undefined
    : [AS_DESIGNED, ...moves].find((m) => m.id === chosen);
  const edits: readonly LayoutEdit[] = chosen === "knob" && knob && value !== null
    ? [knob.edit(value)] : move?.edits ?? [];
  const own = useCaseFilesRun(edits.length > 0 ? () => gmpCase(edits) : null,
    `gmp\u0000${JSON.stringify(edits)}`, "choupoSolve");
  const run = edits.length > 0 ? own : base;
  const building = run.err === null ? run.result?.building : undefined;
  const plans = useMemo(() => (building ? floorPlans(building) : []), [building]);
  const pick = (id: string) => { setChosen(id); setValue(null); };

  return (
    <Box p="sm" style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 6 }}
      data-gmp-exercise={part}>
      <Title order={5}>Exercise: {title}</Title>
      <Group gap={6} mt={8}>
        {[AS_DESIGNED, ...moves].map((m) => (
          <Button key={m.id} size="compact-xs"
            variant={chosen === m.id ? "filled" : "default"}
            onClick={() => pick(m.id)}>
            {m.label}
          </Button>
        ))}
      </Group>
      {knob && (
        <Box mt={10} maw={260}>
          <KnobNumber label={`${knob.label} [${knob.unit}]`}
            value={value ?? knob.shipped} min={knob.min} max={knob.max} step={knob.step}
            decimals={knob.step < 1 ? 1 : 0}
            onChange={(v) => { setValue(v); setChosen(v === knob.shipped ? AS_DESIGNED.id : "knob"); }} />
        </Box>
      )}
      {move && (
        <Text size="sm" mt={10}>
          <Text span fw={600}>What you should see: </Text>{move.expect}
        </Text>
      )}
      {chosen === "knob" && (
        <Text size="sm" mt={10} c="dimmed">
          Your own value: read the engine&apos;s answer below.
        </Text>
      )}
      <EditDiff edits={edits} />
      <EngineAnswer run={run} building={building} plans={plans} />
    </Box>
  );
}

/** The building as designed, drawn whole -- the Reports section itself. */
function TeachingBuilding({ base }: { base: MethodRunState }): JSX.Element {
  const [showFile, setShowFile] = useState(false);
  const layout = base.result?.layout;
  const scene = useMemo(() => layoutScene(layout), [layout]);
  const building = base.result?.building;
  return (
    <Box p="sm" style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 6 }}>
      <Title order={5}>The teaching building, as the engine checked it</Title>
      <Text size="xs" c="dimmed" mt={4}>
        A copy of the tutorial {GMP_HOST} (one sized spray dryer), run in your browser
        with the teaching building written in as its system/layoutDict.  The tutorial
        on disk is not changed; the building is the file {GMP_TEACHING_FILE}.
      </Text>
      <Button size="compact-xs" variant="default" mt={6}
        onClick={() => setShowFile((s) => !s)}>
        {showFile ? "Hide" : "Read"} the declaration (system/layoutDict)
      </Button>
      {showFile && (
        <ScrollArea h={360} mt={6}>
          <Code block style={{ fontSize: 11 }}>{TEACHING_LAYOUT}</Code>
        </ScrollArea>
      )}
      {base.err !== null ? (
        <Alert color="red" variant="light" mt={6} title="The engine did not finish">
          <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{base.err}</Text>
        </Alert>
      ) : base.busy || !building || !scene ? (
        <Group gap="sm" mt={6} wrap="nowrap">
          <Loader size="xs" />
          <Text size="xs" c="dimmed">solving the host case and checking the building …</Text>
        </Group>
      ) : (
        <GmpBuildingSection building={building} scene={scene} />
      )}
      <PanelNote>
        Every room, grade, pressure and distance in the teaching building is an
        author-set assumption for the exercise, except the 10 Pa step, which is
        declared from EU GMP Annex 1 para 4.14.  The dryer of the host tutorial
        evaporates water; its room is declared a solvent suite for the exercise.
      </PanelNote>
    </Box>
  );
}

export function GmpLayoutTool(): JSX.Element {
  const base = useCaseFilesRun(() => gmpCase([]), "gmp\u0000as-designed", "choupoSolve");
  const ex = (part: GmpPart, title: string) => <Exercise part={part} base={base} title={title} />;
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>The GMP interior of a tablet plant: rooms, air and the ways through them</Title>
          <Text size="sm" c="dimmed" mt={4}>
            The cleanliness grades, the pressure cascade, airlocks, gowning,
            containment of a potent ingredient, the three flows, solvents and
            hazardous areas, and escape -- each with an exercise on a small teaching
            building the engine checks in your browser; and what the model does not
            do.  The plot plan outside the building is the subject of{" "}
            <Anchor component="button" type="button"
              onClick={() => setActiveMethodTool("plant-layout")}>
              Plant layout: where each item stands, and why
            </Anchor>.
          </Text>
        </Box>

        <Title order={4}>Part 1 — cleanliness grades</Title>
        {step(1)}
        {step(2)}
        <TeachingBuilding base={base} />
        {ex("grades", "a cleaner room asks more of its neighbours")}

        <Title order={4}>Part 2 — the pressure cascade</Title>
        {step(3)}
        {step(4)}
        {ex("cascade", "the coating room's pressure")}

        <Title order={4}>Part 3 — airlocks</Title>
        {step(5)}
        {step(6)}
        {ex("airlocks", "the regime is a statement about pressure")}

        <Title order={4}>Part 4 — gowning</Title>
        {step(7)}
        {ex("gowning", "the gown and the grade")}

        <Title order={4}>Part 5 — containment of a potent ingredient</Title>
        {step(8)}
        {ex("containment", "dust stays in")}

        <Title order={4}>Part 6 — people, material and waste, one way each</Title>
        {step(9)}
        {step(10)}
        {ex("flows", "the three flows")}

        <Title order={4}>Part 7 — solvents and ATEX</Title>
        {step(11)}
        {step(12)}
        {ex("atex", "the suite and the switchgear")}

        <Title order={4}>Part 8 — escape</Title>
        {step(13)}
        {ex("escape", "a way out of every room")}

        <Title order={4}>A real plant</Title>
        {step(14)}
        <Group>
          <Button size="xs" variant="light"
            onClick={() => openAppTab(caseTabSearch(GMP_WITNESS))}>
            Open {GMP_WITNESS} in a new tab
          </Button>
        </Group>

        <LessonLimits limits={GMP_LAYOUT_LIMITS} />
        <Box>
          <Title order={5}>Sources, and how each was reached</Title>
          {GMP_SOURCES.map((s) => (
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
