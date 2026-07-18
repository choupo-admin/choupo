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
  Right-side property panel.  Read-only: in Choupo the dict files on
  disk are the single source of truth.
  Edit them with your text editor (Emacs/vim/VSCode), reload the case
  from the menu, and the canvas + plots will reflect the change.

  Three blocks per unit, in this order:

    1. Header:  unit name + type badge + (when applicable) a small
                "N required fields unset" alert.
    2. Operation: schema-driven rows -- friendly title, raw dict key
                  underneath, prose description always visible, value
                  rendered in the user's preferred display unit when
                  the schema declares a known unit (K / Pa / kmol/s).
    3. Latest results: per-unit KPIs from the last solver run (yield,
                       supersaturation, Q_removed,...) -- the
                       "select unit, see what came out".

  Streams keep their simple conditions + composition block, with a
  small progress bar on each composition row as a visual cue.
\*---------------------------------------------------------------------------*/

import {
  ActionIcon,
  Anchor,
  Alert,
  Badge,
  Group,
  NumberInput,
  Progress,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconExternalLink, IconInfoCircle, IconX } from "@tabler/icons-react";

import { popOutFileHtml } from "./filePopOut.js";
import { classifyPhase, PHASE_LABEL } from "./plotting/palette.js";
import { findRunStream, popOutSingleStream } from "./streamPopOut.js";
import { HeatExchangerDatasheet } from "./HeatExchangerDatasheet.js";
import { theoryLink } from "../case/modelDocs.js";
import { useMemo, useState } from "react";

import { boundaryForStream } from "../case/modelBoundary.js";
import { compositeMembers, unitFolderNames, streamStateSpec, zeroStateText, topologyFeedNames } from "../case/toGraph.js";
import {
  operationSchemaFor,
  type OperationField,
  type OperationSchema,
} from "../case/operationSchemas.js";
import type { StreamSpec, UnitSpec } from "../case/types.js";
import type { JsonDict, JsonValue } from "../dict/index.js";
import { parse, toJson } from "../dict/index.js";
import { parseScalarString } from "../dict/json.js";
import { lookupUnit, affineToK } from "../dict/units.js";

/** A flowsheetDict scalar can cross to JSON as a unit-bearing STRING
 *  ("380 K", "3 bar") rather than a canonical-SI number -- json.ts keeps the
 *  unit so the engine's units-mandatory readers are satisfied.  The panel
 *  assumes SI when it formats, so convert here; plain numbers pass through.
 *  (Without this, the feed's T/P render as 0 -- the bug Vitor spotted.) */
function scalarToSI(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  const p = parseScalarString(v);
  if (!p) { const n = Number(v); return Number.isFinite(n) ? n : NaN; }
  if (!p.unit) return p.value;
  const u = lookupUnit(p.unit);
  if (!u) return p.value;
  return u.affine ? affineToK(p.value, p.unit) : p.value * u.factor;
}
import {
  flowBasis,
  formatFlow,
  formatPressure,
  formatSig,
  formatTemperature,
  temperatureLabel,
  type DisplayPrefs,
} from "../state/displayUnits.js";
import { useStore } from "../state/store.js";

// Normalise a raw flowsheetDict stream into the StreamSpec the panel reads --
// mirrors toGraph.readFlowsheet: composition from molarComposition /
// massComposition / composition (else derived from molarFlows / massFlows).
export function normaliseStreamSpec(v: JsonDict): StreamSpec {
  const explicit =
    (v["molarComposition"] as { [k: string]: number } | undefined) ??
    (v["massComposition"]  as { [k: string]: number } | undefined) ??
    (v["composition"]      as { [k: string]: number } | undefined);
  const molarFlows = v["molarFlows"] as { [k: string]: number } | undefined;
  const massFlows  = v["massFlows"]  as { [k: string]: number } | undefined;
  // A stream scalar can arrive as a number OR a unit-bearing string ("900 K",
  // "35 bar", "9800 kg/h"); scalarToSI handles both. Earlier this zeroed any
  // string value (`: 0`), so the panel showed feed T/P = 0 (the bug Vitor hit).
  const si0 = (x: unknown): number => {
    const s = scalarToSI(x);
    return Number.isFinite(s) ? s : 0;
  };
  let comp: { [k: string]: number } = explicit ?? {};
  let F = scalarToSI(v["F"]);            // finite if F was given (number or unit-string)
  if (!Number.isFinite(F) && (molarFlows || massFlows)) {
    const flows = (molarFlows ?? massFlows)!;
    F = Object.values(flows).reduce((s, x) => s + x, 0);
    if (F > 0 && Object.keys(comp).length === 0)
      comp = Object.fromEntries(Object.entries(flows).map(([k, x]) => [k, x / F]));
  }
  if (!Number.isFinite(F)) F = 0;
  return {
    F,
    T: si0(v["T"]),
    P: si0(v["P"]),
    composition: comp,
  } as StreamSpec;
}

