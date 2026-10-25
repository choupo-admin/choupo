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
  origin -- the ORIGIN MARK every EduTool result panel carries, and the one
  legend the tool frame draws above every tool (DEV.md 4c C112, points 15
  and 18; the four words and their meanings live in originKinds.ts).

  A mark is a small row at the head of a result panel: the word "origin", one
  dotted badge per origin the panel's numbers have, and an optional short
  note (which witness ran, which source was read).  It is a WORD and a
  colour, never a colour alone.  Its meaning is printed in the legend, so
  the tooltip on a badge repeats what is already visible -- hover is never
  load-bearing (gui-credo §9).

  WHY A PANEL AND NOT EVERY VALUE.  The commander's ruling: a mark per value,
  or per panel where every value shares one, and no per-value provenance
  sheet.  Most panels on these pages are homogeneous -- a plot the engine
  drew, a table of the page's closed form -- so one mark covers them; where a
  panel mixes origins (an engine star on a closed-form fan), the mark names
  both and the legend of the plot says which trace is which.

  `data-origin` carries the kinds as a space-separated list, for the browser
  harness and for anyone auditing the page from its DOM.
\*---------------------------------------------------------------------------*/

import { useState } from "react";
import { Badge, Box, Group, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";

import {
  ORIGIN_COLOR, ORIGIN_KINDS, ORIGIN_MEANING, type OriginKind,
} from "./originKinds.js";

export { ORIGIN_KINDS, type OriginKind } from "./originKinds.js";

function asList(of: OriginKind | readonly OriginKind[]): readonly OriginKind[] {
  return typeof of === "string" ? [of] : of;
}

function OriginBadge({ kind }: { kind: OriginKind }): JSX.Element {
  return (
    <Tooltip withArrow multiline w={300} label={`${kind}: ${ORIGIN_MEANING[kind]}`}>
      <Badge size="xs" variant="dot" color={ORIGIN_COLOR[kind]} tt="none"
        style={{ flexShrink: 0 }} aria-label={`origin: ${kind}`}>
        {kind}
      </Badge>
    </Tooltip>
  );
}

/** The mark at the head of a result panel.  `of` names the origin(s) of the
 *  numbers in that panel; `note` says which witness, which source, which
 *  declared value -- short, it wraps, it is never elided. */
export function OriginMark({ of, note }: {
  of: OriginKind | readonly OriginKind[];
  note?: React.ReactNode;
}): JSX.Element {
  const kinds = asList(of);
  return (
    <Group gap={4} wrap="wrap" align="center" data-origin={kinds.join(" ")}
      style={{ minWidth: 0 }}>
      <Text size="xs" c="dimmed" tt="uppercase"
        style={{ letterSpacing: 0.5, fontWeight: 600, fontSize: 10 }}>
        origin
      </Text>
      {kinds.map((k) => <OriginBadge key={k} kind={k} />)}
      {note && (
        <Text size="xs" c="dimmed"
          style={{ whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.3,
            minWidth: 0, flex: "1 1 180px" }}>
          {note}
        </Text>
      )}
    </Group>
  );
}

/** The legend, drawn ONCE by the tool frame (MethodsWorkspace) above every
 *  tool: which origins THIS page's numbers have (from its registry entry),
 *  and -- one click away, in visible text -- what each of the four words
 *  means.  Folded by default so it costs one thin row. */
export function OriginLegend({ origins }: {
  origins: readonly OriginKind[];
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Box px={12} pb={4} style={{ flexShrink: 0 }} data-origin-legend="">
      <Group gap={4} wrap="wrap" align="center">
        {origins.length > 0 ? (
          <>
            <Text size="xs" c="dimmed">The numbers on this page come from:</Text>
            {origins.map((k) => <OriginBadge key={k} kind={k} />)}
          </>
        ) : (
          <Text size="xs" c="dimmed">
            This page computes and quotes no result: its symbols and
            constants are definitions, cited where they are made.
          </Text>
        )}
        <UnstyledButton onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{ fontSize: "var(--mantine-font-size-xs)",
            color: "var(--mantine-color-anchor)", textDecoration: "underline" }}>
          {open ? "hide what the origins mean" : "what the origins mean"}
        </UnstyledButton>
      </Group>
      {open && (
        <Stack gap={2} mt={4}>
          {ORIGIN_KINDS.map((k) => (
            <Group key={k} gap={6} wrap="nowrap" align="flex-start">
              <Box style={{ flexShrink: 0, width: 88 }}><OriginBadge kind={k} /></Box>
              <Text size="xs" style={{ whiteSpace: "normal", overflowWrap: "anywhere",
                lineHeight: 1.3, minWidth: 0 }}>
                {ORIGIN_MEANING[k]}.
              </Text>
            </Group>
          ))}
          <Text size="xs" c="dimmed" style={{ lineHeight: 1.3 }}>
            Each result panel carries its own mark.  A number quoted inside a
            derivation's prose names its source in the sentence that quotes it.
          </Text>
        </Stack>
      )}
    </Box>
  );
}
