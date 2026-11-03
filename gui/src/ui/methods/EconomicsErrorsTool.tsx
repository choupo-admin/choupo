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
  EconomicsErrorsTool -- "Ways a pharmaceutical-plant economics goes wrong"
  (commission C210, synthesis item E7).

  THE TASK (CLAUDE.md section 10): before handing in an economics chapter,
  the student checks eight common mistakes against their own numbers, sees
  the wrong calculation and the right one on the same inputs, and reads what
  Choupo does about each (or that it does nothing).

  NO ENGINE RUN.  The arithmetic is economicsErrorsMath.ts (React-free, held
  by tests/economicsErrors.test.ts, which also holds each guard sentence to
  the engine source it cites); this file draws it.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Badge, Box, Group, NativeSelect, NumberInput, Stack, Table, Text,
  TextInput, Title,
} from "@mantine/core";

import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import {
  ECON_ERRORS_LIMITS, ECON_ERRORS_QUIZ, ECON_ERRORS_STEPS,
} from "./economicsErrorsLesson.js";
import {
  GUARDS, UNITS, annuityFactor, buildingCost, plantDefaults, plantNpv,
  profitBreakEvenN, rateAndIrr, royalty, soldQuantity, spreadOf, taxBase,
  twoRevenues, utilityBill, wcDefaults, workingCapitals,
  type ClassId, type Guard, type GuardKind, type PlantEcon,
} from "./economicsErrorsMath.js";
import { OriginMark } from "./origin.js";

const step = lessonStepper(ECON_ERRORS_STEPS);

const f = (x: number, p = 2): string => (Number.isFinite(x) ? x.toFixed(p) : "—");
const pct = (x: number | null, p = 1): string => (x === null ? "none" : `${(100 * x).toFixed(p)} %`);

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const TEXTC = "var(--mantine-color-text)";

const KIND_COLOR: Record<GuardKind, string> = {
  refuses: "red", announces: "orange", constructs: "blue", none: "gray",
};
const KIND_WORD: Record<GuardKind, string> = {
  refuses: "refuses", announces: "announces", constructs: "constructs, does not compare",
  none: "does NOT catch this",
};

function GuardBox({ id }: { id: ClassId }): JSX.Element {
  const gs: readonly Guard[] = GUARDS[id];
  return (
    <Box data-guard={id} mt="xs" p="xs"
      style={{ border: `1px solid ${GRID}`, borderRadius: 4 }}>
      <Text size="xs" fw={700}>The guard in Choupo</Text>
      <Stack gap={4} mt={4}>
        {gs.map((g, k) => (
          <Group key={k} gap="xs" wrap="nowrap" align="flex-start" data-guard-kind={g.kind}>
            <Badge size="sm" color={KIND_COLOR[g.kind]} variant={g.kind === "none" ? "outline" : "light"}
              style={{ flexShrink: 0 }}>{KIND_WORD[g.kind]}</Badge>
            <Text size="xs">
              {g.says}
              {g.file !== "" && <> <code>{g.file}</code>{g.gate ? <> (gate <code>{g.gate}</code>)</> : null}.</>}
            </Text>
          </Group>
        ))}
      </Stack>
    </Box>
  );
}

