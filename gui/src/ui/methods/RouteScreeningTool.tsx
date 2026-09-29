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
  RouteScreeningTool -- screening routes to a product, on paper
  (commission C24).

  THE DATA PATH.  ONE bundled witness,
  tutorials/steady/reactors/screen01_methanol_routes, run in the browser on
  the WASM build of `choupoSolve`.  Per route it carries a conversion reactor
  at X = 1 (the heat of reaction, KPI `dHrxn_kJ_per_mol`) and an equilibrium
  reactor over the route's own reaction (`conversion_route<X>`); route C also
  goes to a Gibbs reactor over every species (its outlet composition).  The
  two knobs write the temperature and pressure the witness declares.

  WHAT IS COMPUTED HERE, and why that is not physics.  The gross margin and
  the atom economy are arithmetic on molar masses, stoichiometric
  coefficients and the student's prices.  The coefficients and the molar
  masses are DATA with a home elsewhere -- the case's constant/reactions and
  the catalogue's component records -- so ROUTES below is a transcription,
  and the page's test holds it to both files.  The one division on an engine
  number is the heat per mole of methanol (dHrxn / nu_methanol).
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Anchor, Badge, Box, Group, Loader, Stack, Table, Text, Title,
} from "@mantine/core";

import { useMethodRun, type DictOverride } from "../../case/methodRun.js";
import type { RunResult } from "../../adapters/SolverAdapter.js";
import { KnobSlider, PanelNote, type PanelKnob } from "./knobPanel.js";
import { Tex } from "./lessonStep.js";
import {
  SCREEN_LIMITS, SCREEN_SECTIONS, type ScreenSection,
} from "./routeScreeningLesson.js";
import { setActiveMethodTool } from "./registry.js";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";

/** The bundled witness (no leading `tutorials/`). */
export const SCREEN_WITNESS = "steady/reactors/screen01_methanol_routes";

/** Molar masses, kg/kmol -- transcribed from data/standards/components/
 *  <name>.dat `MW`; the test reads each record and holds this table to it. */
export const MW: Readonly<Record<string, number>> = {
  methanol: 32.042, CO: 28.010, H2: 2.016, CO2: 44.010,
  CH4: 16.043, O2: 31.999, water: 18.015,
};

/** A route: its reaction as the case declares it (the test holds `nu` to
 *  constant/reactions) and the units that answer for it. */
export interface Route {
  key: "A" | "B" | "C";
  name: string;
  tex: string;
  nu: Readonly<Record<string, number>>;
  gibbs: string | null;
}

export const PRODUCT = "methanol";

export const ROUTES: readonly Route[] = [
  { key: "A", name: "synthesis gas",
    tex: String.raw`\mathrm{CO} + 2\,\mathrm{H_2} \rightarrow \mathrm{CH_3OH}`,
    nu: { CO: -1, H2: -2, methanol: 1 }, gibbs: null },
  { key: "B", name: "CO₂ hydrogenation",
    tex: String.raw`\mathrm{CO_2} + 3\,\mathrm{H_2} \rightarrow \mathrm{CH_3OH} + \mathrm{H_2O}`,
    nu: { CO2: -1, H2: -3, methanol: 1, water: 1 }, gibbs: null },
  { key: "C", name: "direct oxidation of methane",
    tex: String.raw`2\,\mathrm{CH_4} + \mathrm{O_2} \rightarrow 2\,\mathrm{CH_3OH}`,
    nu: { CH4: -2, O2: -1, methanol: 2 }, gibbs: "outGibbsC" },
];

/** The raw materials a price knob exists for, and their placeholders.
 *  PLACEHOLDERS: round numbers chosen to make the arithmetic visible, NOT
 *  market data -- the page says so where they are set. */
export const PRICE_PLACEHOLDERS: Readonly<Record<string, number>> = {
  methanol: 0.40, CO: 0.15, H2: 2.00, CO2: 0.05, CH4: 0.30, O2: 0.05,
};

/** Stoichiometric gross margin per kg of product (by-products valued at
 *  zero).  Arithmetic on data, not physics. */
export function grossMargin(route: Route, price: Readonly<Record<string, number>>):
  number {
  const nuP = route.nu[PRODUCT] ?? 0;
  const massP = nuP * (MW[PRODUCT] ?? NaN);
  let cost = 0;
  for (const [c, nu] of Object.entries(route.nu)) {
    if (nu >= 0) continue;
    cost += (-nu * (MW[c] ?? NaN) / massP) * (price[c] ?? NaN);
  }
  return (price[PRODUCT] ?? NaN) - cost;
}

/** Atom economy: product mass over reactant mass, as written. */
export function atomEconomy(route: Route): number {
  let fed = 0;
  for (const [c, nu] of Object.entries(route.nu))
    if (nu < 0) fed += -nu * (MW[c] ?? NaN);
  return ((route.nu[PRODUCT] ?? 0) * (MW[PRODUCT] ?? NaN)) / fed;
}

