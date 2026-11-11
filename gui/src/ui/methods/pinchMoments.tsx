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
  The pieces of the Pinch EduTool that DEV.md 4c C305 added: the three
  moments (Understand / Experiment / Verify), the predictions asked before a
  run and checked against the engine after it, the "is it economic?" step and
  the witness network with one exchanger across the pinch.

  Everything a student types here is local UI state: nothing is stored,
  nothing is scored.  A comparison prints the student's guess and the
  engine's number side by side and says nothing about which is "right" --
  the reader judges (C305, point 3).

  The only arithmetic is the witness network's account, and it lives in a
  pure, tested module (case/pinchViolations.ts); every other number is the
  engine's, passed in.
\*---------------------------------------------------------------------------*/

import { useState, type ReactNode } from "react";
import {
  Badge, Box, Button, Group, NumberInput, SegmentedControl, Table, Text,
  Textarea, Title,
} from "@mantine/core";

import type { PinchUnits } from "../../case/pinchUnits.js";
import {
  accountNetwork, crossingWitness, processStreams, type NetworkAccount,
  type PinchFrame,
} from "../../case/pinchViolations.js";
import type { StreamRow } from "../../case/pinch.js";
import { SortTh, useSortable } from "../SortableTable.js";
import { LessonStepView } from "./lessonStep.js";
import {
  PINCH_ECONOMIC_STEP, PINCH_PREDICTIONS, type PinchPrediction,
} from "./pinchLesson.js";

const BORDER = "var(--mantine-color-default-border)";

// ---- The three moments -------------------------------------------------------

export type MomentId = "understand" | "experiment" | "verify";

export const PINCH_MOMENTS: readonly { id: MomentId; title: string; lead: string }[] = [
  { id: "understand", title: "Understand · the physical problem",
    lead: "How much heating and cooling the plant needs before any exchanger "
      + "is drawn: the composite curves, the heat the process can recover "
      + "from itself, and the pinch that splits it in two." },
  { id: "experiment", title: "Experiment · the knobs",
    lead: "ΔT_min and the stream data are yours to change.  Before each run, "
      + "write what you expect; the engine's answer is then printed beside "
      + "your guess." },
  { id: "verify", title: "Verify · every number, its file and its assumptions",
    lead: "The engine's stream table and worked cascade, the files and the "
      + "source the numbers come from, what the method assumes, and where "
      + "to read further." },
];

