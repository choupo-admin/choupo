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
  MethodsWorkspace — classical METHOD CONSTRUCTIONS (ratified 2026-08-15).

  The criterion that splits this plane from the Property Explorer:
      method-construction → Methods;  property-surface → Explorer.
  A property surface answers "what does this system's property look like?"
  (T-x-y, γ(x), a Psat scan — the Explorer).  A method construction answers
  "what does the CLASSICAL GRAPHICAL METHOD say about a design question?"
  (operating lines + staircase, process paths on a state chart — here).

  Inherits the Explorer's guard-rails unchanged (gui-credo §3 + §9):
  ephemeral, on-demand (Esc closes via the AppShell), and above all ZERO
  physics in TS — every curve is an engine (WASM choupoProps) run over a
  transient synthesized case, or an engine-written CSV.  The construction
  drawn ON the engine's curve (staircase walking, tie-lines) is pure geometry
  in the shared plotting kit.  The "Author → copy propsDict" hand-off stays:
  dict-on-disk remains the one authoring channel.

  First slice: a 7-tool registry with the two migrated tools LIVE (McCabe-
  Thiele, psychrometric chart — both moved from the Explorer, reusing the SAME
  engine feeds via case/methodFeeds.ts) and five PLANNED entries visible but
  disabled, each naming the engine output that will feed it — the plane shows
  its roadmap honestly instead of pretending to be finished.
\*---------------------------------------------------------------------------*/

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon, Alert, Badge, Box, Button, Code, Collapse, CopyButton, Group,
  Loader, NumberInput, Select, Stack, Text, Tooltip,
} from "@mantine/core";
import { IconBook, IconExternalLink } from "@tabler/icons-react";

import { resolveAdapter } from "../adapters/index.js";
import {
  EXPLORE_OUTPUT, synthesizeExploreCase, type ExploreSpec,
} from "../case/exploreSynth.js";
import {
  caseComponentFiles, mergeCatalogue, metaByName, type ComponentMeta,
} from "../case/catalogue.js";
import {
  binaryVleSpec, orderBinaryByVolatility, psychroSpec, type LocalUnifac,
} from "../case/methodFeeds.js";
import { buildLocalUnifac, hasUnifacGroups } from "../case/unifacGroups.js";
import { hasPair } from "../case/pairsCatalogue.js";
import { fromJson, serialize } from "../dict/index.js";
import { dropCsvColumn } from "./plotting/csvShape.js";
import { McCabePlot } from "./plotting/McCabePlot.js";
import { PsychroPlot } from "./plotting/PsychroPlot.js";
import { popOutExploreMccabe } from "./explore/exploreMccabePopOut.js";
import { useStore } from "../state/store.js";
import {
  kToDisplay, paToDisplay, parsePressure, parseTemperature,
  pressureLabel, temperatureLabel,
} from "../state/displayUnits.js";

// The three run-fed tools are lazy: BreakthroughTool reaches the plotly seam
// at module scope (plotly.js-basic-dist-min cannot load under node), and
// deferring all three keeps this module importable by the vitest node
// environment and the initial bundle unchanged until a tool is opened.
const KremserTool = lazy(() =>
  import("./methods/KremserTool.js").then((m) => ({ default: m.KremserTool })));
const EpsilonNtuTool = lazy(() =>
  import("./methods/EpsilonNtuTool.js").then((m) => ({ default: m.EpsilonNtuTool })));
const BreakthroughTool = lazy(() =>
  import("./methods/BreakthroughTool.js").then((m) => ({ default: m.BreakthroughTool })));
const PinchCompositeTool = lazy(() =>
  import("./methods/PinchCompositeTool.js").then((m) => ({ default: m.PinchCompositeTool })));
const PumpSystemTool = lazy(() =>
  import("./methods/PumpSystemTool.js").then((m) => ({ default: m.PumpSystemTool })));

// ---- The method-tool registry ----------------------------------------------
// One entry per classical construction.  `status: "planned"` entries are
// VISIBLE but disabled — the rail is the roadmap, stated rather than implied —
// and each names the engine output that will feed it (zero physics in TS is
// the standing rule for the planned five exactly as for the live two).

export type MethodToolId =
  | "mccabe" | "psychro" | "kremser" | "pinch-composite" | "entu"
  | "pump-system" | "breakthrough";

