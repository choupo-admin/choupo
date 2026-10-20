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
  Choupo GUI -- Colours menu in the TopBar (DEV.md 4c C114)

  What the flowsheet's colours MEAN, chosen deliberately.  Phase stays the
  shipped default and the one-click resting state (docs/ai/gui-credo.md:
  phase colour is semantic; a deliberate display MODE is the sanctioned
  exception).  The modes:

    Colour streams by   phase (default) | any field the run PUBLISHES on a
                        stream -- T, P, vapour fraction, pH, molar / mass /
                        enthalpy flow -- or, per component, its mole or mass
                        fraction or its molar or mass flow.  The list is
                        DERIVED from the run (case/streamColouring.ts), so a
                        field nothing publishes is never offered.
    Scale               colormap, linear | log, automatic | fixed range.
    Dim outside         a threshold on the same field.
    Follow a molecule   colour = that component's concentration, wire
                        width = its own flow; one click returns.
    Colour units by     a published unit KPI (diverging at zero for a
                        signed one: heating red, cooling blue).
    Export              the coloured flowsheet with its legend, SVG or PNG.

  Which of these PERSIST is the prefs.ts ruling: the encoding, the colormap
  and linear/log are a way of looking (`DisplayPrefs`, every tab); a range,
  a threshold, the followed compound and the unit KPI mean something only
  for this case (`state/canvasColour.ts`, per tab, cleared on a new case).
  A Popover, not a Menu: a Menu closes on every click, and a choice of
  field + component + range is several clicks.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  NumberInput,
  Popover,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconPalette, IconDownload, IconX } from "@tabler/icons-react";

import { useStore } from "../state/store.js";
import { useCanvasColour } from "../state/canvasColour.js";
import { computePerStream } from "../case/streamComposition.js";
import {
  type ComponentKind,
  type FieldKey,
  activeFieldKey,
  availableFields,
  availableUnitKpis,
  componentsOf,
  fieldDisplay,
  fieldKey,
  fieldLabel,
  isComponentKind,
  parseFieldKey,
} from "../case/streamColouring.js";
import { type ColorScheme, type ColorMap, gradientCss } from "./plotting/palette.js";
import { flowBasis, formatSig } from "../state/displayUnits.js";

const MAP_OPTS: { value: ColorMap; label: string; hint: string }[] = [
  { value: "turbo", label: "Turbo", hint: "blue → green → red (intuitive, default)" },
  { value: "coolwarm", label: "Cool–Warm", hint: "blue → grey → red" },
  { value: "viridis", label: "Viridis", hint: "colour-blind-safe (not T-intuitive)" },
];

const SCHEME_OPTS: { value: ColorScheme; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "cvd-safe", label: "Colour-blind-safe" },
];

const QTY_LABEL: Record<ComponentKind, string> = {
  x: "mole frac.", w: "mass frac.", n: "molar flow", m: "mass flow",
};

/** The value of the "Colour by" select for a per-component field. */
const PER_COMPONENT = "__component";

/** Dispatched to the canvas, which owns the drawing being exported. */
export const EXPORT_EVENT = "choupo:export-flowsheet";

const NO_PORTAL = { withinPortal: false } as const;

