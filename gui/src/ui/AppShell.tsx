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
import { useReducedMotion } from "@mantine/hooks";
import { Suspense, lazy, useEffect, useState } from "react";

import { useStore, hasCaseOpen } from "../state/store.js";
import { AgentConsole } from "./AgentConsole.js";
import { agentRowPx } from "./panelFold.js";
import { CaseWorkspace } from "./CaseWorkspace.js";
import { selectedUnitTypeIn, tabHelp, tabKindFor } from "./tabChrome.js";
import { getActiveMethodTool } from "./methods/registry.js";
import { FlowCanvas } from "./FlowCanvas.js";
import { WelcomeScreen } from "./WelcomeScreen.js";
import { CaseIntro } from "./CaseIntro.js";
import { ExpiredTabPanel } from "./ExpiredTabPanel.js";
import { LogWorkspace } from "./LogWorkspace.js";
import { LiteratureWorkspace } from "./LiteratureWorkspace.js";
import { MenuBar } from "./MenuBar.js";
import { fitsRow, useMeasuredBoxWidth } from "./methods/methodsChrome.js";
import { ReportsWorkspace } from "./ReportsWorkspace.js";
import { StreamsWorkspace } from "./StreamsWorkspace.js";
import { VariablesWorkspace } from "./VariablesWorkspace.js";
import { TopBar } from "./TopBar.js";
import { openGuide } from "../help/guideLinks.js";

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
// The Methods workspace (classical method constructions, 2026-08-15) pulls
// McCabePlot/PsychroPlot -> the plotly kit, so it is lazy like Explore.
const MethodsWorkspace = lazy(() =>
  import("./MethodsWorkspace.js").then((m) => ({ default: m.MethodsWorkspace })),
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
const ComponentTab = lazy(() =>
  import("./explore/ComponentTab.js").then((m) => ({ default: m.ComponentTab })),
);
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
  // Folded (agentCollapsed) the row shrinks to the slim header bar -- the
  // terminal session stays alive behind it -- and the row-height change is
  // the one-click slide-down animation (grid-template-rows transition below).
  const agentOpen = useStore((s) => s.agentOpen);
  const agentDocked = useStore((s) => s.agentDocked);
  const agentHeight = useStore((s) => s.agentHeight);
  const agentCollapsed = useStore((s) => s.agentCollapsed);
  const reduceMotion = useReducedMotion();
  // The assistant console authors a CASE, so it only exists once one is open.
  // No case (blank boot) -> no console (and no reserved dock row).
  const caseOpen = hasCaseOpen(tutorialName);
  const bootExpired = useStore((s) => s.bootExpired);
  const showIntro = useStore((s) => s.showIntro);
  // The console belongs to a case you are WORKING on -- not the welcome, and not
  // the tutorial intro (it would clutter a student's first look).
  const consoleVisible = caseOpen && !showIntro;
  const dockRow = agentOpen && agentDocked && consoleVisible;

  /* THE HEADER STACKS ON A PHONE, and it is not a style preference.
   *
   * The header is ONE nowrap row: the workspace tabs on the left, the brand +
   * icon cluster on the right.  On a phone that row's intrinsic width is far
   * more than the screen -- measured 2026-08-17 at 390x844 with a steady case
   * open, the tab strip alone was 833 px and the rightmost control sat at
   * x=1035, with 13 of 18 controls behind an `overflow: hidden` edge no
   * gesture can reach.  Collapsing the tabs into one dropdown (MenuBar) fixes
   * most of it but not all: File + Workspaces + EduTools + Help + the five
   * icons still do not fit 390 px on ONE line, and the only ways to force
   * them are to hide controls or to hide them behind a sideways swipe.  Both
   * were rejected -- a control that disappears is not a control that works.
   *
   * So when the two cannot share one line the header takes TWO 32 px lines
   * instead of one: brand + icons on top, navigation underneath.  It costs
   * 32 px of an 844 px screen and buys back every control, with no gesture to
   * discover.  The desk keeps its single 32 px row, byte for byte.
   *
   * "CANNOT SHARE ONE LINE" IS MEASURED, NOT A BREAKPOINT (2026-08-17).  It
   * used to be `useNarrowViewport()`, i.e. `width < sm || coarse pointer`, and
   * the pointer term made a 1800 px tablet stack its header like a phone.
   * Three live measurements decide it now, and none of them is a pointer:
   *
   *   headerWidth  -- this row's own box (ResizeObserver);
   *   topBarMinPx  -- what TopBar must keep: its brand lockup + its icon
   *                   CONTROLS, measured and reported by TopBar itself;
   *   menuRowPx    -- what MenuBar's row needs in its CURRENT shape, measured
   *                   and reported by MenuBar (its ghost, not a breakpoint).
   *
   * THE TWO DECISIONS ARE ORDERED, and the order is what keeps them stable.
   * MenuBar is told what it may have -- `headerWidth - topBarMinPx`, always,
   * stacked or not -- so its answer depends on the width alone.  The header
   * then stacks only when even the row MenuBar settled on cannot share the
   * line.  Collapsing is therefore PREFERRED over stacking, which is what the
   * landscape phone wants (measured 2026-08-17: 844 px gives the navigation
   * 844 - 330 = 514 px against an expanded row of 833, so the views collapse
   * into their chooser and the 353 px that leaves shares the line easily).
   * Writing it the other way round -- stack first, then let MenuBar have the
   * whole width -- is bistable: at 1000 px both "expanded + stacked" and
   * "collapsed + one line" satisfy it, and which one you get depends on the
   * order the effects happened to run in.
   *
   * `fitsRow` is the project's ONE fit rule (methodsChrome.tsx); this
   * deliberately does not introduce a second. */
  const header = useMeasuredBoxWidth<HTMLDivElement>();
  const [topBarMinPx, setTopBarMinPx] = useState(0);
  const [menuRowPx, setMenuRowPx] = useState(0);
  const headerWidth = header.width;
  const menuAvailablePx = Math.max(0, headerWidth - topBarMinPx);
  const narrowHeader = !fitsRow(menuRowPx + topBarMinPx, headerWidth);
  const headerRowPx = narrowHeader ? 64 : 32;

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

  // F1 opens the guide AT the section this TAB is about -- the selected unit's
  // type or the active view in a case tab, the open EduTool's own theory
  // section in a tool tab.  Which of those it is comes from ui/tabChrome.ts,
  // the same one home the Help menu reads, so the key and the menu item can
  // never answer differently.  Reads fresh store state inside the handler so
  // the listener binds once; preventDefault stops the browser's own F1 help.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "F1") return;
      ev.preventDefault();
      const s = useStore.getState();
      // A workspace that OWNS its F1 keeps it: two handlers here meant two
      // help tabs per press.
      //
      // `props` was fixed when that was first found.  `explore` was not, and
      // it stayed broken for the same reason a fix applied to an INSTANCE
      // leaves the CLASS open -- measured 2026-08-18, one keypress in an
      // Explore tab opened TWO tabs at two DIFFERENT chapters:
      // theoryGuide#ch:criticals from here and #ch:vap from
      // ExploreWorkspace's own handler.  Not a harmless duplicate; the
      // student is shown two answers to one question.
      //
      // The more specific one wins, which is what "owns" means: Explore's
      // handler resolves the section matching the ACTIVE PLOT, while this one
      // can only know the workspace.  Adding a workspace with its own F1
      // means adding it here.
      if (s.activeWorkspace === "props" || s.activeWorkspace === "explore") return;
      const kind = tabKindFor({
        hasCase: hasCaseOpen(s.tutorialName),
        activeWorkspace: s.activeWorkspace,
      });
      openGuide(tabHelp({
        kind,
        toolId: getActiveMethodTool(),
        selectedUnitType: selectedUnitTypeIn(s.selectedNodeId, s.caseFiles.flowsheet),
        activeWorkspace: s.activeWorkspace,
      }).url);
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
  // The &key= is REQUIRED here: a bare ?explore=mccabe is the LEGACY deep-link
  // to the Explorer's McCabe lens, which moved to the Methods workspace
  // (2026-08-15) -- bootWorkspace() redirects it to Methods/mccabe instead.
  if (typeof window !== "undefined"
      && new URLSearchParams(window.location.search).get("explore") === "mccabe"
      && new URLSearchParams(window.location.search).has("key")) {
    return (
      <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
        <ExploreMccabeTab />
      </Suspense>
    );
  }

  // The Component Inspector full-window (?component=<name>): a real tab that
  // re-derives from the NAME rather than re-hydrating a stash, so it is
  // bookmarkable, shareable and has nothing to expire.  It must sit BEFORE the
  // bootExpired branch: this tab has no stash, so an expired-stash refusal
  // would be describing a mechanism it does not use.
  if (typeof window !== "undefined"
      && new URLSearchParams(window.location.search).has("component")) {
    return (
      <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
        <ComponentTab />
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
      // Fold/unfold of the docked console animates the row height (200 ms;
      // open/close still swaps the template shape = instant, as before).
      // On settle, dispatch a window resize: xterm's fit + Plotly's
      // useResizeHandler listen for it (React Flow observes its own div).
      onTransitionEnd={(e) => {
        if (e.propertyName === "grid-template-rows") window.dispatchEvent(new Event("resize"));
      }}
      style={{
        display: "grid",
        gridTemplateRows: dockRow
          ? `${headerRowPx}px 1fr ${agentRowPx(agentCollapsed, agentHeight)}px`
          : `${headerRowPx}px 1fr`,
        gridTemplateColumns: "1fr",
        gridTemplateAreas: dockRow
          ? `"header" "center" "console"`
          : `"header" "center"`,
        transition: reduceMotion ? "none" : "grid-template-rows 200ms ease",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
      }}
    >
      {/* `minWidth: 0` is load-bearing, not tidying.  A grid item defaults to
          `min-width: auto`, so the COLUMN sizes to the widest item's
          min-content -- and this header row is the widest thing in the app.
          Without it a 390px phone got a 480px grid column (the whole shell,
          workspace included, laid out at 480 and clipped by the shell's own
          `overflow: hidden` with no scroller).  Measured 2026-08-17: the
          workspace container was 480x812 in a 390x844 viewport, which is why
          controls INSIDE the tools were unreachable too -- their own
          `overflow-x: auto` strips were nested in a box already wider than the
          screen.  Capping the header at the column width lets the row lay
          itself out for the space it actually has. */}
      <Box
        ref={header.ref}
        style={{
          gridArea: "header",
          display: "flex",
          alignItems: "stretch",
          flexWrap: narrowHeader ? "wrap" : "nowrap",
          minWidth: 0,
          overflow: "hidden",
          background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))",
          borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
        }}
      >
        {/* `order` puts the brand line ON TOP when stacked without moving
            either component in the DOM: the tab strip stays the first thing a
            screen reader and the keyboard reach, which is what it should be
            when it is the navigation. */}
        <Box
          style={narrowHeader
            ? { flex: "1 1 100%", order: 2, height: 32, minWidth: 0 }
            : { flex: "0 1 auto", minWidth: 0 }}
        >
          <MenuBar availableWidthPx={menuAvailablePx} onRowWidth={setMenuRowPx} />
        </Box>
        <Box
          style={narrowHeader
            ? { flex: "1 1 100%", order: 1, height: 32, minWidth: 0 }
            : { flex: 1, minWidth: 0 }}
        >
          <TopBar onMinWidth={setTopBarMinPx} />
        </Box>
      </Box>

      <Box style={{ gridArea: "center", position: "relative", minWidth: 0, minHeight: 0, height: "100%", overflow: "hidden" }}>
        {!caseOpen ? (
          // No case open (blank boot): the welcome on-ramp -- EXCEPT the
          // Property Explorer and the Methods workspace, which are standalone
          // (each synthesizes its own transient case), so the landing's
          // ?workspace=explore / ?workspace=methods deep-links and the menu
          // open them without a case loaded.
          activeWorkspace === "explore" ? (
            <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
              <ExploreWorkspace />
            </Suspense>
          ) : activeWorkspace === "methods" ? (
            <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
              <MethodsWorkspace />
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
          ) : activeWorkspace === "literature" ? (
            <LiteratureWorkspace />
          ) : activeWorkspace === "case" ? (
            <CaseWorkspace />
          ) : activeWorkspace === "explore" ? (
            <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
              <ExploreWorkspace />
            </Suspense>
          ) : activeWorkspace === "methods" ? (
            <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
              <MethodsWorkspace />
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
        ) : activeWorkspace === "literature" ? (
          <LiteratureWorkspace />
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
        ) : activeWorkspace === "methods" ? (
          <Suspense fallback={<Box style={{ padding: 16 }}>Loading...</Box>}>
            <MethodsWorkspace />
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
