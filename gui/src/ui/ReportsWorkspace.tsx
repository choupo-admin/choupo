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
  ReportsWorkspace -- the consolidated POST-RUN numbers (not plots): the
  equipment the sizing pass produced, every specification sheet the run wrote,
  the plant UTILITIES bill (which utility, kg/h, MW, EUR/h), the global MASS
  balance (in/out/closure by component), the global ENERGY balance, the
  printable datasheets and the DCF appraisal.  Reads the run result -- the
  engine emits utilityAllocation on every converged pass (direct + outer), the
  balances are the engine's own ledgers, and the sheets are the files under
  `design/` exactly as the engine wrote them.

  THE RAIL (2026-09-14).  Reports was the one workspace with no rail: up to
  eight stacked subjects and no map, on a screen where every other workspace
  gives the reader a list to jump from.  The rail lists the sections and
  scrolls to them.  WHICH sections exist is decided ONCE, in
  `case/reportSections.ts`, from facts this component computes once; the rail
  and the page both iterate that list, so neither can list a section the
  other does not draw.  A section a case did not earn is absent from both --
  the 2026-09-04 rule that Reports never opens on an apology, kept by
  construction rather than by five inline guards.

  THE EQUIPMENT SHEETS.  The specification sheet was built (2026-09-04) to be
  the surface a project is AUDITED from, per unit, and it reached the app only
  as raw file text in the Case tree.  Here it is drawn: the engine's own
  `design/<SECTOR>/<unit>/<item>` tree on the left (ONE tree renderer,
  `FileTree`, shared with the Case tab), and the selected sheet on the right
  through the ONE parser (`case/designSheet.ts`) -- identity, basis, sizing
  with its declared units, the unit's ports, and what the sizer ASSUMED.  A
  file the parser cannot read is shown as text and SAID to be unreadable,
  never silently skipped.
\*---------------------------------------------------------------------------*/

import { Fragment, useMemo, useState } from "react";
import { useReducedMotion } from "@mantine/hooks";
import {
  Box, Button, Group, ScrollArea, SimpleGrid, Stack, Table, Text, UnstyledButton,
} from "@mantine/core";

import { useStore } from "../state/store.js";
import { massBalance } from "../case/balances.js";
import { heatExchangerDatasheetHtml } from "./HeatExchangerDatasheet.js";
import { columnDatasheetHtml } from "./ColumnDatasheet.js";
import {
  parseDesignSheet, unitDesignSheets, type DesignPort, type DesignSheet,
} from "../case/designSheet.js";
import {
  designSheetTree, reportSections, sectionDomId,
  type ReportFacts, type ReportSectionId,
} from "../case/reportSections.js";
import { FileTree, type LookOf, type OrderOf } from "./FileTree.js";
import { sortedChildren } from "./caseTree.js";
import { useMeasuredBoxWidth } from "./methods/methodsChrome.js";
import {
  REPORTS_NAV_PANEL, PanelCollapseButton, PanelReopenStrip, PanelResizeHandle,
  panelBoxProps, usePanel, usePanelShortcut,
} from "./panelContract.js";
import type { UnitSpec } from "../case/types.js";
import type { EquipmentItem, RunResult } from "../adapters/SolverAdapter.js";

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
  //  The hooks live in the body, below the early return: a rail that exists
  //  only once there is a result is a hook that must not be called before it.
  return <ReportsBody runResult={runResult} />;
}

