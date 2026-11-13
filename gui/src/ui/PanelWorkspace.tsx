/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  PanelWorkspace -- the operator panel of a time-integrated case, READ-ONLY
  (DEV.md 4c C371, slice S2; docs/design/operator-panel-in-the-case.md
  section 7).

  THE TASK THIS SCREEN SERVES (every element below is checked against it):

    "An operator-in-training opens a time-integrated case and sees, at the
     instant the cursor is on, whether each watched variable is inside its
     limits, how it got there, and what the case's author declared about it."

  HOW EACH ELEMENT ANSWERS IT.
    * "at the instant the cursor is on" -- ONE time cursor (a native range
      input, so the arrow keys, Home, End and PageUp/PageDown work) moves
      every widget together; it snaps to the run's WRITTEN instants.
    * "whether each watched variable is inside its limits" -- the limits are
      DRAWN on every bar and trend; an element is coloured, and badged with a
      word and a shape, ONLY while the engine's published alarm interval holds
      the cursor's instant.  The count of alarms active at that instant is a
      count of those published intervals (case/panelView.ts says what is and
      is not published).  The GUI compares no value with a limit.
    * "how it got there" -- a trend of the whole run beside each number, with
      the engine's alarm intervals as a band along its foot, and the cursor.
    * "what the case's author declared about it" -- the reason the element is
      on the panel, the source and reason of its limit, and the action its
      alarm asks for, all verbatim from the engine's record; the engine's
      FACTS about the panel are listed as the engine wrote them.

  THE GRAMMAR OF THE SCREEN (the owner's good practice, C371): grey by
  default, colour only for an abnormal state, analogue bars with their limits,
  trends beside the number, no decoration (ui/panelWidgets.tsx).

  READ-ONLY, WITHOUT EXCEPTION.  There is no editing affordance: the panel is
  declared in `system/panelDict` and changed there; the file is the source of
  truth (gui-credo section 2).  A case with no panel does not show this
  workspace; a deep link to it says what to declare.

  The same board draws in the `?panel=` pop-out (ui/PanelPopOutTab.tsx).
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Badge, Box, Group, Stack, Text, Title } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";

import type { PanelReport } from "../adapters/panelPayload.js";
import { useStore } from "../state/store.js";
import { openPanelPopOut } from "../state/usePanelPopOut.js";
import {
  alarmCountAt, drawingRange, widgetsAt, type PanelTrajectory, type WidgetView,
} from "../case/panelView.js";
import { ALARM, GRID, Lamp, MiniTrend, QUIET, ScaleBar, sig } from "./panelWidgets.js";

/** Below this width the grid collapses to a single column in reading order. */
const WIDE_PX = 720;

function StateBadge({ w }: { w: WidgetView }): JSX.Element | null {
  if (w.state !== "alarm") return null;
  //  a word AND a shape: colour is never the only signal
  return (
    <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
      <svg width={12} height={12} aria-hidden><polygon points="6,0 12,12 0,12" fill={ALARM} /></svg>
      <Text size="xs" fw={700} c="red.8">{w.words.alarm}</Text>
    </Group>
  );
}

function ValueLine({ w }: { w: WidgetView }): JSX.Element {
  return (
    <Group gap={6} align="baseline" wrap="nowrap">
      <Text size="lg" fw={600} ff="monospace" c={w.state === "alarm" ? "red.8" : undefined}>{sig(w.value, 5)}</Text>
      <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>{w.column}</Text>
    </Group>
  );
}

function limitsText(w: WidgetView): string {
  const p: string[] = [];
  if (w.limitLow !== undefined) p.push(`low limit ${sig(w.limitLow, 6)}`);
  if (w.limitHigh !== undefined) p.push(`high limit ${sig(w.limitHigh, 6)}`);
  return p.join(" · ");
}