export function PropertyPanel() {
  const selectedId = useStore((s) => s.selectedNodeId);
  const flowsheet = useStore((s) => s.caseFiles.flowsheet);
  const propsDict = useStore((s) => s.caseFiles.propsDict);
  const caseFiles = useStore((s) => s.caseFiles);
  const runKpis = useStore((s) => s.runResult?.kpis);

  const content = useMemo(() => {
    if (!selectedId) return null;
    if (selectedId.startsWith("unit:") && flowsheet) {
      const name = selectedId.slice(5);
      const units = (flowsheet["units"] ?? []) as JsonDict[];
      const u = units.find((x) => x["name"] === name) as UnitSpec | undefined;
      if (u) return <UnitDetails unit={u} kpis={runKpis?.[name]} />;
      // Composite flowsheet: no `units`, only `children` (sectors).
      // React Flow still emits unit:<sector> ids for the sector nodes,
      // so we end up here.  Show the sector's file listing instead.
      const children = compositeMembers(flowsheet);
      if (children.includes(name)) {
        // A child is EITHER a leaf UNIT OP (its own dignified folder, `type ...`)
        // or a composite SECTOR (`children ( ... )`).  A leaf is NOT a "fractal
        // sub-flowsheet" -- it is one unit op that happens to carry its own
        // folder, so show it as a UNIT (operation + KPIs), not as a sector.
        const childText = caseFiles.rawFiles?.[`${name}/system/flowsheetDict`]
                       ?? caseFiles.rawFiles?.[`${name}/flowsheetDict`];
        if (childText) {
          try {
            const cd = toJson(parse(childText, { sourceName: name })) as JsonDict;
            if (typeof cd["type"] === "string" && !Array.isArray(cd["sectors"]) && unitFolderNames(cd).length === 0) {
              const leaf: UnitSpec = {
                name,
                type: String(cd["type"]),
                in: [], outputs: [],
                operation: (cd["operation"] ?? {}) as JsonDict,
              };
              return <UnitDetails unit={leaf} kpis={runKpis?.[name]} />;
            }
          } catch { /* unparseable -> fall through to the sector view */ }
        }
        return <FolderDetails name={name} kind="sector"
          files={listFilesUnder(caseFiles, name)} />;
      }
      // FLAT single-unit (leaf) form: type/operation/boundary at the top level,
      // no `units` array -- so the loop above found nothing.  Synthesize the
      // UnitSpec the SAME way toGraph's readLeaf does (name defaults to "unit"),
      // so the unit panel (with its Theory link + KPIs) shows for single-unit
      // tutorials too.  Its KPIs may be emitted under a solver name (not the
      // view name), so fall back to the sole entry when there is exactly one.
      if (flowsheet["type"] && name === String(flowsheet["name"] ?? "unit")) {
        const boundary = (flowsheet["boundary"] ?? {}) as JsonDict;
        const leaf: UnitSpec = {
          name,
          type: String(flowsheet["type"]),
          in: (boundary["inlets"] ?? []) as string[],
          outputs: (boundary["outlets"] ?? []) as string[],
          operation: (flowsheet["operation"] ?? {}) as JsonDict,
        };
        const kEntries = runKpis ? Object.values(runKpis) : [];
        const kpis = runKpis?.[name]
          ?? (kEntries.length === 1 ? kEntries[0] : undefined);
        return <UnitDetails unit={leaf} kpis={kpis} />;
      }
      return null;
    }
    if (selectedId.startsWith("stream:") && flowsheet) {
      const name = selectedId.slice(7);
      // A stream's authored state lives in its 0/ file -- the same source the
      // canvas uses -- so the panel shows values pre-run instead of a bogus
      // "no values until a run completes".
      const s = streamStateSpec(zeroStateText(
        { ...(caseFiles.rawFiles ?? {}), ...(caseFiles.extraFiles ?? {}) },
        name)) ?? undefined;
      return <StreamDetails name={name} stream={s} runName={name} />;
    }
    if (selectedId.startsWith("op:") && propsDict) {
      const name = selectedId.slice(3);
      const ops = (propsDict["operations"] ?? []) as JsonDict[];
      const op = ops.find((x) => x["name"] === name);
      if (!op) return null;
      return <OpDetails op={op} />;
    }
    // CaseTree selections (file: / folder: / sector:) — show raw text
    // for files (the original dict source with comments, since that is
    // what the student edits), or a listing for folders/sectors.
    if (selectedId.startsWith("file:")) {
      const rel = selectedId.slice(5);
      const raw = caseFiles.rawFiles?.[rel];
      return <FileDetails rel={rel} raw={raw} />;
    }
    if (selectedId.startsWith("folder:") || selectedId.startsWith("sector:")) {
      const isFolder = selectedId.startsWith("folder:");
      const name = selectedId.slice(isFolder ? 7 : 7);
      const files = listFilesUnder(caseFiles, isFolder ? name : name);
      return <FolderDetails name={name} kind={isFolder ? "folder" : "sector"}
                            files={files} />;
    }
    return null;
  }, [selectedId, flowsheet, propsDict, caseFiles, runKpis]);

  const isProps = !!propsDict;
  return (
    <ScrollArea h="100%" type="hover">
      <Stack gap="sm" p="md">
        <Group gap="xs">
          <IconInfoCircle size={16} />
          <Title order={5}>
            {content ? "Properties" : "Thermo package"}
          </Title>
        </Group>
        {content ?? (
          // Nothing selected → don't show an empty "click somewhere" placeholder.
          // Instead, surface the thermoPackage summary so the student SEES
          // the thermo layer at all times (ParaView principle: property
          // package is first-class, not buried behind a tab).  See
          // docs/ai/gui-mental-model.md.
          <ThermoSummaryInline />
        )}
        {content && (
          // The card is read-only in EVERY case (Vítor's ruling 2026-06-12):
          // the what-if lives in the unit's internals page, never here.
          <Text size="xs" c="dimmed" mt="md">
            {isProps ? (
              <>Read-only.  Edit <code>system/propsDict</code> in your text
              editor and reload the case.</>
            ) : (
              <>Read-only — double-click the unit for its internals +
              what-if; the case itself is edited
              in <code>system/flowsheetDict</code>.</>
            )}
          </Text>
        )}
        {!content && (
          <Text size="xs" c="dimmed" mt="md">
            Click a unit / stream on the canvas, or a file in the case tree
            on the left, to inspect it here.
          </Text>
        )}
      </Stack>
    </ScrollArea>
  );
}

// Property operation (choupoProps): the same schema-driven SchemaSection as
// a flowsheet unit, plus the operation name + type header.  No KPIs section
// -- property ops emit either to the log (propertyPoint) or to a CSV
// (propertyScan*, fitParameters), both surfaced elsewhere in the GUI.
function OpDetails({ op }: { op: JsonDict }) {
  const name = String(op["name"] ?? "—");
  const type = String(op["type"] ?? "?");
  const schema = operationSchemaFor(type);
  // The operation block of a property op is the WHOLE dict minus a few
  // reserved keys (name, type).  We feed it to SchemaSection so the schema
  // can describe its expected fields.
  const operation: JsonDict = {};
  for (const [k, v] of Object.entries(op)) {
    if (k === "name" || k === "type") continue;
    operation[k] = v;
  }
  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          Operation
        </Text>
        <Group justify="space-between">
          <Text fw={600}>{name}</Text>
          <Badge color="accent" variant="light" size="sm" radius="sm" tt="none">
            {type}
          </Badge>
        </Group>
      </Stack>
      {schema ? (
        // A choupoProps operation is not a flowsheet unit (no units[] index);
        // -1 makes every field read-only (tinkering is a flowsheet affordance).
        <SchemaSection schema={schema} values={operation} unitIndex={-1} />
      ) : (
        <KeyValueTable
          title="Block"
          rows={Object.entries(operation).map(([k, v]) => ({
            k,
            v: stringifyValue(v),
          }))}
        />
      )}
    </Stack>
  );
}

