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
  InternalsView -- THE unit surface (gui-credo §4 "two surfaces"): a unit's
  "entrails", opened in a new tab by double-clicking the unit on the parent
  flowsheet.  TYPE-AWARE tabs (one drill, then switch freely -- no pre-click
  menu):
    Profiles   -- the stage / axial profile (column T, x_i/y_i, L/V vs stage)
    Reactions  -- (reactors) the reaction(s): equation, stoichiometry, kinetics,
                  + what the run achieved (k, conversion, extent, Damköhler)
    Streams    -- the in/out streams in FULL detail (F molar+mass, T, P, vf, comp)
    Hardware   -- the resolved operation block + every KPI
    Dict       -- the unit's dictionary (glass-box source)
    Model      -- the model description (from docs/ai/unit-ops.md) + theory link
    What-if    -- edit operation scalars / run / sweep the synthesised 1-unit
                  clone, plots land right here.  Transient -- NEVER a save.
  Self-contained: the parent tab stashed everything (incl. the runnable clone)
  in localStorage under the STABLE key `choupo.internals.<unit>` -- never
  consumed, so the tab survives F5.
\*---------------------------------------------------------------------------*/

import { Anchor, Box, Group, ScrollArea, Tabs, Table, Text, Code } from "@mantine/core";
import { IconExternalLink, IconStethoscope } from "@tabler/icons-react";
import { useEffect } from "react";

import type { StreamResult, UnitProfile } from "../adapters/SolverAdapter.js";
import { dictToText } from "../adapters/WasmAdapter.js";
import { modelSection, theoryLink } from "../case/modelDocs.js";
import type { CaseFiles } from "../case/types.js";
import { ProfilePlot } from "./plotting/ProfilePlot.js";
import { ExpiredTabPanel } from "./ExpiredTabPanel.js";
import { UnitStreamsTable } from "./UnitStreamsTable.js";
import { WhatIfTab } from "./WhatIfTab.js";
import { focusKey } from "./unitFocus.js";

interface StoichTerm { component: string; nu: number; order?: number; }
interface ReactionDef {
  limitingReactant?: string;
  stoichiometry?: StoichTerm[];
  kinetics?: { type?: string; A?: number; Ea?: number; [k: string]: unknown };
}

interface Stash {
  name: string; type: string; model: string;
  unit: Record<string, unknown>;
  operation: Record<string, unknown>;
  kpis: Record<string, number>;
  profile: UnitProfile | null;
  inStreams: StreamResult[];
  outStreams: StreamResult[];
  reactions?: Record<string, ReactionDef> | null;
  /** The synthesised 1-unit clone (frozen inlets, $vars resolved) -- the
   *  What-if tab runs it.  Absent on stashes written by older builds. */
  files?: CaseFiles;
}

// Unit-op types that carry a reaction network -> show the Reactions tab.
const REACTOR_TYPES = new Set(["cstr", "pfr", "gibbsReactor", "reactor", "dynamicCSTR", "batchReactor"]);

function readStash(): Stash | null {
  if (typeof window === "undefined") return null;
  const key = new URLSearchParams(window.location.search).get("internals");
  if (!key) return null;
  try { const raw = window.localStorage.getItem(key); return raw ? (JSON.parse(raw) as Stash) : null; }
  catch { return null; }
}

const fmtNum = (n: number) => (Math.abs(n) >= 1e4 || (n !== 0 && Math.abs(n) < 1e-2) ? n.toExponential(3) : String(+n.toFixed(4)));

// "2 methanol + CO  →  aceticAcid" from a stoichiometry list (|nu| coefficient).
function equationOf(stoich: StoichTerm[]): string {
  const term = (s: StoichTerm) => { const c = Math.abs(s.nu); return (c === 1 ? "" : `${+c.toFixed(3)} `) + s.component; };
  const r = stoich.filter((s) => s.nu < 0).map(term);
  const p = stoich.filter((s) => s.nu > 0).map(term);
  return `${r.join(" + ")}  →  ${p.join(" + ")}`;
}

