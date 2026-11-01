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
  TreeOfChemistryTool -- "The tree of chemistry" (commission C191 A).

  ONE graph, three views, and NO ENGINE RUN: the numbers are stoichiometric
  arithmetic over the records in data/standards/routes/ (src/case/
  chemistryGraphMath.ts, printed with its constants in step 3), and the
  molar masses are read from the component records.  The prose is in
  treeOfChemistryLesson.ts, React-free and held by tests/treeOfChemistry.test.ts.

  THE GRAPH IS A PICTURE OF A TABLE.  The depth tree is drawn with React Flow,
  but every number it shows is also a row of the table beneath it, which is
  what the tests read (React Flow draws nothing without a measured container,
  so a server render of the picture alone would prove nothing) and what a
  screen reader reaches.

  EVERY ASSUMED BAND IS DRAWN AS THE CURATOR'S ESTIMATE: dashed underline, the
  mark "est.", its reason on hover AND in the detail row of the selected node.
  The first screen says so, with the census read from the records.

  A ROUTE WITH A CASE LINKS TO IT; A ROUTE WITH NONE SAYS "no case yet".
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Anchor, Badge, Box, Button, Group, Select, Stack, Table, Text, Title,
  Tooltip,
} from "@mantine/core";
import {
  Background, MarkerType, ReactFlow, type Edge, type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { CHEMISTRY_GRAPH as G, type Band, type Route } from "../../case/chemistryGraph.js";
import {
  census, depthTree, downstream, fmtBand, forcedCoProducts,
  h2PerCarbon, replacement, rootRoutes, routeInputs, routesForcing, routesTo,
  routesUsing, routesWithForcedCoproducts, type DepthNode,
} from "../../case/chemistryGraphMath.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { OriginMark } from "./origin.js";
import {
  TREE_LIMITS, TREE_QUIZ, TREE_STEPS,
} from "./treeOfChemistryLesson.js";

const step = lessonStepper(TREE_STEPS);

// ---- Small shared pieces ----------------------------------------------------

/** The case a route links to, as the app's own `?case=` address.  A tutorial
 *  is named without the leading "tutorials/". */
export function caseNameOf(path: string): string {
  return path.replace(/^tutorials\//, "");
}

function caseHref(path: string): string {
  const base = typeof window !== "undefined" ? window.location.pathname : "/";
  return `${base}?case=${encodeURIComponent(caseNameOf(path))}`;
}

const labelOf = (name: string): string => G.byName.get(name)?.label ?? name;

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>
        {children}
      </Table>
    </Box>
  );
}

/** A band, drawn as what it is.  An ASSUMED band (every yield in the records)
 *  is the curator's estimate: dashed underline, "est.", the reason on hover,
 *  and `data-band-kind` so a reader of the DOM can tell it from a figure
 *  read from a source. */
function BandText({ band, kind, reason }: {
  band: Band; kind: "assumed" | "literature" | "stoichiometry"; reason?: string;
}): JSX.Element {
  const text = <span data-band-text="">{fmtBand(band)}</span>;
  if (kind === "stoichiometry")
    return <span data-band-kind="stoichiometry" title="stoichiometry alone, no yield band">{text}</span>;
  if (kind === "literature")
    return <span data-band-kind="literature" title={reason}>{text}</span>;
  return (
    <Tooltip withArrow multiline w={320}
      label={`The curator's estimate (origin assumed): ${reason ?? ""}`}>
      <span data-band-kind="assumed"
        style={{ borderBottom: "1px dashed currentColor", cursor: "help" }}>
        {text}<sup style={{ opacity: 0.7 }}> est.</sup>
      </span>
    </Tooltip>
  );
}

function CaseLinks({ route }: { route: Route }): JSX.Element {
  if (route.cases.length === 0)
    return <Text span size="xs" c="dimmed" data-no-case="">no case yet</Text>;
  return (
    <>
      {route.cases.map((c, i) => (
        <span key={c}>
          {i > 0 && ", "}
          <Anchor href={caseHref(c)} target="_blank" rel="noopener noreferrer"
            size="xs" data-case-link={c}>{caseNameOf(c)}</Anchor>
        </span>
      ))}
    </>
  );
}

