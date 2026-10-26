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
  canvasChrome -- WHAT THE TWO HOMES' CANVASES SHARE (DEV.md 4c C172 slice
  3b): the flowsheet of a process case and the workflow diagram of a
  properties case are ONE program, so they share one set of pieces rather
  than two look-alikes.  Moved here from FlowCanvas, where they were written
  for the flowsheet alone:

    SelectionCard   the floating selection card, top-right, with its fold
                    handle (`]`) -- single click selects, and this is where
                    the selection is read; the card's body is PropertyPanel
                    in both homes (gui-credo §2.5).
    CanvasKeyHint   the bottom-right line of keys, with the legibility
                    floor's "Overview" sentence above it when the fit hides
                    labels (C168 ruling (c): say so).
    CanvasBackground the dot grid, in the scheme's own ink.
    CANVAS_BG       the canvas surface (`gray-1` light: the palette's wire
                    inks are held to >= 3:1 against it).
    arrowMarker     the closed arrowhead every wire ends in.
\*---------------------------------------------------------------------------*/

import type { ReactNode } from "react";
import { useState } from "react";
import { ActionIcon, Box, Text, Tooltip } from "@mantine/core";
import { Background, BackgroundVariant, MarkerType } from "@xyflow/react";
import { useReducedMotion } from "@mantine/hooks";
import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";

import { MIN_TEXT_PX } from "../case/legibility.js";
import { useStore } from "../state/store.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { cardFoldOffset, CARD_BODY_W, CARD_HANDLE_W, CARD_MARGIN } from "./panelFold.js";

/** The canvas surface: `gray-1` on the light scheme (C168 slice 2: it was a
 *  mid grey no wire hue could hold 3:1 against), `dark-8` on the dark. */
export const CANVAS_BG = "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-8))";

/** The dot grid behind every canvas. */
export function CanvasBackground({ scheme }: { scheme: "light" | "dark" }) {
  return (
    <Background
      variant={BackgroundVariant.Dots}
      gap={20}
      size={1}
      color={scheme === "dark" ? "var(--mantine-color-dark-5)" : "var(--mantine-color-gray-2)"}
    />
  );
}

/** The arrowhead at a wire's destination: slender, and scaled WITH the line
 *  (markerUnits strokeWidth), so on the flowsheet it stays proportional to
 *  the flow. */
export function arrowMarker(color: string) {
  return { type: MarkerType.ArrowClosed, color, width: 10, height: 12 };
}

/** The keys of the canvas, bottom-right, and -- when the fit hides labels
 *  below the minimum size -- the sentence that says so. */
export function CanvasKeyHint({ legibility, keys }: { legibility: "full" | "overview"; keys: string }) {
  return (
    <Box
      style={{
        position: "absolute",
        right: 12,
        bottom: 12,
        zIndex: 5,
        padding: "4px 8px",
        borderRadius: 4,
        background: "light-dark(rgba(255,255,255,0.9), rgba(0,0,0,0.45))",
        pointerEvents: "none",
      }}
    >
      {legibility === "overview" && (
        <Text size="11px" ff="monospace" fw={600} data-legibility-hint="">
          Overview: labels under {MIN_TEXT_PX} px are hidden -- zoom in (+, wheel) to read them
        </Text>
      )}
      <Text size="11px" c="dimmed" ff="monospace" data-canvas-keys="">{keys}</Text>
    </Box>
  );
}

/* Selection card (top-right): what is selected -- a unit's "hardware" and
   latest-run KPIs on the flowsheet, a step's reads, model, writes and
   verdict on the workflow.  Appears ONLY when something is selected, so it
   respects the Fase-A "no permanent panels" layout; it floats over the
   canvas (the drawing stays visible) instead of a modal, per the credo's
   "pop-out beats modal" / "modals interrupt".  Esc or a click on empty
   canvas clears the selection and dismisses it.  Starts at top: 52 ---
   BELOW the run-badge panel (top-right, ~45 px tall incl. margin) --- so the
   badge and Reset stay visible while a node is selected.

   One-click slide-away: the container is [fold handle | body] and translates
   right by body + margin (cardFoldOffset, panelFold.ts) so the body parks
   off-screen while the handle stays flush at the viewport edge --- the
   SELECTION IS KEPT (halo stays; X = deselect as before, the handle = just
   tuck the card).  transform, not width: the card is an overlay, the canvas
   div never resizes, so React Flow needs no nudge.  The React Flow wrapper's
   overflow:hidden clips the parked body.  Fold state persists via
   panels.property, which is a READER PREFERENCE with its own key
   (state/prefs.ts) rather than a field of this tab's session -- so the
   tucked layout survives a reload, a new tab, and the next case. */