/** The three buttons at the head of the page: each scrolls to its moment. */
export function MomentsNav(): JSX.Element {
  const go = (id: MomentId) => {
    const el = typeof document === "undefined" ? null
      : document.querySelector(`[data-moment="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <Group gap={6} data-moments-nav="">
      {PINCH_MOMENTS.map((m, i) => (
        <Button key={m.id} size="compact-sm" variant="light" onClick={() => go(m.id)}>
          {i + 1} · {m.title.split(" · ")[0]}
        </Button>
      ))}
    </Group>
  );
}

/** One moment: an <h4> (a chapter of the page, chapters.ts) and its lead. */
export function Moment({ id, children }: { id: MomentId; children: ReactNode }): JSX.Element {
  const m = PINCH_MOMENTS.find((x) => x.id === id)!;
  const n = PINCH_MOMENTS.indexOf(m) + 1;
  return (
    <Box data-moment={id} pt="sm"
      style={{ borderTop: `2px solid ${BORDER}`, scrollMarginTop: 8 }}>
      <Title order={4}>{n} · {m.title}</Title>
      <Text size="sm" c="dimmed" mt={2} mb="sm">{m.lead}</Text>
      <Box style={{ display: "flex", flexDirection: "column", gap: 16 }}>{children}</Box>
    </Box>
  );
}

// ---- A prediction card -------------------------------------------------------

function PredictionCard({ p, children }: { p: PinchPrediction; children: ReactNode }): JSX.Element {
  return (
    <Box px="sm" py="xs" data-prediction={p.id}
      style={{ border: `1px solid ${BORDER}`, borderRadius: 6,
        borderLeft: `3px solid var(--mantine-color-${p.designExercise ? "grape" : "accent"}-5)` }}>
      <Group gap={8} mb={4}>
        <Title order={5}>{p.title}</Title>
        {p.designExercise && (
          <Badge color="grape" variant="light" styles={{ root: { textTransform: "none" } }}>
            DESIGN EXERCISE — the tool does not build networks
          </Badge>
        )}
      </Group>
      <Text size="sm">{p.prompt}</Text>
      <Text size="xs" c="dimmed" mt={4}>{p.check}</Text>
      <Box mt={8}>{children}</Box>
    </Box>
  );
}

/** Guess and engine, side by side: a table of rows, never a verdict. */
function SideBySide({ rows }: { rows: { what: string; yours: string; engine: string }[] }): JSX.Element {
  return (
    <Table withTableBorder fz="xs" mt={6} data-side-by-side="">
      <Table.Thead>
        <Table.Tr><Table.Th /><Table.Th>your prediction</Table.Th><Table.Th>the engine</Table.Th></Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r) => (
          <Table.Tr key={r.what}>
            <Table.Td>{r.what}</Table.Td><Table.Td>{r.yours}</Table.Td><Table.Td>{r.engine}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

const numOrNull = (v: string | number): number | null =>
  (typeof v === "number" && Number.isFinite(v)) ? v
    : (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

type Direction = "rise" | "fall" | "stay";

/** The direction a change reads as, with a tolerance of half a unit of the
 *  printed precision (0.5 % of the larger value, at least 1e-6). */
export function directionOf(before: number, after: number): Direction {
  const tol = Math.max(1e-6, 0.005 * Math.max(Math.abs(before), Math.abs(after)));
  return after > before + tol ? "rise" : after < before - tol ? "fall" : "stay";
}

/** PREDICTION 1 -- dTmin 20 -> 10 K.  The engine runs are the caller's (a
 *  sweep of two override sets); this card holds the guess and draws both. */
export function DtminPrediction({ enabled, onRun, busy, err, at20, at10, u }: {
  enabled: boolean;
  onRun: () => void;
  busy: boolean;
  err: string | null;
  at20?: { [k: string]: number };
  at10?: { [k: string]: number };
  u: PinchUnits;
}): JSX.Element {
  const p = PINCH_PREDICTIONS.find((x) => x.id === "dTmin")!;
  const [dir, setDir] = useState<Direction | "">("");
  const [by, setBy] = useState<string | number>("");
  const guessed = dir !== "";
  const QH20 = at20?.["Q_H_min_kW"], QH10 = at10?.["Q_H_min_kW"];
  const QC20 = at20?.["Q_C_min_kW"], QC10 = at10?.["Q_C_min_kW"];
  const done = QH20 !== undefined && QH10 !== undefined && QC20 !== undefined && QC10 !== undefined;
  const g = done ? u.group([QH20!, QH10!, QC20!, QC10!, Math.abs(QH10! - QH20!)]) : null;
  const byN = numOrNull(by);
  return (
    <PredictionCard p={p}>
      <Group gap={8} align="flex-end" wrap="wrap">
        <SegmentedControl size="xs" value={dir} onChange={(v) => setDir(v as Direction)}
          data={[{ label: "rise", value: "rise" }, { label: "fall", value: "fall" },
            { label: "stay", value: "stay" }]} />
        <NumberInput size="xs" w={170} label={`by about (${u.qLabel})`} value={by}
          onChange={setBy} min={0} />
        <Button size="xs" disabled={!enabled || !guessed || busy} onClick={onRun}>
          run the engine at 20 K and at 10 K
        </Button>
      </Group>
      {!enabled && (
        <Text size="xs" c="dimmed" mt={4}>Available in Classroom mode (the witness streams).</Text>
      )}
      {enabled && !guessed && (
        <Text size="xs" c="dimmed" mt={4}>Choose rise, fall or stay first: the run waits for your guess.</Text>
      )}
      {busy && <Text size="xs" c="dimmed" mt={4}>The engine is running both cases…</Text>}
      {err && <Text size="xs" c="red" ff="monospace" mt={4}>{err}</Text>}
      {done && g && (
        <SideBySide rows={[
          { what: "Q_H,min, 20 K → 10 K",
            yours: `${dir}${byN !== null ? ` by about ${u.n(byN)} ${u.qLabel}` : ""}`,
            engine: `${g(QH20!)} → ${g(QH10!)} ${u.qLabel}: ${directionOf(QH20!, QH10!)}`
              + ` by ${g(Math.abs(QH10! - QH20!))} ${u.qLabel}` },
          { what: "Q_C,min, 20 K → 10 K", yours: "—",
            engine: `${g(QC20!)} → ${g(QC10!)} ${u.qLabel}: ${directionOf(QC20!, QC10!)}`
              + ` by ${g(Math.abs(QC10! - QC20!))} ${u.qLabel}` },
          { what: "pinch, T*", yours: "—",
            engine: `${at20?.["T_pinch_K"] !== undefined && at20?.["pinch_exists"] ? u.T(at20["T_pinch_K"]!) : "none"}`
              + ` → ${at10?.["T_pinch_K"] !== undefined && at10?.["pinch_exists"] ? u.T(at10["T_pinch_K"]!) : "none"} ${u.tLabel}` },
        ]} />
      )}
    </PredictionCard>
  );
}

/** PREDICTION 2 -- make the interior pinch disappear.  The engine's class at
 *  the current knob values is passed in; the student's explanation is not
 *  read by anything. */
export function NoPinchPrediction({ engineClass, classText, changed, live }: {
  engineClass: string | null;
  classText: string | null;
  changed: string[];
  live: boolean;
}): JSX.Element {
  const p = PINCH_PREDICTIONS.find((x) => x.id === "noPinch")!;
  const [why, setWhy] = useState("");
  return (
    <PredictionCard p={p}>
      <Textarea size="xs" autosize minRows={2} value={why}
        placeholder="which stream, which way, and why the pinch should leave the interior"
        onChange={(e) => setWhy(e.currentTarget.value)} />
      {live && engineClass && (
        <SideBySide rows={[
          { what: "knobs moved from the witness",
            yours: why.trim() === "" ? "(no explanation written yet)" : why.trim(),
            engine: changed.length > 0 ? changed.join("; ") : "none — the witness as shipped" },
          { what: "the engine's class",
            yours: "—",
            engine: `${engineClass}${classText ? ` · ${classText}` : ""}` },
        ]} />
      )}
    </PredictionCard>
  );
}

/** THE DESIGN EXERCISE -- a network approaching the targets.  The tool reads
 *  the two utility duties the student's network uses and prints them beside
 *  the engine's targets, with the first-law check every network obeys. */
export function NetworkExercise({ QHmin, QCmin, u }: {
  QHmin?: number; QCmin?: number; u: PinchUnits;
}): JSX.Element {
  const p = PINCH_PREDICTIONS.find((x) => x.id === "network")!;
  const [qh, setQh] = useState<string | number>("");
  const [qc, setQc] = useState<string | number>("");
  const QH = numOrNull(qh), QC = numOrNull(qc);
  const ready = QH !== null && QC !== null && QHmin !== undefined && QCmin !== undefined;
  const g = ready ? u.group([QH!, QC!, QHmin!, QCmin!, QH! - QC!, QHmin! - QCmin!]) : null;
  return (
    <PredictionCard p={p}>
      <Group gap={8} wrap="wrap">
        <NumberInput size="xs" w={210} label={`your network's Q_H (${u.qLabel})`}
          value={qh} onChange={setQh} min={0} />
        <NumberInput size="xs" w={210} label={`your network's Q_C (${u.qLabel})`}
          value={qc} onChange={setQc} min={0} />
      </Group>
      {ready && g && (
        <SideBySide rows={[
          { what: "hot utility", yours: `${g(QH!)} ${u.qLabel}`,
            engine: `target Q_H,min ${g(QHmin!)} ${u.qLabel} (your excess ${g(QH! - QHmin!)})` },
          { what: "cold utility", yours: `${g(QC!)} ${u.qLabel}`,
            engine: `target Q_C,min ${g(QCmin!)} ${u.qLabel} (your excess ${g(QC! - QCmin!)})` },
          { what: "first law: Q_H − Q_C", yours: `${g(QH! - QC!)} ${u.qLabel}`,
            engine: `Q_H,min − Q_C,min = ${g(QHmin! - QCmin!)} ${u.qLabel}`
              + (Math.abs((QH! - QC!) - (QHmin! - QCmin!)) > 0.005 * Math.max(1, Math.abs(QHmin! - QCmin!))
                ? " — the two differ, so one of your duties does not close the balance"
                : " — the same: your two duties close the balance") },
        ]} />
      )}
    </PredictionCard>
  );
}

/** IS IT ECONOMIC? -- the step, the question, and the list folded behind
 *  the student's own answer. */
export function EconomicStep({ foldSymbols }: { foldSymbols: boolean }): JSX.Element {
  const [answer, setAnswer] = useState("");
  const { note, ...step } = PINCH_ECONOMIC_STEP;
  return (
    <Box data-economic-step="">
      <LessonStepView step={step} foldSymbols={foldSymbols} />
      <Textarea size="xs" autosize minRows={2} mt={6} value={answer}
        label="The data I would need to find the ΔT_min of least total cost"
        onChange={(e) => setAnswer(e.currentTarget.value)} />
      <Box component="details" mt={6}>
        <Box component="summary" style={{ cursor: "pointer" }}>
          <Text span size="xs" fw={600}>Compare with a list</Text>
        </Box>
        <Text size="sm" c="dimmed" mt={4}>{note}</Text>
      </Box>
    </Box>
  );
}

// ---- The witness network (C305, point 5) -------------------------------------

interface ItemRow {
  item: string; kind: string; streams: string; Q: number;
  from: string; to: string; term: string; termKW: number;
}

function itemRows(a: NetworkAccount, u: PinchUnits): ItemRow[] {
  const rows: ItemRow[] = [];
  a.exchangers.forEach((e, i) => rows.push({
    item: `E${i + 1}`, kind: "process exchanger", streams: `${e.hot} → ${e.cold}`, Q: e.Q,
    from: `hot ${u.T(e.hotIn)} → ${u.T(e.hotOut)}`, to: `cold ${u.T(e.coldIn)} → ${u.T(e.coldOut)}`,
    term: "cross-pinch transfer", termKW: e.cross }));
  for (const x of a.utilities) rows.push({
    item: x.kind === "heater" ? `heater on ${x.stream}` : `cooler on ${x.stream}`,
    kind: x.kind === "heater" ? "hot utility" : "cold utility", streams: x.stream, Q: x.Q,
    from: u.T(x.Tin), to: u.T(x.Tout),
    term: x.kind === "heater" ? "heating below the pinch" : "cooling above the pinch",
    termKW: x.wrongSide });
  return rows;
}

function NetworkTable({ a, u }: { a: NetworkAccount; u: PinchUnits }): JSX.Element {
  const rows = itemRows(a, u);
  const g = u.group(rows.map((r) => r.Q).concat(rows.map((r) => r.termKW)));
  const s = useSortable(rows, {
    item: (r) => r.item, kind: (r) => r.kind, Q: (r) => r.Q, term: (r) => r.term,
    termKW: (r) => r.termKW,
  });
  return (
    <Box style={{ overflow: "auto" }}>
      <Table striped withTableBorder fz="xs">
        <Table.Thead>
          <Table.Tr>
            <SortTh s={s} k="item">item</SortTh><SortTh s={s} k="kind">kind</SortTh>
            <SortTh s={s} k="Q">Q ({u.qLabel})</SortTh>
            <Table.Th>T in → out ({u.tLabel})</Table.Th>
            <SortTh s={s} k="term">term it feeds</SortTh>
            <SortTh s={s} k="termKW">its share ({u.qLabel})</SortTh>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {s.rows.map((r) => (
            <Table.Tr key={r.item}>
              <Table.Td>{r.item}{r.kind === "process exchanger" ? ` (${r.streams})` : ""}</Table.Td>
              <Table.Td>{r.kind}</Table.Td>
              <Table.Td>{g(r.Q)}</Table.Td>
              <Table.Td>{r.kind === "process exchanger" ? `${r.from}; ${r.to}` : `${r.from} → ${r.to}`}</Table.Td>
              <Table.Td>{r.term}</Table.Td>
              <Table.Td>{g(r.termKW)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

/** One identity line, every number at one absolute precision (u.group). */
export function identityLine(label: string, a: NetworkAccount, QHmin: number, u: PinchUnits): string {
  const g = u.group([a.QH, QHmin, a.excessH, a.cross, a.heatingBelow, a.coolingAbove]);
  return `${label}: Q_H − Q_H,min = ${g(a.QH)} − ${g(QHmin)} = ${g(a.excessH)} ${u.qLabel}`
    + ` = ${g(a.cross)} cross-pinch + ${g(a.heatingBelow)} heating below`
    + ` + ${g(a.coolingAbove)} cooling above`;
}

/** The pinch frame from the engine's KPI row, or null without a single
 *  interior pinch (the identity in this form needs one). */
export function frameFromKpis(
  kpis: { [k: string]: number } | undefined, pinchClass: string | null,
): PinchFrame | null {
  if (!kpis || pinchClass !== "interiorPinch") return null;
  const Th = kpis["T_pinch_hot_K"], Tc = kpis["T_pinch_cold_K"];
  const QH = kpis["Q_H_min_kW"], QC = kpis["Q_C_min_kW"], d = kpis["dTmin_K"];
  if ([Th, Tc, QH, QC, d].some((v) => typeof v !== "number")) return null;
  return { ThotPinch: Th!, TcoldPinch: Tc!, QHmin: QH!, QCmin: QC!, dTmin: d! };
}

export function WitnessNetwork({ streamRows, kpis, pinchClass, u }: {
  streamRows: readonly StreamRow[];
  kpis: { [k: string]: number } | undefined;
  pinchClass: string | null;
  u: PinchUnits;
}): JSX.Element {
  const frame = frameFromKpis(kpis, pinchClass);
  const streams = processStreams(streamRows);
  const w = frame ? crossingWitness(streams, frame) : null;
  return (
    <Box data-witness-network="">
      <Title order={5}>The rule in numbers: one exchanger across the pinch</Title>
      {!frame || !w ? (
        <Text size="sm" c="dimmed" mt={4}>
          {!frame
            ? "This witness needs a single interior pinch, and the engine reports none at these knob values; reset to the witness to see it."
            : "No hot stream with heat above the pinch can be matched with a cold stream that needs heat below it, at this ΔT_min, with all three terms nonzero."}
        </Text>
      ) : (() => {
        const none = accountNetwork(streams, frame, []);
        const one = accountNetwork(streams, frame, [w]);
        const e = one.exchangers[0]!;
        const gq = u.group([w.Q, frame.QHmin + one.cross]);
        return (
          <>
            <Text size="sm" mt={4}>
              The network this case declares has heaters and coolers only, so
              its excess over the target is all heating below and cooling
              above, and the cross-pinch term is zero.  Below, the same four
              streams with ONE process exchanger the first rule forbids: {w.hot}{" "}
              gives {gq(w.Q)} {u.qLabel} to {w.cold}, both from their supply
              ends, counter-current.  Its approaches are{" "}
              {u.dT(e.dThotEnd)} and {u.dT(e.dTcoldEnd)} {u.tLabel}, both above
              ΔT_min = {u.dT(frame.dTmin)} {u.tLabel}: it breaks the rule, not
              the approach.  Every other duty goes to a heater or a cooler.
            </Text>
            <NetworkTable a={one} u={u} />
            <Box mt={4} px="sm" py={6} style={{ borderLeft: `3px solid ${BORDER}` }}
              data-identity-lines="">
              <Text size="sm">{identityLine("utilities only (what the case declares)", none, frame.QHmin, u)}</Text>
              <Text size="sm" fw={600}>{identityLine(`with ${w.hot} → ${w.cold}`, one, frame.QHmin, u)}</Text>
            </Box>
            <Text size="sm" c="dimmed">
              The three terms are computed separately, item by item, and their
              sum is the excess: nothing here assumes the identity.  Read the
              first term: once this exchanger is built, the other two terms can
              only add, so no feasible completion of the network can bring Q_H
              below Q_H,min + {gq(one.cross)} = {gq(frame.QHmin + one.cross)}{" "}
              {u.qLabel}.  The heat sent across the pinch is paid for twice —
              once as hot utility above it and once as cold utility below.
              (This account is arithmetic on the engine&apos;s straight
              segments and its pinch temperatures, in case/pinchViolations.ts;
              the engine itself builds no network.)
            </Text>
          </>
        );
      })()}
    </Box>
  );
}
