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
  EduToolsHome -- what the EduTools workspace shows when no tool is open
  (DEV.md 4c C251).

  Reshaped 2026-11-09 (Vítor: the guided sequences "não fazem sentido nenhum";
  "tudo por secções e com o Find logo muito destacado em cima").  Top to
  bottom: title and one sentence, a WIDE search field (focused on arrival), a
  count line, a one-line row of section links, then every live tool by
  section (METHOD_DISCIPLINES order).  Typing filters the page live with the
  SAME index and matcher as the Find dialog (eduToolsIndex.ts); a tool matched
  only inside a lesson shows that chapter as its reason.  No sequence is
  offered here (the registry keeps its path data for `&path=` links).  It reads the
  registry only and is not a panel or a menu.
\*---------------------------------------------------------------------------*/

import { Anchor, Box, Group, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCoarsePointer } from "./methodsChrome.js";
import { groupHits, type HomeMatch } from "./homeFilter.js";
import {
  METHOD_DISCIPLINES, METHOD_TOOLS, openMethodToolAt, openToolFromHome,
} from "./registry.js";

type IndexModule = typeof import("./eduToolsIndex.js");

export function EduToolsHome(): JSX.Element {
  const coarse = useCoarsePointer();
  const [query, setQuery] = useState("");
  const [mod, setMod] = useState<IndexModule | null>(null);
  const field = useRef<HTMLInputElement>(null);

  // The index is the Find's own, loaded lazily (its lesson text is a chunk).
  useEffect(() => {
    let live = true;
    import("./eduToolsIndex.js").then((m) => { if (live) setMod(m); }).catch(() => {});
    return () => { live = false; };
  }, []);
  // Focus on arrival, unless something already holds focus (a deep link).
  useEffect(() => {
    const a = document.activeElement;
    if (!a || a === document.body) field.current?.focus();
  }, []);

  const match: HomeMatch = useMemo(() => {
    if (query.trim() === "" || !mod) return groupHits([], "");
    return groupHits(mod.searchEduTools(mod.eduToolsIndex(), query, 100000), query);
  }, [mod, query]);

  const live = METHOD_TOOLS.filter((m) => m.status === "live");
  const searching = query.trim() !== "";
  // Until the index has loaded, a typed query cannot filter: show everything.
  const filtering = searching && mod !== null;
  const kept = (id: string) =>
    !filtering || (match.tools !== null && match.tools.has(id as never));
  const nKept = live.filter((m) => kept(m.id)).length;
  const sections = METHOD_DISCIPLINES.map((d) => ({
    d, tools: live.filter((m) => m.discipline === d && kept(m.id)),
  })).filter((s) => s.tools.length > 0);

  return (
    <Box data-method-home="" style={{ flex: 1, minHeight: 0, minWidth: 0,
      overflowY: "auto", padding: "12px 16px 24px" }}>
      <Stack gap="md" maw={1200} mx="auto">
        <Box>
          <Text fw={600} size="lg">EduTools</Text>
          <Text size="sm" c="dimmed">
            An EduTool is a method built in front of the student, step by
            step, and run on the same engine as the cases.
          </Text>
        </Box>

        <TextInput ref={field} data-method-home-search="" size={coarse ? "lg" : "xl"}
          value={query} onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
          placeholder="Find a method, a symbol, an equation…"
          aria-label="find in EduTools: every tool and chapter"
          leftSection={<IconSearch size={18} />} />

        <Text size="xs" c="dimmed" aria-live="polite" data-method-home-count="">
          {filtering ? `${nKept} of ${live.length} tools`
            : searching ? "Reading the lessons…" : `${live.length} tools`}
        </Text>

        {sections.length > 0 && (
          <Group gap="md" wrap="nowrap" data-method-home-jump=""
            style={{ overflowX: "auto" }}>
            <Text size="xs" c="dimmed" style={{ flex: "none" }}>Jump to</Text>
            {sections.map((s) => (
              <Anchor key={s.d} size="xs" style={{ flex: "none" }}
                href={`#method-section-${encodeURIComponent(s.d)}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(`method-section-${s.d}`)
                    ?.scrollIntoView?.({ block: "start" });
                }}>
                {s.d}
              </Anchor>
            ))}
          </Group>
        )}

        {filtering && nKept === 0 && (
          <Text size="sm">Nothing matches every word. Try fewer words, or a method, a model or a quantity.</Text>
        )}

        <Stack gap="md" data-method-home-shelves="">
          {sections.map((s) => (
            <Box key={s.d} component="section" id={`method-section-${s.d}`} data-method-shelf={s.d}
              style={{ marginTop: 14 }}>
              <Text size="lg" fw={600} mb={8}>
                {s.d} <Text span size="sm" c="dimmed" fw={400}>({s.tools.length})</Text>
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xs">
                {s.tools.map((m) => {
                  const ch = match.chapter.get(m.id);
                  return (
                    <Box key={m.id} data-method-home-tool={m.id}
                      style={{ borderRadius: 4, minWidth: 0,
                        border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}>
                      <UnstyledButton onClick={() => openToolFromHome(m.id)}
                        style={{ display: "block", width: "100%", textAlign: "left",
                          padding: coarse ? "10px 12px" : "6px 10px" }}>
                        <Text size="sm" fw={600}>{m.label}</Text>
                        <Text size="xs" c="dimmed">{m.blurb}</Text>
                      </UnstyledButton>
                      {ch && (
                        <UnstyledButton data-method-home-chapter={m.id}
                          onClick={() => openMethodToolAt(m.id, ch.key)}
                          style={{ display: "block", width: "100%", textAlign: "left",
                            padding: coarse ? "4px 12px 10px" : "0 10px 6px" }}>
                          <Text size="xs">→ {ch.title}</Text>
                        </UnstyledButton>
                      )}
                    </Box>
                  );
                })}
              </SimpleGrid>
            </Box>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}
