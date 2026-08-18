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
  knobPanel — THE EDUTOOLS SETUP PANEL: one left rail, one declaration, for all
  twelve tools in METHOD_TOOLS.

  WHY IT EXISTS.  Every tool's setup controls used to be a HORIZONTAL STRIP
  above the diagram, and every strip answered the same three questions its own
  way — a chevron here, a `Collapse` there, twelve fold keys, no width to drag
  and no keyboard path back.  The panel contract (ui/panelContract.tsx) had
  already settled those questions for the six left rails and the bottom window;
  this strip was the one surface left outside it, and the reason recorded at the
  time ("a toolbar fold with no size, so it is not this contract's shape") was
  sound FOR A STRIP and is void for a panel.  A left panel HAS a size, which is
  exactly the contract's shape.  Vítor, looking at a tool: why does this one
  thing behave differently from everything else?

  WHAT MOVED AND WHAT DID NOT.  The panel holds the INPUTS — the source toggle,
  the knobs, the view options, the provenance sentence that says which witness
  is being run.  The content column keeps the OUTPUTS: the alerts (verbatim
  engine words), the result chips, the construction itself, the footnote that
  declares what the file computed.  A reader turns a knob on the left and
  watches the answer on the right; nothing that reports a number sits in the
  panel and nothing that sets one sits over the diagram.

  THE DIAGRAM GAINS WHAT THE STRIP GAVE UP, and the gain is in the axis nobody
  expects.  Every construction is an aspect-fitted drawing (`viewBox` +
  `preserveAspectRatio="xMidYMid meet"`, or Plotly filling its box), so in a
  wide, short mount it scales to the HEIGHT and pays for it with empty margins
  left and right — which is precisely the screenshot that started this: a plot
  squeezed in the middle of a 1368 px window.  Taking the strip's rows away
  gives the mount height, and the drawing widens even though the mount itself
  is narrower by the panel.  Both numbers are measured and reported with the
  change; neither is inferred from the other.

  THREE RULES THIS FILE OWNS.

  1. A KNOB LABEL WRAPS.  `KnobField` gives every label a full-width row and
     lets it wrap; it is never `whiteSpace: nowrap` inside a fixed-width box.
     That combination is what produced the owner's overlap: "T_guess (K) —
     which branch is reported" needs 215 px and was painted, unclipped, into a
     172 px column, so it ran 43 px into the next field's "[K]".  Long labels
     are not an edge case here — several tools carry a clause explaining what
     the knob is FOR, which is the pedagogy — so the rule is the layout's, not
     one string's.  A vertical panel is what makes it affordable: a wrapped
     label costs a line, and a column has lines to spare where a one-row strip
     had none.

  2. ONE DECLARATION, NOT TWELVE.  `METHOD_KNOBS_PANEL` (ui/panelContract.tsx)
     is the chrome and `PANELS.methodKnobsRail` (state/prefs.ts) is the storage;
     this file supplies the layout that consumes them.  A tool declares WHAT is
     in its panel and never how the panel behaves.

  3. THE FOLD IS ONE ANSWER.  The twelve per-tool `choupo.methods.<tool>.
     controlsCollapsed` keys are gone; the fold is the panel's, under the key
     the registry already owned for exactly this question
     (`METHODS_SETUP_COLLAPSED_KEY`).  A lecturer who folds the chrome away
     wants it folded on the next tool too — which is what that key's own
     docstring said before there were twelve of them.

  THE PHONE.  At 390 px the panel does not simply appear: `autoCollapseDefault`
  asks `fitsRow(min + contentMin, available)` — 240 + 360 against 390 — and
  answers "start folded", leaving the 28 px `PanelReopenStrip`, which is a full
  Fitts edge target and keyboard-reachable.  That is a MEASURED default, not a
  breakpoint and not `pointer: coarse`; the first real toggle writes the key and
  wins from then on, on the phone as on the desk.
\*---------------------------------------------------------------------------*/

import { useEffect } from "react";
import { Box, Group, NumberInput, ScrollArea, Slider, Stack, Text, Tooltip } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";

import {
  METHOD_KNOBS_PANEL, PanelCollapseButton, PanelReopenStrip, PanelResizeHandle,
  panelBoxProps, usePanel, usePanelShortcut,
} from "../panelContract.js";
import { fitsRow, useMeasuredBoxWidth, usePlotRefit } from "./methodsChrome.js";

// ---- the layout -------------------------------------------------------------

/** How long after a fold to ask again.  `panelBoxStyle` animates the width over
 *  180 ms, and a fold ENDS at a width no frame during it ever had. */
