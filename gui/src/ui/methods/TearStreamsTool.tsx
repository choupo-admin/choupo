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
  TearStreamsTool — where to cut a recycle, and the division of labour that
  makes it the author's decision rather than the engine's.

  TWO PANELS, AND THE PAGE SAYS WHICH IS WHICH AT THE TOP OF EACH.

  THE CONSTRUCTION panel draws a flowsheet as its units IN DECLARED ORDER,
  with every stream as an arc: forward above the row, backward below it.  The
  reader MOVES A UNIT and watches which arcs flip — because that, and not the
  number of loops, is what decides how many tears the plan needs.  It is
  graph theory over teaching graphs declared in `tearMath`, and says so.

  THE ENGINE panel runs a real case with its tear declared and with the
  declaration withdrawn, and quotes what Choupo prints in both states —
  verbatim, because those sentences ARE the contract and paraphrasing them
  here would be a second home for a refusal message.

  WHY THE DIAGRAM IS A ROW AND NOT A FLOWSHEET.  A flowsheet drawn as a
  flowsheet shows the topology and hides the thing this page is about: the
  ORDER.  A sequential solver reads a list, and an edge needs a cut exactly
  when it runs right-to-left in that list.  Drawn as a row, "backward" is
  something a reader can SEE rather than compute.

  ACCESSIBILITY.  A backward arc is dashed AND labelled AND drawn below the
  row; a forward arc is solid and above it.  The verdict for each edge is a
  word in the table, never a colour.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  ActionIcon, Alert, Badge, Box, Button, Group, Loader, SegmentedControl,
  Stack, Switch, Table, Text, Title,
} from "@mantine/core";

import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { useNarrowViewport } from "./methodsChrome.js";
import { TEAR_LIMITS, TEAR_STEPS } from "./tearLesson.js";
import { PanelNote } from "./knobPanel.js";
import { useMethodRun } from "../../case/methodRun.js";
import {
  TEACH_GRAPHS, TEAR_DECLARED, TEAR_WITNESS,
  bestOrder, cycleString, cyclesOf, isInternal, judgeDeclaration, judgePlan,
  planAnnouncements, planFindings, withdrawTearOverrides,
  type StreamMark, type TeachGraph,
} from "./tearMath.js";

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const FORWARD = "#90a4ae";
const TEAR = "#ffb74d";
const MISTAKE = "#ef9a9a";
const MEASURED = "#26c6da";

const BOX_W = 104, BOX_H = 34, GAP = 34;
const TOP = 92, BOT = 96;

/** The flowsheet as the solver reads it: a LIST, with every stream drawn as
 *  an arc over or under it — and every stream CLICKABLE, because writing the
 *  `tearStreams ( ... );` list is the act this page is about.
 *
 *  The colour comes from `marks`, which the caller gets from
 *  `judgeDeclaration`: the engine's verdict on the reader's OWN declaration,
 *  not from whether the edge happens to point backwards.  The two differ
 *  exactly where the lesson is — a backward edge nobody declared is a
 *  MISSING TEAR, and a forward edge somebody did declare is a FORWARD TEAR,
 *  and the drawing has to be able to say both. */
