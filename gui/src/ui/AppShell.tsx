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
  Main app layout.  Single combined header row (menu items + brand +
  case + Run button) at 32 px, canvas filling the rest.  No permanent
  side or bottom panels --- the previous bottom output panel and right
  PropertyPanel were removed in Fase A of the workspaces redesign
  (2026-05-27; the orphaned OutputPanel.tsx itself was deleted
  2026-06-11).  Per-workspace UI (Streams / Plots / Log / Thermo /
  Case / Reports) returned as the on-demand workspaces opened from the
  top menu in Fase B.

  ┌────────────────────────────────────────────────────────┐
  │   File Streams Plots Log Thermo Case Reports … [▶ Run] │  32px
  ├────────────────────────────────────────────────────────┤
  │                                                        │
  │                 FlowCanvas (full screen)               │
  │                                                        │
  └────────────────────────────────────────────────────────┘

  PropsView remains the centre when the case is a `choupoProps` case
  (carries `propsDict`, no `flowsheet`).
\*---------------------------------------------------------------------------*/

import { Box } from "@mantine/core";
import { Suspense, lazy, useEffect } from "react";

import { useStore, hasCaseOpen } from "../state/store.js";
import { AgentConsole } from "./AgentConsole.js";
import { CaseWorkspace } from "./CaseWorkspace.js";
import { resolveHelp, helpUrl } from "../help/helpMap.js";
import { FlowCanvas } from "./FlowCanvas.js";
import { WelcomeScreen } from "./WelcomeScreen.js";
import { CaseIntro } from "./CaseIntro.js";
import { ExpiredTabPanel } from "./ExpiredTabPanel.js";
import { LogWorkspace } from "./LogWorkspace.js";
import { MenuBar } from "./MenuBar.js";
import { ReportsWorkspace } from "./ReportsWorkspace.js";
import { StreamsWorkspace } from "./StreamsWorkspace.js";
import { VariablesWorkspace } from "./VariablesWorkspace.js";
import { TopBar } from "./TopBar.js";

// PropsView lazy-loaded: it pulls in Plotly (~300 KB gz) via CsvAutoPlot, and
// most cases (steady / batch / ctrl) never enter this view.  Keeps Plotly out
// of the main chunk.
const PropsView = lazy(() =>
  import("./PropsView.js").then((m) => ({ default: m.PropsView })),
);
// Same reason for the other Plotly-pulling workspaces (each imports the
// shared plotting kit): lazy-load them so Plotly stays in split chunks and
// the index chunk holds only the always-on shell + canvas.
const ExploreWorkspace = lazy(() =>
  import("./ExploreWorkspace.js").then((m) => ({ default: m.ExploreWorkspace })),
);
const PinchView = lazy(() =>
  import("./PinchView.js").then((m) => ({ default: m.PinchView })),
);
const PlotsWorkspace = lazy(() =>
  import("./PlotsWorkspace.js").then((m) => ({ default: m.PlotsWorkspace })),
);
// The Control Room (live PID tuning) pulls the ClosedLoopPlot -> the plotly
// kit, so it is lazy like the other plot-bearing workspaces.
const ControlWorkspace = lazy(() =>
  import("./ControlWorkspace.js").then((m) => ({ default: m.ControlWorkspace })),
);
// InternalsView too: it pulls ProfilePlot -> the plotly kit, and it only
// renders in a dedicated ?internals=<key> tab -- statically importing it was
// the last chain dragging Plotly itself into the index chunk.
const InternalsView = lazy(() =>
  import("./InternalsView.js").then((m) => ({ default: m.InternalsView })),
);
// The McCabe-Thiele analyzer popped out full-window (?explore=mccabe&key=…) —
// lazy so its Plotly chain stays out of the index chunk (same reason as above).
const ExploreMccabeTab = lazy(() =>
  import("./explore/ExploreMccabeTab.js").then((m) => ({ default: m.ExploreMccabeTab })),
);