function ReportsBody({ runResult }: { runResult: RunResult }) {
  // Equipment datasheets: every heatExchanger unit whose run produced a U
  // (geometry/design mode) gets a one-click datasheet, same as the unit panel.
  const flowUnits = useStore.getState().caseFiles.flowsheet?.["units"] as UnitSpec[] | undefined;
  const hxUnits = (flowUnits ?? []).filter(
    (u) => u?.type === "heatExchanger" && runResult.kpis?.[u.name]?.["U"] !== undefined);
  //  THE COLUMNS THE RUN ACTUALLY SIZED.  A column with no `sizing {}` block in
  //  its postDict has no specification sheet and therefore nothing to draw, so
  //  it gets no row -- the same rule the exchanger list follows, and the reason
  //  this workspace does not open on an apology.
  //  Parsed ONCE per unit: the row below wants the item count and the filter
  //  wants to know there is one, and asking twice reparses every sheet under
  //  `design/` a second time on every render.
  const columnUnits = (flowUnits ?? [])
    .filter((u) => u?.type === "distillationColumn")
    .map((u) => ({ u, n: unitDesignSheets(runResult.designFiles, u.name).sheets.length }))
    .filter((c) => c.n > 0);
  const tree = useMemo(() => designSheetTree(runResult.designFiles), [runResult.designFiles]);
  const econ = runResult.economics;

  //  THE FACTS, ONCE.  Everything below that decides whether a section exists
  //  reads `sections`; nothing gates inline.
  const facts: ReportFacts = {
    equipment: (runResult.equipment?.length ?? 0) > 0,
    sheets: tree.files.length > 0,
    columns: columnUnits.length > 0,
    exchangers: hxUnits.length > 0,
    economics: !!econ,
  };
  const sections = reportSections(facts);

  const railHost = useMeasuredBoxWidth<HTMLDivElement>();
  const rail = usePanel(REPORTS_NAV_PANEL, { availablePx: railHost.width });
  usePanelShortcut(rail);
  const reduceMotion = useReducedMotion();
  const railBox = panelBoxProps(rail, !!reduceMotion);

  const jumpTo = (id: ReportSectionId) =>
    document.getElementById(sectionDomId(id))
      ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });

  //  ONE BODY PER SECTION ID.  The list decides which are drawn and in what
  //  order; this map only knows how to draw each.  A body that reaches here
  //  for a fact that is false cannot happen: the list did not include it.
  const body: Record<ReportSectionId, () => React.ReactNode> = {
    equipment:  () => <EquipmentDesign items={runResult.equipment ?? []} />,
    sheets:     () => <EquipmentSheets designFiles={runResult.designFiles} tree={tree} />,
    utilities:  () => <UtilitiesBody rows={runResult.utilityAllocation ?? []} />,
    mass:       () => <MassBody runResult={runResult} />,
    energy:     () => <EnergyBody gb={runResult.globalEnergyBoundary} />,
    columns:    () => <ColumnsBody runResult={runResult} columns={columnUnits} />,
    exchangers: () => <ExchangersBody runResult={runResult} units={hxUnits} />,
    economics:  () => (econ ? <EconomicsBody econ={econ} /> : null),
  };

  return (
    <Box ref={railHost.ref} style={{ display: "flex", flex: 1, minHeight: 0, height: "100%" }}>
      {rail.collapsed && <PanelReopenStrip panel={rail} scent="REPORTS" />}
      <Box
        data-panel={railBox["data-panel"]}
        style={{
          ...railBox.style,
          borderRight: rail.collapsed
            ? "none"
            : "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
          background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
          display: "flex", flexDirection: "column",
        }}
      >
        <Group justify="space-between" align="center" wrap="nowrap" gap={4}
          px="xs" py={4} style={{ flex: "0 0 auto" }}>
          <Text size="xs" c="dimmed" tt="uppercase"
            style={{ letterSpacing: 0.5, fontWeight: 600 }}>
            Reports
          </Text>
          <PanelCollapseButton panel={rail} />
        </Group>
        <ScrollArea type="auto" style={{ flex: 1, minHeight: 0 }}>
          <Stack gap={0} pb="xs">
            {sections.map((s) => (
              <UnstyledButton
                key={s.id}
                onClick={() => jumpTo(s.id)}
                px="xs" py={6}
                style={{ display: "block", width: "100%" }}
              >
                <Text size="sm" fw={500} c="accent">{s.title}</Text>
                <Text size="xs" c="dimmed" lineClamp={2}>{s.subtitle}</Text>
              </UnstyledButton>
            ))}
          </Stack>
        </ScrollArea>
      </Box>
      <PanelResizeHandle panel={rail} />

      <Box style={{ flex: 1, minWidth: 0, minHeight: 0, height: "100%" }}>
        <ScrollArea h="100%" type="auto">
          <Stack gap="lg" p="md">
            {sections.map((s) => (
              <Box key={s.id} id={sectionDomId(s.id)}>
                <Section title={s.title} subtitle={s.subtitle}>
                  {body[s.id]()}
                </Section>
              </Box>
            ))}
          </Stack>
        </ScrollArea>
      </Box>
    </Box>
  );
}

