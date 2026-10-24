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
  ChapterIndex -- the compact chapter index of a long EduTool (DEV.md 4c
  C113, part 3), and the one place a chapter REQUEST (a Find hit, a
  `&step=` deep link, a "continue to" link) is carried out.

  WHAT IT IS.  A button on the line under the tool chooser, naming the
  chapter the reader is in; it opens a list of the page's chapters, read off
  the RENDERED page (chapters.ts says why), the current one marked, with
  "Back to top" and -- when the page has them -- "Limits" and "Sources" at
  the head of the list.  Choosing one scrolls the page there and writes
  `&step=<chapter>` into the address.  It is a popover, folded by default:
  NO permanent sidebar, because the construction owns the width (credo §9).
  A page with fewer than LONG_PAGE_CHAPTERS chapters shows no button at all.

  ON A PHONE the button is the icon and the chapter's number, the list is as
  wide as the screen less its gutters (`chapterListWidth`), and a choice
  closes it -- the same posture as every other narrow control here.

  THE PAGE IS WATCHED, NOT READ ONCE.  A tool is lazy, its runs arrive
  later and some sections appear only after them, so the chapters are
  re-read on every DOM mutation (coalesced to one animation frame) and the
  current chapter on every scroll inside the page (a capture listener: the
  page's scroller is the tool's own, not this component's).  A pending
  chapter request is retried on each re-read until its heading exists, and
  dropped after REQUEST_PATIENCE_MS so a link to a chapter the page does not
  draw opens the page at the top instead of jumping later, unasked.
\*---------------------------------------------------------------------------*/

import { Box, Button, Divider, Group, Popover, ScrollArea, Text, UnstyledButton } from "@mantine/core";
import { IconArrowBarToUp, IconListDetails } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import {
  CHAPTER_SELECTOR, LONG_PAGE_CHAPTERS, chapterListWidth, chapterOf, currentChapterIndex,
  isLimitsHeading, isSourcesHeading, resolveChapter, scrollToTop, type Chapter,
} from "./chapters.js";
import { useNarrowViewport } from "./methodsChrome.js";
import {
  clearMethodChapterRequest, setMethodChapterInUrl, useMethodChapterRequest,
  type MethodToolId,
} from "./registry.js";

/** How long a chapter request waits for its heading to be drawn. */
export const REQUEST_PATIENCE_MS = 8000;

/** The reading line: a heading this far below the top of the page counts as
 *  the chapter being read. */
const READING_LINE_PX = 96;

interface Seen { chapters: Chapter[]; els: Element[] }

function readChapters(root: Element): Seen {
  const els: Element[] = [];
  const chapters: Chapter[] = [];
  for (const el of root.querySelectorAll(CHAPTER_SELECTOR)) {
    const c = chapterOf(el);
    if (c) { els.push(el); chapters.push(c); }
  }
  return { chapters, els };
}

function scrollToElement(el: Element): void {
  el.scrollIntoView?.({ block: "start", behavior: "smooth" });
}

export function ChapterIndex({ rootRef, tool }: {
  rootRef: RefObject<HTMLElement>; tool: MethodToolId;
}): JSX.Element | null {
  const narrow = useNarrowViewport();
  const [seen, setSeen] = useState<Seen>({ chapters: [], els: [] });
  const [current, setCurrent] = useState(-1);
  const [opened, setOpened] = useState(false);
  const request = useMethodChapterRequest();
  const seenRef = useRef(seen);
  seenRef.current = seen;

  const measureCurrent = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const line = root.getBoundingClientRect().top + READING_LINE_PX;
    setCurrent(currentChapterIndex(
      seenRef.current.els.map((e) => e.getBoundingClientRect().top), line));
  }, [rootRef]);

  // Re-read the chapters whenever the page changes; re-measure on scroll.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const reread = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const s = readChapters(root);
        const prev = seenRef.current;
        const same = s.chapters.length === prev.chapters.length
          && s.els.every((e, i) => e === prev.els[i]);
        if (!same) { seenRef.current = s; setSeen(s); }
        measureCurrent();
      });
    };
    reread();
    const mo = new MutationObserver(reread);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    root.addEventListener("scroll", reread, true);
    return () => {
      mo.disconnect();
      root.removeEventListener("scroll", reread, true);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [rootRef, tool, measureCurrent]);

  // Carry out a pending chapter request once its heading exists.  The
  // patience is counted from the request, not from the last re-read.
  const started = useRef<{ seq: number; at: number } | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { for (const a of settle.current) clearTimeout(a); }, [tool]);
  useEffect(() => {
    if (!request || request.tool !== tool) return;
    const root = rootRef.current;
    if (!root) return;
    if (!started.current || started.current.seq !== request.seq)
      started.current = { seq: request.seq, at: Date.now() };
    const el = resolveChapter(root, request.key);
    if (el) {
      clearMethodChapterRequest(request.seq);
      // Jump now, and again once the page has settled: a lazy tool's runs
      // and plots arrive after its text and push the heading down.
      // (The timers live in a ref: clearing the request re-runs this
      // effect, and its cleanup must not cancel them.)
      el.scrollIntoView?.({ block: "start" });
      for (const a of settle.current) clearTimeout(a);
      settle.current = [600, 1800].map((ms) => setTimeout(() => {
        if (el.isConnected) el.scrollIntoView?.({ block: "start" });
      }, ms));
      return;
    }
    const left = REQUEST_PATIENCE_MS - (Date.now() - started.current.at);
    const t = setTimeout(() => clearMethodChapterRequest(request.seq), Math.max(0, left));
    return () => clearTimeout(t);
  }, [request, tool, seen, rootRef]);

  if (seen.chapters.length < LONG_PAGE_CHAPTERS) return null;

  const go = (i: number) => {
    const el = seen.els[i];
    const c = seen.chapters[i];
    if (!el || !c) return;
    scrollToElement(el);
    setMethodChapterInUrl(c.key);
    setOpened(false);
  };
  const top = () => {
    const root = rootRef.current;
    if (root) scrollToTop(root);
    setMethodChapterInUrl(null);
    setOpened(false);
  };
  const limitsAt = seen.chapters.findIndex((c) => isLimitsHeading(c.title));
  const sourcesAt = seen.chapters.findIndex((c) => isSourcesHeading(c.title));
  const cur = seen.chapters[current];

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" withArrow
      shadow="md" width={chapterListWidth(typeof window === "undefined" ? 1280 : window.innerWidth)}
      withinPortal>
      <Popover.Target>
        <Button size="compact-xs" variant="default"
          onClick={() => setOpened((o) => !o)}
          leftSection={<IconListDetails size={14} />}
          aria-label={`chapters of this page${cur ? `; now at: ${cur.title}` : ""}`}
          aria-expanded={opened}
          styles={{ root: { flexShrink: 1, minWidth: 0, maxWidth: narrow ? 120 : 280 },
                    label: { overflow: "hidden", textOverflow: "ellipsis" } }}>
          {chapterButtonLabel(seen.chapters, current, narrow)}
        </Button>
      </Popover.Target>
      <Popover.Dropdown p={6}>
        <ChapterList chapters={seen.chapters} current={current}
          limitsAt={limitsAt} sourcesAt={sourcesAt}
          onChapter={go} onTop={top} />
      </Popover.Dropdown>
    </Popover>
  );
}

