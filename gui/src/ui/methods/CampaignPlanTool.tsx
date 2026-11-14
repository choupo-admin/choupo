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
  CampaignPlanTool -- "How a batch plant is organised: lots, campaigns and the
  Gantt chart" (DEV.md 4c C249 c).

  THE TASK (CLAUDE.md section 10): a student has to explain how a plant makes
  several products in lots, where a continuous machine such as a spray dryer
  fits, and how many hours of the year that takes.  The page teaches the
  method with the Gantt chart LIVE -- sliders for the lot, the lots per
  campaign, the changeover and the dryer's operating time, the limiting stage
  recoloured as it moves, the year's required hours against the available
  ones, and the order of two or three products as a drag -- and then shows
  what the ENGINE published for two real cases with the SAME bars.

  TWO HALVES, said at the top of each:
    * a TOY half, whose plan is recomputed in this page (campaignPlanMath.ts,
      a second implementation of BatchPlanPass.H held by a test to what the
      engine published);
    * an ENGINE half, which runs the case in the browser and DRAWS the plan
      it published, recomputing nothing.
  ONE DRAWING: both halves go through case/batchGantt.ts and
  ui/BatchPlanSection.tsx's BatchGanttSvg.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Badge, Box, Button, Group, Progress, SegmentedControl, Stack, Switch,
  Table, Text, Title, NumberInput,
} from "@mantine/core";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";

import { useMethodRun } from "../../case/methodRun.js";
import { ganttFigure } from "../../case/batchGantt.js";
import type { BatchPlan, MultiProductPlan } from "../../adapters/batchPlanPayload.js";
import { BatchGanttSvg } from "../BatchPlanSection.js";
import { KnobSlider, type PanelKnob } from "./knobPanel.js";
import { LessonLimits, lessonStepper, LessonReferences } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { OriginMark } from "./origin.js";
import {
  CAMPAIGN_PLAN_LIMITS, CAMPAIGN_PLAN_QUIZ, CAMPAIGN_PLAN_STEPS,
} from "./campaignPlanLesson.js";
import { everyOrder, multiPlan, singlePlan, TOY_DRYER_MISMATCH } from "./campaignPlanMath.js";
import {
  CAMPAIGN_WITNESS_MULTI, CAMPAIGN_WITNESS_ONE, TOY_A_DEFAULT, TOY_A_DRYER_RATE,
  TOY_B_DEFAULT, toyASpec, toyBSpec,
  type ToyAKnobs, type ToyBKnobs,
} from "./campaignPlanToy.js";

const step = lessonStepper(CAMPAIGN_PLAN_STEPS);

const f = (x: number, p = 1): string => (Number.isFinite(x) ? x.toFixed(p) : "—");
const pct = (x: number, p = 1): string => (Number.isFinite(x) ? `${(100 * x).toFixed(p)} %` : "—");

// ---- the two halves, named -------------------------------------------------

/** The banner at the head of each half: which one the reader is in. */
export function HalfBanner({ half, children }: {
  half: "toy" | "engine"; children: React.ReactNode;
}): JSX.Element {
  const toy = half === "toy";
  return (
    <Alert color={toy ? "orange" : "teal"} variant="light" mt="sm" data-half={half}
      title={toy ? "The toy: recomputed in this page, by you" : "The engine: read from what Choupo published"}>
      <Text size="sm">{children}</Text>
    </Alert>
  );
}

function GanttBox({ plan, caseName }: { plan: BatchPlan; caseName: string }): JSX.Element | null {
  const fig = useMemo(() => ganttFigure(plan), [plan]);
  if (!fig) return null;
  return (
    <Box data-pan-x="" data-campaign-gantt="" mt={6}
      style={{ width: "100%", overflowX: "auto",
               border: "1px solid var(--mantine-color-default-border)" }}>
      <BatchGanttSvg plan={plan} fig={fig} caseName={caseName} />
    </Box>
  );
}

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>{children}</Table>
    </Box>
  );
}

// ---- toy A -----------------------------------------------------------------

