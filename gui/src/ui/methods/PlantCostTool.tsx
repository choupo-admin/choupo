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
  PlantCostTool -- "What a plant costs to build" (DEV.md 4c C212 A).

  THE TASK (CLAUDE.md section 10): the student has a list of equipment and
  must put a defensible number on the capital to build the plant, and on the
  money that keeps it running and the loan that may pay for it.  The page
  shows Lang's multiplier, a factored estimate (every fraction a student
  input, a pointer to the chapter that tabulates it beside it), the engine's bare-module
  route, the three side by side with their spread, three working capitals
  with their spread, and a year-by-year loan schedule.

  NO ENGINE RUN.  The arithmetic is plantCostMath.ts (React-free, held by
  tests/plantCost.test.ts, which also holds each engine claim to its
  source line); this file draws it.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Badge, Box, Group, NativeSelect, NumberInput, Stack, Table, Text, Title,
} from "@mantine/core";

import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import {
  PLANT_COST_LIMITS, PLANT_COST_QUIZ, PLANT_COST_STEPS,
} from "./plantCostLesson.js";
import {
  DIRECT_ROWS, EXAMPLES, INDIRECT_ROWS, LANG_FACTORS, PROCESS_TYPE_LABEL, paperLang,
  bareModule, directDefaults, factored, fciFractionFromTciShare, indirectDefaults,
  langFci, loanDefaults, loanSchedule, outsideRange, threeRoutes, wcDefaults,
  workingCapitals,
  type DirectFactors, type DirectKey, type ExampleId, type IndirectFactors,
  type IndirectKey, type LoanInputs, type ProcessType, type Repayment, type WcInputs,
  type EquipItem,
} from "./plantCostMath.js";
import { OriginMark } from "./origin.js";

const step = lessonStepper(PLANT_COST_STEPS);

const f = (x: number, p = 2): string => (Number.isFinite(x) ? x.toFixed(p) : "—");
const pct = (x: number, p = 0): string => `${(100 * x).toFixed(p)} %`;

function Num({ label, value, onChange, unit, step: st = 1, min = 0, w = 140 }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string;
  step?: number; min?: number; w?: number;
}): JSX.Element {
  return (
    <NumberInput size="xs" label={label} description={unit} value={value} min={min} step={st} w={w}
      onChange={(v) => { if (typeof v === "number" && Number.isFinite(v)) onChange(v); }} />
  );
}

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>{children}</Table>
    </Box>
  );
}

const RANGE_COLOR = { inside: "teal", below: "orange", above: "orange", none: "gray" } as const;