/*  ---- Utilities ------------------------------------------------------- */
function UtilitiesBody({ rows }: { rows: NonNullable<RunResult["utilityAllocation"]> }) {
  // Aggregate the per-duty rows by utility name.
  const byUtil = new Map<string, { tier: string; kW: number; kgh: number; MW: number; eurh: number }>();
  for (const r of rows) {
    const g = byUtil.get(r.utility) ?? { tier: r.tier, kW: 0, kgh: 0, MW: 0, eurh: 0 };
    g.kW += Math.abs(r.duty_kW); g.kgh += (r.kg_s ?? 0) * 3600; g.MW += r.MW ?? 0; g.eurh += r.eur_h ?? 0;
    byUtil.set(r.utility, g);
  }
  const utils = [...byUtil.entries()].sort((a, b) => b[1].eurh - a[1].eurh);
  const totalEurh = utils.reduce((a, [, g]) => a + g.eurh, 0);

  if (rows.length === 0) return <Text size="sm" c="dimmed">No heat duties allocated.</Text>;
  return (
    <>
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
    </>
  );
}

/*  ---- Global mass balance --------------------------------------------- */
function MassBody({ runResult }: { runResult: RunResult }) {
  const mb = massBalance(runResult.streams, runResult.componentMolarMass);
  const kgh = (kgs: number) => (kgs * 3600);
  return (
    <>
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
        Imbalance |in−out|/in = {(mb.closureErr * 100).toFixed(3)}% — a converged steady state stays ≪0.1%.
      </Text>
      {/*  The table is the PROCESS scope when the case declares a utility
           circuit.  The TOTAL scope is stated beside it rather than
           replaced: the separation is presentation, never validation
           scope, and a reader must be able to see both. */}
      {mb.utilityCircuits.length > 0 && (
        <Text size="xs" c="dimmed" mt={2}>
          Process scope: declared utility circuit{mb.utilityCircuits.length > 1 ? "s" : ""}{" "}
          {mb.utilityCircuits.join(", ")} set aside ({kgh(mb.utilitySum).toFixed(1)} kg/h).
          Over every boundary stream the balance reads {kgh(mb.totalInSum).toFixed(1)} in /
          {" "}{kgh(mb.totalOutSum).toFixed(1)} out, closing to{" "}
          {(mb.totalClosureErr * 100).toFixed(3)}%.
        </Text>
      )}
    </>
  );
}