function EraBadge({ era }: { era: Route["era"] }): JSX.Element {
  return (
    <Badge size="xs" variant="light" color={era === "transition" ? "teal" : "gray"}>
      {era}
    </Badge>
  );
}

/** One route's provenance, each source with its licence and verification word. */
function Provenance({ route }: { route: Route }): JSX.Element {
  return (
    <Box>
      {route.provenance.map((p, i) => {
        const src = G.sourceById.get(p.source);
        return (
          <Text key={i} size="xs" c="dimmed">
            {src ? src.citation : p.source}
            {" -- "}{p.locus}
            {src ? ` [${src.licence}; ${src.verification}]` : ""}
          </Text>
        );
      })}
    </Box>
  );
}

// ---- The roots overview ------------------------------------------------------

function RootsOverview(): JSX.Element {
  const rows = useMemo(() => G.roots.map((root) => {
    const reached = new Set<string>();
    for (const m of root.members)
      for (const x of downstream(G, m).reached) reached.add(x.substance);
    for (const m of root.members) reached.delete(m);
    return { root, reached: reached.size };
  }), []);
  return (
    <Box>
      <Title order={5}>The eleven roots, and how much hangs from each</Title>
      <OriginMark of="page"
        note="substances reachable from the root's members along the route arrows, counted from the records" />
      <PanTable>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>root</Table.Th><Table.Th>group</Table.Th>
            <Table.Th>members</Table.Th><Table.Th>substances downstream</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map(({ root, reached }) => (
            <Table.Tr key={root.name} data-root-row={root.name}>
              <Table.Td>{root.label}</Table.Td>
              <Table.Td>{root.group}</Table.Td>
              <Table.Td>{root.members.map(labelOf).join(", ")}</Table.Td>
              <Table.Td>{reached}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
    </Box>
  );
}

// ---- VIEW 1: DEPTH -----------------------------------------------------------

/** Where the depth tree puts its nodes: the product on the right, its raw
 *  materials to the left (matter flows left to right), leaves in rows. */
export function layoutDepth(top: DepthNode): { [key: string]: { x: number; y: number } } {
  const pos: { [key: string]: { x: number; y: number } } = {};
  let row = 0;
  const maxDepth = (n: DepthNode): number =>
    1 + Math.max(0, ...n.children.map(maxDepth));
  const depth = maxDepth(top);
  const place = (n: DepthNode, level: number): number => {
    let y: number;
    if (n.children.length === 0) y = row++;
    else {
      const ys = n.children.map((c) => place(c, level + 1));
      y = ys.reduce((a, b) => a + b, 0) / ys.length;
    }
    pos[n.key] = { x: (depth - 1 - level) * 290, y: y * 86 };
    return y;
  };
  place(top, 0);
  return pos;
}

const STOP_WORD: Record<DepthNode["stop"], string> = {
  expanded: "", root: "root", feedstock: "feedstock", loop: "loop (stops)",
};

function DepthGraph({ nodes, selected, onSelect }: {
  nodes: readonly DepthNode[]; selected: string; onSelect: (key: string) => void;
}): JSX.Element {
  const { rfNodes, rfEdges } = useMemo(() => {
    const pos = layoutDepth(nodes[0]!);
    const rfNodes: Node[] = nodes.map((n) => ({
      id: n.key, position: pos[n.key]!, draggable: false,
      data: { label: (
        <div style={{ fontSize: 12, lineHeight: 1.25 }}>
          <b>{labelOf(n.substance)}</b>
          <div style={{ opacity: 0.75 }}>
            {n.stop === "expanded" ? n.route!.name : STOP_WORD[n.stop]}
          </div>
          <div style={{ opacity: 0.75 }}>{fmtBand(n.need)} kg/kg product</div>
        </div>) },
      style: {
        width: 210, padding: 6, borderRadius: 6, textAlign: "left" as const,
        background: "var(--mantine-color-body)", color: "var(--mantine-color-text)",
        border: n.key === selected
          ? "2px solid var(--mantine-color-teal-6)"
          : n.stop === "expanded" ? "1px solid var(--mantine-color-gray-5)"
            : "1px dashed var(--mantine-color-gray-6)",
      },
    }));
    const rfEdges: Edge[] = nodes.flatMap((n) => n.children.map((c) => ({
      id: `${c.key}->${n.key}`, source: c.key, target: n.key,
      label: `${fmtBand(c.edge!.kgPerKgTarget)} kg/kg`,
      labelStyle: { fontSize: 11 }, labelBgPadding: [4, 2] as [number, number],
      markerEnd: { type: MarkerType.ArrowClosed },
    })));
    return { rfNodes, rfEdges };
  }, [nodes, selected]);
  return (
    <Box style={{ height: 380, border: "1px solid var(--mantine-color-default-border)",
      borderRadius: 4 }} data-depth-graph="">
      <ReactFlow nodes={rfNodes} edges={rfEdges} fitView
        nodesDraggable={false} nodesConnectable={false} minZoom={0.2}
        onNodeClick={(_, n) => onSelect(n.id)}>
        <Background />
      </ReactFlow>
    </Box>
  );
}

const WORKED: readonly { id: string; label: string; product: string;
  choices: { [s: string]: string }; note: string }[] = [
  { id: "pvc", label: "PVC from ethylene and chlorine", product: "PVC", choices: {},
    note: "ethylene and chlorine per kg of PVC, through vinyl chloride and dichloroethane" },
  { id: "phenol", label: "Phenol, and the acetone it forces", product: "phenol", choices: {},
    note: "the Hock route from benzene and propylene through cumene" },
  { id: "methanol-co2", label: "Methanol from CO2 and electrolytic H2", product: "methanol",
    choices: { methanol: "CO2toMethanol", H2: "waterElectrolysis" },
    note: "the transition path: CO2 + 3 H2, with the hydrogen from water" },
];

export function DepthPanel({ initialProduct = "PVC", initialChoices = {} }: {
  initialProduct?: string; initialChoices?: { [s: string]: string };
}): JSX.Element {
  const [product, setProduct] = useState(initialProduct);
  const [choices, setChoices] = useState<{ [s: string]: string }>(initialChoices);
  const [selected, setSelected] = useState(initialProduct);
  const options = useMemo(() => G.substances
    .filter((s) => routesTo(G, s.name).length > 0)
    .map((s) => ({ value: s.name, label: `${s.label} (${s.name})` }))
    .sort((a, b) => a.label.localeCompare(b.label)), []);
  const d = useMemo(() => depthTree(G, product, choices), [product, choices]);
  const sel = d.nodes.find((n) => n.key === selected) ?? d.top;

  const pick = (p: string, c: { [s: string]: string }): void => {
    setProduct(p); setChoices(c); setSelected(p);
  };

  return (
    <Box data-view="depth">
      <Title order={5}>View 1 -- Depth: from a product back to its roots</Title>
      <Text size="sm" c="dimmed" mt={2}>
        Pick a product. Each box is a substance, each arrow a route, and the
        number on the arrow is the kilograms of that input per kilogram of
        what the route makes, as a band. The walk stops at a root, at a
        feedstock nothing in the graph makes, or on a loop. Click a box for
        the route behind it and the other ways to make it.
      </Text>
      <Group mt={6} gap="xs" align="flex-end">
        <Select label="Product" size="xs" searchable allowDeselect={false}
          data={options} value={product} style={{ width: 360 }}
          onChange={(v) => { if (v) pick(v, {}); }} />
        {WORKED.map((w) => (
          <Button key={w.id} size="compact-xs" variant="light"
            data-worked={w.id} onClick={() => pick(w.product, w.choices)}>
            {w.label}
          </Button>
        ))}
      </Group>

      <Box mt="sm">
        <OriginMark of={["page", "assumption"]}
          note="mass = stoichiometry x molar mass (page, from the records), divided by the yield band (the curator's estimate)" />
        <DepthGraph nodes={d.nodes} selected={sel.key} onSelect={setSelected} />
      </Box>

      <Title order={6} mt="sm">Raw materials per kg of {labelOf(product)}</Title>
      <PanTable>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>substance</Table.Th><Table.Th>where the walk stopped</Table.Th>
            <Table.Th>kg per kg product (band)</Table.Th>
            <Table.Th>of which carbon, kg (band)</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {d.totals.map((t) => (
            <Table.Tr key={`${t.substance}/${t.stop}`} data-total={t.substance}>
              <Table.Td>{labelOf(t.substance)}</Table.Td>
              <Table.Td>{t.stop}</Table.Td>
              <Table.Td><BandText band={t.need} kind="assumed"
                reason="the product of the yield bands of every route on the path" /></Table.Td>
              <Table.Td>{t.carbonKg.hi > 0 ? <BandText band={t.carbonKg} kind="assumed"
                reason="the same band, times the carbon mass fraction of the substance" /> : "-"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>

      <Title order={6} mt="sm">Every edge, in order</Title>
      <PanTable>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>input</Table.Th><Table.Th>into</Table.Th><Table.Th>route</Table.Th>
            <Table.Th>kg per kg of what the route makes</Table.Th>
            <Table.Th>forced co-products of the route (kg per kg)</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {d.nodes.filter((n) => n.edge !== null).map((n) => {
            const parent = d.nodes.find((p) => p.children.includes(n))!;
            return (
              <Table.Tr key={n.key} data-edge={n.key} onClick={() => setSelected(n.key)}
                style={{ cursor: "pointer" }}>
                <Table.Td>{labelOf(n.substance)}</Table.Td>
                <Table.Td>{labelOf(parent.substance)}</Table.Td>
                <Table.Td>{parent.route!.name}</Table.Td>
                <Table.Td><BandText band={n.edge!.kgPerKgTarget}
                  kind={parent.route!.yield?.origin ?? "assumed"}
                  reason={parent.route!.yield?.reason
                    ?? parent.route!.slate.find((s) => s.component === parent.substance)?.reason} /></Table.Td>
                <Table.Td>{parent.coProducts.length === 0 ? "none" : parent.coProducts
                  .map((c) => `${labelOf(c.component)} ${fmtBand(c.kgPerKgTarget)}`).join("; ")}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </PanTable>

      <NodeDetail node={sel} choices={choices}
        onChoose={(substance, route) => setChoices({ ...choices, [substance]: route })} />
    </Box>
  );
}

function NodeDetail({ node, choices, onChoose }: {
  node: DepthNode; choices: { [s: string]: string };
  onChoose: (substance: string, route: string) => void;
}): JSX.Element {
  const r = node.route;
  return (
    <Box mt="sm" px="sm" py={8} data-node-detail={node.substance}
      style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 4 }}>
      <Text size="sm" fw={600}>{labelOf(node.substance)}
        <Text span c="dimmed" size="xs"> -- {node.stop === "expanded"
          ? "made here by" : `the walk stops: ${STOP_WORD[node.stop]}`}</Text></Text>
      {r && (
        <Stack gap={2} mt={4}>
          <Group gap={6}>
            <Text size="sm" ff="monospace">{r.name}</Text>
            <EraBadge era={r.era} />
            <Badge size="xs" variant="outline">{r.family}</Badge>
          </Group>
          <Text size="xs">{r.description}</Text>
          {r.yield && (
            <Text size="xs" data-yield-reason="">
              Yield on {r.yield.basis}: <BandText band={r.yield.band}
                kind={r.yield.origin} reason={r.yield.reason} />
              {r.yield.origin === "assumed"
                ? ` -- the curator's estimate: ${r.yield.reason}`
                : ` -- read from ${r.yield.locus}`}
            </Text>
          )}
          {r.cycle && <Text size="xs" c="orange">Declared cycle: {r.cycle}</Text>}
          <Text size="xs">Choupo case: <CaseLinks route={r} /></Text>
          <Provenance route={r} />
        </Stack>
      )}
      {node.alternatives.length > 0 && (
        <Group gap={4} mt={6}>
          <Text size="xs" c="dimmed">Make it by:</Text>
          {node.alternatives.map((a) => (
            <Button key={a.name} size="compact-xs" data-alt={a.name}
              variant={choices[node.substance] === a.name
                || (!choices[node.substance] && r?.name === a.name) ? "filled" : "default"}
              onClick={() => onChoose(node.substance, a.name)}>
              {a.name} ({a.era})
            </Button>
          ))}
        </Group>
      )}
    </Box>
  );
}

// ---- VIEW 2: CONVERGENCE AND FORCED CO-PRODUCTION ---------------------------

export function ForcedPanel({ initialRoute = "naphthaSteamCracking" }: {
  initialRoute?: string;
}): JSX.Element {
  const routes = useMemo(() => routesWithForcedCoproducts(G), []);
  const [name, setName] = useState(initialRoute);
  const route = G.routeByName.get(name)!;
  const outs = useMemo(() => {
    const t = { component: route.target, isTarget: true, kgPerKgTarget: { lo: 1, hi: 1 } };
    const rest = forcedCoProducts(G, route);
    return [t, ...rest];
  }, [route]);
  const widest = Math.max(...outs.map((o) => o.kgPerKgTarget.hi));
  return (
    <Box mt="md" data-view="forced">
      <Title order={6}>What a route makes whether the market wants it or not</Title>
      <Text size="sm" c="dimmed" mt={2}>
        The target is what the route is built for; every other product is
        forced. Per kilogram of the target:
      </Text>
      <Group mt={6} gap="xs" align="flex-end">
        <Select label="Route" size="xs" searchable allowDeselect={false}
          value={name} style={{ width: 360 }}
          data={routes.map((r) => ({ value: r.name, label: `${r.name} (${labelOf(r.target)})` }))}
          onChange={(v) => { if (v) setName(v); }} />
        {["naphthaSteamCracking", "hockCleavage", "chlorAlkaliElectrolysis"].map((n) => (
          <Button key={n} size="compact-xs" variant="light" onClick={() => setName(n)}>{n}</Button>
        ))}
      </Group>
      <Text size="xs" mt={6}>{route.description}</Text>
      <OriginMark of={["page", "assumption"]}
        note={route.kind === "processYield"
          ? "a slate: the curator's estimate of each share, so a band"
          : "the stoichiometric ratio of molar masses, so a point, whatever the yield band"} />
      <PanTable>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>product</Table.Th><Table.Th>role</Table.Th>
            <Table.Th>kg per kg of target</Table.Th><Table.Th>size</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {outs.map((o) => {
            const slateEntry = route.slate.find((s) => s.component === o.component);
            return (
              <Table.Tr key={o.component} data-output={o.component}
                data-forced={o.isTarget ? "no" : "yes"}>
                <Table.Td>{labelOf(o.component)}</Table.Td>
                <Table.Td>{o.isTarget ? "TARGET" : "forced co-product"}</Table.Td>
                <Table.Td>
                  {route.kind === "processYield" && !o.isTarget
                    ? <BandText band={o.kgPerKgTarget} kind="assumed"
                      reason={slateEntry?.reason ?? ""} />
                    : <BandText band={o.kgPerKgTarget} kind="stoichiometry" />}
                </Table.Td>
                <Table.Td>
                  <Box style={{ height: 8, width: `${Math.max(2, 100 * o.kgPerKgTarget.hi / widest)}%`,
                    background: o.isTarget ? "var(--mantine-color-teal-6)" : "var(--mantine-color-orange-6)",
                    borderRadius: 2 }} />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </PanTable>
      <Text size="xs" c="dimmed" mt={4}>
        Route case: <CaseLinks route={route} />
      </Text>
    </Box>
  );
}

export function ConvergencePanel({ initialSubstance = "ethylene" }: {
  initialSubstance?: string;
}): JSX.Element {
  const [sub, setSub] = useState(initialSubstance);
  const options = useMemo(() => G.substances
    .filter((s) => routesUsing(G, s.name).length > 0 || routesTo(G, s.name).length > 0)
    .map((s) => ({ value: s.name, label: `${s.label} (${s.name})` }))
    .sort((a, b) => a.label.localeCompare(b.label)), []);
  const down = useMemo(() => downstream(G, sub), [sub]);
  const users = routesUsing(G, sub);
  const makers = routesTo(G, sub);
  const forcing = routesForcing(G, sub);
  const volume = G.volumes.filter((v) => v.substances.includes(sub));
  const byDepth = useMemo(() => {
    const m: { [d: number]: string[] } = {};
    for (const x of down.reached) (m[x.depth] ??= []).push(x.substance);
    return m;
  }, [down]);
  return (
    <Box data-view="convergence">
      <Title order={5}>View 2 -- Convergence and forced co-production</Title>
      <Text size="sm" c="dimmed" mt={2}>
        Pick a root, a feedstock or any substance. The graph runs forwards:
        every route that consumes it, everything reachable from it, and the
        products at the leaves nothing else consumes.
      </Text>
      <Group mt={6} gap="xs" align="flex-end">
        <Select label="Substance" size="xs" searchable allowDeselect={false}
          data={options} value={sub} style={{ width: 360 }}
          onChange={(v) => { if (v) setSub(v); }} />
        {["ethylene", "propylene", "benzene", "CO", "NH3", "Cl2"].map((s) => (
          <Button key={s} size="compact-xs" variant="light" onClick={() => setSub(s)}>{labelOf(s)}</Button>
        ))}
      </Group>
      <OriginMark of="page" note="counted from the records by walking the route arrows forwards" />
      <Text size="sm" mt={4} data-downstream-count="">
        <b>{down.reached.length}</b> substances are reachable from {labelOf(sub)};{" "}
        <b>{down.leaves.length}</b> of them are leaves nothing else consumes;{" "}
        it is a reactant or feed of <b>{users.length}</b> routes.
      </Text>
      {volume.map((v) => (
        <Text key={v.locus} size="xs" c="dimmed" data-volume="">
          {v.value} {v.unit} ({v.basis}) -- {G.sourceById.get(v.source)?.citation ?? v.source},
          {" "}{v.locus} [{G.sourceById.get(v.source)?.licence}; read from a source]
        </Text>
      ))}
      <PanTable>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>steps away</Table.Th><Table.Th>substances</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {Object.entries(byDepth).map(([d, list]) => (
            <Table.Tr key={d}><Table.Td>{d}</Table.Td>
              <Table.Td>{list.map(labelOf).join(", ")}</Table.Td></Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
      <Text size="xs" mt={6}>
        Built for it by: {makers.length === 0 ? "no route (a feedstock of the graph)"
          : makers.map((r) => `${r.name} (${r.era})`).join(", ")}.
        {" "}Forced as a co-product of: {forcing.length === 0 ? "no route"
          : forcing.map((r) => `${r.name} (built for ${labelOf(r.target)})`).join(", ")}.
      </Text>
      <ForcedPanel />
    </Box>
  );
}

// ---- VIEW 3: THE TREE OF 2050 -----------------------------------------------

const REPLACEMENT_WORD = {
  root: "a transition route builds the root itself",
  yield: "a transition route yields it as a co-product",
  feeder: "only a feeder is replaced; the root's own edge is unchanged",
  none: "no transition route recorded",
} as const;

function RouteCard({ route }: { route: Route }): JSX.Element {
  const h2 = h2PerCarbon(G, route);
  const inputs = routeInputs(G, route);
  return (
    <Box px="xs" py={6} data-route-card={route.name}
      style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 4 }}>
      <Group gap={6}>
        <Text size="xs" fw={600} ff="monospace">{route.name}</Text>
        <EraBadge era={route.era} />
      </Group>
      <Text size="xs">
        {inputs.map((i) => labelOf(i.component)).join(" + ")} {"->"} {labelOf(route.target)}
        {route.yield && <>{"; yield "}<BandText band={route.yield.band}
          kind={route.yield.origin} reason={route.yield.reason} /></>}
      </Text>
      <Text size="xs" data-h2-per-carbon={h2 === null ? "n/a" : String(h2)}>
        H2 per carbon: {h2 === null ? "not defined (no stoichiometry or no carbon)"
          : h2 === 0 ? "none in this step (any hydrogen entered upstream)"
            : h2 > 0 ? `${h2.toFixed(2)} (consumed)` : `${(-h2).toFixed(2)} (released)`}
      </Text>
      {route.energy.length === 0
        ? <Text size="xs" c="dimmed">No energy figure recorded for this route.</Text>
        : route.energy.map((e, i) => (
          <Text key={i} size="xs" data-energy-origin={e.origin}>
            {e.route}: <BandText band={e.band} kind={e.origin}
              reason={e.origin === "assumed" ? e.reason : e.locus} /> {e.unit}
            {e.origin === "literature" ? ` (read from ${e.locus})` : ""}
          </Text>
        ))}
      <Text size="xs">Choupo case: <CaseLinks route={route} /></Text>
    </Box>
  );
}

export function TreeOf2050Panel({ initialRoot = "syngas" }: {
  initialRoot?: string;
}): JSX.Element {
  const [rootName, setRootName] = useState(initialRoot);
  const all = useMemo(() => G.roots.map((r) => rootRoutes(G, r)), []);
  const rr = all.find((x) => x.root.name === rootName) ?? all[0]!;
  return (
    <Box data-view="tree2050">
      <Title order={5}>View 3 -- The tree of 2050: the roots, replaced</Title>
      <Text size="sm" c="dimmed" mt={2}>
        For each root, the incumbent routes beside the transition routes. The
        message is in the last column of the overview: where the transition
        acts, it acts on the root or on its feeder, and the leaves do not move.
      </Text>
      <OriginMark of="page" note="the record's era word, counted; H2 per carbon from the stoichiometry" />
      <PanTable>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>root</Table.Th><Table.Th>incumbent routes</Table.Th>
            <Table.Th>transition routes</Table.Th><Table.Th>what the records say</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {all.map((x) => (
            <Table.Tr key={x.root.name} data-root-replacement={x.root.name}
              data-replacement={replacement(x)}
              onClick={() => setRootName(x.root.name)} style={{ cursor: "pointer" }}>
              <Table.Td>{x.root.label}</Table.Td>
              <Table.Td>{x.incumbent.length}</Table.Td>
              <Table.Td>{x.transition.length}</Table.Td>
              <Table.Td>{REPLACEMENT_WORD[replacement(x)]}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>

      <Select mt="sm" label="Root" size="xs" allowDeselect={false} style={{ width: 360 }}
        data={G.roots.map((r) => ({ value: r.name, label: r.label }))}
        value={rootName} onChange={(v) => { if (v) setRootName(v); }} />
      <Box mt={6} style={{ display: "grid", gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <Stack gap={6}>
          <Text size="xs" fw={700} tt="uppercase">incumbent</Text>
          {rr.incumbent.length === 0 && <Text size="xs" c="dimmed">no route builds this root in the records</Text>}
          {rr.incumbent.map((r) => <RouteCard key={r.name} route={r} />)}
        </Stack>
        <Stack gap={6}>
          <Text size="xs" fw={700} tt="uppercase">transition</Text>
          {rr.transition.length === 0 && <Text size="xs" c="dimmed" data-no-transition="">
            no transition route builds this root in the records</Text>}
          {rr.transition.map((r) => <RouteCard key={r.name} route={r} />)}
          {rr.alsoYields.filter((r) => r.era === "transition").map((r) => (
            <Box key={r.name}>
              <Text size="xs" c="dimmed">also yielded, not built for:</Text>
              <RouteCard route={r} />
            </Box>
          ))}
        </Stack>
      </Box>
      {rr.feeders.length > 0 && (
        <Box mt="sm" data-feeders="">
          <Text size="sm" fw={600}>The feeders that change while the root's own edge stays</Text>
          {rr.feeders.map((f) => (
            <Text key={f.reactant} size="xs">
              {labelOf(f.reactant)}: now {f.incumbent.map((r) => r.name).join(", ") || "-"};
              {" "}transition {f.transition.map((r) => r.name).join(", ")}.
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ---- The honesty strip, the sources -----------------------------------------

function HonestyAlert(): JSX.Element {
  const c = useMemo(() => census(G), []);
  return (
    <Alert color="yellow" variant="light" title="Read the numbers as estimates"
      data-honesty="">
      All <b>{c.bands.yieldSlateAssumed}</b> yield and slate bands in this
      graph are the curator's estimates (<code>origin assumed</code>), each
      with its reason one hover or click away; none was read back against a
      published table. {c.bands.energyAssumed} of the {c.bands.energies}{" "}
      energy figures are estimates too. The stoichiometry is checked atom by
      atom. The only figures read from a source are the IEA's{" "}
      {G.volumes.length} production volumes and {c.bands.literature} ammonia
      energy intensities. {c.routesWithoutCase} of the {c.routes} routes link
      no Choupo case yet, and say so.
    </Alert>
  );
}

function SourcesTable(): JSX.Element {
  return (
    <Box>
      <Title order={5}>Sources, with their licence and how well each is known</Title>
      <OriginMark of="reference" note="the graph header's own list; a source nobody cites fails the gate" />
      <PanTable>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>id</Table.Th><Table.Th>work</Table.Th>
            <Table.Th>licence</Table.Th><Table.Th>verification</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {G.sources.map((s) => (
            <Table.Tr key={s.id} data-source={s.id}>
              <Table.Td>{s.id}</Table.Td>
              <Table.Td>
                {s.citation}
                {s.url !== "" && <> {" "}<Anchor href={s.url} target="_blank"
                  rel="noopener noreferrer" size="xs">link</Anchor></>}
                {s.verificationNote !== "" && <Text size="xs" c="dimmed">{s.verificationNote}</Text>}
              </Table.Td>
              <Table.Td>{s.licence}</Table.Td>
              <Table.Td>{s.verification}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
    </Box>
  );
}

// ---- The page ----------------------------------------------------------------

export function TreeOfChemistryTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 1040, margin: "0 auto" }}>
        <Box>
          <Title order={4}>The tree of chemistry</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Seven organic and four inorganic roots, one directed graph of the
            routes between them, and three ways to read it: depth, convergence
            and forced co-production, and the roots replaced.
          </Text>
          <Box mt="sm"><HonestyAlert /></Box>
        </Box>
        {G.refusals.length > 0 && (
          <Alert color="red" title="Records the reader could not use" data-refusals="">
            {G.refusals.map((r, i) => <Text key={i} size="xs">{r}</Text>)}
          </Alert>
        )}

        {step(1)}
        <RootsOverview />

        <Title order={4}>Reading a route</Title>
        {step(2)}
        {step(3)}
        {step(4)}
        <DepthPanel />

        <Title order={4}>Convergence and forced co-production</Title>
        {step(5)}
        {step(6)}
        <ConvergencePanel />

        <Title order={4}>The roots, replaced</Title>
        {step(7)}
        {step(8)}
        <TreeOf2050Panel />

        {step(9)}
        <SourcesTable />

        <LessonQuiz title="Check your understanding" questions={TREE_QUIZ}
          lesson={TREE_STEPS} />

        <LessonLimits limits={TREE_LIMITS} />
      </Stack>
    </Box>
  );
}