export interface MethodTool {
  id: MethodToolId;
  label: string;
  status: "live" | "planned";
  /** One line: what this construction teaches. */
  teaches: string;
  /** Theory Guide named destination (hyperref destlabel), when one exists. */
  theory?: string;
  /** Planned entries: the engine output that will feed the tool. */
  fedBy?: string;
}

export const METHOD_TOOLS: MethodTool[] = [
  {
    id: "mccabe", label: "McCabe-Thiele (distillation)", status: "live",
    teaches: "Operating lines, the q-line and the staircase: how reflux R and feed quality q set the number of ideal stages.",
    theory: "sec:mccabe-tray-efficiency",
  },
  {
    id: "psychro", label: "Psychrometric chart", status: "live",
    teaches: "The humid-gas state map: saturation, relative-humidity and adiabatic-saturation / wet-bulb lines locate every drying and conditioning path.",
    theory: "ch:drying",
  },
  {
    id: "kremser", label: "Kremser (absorption)", status: "live",
    teaches: "The absorption factor A = L/(mV): how solute recovery scales with stage count when both lines are straight — judged against the engine's stagewise recovery.",
    theory: "ch:absorber",
  },
  {
    id: "pinch-composite", label: "Pinch composite curves", status: "live",
    teaches: "Hot and cold composite curves: the pinch splits the problem and fixes Q_H,min / Q_C,min before any exchanger is drawn — the in-view cascade cross-checked against the engine's targets.",
    theory: "ch:pinch",
  },
  {
    id: "entu", label: "ε-NTU (heat exchangers)", status: "live",
    teaches: "Effectiveness vs NTU at a capacity ratio: why counter-current wins and when extra area stops paying — the run's exchanger placed on its own curve.",
    theory: "ch:hx-entu",
  },
  {
    id: "pump-system", label: "Pump vs system curve", status: "live",
    teaches: "The operating point is an intersection: the pump model's rise falling with flow against the pipe system's demand rising with it — crossed where the engine's own columns cross.",
    theory: "ch:rotating",
  },
  {
    id: "breakthrough", label: "Adsorption breakthrough", status: "live",
    teaches: "The S-shaped breakthrough curve: the mass-transfer zone consumes bed capacity long before the bed saturates — the ideal square wave drawn at the engine's stoichiometric time.",
    theory: "ch:adsorption",
  },
];

const theoryUrl = (dest: string) => `/docs/theoryGuide.pdf#nameddest=${dest}`;

/** Boot tool from the URL: `?workspace=methods&tool=<id>` (new), or the legacy
 *  Explorer deep-link `?explore=mccabe` WITHOUT a `&key=` stash (with a key it
 *  is the analyzer pop-out tab, which AppShell routes before this mounts). */
function bootTool(): MethodToolId {
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search);
    if (q.get("explore") === "mccabe" && !q.has("key")) return "mccabe";
    const t = q.get("tool");
    if (METHOD_TOOLS.some((m) => m.id === t && m.status === "live"))
      return t as MethodToolId;
  }
  return "mccabe";
}

// ---- The engine runner ------------------------------------------------------
// The SAME feeding machinery the Explorer uses (resolveAdapter("wasm") over a
// synthesized transient choupoProps case), reduced to the single-run shape the
// method tools need.  Debounced; a newer spec aborts the in-flight run.
function useEngineCsv(spec: ExploreSpec | null): {
  csv: string | null; err: string | null; busy: boolean; advisories: string[];
} {
  const [csv, setCsv] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [advisories, setAdvisories] = useState<string[]>([]);
  const runSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!spec) {
      abortRef.current?.abort();
      setCsv(null); setErr(null); setAdvisories([]); setBusy(false);
      return;
    }
    const t = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const seq = ++runSeq.current;
      setBusy(true); setErr(null);
      void (async () => {
        try {
          const resolved = await resolveAdapter("wasm");
          if (seq !== runSeq.current) return;
          if (resolved.kind === "unavailable") {
            setErr(resolved.fallbackReason
              ?? "The real solver could not be loaded (build the WASM).");
            setBusy(false);
            return;
          }
          const result = await resolved.adapter.run(
            synthesizeExploreCase(spec), () => {}, ctrl.signal, "choupoProps");
          if (seq !== runSeq.current) return;
          const out = result.csvFiles?.[EXPLORE_OUTPUT];
          // Honesty: the tools show no log tab — lift the engine's advisory
          // lines off the run log so they are SEEN, never swallowed.
          setAdvisories(
            (result.log.match(/^\s*\[advisory\].*$/gm) ?? []).map((s) => s.trim()));
          if (out) { setCsv(out); setErr(null); }
          else {
            const detail = result.log.split("\n").map((l) => l.trim()).reverse()
              .find((l) => /(?:error|fatal|refused|failed)/i.test(l));
            setErr(result.status !== "done"
              ? `choupoProps did not finish${detail ? `: ${detail}` : "."}`
              : "No data — the engine returned an empty result for this construction.");
          }
        } catch (e) {
          if (seq === runSeq.current && !ctrl.signal.aborted)
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
          if (seq === runSeq.current) setBusy(false);
        }
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [spec]);
  return { csv, err, busy, advisories };
}