function OrderDiagram({ g, order, marks, onToggle }: {
  g: TeachGraph; order: readonly number[];
  marks: { [stream: string]: StreamMark };
  onToggle: (stream: string) => void;
}): JSX.Element {
  const pos = new Map<number, number>();
  order.forEach((u, i) => pos.set(u, i));
  const n = order.length;
  //  260 and not 120: a boundary stub's label is drawn OUTWARD into this
  //  margin, and it now carries a refusal word beside the stream name
  //  ("freshFeed  (INLET TEAR)"), which does not fit in 60 px a side.
  const w = n * BOX_W + (n - 1) * GAP + 260;
  const h = TOP + BOX_H + BOT;
  const cx = (u: number) => 130 + (pos.get(u) ?? 0) * (BOX_W + GAP) + BOX_W / 2;
  const yTop = TOP;

  //  A mark decides the ink; the arc's DIRECTION is still geometry.
  const inkOf = (name: string): string => {
    const m = marks[name] ?? "forward";
    return m === "tear" ? TEAR : m === "forward" ? FORWARD : MISTAKE;
  };
  const faultOf = (name: string): string => {
    const m = marks[name] ?? "forward";
    return m === "tear" || m === "forward" ? "" : m;
  };

  let laneUp = 0, laneDown = 0;
  return (
    <Box style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%"
        style={{ display: "block", minWidth: Math.min(w, 620) }}
        role="img"
        aria-label={"The flowsheet's units in declared order, with each "
          + "stream drawn as an arc above the row when it runs forward and "
          + "below it when it runs backward"}>
        {/* the units, left to right, in the order the solver walks them */}
        {order.map((u, i) => (
          <g key={u}>
            <rect x={cx(u) - BOX_W / 2} y={yTop} width={BOX_W} height={BOX_H}
              rx={4} fill="none" stroke={GRID} strokeWidth={1.5} />
            <text x={cx(u)} y={yTop + 14} textAnchor="middle" fontSize={11}
              fill="currentColor">{g.units[u]!.name}</text>
            <text x={cx(u)} y={yTop + 26} textAnchor="middle" fontSize={8.5}
              fill={INK}>{g.units[u]!.kind}</text>
            <text x={cx(u)} y={yTop - 6} textAnchor="middle" fontSize={9}
              fill={INK}>{i + 1}</text>
          </g>
        ))}
        {g.edges.map((e) => {
          //  A domain inlet or outlet: a stub, because it can never be torn.
          if (!isInternal(e)) {
            const u = (e.from ?? e.to) as number;
            const inlet = e.from === null;
            const x = cx(u) + (inlet ? -BOX_W / 2 - 26 : BOX_W / 2 + 26);
            const y = yTop + BOX_H / 2;
            const ink = inkOf(e.name);
            const fault = faultOf(e.name);
            //  WHICH WAY THE LABEL RUNS.  Outward, into the page margin,
            //  wherever there IS a margin: to the left for an inlet, to the
            //  right for the last unit's outlet.  A middle unit's outlet has
            //  only the 34 px gap before the next box, which no label fits
            //  in, so it keeps the inward anchor it has always had and sits
            //  over its own unit -- a pre-existing crowding this slice does
            //  not make worse and does not pretend to fix.
            const outward = inlet
              || (pos.get(u) ?? 0) === order.length - 1;
            const anchor = outward === inlet ? "end" : "start";
            return (
              <g key={e.name} style={{ cursor: "pointer" }}
                onClick={() => onToggle(e.name)}
                role="button" tabIndex={0}
                aria-label={`declare or withdraw a tear on stream ${e.name}`}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") onToggle(e.name);
                }}>
                {/* a wide transparent hit path: an 8-point label and a
                    1.2-pixel line are not something a finger can hit */}
                <line x1={inlet ? x - 6 : cx(u) + BOX_W / 2}
                  x2={inlet ? cx(u) - BOX_W / 2 : x + 6} y1={y} y2={y}
                  stroke="transparent" strokeWidth={18} />
                <line x1={inlet ? x : cx(u) + BOX_W / 2}
                  x2={inlet ? cx(u) - BOX_W / 2 : x} y1={y} y2={y}
                  stroke={ink} strokeWidth={fault ? 2 : 1.2}
                  strokeDasharray={fault ? "5 3" : ""} />
                {/*  AWAY from the box.  An inlet's stub sits to the LEFT of
                     its unit, so its label must be anchored at its right end
                     and run leftwards into the margin; an outlet is the
                     mirror.  Written the other way round -- which is how it
                     was -- every label ran straight across the unit it
                     belongs to, and the moment a refusal word was appended
                     the collision was unreadable.  */}
                <text x={x} y={y - 5} textAnchor={anchor}
                  fontSize={8.5} fill={fault ? ink : INK}>{e.name}</text>
                {/*  The refusal word goes on its OWN line rather than beside
                     the name.  A stub has only the page margin to write in,
                     and "freshFeed  (UNCONSUMED TEAR)" on one line is wider
                     than any margin that leaves the boxes readable.  */}
                {fault && (
                  <text x={x} y={y + 10} textAnchor={anchor}
                    fontSize={8.5} fill={ink}>{fault}</text>
                )}
              </g>
            );
          }
          const a = cx(e.from as number), b = cx(e.to as number);
          const back = (pos.get(e.to as number) ?? 0)
            <= (pos.get(e.from as number) ?? 0);
          const mark = marks[e.name] ?? "forward";
          const colour = inkOf(e.name);
          const fault = faultOf(e.name);
          const lane = back ? ++laneDown : ++laneUp;
          const depth = 18 + (lane % 3) * 20;
          const y0 = back ? yTop + BOX_H : yTop;
          const y1 = back ? y0 + depth : y0 - depth;
          const mid = (a + b) / 2;
          const d = `M ${a} ${y0} C ${a} ${y1}, ${b} ${y1}, ${b} ${y0}`;
          return (
            <g key={e.name} style={{ cursor: "pointer" }}
              onClick={() => onToggle(e.name)}
              role="button" tabIndex={0}
              aria-label={`declare or withdraw a tear on stream ${e.name}`}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") onToggle(e.name);
              }}>
              <path d={d} fill="none" stroke="transparent" strokeWidth={18} />
              <path d={d} fill="none" stroke={colour}
                strokeWidth={mark === "forward" ? 1.2 : 2}
                strokeDasharray={mark === "forward" ? "" : "5 3"} />
              <text x={mid} y={back ? y1 + 10 : y1 - 3} textAnchor="middle"
                fontSize={8.5} fill={colour}>
                {e.name}
                {mark === "tear" ? "  (TEAR)" : fault ? `  (${fault})` : ""}
              </text>
            </g>
          );
        })}
        <text x={8} y={yTop - 24} fontSize={9} fill={INK}>forward (no cut)</text>
        <text x={8} y={yTop + BOX_H + 56} fontSize={9} fill={INK}>
          backward (needs a cut)
        </text>
      </svg>
    </Box>
  );
}

