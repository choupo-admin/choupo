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
  MaterialsTool -- "Materials of construction, seals and gaskets: the
  Pareto, and how to choose" (DEV.md 4c C84).  A scrolling lesson in six
  parts, with ONE bench near its end.

  THE ENGINE DECIDES, THE PAGE DRAWS.  The bench re-runs the corpus case
  ammoniaReactor03_equilibriumApproach in the browser with one vessel's
  `material` word changed (materialsBench.ts) and shows, for that vessel,
  what the engine published -- wall, weight, F_M, F_P, bare-module cost --
  and the warnings it raised, verbatim.  Beside them it shows what each
  material RECORD declares, read from data/standards/assets/.  Nothing is
  computed in this file: no wall, no factor, no comparison of a record's
  limit with a service condition (the engine makes both the maxP and the
  maxT comparison and announces each; the page names which one the engine's
  own line is about, read from that line's words).

  The runs are taken ONE AT A TIME through useCaseFilesRun, and every answer
  the engine gives is kept in a table for the session, so a reader can pick
  materials one by one or ask for all of them in turn.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useRef, useState } from "react";

import {
  Alert, Anchor, Box, Button, Group, Loader, SegmentedControl, Stack, Table, Text, Title,
} from "@mantine/core";

import { useCaseFilesRun } from "../../case/methodRun.js";
import { filesToCaseFiles } from "../../cases/tutorials.js";
import { KnobField, PanelNote } from "./knobPanel.js";
import { LessonLimits, LessonStepView } from "./lessonStep.js";
import {
  BENCH_VESSELS, MATERIALS_WITNESS, benchFiles, constructionMaterials,
  vesselAnswer, vesselLines, type VesselAnswer,
} from "./materialsBench.js";
import {
  MATERIALS_LIMITS, MATERIALS_SOURCES, MATERIALS_STEPS, PARETO_ROWS,
} from "./materialsLesson.js";
import { setActiveMethodTool } from "./registry.js";
import { OriginMark } from "./origin.js";

const step = (n: number) => {
  const s = MATERIALS_STEPS.find((q) => q.n === n);
  return s ? <LessonStepView key={n} step={s} /> : null;
};

const BORDER = "1px solid var(--mantine-color-default-border)";

const fx = (v: number | null | undefined, d: number): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(d);
const kEur = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : (v / 1000).toFixed(1);

