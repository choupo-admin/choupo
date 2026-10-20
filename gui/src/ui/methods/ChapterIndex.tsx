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
  ChapterIndex -- the one place a chapter REQUEST (a Find hit, a `&step=`
  deep link, a "continue to" link) is carried out on an EduTool's page
  (DEV.md 4c C113).

  A tool is lazy, its runs arrive later and some sections appear only after
  them, so the request is retried on every change of the page (a
  MutationObserver, coalesced to one animation frame) until the heading it
  names exists (chapters.ts `resolveChapter`), and dropped after
  REQUEST_PATIENCE_MS so a link to a chapter the page does not draw opens the
  page at the top instead of jumping later, unasked.
\*---------------------------------------------------------------------------*/

import { useEffect, useRef, useState, type RefObject } from "react";

import { resolveChapter } from "./chapters.js";
import {
  clearMethodChapterRequest, useMethodChapterRequest, type MethodToolId,
} from "./registry.js";

/** How long a chapter request waits for its heading to be drawn. */
export const REQUEST_PATIENCE_MS = 8000;

export function ChapterIndex({ rootRef, tool }: {
  rootRef: RefObject<HTMLElement>; tool: MethodToolId;
}): JSX.Element | null {
  const request = useMethodChapterRequest();
  const [tick, setTick] = useState(0);

  // Re-try whenever the page changes.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const bump = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; setTick((t) => t + 1); });
    };
    const mo = new MutationObserver(bump);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { mo.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [rootRef, tool]);

  // Carry out a pending chapter request once its heading exists.  The
  // patience is counted from the request, not from the last re-try.
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
      // and plots arrive after its text and push the heading down.  (The
      // timers live in a ref: clearing the request re-runs this effect, and
      // its cleanup must not cancel them.)
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
  }, [request, tool, tick, rootRef]);

  return null;
}