function Body({ w, t, ts }: { w: WidgetView; t: number; ts: number[] }): JSX.Element {
  if (w.state === "notPublished" || w.series === undefined)
    return <Text size="sm" c="dimmed">not published by this run ({w.column})</Text>;
  const range = drawingRange(w);
  const alarmOn = w.state === "alarm";
  switch (w.kind) {
    case "trend":
      return (
        <>
          <ValueLine w={w} />
          <MiniTrend t={ts} y={w.series} yRef={w.referenceSeries} range={range}
            limit={w.limitHigh} limitLow={w.limitLow} intervals={w.intervals} cursor={t}
            alarmOn={alarmOn} height={w.place && w.place.height >= 4 ? 120 : 70}
            aria={`${w.title}: trend of ${w.column} over the run`} />
          {w.referenceColumn && <Text size="xs" c="dimmed">dotted: {w.referenceColumn}</Text>}
        </>
      );
    case "bar":
      return (
        <>
          <ValueLine w={w} />
          <Box mt={4}>
            <ScaleBar value={w.value ?? range[0]} range={range} limit={w.limitHigh} limitLow={w.limitLow}
              alarmOn={alarmOn} aria={`${w.title} on its scale`} />
            <Group justify="space-between"><Text size="10px" c="dimmed">{sig(range[0], 6)}</Text>
              <Text size="10px" c="dimmed">{sig(range[1], 6)}</Text></Group>
          </Box>
        </>
      );
    case "lamp":
      return (
        <>
          <Box my={4}>
            <Lamp alarmOn={w.state === "alarm" ? true : w.state === "normal" ? false : undefined}
              normal={w.words.normal} high={w.words.alarm} />
          </Box>
          <ValueLine w={w} />
        </>
      );
    default:
      //  a number, and any kind this screen does not draw yet: the value, honestly
      return <ValueLine w={w} />;
  }
}

function Cell({ w, t, ts, placed, columns }: {
  w: WidgetView; t: number; ts: number[]; placed: boolean; columns: number;
}): JSX.Element {
  const inAlarm = w.state === "alarm";
  const p = w.place;
  const limits = limitsText(w);
  return (
    <Box
      component="section" aria-label={w.title}
      style={{
        border: `${inAlarm ? 2 : 1}px solid ${inAlarm ? ALARM : GRID}`, borderRadius: 4, padding: 8, minWidth: 0,
        ...(placed && p ? {
          gridColumn: `${p.column} / span ${Math.min(p.width, columns - p.column + 1)}`,
          gridRow: `${p.row} / span ${p.height}`,
        } : {}),
      }}
    >
      <Group justify="space-between" gap={4} wrap="nowrap" align="flex-start">
        <Text size="xs" fw={600} style={{ minWidth: 0 }}>{w.title}</Text>
        <StateBadge w={w} />
      </Group>
      <Body w={w} t={t} ts={ts} />
      {inAlarm && w.action && (
        <Text size="xs" mt={4} fw={600}>Asked: {w.action}</Text>
      )}
      {limits && <Text size="xs" c="dimmed" mt={2}>{limits}</Text>}
      <Text size="xs" c="dimmed" mt={2} style={{ color: QUIET }}>{w.reason}</Text>
      {(w.limitSource || w.limitReason || w.action) && (
        <details style={{ marginTop: 2 }}>
          <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--mantine-color-dimmed)" }}>declared by the case</summary>
          {w.limitSource && <Text size="xs">Limit source: {w.limitSource}</Text>}
          {w.limitReason && <Text size="xs">Limit reason: {w.limitReason}</Text>}
          {w.action && <Text size="xs">Alarm action: {w.action}</Text>}
        </details>
      )}
    </Box>
  );
}

function CursorBar({ ts, i, setI }: { ts: number[]; i: number; setI: (n: number) => void }): JSX.Element {
  const n = ts.length;
  return (
    <Box>
      <Text size="xs" c="dimmed" aria-live="polite">
        Cursor: t = {sig(ts[i], 6)} s of {sig(ts[n - 1], 6)} s (written instant {i + 1} of {n})
      </Text>
      <input type="range" min={0} max={n - 1} step={1} value={i}
        onChange={(e) => setI(Number(e.target.value))}
        aria-label="time cursor" aria-valuetext={`t = ${sig(ts[i], 6)} s`}
        style={{ width: "100%" }} />
    </Box>
  );
}

function Facts({ report }: { report: PanelReport }): JSX.Element {
  const s = report.summary;
  return (
    <Stack gap={6} aria-label="what the engine reports about the panel">
      <Title order={6}>What the engine reports about this panel</Title>
      <Text size="xs" c="dimmed">
        Facts, not a grade: crossings are seen on the written instants, and whether the panel tells a
        person what the process is doing is for you to judge.
        {s?.locked ? " This panel is locked." : ""}
      </Text>
      {report.facts.length === 0 && <Text size="sm" c="dimmed">The engine reported no fact.</Text>}
      {report.facts.map((f) => (
        <Group key={f.id} gap={6} align="flex-start" wrap="nowrap">
          <Badge size="xs" variant="light" color="gray" tt="none" style={{ flexShrink: 0 }}>{f.kind}</Badge>
          <Text size="xs" style={{ overflowWrap: "anywhere", minWidth: 0 }}>{f.explanation}</Text>
        </Group>
      ))}
      {report.messages.map((m) => (
        <Text key={m.id} size="xs" c="dimmed">
          message <b>{m.name}</b>: {m.fired ? `would be sent at t = ${sig(m.t, 6)} s` : "never sent in this run"} — “{m.text}”
        </Text>
      ))}
    </Stack>
  );
}