function UnitDetails({
  unit,
  kpis,
}: {
  unit: UnitSpec;
  kpis: { [k: string]: number } | undefined;
}) {
  // The unit's index in flowsheet.units -- the address the scratch overlay +
  // the engine's setScalarAtPath speak ("units[2].operation.refluxRatio").
  const unitIndex = useStore((s) => {
    const us = (s.caseFiles.flowsheet?.["units"] ?? []) as JsonDict[];
    return us.findIndex((u) => u["name"] === unit.name);
  });
  const schema = operationSchemaFor(unit.type);
  // A unit may legitimately carry NO `operation` block (a mixer has no
  // knobs; a flash separator inherits T,P).  The dict then omits the key,
  // so `unit.operation` is undefined here --- default to {} so the schema
  // rows still render (all "unset") instead of crashing on `op[f.key]`.
  const operation = unit.operation ?? {};
  // A heatExchanger in `model geometry;` or `model design;` COMPUTES U and the
  // area (from the bundle) -- they are RESULTS, not inputs -- so the eps-NTU
  // schema's "area / U required" must not fire there (it is the epsNTU-mode
  // contract only).
  const hxComputed = unit.type === "heatExchanger"
    && (unit.model === "geometry" || unit.model === "design");
  const missingRequired = schema
    ? schema.fields.filter((f) => f.required && operation[f.key] === undefined
        && !(hxComputed && (f.key === "area" || f.key === "U")))
  : [];
  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          Unit
        </Text>
        <Group justify="space-between">
          <Text fw={600}>{unit.name}</Text>
          <Badge color="accent" variant="light" size="sm" radius="sm" tt="none">
            {unit.type}
          </Badge>
        </Group>
        {unit.type && (
          <Anchor href={theoryLink(unit.type)} target="_blank" rel="noopener"
            c="accent.4" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <IconExternalLink size={13} />
            <Text size="xs">Theory — the section deriving this unit</Text>
          </Anchor>
        )}
      </Stack>

      {unit.type === "heatExchanger" && kpis && (
        <HeatExchangerDatasheet unit={unit} kpis={kpis} />
      )}

      {missingRequired.length > 0 && (
        <Alert
          color="yellow"
          variant="light"
          icon={<IconAlertTriangle size={14} />}
          p="xs"
        >
          <Text size="xs">
            {missingRequired.length === 1
              ? "1 required field unset:"
            : `${missingRequired.length} required fields unset:`}{" "}
            {missingRequired.map((f) => f.title).join(", ")}
          </Text>
        </Alert>
      )}

      <KeyValueTable
        title="Connections"
        rows={[
          // A unit declares its feeds as `in` (single) OR `inputs` (list);
          // read whichever the dict used so multi-input units (mixer, HX)
          // show their feeds instead of a blank.
          { k: "in", v: formatList((unit.in ?? unit.inputs) as string | string[] | undefined) },
          { k: "outputs", v: formatList(unit.outputs) },
...(unit.reaction ? [{ k: "reaction", v: unit.reaction }] : []),
        ]}
      />

      {schema ? (
        <SchemaSection
          schema={schema}
          values={operation}
          unitIndex={unitIndex}
        />
      ) : (
        <KeyValueTable
          title="Operation"
          rows={Object.entries(operation).map(([k, v]) => ({
            k,
            v: stringifyValue(v),
          }))}
        />
      )}

      {kpis && Object.keys(kpis).length > 0 && (
        <KpisSection kpis={kpis} />
      )}
    </Stack>
  );
}