function Side({ title, tone, children }: {
  title: string; tone: "wrong" | "right"; children: React.ReactNode;
}): JSX.Element {
  return (
    <Box data-side={tone} p="xs" style={{
      flex: "1 1 280px", minWidth: 240, borderRadius: 4,
      border: `1px solid ${tone === "wrong" ? "var(--mantine-color-red-4)" : "var(--mantine-color-teal-4)"}`,
    }}>
      <Group gap="xs">
        <Badge size="sm" color={tone === "wrong" ? "red" : "teal"}>{tone === "wrong" ? "WRONG" : "RIGHT"}</Badge>
        <Text size="sm" fw={600}>{title}</Text>
      </Group>
      <Box mt={4}>{children}</Box>
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

function Num({ label, value, onChange, unit, step: st = 1, min = 0, w = 140 }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string;
  step?: number; min?: number; w?: number;
}): JSX.Element {
  return (
    <NumberInput size="xs" label={label} description={unit} value={value} min={min} step={st} w={w}
      onChange={(v) => { if (typeof v === "number" && Number.isFinite(v)) onChange(v); }} />
  );
}

function NpvChart({ rates, npvs, irr, chosen }: {
  rates: number[]; npvs: number[]; irr: number | null; chosen: number;
}): JSX.Element {
  const W = 520, H = 220, ML = 56, MR = 14, MT = 12, MB = 38;
  const lo = Math.min(0, ...npvs), hi = Math.max(0, ...npvs);
  const span = Math.max(hi - lo, 1e-9);
  const sx = (x: number) => ML + (x / 0.8) * (W - ML - MR);
  const sy = (y: number) => H - MB - ((y - lo) / span) * (H - MT - MB);
  return (
    <Box data-chart="npv-vs-rate" style={{ maxWidth: W }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label="Net present value against discount rate">
        <line x1={ML} x2={W - MR} y1={sy(0)} y2={sy(0)} stroke={INK} strokeWidth={0.8} />
        {rates.filter((_, k) => k % 2 === 0).map((x) => (
          <text key={x} x={sx(x)} y={H - MB + 13} textAnchor="middle" fontSize={9} fill={INK}>
            {Math.round(100 * x)}
          </text>
        ))}
        {[lo, (lo + hi) / 2, hi].map((y, k) => (
          <text key={k} x={ML - 5} y={sy(y) + 3} textAnchor="end" fontSize={9} fill={INK}>{y.toFixed(0)}</text>
        ))}
        <text x={(ML + W - MR) / 2} y={H - 5} textAnchor="middle" fontSize={10} fill={TEXTC}>discount rate (%)</text>
        <text x={12} y={(MT + H - MB) / 2} fontSize={10} fill={TEXTC} textAnchor="middle"
          transform={`rotate(-90 12 ${(MT + H - MB) / 2})`}>NPV (M EUR)</text>
        <polyline fill="none" stroke="#1971c2" strokeWidth={2}
          points={rates.map((x, k) => `${sx(x)},${sy(npvs[k] ?? 0)}`).join(" ")} />
        {chosen <= 0.8 && <line x1={sx(chosen)} x2={sx(chosen)} y1={MT} y2={H - MB} stroke="#e8590c"
          strokeDasharray="4 3" strokeWidth={1.2} />}
        {irr !== null && irr <= 0.8 && <circle cx={sx(irr)} cy={sy(0)} r={4} fill="#2f9e44" />}
      </svg>
      <Text size="xs" c="dimmed">
        <span style={{ color: "#1971c2", fontWeight: 700 }}>— NPV(i)</span>{"  "}
        <span style={{ color: "#e8590c", fontWeight: 700 }}>- - the rate you chose</span>{"  "}
        <span style={{ color: "#2f9e44", fontWeight: 700 }}>● the IRR (where the curve crosses zero)</span>
      </Text>
    </Box>
  );
}

export function EconomicsErrorsTool(): JSX.Element {
  // ---- class 1
  const [sold, setSold] = useState({ productionM: 14, marketM: 8, share: 0.25, factor: 6, price: 3, scaleSlip: 1 });
  const sr = useMemo(() => soldQuantity(sold), [sold]);
  // ---- classes 2 and 3 share one plant
  const [plant, setPlant] = useState<PlantEcon>(plantDefaults());
  const [pBE, setPBE] = useState(2.0);
  const tr = useMemo(() => twoRevenues(plant, pBE), [plant, pBE]);
  const tx = useMemo(() => taxBase(plant), [plant]);
  const setP = <K extends keyof PlantEcon>(k: K, v: PlantEcon[K]) => setPlant({ ...plant, [k]: v });
  // ---- class 4
  const [roy, setRoy] = useState({ rate: 0.08, sales: 30, window: 0, L: 10, i: 0.10 });
  const rr = useMemo(() => royalty(roy), [roy]);
  // ---- class 5
  const [wc, setWc] = useState(wcDefaults());
  const wr = useMemo(() => workingCapitals(wc), [wc]);
  // ---- class 6
  const [rt, setRt] = useState({ I: 30, cf: 6, L: 10, i: 0.60, scale: 6 });
  const rres = useMemo(() => rateAndIrr(rt), [rt]);
  // ---- class 7
  const [ub, setUb] = useState({ qty: 10800, qtyUnit: "GJ", price: 0.10, priceUnit: "kWh" });
  const bill = useMemo(() => utilityBill(ub.qty, ub.qtyUnit, ub.price, ub.priceUnit), [ub]);
  // ---- class 8
  const [area, setArea] = useState(1500);
  const [decl, setDecl] = useState({ perM2: 600, year: 2026, source: "", reason: "" });
  const [other, setOther] = useState(200);
  const bc = useMemo(() => buildingCost(area, decl), [area, decl]);
  const unitOpts = UNITS.map((u) => ({ value: u.id, label: `${u.id} (${u.dim})` }));

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>Ways a pharmaceutical-plant economics goes wrong</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Eight mistakes that recur in plant-design economics chapters.  For
            each: the wrong calculation and the right one on the same inputs,
            side by side, and what Choupo does about it, or the plain statement
            that it does nothing and the check is yours.  Every number is an
            illustration you can edit.
          </Text>
          <Alert mt="sm" color="yellow" variant="light" title="Illustrations, not a market study" data-illustrations="">
            The plant, prices and costs below are round numbers chosen to show
            each mistake.  The arithmetic is the standard year-end discounted
            cash flow; nothing here is a forecast or financial advice.
          </Alert>
        </Box>

        {step(1)}

        {/* ---------------------------------------------------------------- 1 */}
        {step(2)}
        <Box data-class="sold">
          <Title order={5}>1. The sold quantity</Title>
          <OriginMark of={["page", "assumption"]} note="computed here from the inputs; the inputs are illustrations" />
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Plant production Q" unit="million packs / yr" value={sold.productionM} step={1}
              onChange={(v) => setSold({ ...sold, productionM: v })} />
            <Num label="Market demand D" unit="million packs / yr, as the series gives it" value={sold.marketM} step={1}
              onChange={(v) => setSold({ ...sold, marketM: v })} w={190} />
            <Num label="Share you can win s" value={sold.share} step={0.05}
              onChange={(v) => setSold({ ...sold, share: v })} />
            <Num label="Unargued factor" unit="to fill the plant" value={sold.factor} step={0.5}
              onChange={(v) => setSold({ ...sold, factor: v })} />
            <Num label="Price" unit="EUR / pack" value={sold.price} step={0.1}
              onChange={(v) => setSold({ ...sold, price: v })} />
            <NativeSelect size="xs" label="Series is in" description="read as millions"
              value={String(sold.scaleSlip)} w={150}
              data={[{ value: "1", label: "millions (read right)" }, { value: "1000", label: "thousands (read as millions)" }]}
              onChange={(e) => setSold({ ...sold, scaleSlip: Number(e.currentTarget.value) })} />
          </Group>
          <Group mt="sm" align="stretch" gap="sm" wrap="wrap">
            <Side tone="wrong" title="Book the factor and the series as written">
              <Text size="sm" data-sold-wrong="">
                N = D s x factor x slip = <b>{f(sr.wrong, 1)} million packs a year</b>
                {" "}= {f(sr.wrongOverProduction, 2)} x the plant&apos;s production.
                Revenue <b>{f(sr.revenueWrongMEUR, 1)} M EUR</b> a year.
              </Text>
              {sr.wrongOverProduction > 1 && (
                <Text size="xs" c="red" mt={4} data-impossible="">
                  Impossible: the plant cannot make more than {f(sold.productionM, 1)} million packs a year.
                </Text>
              )}
            </Side>
            <Side tone="right" title="The smaller of the plant and the market share">
              <Text size="sm" data-sold-right="">
                N = min(Q, D s) = <b>{f(sr.right, 2)} million packs a year</b>.
                Revenue <b>{f(sr.revenueRightMEUR, 1)} M EUR</b> a year.
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                To fill the plant the market share would have to be multiplied
                by <b>{f(sr.fillFactor, 2)}</b>: that is the assumption to argue
                and show in the report (the demand-forecast tool does the
                forecast behind D).
              </Text>
            </Side>
          </Group>
          <GuardBox id="sold" />
        </Box>

        {/* ---------------------------------------------------------------- 2 */}
        {step(3)}
        <Box data-class="twoRevenues">
          <Title order={5}>2. The break-even and the NPV on one revenue</Title>
          <OriginMark of={["page", "assumption"]} note="one illustrative plant, shared with classes 3 and 6" />
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Investment I" unit="M EUR" value={plant.I} onChange={(v) => setP("I", v)} />
            <Num label="Fixed costs F" unit="M EUR / yr" value={plant.F} onChange={(v) => setP("F", v)} />
            <Num label="Variable cost v" unit="EUR / pack" value={plant.v} step={0.1} onChange={(v) => setP("v", v)} />
            <Num label="Price p (the NPV's)" unit="EUR / pack" value={plant.p} step={0.1} onChange={(v) => setP("p", v)} />
            <Num label="Sold N" unit="million packs / yr" value={plant.N} onChange={(v) => setP("N", v)} />
            <Num label="Tax rate t" value={plant.t} step={0.01} onChange={(v) => setP("t", v)} />
            <Num label="Life L" unit="years" value={plant.L} onChange={(v) => setP("L", Math.max(1, Math.round(v)))} />
            <Num label="Depreciable life" unit="years" value={plant.Ld} onChange={(v) => setP("Ld", Math.max(1, Math.round(v)))} />
            <Num label="Discount rate i" value={plant.i} step={0.01} onChange={(v) => setP("i", v)} />
            <Num label="Price in the break-even" unit="EUR / pack, a different table" value={pBE} step={0.1}
              onChange={setPBE} w={210} />
          </Group>
          <Text size="sm" mt={6} data-npv-base="">
            At N = {f(plant.N, 1)} and p = {f(plant.p, 2)}: NPV = <b>{f(plantNpv(plant, plant.N, plant.p), 1)} M EUR</b>;
            accounting break-even (profit zero) = {f(profitBreakEvenN(plant, plant.p), 2)} million packs a year.
          </Text>
          <Group mt="sm" align="stretch" gap="sm" wrap="wrap">
            <Side tone="wrong" title="Break-even at a different price than the NPV">
              <Text size="sm" data-be-wrong="">
                N* = <b>{f(tr.nWrong, 2)}</b> million packs a year (revenue at N = {f(tr.revenueBreakEven, 1)} M EUR, the NPV uses {f(tr.revenueNpv, 1)}).
                Put it into the NPV: <b>{f(tr.npvAtWrong, 1)} M EUR</b>, not zero.
              </Text>
            </Side>
            <Side tone="right" title="One revenue, tested by putting N* back">
              <Text size="sm" data-be-right="">
                N* = <b>{f(tr.nConsistent, 2)}</b> million packs a year.
                NPV at N* = <b>{f(tr.npvAtConsistent, 6)} M EUR</b>.
              </Text>
            </Side>
          </Group>
          <GuardBox id="twoRevenues" />
        </Box>

        {/* ---------------------------------------------------------------- 3 */}
        {step(4)}
        <Box data-class="taxBase">
          <Title order={5}>3. The tax base</Title>
          <OriginMark of={["page", "assumption"]} note="the same plant as above" />
          <PanTable>
            <Table.Thead><Table.Tr>
              <Table.Th>sales S</Table.Th><Table.Th>cost K</Table.Th><Table.Th>depreciation d</Table.Th>
              <Table.Th>taxable income S-K-d</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody><Table.Tr data-tax-base="">
              <Table.Td>{f(tx.sales, 2)}</Table.Td><Table.Td>{f(tx.costOfManufacture, 2)}</Table.Td>
              <Table.Td>{f(tx.depreciation, 2)}</Table.Td><Table.Td>{f(tx.taxableIncome, 2)}</Table.Td>
            </Table.Tr></Table.Tbody>
          </PanTable>
          <Group mt="sm" align="stretch" gap="sm" wrap="wrap">
            <Side tone="wrong" title="Tax rate times sales">
              <Text size="sm" data-tax-wrong="">
                T = t S = <b>{f(tx.taxWrong, 2)} M EUR</b>; cash flow {f(tx.cashFlowWrong, 2)} M EUR a year;
                NPV <b>{f(tx.npvWrong, 1)} M EUR</b>.
              </Text>
            </Side>
            <Side tone="right" title="Tax rate times taxable income">
              <Text size="sm" data-tax-right="">
                T = t (S - K - d) = <b>{f(tx.taxRight, 2)} M EUR</b>; cash flow {f(tx.cashFlowRight, 2)} M EUR a year;
                NPV <b>{f(tx.npvRight, 1)} M EUR</b>.
              </Text>
            </Side>
          </Group>
          <GuardBox id="taxBase" />
        </Box>

        {/* ---------------------------------------------------------------- 4 */}
        {step(5)}
        <Box data-class="royalty">
          <Title order={5}>4. The royalty window</Title>
          <OriginMark of={["page", "assumption"]} note="the rate and the window are yours to declare; nothing here is a licence term" />
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Royalty rate r" value={roy.rate} step={0.01} onChange={(v) => setRoy({ ...roy, rate: v })} />
            <Num label="Net sales S" unit="M EUR / yr" value={roy.sales} onChange={(v) => setRoy({ ...roy, sales: v })} />
            <Num label="Licensed years in force E" unit="0 = patent expired" value={roy.window} step={1}
              onChange={(v) => setRoy({ ...roy, window: Math.round(v) })} w={170} />
            <Num label="Life L" unit="years" value={roy.L} onChange={(v) => setRoy({ ...roy, L: Math.max(1, Math.round(v)) })} />
            <Num label="Discount rate i" value={roy.i} step={0.01} onChange={(v) => setRoy({ ...roy, i: v })} />
          </Group>
          <Group mt="sm" align="stretch" gap="sm" wrap="wrap">
            <Side tone="wrong" title="Royalty every year of the project">
              <Text size="sm" data-roy-wrong="">
                {f(roy.rate * roy.sales, 2)} M EUR a year for {roy.L} years: present value{" "}
                <b>{f(rr.pvWrong, 2)} M EUR</b> of a cost that does not exist after the patent.
              </Text>
            </Side>
            <Side tone="right" title="Royalty only while a licensed patent is in force">
              <Text size="sm" data-roy-right="">
                {roy.window} year{roy.window === 1 ? "" : "s"} charged: present value <b>{f(rr.pvRight, 2)} M EUR</b>.
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                If the patent is live and you hold no licence, the product cannot
                be sold lawfully; a royalty line does not repair that.
              </Text>
            </Side>
          </Group>
          <GuardBox id="royalty" />
        </Box>

        {/* ---------------------------------------------------------------- 5 */}
        {step(6)}
        <Box data-class="workingCapital">
          <Title order={5}>5. Three working capitals on one plant</Title>
          <OriginMark of={["page", "assumption"]} note="the fractions and the days are illustrations; cite your own" />
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Fixed capital I" unit="M EUR" value={wc.fci} onChange={(v) => setWc({ ...wc, fci: v })} />
            <Num label="Sales S" unit="M EUR / yr" value={wc.sales} onChange={(v) => setWc({ ...wc, sales: v })} />
            <Num label="Cost of manufacture K" unit="M EUR / yr" value={wc.com} onChange={(v) => setWc({ ...wc, com: v })} />
            <Num label="Raw materials M" unit="M EUR / yr" value={wc.rawMaterials} onChange={(v) => setWc({ ...wc, rawMaterials: v })} />
            <Num label="alpha (of I)" value={wc.fracFci} step={0.01} onChange={(v) => setWc({ ...wc, fracFci: v })} />
            <Num label="beta (of S)" value={wc.fracSales} step={0.01} onChange={(v) => setWc({ ...wc, fracSales: v })} />
            <Num label="Stock days" unit="raw material" value={wc.daysStock} onChange={(v) => setWc({ ...wc, daysStock: v })} />
            <Num label="Receivable days" value={wc.daysReceivables} onChange={(v) => setWc({ ...wc, daysReceivables: v })} />
            <Num label="Payable days" value={wc.daysPayables} onChange={(v) => setWc({ ...wc, daysPayables: v })} />
            <Num label="Cash days" value={wc.daysCash} onChange={(v) => setWc({ ...wc, daysCash: v })} />
          </Group>
          <PanTable>
            <Table.Thead><Table.Tr>
              <Table.Th>method</Table.Th><Table.Th>working capital (M EUR)</Table.Th>
              <Table.Th>as % of I</Table.Th><Table.Th>cost to the NPV (M EUR)</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {([["A  fraction of the fixed capital", wr.a, wr.npvCost.a],
                 ["B  fraction of annual sales", wr.b, wr.npvCost.b],
                 ["C  build-up from days (Choupo's block)", wr.c, wr.npvCost.c]] as const).map(([lab, v, c], k) => (
                <Table.Tr key={k} data-wc-method={"ABC"[k]}>
                  <Table.Td>{lab}</Table.Td><Table.Td>{f(v, 2)}</Table.Td>
                  <Table.Td>{f(100 * v / wc.fci, 1)}</Table.Td><Table.Td>{f(c, 2)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <Text size="sm" mt={4} data-wc-spread="">
            Largest over smallest: <b>{f(wr.spread, 1)} x</b>.  Method C lines (M EUR): stock {f(wr.cLines.stock, 2)},
            receivables {f(wr.cLines.receivables, 2)}, cash {f(wr.cLines.cash, 2)}, less payables {f(wr.cLines.payables, 2)}.
            The NPV cost is only the time value, because the capital is recovered
            at the end of year {wc.L}.
          </Text>
          <Group mt="sm" align="stretch" gap="sm" wrap="wrap">
            <Side tone="wrong" title="Take whichever method suits the result">
              <Text size="sm">The report quotes one figure and does not say why that rule.</Text>
            </Side>
            <Side tone="right" title="State the method, its reason, and show the others">
              <Text size="sm">Declare one method with its inputs and give the alternatives as a range in the sensitivity.</Text>
            </Side>
          </Group>
          <GuardBox id="workingCapital" />
        </Box>

        {/* ---------------------------------------------------------------- 6 */}
        {step(7)}
        <Box data-class="discountRate">
          <Title order={5}>6. The discount rate and the IRR on one curve</Title>
          <OriginMark of={["page", "assumption"]} note="an illustrative equal-yearly cash flow" />
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Investment" unit="M EUR" value={rt.I} onChange={(v) => setRt({ ...rt, I: v })} />
            <Num label="Cash flow per year" unit="M EUR" value={rt.cf} step={0.5} onChange={(v) => setRt({ ...rt, cf: v })} />
            <Num label="Life" unit="years" value={rt.L} onChange={(v) => setRt({ ...rt, L: Math.max(1, Math.round(v)) })} />
            <Num label="Discount rate you chose" unit="per year" value={rt.i} step={0.05} onChange={(v) => setRt({ ...rt, i: v })} w={170} />
            <Num label="Scale error multiplies cash flow by" value={rt.scale} step={1} onChange={(v) => setRt({ ...rt, scale: v })} w={220} />
          </Group>
          <NpvChart rates={rres.rates} npvs={rres.npvs} irr={rres.irr} chosen={rt.i} />
          <Group mt="sm" align="stretch" gap="sm" wrap="wrap">
            <Side tone="wrong" title="Read the rate as the cause of the IRR">
              <Text size="sm" data-rate-wrong="">
                With the cash flow multiplied by {rt.scale} (a scale error upstream) the IRR is{" "}
                <b>{pct(rres.irrScaled, 0)}</b> whatever rate was chosen; at your {pct(rt.i, 0)} the NPV is{" "}
                {f(rres.npvScaledAtChosen, 1)} M EUR.  The rate did not produce it.
              </Text>
            </Side>
            <Side tone="right" title="The IRR is a property of the cash flow; the rate is your requirement">
              <Text size="sm" data-rate-right="">
                This cash flow: IRR <b>{pct(rres.irr)}</b>, NPV at {pct(rt.i, 0)} ={" "}
                <b>{f(rres.npvAtChosen, 1)} M EUR</b>
                {rres.npvAtChosen < 0 ? " (a rate that high turns a sound project negative)" : ""}.
                Annuity factor at that rate: {f(annuityFactor(rt.i, rt.L), 3)}.
              </Text>
            </Side>
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            What a discount rate means: the return you require on the money, at the risk of this
            plant, because it could earn that elsewhere.  It is a judgement you declare and defend;
            it is not derived from the cash flow.
          </Text>
          <GuardBox id="discountRate" />
        </Box>

        {/* ---------------------------------------------------------------- 7 */}
        {step(8)}
        <Box data-class="units">
          <Title order={5}>7. The utility bill and its units</Title>
          <OriginMark of={["page", "assumption"]} note="a units conversion through the SI base unit; the tariff is an illustration" />
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Quantity used" value={ub.qty} step={100} onChange={(v) => setUb({ ...ub, qty: v })} />
            <NativeSelect size="xs" label="Quantity unit" value={ub.qtyUnit} data={unitOpts} w={150}
              onChange={(e) => setUb({ ...ub, qtyUnit: e.currentTarget.value })} />
            <Num label="Price" unit="EUR per priced unit" value={ub.price} step={0.01} onChange={(v) => setUb({ ...ub, price: v })} />
            <NativeSelect size="xs" label="Price is per" value={ub.priceUnit} data={unitOpts} w={150}
              onChange={(e) => setUb({ ...ub, priceUnit: e.currentTarget.value })} />
          </Group>
          {bill.ok ? (
            <Group mt="sm" align="stretch" gap="sm" wrap="wrap">
              <Side tone="wrong" title="Multiply the numbers as written">
                <Text size="sm" data-units-wrong="">
                  {ub.qty} x {ub.price} = <b>{f(bill.wrong, 2)} EUR</b>
                  {Math.abs(bill.ratio - 1) < 1e-9 ? "." : bill.ratio < 1
                    ? <> — low by a factor of <b>{f(1 / bill.ratio, 1)}</b>.</>
                    : <> — high by a factor of <b>{f(bill.ratio, 1)}</b>.</>}
                </Text>
              </Side>
              <Side tone="right" title="Convert the quantity into the priced unit first">
                <Text size="sm" data-units-right="">
                  {ub.qty} {ub.qtyUnit} = {f(bill.quantityInPriceUnit, 3)} {ub.priceUnit}; bill ={" "}
                  <b>{f(bill.right, 2)} EUR</b>.
                </Text>
              </Side>
            </Group>
          ) : (
            <Alert mt="sm" color="red" variant="light" data-units-refused="">{bill.reason}</Alert>
          )}
          <Text size="xs" c="dimmed" mt={4}>
            The engine&apos;s utility slot is EUR per GJ: 0.10 EUR/kWh is {f(0.10 / (3.6e6 / 1e9), 1)} EUR/GJ.
          </Text>
          <GuardBox id="units" />
        </Box>

        {/* ---------------------------------------------------------------- 8 */}
        {step(9)}
        <Box data-class="unitCost">
          <Title order={5}>8. A declared unit cost</Title>
          <OriginMark of={["page", "assumption"]} note="the unit costs are placeholders to be replaced by a sourced value" />
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Floor area A" unit="m2" value={area} step={100} onChange={setArea} />
            <Num label="Unit cost u" unit="EUR / m2" value={decl.perM2} step={50} onChange={(v) => setDecl({ ...decl, perM2: v })} />
            <Num label="Another report's u" unit="EUR / m2" value={other} step={50} onChange={setOther} />
            <Num label="Price year" value={decl.year} step={1} onChange={(v) => setDecl({ ...decl, year: Math.round(v) })} />
            <TextInput size="xs" label="source" w={230} value={decl.source}
              onChange={(e) => setDecl({ ...decl, source: e.currentTarget.value })} />
            <TextInput size="xs" label="reason (why it describes this building)" w={260} value={decl.reason}
              onChange={(e) => setDecl({ ...decl, reason: e.currentTarget.value })} />
          </Group>
          <Group mt="sm" align="stretch" gap="sm" wrap="wrap">
            <Side tone="wrong" title="A bare number per m2">
              <Text size="sm" data-cost-wrong="">
                {f(area * decl.perM2 / 1e6, 2)} M EUR here against {f(area * other / 1e6, 2)} M EUR at the other
                figure: a spread of <b>{f(spreadOf([decl.perM2, other]), 1)} x</b> that nobody can resolve.
              </Text>
            </Side>
            <Side tone="right" title="A declaration with its source and reason">
              {bc.ok ? (
                <Text size="sm" data-cost-right="">
                  {f(bc.totalMEUR, 2)} M EUR, declared {decl.year}: &ldquo;{decl.source}&rdquo; — {decl.reason}.
                </Text>
              ) : (
                <Text size="sm" c="red" data-cost-refused="">
                  Refused, as the engine refuses a quote or a land price: no {bc.missing.join(" and no ")} declared.
                </Text>
              )}
            </Side>
          </Group>
          <GuardBox id="unitCost" />
        </Box>

        {step(10)}

        <LessonQuiz title="Check your understanding" questions={ECON_ERRORS_QUIZ} lesson={ECON_ERRORS_STEPS} />

        <LessonLimits limits={ECON_ERRORS_LIMITS} />
      </Stack>
    </Box>
  );
}