export function InternalsView() {
  const s = readStash();
  useEffect(() => { if (s?.name) document.title = `${s.name} · internals`; }, [s?.name]);

  // Stash gone (cleared storage / another browser): refuse honestly instead
  // of silently degrading (gui-credo §4 "Tab citizenship").
  if (!s) return <ExpiredTabPanel kind="internals" />;

  const hasProfile = !!s.profile;
  const reactions = s.reactions && Object.keys(s.reactions).length > 0 ? s.reactions : null;
  const isReactor = REACTOR_TYPES.has(s.type) && !!reactions;
  const def = hasProfile ? "profiles" : isReactor ? "reactions" : "streams";
  const model = modelSection(s.type);
  const theory = theoryLink(s.type);
  // The graphical mini-flowsheet viewer of the same clone (?focus=): its
  // sibling stash is written by the same pop-out act, so it can be opened
  // straight from here.
  const openFocus = () => {
    try {
      window.open(`${window.location.pathname}?focus=${encodeURIComponent(focusKey(s.name))}`,
        "_blank", "noopener");
    } catch { /* popup blocked -- nothing to do */ }
  };

  return (
    <Box style={{ height: "100vh", display: "flex", flexDirection: "column", background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))" }}>
      <Group gap={8} px="md" py={8} style={{ borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))" }}>
        <IconStethoscope size={17} color="var(--mantine-color-accent-4)" />
        <Text fw={600} c="accent.3">{s.name}</Text>
        <Code>{s.type}{s.model ? ` · ${s.model}` : ""}</Code>
        <Text size="xs" c="dimmed" ff="monospace">internals</Text>
        {s.files && (
          <Anchor size="xs" c="accent.4" onClick={openFocus} style={{ marginLeft: "auto" }}>
            <Group gap={4} display="inline-flex" style={{ verticalAlign: "middle" }}>
              <IconExternalLink size={12} /> mini-flowsheet
            </Group>
          </Anchor>
        )}
      </Group>

      <Tabs defaultValue={def} keepMounted={false} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Tabs.List px="md">
          {hasProfile && <Tabs.Tab value="profiles">Profiles</Tabs.Tab>}
          {isReactor && <Tabs.Tab value="reactions">Reactions</Tabs.Tab>}
          <Tabs.Tab value="streams">Streams</Tabs.Tab>
          <Tabs.Tab value="hardware">Hardware</Tabs.Tab>
          <Tabs.Tab value="dict">Dict</Tabs.Tab>
          {(model || theory) && <Tabs.Tab value="model">Model</Tabs.Tab>}
          <Tabs.Tab value="whatif">What-if</Tabs.Tab>
        </Tabs.List>

        {hasProfile && (
          <Tabs.Panel value="profiles" style={{ flex: 1, minHeight: 0 }}>
            <ProfilePlot profiles={[s.profile!]} />
          </Tabs.Panel>
        )}

        {isReactor && (
          <Tabs.Panel value="reactions" style={{ flex: 1, minHeight: 0 }}>
            <ScrollArea h="100%" type="auto">
              <Box m="md">
                {Object.entries(reactions!).map(([rname, r]) => (
                  <ReactionCard key={rname} name={rname} r={r} kpis={s.kpis} />
                ))}
              </Box>
            </ScrollArea>
          </Tabs.Panel>
        )}

        <Tabs.Panel value="streams" style={{ flex: 1, minHeight: 0 }}>
          <ScrollArea h="100%" type="auto">
            <Box m="md">
              <UnitStreamsTable groups={[
                { dir: "in", streams: s.inStreams },
                { dir: "out", streams: s.outStreams },
              ]} />
            </Box>
          </ScrollArea>
        </Tabs.Panel>

        <Tabs.Panel value="hardware" style={{ flex: 1, minHeight: 0 }}>
          <ScrollArea h="100%" type="auto">
            <Group align="flex-start" gap="xl" m="md">
              <KVTable title="Operation (resolved)" rows={s.operation} />
              <KVTable title="KPIs" rows={s.kpis} />
            </Group>
          </ScrollArea>
        </Tabs.Panel>

        <Tabs.Panel value="dict" style={{ flex: 1, minHeight: 0 }}>
          <ScrollArea h="100%" type="auto">
            <Code block m="md" style={{ fontSize: 12, whiteSpace: "pre" }}>
              {dictToText(s.unit as never, s.name)}
            </Code>
          </ScrollArea>
        </Tabs.Panel>

        {(model || theory) && (
          <Tabs.Panel value="model" style={{ flex: 1, minHeight: 0 }}>
            <ScrollArea h="100%" type="auto">
              <Box m="md" maw={780}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={6}>
                  How this model works — from docs/ai/unit-ops.md
                </Text>
                <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                  {model ?? "See the Theory Guide section below for this unit's model."}
                </Text>
                <Text size="xs" c="dimmed" mt="lg">
                  {theory ? (
                    <Anchor href={theory} target="_blank" rel="noopener" c="accent.4">
                      <Group gap={4} display="inline-flex" style={{ verticalAlign: "middle" }}>
                        <IconExternalLink size={13} /> Deeper theory — open this section in the Theory Guide
                      </Group>
                    </Anchor>
                  ) : (
                    <>Deeper theory: <Code>docs/theoryGuide.pdf</Code></>
                  )}
                  {" · "}source under <Code>src/unitOperations/</Code>
                </Text>
              </Box>
            </ScrollArea>
          </Tabs.Panel>
        )}

        {/* What-if: manipulate where you plot (gui-credo §4).  keepMounted so
            the tab's LOCAL edits/results survive switching to other tabs --
            closing the BROWSER tab is the reset. */}
        <Tabs.Panel value="whatif" keepMounted style={{ flex: 1, minHeight: 0 }}>
          <WhatIfTab stash={s} />
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}

// One reaction: equation + stoichiometry/order table + Arrhenius + what the run
// achieved (conversion, extent, k, Damköhler) pulled from the unit's KPIs.
function ReactionCard({ name, r, kpis }: { name: string; r: ReactionDef; kpis: Record<string, number> }) {
  const stoich = r.stoichiometry ?? [];
  const kin = r.kinetics ?? {};
  const A = typeof kin.A === "number" ? kin.A : undefined;
  const Ea = typeof kin.Ea === "number" ? kin.Ea : undefined;
  // Run results (single-reaction reactors expose these on the unit's KPIs).
  const run: Array<[string, string]> = [];
  const push = (k: string, label: string, fmt: (v: number) => string) => {
    if (typeof kpis[k] === "number") run.push([label, fmt(kpis[k])]);
  };
  push("k", "rate constant k", (v) => `${fmtNum(v)} s⁻¹`);
  push("X_limiting", "conversion X", (v) => `${(v * 100).toFixed(1)} %`);
  push("xi_mol_per_s", "extent ξ", (v) => `${fmtNum(v)} mol/s`);
  push("Da_kTau", "Damköhler Da", (v) => fmtNum(v));
  push("tau_s", "residence τ", (v) => `${fmtNum(v)} s`);

  return (
    <Box mb="lg">
      <Group gap={8} mb={4}>
        <Text fw={600} c="accent.3">{name}</Text>
        {r.limitingReactant && <Text size="xs" c="dimmed">limiting: {r.limitingReactant}</Text>}
      </Group>
      <Code block mb="sm" style={{ fontSize: 14 }}>{equationOf(stoich)}</Code>

      <Group align="flex-start" gap="xl">
        <Box>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>Stoichiometry</Text>
          <Table withTableBorder fz="sm" ff="monospace" w="auto">
            <Table.Thead><Table.Tr>
              <Table.Th>component</Table.Th><Table.Th ta="right">ν</Table.Th><Table.Th ta="right">order</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {stoich.map((t) => (
                <Table.Tr key={t.component}>
                  <Table.Td>{t.component}</Table.Td>
                  <Table.Td ta="right">{t.nu > 0 ? `+${t.nu}` : t.nu}</Table.Td>
                  <Table.Td ta="right">{t.order ?? "—"}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>

        <Box>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>Kinetics</Text>
          <Table withTableBorder fz="sm" ff="monospace" w="auto">
            <Table.Tbody>
              <Table.Tr><Table.Td c="dimmed">type</Table.Td><Table.Td ta="right">{kin.type ?? "—"}</Table.Td></Table.Tr>
              {A !== undefined && <Table.Tr><Table.Td c="dimmed">A</Table.Td><Table.Td ta="right">{fmtNum(A)}</Table.Td></Table.Tr>}
              {Ea !== undefined && <Table.Tr><Table.Td c="dimmed">Ea</Table.Td><Table.Td ta="right">{fmtNum(Ea)} J/mol</Table.Td></Table.Tr>}
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed" mt={6} ff="monospace">k = A·exp(−Ea/RT)</Text>
          <Text size="xs" c="dimmed" ff="monospace">rate = k·∏ cᵢ^orderᵢ</Text>
        </Box>

        {run.length > 0 && (
          <Box>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>At the solution</Text>
            <Table withTableBorder fz="sm" ff="monospace" w="auto">
              <Table.Tbody>
                {run.map(([k, v]) => (
                  <Table.Tr key={k}><Table.Td c="dimmed">{k}</Table.Td><Table.Td ta="right">{v}</Table.Td></Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        )}
      </Group>
    </Box>
  );
}

function KVTable({ title, rows }: { title: string; rows: Record<string, unknown> }) {
  const entries = Object.entries(rows ?? {});
  return (
    <Box>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>{title}</Text>
      {entries.length === 0 ? <Text size="sm" c="dimmed">—</Text> : (
        <Table withTableBorder fz="sm" ff="monospace" w="auto">
          <Table.Tbody>
            {entries.map(([k, v]) => (
              <Table.Tr key={k}>
                <Table.Td c="dimmed">{k}</Table.Td>
                <Table.Td ta="right">{typeof v === "number" ? fmtNum(v) : String(v)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Box>
  );
}
