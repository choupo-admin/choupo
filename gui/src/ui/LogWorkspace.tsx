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
  LogWorkspace -- the Log top-menu workspace (Fase B).

  Two-column layout, no canvas:

    left   ~260 px  Jump list.  The C++ engine writes a
                    >>>  Unit [k]:  <qualified.name>   (type = <T>)
                    banner before every unit it solves; we parse those
                    out of runLog and turn each into a clickable jump
                    that scrolls the right-hand log to that line.
                    A search box above filters the jump list (matches
                    on the unit name OR the type).
    centre 1fr      The raw run log in a monospace pre.  Each line
                    becomes a <div id="logln-<N>"> so the jump targets
                    can scrollIntoView the right header band.  The
                    banner lines for the selected unit are highlighted
                    so the eye lands on the right place after the
                    jump.

  Pre-run the workspace shows an explanatory empty state -- the user
  knows that the Log is post-run only, not the wrong place to look
  for the case description.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Box,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconSearch } from "@tabler/icons-react";

import { useStore } from "../state/store.js";

interface JumpEntry {
  unitIndex: number;        // C++ "[k]" in the banner
  qualifiedName: string;    // e.g. "CONCENTRATION.Evap1"
  type: string;             // e.g. "evaporator"
  line: number;             // 1-based line number where the banner starts
}

// Parse the runLog for ">>>  Unit [k]:  <name>   (type = <T>)" banners
// the C++ engine emits per unit.  Returns one JumpEntry per match in
// source order so the navigator's order matches the solve order.
function parseJumps(log: string): JumpEntry[] {
  const out: JumpEntry[] = [];
  if (!log) return out;
  const lines = log.split("\n");
  const re = /^>>>\s+Unit\s+\[(\d+)\]:\s+(\S+)\s+\(type\s*=\s*(\S+)\s*\)/;
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i] ?? "");
    if (m) {
      out.push({
        unitIndex: parseInt(m[1]!, 10),
        qualifiedName: m[2]!,
        type: m[3]!,
        line: i + 1,
      });
    }
  }
  return out;
}

// Strip the namespacing prefix so the jump list reads as just
// "Evap1" / "Cryst" rather than "CONCENTRATION.Evap1".  The full
// qualified name appears in the row's tooltip / subtitle.
function leafName(qname: string): string {
  const i = qname.lastIndexOf(".");
  return i < 0 ? qname : qname.slice(i + 1);
}

// First segment of the qualified name; the sector for fractal cases
// ("CONCENTRATION.Evap1" -> "CONCENTRATION") or a synthetic "(top)"
// group when the case is flat (units carry no namespace dot).
function sectorOf(qname: string): string {
  const i = qname.indexOf(".");
  return i < 0 ? "(top)" : qname.slice(0, i);
}

interface SectorGroup {
  sector: string;
  jumps: JumpEntry[];
}

function groupBySector(jumps: JumpEntry[]): SectorGroup[] {
  const order: string[] = [];
  const map = new Map<string, JumpEntry[]>();
  for (const j of jumps) {
    const s = sectorOf(j.qualifiedName);
    if (!map.has(s)) { map.set(s, []); order.push(s); }
    map.get(s)!.push(j);
  }
  return order.map((s) => ({ sector: s, jumps: map.get(s)! }));
}

