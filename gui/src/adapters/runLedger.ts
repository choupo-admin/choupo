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
  runLedger -- what the in-browser ENGINE did on this page, written where
  anything that reads the page can read it: data attributes on <html>.

  WHY IT EXISTS (DEV.md 4c C122, 2026-10-20).  Three EduTools were published
  that day that nobody had seen run in a browser: the development containers
  have no Emscripten, so the WASM engine the site serves is exercised for the
  first time by a student.  The site smoke (`bin/drive-app --edutools`) opens
  every live tool in headless Chromium after the site is built, and it must be
  able to tell "this page ran the engine and the run finished" from "this page
  never asked" and from "the run failed" -- WITHOUT a word list about each
  page's text, which would be a claim about the app made by the tool testing
  it.  The facts already pass through ONE place: every engine run in the
  browser goes through `WasmAdapter.run`, and every refusal to load the engine
  through `resolveAdapter`.  So they are counted there, and nowhere else.

  THE ATTRIBUTES (absent until something happens -- silence means "the engine
  was never asked", which is itself a fact the smoke reports):
      data-run-state          "running" while any run is in flight, else "idle"
      data-engine-started     runs handed to a worker
      data-engine-done        runs the engine finished (exit 0)
      data-engine-failed      runs that did not finish (non-zero exit, a worker
                              error) -- NOT runs the page cancelled itself
      data-engine-cancelled   runs aborted by the page (a newer knob setting
                              supersedes the run in flight; that is routine)
      data-engine-failure     the most recent failure, one line: the binary and
                              the engine's own last error line
      data-engine-last-done   the most recent finished run: the binary and the
                              result blocks it carried (csvFiles, kpis, ...)
      data-engine-unavailable why the engine could not be loaded at all

  It is NOT test-only and NOT a second result channel: it carries counts and
  one line each, never numbers a page draws, and nothing in the app reads it.
  It costs a few attribute writes per run.  A non-browser caller (the unit
  tests, a node script) has no `document` and the ledger is then inert.
\*---------------------------------------------------------------------------*/

type Counter = "started" | "done" | "failed" | "cancelled";

function root(): HTMLElement | null {
  return typeof document !== "undefined" && document.documentElement
    ? document.documentElement : null;
}

function bump(el: HTMLElement, which: Counter): number {
  const key = `data-engine-${which}`;
  const n = Number(el.getAttribute(key) ?? "0") + 1;
  el.setAttribute(key, String(n));
  return n;
}

function count(el: HTMLElement, which: Counter): number {
  return Number(el.getAttribute(`data-engine-${which}`) ?? "0");
}

function refreshState(el: HTMLElement): void {
  const inFlight = count(el, "started")
    - count(el, "done") - count(el, "failed") - count(el, "cancelled");
  el.setAttribute("data-run-state", inFlight > 0 ? "running" : "idle");
}

const oneLine = (s: string, max = 300): string =>
  s.replace(/\s+/g, " ").trim().slice(0, max);

/** A run was handed to a worker. */
export function noteRunStarted(): void {
  const el = root();
  if (!el) return;
  bump(el, "started");
  refreshState(el);
}

/** A run settled.  `outcome` is what happened to it; `detail` is the binary
 *  plus, for a failure, the engine's own last error line, and for a finished
 *  run the result blocks it carried. */
export function noteRunSettled(
  outcome: "done" | "failed" | "cancelled", detail: string,
): void {
  const el = root();
  if (!el) return;
  bump(el, outcome);
  if (outcome === "failed") el.setAttribute("data-engine-failure", oneLine(detail));
  if (outcome === "done") el.setAttribute("data-engine-last-done", oneLine(detail));
  refreshState(el);
}

/** The engine could not be loaded at all (the hosted build refuses to run
 *  rather than fabricate numbers -- see adapters/index.ts). */
export function noteEngineUnavailable(reason: string): void {
  const el = root();
  if (!el) return;
  el.setAttribute("data-engine-unavailable", oneLine(reason));
}