const FOLD_SETTLE_MS = 220;

/** Ask the plot libraries to re-fit after the panel's width changed.
 *
 *  The immediate half is `usePlotRefit` — methodsChrome's ONE home for "one
 *  rAF, then a window resize", the event Plotly's useResizeHandler listens for
 *  and the one an inline SVG needs nothing from.  What this adds is the SECOND
 *  ask after the fold animation, which that hook's own docstring says the host
 *  must wire ("Animated folds refit on transitionend instead"); a timer rather
 *  than `transitionend` because the event does not fire at all when the reader
 *  has asked for reduced motion, and a plot that never re-fits is worse than
 *  one that re-fits twice. */
function usePlotRefitOnPanel(size: number, collapsed: boolean): void {
  usePlotRefit(`${size}:${collapsed}`);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const settle = window.setTimeout(
      () => window.dispatchEvent(new Event("resize")), FOLD_SETTLE_MS);
    return () => window.clearTimeout(settle);
  }, [size, collapsed]);
}

/** THE SETUP RAIL: a tool's inputs on the left, its construction on the right.
 *
 *  `title` is what the panel is called in its own header (a tool says "classroom
 *  knobs" or "setup"); `scent` is what the folded strip carries, because a strip
 *  that says nothing is indistinguishable from a border. */
export function MethodSetupRail({ title, scent = "SETUP", setup, children }: {
  title: string;
  scent?: string;
  setup: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  const host = useMeasuredBoxWidth<HTMLDivElement>();
  const rail = usePanel(METHOD_KNOBS_PANEL, { availablePx: host.width });
  usePanelShortcut(rail);
  usePlotRefitOnPanel(rail.size, rail.collapsed);
  const reduceMotion = useReducedMotion();
  const railBox = panelBoxProps(rail, !!reduceMotion);

  /* THE PHONE, and it is the SAME question asked at a different moment.
   *
   * `autoCollapseDefault` already asks `fitsRow(min + contentMin, host)` to
   * decide whether the panel STARTS folded — at 390 px that is 240 + 360
   * against 390, so it does, and the reader meets a 28 px strip rather than a
   * panel that ate the construction.  But a default is only a default: the
   * reader can open it, and then the same row must hold a 300 px panel and a
   * diagram in 390 px.  Measured with the panel forced open at 390x844 before
   * this branch existed: the construction's mount was 89 px wide and its
   * drawing 89 px of a 640x420 viewBox — present, addressable, and unreadable.
   *
   * So when the pair does not fit, the panel is drawn as a SHEET over the
   * construction instead of beside it: the reader gets the full width for the
   * knobs, folds it, and gets the full width for the answer.  The trigger is
   * the project's ONE fit rule on two measured widths — never a viewport
   * breakpoint and never `pointer: coarse`, both of which have given this
   * project wrong answers on real devices.  It says so on the panel, because a
   * covered diagram that does not explain itself reads as a lost diagram. */
  const sheet = !rail.collapsed
    && !fitsRow(rail.size + METHOD_KNOBS_PANEL.contentMin, host.width);

  return (
    <Box ref={host.ref}
      style={{ display: "flex", flex: 1, height: "100%", position: "relative",
        minHeight: 0, minWidth: 0, overflow: "hidden" }}>
      {rail.collapsed && <PanelReopenStrip panel={rail} scent={scent} />}
      <Box
        data-panel={railBox["data-panel"]}
        data-panel-sheet={sheet ? "1" : undefined}
        style={{
          ...railBox.style,
          ...(sheet
            ? { position: "absolute", top: 0, bottom: 0, left: 0, right: 0,
                width: "100%", zIndex: 4 }
            : {}),
          borderRight: rail.collapsed || sheet
            ? "none"
            : "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
          background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
        }}
      >
        <ScrollArea type="always" scrollbarSize={10} h="100%"
          styles={{ thumb: { background: "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))" } }}>
          <Stack gap={10} p="xs" style={{ minWidth: 0 }}>
            <Group justify="space-between" align="center" wrap="nowrap" gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase"
                style={{ letterSpacing: 0.5, fontWeight: 600, minWidth: 0 }}>
                {title}
              </Text>
              <PanelCollapseButton panel={rail} />
            </Group>
            {sheet && (
              <Text size="xs" c="dimmed" style={{ lineHeight: 1.3 }}>
                This screen is too narrow to hold the knobs beside the
                construction, so they are over it: hide this panel to see the
                diagram.
              </Text>
            )}
            {setup}
          </Stack>
        </ScrollArea>
      </Box>
      {/* No handle over a sheet: it spans the whole host, so there is no width
          left to drag.  The size the reader dragged on a wider screen is KEPT
          (the contract never writes a viewport bound back into a preference) —
          it simply is not what is drawn here. */}
      {!sheet && <PanelResizeHandle panel={rail} />}
      {/* The construction's column.  `data-panel-content` is not decoration:
          it is how a browser probe measures what the diagram was actually
          given, which is the number this change is judged on. */}
      <Box data-panel-content="methodKnobsRail"
        style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex",
          flexDirection: "column", overflow: "hidden" }}>
        {children}
      </Box>
    </Box>
  );
}