/** The dict scalars one run writes: the three equilibrium reactors' and the
 *  Gibbs reactor's T (occurrences 1-4 of the flowsheet), each feed's T and
 *  P, and the Gibbs reactor's P.  Units asserted. */
export function screenOverrides(T_K: number, P_bar: number): DictOverride[] {
  const feeds = ["0/feedSyngas", "0/feedCO2", "0/feedMethane"];
  return [
    ...[1, 2, 3, 4].map((k) => ({ file: "system/flowsheetDict", key: "T",
      value: T_K, unit: "K", occurrence: k })),
    { file: "system/flowsheetDict", key: "P", value: P_bar, unit: "bar" },
    ...feeds.flatMap((f) => [
      { file: f, key: "T", value: T_K, unit: "K" },
      { file: f, key: "P", value: P_bar, unit: "bar" },
    ]),
  ];
}

export const T_KNOB: PanelKnob = {
  id: "T", label: "reactor temperature T", min: 475, max: 575, step: 25,
  unit: "K",
  why: "Where a catalyst would have to work.  All three routes are "
    + "exothermic, so every limit falls as T rises.",
};

export const P_KNOB: PanelKnob = {
  id: "P", label: "pressure P", min: 10, max: 100, step: 10, unit: "bar",
  why: "All three routes lose moles of gas, so pressure raises every limit.",
};

function priceKnob(c: string, label: string): PanelKnob {
  return { id: c, label: `${label} — placeholder price`, min: 0, max: c === "H2" ? 6 : 1,
    step: c === "H2" ? 0.25 : 0.05, unit: "€/kg",
    why: "Not market data.  Set a price you can cite." };
}

export const PRICE_KNOBS: readonly PanelKnob[] = [
  priceKnob("methanol", "methanol (product)"), priceKnob("H2", "hydrogen"),
  priceKnob("CO", "carbon monoxide"), priceKnob("CO2", "carbon dioxide"),
  priceKnob("CH4", "methane"), priceKnob("O2", "oxygen"),
];