/** The board: cursor, alarm count, widgets, facts.  Shared by the workspace
 *  and the pop-out; takes the engine's block and the run's trajectory. */
export function PanelBoard({ report, trajectory, caseName }: {
  report: PanelReport; trajectory: PanelTrajectory; caseName?: string;
}): JSX.Element {
  const ts = trajectory.t;
  const last = Math.max(ts.length - 1, 0);
  const [i, setI] = useState(last);
  //  a new run of another length: keep the cursor inside it
  useEffect(() => { setI((k) => Math.min(k, last)); }, [last]);
  const idx = Math.min(i, last);
  const widgets = useMemo(() => widgetsAt(report, trajectory, idx), [report, trajectory, idx]);
  const { active, declared } = alarmCountAt(widgets);
  const { ref, width } = useElementSize();
  const columns = Math.max(1, report.summary?.gridColumns ?? 12);
  const rows = Math.max(1, report.summary?.gridRows ?? 1);
  const placedMode = width >= WIDE_PX && widgets.every((w) => w.place !== undefined);
  //  narrow, or unplaced: reading order from the engine's own placement
  const ordered = placedMode ? widgets : [...widgets].sort((a, b) =>
    (a.place?.row ?? 0) - (b.place?.row ?? 0) || (a.place?.column ?? 0) - (b.place?.column ?? 0));
  const t = ts[idx] ?? 0;
  const s = report.summary;
  const grid: ReactNode = (
    <Box ref={ref}
      style={{
        display: "grid", gap: 8, alignItems: "start",
        gridTemplateColumns: placedMode ? `repeat(${columns}, minmax(0, 1fr))` : "minmax(0, 1fr)",
        ...(placedMode ? { gridTemplateRows: `repeat(${rows}, minmax(48px, auto))` } : {}),
      }}>
      {ordered.map((w) => <Cell key={w.name} w={w} t={t} ts={ts} placed={placedMode} columns={columns} />)}
    </Box>
  );
  return (
    <Stack gap="sm" p="sm" data-panel-board>
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <Box style={{ flex: "1 1 320px", minWidth: 0 }}>
          {caseName && <Text size="xs" c="dimmed">{caseName}</Text>}
          <CursorBar ts={ts} i={idx} setI={setI} />
        </Box>
        <Box aria-live="polite" data-alarm-count>
          <Text size="sm" fw={active > 0 ? 700 : 500} c={active > 0 ? "red.8" : "dimmed"}>
            {active > 0 ? `${active} of ${declared} alarms active at this instant` : `No alarm active at this instant (${declared} declared)`}
          </Text>
          {s?.alarmsMax !== undefined && (
            <Text size="xs" c="dimmed">
              engine: at most {s.alarmsMax} at once over the run{s.alarmsMax > 0 && s.alarmsMaxAt !== undefined ? `, first at t = ${sig(s.alarmsMaxAt, 6)} s` : ""}
            </Text>
          )}
        </Box>
      </Group>
      {grid}
      <Facts report={report} />
      <Text size="xs" c="dimmed">
        Read-only.  The panel is declared in <code>system/panelDict</code>; change it there and run again.
      </Text>
    </Stack>
  );
}

/** The workspace: the open case's last run, or the sentence saying what is missing. */
export function PanelWorkspace(): JSX.Element {
  const runResult = useStore((s) => s.runResult);
  const tutorialName = useStore((s) => s.tutorialName);
  const declared = useStore((s) => s.caseFiles.rawFiles?.["system/panelDict"] !== undefined);
  const report = runResult?.panel;
  const trajectory = runResult?.trajectory;
  if (!report || !trajectory) {
    return (
      <Box p="xl">
        <Text c="dimmed" maw={640}>
          {declared
            ? "This case declares a panel (system/panelDict).  Run it: the panel draws what the engine reports about the run."
            : "This case declares no panel.  The panel is declared in system/panelDict and read by the engine after a time-integrated run; the Panel guide says what to write."}
        </Text>
      </Box>
    );
  }
  return (
    <Box style={{ height: "100%", overflow: "auto" }}>
      <Group justify="flex-end" px="sm" pt={4}>
        <Text size="xs" c="dimmed" component="button" type="button"
          style={{ background: "none", border: 0, cursor: "pointer", textDecoration: "underline" }}
          onClick={() => openPanelPopOut()}>
          Open in new tab
        </Text>
      </Group>
      <PanelBoard report={report} trajectory={trajectory} caseName={tutorialName} />
    </Box>
  );
}
