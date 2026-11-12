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
  count line, a grid of section tiles (C374), then every live tool by
  section (METHOD_DISCIPLINES order).  Typing filters the page live with the
  SAME index and matcher as the Find dialog (eduToolsIndex.ts); a tool matched
  only inside a lesson shows that chapter as its reason.  No sequence is
  offered here (the registry keeps its path data for `&path=` links).  It reads the
  registry only and is not a panel or a menu.
\*---------------------------------------------------------------------------*/

import { Box, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useCoarsePointer } from "./methodsChrome.js";
import { accentCss } from "./sectionAccents.js";
import { groupHits, type HomeMatch } from "./homeFilter.js";
import {
  METHOD_DISCIPLINES, METHOD_TOOLS, type MethodDiscipline, openMethodToolAt, openToolFromHome,
} from "./registry.js";

type IndexModule = typeof import("./eduToolsIndex.js");

/** One tile per section that has live tools, with the number of tools that
 *  survive the filter (the matches under a query, all of them otherwise). */
export function homeTiles(
  live: readonly { id: string; discipline: string }[],
  kept: (id: string) => boolean,
): { d: MethodDiscipline; n: number }[] {
  return METHOD_DISCIPLINES
    .filter((d) => live.some((m) => m.discipline === d))
    .map((d) => ({ d, n: live.filter((m) => m.discipline === d && kept(m.id)).length }));
}

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
  // One tile per section that has live tools; under a query its count is the
  // number of MATCHES and a section with none is dimmed (its shelf is hidden).
  const tiles = homeTiles(live, kept);

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

        <SimpleGrid cols={{ base: 2, md: 3, lg: 4 }} spacing="xs"
          data-method-home-tiles="" role="navigation" aria-label="EduTools sections">
          {tiles.map((t) => {
            const on = t.n > 0;
            return (
              <UnstyledButton key={t.d} component="a" className="choupo-edu-tile"
                data-method-tile={t.d} data-dim={on ? undefined : ""}
                aria-disabled={on ? undefined : true}
                tabIndex={on ? 0 : -1}
                href={`#method-section-${encodeURIComponent(t.d)}`}
                style={{ "--sec": accentCss(t.d) } as CSSProperties}
                onClick={(e) => {
                  e.preventDefault();
                  if (on) document.getElementById(`method-section-${t.d}`)
                    ?.scrollIntoView?.({ block: "start" });
                }}>
                <Text size="sm" fw={600} style={{ minWidth: 0 }}>{t.d}</Text>
                <Text size="sm" data-method-tile-count="" style={{ flex: "none" }}>{t.n}</Text>
              </UnstyledButton>
            );
          })}
        </SimpleGrid>

        {filtering && nKept === 0 && (
          <Text size="sm">Nothing matches every word. Try fewer words, or a method, a model or a quantity.</Text>
        )}

        <Stack gap="md" data-method-home-shelves="">
          {sections.map((s) => (
            <Box key={s.d} component="section" id={`method-section-${s.d}`} data-method-shelf={s.d}
              style={{ marginTop: 14, "--sec": accentCss(s.d) } as CSSProperties}>
              <Text size="lg" fw={600} mb={8} className="choupo-edu-heading">
                {s.d} <Text span size="sm" c="dimmed" fw={400}>({s.tools.length})</Text>
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xs">
                {s.tools.map((m) => {
                  const ch = match.chapter.get(m.id);
                  return (
                    <Box key={m.id} data-method-home-tool={m.id} className="choupo-edu-card"
                      style={{ borderRadius: 4, minWidth: 0 }}>
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