const KNOB_LOT: PanelKnob = { id: "lot", label: "lot size B", min: 20, max: 400, step: 10, unit: "kg" };
const KNOB_NC: PanelKnob = { id: "nc", label: "lots per campaign", min: 1, max: 20, step: 1 };
const KNOB_CO: PanelKnob = { id: "co", label: "changeover between campaigns", min: 0, max: 96, step: 2, unit: "h" };
const KNOB_DRY: PanelKnob = { id: "dry", label: "operating time of the spray dryer", min: 1, max: 12, step: 0.5, unit: "h" };
const KNOB_Q: PanelKnob = { id: "q", label: "demand Q", min: 1000, max: 20000, step: 500, unit: "kg/yr" };

export function ToyA({ k, setK }: { k: ToyAKnobs; setK: (k: ToyAKnobs) => void }): JSX.Element {
  const plan = useMemo(() => singlePlan(toyASpec(k)), [k]);
  const t = plan.trains[0]!;
  const over = t.requiredTime > t.availableTime;
  const dry = plan.stages.find((s) => s.name === "sprayDryer");
  const need = dry?.rate ?? NaN;
  const mismatch = Number.isFinite(need) && Math.abs(need / TOY_A_DRYER_RATE - 1) > TOY_DRYER_MISMATCH;
  return (
    <Box data-toy="a">
      <HalfBanner half="toy">
        Five stages made up for the page: a solution tank, a spray dryer, a blender, a press
        and a coater, in one train. Every number is an illustration. The chart is drawn by
        the same code that draws the engine&apos;s plan, with the limiting stage outlined.
      </HalfBanner>
      <OriginMark of={["page", "assumption", "reference"]}
        note="a second implementation of BatchPlanPass.H in this page, held by a test to what the engine published for two cases" />
      <Box mt="sm" style={{ display: "grid", gap: 12,
                            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        <KnobSlider knob={KNOB_LOT} value={k.lot} onChange={(v) => setK({ ...k, lot: v })} />
        <KnobSlider knob={KNOB_NC} value={k.lotsPerCampaign}
          onChange={(v) => setK({ ...k, lotsPerCampaign: Math.round(v) })} />
        <KnobSlider knob={KNOB_CO} value={k.changeover} onChange={(v) => setK({ ...k, changeover: v })} />
        <KnobSlider knob={KNOB_DRY} value={k.dryerHours} onChange={(v) => setK({ ...k, dryerHours: v })} />
        <KnobSlider knob={KNOB_Q} value={k.perYear} onChange={(v) => setK({ ...k, perYear: v })} />
        <Box>
          <Text size="xs" c="dimmed" mb={2}>units of the solution tank (out of phase)</Text>
          <SegmentedControl size="xs" value={String(k.tanks)} data={["1", "2"]}
            data-knob="tanks"
            onChange={(v) => setK({ ...k, tanks: v === "2" ? 2 : 1 })} />
        </Box>
      </Box>
      <Text size="sm" mt="sm" data-toy-summary="">
        Lot {f(k.lot, 0)} kg: <b>{plan.summary.lotsPerYear} lots</b> a year in{" "}
        <b>{t.campaigns} campaigns</b>.{" "}
        <b>T<sub>L</sub> = {f(t.cycleTime, 2)} h</b>, set by <b data-limiting="">{t.limitingStage}</b>.
        A campaign of {Math.min(t.lotsPerCampaign, plan.summary.lotsPerYear)} lots spans{" "}
        {f(t.campaignSpan, 2)} h, then {f(t.changeover, 0)} h of changeover.{" "}
        The year needs <b data-required="">{f(t.requiredTime, 1)} h</b> of{" "}
        {f(t.availableTime, 0)} h available: occupancy{" "}
        <b data-occupancy="" style={{ color: over ? "var(--mantine-color-red-7)" : undefined }}>
          {pct(t.occupancy)}</b>.
      </Text>
      {over && (
        <Text size="xs" c="red" mt={4} data-over="">
          The engine would REFUSE this plan: the train needs more hours than it has. Its
          remedies are an out-of-phase unit, a larger lot or more hours.
        </Text>
      )}
      {mismatch && (
        <Text size="xs" c="orange" mt={4} data-mismatch="">
          The plan asks the dryer for {f(need, 1)} kg/h and the machine is rated for{" "}
          {f(TOY_A_DRYER_RATE, 1)} kg/h: the engine announces a rated stage whose required
          rate differs from the machine&apos;s by more than 1 %.
        </Text>
      )}
      <PanTable>
        <Table.Thead><Table.Tr>
          <Table.Th>stage</Table.Th><Table.Th>type</Table.Th>
          <Table.Th>cycle t, h</Table.Th><Table.Th>t / N_op, h</Table.Th>
          <Table.Th>utilisation u</Table.Th><Table.Th>busy h/yr</Table.Th>
          <Table.Th>occupancy</Table.Th><Table.Th>size</Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {plan.stages.map((s) => (
            <Table.Tr key={s.name} data-stage={s.name} data-limiting-row={s.limiting ? "yes" : "no"}
              style={s.limiting ? { background: "var(--mantine-color-yellow-light)" } : undefined}>
              <Table.Td>{s.name}{s.limiting ? <Badge ml={6} size="xs" color="orange">limiting</Badge> : null}</Table.Td>
              <Table.Td>{s.type}{s.outOfPhase > 1 ? ` (${s.outOfPhase} out of phase)` : ""}</Table.Td>
              <Table.Td>{f(s.cycleTime, 2)}</Table.Td>
              <Table.Td>{f(s.effectiveCycle, 2)}</Table.Td>
              <Table.Td style={{ minWidth: 110 }}>
                <Progress size="sm" value={100 * s.utilisation} color={s.limiting ? "orange" : "blue"} />
                <Text size="xs">{pct(s.utilisation, 0)}</Text>
              </Table.Td>
              <Table.Td>{f(s.busyHours, 1)}</Table.Td>
              <Table.Td>{pct(s.occupancy)}</Table.Td>
              <Table.Td>{s.volume !== undefined ? `${f(s.volume, 2)} m3` : `${f(s.rate ?? NaN, 1)} kg/h`}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
      <GanttBox plan={plan} caseName="toy: one product, one train" />
    </Box>
  );
}

// ---- toy B -----------------------------------------------------------------

function OrderList({ order, onChange }: { order: string[]; onChange: (o: string[]) => void }): JSX.Element {
  const [drag, setDrag] = useState<number | null>(null);
  const move = (i: number, j: number) => {
    if (j < 0 || j >= order.length || i === j) return;
    const o = order.slice();
    const [x] = o.splice(i, 1);
    o.splice(j, 0, x!);
    onChange(o);
  };
  return (
    <Box data-order-list="">
      <Text size="xs" c="dimmed" mb={2}>campaign order (drag, or use the arrows)</Text>
      <Group gap={6} wrap="wrap">
        {order.map((p, i) => (
          <Box key={p} draggable data-order-item={p}
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }}
            style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 6,
                     padding: "4px 8px", cursor: "grab", display: "flex", alignItems: "center", gap: 4 }}>
            <Text size="sm" fw={600}>{i + 1}. {p}</Text>
            <Button size="compact-xs" variant="subtle" aria-label={`move ${p} earlier`}
              data-move-up={p} disabled={i === 0} onClick={() => move(i, i - 1)}>
              <IconChevronUp size={13} />
            </Button>
            <Button size="compact-xs" variant="subtle" aria-label={`move ${p} later`}
              data-move-down={p} disabled={i === order.length - 1} onClick={() => move(i, i + 1)}>
              <IconChevronDown size={13} />
            </Button>
          </Box>
        ))}
      </Group>
    </Box>
  );
}

export function ToyB({ k, setK }: { k: ToyBKnobs; setK: (k: ToyBKnobs) => void }): JSX.Element {
  const spec = useMemo(() => toyBSpec(k), [k]);
  const plan = useMemo(() => multiPlan(spec), [spec]);
  const orders = useMemo(() => everyOrder(spec), [spec]);
  const t = plan.trains[0]!;
  const hours = orders.map((o) => o.required);
  const lo = Math.min(...hours); const hi = Math.max(...hours);
  const same = hi - lo < 1e-9;
  const names = spec.products.map((p) => p.name);
  const setClean = (key: string, v: number) =>
    setK({ ...k, coatingClean: { ...k.coatingClean, [key]: v } });
  const toggleThird = (on: boolean) =>
    setK({ ...k, count: on ? 3 : 2, order: on && !k.order.includes("pink") ? [...k.order, "pink"] : k.order });
  return (
    <Box data-toy="b">
      <HalfBanner half="toy">
        Three stages and up to three products, made up for the page. The coating pan has a clean
        that depends on the direction of the change (a colour carried over); every other clean
        depends on the stage alone. Every number is an illustration.
      </HalfBanner>
      <OriginMark of={["page", "assumption", "reference"]}
        note="the same implementation as the first toy, in the several-product form" />
      <Group mt="sm" gap="lg" align="flex-end" wrap="wrap">
        <Switch size="sm" label="make a third product (pink)" checked={k.count === 3}
          data-third-toggle="" onChange={(e) => toggleThird(e.currentTarget.checked)} />
        <OrderList order={spec.order} onChange={(o) => setK({ ...k, order: o })} />
        <NumberInput size="xs" w={130} label="changeover, one product (h)" value={k.changeover} min={0}
          onChange={(v) => { if (typeof v === "number") setK({ ...k, changeover: v }); }} />
        <NumberInput size="xs" w={130} label="granulation clean (h)" value={k.granulationClean} min={0}
          onChange={(v) => { if (typeof v === "number") setK({ ...k, granulationClean: v }); }} />
        <NumberInput size="xs" w={130} label="press clean (h)" value={k.pressClean} min={0}
          onChange={(v) => { if (typeof v === "number") setK({ ...k, pressClean: v }); }} />
      </Group>
      <Text size="xs" c="dimmed" mt="sm">
        The clean at the coating pan after one product and before the next, in hours (rows: after,
        columns: before). The train waits for the longest clean of any stage.
      </Text>
      <PanTable>
        <Table.Thead><Table.Tr>
          <Table.Th>after \ before</Table.Th>
          {names.map((n) => <Table.Th key={n}>{n}</Table.Th>)}
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {names.map((a) => (
            <Table.Tr key={a}>
              <Table.Td>{a}</Table.Td>
              {names.map((b) => (
                <Table.Td key={b}>
                  {a === b ? "—" : (
                    <NumberInput size="xs" w={80} min={0} data-clean={`${a}>${b}`}
                      value={k.coatingClean[`${a}>${b}`] ?? 0}
                      onChange={(v) => { if (typeof v === "number") setClean(`${a}>${b}`, v); }} />
                  )}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
      <Text size="sm" mt="sm" data-b-summary="">
        Order <b>{spec.order.join(" → ")} → {spec.order[0]}</b>: {plan.summary.lotsPerYear} lots, {t.campaigns}{" "}
        campaigns, <b data-b-required="">{f(t.requiredTime, 1)} h</b> of {f(t.availableTime, 0)} h
        (occupancy {pct(t.occupancy)}); of which {f(t.changeoverHours, 1)} h are changeovers.
      </Text>
      <Text size="sm" mt={4} data-b-verdict={same ? "same" : "differs"}>
        {same
          ? `Every order of ${names.length} products costs the same ${f(lo, 1)} h: the year pays each direction once whichever goes first, and the order changes only the chart.`
          : `The orders cost between ${f(lo, 1)} h and ${f(hi, 1)} h: the order is a decision, worth ${f(hi - lo, 1)} h of the year, and it matters only through the directional cleans.`}
      </Text>
      <PanTable>
        <Table.Thead><Table.Tr>
          <Table.Th>order</Table.Th><Table.Th>cycle</Table.Th><Table.Th>year needs, h</Table.Th><Table.Th></Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {orders.map((o) => (
            <Table.Tr key={o.order.join(">")} data-order-row={o.order.join(">")}
              style={o.order.join(">") === spec.order.join(">") ? { background: "var(--mantine-color-blue-light)" } : undefined}>
              <Table.Td>{o.order.join(" → ")}</Table.Td>
              <Table.Td>{o.cycle}</Table.Td>
              <Table.Td>{f(o.required, 1)}</Table.Td>
              <Table.Td>
                {!same && o.required <= lo + 1e-9 ? <Badge size="xs" color="teal">fewest hours</Badge> : null}
                {o.order.join(">") === spec.order.join(">") ? <Badge ml={4} size="xs" color="blue">on the chart</Badge> : null}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
      <GanttBox plan={plan} caseName="toy: several products, one train" />
    </Box>
  );
}

// ---- the engine halves -----------------------------------------------------

/** What the engine published, drawn: the plan's summary line, the chart and
 *  the published stage times.  Nothing is recomputed. */
export function PublishedPlan({ plan, caseName }: { plan: BatchPlan; caseName: string }): JSX.Element {
  const stageRows = plan.multiProduct
    ? plan.stages.map((s) => ({ name: s.name, train: s.train, limiting: s.limiting, occ: s.occupancy,
        cycle: NaN, util: s.maxUtilisation, busy: s.busyHours }))
    : plan.stages.map((s) => ({ name: s.name, train: s.train, limiting: s.limiting, occ: s.occupancy,
        cycle: s.cycleTime, util: s.utilisation, busy: s.busyHours }));
  return (
    <Box data-published="">
      <Text size="sm" mt="xs" data-published-summary="">
        {plan.multiProduct
          ? <>Published: {plan.products.length} products in the order {plan.summary.campaignOrder.join(" → ")},{" "}
              {plan.summary.lotsPerYear} lots a year.</>
          : <>Published: product {plan.summary.product}, lot {f(plan.summary.lotSize, 1)} kg,{" "}
              {plan.summary.lotsPerYear} lots a year.</>}
        {" "}{plan.trains.map((t) => (
          <span key={t.name}>
            Train <b>{t.name}</b> needs <b>{f(t.requiredTime, 1)} h</b> of {f(t.availableTime, 0)} h ({pct(t.occupancy)}).{" "}
          </span>
        ))}
      </Text>
      {plan.multiProduct && (
        <PanTable>
          <Table.Thead><Table.Tr>
            <Table.Th>product</Table.Th><Table.Th>train</Table.Th><Table.Th>limiting stage</Table.Th>
            <Table.Th>T_L, h</Table.Th><Table.Th>campaigns</Table.Th><Table.Th>needs, h</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {(plan as MultiProductPlan).productTrains.map((p) => (
              <Table.Tr key={`${p.product}:${p.train}`}>
                <Table.Td>{p.product}</Table.Td><Table.Td>{p.train}</Table.Td>
                <Table.Td>{p.limitingStage}</Table.Td><Table.Td>{f(p.cycleTime, 2)}</Table.Td>
                <Table.Td>{p.campaigns}</Table.Td><Table.Td>{f(p.requiredTime, 1)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </PanTable>
      )}
      <PanTable>
        <Table.Thead><Table.Tr>
          <Table.Th>stage</Table.Th><Table.Th>train</Table.Th>
          {!plan.multiProduct && <Table.Th>cycle, h</Table.Th>}
          <Table.Th>{plan.multiProduct ? "largest utilisation" : "utilisation"}</Table.Th>
          <Table.Th>busy h/yr</Table.Th><Table.Th>occupancy</Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {stageRows.map((s) => (
            <Table.Tr key={s.name} data-published-stage={s.name}
              style={s.limiting ? { background: "var(--mantine-color-yellow-light)" } : undefined}>
              <Table.Td>{s.name}{s.limiting ? <Badge ml={6} size="xs" color="orange">limiting</Badge> : null}</Table.Td>
              <Table.Td>{s.train}</Table.Td>
              {!plan.multiProduct && <Table.Td>{f(s.cycle, 2)}</Table.Td>}
              <Table.Td>{pct(s.util, 0)}</Table.Td>
              <Table.Td>{f(s.busy, 1)}</Table.Td><Table.Td>{pct(s.occ)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
      <GanttBox plan={plan} caseName={caseName} />
    </Box>
  );
}

function EngineHalf({ witness, caseName, children }: {
  witness: string; caseName: string; children: React.ReactNode;
}): JSX.Element {
  const [go, setGo] = useState(false);
  const run = useMethodRun(go ? witness : null, [], "plain", "choupoSolve");
  const plan = run.result?.batchPlan;
  return (
    <Box data-engine-half={caseName}>
      <HalfBanner half="engine">{children}</HalfBanner>
      <OriginMark of="engine" note={`the batchPlan of ${caseName}, as the engine published it; nothing below is recomputed`} />
      {!go && (
        <Button mt="sm" size="xs" variant="default" data-engine-run={caseName}
          onClick={() => setGo(true)}>
          Run {caseName} and draw its plan
        </Button>
      )}
      {go && run.busy && <Text size="sm" mt="sm" c="dimmed">Running the engine in the browser…</Text>}
      {go && run.err && <Text size="sm" mt="sm" c="red">{run.err}</Text>}
      {go && !run.busy && !run.err && run.result && !plan && (
        <Text size="sm" mt="sm" c="red">The run published no batch plan.</Text>
      )}
      {plan && <PublishedPlan plan={plan} caseName={caseName} />}
    </Box>
  );
}

// ---- the page --------------------------------------------------------------

export function CampaignPlanTool(): JSX.Element {
  const [a, setA] = useState<ToyAKnobs>(TOY_A_DEFAULT);
  const [b, setB] = useState<ToyBKnobs>(TOY_B_DEFAULT);
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 1040, margin: "0 auto" }}>
        <Box>
          <Title order={4}>How a batch plant is organised: lots, campaigns and the Gantt chart</Title>
          <Text size="sm" c="dimmed" mt={4}>
            How a plant makes several products in lots, where a continuous machine such as a spray
            dryer fits, and how many hours of the year that takes. The Gantt chart is live: move a
            slider and the limiting stage moves with it. Then the same chart shows what the engine
            published for two real cases.
          </Text>
          <Alert mt="sm" color="yellow" variant="light" title="Two halves, not one" data-halves="">
            The sections marked "The toy" are recomputed in this page and every number in them is an
            illustration. The sections marked "The engine" run a Choupo case in the browser and
            draw the plan it published, with the same bars. The page says which one you are in
            at the top of each.
          </Alert>
        </Box>

        {step(1)}
        {step(2)}
        {step(3)}
        <ToyA k={a} setK={setA} />
        {step(4)}
        {step(5)}
        {step(6)}
        <EngineHalf witness={CAMPAIGN_WITNESS_ONE} caseName="apalutamide01_tablets">
          The apalutamide tablet plant has two trains: the spray-drying train (the solution tank
          held through the dryer, which runs from the flowsheet&apos;s own rate and is cleaned at the
          campaign changeover) and the solid-dose suite. The chart shows the first campaign of
          each train on its own time axis.
        </EngineHalf>
        {step(7)}
        <ToyB k={b} setK={setB} />
        <EngineHalf witness={CAMPAIGN_WITNESS_MULTI} caseName="donepezil02_two_strengths">
          The donepezil 5 mg and 10 mg plant, in the order 10 mg then 5 mg: the year of every
          campaign and changeover, then each product&apos;s first campaign. Reorder the campaigns
          in the case&apos;s own campaignOrder and the hours stay 928.2 h and 2127 h.
        </EngineHalf>

        <LessonQuiz title="Check your understanding" questions={CAMPAIGN_PLAN_QUIZ} lesson={CAMPAIGN_PLAN_STEPS} />
        <LessonLimits limits={CAMPAIGN_PLAN_LIMITS} />

        <LessonReferences tool="campaign-plan" />
      </Stack>
    </Box>
  );
}