/*  ---- Global energy balance ------------------------------------------- */
function EnergyBody({ gb }: { gb: RunResult["globalEnergyBoundary"] }) {
  // The first law is the ENGINE's: its energyBalance report decides which
  // duties are boundary heat, which are internal and which are already a
  // feed, and stamps the ledger on the result.  The GUI draws it.  (It used
  // to sum utility-allocated duties itself and missed every cooling duty no
  // utility served -- 372.5 kW against the engine's 34.4 kW on the flagship.)
  if (!gb) {
    return (
      <Text size="sm" c="dimmed" ff="monospace">
        The energyBalance report did not run for this case (or refused) — see
        the run log. The GUI computes no balance of its own.
      </Text>
    );
  }
  if (gb.n_gap > 0) {
    // No-silent-crutch: a boundary stream carries a component with no
    // enthalpy datum, so the elements-datum balance cannot close.  The
    // engine skipped it and said so; we present no number in its place.
    return (
      <Text size="sm" c="red.5" ff="monospace">
        REFUSED — the energy balance cannot close: {gb.n_gap} boundary
        stream(s) have no enthalpy datum (named in the run log). Add a
        standardThermochemistry{" "}block to the component .dat, or configure
        it as an electrolyte. The mass balance is unaffected.
      </Text>
    );
  }
  if (gb.noBoundary) {
    return (
      <Text size="sm" c="dimmed" ff="monospace">
        Closed loop — nothing crosses the plant boundary, so the first law
        over it is vacuous; the per-unit balances carry the verification.
      </Text>
    );
  }
  return (
    <>
      <Table withTableBorder fz="sm" ff="monospace" w="auto">
        <Table.Tbody>
          <Table.Tr><Table.Td>Stream enthalpy IN (Σ H feeds)</Table.Td><Table.Td ta="right">{gb.H_feeds_kW.toFixed(1)} kW</Table.Td></Table.Tr>
          {Math.abs(gb.Q_boundary_kW) > 0.05 && <Table.Tr><Table.Td>Boundary heat + work into process</Table.Td><Table.Td ta="right">{gb.Q_boundary_kW.toFixed(1)} kW</Table.Td></Table.Tr>}
          {/*  THE SAME NUMBER, TOLD APART (2026-09-12).  The row above is
              their SUM, which is what the ledger used to carry -- and on a
              plant like rankine02 that sum is 2e-10 kW while the two terms
              are +8.84 and -8.84 kW, so the total alone says "nothing
              crosses the boundary" about a plant that takes heat in and
              puts work out.  Drawn ONLY when the engine published the
              split: an older result carries neither field and this panel
              adds no arithmetic of its own.  Indented under the sum so a
              reader sees a decomposition, never two more independent
              terms to add.  */}
          {gb.Q_heat_kW !== undefined && gb.W_shaft_kW !== undefined
           && Math.abs(gb.W_shaft_kW) > 0.05 && (
            <>
              <Table.Tr><Table.Td pl="lg" c="dimmed">— of which heat, Q</Table.Td><Table.Td ta="right" c="dimmed">{gb.Q_heat_kW.toFixed(1)} kW</Table.Td></Table.Tr>
              <Table.Tr><Table.Td pl="lg" c="dimmed">— of which shaft work (+ = into the fluid, so −W)</Table.Td><Table.Td ta="right" c="dimmed">{gb.W_shaft_kW.toFixed(1)} kW</Table.Td></Table.Tr>
            </>
          )}
          <Table.Tr><Table.Td>Stream enthalpy OUT (Σ H products)</Table.Td><Table.Td ta="right">{gb.H_products_kW.toFixed(1)} kW</Table.Td></Table.Tr>
          <Table.Tr><Table.Td><strong>First-law residual</strong></Table.Td><Table.Td ta="right"><strong>{gb.residual_kW.toFixed(3)} kW</strong></Table.Td></Table.Tr>
        </Table.Tbody>
      </Table>
      <Text size="xs" c={gb.residual_pct === null || gb.residual_pct_available === false
                           ? "yellow.5"
                           : Math.abs(gb.residual_pct) <= 0.1 ? "teal.4" : "yellow.5"} mt={4}>
        {/*  THE ENGINE PUBLISHES THE BASIS AND THIS DRAWS IT.  This line
            used to spell the formula out itself, and on 2026-09-08 the
            basis moved (from the stream enthalpy scale, which cooling
            water dominates, to the energy the plant exchanges) and the
            prose here would have gone quietly false.  A restatement of
            a rule goes false the day the rule moves.  */}
        {gb.residual_pct === null || gb.residual_pct_available === false ? (
          <>
            {/*  NO SCALE, SO NO RATIO.  Drawing one would mean picking a
                denominator here, which is the second home the engine
                owns this number to prevent.  */}
            Imbalance |H in + Q + W − H out| = {Math.abs(gb.residual_kW).toFixed(3)} kW.
            This plant declares no duty and carries no boundary heat, so the
            engine reports NO exchanged-energy scale and the percentage is
            unavailable — the kW above is the whole of what is known.
          </>
        ) : (
          <>
            Imbalance |H in + Q + W − H out| = {Math.abs(gb.residual_pct).toFixed(4)}% of{" "}
            {gb.residual_basis ?? "a basis this run did not publish"}
            {gb.residual_denom_kW !== undefined && gb.residual_denom_kW !== null
              ? ` (${gb.residual_denom_kW.toFixed(1)} kW)`
              : ""}
          </>
        )} — the engine's
        globalEnergyBoundary ledger ({gb.n_feeds} feed(s), {gb.n_products} product(s)).
      </Text>
      <Text size="xs" c="dimmed" mt={2}>
        All enthalpies are on the {gb.datum ?? "elements"} datum (ΔHf° of formation at 25 °C inside each
        stream's h), so the heat of reaction lives INSIDE the stream enthalpies and no reaction term appears
        in this equation; the absolute values are large and negative for that reason — only differences are
        physical. Q + W is what actually crosses the plant boundary (a duty served by a boundary steam stream
        is already inside Σ H feeds; an internal exchange is not boundary heat).
      </Text>
    </>
  );
}

/*  ---- Printable datasheets -------------------------------------------- */
const openInTab = (html: string) => {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

function ColumnsBody({ runResult, columns }: {
  runResult: RunResult; columns: { u: UnitSpec; n: number }[];
}) {
  const openColumnSheet = (u: UnitSpec) =>
    openInTab(columnDatasheetHtml(u, runResult.kpis?.[u.name], runResult.designFiles));
  return (
    <Stack gap={6}>
      {columns.map(({ u, n }) => {
        const k = runResult.kpis?.[u.name] ?? {};
        return (
          <Group key={u.name} justify="space-between" wrap="nowrap"
            style={{ borderBottom: "1px solid #2a2a2a", paddingBottom: 4 }}>
            <Text size="sm" ff="monospace">
              {u.name} — {Math.round(k["nTrays"] ?? 0)} trays, ⌀{k["diameter"]?.toFixed(3)} m
              {k["floodApproach_max"] !== undefined
                ? `, worst tray ${(k["floodApproach_max"] * 100).toFixed(1)} % of flood` : ""}
              {` · ${n} item${n === 1 ? "" : "s"}`}
            </Text>
            <Button size="compact-xs" variant="light" onClick={() => openColumnSheet(u)}>
              Open datasheet
            </Button>
          </Group>
        );
      })}
    </Stack>
  );
}

function ExchangersBody({ runResult, units }: { runResult: RunResult; units: UnitSpec[] }) {
  const openHxSheet = (u: UnitSpec) => {
    //  The engine's own specification sheet rides `designFiles`; the datasheet
    //  READS it rather than rebuilding the design numbers from the KPIs.
    const html = heatExchangerDatasheetHtml(u, runResult.kpis?.[u.name],
      runResult.streams, runResult.designFiles);
    if (!html) return;
    openInTab(html);
  };
  return (
    <Stack gap={6}>
      {units.map((u) => {
        const k = runResult.kpis?.[u.name] ?? {};
        return (
          <Group key={u.name} justify="space-between" wrap="nowrap"
            style={{ borderBottom: "1px solid #2a2a2a", paddingBottom: 4 }}>
            <Text size="sm" ff="monospace">
              {u.name} — U {k["U"]?.toFixed(0)} W/(m²·K), area {k["area"]?.toFixed(1)} m²
              {k["dP_shell_kPa"] !== undefined
                ? `, ΔP ${k["dP_tube_kPa"]?.toFixed(1)}/${k["dP_shell_kPa"]?.toFixed(1)} kPa` : ""}
            </Text>
            <Button size="compact-xs" variant="light" onClick={() => openHxSheet(u)}>
              Open datasheet
            </Button>
          </Group>
        );
      })}
    </Stack>
  );
}

/*  ---- Economic appraisal ---------------------------------------------- */
function EconomicsBody({ econ }: { econ: NonNullable<RunResult["economics"]> }) {
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
  const paybackYear = econ.cashFlow.find((r) => r.year > 0 && r.cumulativeDCF >= 0)?.year;
  return (
    <>
      <Text size="xs" c="dimmed" mb={6}>
        Discounted cash flow over {econ.projectLife} yr — {econ.currency}.
      </Text>
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
    </>
  );
}

/*  ---- Equipment sheets: the engine's design/ tree, one sheet drawn ----- */

//  A design tree has no KINDS to colour by -- every directory is a level of
//  the plant's geography or a unit, every leaf is an item -- so the look is
//  one weight of one colour, and the children are drawn in the engine's
//  sorted order with nothing held back for later.
const sheetLook: LookOf = () => ({ colour: "accent", weight: 600 });
const sheetOrder: OrderOf = (node) => ({ before: sortedChildren(node), after: [] });

function EquipmentSheets({ designFiles, tree }: {
  designFiles: RunResult["designFiles"];
  tree: ReturnType<typeof designSheetTree>;
}) {
  const [sel, setSel] = useState<string | null>(null);
  //  A selection that the current run no longer has (a re-run that lost a
  //  sheet) falls back to the first file rather than to nothing.
  const active = sel !== null && tree.keyOf.has(sel) ? sel : (tree.files[0] ?? null);
  const text = active !== null ? designFiles?.[tree.keyOf.get(active)!] : undefined;
  const sheet = useMemo(() => (text !== undefined ? parseDesignSheet(text) : null), [text]);

  return (
    <Group align="flex-start" wrap="wrap" gap="md">
      <Box style={{
        flex: "1 1 220px", minWidth: 0, maxWidth: 360,
        borderRight: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
      }}>
        <FileTree files={tree.files} active={active} onSelect={setSel}
          title="" lessonFirst={false} look={sheetLook} order={sheetOrder} />
      </Box>
      <Box style={{ flex: "3 1 360px", minWidth: 0 }}>
        {active === null ? null
         : sheet ? <SheetView sheet={sheet} path={active} />
         : (
          //  THREE STATES, NEVER TWO: the file is there and could not be read.
          //  Say so, and show the text -- the file is what the engine wrote.
          <Stack gap="xs">
            <Text size="sm" c="yellow.5">
              <code>design/{active}</code> could not be read as a specification
              sheet (no <code>recordType designSheet;</code>, or a grammar this
              reader does not parse). The file as written:
            </Text>
            <Box component="pre" fz="xs" ff="monospace" m={0}
              style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {text}
            </Box>
          </Stack>
        )}
      </Box>
    </Group>
  );
}

//  The sheet's numbers as the sheet carries them: a sizing value keeps the
//  UNIT THE SHEET DECLARED (the 2026-09-04 rule -- an object declares its own
//  dimensions), so `power` prints in kW and `pressureDesign` in bar because
//  that is what the file says.  A dimensionless value is `-` from the parser
//  and drawn as such.  Nothing here converts.
const num = (v: number): string => {
  if (v === 0) return "0";
  const a = Math.abs(v);
  return a >= 1e6 || a < 1e-3 ? v.toExponential(3) : v.toPrecision(5).replace(/\.?0+$/, "");
};

function SheetView({ sheet, path }: { sheet: DesignSheet; path: string }) {
  const ident: [string, string][] = [
    ["unit", sheet.unit], ["sector", sheet.sector], ["equipment", sheet.equipment],
    ["item", sheet.item], ["material", sheet.material],
  ];
  return (
    <Stack gap="sm">
      <Text size="xs" c="dimmed" ff="monospace">design/{path}</Text>
      <Group gap="lg" wrap="wrap">
        {ident.filter(([, v]) => v !== "").map(([k, v]) => (
          <Box key={k}>
            <Text size="xs" c="dimmed">{k}</Text>
            <Text size="sm" ff="monospace">{v}</Text>
          </Box>
        ))}
      </Group>
      <Box>
        <Text size="xs" c="dimmed" fw={600}>design basis</Text>
        {/*  The engine writes `(not stated)` literally and this passes it
             through: a forgotten basis stays visible.  */}
        <Text size="sm">{sheet.basis || "(not stated)"}</Text>
      </Box>
      {sheet.sizing.length > 0 && (
        <Table withTableBorder fz="sm" ff="monospace" w="auto">
          <Table.Thead><Table.Tr>
            <Table.Th>sizing</Table.Th><Table.Th ta="right">value</Table.Th><Table.Th>unit</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {sheet.sizing.map((s) => (
              <Table.Tr key={s.key}>
                <Table.Td>{s.key}</Table.Td>
                <Table.Td ta="right">{num(s.value)}</Table.Td>
                <Table.Td c="dimmed">{s.unit === "" ? "(raw SI)" : s.unit}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <PortTable label="inlets" ports={sheet.inlets} />
      <PortTable label="outlets" ports={sheet.outlets} />
      {sheet.item !== "" && (sheet.inlets.length > 0 || sheet.outlets.length > 0) && (
        <Text size="xs" c="dimmed">
          The ports are the UNIT's, not this item's: the flowsheet wires the
          unit, and every item of it carries the same ports.
        </Text>
      )}
      {sheet.assumed.length > 0 && (
        <Box>
          <Text size="xs" c="yellow.5" fw={600}>
            assumed — inputs the sizer was not given and supplied itself
          </Text>
          {sheet.assumed.map((a) => (
            <Text size="xs" ff="monospace" key={a}>{a}</Text>
          ))}
        </Box>
      )}
    </Stack>
  );
}

//  Port state as the sheet carries it, in the units the parser documents
//  (T in K, P in Pa, F in kmol/s, mdot in kg/s).  A key the sheet does not
//  carry is UNDEFINED and drawn as a dash -- never zero.
function PortTable({ label, ports }: { label: string; ports: DesignPort[] }) {
  if (ports.length === 0) return null;
  const cell = (v: number | undefined, f: (x: number) => string) =>
    v === undefined ? "—" : f(v);
  return (
    <Table withTableBorder fz="sm" ff="monospace" w="auto">
      <Table.Thead><Table.Tr>
        <Table.Th>{label}</Table.Th><Table.Th>stream</Table.Th><Table.Th>bc</Table.Th>
        <Table.Th ta="right">T (K)</Table.Th><Table.Th ta="right">P (bar)</Table.Th>
        <Table.Th ta="right">F (kmol/h)</Table.Th><Table.Th ta="right">ṁ (kg/h)</Table.Th>
        <Table.Th ta="right">vf</Table.Th>
      </Table.Tr></Table.Thead>
      <Table.Tbody>
        {ports.map((p) => (
          <Table.Tr key={p.key}>
            <Table.Td c="dimmed">{p.key}</Table.Td>
            <Table.Td>{p.global || "—"}</Table.Td>
            <Table.Td c="dimmed">{p.bc || "—"}</Table.Td>
            <Table.Td ta="right">{cell(p.T, (x) => x.toFixed(2))}</Table.Td>
            <Table.Td ta="right">{cell(p.P, (x) => (x / 1e5).toFixed(3))}</Table.Td>
            <Table.Td ta="right">{cell(p.F, (x) => (x * 3600).toFixed(3))}</Table.Td>
            <Table.Td ta="right">{cell(p.mdot, (x) => (x * 3600).toFixed(1))}</Table.Td>
            <Table.Td ta="right">{cell(p.vapourFraction, (x) => x.toFixed(3))}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/*  THE PLANT'S EQUIPMENT, IN THE SHAPE THE PLANT HAS.
 *
 *  The sizing and costing passes have always produced this list -- what each
 *  unit IS, how big, in what material, on what design BASIS, and what it costs
 *  -- and it reached a console table and two CSV files and never the app.  A
 *  reader opening the Reports workspace saw balances, utilities, exchanger
 *  datasheets and a DCF appraisal, and no equipment list at all.
 *
 *  It is drawn as a TREE because a plant is built as one: sector, then the
 *  unit operations inside it, then each unit's design and its price.  The
 *  sector comes from the engine's own stamp (`item.sector`, made at the
 *  flatten seam) -- never by splitting the dotted unit name, which is right
 *  for today's corpus and silently wrong for the first unit whose name carries
 *  a dot for another reason.
 *
 *  A FLAT CASE HAS NO SECTOR LEVEL.  No entry carries one, so the rows are
 *  listed directly with no invented heading -- the same rule the design table,
 *  the CSV column and the costing console follow.  A unit with no sector
 *  INSIDE a plant that has them keeps its own honest heading rather than being
 *  absorbed into a neighbour.
 */
function EquipmentDesign({ items }: { items: EquipmentItem[] }) {
  const anySector = items.some((i) => !!i.sector);
  //  Group in the engine's own order.  A Map preserves insertion order, which
  //  is the flowsheet's declared order -- a plant reads in the order it was
  //  built, not alphabetically.
  const groups = new Map<string, EquipmentItem[]>();
  for (const it of items) {
    const key = anySector ? (it.sector ?? "(no sector)") : "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }

  const cur = items.find((i) => i.cost)?.cost?.currency ?? "EUR";
  const totalCTM = items.reduce((s, i) => s + (i.cost?.totalModule ?? 0), 0);

  //  The size a reader wants FIRST, and the key it came under -- the same
  //  choice the console table makes, so the two cannot describe a unit
  //  differently.
  const headline = (v: { [k: string]: number }) =>
    v["V_R"] !== undefined ? { k: "V_R (m³)", v: v["V_R"] }
    : v["A"] !== undefined ? { k: "A (m²)", v: v["A"] }
    : v["V_magma"] !== undefined ? { k: "V_magma (m³)", v: v["V_magma"] }
    : v["W_evap"] !== undefined ? { k: "W_evap (kg/s)", v: v["W_evap"] }
    : undefined;

  const eur = (x: number) =>
    x.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <>
      <Text size="xs" c="dimmed" mb={6}>
        {anySector
          ? `${items.length} item(s) across ${groups.size} sector(s) — size, material, design basis and capital cost`
          : `${items.length} item(s) — size, material, design basis and capital cost`}
      </Text>
      <Table striped withTableBorder fz="sm" ff="monospace">
        <Table.Thead><Table.Tr>
          <Table.Th>unit</Table.Th>
          <Table.Th>equipment</Table.Th>
          <Table.Th>material</Table.Th>
          <Table.Th ta="right">size</Table.Th>
          <Table.Th ta="right">C_TM ({cur})</Table.Th>
          <Table.Th ta="right">share</Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {[...groups.entries()].map(([sector, rows]) => {
            const sub = rows.reduce((s, i) => s + (i.cost?.totalModule ?? 0), 0);
            return (
              //  A KEYED fragment, not `<>`: these siblings are generated in a
              //  map and React needs a stable identity for each group or it
              //  re-keys rows across sectors on any re-render.
              <Fragment key={sector || "flat"}>
                {sector && (
                  <Table.Tr key={`h-${sector}`}>
                    <Table.Td colSpan={4}>
                      <Text fw={700} c="accent.3" tt="uppercase" size="xs"
                        style={{ letterSpacing: 0.5 }}>{sector}</Text>
                    </Table.Td>
                    <Table.Td ta="right"><Text fw={700} size="xs">{eur(sub)}</Text></Table.Td>
                    <Table.Td ta="right">
                      {/*  A SHARE OF ZERO IS NOT ZERO PER CENT.  With no costed
                          item there is nothing to take a share of, and printing
                          0.0 % would be a number with no arithmetic behind it. */}
                      <Text fw={700} size="xs">
                        {totalCTM > 0 ? `${(100 * sub / totalCTM).toFixed(1)} %` : "—"}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {rows.map((it) => {
                  const h = headline(it.values);
                  //  The row shows the LEAF name under its sector heading; the
                  //  full qualified name stays in the title, because that is
                  //  the name a student types into a dict.
                  const leaf = sector && it.unit.startsWith(sector + ".")
                    ? it.unit.slice(sector.length + 1) : it.unit;
                  return (
                    //  KEYED ON THE ITEM, not the unit: a distillation
                    //  column emits five rows under one unit name and React
                    //  would see five duplicate keys.
                    <Table.Tr key={it.item}>
                      <Table.Td pl={sector ? "lg" : undefined} title={it.item}>{leaf}</Table.Td>
                      {/*  THE ITEM, where the unit realises several.  Two of a
                           column five items are `shellTubeHX` and two are
                           `vessel`, so the equipment KIND alone leaves the
                           condenser and the reboiler indistinguishable.  The
                           kind stays visible because it is what selects the
                           cost correlation. */}
                      <Table.Td>{it.tag ? `${it.tag} (${it.type})` : it.type}</Table.Td>
                      <Table.Td>{it.material}</Table.Td>
                      <Table.Td ta="right">
                        {h ? `${h.v.toPrecision(4)} ${h.k}` : "—"}
                      </Table.Td>
                      <Table.Td ta="right">
                        {it.cost ? eur(it.cost.totalModule) : "—"}
                      </Table.Td>
                      <Table.Td ta="right">
                        {it.cost && totalCTM > 0
                          ? `${(100 * it.cost.totalModule / totalCTM).toFixed(1)} %` : "—"}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Fragment>
            );
          })}
          <Table.Tr>
            <Table.Td colSpan={4}><Text fw={700}>TOTAL</Text></Table.Td>
            <Table.Td ta="right"><Text fw={700}>{eur(totalCTM)}</Text></Table.Td>
            <Table.Td ta="right"><Text fw={700}>{totalCTM > 0 ? "100.0 %" : "—"}</Text></Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
      {/*  THE DESIGN ARGUMENT, not only the number.  A volume is the same
          figure whether a residence time, a space velocity or the author
          produced it, and those are three different design arguments -- so the
          basis is stated for every item that carries one. */}
      {items.some((i) => i.basis) && (
        <Stack gap={2} mt="xs">
          <Text size="xs" c="dimmed" fw={600}>design basis</Text>
          {items.filter((i) => i.basis).map((i) => (
            <Text size="xs" c="dimmed" key={i.item} ff="monospace">
              {i.unit}{i.tag ? ` · ${i.tag}` : ""} — {i.basis}
            </Text>
          ))}
        </Stack>
      )}
    </>
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
