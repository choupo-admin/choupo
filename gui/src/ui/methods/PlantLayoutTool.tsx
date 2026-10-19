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
  PlantLayoutTool -- "Plant layout: where each item stands, and why"
  (DEV.md 4c C75, slice 2).  A scrolling lesson with ONE bench in it: the
  ammonia synthesis loop's declared plot plan (ammonia02_full_plant), run by
  the engine in the browser every time the reader moves an item, turns the
  wind or changes how the separation table measures.

  THE ENGINE DECIDES, THE PAGE DRAWS.  The bench writes declared numbers
  into the witness's own system/layoutDict (layoutExercise.ts) and then shows
  three things the engine produced, and nothing else: its `[layout]` lines
  and any refusal, VERBATIM; the findings of its `layout {}` block; and the
  3D view of that block (the same scene builder and the same three.js
  component the Reports workspace uses, so the page draws exactly what a
  student's own run would).  No distance, bearing or finding is computed in
  this file.  Each guided move carries a sentence saying what the reader
  should see; it sits BESIDE the engine's answer, so a sentence that stopped
  being true would be visible, and the test holds each to the witness.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useRef, useState } from "react";

import {
  Alert, Anchor, Box, Button, Group, Loader, SegmentedControl, Stack, Table,
  Text, Title,
} from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";

import { methodCase, useCaseFilesRun } from "../../case/methodRun.js";
import { layoutScene } from "../../case/plantLayout.js";
import {
  canPopOutLayout, refreshLayoutStash, type LayoutPopOutStash,
} from "../../case/layoutPopOut.js";
import { fingerprintCase } from "../../case/staleness.js";
import type { CaseFiles } from "../../case/types.js";
import { openLayoutPopOut } from "../../state/useLayoutPopOut.js";
import { PlantLayout3D } from "../plotting/PlantLayout3D.js";
import { ExportLayoutButton } from "../ExportLayoutButton.js";
import { PipeRegister } from "../PlantLayoutTables.js";
import { KnobField, KnobNumber, PanelNote } from "./knobPanel.js";
import {
  LAYOUT_WITNESS, PRESETS, SHIPPED, layoutLines, layoutOverrides,
  type LayoutKnobs,
} from "./layoutExercise.js";
import { LessonLimits, LessonStepView } from "./lessonStep.js";
import {
  LAYOUT_SOURCES, PLANT_LAYOUT_LIMITS, PLANT_LAYOUT_STEPS,
} from "./plantLayoutLesson.js";
import { setActiveMethodTool } from "./registry.js";

const BENCH_ID = "plant-layout-bench";

/** The bench makes no staleness claim (case/layoutPopOut.ts). */
const NOT_STALE = { stale: false, pendingEdits: 0 } as const;

const step = (n: number) => {
  const s = PLANT_LAYOUT_STEPS.find((q) => q.n === n);
  return s ? <LessonStepView key={n} step={s} /> : null;
};

const fx = (v: number): string => (Number.isFinite(v) ? v.toFixed(2) : "—");

const KNOB_GRID = {
  display: "grid", gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))",
} as const;

function toBench(): void {
  if (typeof document !== "undefined")
    document.getElementById(BENCH_ID)?.scrollIntoView({ behavior: "smooth" });
}