export function ColoursMenu() {
  const prefs = useStore((s) => s.displayPrefs);
  const setPrefs = useStore((s) => s.setDisplayPrefs);
  const runResult = useStore((s) => s.runResult);
  const cc = useCanvasColour();

  const streams = runResult?.streams ?? [];
  const perStream = useMemo(
    () => computePerStream(streams, runResult?.componentMolarMass),
    [streams, runResult?.componentMolarMass]);
  const fields = useMemo(() => availableFields(streams, perStream), [streams, perStream]);
  const components = useMemo(() => componentsOf(streams), [streams]);
  const unitKpis = useMemo(() => availableUnitKpis(runResult?.kpis), [runResult?.kpis]);

  const active = activeFieldKey(prefs);
  const parsed = active ? parseFieldKey(active) : null;
  const perComponent = !!parsed?.component;

  // Before a run only T and P can be offered: they are what a 0/ state
  // declares on every stream.  After a run, everything the run publishes.
  const haveRun = streams.length > 0;
  const scalarOpts = haveRun
    ? fields.filter((f) => f.group !== "Per component")
    : [{ key: "T", label: "Temperature", group: "Stream state" as const },
       { key: "P", label: "Pressure", group: "Stream state" as const }];
  const groups = ["Stream state", "Flows"].map((g) => ({
    group: g,
    items: scalarOpts.filter((f) => f.group === g).map((f) => ({ value: f.key, label: f.label })),
  })).filter((g) => g.items.length > 0);
  const byData = [
    { group: "Default", items: [{ value: "phase", label: "Phase (solver)" }] },
    ...groups,
    ...(haveRun && components.length > 0
      ? [{ group: "Per component", items: [{ value: PER_COMPONENT, label: "A component…" }] }]
      : []),
  ];
  const byValue = !active ? "phase" : perComponent ? PER_COMPONENT : active;

  const setField = (key: FieldKey | null) => {
    if (key === null) setPrefs({ colorMode: "phase" });
    else setPrefs({ colorMode: "field", colorField: key });
    cc.set({ range: null, threshold: null });
  };

  const comp = parsed?.component ?? cc.follow ?? components[0] ?? null;
  const qtyAvail = (c: string) => (["x", "w", "n", "m"] as ComponentKind[])
    .filter((k) => fields.some((f) => f.key === fieldKey(k, c)));

  const disp = active ? fieldDisplay(active, prefs) : null;
  const shown = cc.shownRange;

  const summary = cc.follow
    ? `following ${cc.follow}`
    : active ? fieldLabel(active) : `phase · ${prefs.colorScheme === "cvd-safe" ? "cvd-safe" : "default"}`;

  return (
    <Popover width={320} position="bottom-end" withArrow shadow="md" withinPortal
      trapFocus={false} closeOnEscape>
      <Popover.Target>
        <ActionIcon variant="subtle" size="lg" aria-label="Flowsheet colours"
          title={`Flowsheet colours: ${summary}`}>
          <IconPalette size={18} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <ScrollArea.Autosize mah="min(78dvh, 640px)" type="auto">
          <Stack gap={8} p="sm" data-testid="colours-menu">
            {cc.follow && (
              <Group justify="space-between" wrap="nowrap"
                style={{ background: "var(--mantine-color-cyan-light)", borderRadius: 4, padding: "4px 8px" }}>
                <Text size="xs" fw={600}>Following {cc.follow}</Text>
                <Button size="compact-xs" variant="filled" color="gray"
                  leftSection={<IconX size={12} />}
                  onClick={() => cc.set({ follow: null })}>
                  Back to normal
                </Button>
              </Group>
            )}

            <Text size="xs" fw={700} c="dimmed" tt="uppercase">Colour streams by</Text>
            <Select size="xs" data={byData} value={byValue} allowDeselect={false}
              comboboxProps={NO_PORTAL} aria-label="Colour streams by"
              disabled={!!cc.follow}
              onChange={(v) => {
                if (!v || v === "phase") setField(null);
                else if (v === PER_COMPONENT) {
                  const c = comp ?? components[0];
                  if (c) setField(fieldKey(qtyAvail(c)[0] ?? "x", c));
                } else setField(v);
              }} />
            {!haveRun && (
              <Text size="xs" c="dimmed">
                Run the case to colour by any field the run publishes (flows,
                vapour fraction, a component's fraction or flow…).
              </Text>
            )}
            {perComponent && parsed?.component && !cc.follow && (
              <Group gap={6} wrap="nowrap" align="flex-end">
                <Select size="xs" data={components} value={parsed.component} searchable
                  allowDeselect={false} comboboxProps={NO_PORTAL} label="Component"
                  style={{ flex: 1 }}
                  onChange={(c) => {
                    if (!c) return;
                    const k = qtyAvail(c).includes(parsed.kind as ComponentKind)
                      ? parsed.kind : qtyAvail(c)[0] ?? "x";
                    setField(fieldKey(k as ComponentKind, c));
                  }} />
                <Select size="xs" w={112} label="Quantity" allowDeselect={false}
                  comboboxProps={NO_PORTAL}
                  data={qtyAvail(parsed.component).map((k) => ({ value: k, label: QTY_LABEL[k] }))}
                  value={parsed.kind}
                  onChange={(k) => { if (k && isComponentKind(k as ComponentKind)) setField(fieldKey(k as ComponentKind, parsed.component)); }} />
              </Group>
            )}

            {(active || cc.follow) && (
              <>
                <Group gap={6} wrap="nowrap">
                  {MAP_OPTS.map((o) => (
                    <Tooltip key={o.value} label={o.hint} withArrow>
                      <Button size="compact-xs" variant={prefs.colorMap === o.value ? "filled" : "default"}
                        onClick={() => setPrefs({ colorMap: o.value })} style={{ flex: 1 }}
                        aria-pressed={prefs.colorMap === o.value}>
                        <Stack gap={1} align="stretch" style={{ width: "100%" }}>
                          <Box style={{ height: 5, borderRadius: 2, background: gradientCss(o.value) }} />
                          <span style={{ fontSize: 10 }}>{o.label}</span>
                        </Stack>
                      </Button>
                    </Tooltip>
                  ))}
                </Group>
                <Group gap={6} wrap="nowrap" grow>
                  <SegmentedControl size="xs" value={prefs.colorScale}
                    data={[{ value: "linear", label: "linear" }, { value: "log", label: "log" }]}
                    onChange={(v) => setPrefs({ colorScale: v as "linear" | "log" })} />
                  <SegmentedControl size="xs" value={cc.range ? "fixed" : "auto"}
                    data={[{ value: "auto", label: "auto range" }, { value: "fixed", label: "fixed" }]}
                    onChange={(v) => cc.set({ range: v === "fixed" ? (shown ?? { min: 0, max: 1 }) : null })} />
                </Group>
                {prefs.colorScale === "log" && (
                  <Text size="xs" c="dimmed">
                    Log scale: positive values only; a value ≤ 0 is drawn in the
                    stated below-range colour.
                  </Text>
                )}
                {cc.range && disp && (
                  <RangeInputs unit={disp.unit} lo={cc.range.min} hi={cc.range.max}
                    toD={disp.toDisplay} fromD={disp.fromDisplay}
                    onChange={(min, max) => cc.set({ range: { min, max } })} />
                )}
                {!cc.range && shown && disp && (
                  <Text size="xs" c="dimmed" ff="monospace">
                    auto: {formatSig(disp.toDisplay(shown.min))} – {formatSig(disp.toDisplay(shown.max))}{disp.unit ? ` ${disp.unit}` : ""} (visible streams)
                  </Text>
                )}
                <Switch size="xs" checked={!!cc.threshold}
                  label="Dim streams outside a range"
                  onChange={(e) => cc.set({ threshold: e.currentTarget.checked
                    ? (shown ? { min: shown.min, max: shown.max } : { min: -Infinity, max: Infinity })
                    : null })} />
                {cc.threshold && disp && (
                  <RangeInputs unit={disp.unit} lo={cc.threshold.min} hi={cc.threshold.max} open
                    toD={disp.toDisplay} fromD={disp.fromDisplay}
                    onChange={(min, max) => cc.set({ threshold: { min, max } })} />
                )}
              </>
            )}

            {haveRun && components.length > 0 && (
              <>
                <Divider />
                <Text size="xs" fw={700} c="dimmed" tt="uppercase">Follow a molecule</Text>
                <Group gap={6} wrap="nowrap" align="flex-end">
                  <Select size="xs" data={components} searchable allowDeselect={false}
                    comboboxProps={NO_PORTAL} aria-label="Component to follow"
                    placeholder="pick a component" style={{ flex: 1 }}
                    value={cc.follow ?? null}
                    onChange={(c) => cc.set({ follow: c ?? null, range: null, threshold: null })} />
                  {cc.follow && (
                    <Button size="xs" variant="default" onClick={() => cc.set({ follow: null })}>
                      Stop
                    </Button>
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  Colour = its {flowBasis(prefs.flow) === "mass" ? "mass" : "mole"} fraction
                  (the Units menu's basis), width = its own flow; streams
                  without it are dimmed.
                </Text>
              </>
            )}

            {unitKpis.length > 0 && (
              <>
                <Divider />
                <Text size="xs" fw={700} c="dimmed" tt="uppercase">Colour units by</Text>
                <Select size="xs" comboboxProps={NO_PORTAL} searchable aria-label="Colour units by"
                  data={[{ value: "", label: "nothing (ink)" },
                         ...unitKpis.map((k) => ({ value: k.key,
                           label: `${k.key}  (${k.count} unit${k.count === 1 ? "" : "s"})` }))]}
                  value={cc.unitKpi ?? ""}
                  onChange={(v) => cc.set({ unitKpi: v ? v : null, unitThreshold: null })} />
                {cc.unitKpi && (
                  <>
                    <SegmentedControl size="xs" fullWidth value={cc.unitMap}
                      data={[{ value: "diverging", label: "diverging at 0" },
                             { value: "sequential", label: "sequential" }]}
                      onChange={(v) => cc.set({ unitMap: v as "diverging" | "sequential" })} />
                    <Switch size="xs" checked={!!cc.unitThreshold} label="Dim units outside a range"
                      onChange={(e) => cc.set({ unitThreshold: e.currentTarget.checked
                        ? { min: -Infinity, max: Infinity } : null })} />
                    {cc.unitThreshold && (
                      <RangeInputs unit="" lo={cc.unitThreshold.min} hi={cc.unitThreshold.max} open
                        toD={(v) => v} fromD={(v) => v}
                        onChange={(min, max) => cc.set({ unitThreshold: { min, max } })} />
                    )}
                  </>
                )}
              </>
            )}

            <Divider />
            <Group justify="space-between" wrap="nowrap">
              <Text size="xs" fw={700} c="dimmed" tt="uppercase">Phase palette</Text>
              <SegmentedControl size="xs" value={prefs.colorScheme}
                data={SCHEME_OPTS}
                onChange={(v) => setPrefs({ colorScheme: v as ColorScheme })} />
            </Group>

            <Divider />
            <Group justify="space-between" wrap="nowrap">
              <Text size="xs" fw={700} c="dimmed" tt="uppercase">Export figure</Text>
              <Group gap={6}>
                {(["svg", "png"] as const).map((f) => (
                  <Button key={f} size="compact-xs" variant="default"
                    leftSection={<IconDownload size={12} />}
                    onClick={() => window.dispatchEvent(new CustomEvent(EXPORT_EVENT, { detail: { format: f } }))}>
                    {f.toUpperCase()}
                  </Button>
                ))}
              </Group>
            </Group>
          </Stack>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}

/** Two numbers in the field's display unit, stored back in canonical SI.
 *  With `open`, an empty box is an open end (−∞ / +∞). */
function RangeInputs({ unit, lo, hi, toD, fromD, onChange, open }: {
  unit: string; lo: number; hi: number; open?: boolean;
  toD: (si: number) => number; fromD: (d: number) => number;
  onChange: (min: number, max: number) => void;
}) {
  const [a, setA] = useState<string | number>(Number.isFinite(lo) ? Number(formatSig(toD(lo), 4)) : "");
  const [b, setB] = useState<string | number>(Number.isFinite(hi) ? Number(formatSig(toD(hi), 4)) : "");
  const commit = (x: string | number, y: string | number) => {
    const min = x === "" ? (open ? -Infinity : NaN) : fromD(Number(x));
    const max = y === "" ? (open ? Infinity : NaN) : fromD(Number(y));
    if (Number.isNaN(min) || Number.isNaN(max)) return;
    onChange(min, max);
  };
  return (
    <Group gap={6} wrap="nowrap" align="flex-end">
      <NumberInput size="xs" label="min" value={a} hideControls style={{ flex: 1 }}
        placeholder={open ? "−∞" : undefined}
        onChange={(v) => { setA(v); commit(v, b); }} />
      <NumberInput size="xs" label="max" value={b} hideControls style={{ flex: 1 }}
        placeholder={open ? "+∞" : undefined}
        onChange={(v) => { setB(v); commit(a, v); }} />
      <Text size="xs" c="dimmed" pb={6} w={44}>{unit}</Text>
    </Group>
  );
}