function ParetoTable(): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder fz="xs" miw={560}>
        <Table.Thead><Table.Tr>
          <Table.Th>family (in the order an engineer reaches for it)</Table.Th>
          <Table.Th>first chosen for</Table.Th>
          <Table.Th>what defeats it</Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {PARETO_ROWS.map((r) => (
            <Table.Tr key={r.family}>
              <Table.Td fw={600}>{r.family}</Table.Td>
              <Table.Td>{r.firstFor}</Table.Td>
              <Table.Td>{r.defeatedBy}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <PanelNote>
        A teaching ordering, not a measured market share: no row carries a
        number, and none was invented.
      </PanelNote>
    </Box>
  );
}

/** One answer of the engine, kept for the session. */
interface Kept { answer: VesselAnswer | null; lines: string[]; err: string | null }

function MaterialsBench(): JSX.Element {
  const materials = useMemo(() => constructionMaterials(), []);
  const [vessel, setVessel] = useState<string>(BENCH_VESSELS[0]!.unit);
  const shipped = BENCH_VESSELS.find((v) => v.unit === vessel)!.shipped;
  const [material, setMaterial] = useState<string>(shipped);
  const [queue, setQueue] = useState<string[]>([]);
  const [kept, setKept] = useState<Map<string, Kept>>(new Map());
  //  Which (vessel, material) the run in hand was BUILT from: a result is
  //  filed under the case it answered, never under the knob as it now stands.
  const built = useRef<string | null>(null);

  const key = `${vessel}|${material}`;
  const run = useCaseFilesRun(() => {
    built.current = key;
    return filesToCaseFiles(MATERIALS_WITNESS, benchFiles(vessel, material));
  }, `${MATERIALS_WITNESS}\u0000${key}`, "choupoSolve");

  useEffect(() => {
    if (run.busy || built.current === null) return;
    if (run.result === null && run.err === null) return;
    const k = built.current;
    const unit = k.split("|")[0]!;
    const entry: Kept = run.err !== null
      ? { answer: null, lines: vesselLines(run.log, unit), err: run.err }
      : { answer: vesselAnswer(run.result?.equipment, unit),
          lines: vesselLines(run.log, unit), err: null };
    setKept((m) => (m.get(k) === entry ? m : new Map(m).set(k, entry)));
    if (k === key && queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      setMaterial(next!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.result, run.err, run.busy]);

  const pickVessel = (u: string) => {
    setVessel(u);
    setQueue([]);
    setMaterial(BENCH_VESSELS.find((v) => v.unit === u)!.shipped);
  };
  const runAll = () => {
    const todo = materials.map((m) => m.name).filter((n) => !kept.has(`${vessel}|${n}`));
    if (todo.length === 0) return;
    const [first, ...rest] = todo;
    setQueue(rest);
    setMaterial(first!);
  };
  const now = kept.get(key);

  return (
    <Box p="sm" style={{ border: BORDER, borderRadius: 6 }}>
      <Title order={5}>The bench: one vessel, every material the records carry</Title>
      <OriginMark of={["engine", "assumption"]} note="the vessel and the material are your choice; the wall, the limits and the cost are the engine's sizing and costing passes, re-run in this browser on the catalogue's material records" />
      <Text size="xs" c="dimmed" mt={4}>
        Each choice re-runs {MATERIALS_WITNESS} in your browser with this vessel&apos;s
        `material` word in system/postDict changed, and keeps the engine&apos;s answer
        below.  The shipped material is the one the case declares.
      </Text>
      <Box mt={10}>
        <KnobField label="vessel">
          <SegmentedControl size="xs" fullWidth value={vessel} onChange={pickVessel}
            data={BENCH_VESSELS.map((v) => ({ value: v.unit, label: v.unit }))} />
        </KnobField>
        <Text size="xs" c="dimmed" mt={2}>
          {BENCH_VESSELS.find((v) => v.unit === vessel)!.label}; shipped as {shipped}.
        </Text>
      </Box>
      <Group gap={6} mt={8}>
        {materials.map((m) => (
          <Button key={m.name} size="compact-xs"
            variant={material === m.name ? "filled" : "default"}
            onClick={() => { setQueue([]); setMaterial(m.name); }}>
            {m.name}{m.name === shipped ? " (shipped)" : ""}
          </Button>
        ))}
        <Button size="compact-xs" variant="light" onClick={runAll}>
          run every material in turn
        </Button>
      </Group>

      <Title order={6} mt="sm">What the engine said about {vessel}, with {material}</Title>
      {run.busy || (!now && run.err === null) ? (
        <Group gap="sm" mt={4} wrap="nowrap">
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            solving the loop and sizing the vessels …
            {queue.length > 0 ? ` (${queue.length} more queued)` : ""}
          </Text>
        </Group>
      ) : now?.err ? (
        <Alert color="red" variant="light" mt={4}
          title="Refused -- the engine's message, verbatim">
          <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
            {[...now.lines, now.err].join("\n")}
          </Text>
        </Alert>
      ) : now && now.lines.length > 0 ? (
        <Box mt={4} p={6}
          style={{ background: "var(--mantine-color-default-hover)", borderRadius: 4 }}>
          {now.lines.map((l, i) => (
            <Text key={i} size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{l}</Text>
          ))}
        </Box>
      ) : (
        <Text size="sm" mt={4}>Nothing announced about this vessel.</Text>
      )}

      <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }} mt={8}>
        <Table striped withTableBorder fz="xs" miw={760}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th rowSpan={2}>material</Table.Th>
              <Table.Th colSpan={5} ta="center">what the record declares</Table.Th>
              <Table.Th colSpan={6} ta="center">what the engine published for {vessel}</Table.Th>
            </Table.Tr>
            <Table.Tr>
              <Table.Th ta="right">sigma_y [MPa], used as the allowable S</Table.Th>
              <Table.Th ta="right">density [kg/m3]</Table.Th>
              <Table.Th ta="right">F_M</Table.Th>
              <Table.Th ta="right">maxP [bar]</Table.Th>
              <Table.Th ta="right">maxT [K]</Table.Th>
              <Table.Th ta="right">wall [mm] — teaching estimate*</Table.Th>
              <Table.Th ta="right">weight [kg]</Table.Th>
              <Table.Th ta="right">F_M</Table.Th>
              <Table.Th ta="right">F_P</Table.Th>
              <Table.Th ta="right">C_BM [kEUR]</Table.Th>
              <Table.Th>rating warning</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {materials.map((m) => {
              const k = kept.get(`${vessel}|${m.name}`);
              const a = k?.answer;
              const ratingLines = k?.lines.filter((l) => l.includes("[rating]")) ?? [];
              const ratingWords = [
                ratingLines.some((l) => l.includes("design pressure")) ? "maxP" : "",
                ratingLines.some((l) => l.includes("service temperature")) ? "maxT" : "",
              ].filter(Boolean).join(", ");
              return (
                <Table.Tr key={m.name}>
                  <Table.Td fw={m.name === material ? 700 : 400}>
                    {m.name}{m.name === shipped ? " (shipped)" : ""}
                  </Table.Td>
                  <Table.Td ta="right">{fx(m.sigma_y, 0)}</Table.Td>
                  <Table.Td ta="right">{fx(m.density, 0)}</Table.Td>
                  <Table.Td ta="right">{fx(m.F_M, 2)}</Table.Td>
                  <Table.Td ta="right">{fx(m.maxP, 0)}</Table.Td>
                  <Table.Td ta="right">{fx(m.maxT, 0)}</Table.Td>
                  <Table.Td ta="right">{k ? fx(a?.t_wall_mm, 1) : "not run"}</Table.Td>
                  <Table.Td ta="right">{k ? fx(a?.weight_kg, 0) : ""}</Table.Td>
                  <Table.Td ta="right">{k ? fx(a?.F_M, 2) : ""}</Table.Td>
                  <Table.Td ta="right">{k ? fx(a?.F_P, 2) : ""}</Table.Td>
                  <Table.Td ta="right">{k ? kEur(a?.bareModule) : ""}</Table.Td>
                  <Table.Td>{k ? (k.err ? "refused" : ratingWords ? `yes (${ratingWords})` : "none") : ""}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Box>
      <Text size="xs" mt={4} fw={600}>
        * Teaching estimate — temperature-dependent strength not modelled.  Each
        wall is the thin-shell formula on ONE stress per record, the same at
        300 K and at 700 K, with no minimum design temperature: it shows how
        the formula responds to a material, and is not a mechanical design of
        this vessel at its service temperature.
      </Text>
      <PanelNote>
        The record columns are the files&apos; own declarations; the engine columns are
        read off the run&apos;s equipment list (its design sheet and cost row for this
        vessel), and nothing in them is computed on this page.  sigma_y is the
        number the engine uses as the allowable stress S: despite its symbol it
        is not a yield strength (carbonSteel&apos;s header labels its 140 MPa an
        allowable at 250 degrees C), and nothing here derives an allowable from
        a yield or tensile strength at temperature, as a pressure code does.
        F_M is a third, unrelated number: a cost factor, not a strength.  The engine compares maxP with
        the design pressure, and maxT with the hottest stream on the vessel&apos;s ports,
        and warns on each; it sizes and prices the vessel anyway, on the same
        allowable stress at every temperature.  Every number
        in these records is labelled by its own header as unsourced or awaiting
        primary re-citation, except the two F_M values that cite Turton.
      </PanelNote>
    </Box>
  );
}

export function MaterialsTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Materials of construction, seals and gaskets</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Why the material of every wall decides a plant; the Pareto of the
            materials chemical plants are built from, carbon steel first; the
            metallurgy behind it; how a material is chosen against corrosion,
            temperature, cracking and cost; how the joints and shafts are sealed;
            and what Choupo does with a material -- and what it does not.
          </Text>
        </Box>

        <Title order={4}>Part 1 — why materials decide a plant</Title>
        {step(1)}

        <Title order={4}>Part 2 — the Pareto</Title>
        {step(2)}
        {step(3)}
        {step(4)}
        {step(5)}
        {step(6)}
        {step(7)}
        <ParetoTable />

        <Title order={4}>Part 3 — metallurgy</Title>
        {step(8)}
        {step(9)}
        {step(10)}
        {step(11)}
        {step(12)}
        {step(13)}

        <Title order={4}>Part 4 — how to choose</Title>
        {step(14)}
        {step(15)}
        {step(16)}
        {step(17)}
        {step(18)}

        <Title order={4}>Part 5 — seals and gaskets</Title>
        {step(19)}
        {step(20)}
        {step(21)}

        <Title order={4}>Part 6 — what Choupo does with a material</Title>
        {step(22)}
        {step(23)}
        <MaterialsBench />

        <LessonLimits limits={MATERIALS_LIMITS} />
        <Text size="sm">
          The wall and the cost on the bench are the vessel-sizing and costing passes
          a whole plant goes through; for where in a design the material of each
          item is fixed, read{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("front-end-loading")}>
            Front-End Loading
          </Anchor>
          ; for the relief valve every pressure vessel on the bench would also need,{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("overpressure")}>
            Designing for overpressure
          </Anchor>.
        </Text>
        <Box>
          <Title order={5}>Sources, and how each was reached</Title>
          {MATERIALS_SOURCES.map((s) => (
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