function LayoutBench(): JSX.Element {
  const [knobs, setKnobs] = useState<LayoutKnobs>(SHIPPED);
  const [preset, setPreset] = useState<string>("shipped");
  const set = (patch: Partial<LayoutKnobs>) => {
    setKnobs((k) => ({ ...k, ...patch }));
    setPreset("");
  };
  const overrides = useMemo(() => layoutOverrides(knobs), [knobs]);
  //  useMethodRun's own mechanics (useCaseFilesRun, the same key), with ONE
  //  addition: the case each run was BUILT from is kept, so the pop-out tab
  //  can be titled with the fingerprint of the run it draws -- not of the
  //  knobs as they stand, which may already have moved while that run was
  //  in flight.
  const built = useRef<{ files: CaseFiles; knobs: LayoutKnobs } | null>(null);
  const run = useCaseFilesRun(() => {
    const files = methodCase(LAYOUT_WITNESS, overrides);
    built.current = { files, knobs };
    return files;
  }, `${LAYOUT_WITNESS}\u0000${JSON.stringify(knobs)}`, "choupoSolve");
  const layout = run.result?.layout;
  const scene = useMemo(() => layoutScene(layout), [layout]);
  //  The stash the 3D pop-out would carry (DEV.md 4c C78): only for a
  //  finished, unrefused run with something to draw -- the same condition
  //  under which the view below is drawn.  The bench declares no `declared`:
  //  it re-runs on every knob and nothing on it dims, so its tab does not
  //  either (case/layoutPopOut.ts).
  const popStash = useMemo<LayoutPopOutStash | null>(() => {
    if (run.busy || run.err !== null || !built.current) return null;
    const lay = run.result?.layout;
    if (!canPopOutLayout(lay)) return null;
    const edits: { [k: string]: string } = {};
    for (const [k, v] of Object.entries(built.current.knobs)) edits[k] = String(v);
    return { v: 1, source: "bench", caseName: LAYOUT_WITNESS, layout: lay,
             ran: { fingerprint: fingerprintCase(built.current.files), edits },
             declared: null };
  }, [run.result, run.busy, run.err]);
  //  An open bench tab follows the bench: each new run redraws it.
  useEffect(() => {
    if (!popStash) return;
    try { refreshLayoutStash(window.localStorage, popStash); } catch { /* blocked */ }
  }, [popStash]);
  const lines = layoutLines(run.log);
  const chosen = PRESETS.find((p) => p.id === preset);

  return (
    <Box id={BENCH_ID} p="sm"
      style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 6 }}>
      <Title order={5}>The bench: the ammonia loop&apos;s plot plan, checked by the engine</Title>
      <Text size="xs" c="dimmed" mt={4}>
        Pick a guided move, or set the numbers yourself.  Every change re-runs the
        witness {LAYOUT_WITNESS} in your browser with these values written into its
        system/layoutDict.
      </Text>
      <Group gap={6} mt={8}>
        {PRESETS.map((p) => (
          <Button key={p.id} size="compact-xs"
            variant={preset === p.id ? "filled" : "default"}
            onClick={() => { setKnobs(p.knobs); setPreset(p.id); }}>
            {p.label}
          </Button>
        ))}
      </Group>
      <Box mt={10} style={KNOB_GRID}>
        <KnobNumber label="let-down drum x [m]" value={knobs.drumX} step={0.5}
          decimals={2} onChange={(v) => set({ drumX: v })} />
        <KnobNumber label="let-down drum y [m]" value={knobs.drumY} step={0.5}
          decimals={2} onChange={(v) => set({ drumY: v })} />
        <KnobNumber label="control room x [m]" value={knobs.roomX} step={1}
          decimals={1} onChange={(v) => set({ roomX: v })} />
        <KnobNumber label="control room y [m]" value={knobs.roomY} step={1}
          decimals={1} onChange={(v) => set({ roomY: v })} />
        <KnobNumber label="wind blows FROM, true bearing [deg]" value={knobs.windFrom}
          min={0} max={359} step={15} decimals={0} onChange={(v) => set({ windFrom: v })} />
        <KnobField label="separations measured">
          <SegmentedControl size="xs" fullWidth value={knobs.measure}
            data={[{ value: "edgeToEdge", label: "edge to edge" },
                   { value: "centreToCentre", label: "centre to centre" }]}
            onChange={(v) => set({ measure: v as LayoutKnobs["measure"] })} />
        </KnobField>
      </Box>
      {chosen && (
        <Text size="sm" mt={10}>
          <Text span fw={600}>What you should see: </Text>{chosen.expect}
        </Text>
      )}

      <Title order={6} mt="sm">What the engine said</Title>
      {run.err !== null ? (
        <Alert color="red" variant="light" mt={4}
          title="Refused -- the engine's message, verbatim">
          <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
            {[...new Set([...lines.filter((l) => l.includes("layoutDict: ")), run.err])].join("\n")}
          </Text>
        </Alert>
      ) : run.busy || run.result === null ? (
        <Group gap="sm" mt={4} wrap="nowrap">
          <Loader size="xs" />
          <Text size="xs" c="dimmed">solving the loop and checking the layout …</Text>
        </Group>
      ) : lines.length === 0 ? (
        <Text size="sm" mt={4}>
          Nothing to announce: every declared distance, the wind rule and every
          zone hold for this plan.
        </Text>
      ) : (
        <Box mt={4} p={6}
          style={{ background: "var(--mantine-color-default-hover)", borderRadius: 4 }}>
          {lines.map((l, i) => (
            <Text key={i} size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{l}</Text>
          ))}
        </Box>
      )}

      {run.err === null && layout && layout.findings.length > 0 && (
        <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }} mt={6}>
          <Table striped withTableBorder fz="xs">
            <Table.Thead><Table.Tr>
              <Table.Th>finding</Table.Th><Table.Th>items</Table.Th>
              <Table.Th ta="right">measured [m]</Table.Th>
              <Table.Th ta="right">declared [m]</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {layout.findings.map((f) => (
                <Table.Tr key={f.id}>
                  <Table.Td ff="monospace">{f.kind}</Table.Td>
                  <Table.Td>{f.a} · {f.b}</Table.Td>
                  <Table.Td ta="right">{f.kind === "deadRule" || f.kind === "outsideArea" || f.kind === "sizingRefused" ? "" : fx(f.value)}</Table.Td>
                  <Table.Td ta="right">{f.kind === "outsideArea" || f.kind === "sizingRefused" ? "" : fx(f.limit)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}
      {run.err === null && scene && (
        <Box mt={8}>
          {popStash && (
            <Group justify="flex-end" mb={4} gap="xs">
              <Button size="compact-xs" variant="default"
                leftSection={<IconExternalLink size={13} />}
                title="Open this plot plan full-window in a new browser tab"
                onClick={() => openLayoutPopOut(popStash)}>
                Open in new tab
              </Button>
              {/* The bench re-runs on every knob and never dims (no `declared`):
                  its export is never stale (DEV.md 4c C81). */}
              <ExportLayoutButton layout={popStash.layout} stale={NOT_STALE}
                getStash={() => popStash} />
            </Group>
          )}
          <PlantLayout3D scene={scene} height={420} />
          {layout && <PipeRegister layout={layout} />}
          <PanelNote>
            Each item is drawn by its equipment kind on its envelope -- the diameter
            and length its sizer published, or the box the case declared; heads,
            skirts, saddles, ladders and platforms are drawing, not data.  Translucent
            cylinders are the declared zones (zone 1 wire, zone 2 faint and dashed); an
            item the engine named in a finding is painted orange and its label carries
            ⚠; the arrow is the wind.
            The tubes are the pipes the engine routed over its rack, coloured and
            shaped by phase, the particles moving in the direction of flow (faster
            for a larger mass flow, stylised).  Hover anything for its details;
            drag to orbit, right-drag to pan, wheel to zoom, Fit to frame the plant.  Every position, distance and
            zone extent in this witness is an author-set assumption for the exercise,
            not a value from any standard.
          </PanelNote>
        </Box>
      )}
    </Box>
  );
}

export function PlantLayoutTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Plant layout: where each item stands, and why</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Why the position of every item is a decision about safety, pipe and
            access; what a separation distance is and why Choupo ships none; a
            guided exercise on a real plot plan the engine checks; the prevailing
            wind and the hazardous-area zones; and what this model does not do.
          </Text>
        </Box>

        <Title order={4}>Part 1 — why layout matters</Title>
        {step(1)}
        {step(2)}

        <Title order={4}>Part 2 — separation distances</Title>
        {step(3)}
        {step(4)}
        {step(5)}

        <Title order={4}>Part 3 — the exercise</Title>
        {step(6)}
        {step(7)}
        <LayoutBench />
        {step(8)}

        <Title order={4}>Part 4 — the wind and the zones</Title>
        {step(9)}
        {step(10)}
        <Text size="sm">
          <Anchor component="button" type="button" onClick={toBench}>
            Back to the bench
          </Anchor>{" "}for moves 5 to 7.
        </Text>

        <Title order={4}>Part 5 — the trade-offs</Title>
        {step(11)}

        <LessonLimits limits={PLANT_LAYOUT_LIMITS} />
        <Text size="sm">
          Distance is one layer of protection among several.  For the others, and
          for why removing a hazard beats adding a layer, read{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("process-safety")}>
            Process safety: remove the hazard before you add a layer
          </Anchor>; for the relief devices a plan like this must also find room
          for,{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("overpressure")}>
            Designing for overpressure
          </Anchor>.
        </Text>
        <Text size="sm">
          A pharmaceutical plant is laid out mostly INSIDE a building, where the
          questions are rooms, grades, air pressures and the ways people and
          material walk through them.  That interior is the subject of{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("gmp-layout")}>
            The GMP interior of a tablet plant: rooms, air and the ways through them
          </Anchor>.
        </Text>
        <Box>
          <Title order={5}>Sources, and how each was reached</Title>
          {LAYOUT_SOURCES.map((s) => (
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
