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
  MethodsWorkspace — the body of EDUTOOLS, the classical METHOD CONSTRUCTIONS
  plane (ratified 2026-08-15; renamed and re-chromed 2026-08-16 on Vítor's
  order).  The file name and the `?workspace=methods` URL key are UNCHANGED —
  a deep link already in a student's notes is a contract, and a caption is not
  a reason to break one.

  The criterion that splits this plane from the Property Explorer:
      method-construction → EduTools;  property-surface → Explorer.
  A property surface answers "what does this system's property look like?"
  (T-x-y, γ(x), a Psat scan — the Explorer).  A method construction answers
  "what does the CLASSICAL GRAPHICAL METHOD say about a design question?"
  (operating lines + staircase, process paths on a state chart — here).

  Inherits the Explorer's guard-rails unchanged (gui-credo §3 + §9):
  ephemeral, on-demand (Esc closes via the AppShell), and above all ZERO
  physics in TS — every curve is an engine (WASM choupoProps) run over a
  transient synthesized case, or an engine-written CSV.  The construction
  drawn ON the engine's curve (staircase walking, tie-lines) is pure geometry
  in the shared plotting kit.  The "Author → copy propsDict" hand-off stays:
  dict-on-disk remains the one authoring channel.

  THE CHOOSER IS BACK IN THIS FILE, AND IT IS NOT THE RAIL (2026-08-17).

  Read the two rulings in order, because the second does not reverse the first.
  On 2026-08-16 Vítor OVERRULED the rail design: the tool list had been a
  permanent 252 px left band, an absolutely-positioned tool panel painted
  straight over it (the cooling tower did), and with the rail covered there was
  nothing left to select with.  The overlap was a bug and was fixed on its own;
  the RAIL was a separate judgement, and the ruling was that **a chooser does
  not get to own a permanent band**.  The top bar's EduTools dropdown replaced
  it — zero pixels when shut.

  On 2026-08-17 EduTools became its own TAB (docs/design/one-tab-one-thing.md),
  and that top-bar dropdown left the case tab's menu with it: Vítor, "E no
  flowsheet eu não quero no menu EduTools nem Explore!".  Which removes the
  only chooser there was.  The record names this exactly (§4, and the third
  falsifier written into modes-and-views-in-the-top-row.md §7.5 an hour before
  the decision): "If the tools live in their own tab, that tab must be able to
  change tool without the app's workspace menu."

  So the chooser returns as ONE SLIM ROW IN NORMAL FLOW — a labelled `Select`,
  ~34 px tall, capped at 340 px wide and shrinking to the viewport below that.
  It obeys the 2026-08-16 ruling rather than working around it:

    * it owns NO permanent band — a row, not a column, and the diagram keeps
      the full width the rail's removal gave it;
    * it CANNOT be painted over, because it is a flow sibling of the tool and
      not a box the tool's absolute panels can be positioned above.  That was
      the concrete failure the rail died of, and the fix is structural rather
      than a z-index;
    * its list is the SAME `METHOD_TOOLS` — one home, and the planned entries
      stay VISIBLE and disabled, which is the registry's own stated rule (the
      list is the roadmap, stated rather than implied).

  A `Select` and not a Menu: it is a form control, so it is keyboard- and
  touch-native without any of that being re-implemented, its closed footprint
  is one row, and its dropdown is a portal that exists only while open.

  AND ON A TOOL TAB THAT ROW IS GONE AGAIN (2026-08-18) — not reversed, moved.
  The row above it had meanwhile lost `File` (ui/tabChrome.ts: a tool tab has
  no case to operate on), which left a tool tab wearing TWO bands of chrome,
  the upper one nearly empty: measured at 1400x900, one control in it (Help,
  49 px) against the top bar's 293 px minimum — 362 px spoken for, 1038 px
  free — over a second full-width band holding one Select and costing the
  construction 39 px (45 px at 390x844, where the touch posture's input is
  taller).  Vítor: "a selecção da tool escusa de ocupar uma linha, quando a
  linha do menu de cima está quase vazia!"

  So on a TOOL tab the chooser leads the chrome row (MenuBar's `ToolMenu`) and
  this row does not render; on a CASE tab showing EduTools in its body it stays
  exactly as described above, because that row belongs to the case.  The
  placement is `tabKindFor` — the SAME derivation MenuBar reads, asked twice
  rather than handed over — see the note at the render.

  What stays: the one-line "teaches" caption + the Theory Guide link
  (TeachesLine), now rendered above EVERY tool from this one place.  The McCabe
  R/q controls pane is INSIDE the shared plotting/McCabePlot.tsx and is not
  reachable from this host.

  THE SETUP CONTROLS ARE A LEFT PANEL (2026-08-18, Vítor's decision).  Every
  tool's knobs used to be a horizontal strip above its diagram, folding to a
  slim restore bar under `choupo.methods.controlsCollapsed`.  They are now the
  docked, resizable, keyboard-reachable setup panel every other rail in this app
  already had — ui/methods/knobPanel.tsx, declared once in ui/panelContract.tsx
  as METHOD_KNOBS_PANEL, stored once in state/prefs.ts as PANELS.methodKnobsRail
  (which KEEPS that same fold key: same question, same spelling, one home).  The
  two tools in this file follow the same rule as the ten lazy ones — inputs on
  the left, the construction and everything that reports a number on the right —
  so `ToolField`, `SetupCollapseButton` and `SetupCollapsedStrip` left with the
  strip they served; see the note where they stood.
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  The engine bench shared by the method tools: the single-run engine feed
  (useEngineCsv) and the authoring hand-off footer.  Moved out of
  MethodsWorkspace.tsx (C535) so a chapter file imports them without an
  import cycle through the workspace.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Code, Collapse, CopyButton, Group, Stack, Text } from "@mantine/core";
import { resolveAdapter } from "../../adapters/index.js";
import { EXPLORE_OUTPUT, synthesizeExploreCase, type ExploreSpec } from "../../case/exploreSynth.js";
import { fromJson, serialize } from "../../dict/index.js";

// ---- The engine runner ------------------------------------------------------
// The SAME feeding machinery the Explorer uses (resolveAdapter("wasm") over a
// synthesized transient choupoProps case), reduced to the single-run shape the
// method tools need.  Debounced; a newer spec aborts the in-flight run.
//  THE RUN'S DIAGNOSTICS TRAVEL TOO, and until now they did not.  This hook
//  had the whole RunResult in hand and returned the CSV and the advisories,
//  so every number an op PUBLISHES about the chart it drew was discarded at
//  this line.  The psychrometric op publishes `Lewis_last` and says in its
//  own source why ("a reader with only the curves cannot tell which
//  situation is on the chart"), and no surface in the GUI could reach it.
export function useEngineCsv(spec: ExploreSpec | null): {
  csv: string | null; err: string | null; busy: boolean; advisories: string[];
  diags: Record<string, number> | null;
} {
  const [csv, setCsv] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [advisories, setAdvisories] = useState<string[]>([]);
  const [diags, setDiags] = useState<Record<string, number> | null>(null);
  const runSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!spec) {
      abortRef.current?.abort();
      setCsv(null); setErr(null); setAdvisories([]); setDiags(null);
      setBusy(false);
      return;
    }
    const t = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const seq = ++runSeq.current;
      setBusy(true); setErr(null);
      void (async () => {
        try {
          const resolved = await resolveAdapter("wasm");
          if (seq !== runSeq.current) return;
          if (resolved.kind === "unavailable") {
            setErr(resolved.fallbackReason
              ?? "The real solver could not be loaded (build the WASM).");
            setBusy(false);
            return;
          }
          const result = await resolved.adapter.run(
            synthesizeExploreCase(spec), () => {}, ctrl.signal, "choupoProps");
          if (seq !== runSeq.current) return;
          const out = result.csvFiles?.[EXPLORE_OUTPUT];
          // Honesty: the tools show no log tab — lift the engine's advisory
          // lines off the run log so they are SEEN, never swallowed.
          setAdvisories(
            (result.log.match(/^\s*\[advisory\].*$/gm) ?? []).map((s) => s.trim()));
          setDiags(result.operationResults?.[0]?.diagnostics ?? null);
          if (out) { setCsv(out); setErr(null); }
          else {
            const detail = result.log.split("\n").map((l) => l.trim()).reverse()
              .find((l) => /(?:error|fatal|refused|failed)/i.test(l));
            setErr(result.status !== "done"
              ? `choupoProps did not finish${detail ? `: ${detail}` : "."}`
              : "No data — the engine returned an empty result for this construction.");
          }
        } catch (e) {
          if (seq === runSeq.current && !ctrl.signal.aborted)
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
          if (seq === runSeq.current) setBusy(false);
        }
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [spec]);
  return { csv, err, busy, advisories, diags };
}

/** The authoring hand-off (unchanged from the Explorer — guard-rail 2): the
 *  tool EMITS the propsDict for the student / agent to author on disk.
 *  Dict-on-disk stays the source of truth; the workspace never writes it. */
export function HandOffFooter({ spec, alerts }: { spec: ExploreSpec | null; alerts: React.ReactNode[] }) {
  const [open, setOpen] = useState(false);
  const snippet = useMemo(() => {
    if (!spec) return "(no run yet)";
    try { return serialize(fromJson(synthesizeExploreCase(spec).propsDict!)); }
    catch { return "(invalid spec)"; }
  }, [spec]);
  return (
    <Box style={{ flexShrink: 0, padding: "4px 12px 8px",
      borderTop: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}>
      {alerts.length > 0 && <Stack gap={6} mb={6}>{alerts}</Stack>}
      <Group gap="xs" wrap="nowrap" align="center">
        <Button variant="subtle" size="compact-xs" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide propsDict" : "Author → copy propsDict"}
        </Button>
      </Group>
      <Collapse in={open}>
        <Stack gap={4} mt={6}>
          <Text size="xs" c="dimmed">
            Create or open a case, then put this block in <code>system/propsDict</code> under
            <code> operations ( … )</code>; keep <code>constant/thermoPhysPropDict</code> in sync with
            the components/models above, and <code>runCase</code>.
          </Text>
          <Group gap="xs">
            <CopyButton value={snippet}>
              {({ copied, copy }) => (
                <Button size="xs" variant={copied ? "filled" : "light"} color="accent" onClick={copy}>
                  {copied ? "Copied ✓" : "Copy propsDict"}
                </Button>
              )}
            </CopyButton>
          </Group>
          <Code block style={{ fontSize: 11, maxHeight: 200, overflow: "auto" }}>{snippet}</Code>
        </Stack>
      </Collapse>
    </Box>
  );
}