export function LogWorkspace() {
  const log = useStore((s) => s.runLog);
  const status = useStore((s) => s.runStatus);
  const [filter, setFilter] = useState("");
  const [selectedLine, setSelectedLine] = useState<number | null>(null);

  const jumps = useMemo(() => parseJumps(log), [log]);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return jumps;
    return jumps.filter((j) =>
      j.qualifiedName.toLowerCase().includes(q) || j.type.toLowerCase().includes(q),
    );
  }, [jumps, filter]);
  const groups = useMemo(() => groupBySector(filtered), [filtered]);

  // Per-sector collapse state, keyed by sector name.  All expanded by
  // default so the student sees every solve-order entry on open; the
  // chevron is for focus, not for hiding work they don't know exists.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleSector = (s: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });

  // Auto-scroll the log to the bottom when fresh content arrives
  // (and the user hasn't jumped somewhere).  Mirrors the legacy
  // bottom-output-panel LogView behaviour (OutputPanel.tsx, removed
  // 2026-06-11).
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedLine !== null) return;
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log, selectedLine]);

  const jumpTo = (line: number) => {
    setSelectedLine(line);
    const el = document.getElementById(`logln-${line}`);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  // Empty state -- pre-run or after a freshly-loaded case.
  if ((status === "idle" || status === "running") && log.length < 100) {
    return (
      <Stack align="center" justify="center" h="100%" p="xl" gap="sm">
        <Text c="dimmed" size="xl" fw={600}>
          No run yet
        </Text>
        <Text c="dimmed" size="sm" ta="center" maw={440}>
          Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> (or the Run button) to
          execute the case.  The solver log will appear here in real time,
          and the navigator on the left will list every unit operation
          as it is solved.
        </Text>
      </Stack>
    );
  }

  const lines = log.split("\n");

  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        gridTemplateRows: "1fr",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Jump list */}
      <Box
        style={{
          borderRight: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
          background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
          overflow: "hidden",
          minHeight: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box p="xs" style={{ flex: "0 0 auto" }}>
          <Text size="xs" c="dimmed" tt="uppercase" mb={6}
            style={{ letterSpacing: 0.5, fontWeight: 600 }}>
            Jump to unit
          </Text>
          <TextInput
            size="xs"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
            leftSection={<IconSearch size={12} />}
          />
        </Box>
        <Box style={{ flex: 1, minHeight: 0 }}>
          <ScrollArea
            type="always"
            scrollbarSize={10}
            h="100%"
            styles={{ thumb: { background: "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))" } }}
          >
            <Stack gap={0} px="xs" pb="xs">
              {jumps.length === 0 && (
                <Text size="xs" c="dimmed" px="xs" mt={4}>
                  No unit banners found in the log yet.
                </Text>
              )}
              {jumps.length > 0 && filtered.length === 0 && (
                <Text size="xs" c="dimmed" px="xs" mt={4}>
                  No match.
                </Text>
              )}
              {groups.map((g) => {
                const isCollapsed = collapsed.has(g.sector);
                return (
                  <Stack key={g.sector} gap={0} mb={2}>
                    {/* Sector header: chevron + label + count.  Always
                        rendered (even for flat cases where sector is
                        "(top)") so the structure is consistent. */}
                    <Group
                      gap={4}
                      wrap="nowrap"
                      style={{ cursor: "pointer", padding: "4px 4px 2px" }}
                      onClick={() => toggleSector(g.sector)}
                    >
                      <ActionIcon
                        variant="transparent"
                        size="xs"
                        c="dimmed"
                        onClick={(e) => { e.stopPropagation(); toggleSector(g.sector); }}
                      >
                        {isCollapsed
                          ? <IconChevronRight size={12} />
                          : <IconChevronDown size={12} />}
                      </ActionIcon>
                      <Text
                        size="xs"
                        fw={600}
                        c={g.sector === "(top)" ? "var(--mantine-color-text)" : "accent"}
                        tt={g.sector === "(top)" ? undefined : "uppercase"}
                        style={{ letterSpacing: g.sector === "(top)" ? 0 : 0.4, flex: 1 }}
                      >
                        {g.sector === "(top)" ? "Units" : g.sector}
                      </Text>
                      <Text size="10px" c="dimmed" ff="monospace">
                        {g.jumps.length}
                      </Text>
                    </Group>
                    {!isCollapsed && g.jumps.map((j) => {
                      const isSelected = j.line === selectedLine;
                      return (
                        <Group
                          key={j.line}
                          gap={6}
                          wrap="nowrap"
                          style={{
                            cursor: "pointer",
                            padding: "3px 6px 3px 22px",
                            background: isSelected
                              ? "light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-5))"
                            : undefined,
                            borderLeft: isSelected
                              ? "2px solid var(--mantine-color-accent-3)"
                            : "2px solid transparent",
                          }}
                          onClick={() => jumpTo(j.line)}
                        >
                          <Text size="10px" c="dimmed" ff="monospace" style={{ width: 28 }}>
                            [{j.unitIndex}]
                          </Text>
                          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                            <Text size="xs" c="var(--mantine-color-text)"
                              style={{ wordBreak: "break-all" }}>
                              {leafName(j.qualifiedName)}
                            </Text>
                            <Text size="10px" c="dimmed" ff="monospace" truncate="end">
                              {j.type}
                            </Text>
                          </Stack>
                        </Group>
                      );
                    })}
                  </Stack>
                );
              })}
            </Stack>
          </ScrollArea>
        </Box>
      </Box>

      {/* Log viewer */}
      <Box
        style={{
          background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-9))",
          overflow: "hidden",
          minHeight: 0,
          height: "100%",
        }}
      >
        <ScrollArea
          type="always"
          scrollbarSize={10}
          h="100%"
          styles={{ thumb: { background: "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))" } }}
          viewportRef={logRef}
        >
          <Box style={{
            padding: "10px 14px",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
            lineHeight: 1.5,
            color: "light-dark(var(--mantine-color-gray-8), var(--mantine-color-dark-0))",
            minHeight: "100%",
          }}>
            {lines.map((line, i) => {
              const lineNo = i + 1;
              const isUnitBanner = /^>>>/.test(line);
              const isSelected = lineNo === selectedLine
                || (selectedLine !== null
                    && Math.abs(lineNo - selectedLine) <= 2
                    && /^>>>/.test(lines[selectedLine - 1] ?? ""));
              return (
                <div
                  key={i}
                  id={`logln-${lineNo}`}
                  style={{
                    whiteSpace: "pre",
                    color: isUnitBanner
                      ? "light-dark(var(--mantine-color-accent-7), var(--mantine-color-accent-3))"
                    : "light-dark(var(--mantine-color-gray-8), var(--mantine-color-dark-0))",
                    fontWeight: isUnitBanner ? 600 : 400,
                    background: isSelected
                      ? "rgba(38, 198, 218, 0.08)"
                    : undefined,
                  }}
                >
                  {line || " "}
                </div>
              );
            })}
          </Box>
        </ScrollArea>
      </Box>
    </Box>
  );
}