export function PlantCostTool(): JSX.Element {
  // ---- the equipment list, shared by steps 2-4
  const [exId, setExId] = useState<ExampleId>("tablets");
  const [items, setItems] = useState<EquipItem[]>(EXAMPLES.tablets.items.map((x) => ({ ...x })));
  const [type, setType] = useState<ProcessType>(EXAMPLES.tablets.type);
  const cbe = useMemo(() => items.reduce((s, x) => s + x.cp, 0), [items]);
  const paper = EXAMPLES[exId].paper;
  const pl = paper ? paperLang(items, paper) : null;
  const pickExample = (id: ExampleId) => {
    setExId(id);
    setItems(EXAMPLES[id].items.map((x) => ({ ...x })));
    setType(EXAMPLES[id].type);
  };
  const setItem = (k: number, patch: Partial<EquipItem>) =>
    setItems(items.map((x, j) => (j === k ? { ...x, ...patch } : x)));

  // ---- step 3
  const [fd, setFd] = useState<DirectFactors>(directDefaults());
  const [gi, setGi] = useState<IndirectFactors>(indirectDefaults());
  // ---- step 4
  const [fee, setFee] = useState(1.18);
  const [site, setSite] = useState(0.5);
  // ---- step 5
  const [wc, setWc] = useState<WcInputs>(wcDefaults());
  const [tciShare, setTciShare] = useState(0.15);
  // ---- step 6
  const [loan, setLoan] = useState<LoanInputs>(loanDefaults());
  const [repay, setRepay] = useState<Repayment>("annuity");

  const lang = useMemo(() => langFci(cbe, type), [cbe, type]);
  const fac = useMemo(() => factored(cbe, fd, gi), [cbe, fd, gi]);
  const bm = useMemo(() => bareModule(items, fee, site), [items, fee, site]);
  const three = useMemo(() => threeRoutes(lang, fac.fci, bm.fci), [lang, fac.fci, bm.fci]);
  const wr = useMemo(() => workingCapitals(wc), [wc]);
  const ls = useMemo(() => loanSchedule({ ...loan, repayment: repay }), [loan, repay]);

  const setWcK = <K extends keyof WcInputs>(k: K, v: number) => setWc({ ...wc, [k]: v });
  const setLn = <K extends keyof LoanInputs>(k: K, v: LoanInputs[K]) => setLoan({ ...loan, [k]: v });

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>What a plant costs to build</Title>
          <Text size="sm" c="dimmed" mt={4}>
            From a list of equipment to the capital: Lang&apos;s multiplier, a factored
            estimate, Choupo&apos;s bare-module route, the working capital by three
            methods and a loan.  The methods disagree, and the spread is the lesson.
            Every number is an illustration you can edit.
          </Text>
          <Alert mt="sm" color="yellow" variant="light" title="Illustrations, not a quotation" data-illustrations="">
            The equipment, its costs, the factors, the days and the loan terms are
            round numbers chosen to be followed by hand, except the third example list, which is Table 3 of a published paper (cited, with its licence, under the list).  Lang&apos;s three factors
            and the engine&apos;s constants are cited; no typical range is printed;
            beside each fraction is a pointer to the chapter that tabulates it.
          </Alert>
        </Box>

        {step(1)}

        {/* ---------------------------------------------------------------- 2 */}
        {step(2)}
        <Box data-section="lang">
          <Title order={5}>The equipment list and Lang&apos;s multiplier</Title>
          <OriginMark of={["page", "reference", "assumption"]}
            note="Lang's three factors are read from his papers; the equipment list is an invented illustration" />
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <NativeSelect size="xs" label="Example list" w={310} value={exId}
              data={(Object.keys(EXAMPLES) as ExampleId[]).map((k) => ({ value: k, label: EXAMPLES[k].label }))}
              onChange={(e) => pickExample(e.currentTarget.value as ExampleId)} />
            <NativeSelect size="xs" label="Type of process" w={210} value={type}
              data={(Object.keys(LANG_FACTORS) as ProcessType[]).map((k) => ({
                value: k, label: `${PROCESS_TYPE_LABEL[k]} (K = ${LANG_FACTORS[k].toFixed(2)})` }))}
              onChange={(e) => setType(e.currentTarget.value as ProcessType)} />
          </Group>
          <PanTable>
            <Table.Thead><Table.Tr>
              <Table.Th>{paper ? "item (from the paper)" : "item (illustration)"}</Table.Th><Table.Th>purchased cost C_p, M EUR</Table.Th>
              <Table.Th>bare-module factor F_BM</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {items.map((it, k) => (
                <Table.Tr key={k} data-item={k}>
                  <Table.Td>{it.name}</Table.Td>
                  <Table.Td><Num label="" value={it.cp} step={0.05} w={110}
                    onChange={(v) => setItem(k, { cp: v })} /></Table.Td>
                  <Table.Td><Num label="" value={it.fbm} step={0.1} w={110}
                    onChange={(v) => setItem(k, { fbm: v })} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <Text size="sm" mt={6} data-lang="">
            Purchased equipment C_Be = <b>{f(cbe, 2)} M EUR</b>.  Lang: F_L = {LANG_FACTORS[type].toFixed(2)} x {f(cbe, 2)} ={" "}
            <b>{f(lang, 2)} M EUR</b>.
          </Text>
          {paper && pl ? (
            <Box mt={6} data-paper-lang="">
              <Text size="xs" c="dimmed">
                Source: {paper.citation}.  Licence: {paper.licence}.
              </Text>
              <Text size="sm" mt={4}>
                The paper totals the list at <b>{f(paper.printedTotal, 3)} M EUR</b> (this list sums to{" "}
                {f(pl.sum, 5)}) and applies its own multiplier, K = <b>{f(paper.langK, 1)}</b>: {paper.where}.{" "}
                {f(paper.langK, 1)} x {f(pl.sum, 5)} = <b>{f(pl.product, 3)} M EUR</b>, printed by the paper as{" "}
                <b>{f(paper.printedPlant, 2)} M EUR</b> (&quot;Costs of establishing the plant&quot;, Table 3):{" "}
                {pl.reproduces ? "the arithmetic reproduces the paper's figure."
                  : "the arithmetic does NOT reproduce the paper's figure."}
                {" "}The page&apos;s own fluids factor, {LANG_FACTORS.fluids.toFixed(2)}, would give{" "}
                {f(LANG_FACTORS.fluids * pl.sum, 2)} M EUR: Lang&apos;s 1947 value and the 4.7 the paper takes
                from its reference [50] differ by 1 %, within the spread the lesson is about.
              </Text>
            </Box>
          ) : null}
          {EXAMPLES[exId].note ? (
            <Text size="xs" c="dimmed" mt={4} data-example-note="">{EXAMPLES[exId].note}</Text>
          ) : null}
          <Text size="xs" c="dimmed" mt={4}>
            Choupo prints this as its Lang cross-check (default K = 3.63, <code>EconomicsPass.cpp:2970-2971</code>),
            a reconciliation line that is never fed into its fixed capital.
          </Text>
        </Box>

        {/* ---------------------------------------------------------------- 3 */}
        {step(3)}
        <Box data-section="factored">
          <Title order={5}>The factored estimate: your fractions</Title>
          <OriginMark of={["page", "reference", "assumption"]}
            note="the fractions are your inputs, set at illustration values; a pointer to the source is beside each row" />
          <PanTable>
            <Table.Thead><Table.Tr>
              <Table.Th>direct item</Table.Th><Table.Th>fraction f of C_Be</Table.Th>
              <Table.Th>where to read it (no number printed)</Table.Th><Table.Th>cost, M EUR</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {DIRECT_ROWS.map((r) => {
                const where = outsideRange(fd[r.key], r.range);
                return (
                  <Table.Tr key={r.key} data-direct={r.key}>
                    <Table.Td>{r.label}</Table.Td>
                    <Table.Td><Num label="" value={fd[r.key]} step={0.01} w={100}
                      onChange={(v) => setFd({ ...fd, [r.key as DirectKey]: v })} /></Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap" align="flex-start">
                        <Badge size="sm" color={RANGE_COLOR[where]} variant="light" style={{ flexShrink: 0 }}>
                          {where === "none" ? "no number" : where}
                        </Badge>
                        <Text size="xs">
                          {r.range ? <b>{f(r.range.lo, 2)} to {f(r.range.hi, 2)}</b> : null}
                          {r.range ? " " : ""}{r.source}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td data-direct-cost={r.key}>{f(fac.directItems[r.key], 3)}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </PanTable>
          <Text size="sm" mt={6} data-direct-total="">
            Direct costs D = C_Be (1 + sum f) = <b>{f(fac.direct, 2)} M EUR</b>.
          </Text>
          <PanTable>
            <Table.Thead><Table.Tr>
              <Table.Th>indirect item</Table.Th><Table.Th>fraction g of D</Table.Th>
              <Table.Th>where to read it</Table.Th><Table.Th>cost, M EUR</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {INDIRECT_ROWS.map((r) => (
                <Table.Tr key={r.key} data-indirect={r.key}>
                  <Table.Td>{r.label}</Table.Td>
                  <Table.Td><Num label="" value={gi[r.key]} step={0.01} w={100}
                    onChange={(v) => setGi({ ...gi, [r.key as IndirectKey]: v })} /></Table.Td>
                  <Table.Td><Text size="xs">{r.source}</Text></Table.Td>
                  <Table.Td>{f(fac.indirectItems[r.key], 3)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <Text size="sm" mt={6} data-factored="">
            Indirect costs I = <b>{f(fac.indirect, 2)} M EUR</b>; fixed capital F_f = D + I ={" "}
            <b>{f(fac.fci, 2)} M EUR</b>, which is {f(fac.impliedLang, 2)} times the purchased
            equipment: the Lang factor this set of fractions implies.  Land is in the sum
            above and is not depreciable; take it out before you depreciate.
          </Text>
        </Box>

        {/* ---------------------------------------------------------------- 4 */}
        {step(4)}
        <Box data-section="three">
          <Title order={5}>Three numbers for one equipment list</Title>
          <OriginMark of={["page", "assumption"]}
            note="the bare-module route re-written from the engine lines cited; the list and F_BM are illustrations" />
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Contingency and fee a" unit="engine: 1.18" value={fee} step={0.01} onChange={setFee} />
            <Num label="Site factor b" unit="engine default: 0.50" value={site} step={0.05} onChange={setSite} />
          </Group>
          <Text size="sm" mt={6} data-bm="">
            C_BM = {f(bm.sumCbm, 2)} M EUR; C_TM = a C_BM = {f(bm.ctm, 2)}; fixed capital
            F_e = a C_BM + b C_BM,0 = <b>{f(bm.fci, 2)} M EUR</b> ({f(bm.impliedLang, 2)} times the
            purchased equipment).
          </Text>
          <PanTable>
            <Table.Thead><Table.Tr>
              <Table.Th>method</Table.Th><Table.Th>fixed capital, M EUR</Table.Th>
              <Table.Th>over the purchased equipment</Table.Th><Table.Th>over the smallest</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {([
                ["Lang (one multiplier)", three.lang, "lang"],
                ["Factored (your fractions)", three.factored, "factored"],
                ["Bare-module (Choupo)", three.bareModule, "bareModule"],
              ] as const).map(([name, v, id]) => (
                <Table.Tr key={id} data-route={id}>
                  <Table.Td>{name}</Table.Td><Table.Td><b>{f(v, 2)}</b></Table.Td>
                  <Table.Td>{f(v / cbe, 2)}</Table.Td><Table.Td>{f(v / three.min, 2)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <Text size="sm" mt={6} data-spread="">
            Spread (largest over smallest): <b>{f(three.spread, 2)}</b>, from {f(three.min, 2)} to {f(three.max, 2)} M EUR.
            These are three different methods with different inputs; none of them is the
            right one, and the gap is the size of the uncertainty at this stage.
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            Engine: <code>FCI = contingencyFee x sum C_BM + siteFactor x sum C_BM0</code> (<code>EconomicsPass.cpp:2963</code>),
            C_TM = 1.18 C_BM per item (<code>Turton.cpp:722</code>, <code>CostingModel.H:69</code>), siteFactor default
            0.50 (<code>EconomicsPass.cpp:2821</code>).
          </Text>
        </Box>

        {/* ---------------------------------------------------------------- 5 */}
        {step(5)}
        <Box data-section="workingCapital">
          <Title order={5}>Working capital by three methods</Title>
          <OriginMark of={["page", "reference", "assumption"]}
            note="the days and fractions are illustrations; the 1/365 convention is the engine's" />
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Raw-material bill M" unit="M EUR / yr" value={wc.rawBill} onChange={(v) => setWcK("rawBill", v)} />
            <Num label="Cash cost of manufacture K" unit="M EUR / yr" value={wc.com} onChange={(v) => setWcK("com", v)} w={170} />
            <Num label="Sales S" unit="M EUR / yr" value={wc.sales} onChange={(v) => setWcK("sales", v)} />
            <Num label="Fixed capital F" unit="M EUR" value={wc.fci} onChange={(v) => setWcK("fci", v)} />
          </Group>
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Raw-material stock" unit="days of M" value={wc.daysRaw} onChange={(v) => setWcK("daysRaw", v)} />
            <Num label="Product stock, at cost" unit="days of K" value={wc.daysProduct} onChange={(v) => setWcK("daysProduct", v)} />
            <Num label="Receivables, at sales price" unit="days of S" value={wc.daysReceivables} onChange={(v) => setWcK("daysReceivables", v)} w={170} />
            <Num label="Payables" unit="days of M" value={wc.daysPayables} onChange={(v) => setWcK("daysPayables", v)} />
            <Num label="Minimum cash" unit="days of K" value={wc.daysCash} onChange={(v) => setWcK("daysCash", v)} />
          </Group>
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Fraction of sales alpha" value={wc.fractionOfSales} step={0.01} onChange={(v) => setWcK("fractionOfSales", v)} />
            <Num label="Fraction of fixed capital beta" value={wc.fractionOfFci} step={0.01} onChange={(v) => setWcK("fractionOfFci", v)} w={170} />
            <Num label="A book's share x of total capital" unit="gives beta = x/(1-x)" value={tciShare} step={0.01}
              onChange={setTciShare} w={190} />
          </Group>
          <Text size="xs" c="dimmed" mt={4} data-wc-tci="">
            A share of {pct(tciShare)} of the TOTAL capital is {pct(fciFractionFromTciShare(tciShare), 1)} of the fixed
            capital.  The page prints no typical share and no typical days:
            declare them with your source.
          </Text>
          <PanTable>
            <Table.Thead><Table.Tr>
              <Table.Th>itemised line</Table.Th><Table.Th>value, M EUR</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              <Table.Tr><Table.Td>raw-material stock = M d / 365</Table.Td><Table.Td>{f(wr.rawStock, 3)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>product stock = K d / 365 (at cost)</Table.Td><Table.Td>{f(wr.productStock, 3)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>receivables = S d / 365 (at the sales price)</Table.Td><Table.Td>{f(wr.receivables, 3)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>minimum cash = K d / 365</Table.Td><Table.Td>{f(wr.cash, 3)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>less payables = M d / 365</Table.Td><Table.Td>- {f(wr.payables, 3)}</Table.Td></Table.Tr>
            </Table.Tbody>
          </PanTable>
          <PanTable>
            <Table.Thead><Table.Tr>
              <Table.Th>method</Table.Th><Table.Th>working capital, M EUR</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              <Table.Tr data-wc="itemised"><Table.Td>(i) itemised</Table.Td><Table.Td><b>{f(wr.itemised, 2)}</b></Table.Td></Table.Tr>
              <Table.Tr data-wc="sales"><Table.Td>(ii) {pct(wc.fractionOfSales)} of sales</Table.Td><Table.Td><b>{f(wr.ofSales, 2)}</b></Table.Td></Table.Tr>
              <Table.Tr data-wc="fci"><Table.Td>(iii) {pct(wc.fractionOfFci)} of fixed capital</Table.Td><Table.Td><b>{f(wr.ofFci, 2)}</b></Table.Td></Table.Tr>
            </Table.Tbody>
          </PanTable>
          <Text size="sm" mt={6} data-wc-spread="">
            Spread (largest over smallest): <b>{f(wr.spread, 2)}</b>, from {f(wr.min, 2)} to {f(wr.max, 2)} M EUR.
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            Engine: the itemised model <code>buildWorkingCapital</code> (<code>EconomicsPass.cpp:240</code>), a day is 1/365
            of the annual figure (<code>:216</code>), receivables are days/365 of the revenue (<code>:365</code>), payables days/365 of the
            raw-material bill (<code>:371</code>), the fraction fallback is 0.15 of the FCI (<code>:2505</code>).  The Economics errors page,
            class 5, shows the same comparison on another plant.
          </Text>
        </Box>

        {/* ---------------------------------------------------------------- 6 */}
        {step(6)}
        <Box data-section="financing">
          <Title order={5}>A loan, year by year</Title>
          <OriginMark of={["page", "assumption"]}
            note="the schedule is the engine's convention written out; the terms are illustrations" />
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Capital to finance" unit="M EUR" value={loan.fci} onChange={(v) => setLn("fci", v)} />
            <Num label="Debt share" unit="the rest is equity" value={loan.debtFraction} step={0.05}
              onChange={(v) => setLn("debtFraction", Math.min(1, v))} />
            <Num label="Interest rate r" value={loan.rate} step={0.005} onChange={(v) => setLn("rate", v)} />
            <Num label="Construction years" value={loan.constructionYears} step={1}
              onChange={(v) => setLn("constructionYears", Math.max(1, Math.round(v)))} />
            <Num label="Grace years" unit="interest only" value={loan.graceYears} step={1}
              onChange={(v) => setLn("graceYears", Math.max(0, Math.round(v)))} />
            <Num label="Repayment years" value={loan.termYears} step={1}
              onChange={(v) => setLn("termYears", Math.max(1, Math.round(v)))} />
            <NativeSelect size="xs" label="Repayment" w={130} value={repay}
              data={[{ value: "annuity", label: "annuity" }, { value: "linear", label: "linear" }]}
              onChange={(e) => setRepay(e.currentTarget.value as Repayment)} />
          </Group>
          <PanTable>
            <Table.Thead><Table.Tr>
              <Table.Th>year</Table.Th><Table.Th>phase</Table.Th><Table.Th>debt at start</Table.Th>
              <Table.Th>draw</Table.Th><Table.Th>interest capitalised</Table.Th>
              <Table.Th>interest paid</Table.Th><Table.Th>repayment</Table.Th><Table.Th>debt at end</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {ls.rows.map((r) => (
                <Table.Tr key={`${r.phase}${r.year}`} data-loan-row={r.year}>
                  <Table.Td>{r.year}</Table.Td><Table.Td>{r.phase}</Table.Td>
                  <Table.Td>{f(r.open, 3)}</Table.Td><Table.Td>{f(r.draw, 3)}</Table.Td>
                  <Table.Td>{f(r.interestCapitalised, 3)}</Table.Td><Table.Td>{f(r.interestPaid, 3)}</Table.Td>
                  <Table.Td>{f(r.repayment, 3)}</Table.Td><Table.Td>{f(r.close, 3)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <Text size="sm" mt={6} data-loan="">
            Equity {f(ls.equity, 2)} M EUR; loan drawn {f(ls.loanDrawn, 2)}; interest during construction{" "}
            <b>{f(ls.idc, 3)} M EUR</b>; loan at start-up <b>{f(ls.atStartup, 3)}</b>; interest paid in operation{" "}
            {f(ls.interestPaidTotal, 3)} M EUR in total.
            {ls.idcNote ? " With a one-year construction the whole outlay is made at its end and no interest accrues, as in the engine." : ""}
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            Engine: <code>reports/economics/financing.csv</code> when the case declares <code>financing {"{ }"}</code>
            (<code>EconomicsPass.cpp:555</code>); draws at the end of each construction year (<code>:1896</code>), the interest on the balance
            drawn capitalised (<code>:1908</code>), interest paid on the opening balance in operation (<code>:1929</code>).  The page spreads the draws
            evenly; the engine follows the case&apos;s capital schedule.
          </Text>
        </Box>

        {step(7)}

        <LessonQuiz title="Check your understanding" questions={PLANT_COST_QUIZ} lesson={PLANT_COST_STEPS} />

        <LessonLimits limits={PLANT_COST_LIMITS} />
      </Stack>
    </Box>
  );
}