// ---- Workspace shell --------------------------------------------------------

export function MethodsWorkspace() {
  const [tool, setTool] = useState<MethodToolId>(bootTool);

  // Case-local components reach the runs exactly as in the Explorer: merged
  // into the name-lookup catalogue, and their .dat bodies shipped to MEMFS.
  const caseRaw = useStore((s) => s.caseFiles.rawFiles);
  const catalogue = useMemo(() => mergeCatalogue(caseRaw), [caseRaw]);
  const localUnifac = useMemo(() => buildLocalUnifac(caseRaw), [caseRaw]);
  const componentFiles = useMemo(() => caseComponentFiles(caseRaw), [caseRaw]);

  const active = METHOD_TOOLS.find((m) => m.id === tool) ?? METHOD_TOOLS[0]!;

  return (
    <Box style={{ position: "absolute", inset: 0, display: "flex", minHeight: 0 }}>
      {/* LEFT — the method-tool rail: the registry rendered as the roadmap.
          Planned entries stay visible but disabled (stated, not hidden). */}
      <Box style={{
        width: 252, flexShrink: 0, height: "100%", padding: 12, overflowY: "auto",
        borderRight: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
      }}>
        <Text size="xs" fw={700} c="dimmed" mb={6} style={{ letterSpacing: 0.5 }}>
          METHOD TOOLS
        </Text>
        <Stack gap={4}>
          {METHOD_TOOLS.map((m) => (
            <Tooltip key={m.id} withArrow multiline w={280} openDelay={400}
              label={m.status === "live" ? m.teaches : `${m.teaches}  (planned — ${m.fedBy ?? "engine feed pending"})`}>
              <Button
                variant={m.id === tool ? "light" : "subtle"}
                color={m.id === tool ? "accent" : "gray"}
                size="compact-sm"
                justify="space-between"
                fullWidth
                disabled={m.status === "planned"}
                onClick={() => { if (m.status === "live") setTool(m.id); }}
                rightSection={m.status === "planned"
                  ? <Badge size="xs" variant="outline" color="gray" tt="none">planned</Badge>
                  : undefined}
                styles={{ root: { fontWeight: m.id === tool ? 600 : 400 },
                  label: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }}
              >
                {m.label}
              </Button>
            </Tooltip>
          ))}
        </Stack>
        <Text size="xs" c="dimmed" mt={10} style={{ lineHeight: 1.4 }}>
          Classical method constructions over engine-computed curves.
          Property surfaces live in <b>Explore</b>; the split criterion:
          method-construction → Methods, property-surface → Explore.
        </Text>
      </Box>

      {/* RIGHT — the active tool's panel. */}
      <Box style={{ flex: 1, minWidth: 0, height: "100%", display: "flex",
        flexDirection: "column", overflow: "hidden" }}>
        {tool === "mccabe" ? (
          <McCabeTool tool={active} catalogue={catalogue}
            localUnifac={localUnifac} componentFiles={componentFiles} />
        ) : tool === "psychro" ? (
          <PsychroTool tool={active} catalogue={catalogue}
            componentFiles={componentFiles} />
        ) : (
          // The run-fed tools take no props, so the pedagogy line (teaches +
          // the Theory Guide link) is rendered HERE, once for all of them —
          // every tool states its theory destination or it is not finished.
          <>
            <TeachesLine tool={active} />
            <Suspense fallback={
              <Group justify="center" mt="xl"><Loader size="sm" /></Group>
            }>
              {tool === "kremser" ? <KremserTool />
                : tool === "entu" ? <EpsilonNtuTool />
                : tool === "pinch-composite" ? <PinchCompositeTool />
                : tool === "pump-system" ? <PumpSystemTool />
                : <BreakthroughTool />}
            </Suspense>
          </>
        )}
      </Box>
    </Box>
  );
}