export function SelectionCard({ label, onClose, children, top = 52 }: {
  /** what the folded handle says is tucked */
  label: string;
  onClose: () => void;
  children: ReactNode;
  top?: number;
}) {
  const cardOpen = useStore((s) => s.panels.property);
  const togglePanel = useStore((s) => s.togglePanel);
  const reduceMotion = useReducedMotion();
  return (
    <Box
      data-selection-card=""
      style={{
        position: "absolute",
        right: CARD_MARGIN,
        top,
        zIndex: 7,
        width: CARD_HANDLE_W + CARD_BODY_W,
        maxHeight: `calc(var(--choupo-vh) - ${top + 108}px)`,
        // Clip to the rounded border so the inner ScrollArea is what
        // scrolls -- without this, content taller than maxHeight paints
        // PAST the card edge instead of scrolling (playground section).
        overflow: "hidden",
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        borderRadius: 8,
        border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
        background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))",
        boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
        transform: `translateX(${cardFoldOffset(!cardOpen)}px)`,
        transition: reduceMotion ? "none" : "transform 200ms ease",
      }}
    >
      <CardFoldHandle open={cardOpen} label={label} onToggle={() => togglePanel("property")} />
      <Box
        style={{
          position: "relative",
          width: CARD_BODY_W,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          // Folded: hide the body AFTER the slide (200ms delay) so its
          // X / links leave the tab order + a11y tree while parked
          // off-screen; unfolding flips it visible immediately so the
          // content is seen sliding back in.
          visibility: cardOpen ? "visible" : "hidden",
          transition: !cardOpen && !reduceMotion ? "visibility 0s linear 200ms" : "none",
        }}
      >
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          onClick={onClose}
          aria-label="Close"
          style={{ position: "absolute", right: 6, top: 6, zIndex: 1 }}
        >
          <IconX size={15} />
        </ActionIcon>
        <Box style={{ flex: 1, minHeight: 0 }}>
          {/* Contained boundary: a render error in the selection's details
              degrades to a small message INSIDE the card, never blanking the
              canvas + app (credo principle 5). */}
          <ErrorBoundary scope="selection card">{children}</ErrorBoundary>
        </Box>
      </Box>
    </Box>
  );
}

// The selection card's slim fold handle -- the always-visible strip on the
// card's inner (left) edge.  One click slides the card away to the right /
// pulls it back (the RailReopenTab idiom from the Property Explorer: whole
// strip = the click target, chevron + a vertical micro-label saying WHAT is
// tucked).  It travels WITH the card, so folded it peeks at the viewport edge.
function CardFoldHandle({ open, label, onToggle }: {
  open: boolean; label: string; onToggle: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Tooltip
      label={open ? "Tuck the card away ( ] )" : "Show the details card ( ] )"}
      withArrow
      position="left"
    >
      <Box
        onClick={onToggle}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        role="button"
        aria-label={open ? "tuck details card away" : "show details card"}
        aria-expanded={open}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); }
        }}
        style={{
          width: CARD_HANDLE_W,
          flexShrink: 0,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          paddingTop: 10,
          borderRight: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
          background: hover
            ? "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))"
            : "transparent",
          transition: "background 120ms",
        }}
      >
        {open ? (
          <IconChevronRight size={15} color="var(--mantine-color-dimmed)" />
        ) : (
          <>
            <IconChevronLeft size={15} color="var(--mantine-color-dimmed)" />
            <Text
              size="xs"
              fw={700}
              c="dimmed"
              style={{
                writingMode: "vertical-rl",
                letterSpacing: 0.5,
                userSelect: "none",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxHeight: 200,
              }}
            >
              {label}
            </Text>
          </>
        )}
      </Box>
    </Tooltip>
  );
}