export function TearStreamsTool(): JSX.Element {
  const step = lessonStepper(TEAR_STEPS);

  /*  ONE COLUMN ON A PHONE.  Every panel here is a knob rail beside a drawing,
   *  and at 400 px a two-column grid leaves each of them about 190 px: the
   *  sliders collide with their own labels and the plot is a stripe.  The
   *  posture comes from `useNarrowViewport`, the ONE detection home
   *  (methodsChrome), rather than from a CSS media query this file would then
   *  own a second copy of.  */
  const narrow = useNarrowViewport();
  const rail = narrow ? "1fr" : "minmax(190px, 240px) 1fr";

  const [graphId, setGraphId] = useState(TEACH_GRAPHS[0]!.id);
  const g = TEACH_GRAPHS.find((x) => x.id === graphId) ?? TEACH_GRAPHS[0]!;
  const [orders, setOrders] = useState<{ [id: string]: number[] }>(() =>
    Object.fromEntries(TEACH_GRAPHS.map((x) => [x.id, [...x.declaredOrder]])));
  const order = orders[g.id] ?? [...g.declaredOrder];

  /*  THE READER'S OWN DECLARATION, per graph.  It opens on the tears the
   *  declared order forces -- a correct plan, so the page starts from
   *  something that runs -- and from then on it is the reader's.  It is NOT
   *  resynchronised when a unit moves: that is the whole instrument.  Move a
   *  unit and the declaration you wrote goes stale exactly as a solverDict
   *  would, and the engine's own MISSING TEAR appears to say so.  */
  const [declaredBy, setDeclaredBy] = useState<{ [id: string]: string[] }>(
    () => Object.fromEntries(TEACH_GRAPHS.map(
      (x) => [x.id, judgePlan(x, x.declaredOrder).tears])));
  const declared = declaredBy[g.id] ?? [];

  const verdict = useMemo(() => judgePlan(g, order), [g, order]);
  const call = useMemo(
    () => judgeDeclaration(g, order, declared), [g, order, declared]);

  const toggleTear = (name: string): void => setDeclaredBy((d) => {
    const cur = d[g.id] ?? [];
    return { ...d, [g.id]: cur.includes(name)
      ? cur.filter((x) => x !== name)
      //  Keep the DECLARED order of the graph's own edges, so the list a
      //  reader reads back is the order they would write it in a dict.
      : g.edges.map((e) => e.name)
          .filter((n, i, a) => a.indexOf(n) === i)
          .filter((n) => n === name || cur.includes(n)) };
  });
  const best = useMemo(() => bestOrder(g), [g]);
  const cycles = useMemo(() => cyclesOf(g), [g]);

  const move = (i: number, d: -1 | 1): void => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    const tmp = next[i]!; next[i] = next[j]!; next[j] = tmp;
    setOrders((o) => ({ ...o, [g.id]: next }));
  };

  // ---- The engine ----------------------------------------------------------
  const [withdrawn, setWithdrawn] = useState(false);
  const run = useMethodRun(
    TEAR_WITNESS, withdrawn ? withdrawTearOverrides() : [],
    withdrawn ? "withdrawn" : "declared", "choupoSolve");
  const findings = planFindings(run.log);
  const announcements = planAnnouncements(run.log);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>

        <Box>
          <Title order={3}>Tear streams: where to cut a recycle</Title>
          <Text size="sm" c="dimmed" mt={4}>
            A recycle has no first unit, so a sequential solver has to guess
            one stream and iterate. Which stream? Choupo will find every cycle
            in your flowsheet, refuse an undeclared one by name, and print the
            chain it found — and it will not choose the cut for you. This page
            is about the decision it leaves you, and about the thing that
            actually decides it: the order you declared the units in.
          </Text>
        </Box>

        {step(1)}
        {step(2)}
        {step(3)}
        {step(4)}

        {/* ---------------- THE CONSTRUCTION ---------------- */}
        <Box style={{ borderLeft: `3px solid ${TEAR}`, paddingLeft: 12 }}>
          <Title order={4}>
            Write the declaration yourself, and get it wrong on purpose
          </Title>
          <Text size="sm" mt={4}>
            Everything below this line is graph theory drawn in your browser
            over three TEACHING FLOWSHEETS — named boxes and named arrows
            declared in{" "}
            <Text span ff="monospace" size="xs">tearMath.ts</Text>, with no
            thermodynamics in them and no Choupo case read to build them. The
            units are drawn in the order the solver would walk them. An arc
            ABOVE the row runs forward and needs no cut; an arc BELOW it
            arrives at a unit that has already run, and needs one.
          </Text>
          <Text size="sm" mt={8}>
            CLICK ANY STREAM to put it in the{" "}
            <Text span ff="monospace" size="xs">tearStreams ( … );</Text> list
            or take it out, and move the units with the arrows. The panel then
            judges your declaration the way the engine does — the same two
            passes, in the same order, with the same seven refusals in{" "}
            <Text span fs="italic">Choupo&apos;s own words</Text>, carrying the
            cycle it found and the remedy that closes it. Declare nothing and
            you meet MISSING TEAR; cut a forward stream and you meet FORWARD
            TEAR; cut the feed and you meet INLET TEAR. Getting it wrong here
            costs nothing, which is the only reason a page is a better place
            to get it wrong than a case.
          </Text>
        </Box>

        <SegmentedControl size="xs" fullWidth value={graphId}
          onChange={setGraphId}
          data={TEACH_GRAPHS.map((x) => ({ value: x.id, label: x.label }))} />
        <Text size="sm">{g.blurb}</Text>

        <OrderDiagram g={g} order={order} marks={call.marks}
          onToggle={toggleTear} />

        <Box style={{ display: "grid", gap: 16,
          gridTemplateColumns: rail }}>
          <Stack gap={6}>
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
              declaration order
            </Text>
            {order.map((u, i) => (
              <Group key={u} gap={4} wrap="nowrap">
                <Text size="xs" ff="monospace" c="dimmed" w={16}>{i + 1}</Text>
                <Text size="xs" style={{ flex: 1, minWidth: 0 }}>
                  {g.units[u]!.name}
                </Text>
                <ActionIcon size="sm" variant="default" disabled={i === 0}
                  aria-label={`move ${g.units[u]!.name} earlier`}
                  onClick={() => move(i, -1)}>↑</ActionIcon>
                <ActionIcon size="sm" variant="default"
                  disabled={i === order.length - 1}
                  aria-label={`move ${g.units[u]!.name} later`}
                  onClick={() => move(i, 1)}>↓</ActionIcon>
              </Group>
            ))}
            <Group gap={6} mt={4}>
              <Button size="xs" variant="default"
                onClick={() => setOrders((o) =>
                  ({ ...o, [g.id]: [...g.declaredOrder] }))}>
                as declared
              </Button>
              <Button size="xs" variant="light"
                onClick={() => setOrders((o) =>
                  ({ ...o, [g.id]: [...best.order] }))}>
                fewest tears
              </Button>
            </Group>
            <Text size="xs" fw={600} tt="uppercase" c="dimmed" mt={8}>
              tearStreams ( … );
            </Text>
            <Box style={{
              border: `1px solid ${GRID}`, borderRadius: 4, padding: "6px 8px",
            }}>
              <Text size="xs" ff="monospace" style={{ wordBreak: "break-all" }}>
                tearStreams ({declared.length ? " " + declared.join(" ") + " " : " "});
              </Text>
            </Box>
            <Text size="xs" c="dimmed">
              Click a stream on the drawing to put it in this list or take it
              out. This IS the line you would write in the case&apos;s{" "}
              <Text span ff="monospace">system/solverDict</Text>.
            </Text>
            <Button size="xs" variant="default"
              disabled={declared.length === verdict.tears.length
                && verdict.tears.every((t) => declared.includes(t))}
              onClick={() => setDeclaredBy((d) =>
                ({ ...d, [g.id]: verdict.tears }))}>
              declare what this order needs
            </Button>
            <PanelNote>
              {best.fewest === 1
                ? "One tear is enough for this flowsheet, in at least one "
                  + "valid order."
                : `${best.fewest} tears are needed, and no order does better.`}{" "}
              Searched every one of the {best.ordersSearched} possible orders;{" "}
              {best.validOrders} of them are valid at all (the rest leave a
              backward edge that closes no cycle, which is an order mistake
              rather than a recycle). There may be several orders achieving
              the fewest, and the button gives one of them.
            </PanelNote>
          </Stack>

          <Stack gap={10}>
            {/*  THE ENGINE'S OWN SENTENCES, not a paraphrase of them.  This
                 block used to restate ONE of the seven refusals in friendlier
                 words; a reader who met the real thing would not recognise
                 it, and the other six had no home on the page at all.  */}
            {call.findings.length > 0 && (
              <Alert color="red"
                title={`Choupo would refuse this plan — ${call.findings.length} `
                  + `finding${call.findings.length === 1 ? "" : "s"}`}>
                <Stack gap={6}>
                  {call.findings.map((f) => (
                    <Text size="xs" ff="monospace" key={f.kind + f.stream}
                      style={{ whiteSpace: "pre-wrap" }}>
                      {f.message}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            )}
            {call.ok && (
              <Alert color="teal" title="Choupo would run this plan">
                <Text size="sm">
                  Every backward edge is declared, every declared tear is a
                  real cut, and the order can be walked. The engine announces
                  the cut rather than taking it silently:{" "}
                  <Text span ff="monospace" size="xs">
                    [plan] material recycle: tear &apos;
                    {call.accepted[0] ?? "—"}&apos; cuts …
                  </Text>
                </Text>
              </Alert>
            )}
            <Group gap="xs" wrap="wrap">
              <Badge variant="light" color={call.ok ? "teal" : "red"}>
                {call.ok ? "valid plan" : "refused"}
              </Badge>
              <Badge variant="light" color="orange">
                {verdict.tears.length} tear
                {verdict.tears.length === 1 ? "" : "s"}
                {verdict.tears.length > 0
                  ? `: ${verdict.tears.join(", ")}` : ""}
              </Badge>
              <Badge variant="outline">
                {cycles.length} cycle{cycles.length === 1 ? "" : "s"}
              </Badge>
              <Badge variant="outline">
                Newton: {verdict.variablesNewton} variables,{" "}
                {verdict.sweepsPerNewtonStep} sweeps per step
              </Badge>
              <Badge variant="outline">
                Wegstein: {verdict.variablesWegstein} variables, 1 sweep per step
              </Badge>
            </Group>

            <Box style={{ width: "100%", overflowX: "auto" }}>
              <Table striped withTableBorder fz="xs" miw={460}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>backward edge</Table.Th>
                    <Table.Th>producer → consumer</Table.Th>
                    <Table.Th>closes a cycle?</Table.Th>
                    <Table.Th>verdict</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {verdict.backward.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={4}>
                        No backward edge: this flowsheet can be walked straight
                        through, with no tear and no iteration.
                      </Table.Td>
                    </Table.Tr>
                  ) : verdict.backward.map((b) => (
                    <Table.Tr key={b.name}>
                      <Table.Td ff="monospace">{b.name}</Table.Td>
                      <Table.Td ff="monospace">
                        {b.producer} → {b.consumer}
                      </Table.Td>
                      <Table.Td>{b.onCycle ? "yes" : "no"}</Table.Td>
                      <Table.Td>
                        {b.onCycle ? "TEAR — must be declared"
                          : "ORDER MISTAKE — move the unit"}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>

            {cycles.length > 0 && (
              <Box px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
                  the cycles in this flowsheet
                </Text>
                {cycles.map((c, i) => {
                  const cut = c.edges.find((e) => verdict.tears.includes(e));
                  return (
                    <Text key={i} size="xs" ff="monospace"
                      style={{ whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere" }}>
                      {cut ? cycleString(c, cut)
                        : `${c.units.join(" -> ")} -- NOT CUT`}
                    </Text>
                  );
                })}
              </Box>
            )}
          </Stack>
        </Box>

        {step(5)}
        {step(6)}
        {step(7)}

        {/* ---------------- THE ENGINE ---------------- */}
        <Box style={{ borderLeft: `3px solid ${MEASURED}`, paddingLeft: 12 }}>
          <Title order={4}>
            Measured: what Choupo says, in Choupo&apos;s own words
          </Title>
          <Text size="sm" mt={4}>
            The switch below runs{" "}
            <Text span ff="monospace" size="xs">tutorials/{TEAR_WITNESS}</Text>{" "}
            — the same flowsheet as the first teaching graph, with real
            components in it — twice over: once as the author wrote it, and
            once with the{" "}
            <Text span ff="monospace" size="xs">tearStreams</Text> declaration
            renamed so the engine no longer reads it. Nothing below is written
            by this page; the lines are lifted out of the run&apos;s own
            output.
          </Text>
        </Box>

        <Stack gap={10}>
          <Group gap="md" wrap="wrap">
            <Switch size="sm" checked={withdrawn}
              label={`withdraw the tearStreams ( ${TEAR_DECLARED} ) declaration`}
              onChange={(e) => setWithdrawn(e.currentTarget.checked)} />
            {run.busy && (
              <Group gap={6}><Loader size="xs" />
                <Text size="xs" c="dimmed">running the case…</Text></Group>
            )}
          </Group>

          {findings.length > 0 && (
            <Alert color="orange" title="The engine refused the plan">
              <Stack gap={6}>
                {findings.map((f, i) => (
                  <Text key={i} size="xs" ff="monospace"
                    style={{ whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere" }}>{f}</Text>
                ))}
              </Stack>
              <Text size="sm" mt={8}>
                Read what it did there. It found the cycle, named every unit
                on it, named the stream that closes it, told you the exact
                declaration that would fix it and the tool that seeds it — and
                it did not pick the cut. That is the whole division of labour
                this page is about.
              </Text>
            </Alert>
          )}

          {announcements.length > 0 && (
            <Box px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
                a valid plan announcing its own cut
              </Text>
              {announcements.map((a, i) => (
                <Text key={i} size="xs" ff="monospace"
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {a}
                </Text>
              ))}
              <Text size="sm" mt={6}>
                A valid recycle SHOWS its cuts rather than leaving them
                implicit. The same run then solves the tear and reports the
                answer; how it does that is the Wegstein EduTool&apos;s
                subject.
              </Text>
            </Box>
          )}

          {run.result && !withdrawn && (
            <Group gap="xs" wrap="wrap">
              <Badge variant="light">the case converged</Badge>
              {run.result.streams
                .filter((s) => s.name === TEAR_DECLARED)
                .map((s) => (
                  <Badge key={s.name} variant="light">
                    {s.name}: {s.F.toExponential(4)} kmol/s at{" "}
                    {s.T.toFixed(2)} K
                  </Badge>
                ))}
            </Group>
          )}

          {!run.busy && findings.length === 0 && announcements.length === 0
            && run.err && (
            <Alert color="red" title="The run did not finish">
              <Text size="sm">{run.err}</Text>
            </Alert>
          )}

          <PanelNote>
            The withdrawal is a KEY RENAME, not a deletion: the list stays in
            the file and the engine stops reading it, which is exactly the
            state a case is in when its author forgot to declare the cut. A
            knob on this page may not add, delete or re-nest a dict block — a
            GUI that assembles blocks has become an editor, and cases here are
            authored as text on disk.
          </PanelNote>
        </Stack>

        <LessonLimits limits={TEAR_LIMITS} />
      </Stack>
    </Box>
  );
}