// ---- Shared panel chrome ----------------------------------------------------

function ToolField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Group gap={4} wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
      <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>{label}</Text>
      {children}
    </Group>
  );
}

/** The one-line "what this construction teaches" caption + the tool's Theory
 *  Guide link — rendered directly under the toolbar so the pedagogy is stated
 *  before the plot. */
function TeachesLine({ tool }: { tool: MethodTool }) {
  return (
    <Group gap={6} wrap="nowrap" align="center" px={12} py={4}
      style={{ flexShrink: 0 }}>
      <Text size="xs" c="dimmed" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {tool.teaches}
      </Text>
      {tool.theory && (
        <Tooltip label="Open the matching section of the Theory Guide" withArrow>
          <ActionIcon component="a" href={theoryUrl(tool.theory)} target="_blank"
            rel="noopener noreferrer" variant="subtle" size="sm" color="gray"
            aria-label="open the Theory Guide">
            <IconBook size={14} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}

/** The authoring hand-off (unchanged from the Explorer — guard-rail 2): the
 *  tool EMITS the propsDict for the student / agent to author on disk.
 *  Dict-on-disk stays the source of truth; the workspace never writes it. */
function HandOffFooter({ spec, alerts }: { spec: ExploreSpec | null; alerts: React.ReactNode[] }) {
  const [open, setOpen] = useState(false);
  const snippet = useMemo(() => {
    if (!spec) return "(no run yet)";
    try { return serialize(fromJson(synthesizeExploreCase(spec).propsDict!)); }
    catch { return "(invalid spec)"; }
  }, [spec]);
  return (
    <Box style={{ flexShrink: 0, padding: "4px 12px 8px",
      borderTop: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}>
      {alerts.length > 0 && <Stack gap={6} mb={6}>{alerts}</Stack>}
      <Group gap="xs" wrap="nowrap" align="center">
        <Button variant="subtle" size="compact-xs" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide propsDict" : "Author → copy propsDict"}
        </Button>
      </Group>
      <Collapse in={open}>
        <Stack gap={4} mt={6}>
          <Text size="xs" c="dimmed">
            Create or open a case, then put this block in <code>system/propsDict</code> under
            <code> operations ( … )</code>; keep <code>constant/propertyDict</code> in sync with
            the components/models above, and <code>runCase</code>.
          </Text>
          <Group gap="xs">
            <CopyButton value={snippet}>
              {({ copied, copy }) => (
                <Button size="xs" variant={copied ? "filled" : "light"} color="accent" onClick={copy}>
                  {copied ? "Copied ✓" : "Copy propsDict"}
                </Button>
              )}
            </CopyButton>
          </Group>
          <Code block style={{ fontSize: 11, maxHeight: 200, overflow: "auto" }}>{snippet}</Code>
        </Stack>
      </Collapse>
    </Box>
  );
}

// ---- McCabe-Thiele ----------------------------------------------------------
// The SAME engine feed the Explorer's T-x-y uses (binaryVleSpec, kind mccabe):
// the equilibrium curve y*(x) arrives ALREADY COMPUTED by the engine; the R/q
// staircase in McCabePlot is pure geometry over it, zero re-solve.

function McCabeTool({ tool, catalogue, localUnifac, componentFiles }: {
  tool: MethodTool;
  catalogue: ComponentMeta[];
  localUnifac: LocalUnifac;
  componentFiles: Record<string, string>;
}) {
  const prefs = useStore((s) => s.displayPrefs);
  const Pu = prefs.pressure;
  const [compA, setCompA] = useState("benzene");
  const [compB, setCompB] = useState("toluene");
  const [activity, setActivity] = useState("NRTL");
  const [eos, setEos] = useState("idealGas");
  const [P, setP] = useState(101325);   // Pa, canonical SI
  const [nPts, setNPts] = useState(60);

  const vleNames = useMemo(
    () => catalogue.filter((m) => m.vleAble).map((m) => m.name).sort(),
    [catalogue]);

  // Honest DEFAULT model (same rule as the Explorer): a fitted-pair model with
  // NO curated pair silently collapses to ideal — when the pair has UNIFAC
  // groups instead, default to predictive UNIFAC.  Fires only on a component
  // change, so a manual model pick for the same pair is respected.
  useEffect(() => {
    const unifacAble = (c: string) =>
      (metaByName(c, catalogue)?.hasUnifac ?? false) || hasUnifacGroups(c, localUnifac);
    if (!unifacAble(compA) || !unifacAble(compB)) return;
    setActivity((prev) =>
      (prev === "NRTL" || prev === "Wilson") && !hasPair(prev, compA, compB) ? "UNIFAC" : prev);
  }, [compA, compB, catalogue, localUnifac]);

  const pairOk = compA !== compB && !!metaByName(compA, catalogue)?.vleAble
    && !!metaByName(compB, catalogue)?.vleAble;
  const spec = useMemo<ExploreSpec | null>(() => pairOk
    ? binaryVleSpec({
        pair: [compA, compB], catalogue, kind: "mccabe",
        activity, eos, P, n: nPts, localUnifac,
        componentFiles: Object.keys(componentFiles).length > 0 ? componentFiles : undefined,
      })
    : null,
  [pairOk, compA, compB, catalogue, activity, eos, P, nPts, localUnifac, componentFiles]);

  const { csv, err, busy, advisories } = useEngineCsv(spec);
  // The plot reads y_eq_<more volatile>: pass the pair in the SAME order the
  // spec ran it, so the curve lookup can never miss.
  const [vA, vB] = orderBinaryByVolatility([compA, compB], catalogue);
  const mccabeCsv = csv ? dropCsvColumn(csv, "liquid_stable") : null;

  // The Explorer's no-lie rule rides along: a fitted-pair model with no
  // curated pair is announced, never silently drawn as ideal.
  const idealLie = (activity === "NRTL" || activity === "Wilson") && pairOk
    && !hasPair(activity, compA, compB)
    ? `No curated ${activity} pair covers ${compA}–${compB}, so this diagram assumes IDEAL mixing — `
      + `it cannot show an azeotrope. Switch γ to UNIFAC (predictive, from the components' groups), `
      + `or curate a ${activity} pair for this system.`
    : null;

  const alerts: React.ReactNode[] = [];
  if (err) alerts.push(<Alert key="err" color="red" variant="light">{err}</Alert>);
  if (!pairOk) alerts.push(
    <Alert key="pair" color="yellow" variant="light" title="Pick a binary">
      McCabe-Thiele needs two DIFFERENT VLE-able compounds.
    </Alert>);
  if (idealLie) alerts.push(
    <Alert key="ideal" color="orange" variant="light"
      title="Assuming ideal mixing — not your real system">
      <Text size="xs">{idealLie}</Text>
    </Alert>);
  if (advisories.length > 0) alerts.push(
    <Alert key="adv" color="yellow" variant="light" title="Solver advisory">
      {advisories.map((a) => <Text key={a} size="xs">{a}</Text>)}
    </Alert>);

  return (
    <>
      <Box style={{
        flexShrink: 0, minHeight: 44, padding: "6px 12px", overflowX: "auto", overflowY: "hidden",
        borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
      }}>
        <Group gap="sm" wrap="nowrap" align="center" style={{ minWidth: "fit-content" }}>
          <ToolField label="light">
            <Select size="xs" searchable data={vleNames} value={compA}
              onChange={(v) => setCompA(v ?? compA)} w={140} allowDeselect={false} />
          </ToolField>
          <ToolField label="heavy">
            <Select size="xs" searchable data={vleNames} value={compB}
              onChange={(v) => setCompB(v ?? compB)} w={140} allowDeselect={false} />
          </ToolField>
          <ToolField label="γ">
            <Select size="xs" data={["ideal", "NRTL", "Wilson", "UNIFAC"]} value={activity}
              onChange={(v) => setActivity(v ?? "NRTL")} w={100} allowDeselect={false} />
          </ToolField>
          <ToolField label="EoS">
            <Select size="xs" data={["idealGas", "SRK", "PR"]} value={eos}
              onChange={(v) => setEos(v ?? "idealGas")} w={100} allowDeselect={false} />
          </ToolField>
          <ToolField label={`P (${pressureLabel(Pu)})`}>
            <NumberInput size="xs" value={paToDisplay(P, Pu)} w={90}
              onChange={(v) => {
                const n = typeof v === "number" ? v : parseFloat(v);
                if (Number.isFinite(n)) setP(parsePressure(n, Pu));
              }} />
          </ToolField>
          <ToolField label="points">
            <NumberInput size="xs" value={nPts} min={2} w={72}
              onChange={(v) => {
                const n = typeof v === "number" ? v : parseFloat(v);
                if (Number.isFinite(n)) setNPts(n);
              }} />
          </ToolField>
          {busy && (
            <Group gap={6} wrap="nowrap">
              <Loader size="xs" /><Text size="xs" c="dimmed">computing…</Text>
            </Group>
          )}
          <Box style={{ flex: 1, minWidth: 8 }} />
          {mccabeCsv && (
            <Tooltip label="Open the McCabe-Thiele analyzer full-window in a new tab" withArrow>
              <ActionIcon variant="subtle" size="md" color="accent"
                aria-label="pop out McCabe analyzer"
                onClick={() => popOutExploreMccabe({
                  csv: mccabeCsv, compA: vA, compB: vB, P, model: activity,
                })}>
                <IconExternalLink size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Box>
      <TeachesLine tool={tool} />
      <Box style={{ flex: 1, minWidth: 0, overflow: "hidden", padding: 12, position: "relative" }}>
        {mccabeCsv ? (
          <McCabePlot csv={mccabeCsv} compA={vA} compB={vB} P={P} allowWide />
        ) : (
          <Box style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {busy
              ? <Group gap={8}><Loader size="sm" /><Text size="sm" c="dimmed">computing the equilibrium curve…</Text></Group>
              : <Text size="sm" c="dimmed" ta="center" maw={460}>
                  The engine computes the real equilibrium curve y*(x) for the pair at P;
                  the staircase then re-walks in pure geometry as you turn R and q.
                </Text>}
          </Box>
        )}
      </Box>
      <HandOffFooter spec={spec} alerts={alerts} />
    </>
  );
}

// ---- Psychrometric chart ----------------------------------------------------
// The SAME engine feed the Explorer used (psychroSpec → the psychrometricChart
// engine op): carrier = lower-Tb of the pair, condensable = higher-Tb; the
// chart CSV arrives fully computed (saturation, RH, adiabatic-saturation and
// true wet-bulb via the Lewis number) and PsychroPlot only draws it.

function PsychroTool({ tool, catalogue, componentFiles }: {
  tool: MethodTool;
  catalogue: ComponentMeta[];
  componentFiles: Record<string, string>;
}) {
  const prefs = useStore((s) => s.displayPrefs);
  const Tu = prefs.temperature, Pu = prefs.pressure;
  const [carrier, setCarrier] = useState("N2");
  const [condensable, setCondensable] = useState("water");
  const [tFrom, setTFrom] = useState(290);    // K
  const [tTo, setTTo] = useState(380);        // K
  const [P, setP] = useState(101325);         // Pa
  const [rhFrom, setRhFrom] = useState(10);
  const [rhTo, setRhTo] = useState(90);
  const [rhStep, setRhStep] = useState(20);
  const [wbStep, setWbStep] = useState(10);   // °C between saturation anchor lines
  const [yMax, setYMax] = useState(0);        // kg/kg cap; 0 = auto

  const carrierNames = useMemo(
    () => catalogue.filter((m) => m.isPermanentGas).map((m) => m.name).sort(),
    [catalogue]);
  const condensableNames = useMemo(
    () => catalogue.filter((m) => m.vleAble && !m.isPermanentGas).map((m) => m.name).sort(),
    [catalogue]);

  const pairOk = carrier !== condensable
    && !!metaByName(carrier, catalogue) && !!metaByName(condensable, catalogue);
  const spec = useMemo<ExploreSpec | null>(() => pairOk
    ? psychroSpec({
        pair: [carrier, condensable], catalogue, P,
        TminK: tFrom, TmaxK: tTo, gridN: 60,
        rhFrom, rhTo, rhStep, wbStepC: wbStep,
        componentFiles: Object.keys(componentFiles).length > 0 ? componentFiles : undefined,
      })
    : null,
  [pairOk, carrier, condensable, catalogue, P, tFrom, tTo, rhFrom, rhTo, rhStep, wbStep, componentFiles]);

  const { csv, err, busy, advisories } = useEngineCsv(spec);

  const alerts: React.ReactNode[] = [];
  if (err) alerts.push(<Alert key="err" color="red" variant="light">{err}</Alert>);
  if (!pairOk) alerts.push(
    <Alert key="pair" color="yellow" variant="light" title="Pick a humid-gas pair">
      The chart needs a carrier gas plus a DIFFERENT condensable with a vapour-pressure model.
    </Alert>);
  if (advisories.length > 0) alerts.push(
    <Alert key="adv" color="yellow" variant="light" title="Solver advisory">
      {advisories.map((a) => <Text key={a} size="xs">{a}</Text>)}
    </Alert>);

  const num = (v: number | string, fallback: number) => {
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <>
      <Box style={{
        flexShrink: 0, minHeight: 44, padding: "6px 12px", overflowX: "auto", overflowY: "hidden",
        borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
      }}>
        <Group gap="sm" wrap="nowrap" align="center" style={{ minWidth: "fit-content" }}>
          <ToolField label="carrier">
            <Select size="xs" searchable data={carrierNames} value={carrier}
              onChange={(v) => setCarrier(v ?? carrier)} w={110} allowDeselect={false} />
          </ToolField>
          <ToolField label="condensable">
            <Select size="xs" searchable data={condensableNames} value={condensable}
              onChange={(v) => setCondensable(v ?? condensable)} w={130} allowDeselect={false} />
          </ToolField>
          <ToolField label={`T from (${temperatureLabel(Tu)})`}>
            <NumberInput size="xs" value={Number(kToDisplay(tFrom, Tu).toFixed(1))} w={84} step={5}
              onChange={(v) => setTFrom(parseTemperature(num(v, kToDisplay(tFrom, Tu)), Tu))} />
          </ToolField>
          <ToolField label={`to (${temperatureLabel(Tu)})`}>
            <NumberInput size="xs" value={Number(kToDisplay(tTo, Tu).toFixed(1))} w={84} step={5}
              onChange={(v) => setTTo(parseTemperature(num(v, kToDisplay(tTo, Tu)), Tu))} />
          </ToolField>
          <ToolField label={`P (${pressureLabel(Pu)})`}>
            <NumberInput size="xs" value={paToDisplay(P, Pu)} w={90}
              onChange={(v) => setP(parsePressure(num(v, paToDisplay(P, Pu)), Pu))} />
          </ToolField>
          <ToolField label="RH % from/to/step">
            <Group gap={4} wrap="nowrap">
              <NumberInput size="xs" value={rhFrom} min={0} max={99} w={62}
                onChange={(v) => setRhFrom(num(v, rhFrom))} />
              <NumberInput size="xs" value={rhTo} min={1} max={99} w={62}
                onChange={(v) => setRhTo(num(v, rhTo))} />
              <NumberInput size="xs" value={rhStep} min={1} max={50} w={62}
                onChange={(v) => setRhStep(num(v, rhStep))} />
            </Group>
          </ToolField>
          <ToolField label="ΔT sat (°C)">
            <NumberInput size="xs" value={wbStep} min={5} max={50} step={5} w={68}
              onChange={(v) => setWbStep(num(v, wbStep))} />
          </ToolField>
          <ToolField label="Y max (0=auto)">
            <NumberInput size="xs" value={yMax} min={0} step={0.05} decimalScale={3} w={80}
              onChange={(v) => setYMax(num(v, yMax))} />
          </ToolField>
          {busy && (
            <Group gap={6} wrap="nowrap">
              <Loader size="xs" /><Text size="xs" c="dimmed">computing…</Text>
            </Group>
          )}
        </Group>
      </Box>
      <TeachesLine tool={tool} />
      <Box style={{ flex: 1, minWidth: 0, overflow: "hidden", padding: 12, position: "relative" }}>
        {csv ? (
          <PsychroPlot csv={csv} yMax={yMax} />
        ) : (
          <Box style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {busy
              ? <Group gap={8}><Loader size="sm" /><Text size="sm" c="dimmed">computing the chart…</Text></Group>
              : <Text size="sm" c="dimmed" ta="center" maw={460}>
                  Psychrometric chart at P — humidity ratio Y vs dry-bulb T for
                  the carrier + condensable pair, fully computed by the engine.
                </Text>}
          </Box>
        )}
      </Box>
      <HandOffFooter spec={spec} alerts={alerts} />
    </>
  );
}