function StreamDetails({
  name,
  stream,
  runName,
}: {
  name: string;
  stream: StreamSpec | undefined;
  /** When set, also look up `runResult.streams` for a post-run snapshot.
   *  Used when the stream is selected by clicking an internal edge (a
   *  unit->unit stream, e.g. a recycle) -- such streams are NEVER in
   *  the flowsheet's top-level `streams` block. */
  runName?: string;
}) {
  // After a Run, runResult.streams carries values for every stream the
  // solver touched (including internal/recycle).  Prefer it when the
  // flowsheet has nothing for this name -- this is the ONLY way the
  // panel can show an internal stream.
  // Use the shared lookup helper that tolerates the slash/dot naming
  // discrepancy between flowsheetDict connections and solver JSON.
  const runStream = useStore((s) =>
    runName ? findRunStream(s.runResult?.streams, runName) : undefined,
  );
  // A stream is TINKERABLE (transient, never written) when it is a topology
  // FEED with an authored 0/ state file: the scratch edit patches the 0/
  // projection for the run.  Internal/computed streams are read-only.  The
  // path the scratch overlay addresses stays streams.<name>.<k>.
  const rawStream = useStore((s) => {
    const fs = s.caseFiles.flowsheet;
    if (!fs || !topologyFeedNames(fs).includes(name)) return undefined;
    const spec = streamStateSpec(zeroStateText(
      { ...(s.caseFiles.rawFiles ?? {}), ...(s.caseFiles.extraFiles ?? {}) },
      name));
    return spec ? { F: spec.F, T: spec.T, P: spec.P } as JsonDict : undefined;
  });
  const prefs = useStore((s) => s.displayPrefs);
  // Model-boundary audit entry for this stream (producer/consumer on
  // different thermo models): shown as one row so the audit is visible at
  // the stream it names, not only in the summary band.
  const boundary = useStore((s) =>
    boundaryForStream(s.runResult?.modelBoundaries, runName ?? name),
  );
  if (!stream && runStream) {
    // Wrap the StreamResult into the same view shape so the rest of the
    // function doesn't care where the numbers came from.
    stream = {
      F: runStream.F,
      T: runStream.T,
      P: runStream.P,
      composition: runStream.composition,
    } as StreamSpec;
  }
  if (!stream) {
    // Stream selected but no values yet (internal stream, pre-Run).
    // Still expose the ↗ pop-out for consistency with the post-Run state
    // — the pop-out tab itself handles missing data.
    return (
      <Stack gap={4}>
        <Group justify="space-between" align="center" wrap="nowrap">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            Stream
          </Text>
          <Tooltip
            label="Open this stream's details in a new browser tab (will show 'not computed yet' until Run)"
            withArrow position="left" multiline w={260}
          >
            <ActionIcon size="sm" variant="subtle" color="cyan"
              onClick={() => popOutSingleStream({ name, prefs })}>
              <IconExternalLink size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Text fw={600}>{name}</Text>
        <Text size="sm" c="dimmed">
          Computed by the solver — no values until a run completes.
        </Text>
      </Stack>
    );
  }
  // Stream values come from the flowsheetDict already converted to
  // canonical SI (kmol/s, K, Pa) by the dict parser.  Honour the
  // TopBar Units menu so the panel reads in whatever the student
  // picked, not a hardcoded "bar".
  const massBasis = flowBasis(prefs.flow) === "mass";
  // Flow display: never leak raw SI kmol/s or apologise.  On a mass basis
  // we need the per-stream mass flow (kg/s SI) which only exists AFTER a
  // run (runStream.F_mass); before that, show the authored MOLAR flow in
  // kmol/h honestly rather than an "(needs solver run)" excuse.
  const flowStr = massBasis
    ? (runStream?.F_mass !== undefined
        ? `${formatFlow(runStream.F_mass, prefs.flow)} ${prefs.flow}`
      : `${formatFlow(scalarToSI(stream.F), "kmol/h")} kmol/h`)
  : `${formatFlow(scalarToSI(stream.F), prefs.flow)} ${prefs.flow}`;
  // Phase: the feed's vapour fraction is a COMPUTED result (Duhem: T,P,z
  // fix it).  Show it post-run so the panel backs the node's TWO-PHASE
  // tag with the number, instead of being less informative than the tag.
  // The phase WORD comes from the canonical classifier (plotting/palette),
  // the same rule that colours the canvas edge -- so the card text can
  // never contradict the semantic stroke colour (incl. solids/slurry).
  const vf = runStream?.vf;
  // composition may be missing on solid-only streams or on streams a
  // user defined incompletely in flowsheetDict --- default to {} to
  // avoid crashing the whole panel (which would propagate to the
  // ErrorBoundary in App.tsx).
  const composition = Object.entries(stream.composition ?? {}).sort(
    (a, b) => Number(b[1]) - Number(a[1]),
  );
  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Group justify="space-between" align="center" wrap="nowrap">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {runStream ? `${runStream.role} stream` : "Feed stream"}
          </Text>
          <Tooltip
            label="Open this stream's details in a new browser tab"
            withArrow position="left"
          >
            <ActionIcon size="sm" variant="subtle" color="cyan"
              onClick={() => popOutSingleStream({
                name,
                role: runStream?.role,
                F: stream!.F, T: stream!.T, P: stream!.P,
                composition: stream!.composition,
                prefs,
                runStream,
              })}>
              <IconExternalLink size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Text fw={600}>{name}</Text>
      </Stack>
      {rawStream ? (
        // A declared feed: F/T/P are tinkerable (only scalar fields the dict
        // authored; a flow given as molarFlows/massFlows is not a single
        // scalar, so it stays read-only).  vf is always a computed read-out.
        <Stack gap={6}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Conditions</Text>
          <Table withRowBorders={false} striped="even" verticalSpacing={6}>
            <Table.Tbody>
              {(["F", "T", "P"] as const).map((k) => {
                const raw = rawStream[k];
                const tinkerable = typeof raw === "number" || (typeof raw === "string" && parseScalarString(raw) !== null);
                const readOnly =
                  k === "F" ? flowStr
                  : k === "T" ? `${formatTemperature(scalarToSI(stream!.T), prefs.temperature)} ${temperatureLabel(prefs.temperature)}`
                  : `${formatPressure(scalarToSI(stream!.P), prefs.pressure)} ${prefs.pressure}`;
                return (
                  <Table.Tr key={k}>
                    <Table.Td style={{ width: "30%" }}>
                      <Text size="sm" ff="monospace">{k}</Text>
                    </Table.Td>
                    <Table.Td>
                      {tinkerable
                        ? <ScratchField path={`streams.${name}.${k}`} raw={raw} label={`${name}.${k}`} />
                        : <Text size="sm" ff="monospace">{readOnly}</Text>}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
              {runStream && vf !== undefined && (
                <Table.Tr>
                  <Table.Td><Text size="sm" ff="monospace">vf</Text></Table.Td>
                  <Table.Td>
                    <Text size="sm" ff="monospace">
                      {formatSig(vf)}  ({PHASE_LABEL[classifyPhase(runStream)]})
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {runStream?.H !== undefined && (
                <Table.Tr>
                  <Table.Td><Text size="sm" ff="monospace">H</Text></Table.Td>
                  <Table.Td><Text size="sm" ff="monospace">{(runStream.H / 1000).toFixed(2)} kJ/mol</Text></Table.Td>
                </Table.Tr>
              )}
              {runStream?.H_kW !== undefined && (
                <Table.Tr>
                  <Table.Td><Text size="sm" ff="monospace">Ḣ</Text></Table.Td>
                  <Table.Td><Text size="sm" ff="monospace">{formatSig(runStream.H_kW)} kW</Text></Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Stack>
      ) : (
        <KeyValueTable
          title="Conditions"
          rows={[
            { k: "F", v: flowStr },
            {
              k: "T",
              v: `${formatTemperature(scalarToSI(stream.T), prefs.temperature)} ${temperatureLabel(prefs.temperature)}`,
            },
            {
              k: "P",
              v: `${formatPressure(scalarToSI(stream.P), prefs.pressure)} ${prefs.pressure}`,
            },
            ...(runStream && vf !== undefined
              ? [{ k: "vf", v: `${formatSig(vf)}  (${PHASE_LABEL[classifyPhase(runStream)]})` }]
              : []),
            // Stream enthalpy at the elements/formation datum: H specific
            // [kJ/mol] and the flow rate Ḣ = F·H [kW] the energy balance reads.
            ...(runStream?.H !== undefined
              ? [{ k: "H", v: `${(runStream.H / 1000).toFixed(2)} kJ/mol` }]
              : []),
            ...(runStream?.H_kW !== undefined
              ? [{ k: "Ḣ", v: `${formatSig(runStream.H_kW)} kW` }]
              : []),
          ]}
        />
      )}
      {boundary && (
        <Text size="xs" ff="monospace" c={boundary.refused ? "yellow.7" : "dimmed"}>
          {boundary.refused
            ? <>model boundary {boundary.producer}→{boundary.consumer}: ΔH not carried across
                {" "}— {boundary.reason ?? "the two models share no common enthalpy reference here"}</>
            : <>model boundary {boundary.producer}→{boundary.consumer}: ΔH{" "}
                {boundary.dH_kJ_per_mol?.toFixed(3) ?? "—"} kJ/mol
                {" "}({boundary.dH_kW?.toFixed(2) ?? "—"} kW), implied ΔT{" "}
                {boundary.implied_dT_K?.toFixed(2) ?? "—"} K</>}
        </Text>
      )}
      <Stack gap={6}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          Composition (mole fraction)
        </Text>
        <Stack gap={4}>
          {composition.map(([k, v]) => {
            const num = Number(v);
            return (
              <Group key={k} gap="sm" wrap="nowrap" align="center">
                <Text size="xs" ff="monospace" style={{ minWidth: 72 }}>
                  {k}
                </Text>
                <Progress
                  value={isFinite(num) ? num * 100 : 0}
                  color="accent"
                  size="sm"
                  style={{ flex: 1 }}
                />
                <Text size="xs" ff="monospace" c="dimmed" style={{ minWidth: 56, textAlign: "right" }}>
                  {isFinite(num) ? num.toFixed(4) : String(v)}
                </Text>
              </Group>
            );
          })}
        </Stack>
      </Stack>
    </Stack>
  );
}

function SchemaSection({
  schema,
  values,
  unitIndex,
}: {
  schema: OperationSchema;
  values: JsonDict;
  unitIndex: number;
}) {
  const prefs = useStore((s) => s.displayPrefs);
  return (
    <Stack gap={6}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        Operation
      </Text>
      {schema.description && (
        <Text size="xs" c="dimmed" style={{ lineHeight: 1.45 }}>
          {schema.description}
        </Text>
      )}
      <Table withRowBorders={false} striped="even" verticalSpacing={6}>
        <Table.Tbody>
          {schema.fields.map((f) => (
            <SchemaRow
              key={f.key}
              field={f}
              value={values[f.key]}
              prefs={prefs}
              unitIndex={unitIndex}
            />
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function SchemaRow({
  field,
  value,
  prefs,
  unitIndex,
}: {
  field: OperationField;
  value: JsonValue | undefined;
  prefs: DisplayPrefs;
  unitIndex: number;
}) {
  const flowVars = useStore(
    (s) => (s.caseFiles.flowsheet as { variables?: JsonDict } | undefined)?.variables);
  const computed = useStore((s) => s.runResult?.computed);
  const missing = value === undefined;
  const { displayValue, displayUnit } = renderFieldValue(field, value, prefs);

  // A $ref resolves (read-only) to the variable's value so the student never
  // sees a dead "$W_turb" token: prefer the solved value (this run), else the
  // declared scalar, rendered through the field's unit; the "$name" marker is
  // kept so the link to the variables{} block stays visible.
  let refResolved: string | null = null;
  if (typeof value === "string" && value.startsWith("$")) {
    const rn = value.slice(1);
    const solved = computed?.[rn];
    const declared = flowVars?.[rn];
    const si = typeof solved === "number" ? solved
      : typeof declared === "number" ? declared : undefined;
    if (si !== undefined) {
      refResolved = renderFieldValue(field, si, prefs).displayValue;
    }
  }

  const isReference = typeof value === "string" && value.startsWith("$");
  // TINKERING (Vítor 2026-06-21, overruling the 2026-06-12 read-only ruling):
  // a CONTINUOUS operation scalar may be grabbed and changed directly here --
  // transient, never written to disk (see ScratchField + the scratch overlay).
  // NOT editable: a $ref (it belongs to variables{}); an INTEGER field
  // (nStages/feedStage are STRUCTURAL -- they reallocate the MESH, not a value
  // perturbation, so they stay display-only this slice); a missing field.
  const editable = !missing && !isReference && !field.integer && unitIndex >= 0;
  const scratchPath = `units[${unitIndex}].operation.${field.key}`;

  return (
    <Table.Tr>
      <Table.Td style={{ width: "55%", verticalAlign: "top" }}>
        <Stack gap={1}>
          <Group gap={4} wrap="nowrap" align="baseline">
            <Text size="sm" fw={500} c={missing && field.required ? "yellow.4" : undefined}>
              {field.title}
              {missing && field.required ? " *" : ""}
            </Text>
            {displayUnit && (
              <Text size="xs" c="dimmed">
                [{displayUnit}]
              </Text>
            )}
          </Group>
          <Text size="10px" ff="monospace" c="dimmed">
            {field.key}
          </Text>
          {field.description && (
            <Text size="xs" c="dimmed" style={{ lineHeight: 1.4 }}>
              {field.description}
            </Text>
          )}
        </Stack>
      </Table.Td>
      <Table.Td style={{ verticalAlign: "top" }}>
        {missing ? (
          <Text size="sm" ff="monospace" c="dimmed">
            {field.default !== undefined ? `(default ${field.default})` : "—"}
          </Text>
        ) : isReference ? (
          <Group gap={6} wrap="nowrap" align="baseline">
            <Text size="sm" ff="monospace">{refResolved ?? "—"}</Text>
            <Tooltip
              label="This value comes from the case's variables{} block. See the Variables workspace."
              withArrow position="left" multiline w={240}
            >
              <Text size="11px" ff="monospace" c="grape.4" style={{ cursor: "help" }}>
                {value as string}
              </Text>
            </Tooltip>
          </Group>
        ) : editable ? (
          <ScratchField path={scratchPath} raw={value} label={field.key} />
        ) : (
          <Text size="sm" ff="monospace">{displayValue}</Text>
        )}
      </Table.Td>
    </Table.Tr>
  );
}

// Friendly labels + display order for well-known KPIs, so the RESULT of a unit
// reads as physics ("V/F (vapour fraction)") not raw keys ("V_over_F",
// "phaseSet 0").  Nothing is hidden (glass-box) -- unknown keys fall through
// with their raw name, after the known ones.  This is the "select a unit, SEE
// what it computed" payoff: for a flash, V/F leads, then the duty, then the split.
//
// The α/β split labels FOLLOW the run's `phaseSet` KPI (IsothermalFlash.cpp:
// 0 = VL, 1 = LL, 2 = VLLE): in a VL flash β IS the vapour, but in an LL
// flash β is a SECOND LIQUID -- calling F_beta "vapour flow" there would
// contradict the solver.  When phaseSet is absent (other unit types, older
// run logs) the base labels below stay phase-neutral.
const KPI_META: { [k: string]: { label: string; order: number } } = {
  V_over_F: { label: "V/F  (phase split)",      order: 1 },
  Q_kW:     { label: "Q  (duty) [kW]",          order: 2 },
  F_beta:   { label: "β-phase flow [kmol/s]",   order: 3 },
  F_alpha:  { label: "α-phase flow [kmol/s]",   order: 4 },
  F_in:     { label: "feed flow [kmol/s]",      order: 5 },
  T:        { label: "T [K]",                    order: 6 },
  P:        { label: "P [Pa]",                   order: 7 },
  phaseSet: { label: "phase set",               order: 90 },
};
const PHASE_SET_NAMES = ["VL", "LL", "VLLE"];

// Per-phaseSet label overrides for the split KPIs (key = PHASE_SET_NAMES
// entry).  VLLE keeps phase-neutral β wording: with three phases present the
// β slot is the overall split, not a single nameable phase.
const KPI_PHASE_LABELS: { [ps: string]: { [k: string]: string } } = {
  VL: {
    V_over_F: "V/F  (vapour fraction)",
    F_beta:   "vapour flow [kmol/s]",
    F_alpha:  "liquid flow [kmol/s]",
  },
  LL: {
    V_over_F: "β/F  (β-phase fraction)",
    F_beta:   "β-liquid flow [kmol/s]",
    F_alpha:  "α-liquid flow [kmol/s]",
  },
  VLLE: {
    V_over_F: "β/F  (β-phase fraction)",
    F_beta:   "β-phase flow [kmol/s]",
    F_alpha:  "α-phase flow [kmol/s]",
  },
};

/** Friendly label for KPI `k`, phase-aware when the unit reported a
 *  `phaseSet`; undefined for unknown keys (caller shows the raw name). */
function kpiLabel(k: string, kpis: { [k: string]: number }): string | undefined {
  const psIdx = kpis["phaseSet"];
  const ps = psIdx === undefined ? undefined : PHASE_SET_NAMES[psIdx];
  return (ps !== undefined ? KPI_PHASE_LABELS[ps]?.[k] : undefined)
      ?? KPI_META[k]?.label;
}

function KpisSection({ kpis }: { kpis: { [k: string]: number } }) {
  // Subscribe to the sig-figs pref so results re-render live when it changes.
  const sig = useStore((s) => s.displayPrefs.sigFigs);
  const entries = Object.entries(kpis)
    // Drop the raw "Q" in W: "Q_kW" carries the same number, friendlier.
    .filter(([k]) => !(k === "Q" && "Q_kW" in kpis))
    .sort(([a], [b]) => {
      const oa = KPI_META[a]?.order ?? 50;
      const ob = KPI_META[b]?.order ?? 50;
      return oa !== ob ? oa - ob : a.localeCompare(b);
    });
  return (
    <Stack gap={6}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        Latest results
      </Text>
      <Text size="10px" c="dimmed">
        From the last solver run.  Re-run after editing the dict to refresh.
      </Text>
      <Table withRowBorders={false} striped="even" verticalSpacing={4}>
        <Table.Tbody>
          {entries.map(([k, v]) => (
            <Table.Tr key={k}>
              <Table.Td style={{ width: "55%" }}>
                <Text size="xs" ff="monospace">
                  {kpiLabel(k, kpis) ?? k}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="xs" ff="monospace">
                  {k === "phaseSet"
                    ? (PHASE_SET_NAMES[v] ?? formatSig(v, sig))
                  : formatSig(v, sig)}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

// --- Transient tinkering ----------------------------------------------------
// A numeric scalar the student may grab and change directly in the Properties
// box.  The edit is TRANSIENT (lives in the scratch overlay, applied at Run,
// never written to disk) and LOUD (a yellow amber state + a from->to diff +
// a per-field reset).  We edit in the scalar's AUTHORED unit (the unit string
// the dict used, e.g. "K"/"bar"/"kmol/h", or none for a dimensionless knob like
// a reflux ratio) -- honest to the file, and no display-pref round-trip to get
// wrong.  `raw` is the value as it sits in the parsed dict (a number, or a
// "<n> <unit>" string).
function ScratchField({
  path,
  raw,
  label,
}: {
  path: string;
  raw: JsonValue | undefined;
  label: string;
}) {
  const scratch = useStore((s) => s.scratchEdits[path]);
  const setScratch = useStore((s) => s.setScratch);
  const clearScratch = useStore((s) => s.clearScratch);
  const sig = useStore((s) => s.displayPrefs.sigFigs);
  const [focused, setFocused] = useState(false);

  // The on-disk value + its authored unit.  A "$ref" or a non-scalar is not
  // tinkerable -- the caller should not have rendered a field, but guard.
  const parsed =
    typeof raw === "number" ? { value: raw, unit: undefined as string | undefined }
    : typeof raw === "string" ? parseScalarString(raw)
    : null;
  if (!parsed) {
    return <Text size="sm" ff="monospace">{String(raw ?? "—")}</Text>;
  }
  const unit = parsed.unit;
  const from = parsed.value;
  const current = scratch ? scratch.value : from;
  const edited = scratch !== undefined;
  // Display the value rounded to the sig-figs pref while idle, but the FULL
  // stored precision the moment the field is focused for editing -- so the panel
  // reads clean (1.01, not 1.01325) yet editing never silently truncates the spec.
  const shown = focused ? current : Number(current.toPrecision(Math.max(1, sig)));

  return (
    <Group gap={6} wrap="nowrap" align="center">
      <NumberInput
        size="xs"
        value={shown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Let the student type freely; commit to the overlay on change.  A
        // blank field is ignored (no silent 0); the value is whatever they
        // type, never clamped.
        onChange={(v) => {
          const n = typeof v === "number" ? v : parseFloat(String(v));
          if (!Number.isFinite(n)) return;
          setScratch(path, { value: n, from, unit, label });
        }}
        styles={{ input: { width: 96, fontFamily: "monospace", textAlign: "right",
          ...(edited ? { borderColor: "var(--mantine-color-yellow-6)" } : {}) } }}
        hideControls
      />
      {unit && <Text size="xs" c="dimmed">{unit}</Text>}
      {edited && (
        <Group gap={2} wrap="nowrap" align="center">
          <Tooltip label={`on disk: ${from}${unit ? ` ${unit}` : ""} — tinkered, not saved`} withArrow>
            <Text size="10px" c="yellow.6" ff="monospace" style={{ whiteSpace: "nowrap" }}>
              ● {from} →
            </Text>
          </Tooltip>
          <Tooltip label="Reset this field to the disk value" withArrow>
            <ActionIcon size="xs" variant="subtle" color="gray"
              onClick={() => clearScratch(path)} aria-label="Reset field">
              <IconX size={11} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}
    </Group>
  );
}

function KeyValueTable({
  title,
  rows,
}: {
  title: string;
  rows: { k: string; v: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <Stack gap={6}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {title}
      </Text>
      <Table withRowBorders={false} striped="even" verticalSpacing={4}>
        <Table.Tbody>
          {rows.map(({ k, v }) => (
            <Table.Tr key={k}>
              <Table.Td style={{ width: "40%" }}>
                <Text size="xs" ff="monospace" c="dimmed">
                  {k}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="xs" ff="monospace">
                  {v}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function formatList(v: string | string[] | undefined): string {
  if (v === undefined) return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  return v;
}

// ---------------------------------------------------------------------------
//  Value rendering.  Schema-driven: when the schema declares a unit the
//  PropertyPanel respects the user's TopBar choice (K -> degC, Pa -> bar,
//...).  Arrays and dicts get a readable form instead of raw JSON.stringify.
// ---------------------------------------------------------------------------

function renderFieldValue(field: OperationField,
  value: JsonValue | undefined,
  prefs: DisplayPrefs,
): { displayValue: string; displayUnit: string | undefined } {
  // Honour the TopBar Units menu for the three quantities the GUI knows
  // how to convert.  For everything else, show the schema's declared unit
  // as-is.
  if (value !== undefined && typeof value === "number" && field.unit) {
    if (field.unit === "K") {
      return {
        displayValue: `${formatTemperature(value, prefs.temperature)}`,
        displayUnit: temperatureLabel(prefs.temperature),
      };
    }
    if (field.unit === "Pa") {
      return {
        displayValue: `${formatPressure(value, prefs.pressure)}`,
        displayUnit: prefs.pressure,
      };
    }
    if (field.unit === "kmol/s") {
      return {
        displayValue: `${formatFlow(value, prefs.flow)}`,
        displayUnit: prefs.flow,
      };
    }
  }
  return { displayValue: stringifyValue(value), displayUnit: field.unit };
}

function stringifyValue(v: JsonValue | undefined): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (Array.isArray(v)) return stringifyArray(v);
  if (typeof v === "object") return stringifyObject(v as JsonDict);
  if (typeof v === "number") return formatNumber(v);
  return String(v);
}

function stringifyArray(arr: JsonValue[]): string {
  if (arr.length === 0) return "[ ]";
  // Array of scalars (strings or numbers): join with commas.
  if (arr.every((x) => x === null || typeof x === "string" || typeof x === "number" || typeof x === "boolean")) {
    return arr.map((x) => (typeof x === "number" ? formatNumber(x) : String(x))).join(", ");
  }
  // Array of dicts with a `name` key (e.g. gibbsReactor species): name + the
  // rest compactly.
  if (arr.every((x) => typeof x === "object" && x !== null && !Array.isArray(x) && "name" in x)) {
    return arr
.map((x) => {
        const o = x as JsonDict;
        const name = String(o["name"]);
        const rest = Object.entries(o)
.filter(([k]) => k !== "name")
.map(([k, vv]) => `${k}=${stringifyValue(vv)}`)
.join(", ");
        return rest ? `${name} (${rest})` : name;
      })
.join("; ");
  }
  return JSON.stringify(arr);
}

function stringifyObject(obj: JsonDict): string {
  const entries = Object.entries(obj);
  if (entries.length === 0) return "{ }";
  return entries.map(([k, v]) => `${k}: ${stringifyValue(v)}`).join(", ");
}

// Read-only numeric display -- follows the units-menu significant-figures pref
// (formatSig reads the synced global sig-figs), so results honour the same
// precision the student chose for everything else instead of a hardcoded 5.
function formatNumber(v: number): string {
  return formatSig(v);
}

// ---------------------------------------------------------------------------
//   FileDetails: show the original raw text (with comments) of a dict
//   file selected in the CaseTree.  Read-only, monospace.  We show the
//   raw text rather than re-serialise the JSON so the user sees exactly
//   what is in their editor.
// ---------------------------------------------------------------------------

function FileDetails({ rel, raw }: { rel: string; raw: string | undefined }) {
  return (
    <Stack gap={6}>
      <Group justify="space-between" align="center">
        <Text size="xs" c="dimmed" tt="uppercase"
          style={{ letterSpacing: "0.05em" }}>File</Text>
        {raw !== undefined && (
          <Tooltip
            label="Open this file in a separate browser tab — read it side-by-side with the flowsheet"
            withArrow position="left" multiline w={260}
          >
            <ActionIcon size="sm" variant="subtle" color="cyan"
              onClick={() => popOutFileHtml(rel, raw)}>
              <IconExternalLink size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      <Text size="sm" fw={500}
        style={{ fontFamily: "var(--mantine-font-family-monospace)" }}>
        {rel}
      </Text>
      {raw === undefined ? (
        <Text size="xs" c="dimmed" fs="italic">
          (no raw text — file not bundled for this case)
        </Text>
      ) : (
        <pre style={{
          fontFamily: "var(--mantine-font-family-monospace)",
          fontSize: 11,
          lineHeight: 1.4,
          background: "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-8))",
          padding: 10,
          borderRadius: 4,
          maxHeight: 480,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          margin: 0,
          color: "light-dark(var(--mantine-color-gray-8), var(--mantine-color-gray-3))",
        }}>{raw}</pre>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
//   FolderDetails: list of files under a folder/sector, clickable to
//   drill in.  Distinguishes "folder" (system/, constant/) from "sector"
//   (a fractal sub-flowsheet folder with its own .cho and dicts).
// ---------------------------------------------------------------------------

function FolderDetails({ name, kind, files }: {
  name: string;
  kind: "folder" | "sector";
  files: string[];
}) {
  const selectNode = useStore((s) => s.selectNode);
  return (
    <Stack gap={6}>
      <Text size="xs" c="dimmed" tt="uppercase"
        style={{ letterSpacing: "0.05em" }}>
        {kind === "folder" ? "Folder" : "Sector"}
      </Text>
      <Text size="sm" fw={500}
        style={{ fontFamily: "var(--mantine-font-family-monospace)" }}>
        {name}/
      </Text>
      {kind === "sector" && (
        <Text size="xs" c="dimmed">
          Fractal sub-flowsheet.  Double-click the sector node on the canvas
          to open it as its own case in a new window.
        </Text>
      )}
      <Text size="xs" c="dimmed" mt={4}>
        {files.length === 0 ? "(no files)" : `${files.length} file${files.length === 1 ? "" : "s"}:`}
      </Text>
      <Stack gap={2}>
        {files.map((rel) => (
          <Text key={rel} size="xs"
            style={{
              fontFamily: "var(--mantine-font-family-monospace)",
              cursor: "pointer",
              color: "light-dark(var(--mantine-color-cyan-8), var(--mantine-color-cyan-3))",
            }}
            onClick={() => selectNode(`file:${rel}`)}
          >
            {rel}
          </Text>
        ))}
      </Stack>
    </Stack>
  );
}

/** Return the list of file paths that live under the given folder/sector
 *  prefix.  Used by FolderDetails to populate its drill-in listing. */
function listFilesUnder(cf: import("../case/types.js").CaseFiles,
                        prefix: string): string[] {
  const out: string[] = [];
  // Top-level system/ and constant/ files are not in extraFiles --- they
  // are in the cf's typed fields.  Reconstruct paths for them.
  const builtin: string[] = [];
  if (prefix === "system") {
    builtin.push("system/controlDict");
    if (cf.flowsheet) builtin.push("system/flowsheetDict");
    if (cf.propsDict) builtin.push("system/propsDict");
    if (cf.solverDict) builtin.push("system/solverDict");
    if (cf.outerDict) builtin.push("system/outerDict");
    if (cf.postDict) builtin.push("system/postDict");
  } else if (prefix === "constant") {
    builtin.push("constant/propertyDict");
    if (cf.reactions) builtin.push("constant/reactions");
  }
  out.push(...builtin);
  if (cf.extraFiles) {
    for (const rel of Object.keys(cf.extraFiles)) {
      if (rel.startsWith(prefix + "/") && !rel.endsWith(".cho")) out.push(rel);
    }
  }
  return out.sort();
}

// ---------------------------------------------------------------------------
//   ThermoSummaryInline
//   Compact rendering of the case's thermoPackage suitable for the
//   narrow right panel.  Surfaces the thermo layer at all times --- the
//   property package is the single most important decision in a process
//   simulation; hiding it behind a tab is wrong.  See
//   docs/ai/gui-mental-model.md.
// ---------------------------------------------------------------------------

function ThermoSummaryInline() {
  const tp = useStore((s) => s.caseFiles.thermoPackage);
  if (!tp) return <Text size="sm" c="dimmed">No thermoPackage loaded.</Text>;

  const components = Array.isArray(tp["components"])
    ? (tp["components"] as JsonValue[]).filter((x): x is string => typeof x === "string")
    : [];
  const activity = tp["activityModel"] as JsonDict | undefined;
  const eos = tp["equationOfState"] as JsonDict | undefined;
  const transport = tp["transport"] as JsonDict | undefined;
  const activityModel = typeof activity?.["model"] === "string" ? (activity["model"] as string) : null;
  const eosModel = typeof eos?.["model"] === "string" ? (eos["model"] as string) : null;
  const nrtlPairs = Array.isArray(activity?.["pairs"]) ? (activity!["pairs"] as JsonDict[]) : [];

  return (
    <Stack gap="sm">
      {/* Components */}
      <Stack gap={4}>
        <Text size="xs" c="dimmed" tt="uppercase" style={{ letterSpacing: "0.05em" }}>
          Components
        </Text>
        <Group gap={4} wrap="wrap">
          {components.length === 0
            ? <Text size="xs" c="dimmed">(none)</Text>
            : components.map((c) => (
                <Badge key={c} variant="light" color="cyan" size="sm" radius="sm"
                  styles={{ root: { textTransform: "none" } }}>
                  {c}
                </Badge>
              ))}
        </Group>
      </Stack>

      {/* Models */}
      <Stack gap={4}>
        <Text size="xs" c="dimmed" tt="uppercase" style={{ letterSpacing: "0.05em" }}>
          Models
        </Text>
        <Group gap="xs" wrap="wrap">
          <Text size="xs">activity:</Text>
          <Badge variant="filled" color="teal" size="sm" radius="sm"
            styles={{ root: { textTransform: "none" } }}>
            {activityModel ?? "ideal"}
          </Badge>
        </Group>
        <Group gap="xs" wrap="wrap">
          <Text size="xs">EoS:</Text>
          <Badge variant="filled" color="teal" size="sm" radius="sm"
            styles={{ root: { textTransform: "none" } }}>
            {eosModel ?? "idealGas"}
          </Badge>
        </Group>
        {transport && Object.keys(transport).filter((k) => k !== "model").length > 0 && (
          <Group gap="xs" wrap="wrap">
            <Text size="xs">transport:</Text>
            {Object.entries(transport).map(([k, v]) => {
              const m = typeof v === "object" && v !== null && !Array.isArray(v)
                ? (v as JsonDict)["model"] : (k === "model" ? v : null);
              if (typeof m !== "string") return null;
              return (
                <Badge key={k} variant="light" color="orange" size="xs" radius="sm"
                  styles={{ root: { textTransform: "none" } }}
                  title={k}>
                  {k === "model" ? m : `${k}: ${m}`}
                </Badge>
              );
            })}
          </Group>
        )}
      </Stack>

      {/* Pairs */}
      {nrtlPairs.length > 0 && (
        <Stack gap={4}>
          <Text size="xs" c="dimmed" tt="uppercase" style={{ letterSpacing: "0.05em" }}>
            Binary pairs ({nrtlPairs.length})
          </Text>
          <Stack gap={2}>
            {nrtlPairs.map((p, i) => (
              <Text key={i} size="xs"
                style={{ fontFamily: "var(--mantine-font-family-monospace)" }}>
                {String(p["i"] ?? "?")} ↔ {String(p["j"] ?? "?")}
              </Text>
            ))}
          </Stack>
        </Stack>
      )}

      <Text size="xs" c="dimmed" mt="xs">
        Open the <b>Thermo</b> tab below for the full breakdown.
      </Text>
    </Stack>
  );
}