export function AppShell() {
  // Derive page mode from caseFiles: props cases carry a propsDict
  // and no flowsheet; everything else uses the flowsheet view.
  const isPropsCase = useStore(
    (s) => Boolean(s.caseFiles.propsDict) && !s.caseFiles.flowsheet,
  );
  const activeWorkspace = useStore((s) => s.activeWorkspace);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  const tutorialName = useStore((s) => s.tutorialName);
  // When the Assistant console is DOCKED + open it takes a grid row, so the
  // content above shrinks (nothing hides behind it; the Properties band then
  // scrolls within its bounded height).  Floating leaves the layout untouched.
  const agentOpen = useStore((s) => s.agentOpen);
  const agentDocked = useStore((s) => s.agentDocked);
  const agentHeight = useStore((s) => s.agentHeight);
  // The assistant console authors a CASE, so it only exists once one is open.
  // No case (blank boot) -> no console (and no reserved dock row).
  const caseOpen = hasCaseOpen(tutorialName);
  const bootExpired = useStore((s) => s.bootExpired);
  const showIntro = useStore((s) => s.showIntro);
  // The console belongs to a case you are WORKING on -- not the welcome, and not
  // the tutorial intro (it would clutter a student's first look).
  const consoleVisible = caseOpen && !showIntro;
  const dockRow = agentOpen && agentDocked && consoleVisible;

  // Esc closes whatever workspace is open, returning to the canvas-only
  // default.  Intentionally NOT scoped to a particular element so the
  // shortcut works from anywhere in the app; the FlowCanvas already
  // ignores Esc when typing in an input/textarea.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (activeWorkspace !== null) setActiveWorkspace(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeWorkspace, setActiveWorkspace]);

  // F1 opens the guide AT the section for the current context (selected unit's
  // type, else the active workspace).  Reads fresh store state inside the
  // handler so the listener binds once.  preventDefault stops the browser's
  // own F1 help.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "F1") return;
      ev.preventDefault();
      const s = useStore.getState();
      let selectedUnitType: string | null = null;
      const sel = s.selectedNodeId;
      if (sel && sel.startsWith("unit:") && s.caseFiles.flowsheet) {
        const name = sel.slice(5);
        const units = (s.caseFiles.flowsheet["units"] ?? []) as Array<Record<string, unknown>>;
        const u = units.find((x) => x["name"] === name);
        selectedUnitType = (u?.["type"] as string | undefined) ?? null;
      }
      const target = resolveHelp({ selectedUnitType, activeWorkspace: s.activeWorkspace });
      window.open(helpUrl(target, import.meta.env.BASE_URL), "_blank", "noopener");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Browser-tab title: show the case name (or sector/unit leaf when
  // drilled-in via a sub-case URL) instead of the static "Choupo".  A
  // tutorial called "plant/ChemicalPlantTutorial/CONCENTRATION/Cryst"
  // reads as just "Cryst" so the user can tell adjacent browser tabs
  // apart at a glance.  External cases keep their full "external:..."
  // identifier (no slashes anyway).  A focus mini-flowsheet tab reads
  // "<unit> · focus" (its internals sibling is "<unit> · internals") so
  // the two pop-outs of the same unit are distinguishable at a glance.
  useEffect(() => {
    if (tutorialName.startsWith("focus:")) {
      document.title = `${tutorialName.slice("focus:".length)} · focus`;
      return;
    }
    const idx = tutorialName.lastIndexOf("/");
    const leaf = idx < 0 ? tutorialName : tutorialName.slice(idx + 1);
    document.title = leaf || "Choupo";
  }, [tutorialName]);

  // A unit-internals tab (?internals=<key>) is THE unit surface (gui-credo §4
  // "two surfaces"): tables + plots + the What-if tab, opened by double-click
  // on the flowsheet.  It has no flowsheet/menu shell.
  if (typeof window !== "undefined"
      && new URLSearchParams(window.location.search).has("internals")) {
    return (
      <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
        <InternalsView />
      </Suspense>
    );
  }

  // The McCabe-Thiele analyzer popped out full-window (?explore=mccabe&key=…):
  // a real tab (gui-credo §4) that re-hydrates from its localStorage stash and
  // refuses honestly when the stash is gone -- no flowsheet/menu shell.
  if (typeof window !== "undefined"
      && new URLSearchParams(window.location.search).get("explore") === "mccabe") {
    return (
      <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
        <ExploreMccabeTab />
      </Suspense>
    );
  }

  // A ?focus= boot whose stash is gone: refuse honestly (gui-credo §4 "Tab
  // citizenship") instead of silently degrading to the welcome screen.
  if (bootExpired) {
    return <ExpiredTabPanel kind={bootExpired} />;
  }

  return (
    <Box
      style={{
        display: "grid",
        gridTemplateRows: dockRow ? `32px 1fr ${agentHeight}px` : "32px 1fr",
        gridTemplateColumns: "1fr",
        gridTemplateAreas: dockRow
          ? `"header" "center" "console"`
          : `"header" "center"`,
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
      }}
    >
      <Box
        style={{
          gridArea: "header",
          display: "flex",
          alignItems: "stretch",
          background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))",
          borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
        }}
      >
        <Box style={{ flex: "0 0 auto" }}>
          <MenuBar />
        </Box>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <TopBar />
        </Box>
      </Box>

      <Box style={{ gridArea: "center", position: "relative", minWidth: 0, minHeight: 0, height: "100%", overflow: "hidden" }}>
        {!caseOpen ? (
          // No case open (blank boot): the welcome on-ramp -- EXCEPT the
          // Property Explorer, which is standalone (it synthesizes its own
          // transient case), so the landing's ?workspace=explore deep-link and
          // the menu open it without a case loaded.
          activeWorkspace === "explore" ? (
            <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
              <ExploreWorkspace />
            </Suspense>
          ) : (
            <WelcomeScreen />
          )
        ) : showIntro ? (
          // A freshly-opened tutorial: its intro screen before the flowsheet.
          <CaseIntro />
        ) : isPropsCase ? (
          // A props-only case has no flowsheet/streams; only Log + Case make
          // sense alongside the property views.  Everything else IS PropsView.
          activeWorkspace === "log" ? (
            <LogWorkspace />
          ) : activeWorkspace === "case" ? (
            <CaseWorkspace />
          ) : activeWorkspace === "explore" ? (
            <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
              <ExploreWorkspace />
            </Suspense>
          ) : (
            <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
              <PropsView />
            </Suspense>
          )
        ) : activeWorkspace === "streams" ? (
          <StreamsWorkspace />
        ) : activeWorkspace === "variables" ? (
          <VariablesWorkspace />
        ) : activeWorkspace === "case" ? (
          <CaseWorkspace />
        ) : activeWorkspace === "log" ? (
          <LogWorkspace />
        ) : activeWorkspace === "plots" ? (
          <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
            <PlotsWorkspace />
          </Suspense>
        ) : activeWorkspace === "control" ? (
          <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
            <ControlWorkspace />
          </Suspense>
        ) : activeWorkspace === "props" ? (
          <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
            <PropsView />
          </Suspense>
        ) : activeWorkspace === "explore" ? (
          <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
            <ExploreWorkspace />
          </Suspense>
        ) : activeWorkspace === "pinch" ? (
          <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
            <PinchView />
          </Suspense>
        ) : activeWorkspace === "reports" ? (
          <ReportsWorkspace />
        ) : (
          <FlowCanvas />
        )}
      </Box>

      {/* Assistant console -- a real `claude -c` via the LOCAL bridge (port 7682).
          Only on localhost (where bin/runGui runs the bridge); on the hosted
          site there is no bridge, so it is not rendered at all (the 📋 clipboard
          bridge to claude.ai is the universal path there). */}
      {consoleVisible && (typeof location !== "undefined"
        && (location.hostname === "localhost" || location.hostname === "127.0.0.1")) && (
        <AgentConsole />
      )}
    </Box>
  );
}