/** What the button says: on a desk the chapter being read, on a phone only
 *  where in the page the reader is. */
export function chapterButtonLabel(chapters: readonly Chapter[], current: number, narrow: boolean): string {
  const n = chapters.length;
  if (current < 0 || !chapters[current]) return narrow ? `${n}` : `Chapters (${n})`;
  return narrow ? `${current + 1}/${n}` : chapters[current]!.title;
}

/** The list inside the popover.  Exported for the static-render test. */
export function ChapterList({ chapters, current, limitsAt, sourcesAt, onChapter, onTop }: {
  chapters: readonly Chapter[]; current: number; limitsAt: number; sourcesAt: number;
  onChapter: (i: number) => void; onTop: () => void;
}): JSX.Element {
  return (
    <Box>
      <Group gap={4} wrap="wrap" mb={4}>
        <Button size="compact-xs" variant="subtle" onClick={onTop}
          leftSection={<IconArrowBarToUp size={12} />}>Back to top</Button>
        {limitsAt >= 0 && (
          <Button size="compact-xs" variant="subtle" onClick={() => onChapter(limitsAt)}>Limits</Button>
        )}
        {sourcesAt >= 0 && (
          <Button size="compact-xs" variant="subtle" onClick={() => onChapter(sourcesAt)}>Sources</Button>
        )}
      </Group>
      <Divider mb={4} />
      <ScrollArea.Autosize mah={360} type="auto">
        <nav aria-label="chapters of this page">
          {chapters.map((c, i) => (
            <UnstyledButton key={`${i}:${c.key}`} onClick={() => onChapter(i)}
              aria-current={i === current ? "location" : undefined}
              data-current={i === current ? "" : undefined}
              style={{
                display: "block", width: "100%", textAlign: "left", borderRadius: 3,
                padding: c.level === 4 ? "4px 6px" : "3px 6px 3px 18px",
                backgroundColor: i === current
                  ? "light-dark(var(--mantine-color-accent-1), var(--mantine-color-dark-5))"
                  : undefined,
                borderLeft: i === current ? "3px solid var(--mantine-color-accent-6)" : "3px solid transparent",
              }}>
              <Text size="xs" fw={c.level === 4 || i === current ? 600 : 400} lineClamp={2}>
                {c.title}
              </Text>
            </UnstyledButton>
          ))}
        </nav>
      </ScrollArea.Autosize>
    </Box>
  );
}