// ---- the knob layout rule (rule 1) ------------------------------------------

/** ONE knob, laid out the ONE way: the label owns a full-width row of the
 *  panel and WRAPS; the control sits under it; the reason, when the tool
 *  states one, sits under that.
 *
 *  `overflowWrap: "anywhere"` and not just `normal`: several labels carry a
 *  token with no space in it (`T_guess`, `dP/dx`), and a token wider than the
 *  panel would otherwise overflow the box exactly as the old nowrap did — at
 *  the panel's minimum width, with a narrow enough rail, that is reachable. */
export function KnobField({ label, hint, children }: {
  label: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Box style={{ width: "100%", minWidth: 0 }}>
      <Text size="xs" c="dimmed" mb={2}
        style={{ whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.25 }}>
        {label}
      </Text>
      {children}
      {hint && (
        <Text size="xs" c="dimmed" mt={2}
          style={{ whiteSpace: "normal", overflowWrap: "anywhere",
            lineHeight: 1.2, opacity: 0.75 }}>
          {hint}
        </Text>
      )}
    </Box>
  );
}

/** What `KnobSlider` needs of a tool's knob descriptor.  Structural, so each
 *  tool keeps its own richer type (the dict file + key it writes, the witness's
 *  authored default) without this file knowing about any of them. */
export interface PanelKnob {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** The unit the dict declares; "" (or absent) when the label carries it. */
  unit?: string;
  /** One line of why this knob is here — the tool's own pedagogy. */
  why?: string;
}

/** A knob as exact entry PLUS a drag, which is the shape three tools had each
 *  written for themselves (VanHeerden, Merkel, Drying — identical but for the
 *  fixed pixel width that made the labels collide).  The `why` rides a tooltip
 *  as before AND is available as a visible hint, because hover is not a thing a
 *  finger has. */
export function KnobSlider({ knob, value, onChange, showWhy = false }: {
  knob: PanelKnob;
  value: number;
  onChange: (v: number) => void;
  showWhy?: boolean;
}): JSX.Element {
  const label = `${knob.label}${knob.unit ? ` [${knob.unit}]` : ""}`;
  const field = (
    <KnobField label={label} hint={showWhy ? knob.why : undefined}>
      <NumberInput size="xs" value={value} min={knob.min} max={knob.max}
        step={knob.step} w="100%"
        onChange={(v) => {
          const n = typeof v === "number" ? v : Number(v);
          if (Number.isFinite(n)) onChange(n);
        }} />
      <Slider size="xs" mt={6} value={value} min={knob.min} max={knob.max}
        step={knob.step} label={null} onChange={onChange} />
    </KnobField>
  );
  return knob.why
    ? <Tooltip withArrow multiline w={320} label={knob.why} position="right">
        <Box style={{ width: "100%", minWidth: 0 }}>{field}</Box>
      </Tooltip>
    : field;
}

/** A knob as exact entry only (no drag) — the shape the tools that write dict
 *  scalars with no natural range use.  Same label rule, same full width. */
export function KnobNumber({ label, value, min, max, step, decimals, onChange }: {
  label: React.ReactNode;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <KnobField label={label}>
      <NumberInput size="xs" value={value} min={min} max={max} step={step}
        decimalScale={decimals} w="100%"
        onChange={(v) => {
          const n = typeof v === "number" ? v : Number(v);
          if (Number.isFinite(n)) onChange(n);
        }} />
    </KnobField>
  );
}

/** The provenance / honesty sentence at the foot of a panel: which witness is
 *  being run, or what the numbers above are.  It wraps (a panel has lines) and
 *  it is never elided — a claim a reader cannot finish reading is not a claim. */
export function PanelNote({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Text size="xs" c="dimmed"
      style={{ whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.3 }}>
      {children}
    </Text>
  );
}