function kpi(r: RunResult | null, unit: string, key: string): number | null {
  const v = r?.kpis?.[unit]?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function yOf(r: RunResult | null, stream: string, c: string): number | null {
  const v = r?.streams.find((s) => s.name === stream)?.composition?.[c];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function fmt(v: number | null, d: number): string {
  return v === null || !Number.isFinite(v) ? "—" : v.toFixed(d);
}

function sci(v: number | null): string {
  if (v === null) return "—";
  return Math.abs(v) >= 1e-3 ? v.toFixed(4) : v.toExponential(1);
}

// ---- visual pieces ----------------------------------------------------------

/** Prose with its mathematics between `$` marks. */
function Md({ s }: { s: string }): JSX.Element {
  return (
    <>
      {s.split("$").map((part, i) => (i % 2 === 1
        ? <Tex key={i} src={part} mode="inline" />
        : <span key={i}>{part}</span>))}
    </>
  );
}

function Section({ s }: { s: ScreenSection }): JSX.Element {
  return (
    <Box>
      <Title order={5}>{s.title}</Title>
      <Text size="sm" mt={4}><Md s={s.body} /></Text>
      {s.eq && (
        <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
          <Tex src={s.eq} mode="display" />
          {s.where && (
            <Box mt={8}>
              {s.where.map((g) => (
                <Text key={g.sym} size="xs" c="dimmed" style={{ lineHeight: 1.6 }}>
                  <Tex src={g.sym} mode="inline" />{"  "}{g.means}
                  {g.unit ? <Text span c="dimmed"> [{g.unit}]</Text> : null}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )}
      {s.check && (
        <Box mt={6} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
          <Text size="sm" fw={600}>{s.check.q}</Text>
          <Text size="sm" c={INK} mt={2}><em>Answer:</em> {s.check.a}</Text>
        </Box>
      )}
    </Box>
  );
}

export function RouteScreeningTool(): JSX.Element {
  const [T, setT] = useState(525);
  const [P, setP] = useState(50);
  const [price, setPrice] = useState<Record<string, number>>(
    { ...PRICE_PLACEHOLDERS });

  const ov = useMemo(() => screenOverrides(T, P), [T, P]);
  const run = useMethodRun(SCREEN_WITNESS, ov, JSON.stringify([T, P]),
    "choupoSolve");
  const r = run.result;

  const sec = (id: string) => {
    const s = SCREEN_SECTIONS.find((q) => q.id === id);
    return s ? <Section key={id} s={s} /> : null;
  };

  const rows = ROUTES.map((rt) => {
    const gm = grossMargin(rt, price);
    const dH = kpi(r, `stoich${rt.key}`, "dHrxn_kJ_per_mol");
    const nuP = rt.nu[PRODUCT] ?? 1;
    return {
      rt, gm, ae: atomEconomy(rt),
      xeq: kpi(r, `equil${rt.key}`, `conversion_route${rt.key}`),
      K: kpi(r, `equil${rt.key}`, `Kp_route${rt.key}`),
      dHperMol: dH === null ? null : dH / nuP,
      yGibbs: rt.gibbs ? yOf(r, rt.gibbs, PRODUCT) : null,
    };
  });

  const table = (
    <Table striped withTableBorder withColumnBorders fz="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>route</Table.Th>
          <Table.Th>1 · gross margin (€/kg)</Table.Th>
          <Table.Th>2 · atom economy</Table.Th>
          <Table.Th>3 · equilibrium conversion (K)</Table.Th>
          <Table.Th>4 · heat per mol methanol (kJ)</Table.Th>
          <Table.Th>5 · methanol, every species open</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((w) => (
          <Table.Tr key={w.rt.key}>
            <Table.Td>
              <b>{w.rt.key}</b> — {w.rt.name}
              <Box><Tex src={w.rt.tex} mode="inline" /></Box>
            </Table.Td>
            <Table.Td>
              <Text size="xs" c={w.gm < 0 ? "red" : undefined}
                fw={w.gm < 0 ? 700 : 400}>{fmt(w.gm, 3)}</Text>
            </Table.Td>
            <Table.Td>{fmt(100 * w.ae, 0)} %</Table.Td>
            <Table.Td>
              {fmt(w.xeq, 3)}
              <Text size="xs" c="dimmed">K = {w.K === null ? "—" : w.K.toExponential(2)}</Text>
            </Table.Td>
            <Table.Td>{fmt(w.dHperMol, 1)}</Table.Td>
            <Table.Td>
              {w.rt.gibbs
                ? <Text size="xs" c="red" fw={700}>y = {sci(w.yGibbs)}</Text>
                : <Text size="xs" c="dimmed">see Declared pathways</Text>}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>Screening routes to a product</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Three known routes to methanol through the filters industry
            applies before anyone measures a rate: money, atoms,
            equilibrium, heat, selectivity, and the questions that are not
            thermodynamics. The one that wins on paper is the one that fails.
          </Text>
        </Box>

        {sec("funnel")}
        {sec("margin")}
        {sec("atom")}

        <Box>
          <Title order={5}>Now run the screen</Title>
          <Text size="sm" mt={4}>
            One run of the witness in your browser gives columns 3 to 5; columns
            1 and 2 are arithmetic on the stoichiometry and your prices. Read
            it across, route by route, then down, filter by filter.
          </Text>
          {run.err && (
            <Alert color="red" variant="light" mt={8}
              title="The engine did not finish">
              <Text size="sm">{run.err}</Text>
            </Alert>
          )}
          <Box mt={10} style={{
            display: "grid", gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          }}>
            <KnobSlider knob={T_KNOB} value={T} onChange={setT} showWhy />
            <KnobSlider knob={P_KNOB} value={P} onChange={setP} showWhy />
          </Box>
          {run.busy && (
            <Group gap="sm" wrap="nowrap" align="center" mt={6}>
              <Loader size="xs" />
              <Text size="xs" c="dimmed">
                three equilibrium Newtons and one Gibbs minimisation
              </Text>
            </Group>
          )}
          <Box mt={10}>{table}</Box>
          <Group gap="xs" mt={6}>
            <Badge variant="light" color="gray">T = {T} K · P = {P} bar</Badge>
          </Group>
          <Text size="sm" fw={600} mt={12}>Prices — placeholders, not market data</Text>
          <Box mt={6} style={{
            display: "grid", gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          }}>
            {PRICE_KNOBS.map((k) => (
              <KnobSlider key={k.id} knob={k} value={price[k.id] ?? 0}
                onChange={(v) => setPrice((p) => ({ ...p, [k.id]: v }))} />
            ))}
          </Box>
          <PanelNote>
            Runs <code>tutorials/{SCREEN_WITNESS}</code> on the WASM build of{" "}
            <code>choupoSolve</code>. The prices never reach the engine; no
            price is declared anywhere in this repository.
          </PanelNote>
        </Box>

        {sec("equilibrium")}
        {sec("heat")}
        {sec("selectivity")}
        {sec("select")}
        {sec("last")}

        <Box>
          <Title order={5}>What this does not show</Title>
          <Box mt={6}>
            {SCREEN_LIMITS.map((l) => (
              <Box key={l.id} mb={8}>
                <Text size="sm" fw={600}>{l.title}</Text>
                <Text size="sm" c="dimmed">{l.body}</Text>
              </Box>
            ))}
          </Box>
        </Box>

        <Text size="sm">
          Next:{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("reactor-ladder")}>
            The reactor ladder
          </Anchor>{" "}(what happens to the route that survives) and{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("declared-pathways")}>
            Declared pathways
          </Anchor>{" "}(selectivity as a declaration).
        </Text>
      </Stack>
    </Box>
  );
}
