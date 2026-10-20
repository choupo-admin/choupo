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
  EduToolsFind -- "Find in EduTools" (DEV.md 4c C113, part 2).

  One search over every EduTool: its name, its shelf, what it teaches, and
  every chapter of its lessons -- titles, text, the equation glossaries.  A
  result names the tool, the chapter and an excerpt with the hit, and opens
  the tool AT that chapter (`openMethodToolAt`, which also writes
  `&step=<chapter>` into the address, so the hit is a link a reader can
  share).

  Reached from two places that are one control: the EduTools tab's Tool menu
  ("Find in EduTools…") and the Find button on the line under the chooser,
  which every EduTools page shows.  Both call `openEduToolsFind()`; the
  dialog is drawn once, by MethodsWorkspace.

  THE INDEX IS LOADED ON FIRST USE, by a dynamic import of
  `eduToolsIndex.ts`: the lesson text is in its own chunk, fetched the first
  time somebody searches, and no Tool component is imported by it.
\*---------------------------------------------------------------------------*/

import { Badge, Box, Group, Loader, Modal, ScrollArea, Stack, Text, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { EduDoc, EduHit } from "./eduToolsIndex.js";
import { openMethodToolAt } from "./registry.js";

// ---- open / close, one home for both entry points --------------------------

let findOpen = false;
const listeners = new Set<() => void>();
const notify = () => { for (const fn of listeners) fn(); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function openEduToolsFind(): void { findOpen = true; notify(); }
export function closeEduToolsFind(): void { findOpen = false; notify(); }
function useFindOpen(): boolean {
  return useSyncExternalStore(subscribe, () => findOpen, () => findOpen);
}

// ---- the lazy index --------------------------------------------------------

type IndexModule = typeof import("./eduToolsIndex.js");
let indexPromise: Promise<IndexModule> | null = null;
function loadIndex(): Promise<IndexModule> {
  if (!indexPromise) indexPromise = import("./eduToolsIndex.js");
  return indexPromise;
}

const KIND_LABEL: Record<EduDoc["kind"], string> = {
  tool: "tool", step: "chapter", heading: "chapter", limit: "limit", source: "source",
};

/** Open a hit: the tool, at its chapter. */
export function openEduHit(doc: EduDoc): void {
  openMethodToolAt(doc.tool, doc.chapterKey);
}

export function EduToolsFind(): JSX.Element {
  const opened = useFindOpen();
  const [mod, setMod] = useState<IndexModule | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hl, setHl] = useState(0);

  useEffect(() => {
    if (!opened || mod) return;
    let live = true;
    loadIndex().then((m) => { if (live) setMod(m); })
      .catch((e: unknown) => { if (live) setLoadErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [opened, mod]);

  useEffect(() => { setHl(0); }, [query]);

  const hits: EduHit[] = useMemo(
    () => (mod ? mod.searchEduTools(mod.eduToolsIndex(), query) : []),
    [mod, query]);
  const cur = Math.min(hl, Math.max(hits.length - 1, 0));

  useEffect(() => {
    document.getElementById(`edu-find-${cur}`)?.scrollIntoView?.({ block: "nearest" });
  }, [cur]);

  const open = (h: EduHit | undefined) => {
    if (!h) return;
    openEduHit(h.doc);
    closeEduToolsFind();
  };

  return (
    <Modal
      opened={opened}
      onClose={closeEduToolsFind}
      title={<Text fw={700} size="sm" ff="monospace">Find in EduTools</Text>}
      size="lg"
    >
      <Stack gap="sm">
        <TextInput
          data-autofocus
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="A word or two: cavitation, Kremser, NPSH, entropy…"
          aria-label="search every EduTool and chapter"
          leftSection={<IconSearch size={14} />}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHl(Math.min(cur + 1, Math.max(hits.length - 1, 0))); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHl(Math.max(cur - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); open(hits[cur]); }
          }}
        />
        {loadErr ? (
          <Text size="xs" c="red">The EduTools index could not be loaded: {loadErr}</Text>
        ) : !mod ? (
          <Group gap={6}><Loader size="xs" /><Text size="xs" c="dimmed">Reading the lessons…</Text></Group>
        ) : query.trim() === "" ? (
          <Text size="xs" c="dimmed">
            Searches every EduTool — its name, its shelf, what it teaches — and every
            chapter of its lessons: titles, text and the meaning of each symbol.
            Several words narrow the search; accents and capitals do not matter.
          </Text>
        ) : (
          <Text size="xs" c="dimmed" aria-live="polite">
            {hits.length === 0 ? "Nothing matches every word."
              : `${hits.length}${hits.length >= 80 ? "+" : ""} match${hits.length === 1 ? "" : "es"}  ·  ↑↓ to move, Enter to open`}
          </Text>
        )}
        {hits.length > 0 && (
          <ScrollArea.Autosize mah={420} type="auto">
            <Stack gap={2} role="listbox" aria-label="EduTools chapters matching the search">
              {hits.map((h, i) => (
                <EduHitRow key={`${h.doc.tool}:${h.doc.kind}:${h.doc.chapterKey}:${i}`}
                  id={`edu-find-${i}`} hit={h} highlighted={i === cur}
                  onHover={() => setHl(i)} onOpen={() => open(h)} />
              ))}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Stack>
    </Modal>
  );
}

/** One result: the tool, the chapter, the excerpt with the hit.  Exported for
 *  the test that pins "a click opens THAT chapter". */
export function EduHitRow(props: {
  id: string; hit: EduHit; highlighted: boolean; onHover: () => void; onOpen: () => void;
}): JSX.Element {
  const { id, hit, highlighted, onHover, onOpen } = props;
  const d = hit.doc;
  return (
    <Box id={id} role="option" aria-selected={highlighted} px={8} py={6}
      onClick={onOpen} onMouseEnter={onHover}
      style={{
        cursor: "pointer", borderRadius: 3,
        backgroundColor: highlighted
          ? "light-dark(var(--mantine-color-accent-1), var(--mantine-color-dark-5))"
          : "transparent",
      }}>
      <Group gap={6} wrap="wrap">
        <Text size="sm" fw={600}>{d.toolLabel}</Text>
        <Badge size="xs" variant="light" color="gray">{KIND_LABEL[d.kind]}</Badge>
        <Text size="xs" c="dimmed">{d.discipline}</Text>
      </Group>
      {d.chapter && (
        <Text size="xs" mt={2}>→ {d.chapter}</Text>
      )}
      {hit.excerpt && (
        <Text size="xs" c="dimmed" mt={2} lineClamp={2}>
          {hit.excerpt.before}
          <Text span fw={700} c="var(--mantine-color-text)">{hit.excerpt.hit}</Text>
          {hit.excerpt.after}
        </Text>
      )}
    </Box>
  );
}
