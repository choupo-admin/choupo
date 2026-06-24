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
  ReportsWorkspace -- the consolidated POST-RUN numbers (not plots): the plant
  UTILITIES bill (which utility, kg/h, MW, EUR/h), the global MASS balance
  (in/out/closure by component), and the global ENERGY balance.  Reads the run
  result -- the engine now emits utilityAllocation on every converged pass
  (direct + outer), and the balances are computed from the boundary streams.
\*---------------------------------------------------------------------------*/

import { Box, Group, ScrollArea, SimpleGrid, Stack, Table, Text } from "@mantine/core";

import { useStore } from "../state/store.js";
import { massBalance, energyBalance } from "../case/balances.js";

export function ReportsWorkspace() {
  const runResult = useStore((s) => s.runResult);

  if (!runResult || runResult.status !== "done" || runResult.streams.length === 0) {
    return (
      <Box p="xl">
        <Text c="dimmed"><strong>Run the flowsheet</strong> — the reports (utilities, global balances)
          are built from the converged result.</Text>
      </Box>
    );
  }

  const ua = runResult.utilityAllocation ?? [];
  // Aggregate the per-duty rows by utility name.
  const byUtil = new Map<string, { tier: string; kW: number; kgh: number; MW: number; eurh: number }>();
  for (const r of ua) {
    const g = byUtil.get(r.utility) ?? { tier: r.tier, kW: 0, kgh: 0, MW: 0, eurh: 0 };
    g.kW += Math.abs(r.duty_kW); g.kgh += (r.kg_s ?? 0) * 3600; g.MW += r.MW ?? 0; g.eurh += r.eur_h ?? 0;
    byUtil.set(r.utility, g);
  }
  const utils = [...byUtil.entries()].sort((a, b) => b[1].eurh - a[1].eurh);
  const totalEurh = utils.reduce((a, [, g]) => a + g.eurh, 0);

  const mb = massBalance(runResult.streams, runResult.componentMolarMass);
  const eb = energyBalance(runResult.streams);
  const kgh = (kgs: number) => (kgs * 3600);

  const econ = runResult.economics;
  // Compact money formatting in the report currency (k / M suffix); plain
  // integers for the per-year DCF cells to keep the table dense.
  const money = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
    return v.toFixed(0);
  };
  // The first operating year whose cumulative DCF turns non-negative -- the
  // discounted payback year (highlighted in the table).
  const paybackYear = econ
    ? econ.cashFlow.find((r) => r.year > 0 && r.cumulativeDCF >= 0)?.year
    : undefined;

  return (
    <ScrollArea h="100%" type="auto">
      <Stack gap="lg" p="md">
        {/* ---- Utilities ------------------------------------------------- */}
        <Section title="Utilities" subtitle="plant services sized by temperature level">
          {ua.length === 0
            ? <Text size="sm" c="dimmed">No heat duties allocated.</Text>
            : (<>
              <Table striped withTableBorder fz="sm" ff="monospace">
                <Table.Thead><Table.Tr>
                  <Table.Th>utility</Table.Th><Table.Th>tier</Table.Th>
                  <Table.Th ta="right">duty (kW)</Table.Th><Table.Th ta="right">kg/h</Table.Th>
                  <Table.Th ta="right">MW</Table.Th><Table.Th ta="right">€/h</Table.Th>
                </Table.Tr></Table.Thead>
                <Table.Tbody>
                  {utils.map(([name, g]) => (
                    <Table.Tr key={name}>
                      <Table.Td>{name}</Table.Td>
                      <Table.Td c={g.tier === "heating" ? "orange" : g.tier === "power" ? "violet" : "cyan"}>{g.tier}</Table.Td>
                      <Table.Td ta="right">{g.kW.toFixed(1)}</Table.Td>
                      <Table.Td ta="right">{g.kgh > 0 ? g.kgh.toFixed(0) : "—"}</Table.Td>
                      <Table.Td ta="right">{g.MW.toFixed(2)}</Table.Td>
                      <Table.Td ta="right">{g.eurh.toFixed(1)}</Table.Td>
                    </Table.Tr>
                  ))}
                  <Table.Tr>
                    <Table.Td colSpan={5} ta="right"><strong>Total</strong></Table.Td>
                    <Table.Td ta="right"><strong>{totalEurh.toFixed(1)} €/h</strong></Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>
              <Text size="xs" c="dimmed" mt={4}>
                ≈ {(totalEurh * 8000 / 1e3).toFixed(0)} k€/yr at 8000 h/yr.  Per-duty breakdown is on
                the canvas duty stubs.
              </Text>
            </>)}
        </Section>

        {/* ---- Global mass balance -------------------------------------- */}
        <Section title="Global mass balance" subtitle="plant boundary — feeds vs products (kg/h)">
          <Table striped withTableBorder fz="sm" ff="monospace">
            <Table.Thead><Table.Tr>
              <Table.Th>component</Table.Th><Table.Th ta="right">in (kg/h)</Table.Th>
              <Table.Th ta="right">out (kg/h)</Table.Th><Table.Th ta="right">Δ</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {mb.visibleComponents.map((c) => {
                const i = kgh(mb.inPerComp[c] ?? 0), o = kgh(mb.outPerComp[c] ?? 0);
                return (
                  <Table.Tr key={c}>
                    <Table.Td>{c}</Table.Td><Table.Td ta="right">{i.toFixed(1)}</Table.Td>
                    <Table.Td ta="right">{o.toFixed(1)}</Table.Td>
                    <Table.Td ta="right" c={Math.abs(i - o) > 0.01 * Math.max(i, 1) ? "yellow.5" : "dimmed"}>{(i - o).toFixed(1)}</Table.Td>
                  </Table.Tr>
                );
              })}
              <Table.Tr>
                <Table.Td><strong>Total</strong></Table.Td>
                <Table.Td ta="right"><strong>{kgh(mb.inSum).toFixed(1)}</strong></Table.Td>
                <Table.Td ta="right"><strong>{kgh(mb.outSum).toFixed(1)}</strong></Table.Td>
                <Table.Td ta="right"><Text span fw={700} c={mb.closureErr > 1e-3 ? "yellow.5" : "teal.4"}>{(mb.closureErr * 100).toFixed(2)}%</Text></Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed" mt={4}>
            Closure |in−out|/in = {(mb.closureErr * 100).toFixed(3)}% — a converged steady state closes to ≪0.1%.
          </Text>
        </Section>

        {/* ---- Global energy balance ------------------------------------ */}
        <Section title="Global energy balance" subtitle="flow enthalpy at the boundary (kW)">
          <Table withTableBorder fz="sm" ff="monospace" w="auto">
            <Table.Tbody>
              <Table.Tr><Table.Td>Enthalpy IN</Table.Td><Table.Td ta="right">{eb.inKw.toFixed(1)} kW</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Enthalpy OUT</Table.Td><Table.Td ta="right">{eb.outKw.toFixed(1)} kW</Table.Td></Table.Tr>
              <Table.Tr><Table.Td><strong>Δ (in − out)</strong></Table.Td><Table.Td ta="right"><strong>{eb.delta.toFixed(1)} kW</strong></Table.Td></Table.Tr>
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed" mt={4}>
            Δ is non-zero by design = net utility heat + heat of reaction (the duties above + the reactor).
            {eb.skipped > 0 ? `  ${eb.skipped} boundary stream(s) had no enthalpy and were skipped.` : ""}
          </Text>
        </Section>

        {/* ---- Economic appraisal (only when an economics postDict ran) -- */}
        {econ && (
          <Section title="Economic appraisal (DCF, Perry/Turton)"
            subtitle={`discounted cash flow over ${econ.projectLife} yr — ${econ.currency}`}>
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs" mb="sm">
              <Metric label="FCI" value={`${money(econ.FCI)} ${econ.currency}`} />
              <Metric label="TCI" value={`${money(econ.TCI)} ${econ.currency}`} />
              <Metric label="COM (no depr.)" value={`${money(econ.COM_d)} ${econ.currency}/yr`} />
              <Metric label="Revenue" value={`${money(econ.revenue)} ${econ.currency}/yr`} />
              <Metric label="NPV"
                value={`${money(econ.NPV)} ${econ.currency}`}
                color={econ.NPV >= 0 ? "teal.4" : "red.5"} />
              <Metric label="IRR"
                value={econ.IRR === null ? "—" : `${(econ.IRR * 100).toFixed(1)}%`}
                color={econ.IRR === null ? "dimmed"
                  : econ.IRR >= econ.discountRate ? "teal.4" : "yellow.5"} />
              <Metric label="Disc. payback"
                value={econ.discountedPayback === null ? "never"
                  : `${econ.discountedPayback.toFixed(1)} yr`} />
              <Metric label="Simple payback"
                value={econ.simplePayback === null ? "never"
                  : `${econ.simplePayback.toFixed(1)} yr`} />
            </SimpleGrid>
            <Text size="xs" c="dimmed" mb={6}>
              AACE Class-{econ.estimateClass} estimate — accuracy band {econ.accLo.toFixed(0)}% / +{econ.accHi.toFixed(0)}%.
              Discount rate {(econ.discountRate * 100).toFixed(1)}%, tax {(econ.taxRate * 100).toFixed(0)}%.
              {econ.irrAmbiguous ? "  IRR has multiple sign changes — interpret with care." : ""}
            </Text>
            <ScrollArea type="auto">
              <Table striped withTableBorder fz="xs" ff="monospace" miw={760}>
                <Table.Thead><Table.Tr>
                  <Table.Th>Year</Table.Th>
                  <Table.Th ta="right">Capital</Table.Th>
                  <Table.Th ta="right">Revenue</Table.Th>
                  <Table.Th ta="right">OPEX</Table.Th>
                  <Table.Th ta="right">Depr.</Table.Th>
                  <Table.Th ta="right">Taxable</Table.Th>
                  <Table.Th ta="right">Tax</Table.Th>
                  <Table.Th ta="right">After-tax</Table.Th>
                  <Table.Th ta="right">Cash flow</Table.Th>
                  <Table.Th ta="right">Disc.f</Table.Th>
                  <Table.Th ta="right">Disc.CF</Table.Th>
                  <Table.Th ta="right">Cum. DCF</Table.Th>
                </Table.Tr></Table.Thead>
                <Table.Tbody>
                  {econ.cashFlow.map((r) => (
                    <Table.Tr key={r.year}
                      bg={r.year === paybackYear ? "var(--mantine-color-teal-light)" : undefined}>
                      <Table.Td>{r.year}</Table.Td>
                      <Table.Td ta="right">{r.investment !== 0 ? money(r.investment) : "—"}</Table.Td>
                      <Table.Td ta="right">{money(r.revenue)}</Table.Td>
                      <Table.Td ta="right">{money(r.opex)}</Table.Td>
                      <Table.Td ta="right">{money(r.depreciation)}</Table.Td>
                      <Table.Td ta="right">{money(r.taxableIncome)}</Table.Td>
                      <Table.Td ta="right">{money(r.tax)}</Table.Td>
                      <Table.Td ta="right">{money(r.afterTaxProfit)}</Table.Td>
                      <Table.Td ta="right">{money(r.cashFlow)}</Table.Td>
                      <Table.Td ta="right">{r.discountFactor.toFixed(3)}</Table.Td>
                      <Table.Td ta="right">{money(r.discountedCF)}</Table.Td>
                      <Table.Td ta="right"
                        c={r.cumulativeDCF >= 0 ? "teal.4" : "red.5"}>{money(r.cumulativeDCF)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
            <Text size="xs" c="dimmed" mt={4}>
              Monetary cells in {econ.currency} (k / M suffix).  Year 0 is construction (the capital outflow);
              the discounted payback row{paybackYear !== undefined ? "" : " (none — never recovered)"} is highlighted.
              Full table in <code>reports/economics/cashFlow.csv</code> / <code>.ods</code>.
            </Text>
          </Section>
        )}
      </Stack>
    </ScrollArea>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={600} c={color}>{value}</Text>
    </Box>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Box>
      <Group gap={8} align="baseline" mb={6}>
        <Text fw={600} c="accent.3">{title}</Text>
        <Text size="xs" c="dimmed">{subtitle}</Text>
      </Group>
      {children}
    </Box>
  );
}
