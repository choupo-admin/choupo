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
  Classic menu bar.  Five top-level menus (File / Edit / View / Run /
  Help) sit in a thin row at the top of the window.  Each menu opens
  a Mantine dropdown with its actions.  Keyboard shortcuts are shown
  in the right column of each item; wiring them globally lives in the
  individual handlers (or can be added later via useHotkeys).

  THIS IS A CASE TAB'S MENU: File, its own views, and Help.  Nothing else
  (docs/design/one-tab-one-thing.md, DECIDED 2026-08-17 by Vítor: "E no
  flowsheet eu não quero no menu EduTools nem Explore!").

  AND IT IS ONLY A CASE TAB'S MENU (2026-08-18).  This row renders in EVERY
  tab, so the row itself must ask what the tab IS.  It does not decide that
  here: `ui/tabChrome.ts` is the ONE home — `tabChromeFor()` says whether this
  tab's chrome speaks about a case at all, and `tabHelp()` says where its Help
  and its F1 go.  Vítor, opening an EduTools tab: "Porque raio há File no menu
  se isto é uma tool?  Não podes gravar: é só para usar e aprender.  Depois
  volta a aparecer o help genérico, quando só devia aparecer um help ou F1 a
  remeter para a teoria deste tool!"  Every item File carries is a CASE
  operation, so in a tool tab every one of them is dead or lying — File leaves,
  its three shortcuts leave with it (a shortcut is the same menu by another
  door), and Help points at the open tool's own Theory-Guide section.

  WHAT LEFT, AND WHAT REPLACED IT.  Until today this row also carried Explore
  and an EduTools DROPDOWN — the twelve tools listed here, because the tool
  rail inside the workspace had been ruled out on 2026-08-16 and a chooser had
  to live somewhere.  Both are gone, and neither is merely deleted:

    * Explore and EduTools are MODES, and a mode is now a TAB (workspaces.ts
      MODE_TABS + ui/openInTab.ts).  The hub opens them; this menu, which
      belongs to ONE case, has no business offering a thing that is not a view
      of that case.
    * The twelve tools are chosen INSIDE the EduTools tab now
      (MethodsWorkspace's ToolChooser — which on a TOOL tab has since become
      `ToolMenu` in this row; see the next paragraph), which is where a chooser
      for that tab's content belongs.  That in-body chooser was the PRECONDITION
      for removing this dropdown: without it, a student reaching one tool could
      not reach the other eleven.

  ONE OF THEM CAME BACK, AS THE TAB'S SUBJECT AND NOT AS AN APP MENU
  (2026-08-18).  The EduTools DROPDOWN that left was a list of twelve tools in
  a CASE tab's menu — a mode offered from a row that belongs to one case, which
  is what one-tab-one-thing removed.  What renders here now is a different
  control answering a different question: on a TOOL tab, and only there, the
  row leads with `Tool: <name>` — which tool THIS tab is showing.  The
  difference is not wording: the old entry appeared where the tool was not, and
  this one appears where the tool is.

  The argument that had kept EduTools here expired by decision the same day —
  record §3: the ten run-fed tools no longer read the loaded case, so an
  in-app entry pointing a tool at "the student's own result" has nothing left
  to point at.

  THE LINEUP still lives in workspaces.ts, NOT here: this file renders it
  twice (wide row, narrow chooser) and must not own it, or the two postures
  would each acquire a lineup to drift.  What this file adds is the POSTURE
  rule — the views collapse into a chooser labelled for what it OPENS with the
  current view as its VALUE.  The old collapsed control was labelled `Case`,
  which is a lit tab saying *you are here* while ten destinations sat
  unannounced behind it.
\*---------------------------------------------------------------------------*/

import { useEffect, useLayoutEffect } from "react";
import {
  Anchor,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { useDisclosure, useHotkeys } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";

import { useStore, reopenLastCase, lastCaseLabel, hasCaseOpen, isIsolatedTab, type WorkspaceKey } from "../state/store.js";
import {
  WORKSPACES, visibleWorkspacesFor, type WorkspaceEntry,
} from "./workspaces.js";
import { popOutHelpTopics } from "./helpTopicsPopOut.js";
import {
  selectedUnitTypeIn, TAB_CHROME, tabHelp, tabKindFor,
} from "./tabChrome.js";
import {
  METHOD_TOOLS, setActiveMethodTool, useActiveMethodTool, type MethodToolId,
} from "./methods/registry.js";
import { OpenTutorialModal } from "./OpenTutorialModal.js";
import { NewCaseModal } from "./NewCaseModal.js";
import { DuplicateCaseModal } from "./DuplicateCaseModal.js";
import { readCaseAt, importCase, slugifyCaseName } from "../cases/workspace.js";
import { localCaseDir } from "../case/caseName.js";
import { downloadCaseZip } from "../case/saveCase.js";
import { openCaseZip, openCaseFolder, type OpenedCase } from "../cases/loadCase.js";
import { canComputePinch } from "../case/pinch.js";
import { collectControllerKnobs } from "../case/controllerKnobs.js";
import { guideUrl, openGuide } from "../help/guideLinks.js";
import { caseTabSearch, openAppTab } from "./openInTab.js";
import { fitsRow, useIntrinsicWidth } from "./methods/methodsChrome.js";

/** How much side padding a trigger in the top row carries.  Two rungs, and
 *  both are WIDTH economies, not touch sizes: the roomy one is what the desk
 *  has always rendered, the compact one is the trim the collapsed row needs to
 *  fit a 390 px phone (measured — see THE COLLAPSED ROW'S WIDTH BUDGET). */
const ROOMY_PAD_X = 10;
const COMPACT_PAD_X = 6;

export function MenuBar({ availableWidthPx, onRowWidth }: {
  /** The width this row may occupy, measured by the shell (AppShell owns the
   *  header, so it is the only thing that knows what the top bar must keep).
   *  Absent — a MenuBar mounted outside the shell — falls back to the window,
   *  which is the honest upper bound rather than a guess about a sibling. */
  availableWidthPx?: number;
  /** Report back the width THIS row needs in its current shape, so the shell
   *  can decide whether the header still fits one line.  Measured, never
   *  inferred from a breakpoint. */
  onRowWidth?: (px: number) => void;
} = {}) {
  const tutorialName = useStore((s) => s.tutorialName);
  const loadTutorial = useStore((s) => s.loadTutorial);
  const loadLocalCase = useStore((s) => s.loadLocalCase);
  const loadExternalCase = useStore((s) => s.loadExternalCase);
  const runStatus = useStore((s) => s.runStatus);
  const runResult = useStore((s) => s.runResult);
  const flowsheet = useStore((s) => s.caseFiles.flowsheet);
  const propsDict = useStore((s) => s.caseFiles.propsDict);
  const caseFiles = useStore((s) => s.caseFiles);
  const showIntro = useStore((s) => s.showIntro);
  const canDownloadZip = Boolean(caseFiles.rawFiles && Object.keys(caseFiles.rawFiles).length > 0);
  // An isolated pop-out tab (?case= / ?focus= / ?internals=) is a satellite of
  // its parent case: the tutorial gallery + Ctrl+O are gated away from it --
  // opening another case there would hijack a tab whose URL claims to be
  // something else (gui-credo §4 "Tab citizenship").
  const isolated = isIsolatedTab();
  // The last-opened case (offered for a deliberate reopen now that the GUI
  // boots blank).  Recomputed on every case change (tutorialName subscription).
  const reopenLabel = !hasCaseOpen(tutorialName) ? lastCaseLabel() : null;
  const pinchReady = canComputePinch(runResult, flowsheet);

  // The top tabs are CONTEXT-DEPENDENT: each case TYPE exposes only the
  // workspaces that mean something for it, so a lit-but-dead button (the
  // Frankenstein the props GUI was accused of) never shows.  WHICH set is
  // allowed lives in workspaces.ts (allowedWorkspaceLabels) -- one home, and
  // the modes are in every set because they are modes, not because four
  // hand-written sets each happened to name them.
  const isPropsCase = Boolean(propsDict) && !flowsheet;
  const application =
    typeof caseFiles.controlDict?.["application"] === "string"
      ? (caseFiles.controlDict["application"] as string)
      : undefined;
  // The Control Room appears only for a choupoCtrl case that actually declares
  // a PID (the lens-disappears gating, mirroring the Explorer): no PID -> no
  // gains to tune, so the tab is not even shown.
  const hasPid = application === "choupoCtrl"
    && collectControllerKnobs(flowsheet).pid !== null;
  const visibleWorkspaces = visibleWorkspacesFor({
    hasCase: hasCaseOpen(tutorialName),
    showIntro,
    isPropsCase,
    application,
    hasPid,
  }, WORKSPACES);
  /* Every visible workspace is a VIEW of this case now — the two modes left
   * the row for their own tabs (workspaces.ts).  The name is kept because the
   * narrow chooser is labelled `Views:` and reads from this. */
  const visibleViews = visibleWorkspaces;
  /* NARROW POSTURE: the VIEWS become one chooser.
   *
   * Measured 2026-08-17 at 390x844 with a steady case open: eleven tabs laid
   * out to 833 px in a 390 px viewport, so Streams onward (seven whole
   * workspaces) plus Help sat behind an `overflow: hidden` edge with nothing
   * to scroll.  A horizontal tab strip was considered and rejected here: a
   * registry of DESTINATIONS is exactly the thing a student must be able to
   * SEE, and a strip that scrolls hides "Reports" behind a swipe with no
   * affordance saying it exists.  A dropdown shows all of them at once, by
   * name, in one tap.
   *
   * This is the same conclusion methodsChrome.tsx already recorded for the
   * EduTools registry ("a dropdown is already the touch-native chooser, and a
   * second list below `sm` would be a second home for the registry"), and it
   * is built from the SAME `visibleWorkspaces` array the wide posture renders
   * -- there is no second lineup to drift.
   *
   * THE TRIGGER'S LABEL (2026-08-17, modes-and-views-in-the-top-row.md §4b).
   * It used to read `Case`, i.e. a lit tab saying *you are here* over ten
   * unannounced destinations.  It reads `Views: Case` now -- the category is
   * the LABEL, the current view is its VALUE -- and it is styled as a selector
   * rather than an active tab, because the fill was exactly the "arrived"
   * signal that hid the ten.
   *
   * THE OTHER HALF OF THAT RECORD IS SUPERSEDED (one-tab-one-thing.md §6).
   * It had ruled that MODES stay visible while views collapse, so that
   * `Explore` -- one of only two things a caseless visitor could do -- would
   * not end up filed inside a menu named after a view.  The modes are TABS
   * now, so there are no modes in this row to keep visible and the rule has
   * nothing left to govern.  What survives from it is the DISTINCTION, which
   * this row expresses by carrying one side of it and nothing of the other.
   *
   * The WIDE posture is untouched: every workspace is its own entry there, in
   * declared order, so the split costs the desk nothing (§5 of the record --
   * this is not a navigation redesign).
   *
   * WHEN IT COLLAPSES IS A MEASUREMENT, NOT A BREAKPOINT (2026-08-17).  It
   * used to be `useNarrowViewport()`, which was `width < sm || coarse pointer`
   * -- so a tablet, coarse at any width, got the chooser at 1800 px while the
   * same lineup laid itself out to x=823 with 577 px to spare at 1400.  The
   * row now measures ITSELF (a hidden ghost of the expanded shape, at the real
   * font, `methodsChrome.useIntrinsicWidth`) and collapses when that width
   * does not fit the width the shell says it has.  Measured 2026-08-17 with a
   * steady case open: expanded 833 px, collapsed 353 px.
   *
   * That gets the landscape phone right for the reason that is actually true
   * there.  At 844 px the expanded row (833) does not fit beside what the top
   * bar must keep (its brand and its five icon controls), so it collapses --
   * not because the finger is blunt, but because the row is wider than the
   * space.  The pointer's own job (target size and spacing) is untouched and
   * lives in `useCoarsePointer`; nothing in this row reads it, because nothing
   * in this row is a size decision. */
  const activeWorkspace = useStore((s) => s.activeWorkspace);
  const toggleWorkspace = useStore((s) => s.toggleWorkspace);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);

  /* WHAT THIS TAB IS, and therefore what this row carries.  Derived in ONE
   * place (ui/tabChrome.ts) and read here; the alternative — an `if` per
   * surface — is how the File menu and the "No case open" label came to
   * disagree with the Help menu about whether a case exists.
   *
   * The selection is read as STATE rather than pulled out of the store inside
   * the click handler, so the Help item's WORDING and its DESTINATION come
   * from one `tabHelp` call.  Two calls (one to label, one to open) would be
   * the same branch written twice, and a menu item whose text and target
   * disagree is precisely the complaint being answered. */
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const activeTool = useActiveMethodTool();
  const tabKind = tabKindFor({ hasCase: hasCaseOpen(tutorialName), activeWorkspace });
  const chrome = TAB_CHROME[tabKind];
  const help = tabHelp({
    kind: tabKind,
    toolId: activeTool,
    selectedUnitType: selectedUnitTypeIn(selectedNodeId, flowsheet),
    activeWorkspace,
  });

  /* The two postures render the same lineup through the same rules.  These
   * live here, above both, so a wide tab and a narrow menu item can never
   * disagree about which workspace is on screen or which is not yet runnable. */
  const isWorkspaceActive = (w: WorkspaceEntry): boolean =>
    w.label === "Flowsheet"
      ? activeWorkspace === null                 // the canvas itself
      : isPropsCase && w.label === "Props"
      // In a props case the centre is PropsView by default, so "Props" is the
      // home (active when no other workspace is open).
      ? activeWorkspace === null || activeWorkspace === "props"
      : w.key !== null && w.key === activeWorkspace;
  // Pinch needs a completed run with heat duties -> greyed until then.
  const isWorkspaceDisabled = (w: { key: WorkspaceKey | null }): boolean =>
    w.key === "pinch" && !pinchReady;
  const PINCH_DISABLED_HINT = "Run the flowsheet first — pinch needs the converged duties";

  const openWorkspace = (label: string, key: WorkspaceKey | null) => {
    if (label === "Flowsheet") {
      setActiveWorkspace(null);   // close any workspace -> the flowsheet canvas
      return;
    }
    if (key) {
      toggleWorkspace(key);
      return;
    }
    notifications.show({
      title: `${label} workspace`,
      message:
        "Not implemented yet -- this menu entry is a placeholder.  Streams + Case are wired in Fase B; the rest follows.",
      color: "cyan",
      autoClose: 3500,
    });
  };

  const [aboutOpen, aboutCtl] = useDisclosure(false);
  const [openTutorialOpen, openTutorialCtl] = useDisclosure(false);
  const [newCaseOpen, newCaseCtl] = useDisclosure(false);
  const [dupOpen, dupCtl] = useDisclosure(false);
  // Duplicate acts on the OPEN case -> only a local case can be duplicated
  // (a bundled tutorial is read-only; copy it via "Open Local" after New).
  const canDuplicate = !!localCaseDir(tutorialName);

  // "Reload case from disk".  A local case re-fetches from the bridge by its
  // absolute path; a bundled tutorial re-reads the build-time glob.
  //
  // "Open materialises" -- the single open verb.  Bringing a case INTO Choupo
  // lands it on disk: on localhost (bridge present) importCase() writes the
  // student's chosen file-map into the workspace as a real on-disk case, then
  // loadLocalCase() opens it -- byte-for-byte the same end-state as New Case, so
  // the Assistant console can run there (?dir=, stable Claude session) and the
  // canvas LIVE-RELOADS the agent's edits.  On the hosted site (no bridge)
  // importCase throws the "bridge not reachable" sentinel and we fall back to the
  // memory-only viewer (loadExternalCase) -- where the 🤖 is hidden anyway.  The
  // student never sees a path, a folder, or the word "workspace".
  const openConverging = (picked: OpenedCase | null) => {
    if (!picked) return;                       // dialog cancelled
    importCase(picked.name, picked.raw)
      .then(({ name, dir, caseFiles }) => {
        loadLocalCase(dir, caseFiles);
        const suffixed = name !== slugifyCaseName(picked.name);
        notifications.show({
          title: suffixed ? `Opened as “${name}”` : "In your cases",
          message: suffixed ? "Your work saves here." : undefined,
          color: "teal",
          autoClose: 3500,
        });
      })
      .catch((e) => {
        const msg = (e as Error).message;
        if (/bridge not reachable/i.test(msg)) {
          loadExternalCase(picked.name, picked.files);  // hosted fallback (no bridge, console hidden)
        } else {
          notifications.show({ title: "Could not open the case", message: msg, color: "red" });
        }
      });
  };
  // Both pickers feed the SAME funnel.  A case IS a folder, so the single
  // "Open Case…" verb ALWAYS opens the FOLDER picker -- which works in every
  // browser now (showDirectoryPicker on Chromium, <input webkitdirectory> on
  // Firefox/Safari).  The .zip path stays for the WelcomeScreen's open-zip
  // listener (opening a collaborator's downloaded .zip).
  const openZipCase = () => {
    openCaseZip().then(openConverging)
      .catch((e) => notifications.show({ title: "Could not open the case", message: (e as Error).message, color: "red" }));
  };
  const openFolderCase = () => {
    openCaseFolder().then(openConverging)
      .catch((e) => notifications.show({ title: "Could not open the case", message: (e as Error).message, color: "red" }));
  };
  const openCase = () => openFolderCase();

  // The WelcomeScreen (blank boot) fires these to drive the modals MenuBar owns,
  // so its buttons reach New Case / Open Tutorial / Open .zip without lifting the
  // modals out of here (mirrors the choupo:run decoupling).
  useEffect(() => {
    const onNew = () => newCaseCtl.open();
    const onTut = () => openTutorialCtl.open();
    const onZip = () => openZipCase();
    const onFolder = () => openFolderCase();
    window.addEventListener("choupo:welcome:new-case", onNew);
    window.addEventListener("choupo:welcome:open-tutorial", onTut);
    window.addEventListener("choupo:welcome:open-zip", onZip);
    window.addEventListener("choupo:welcome:open-folder", onFolder);
    return () => {
      window.removeEventListener("choupo:welcome:new-case", onNew);
      window.removeEventListener("choupo:welcome:open-tutorial", onTut);
      window.removeEventListener("choupo:welcome:open-zip", onZip);
      window.removeEventListener("choupo:welcome:open-folder", onFolder);
    };
  }, [newCaseCtl, openTutorialCtl]);

  const reloadCase = () => {
    const dir = localCaseDir(tutorialName);
    if (dir) {
      readCaseAt(dir)
        .then(({ caseFiles }) => loadLocalCase(dir, caseFiles))
        .catch((e) =>
          notifications.show({ title: "Could not reload case", message: (e as Error).message, color: "red" }));
    } else {
      loadTutorial(tutorialName);
    }
  };

  // Run / Stop are owned by TopBar (they hold the AbortController state)
  // — the menu items dispatch DOM events that TopBar listens for.
  const fireRun = () => window.dispatchEvent(new CustomEvent("choupo:run"));

  // Keyboard shortcuts.  Every advertised binding in the menu rows is wired
  // here -- previously only Ctrl+O worked, so the others were misleading.
  // Esc is intentionally NOT bound to Stop: it belongs to the FlowCanvas
  // for "deselect" (a more common need); use the Stop menu item or the
  // Stop button on the TopBar to interrupt a run.
  //
  // THE FILE SHORTCUTS LEAVE WITH THE FILE MENU (2026-08-18).  Ctrl+O,
  // Ctrl+Shift+N and Ctrl+R are that menu's own items; leaving them bound in a
  // tab that does not show the menu would be the same three case operations
  // reachable by another door, in a tab with no case.  Ctrl+Enter is NOT one
  // of them -- Run belongs to the view that owns it (TopBar orchestrates the
  // `choupo:run` event) -- so it is left exactly as it was.
  useHotkeys([
    ["mod+O", () => { if (chrome.caseChrome && !isolated) openTutorialCtl.open(); }],
    ["mod+shift+N", (e) => {
      if (!chrome.caseChrome) return;
      e.preventDefault(); newCaseCtl.open();
    }],
    ["mod+R", (e) => {
      if (!chrome.caseChrome) return;
      e.preventDefault(); reloadCase();
    }],
    ["mod+Enter", () => { if (runStatus !== "running") fireRun(); }],
  ]);

  /* THE COLLAPSED ROW'S WIDTH BUDGET, measured rather than guessed.
   *
   * AppShell gives MenuBar a full-width 32 px line of its own on a phone, so
   * the row has 390 px and must fit in it: Mantine's Group WRAPS by default,
   * and a wrapped trigger lands below the header where the workspace paints
   * over it (observed 2026-08-17 -- Help ended up under the case-description
   * banner and read as COVERED, not as clipped).
   *
   * Measured at 390x844 with a steady case open, at px={10}:
   *   File 43 + "Views: Flowsheet" 143 + Explore 66 + EduTools 75 + Help 49
   *   = 376, + 4 gaps (8) + the Group's own xs padding (20) = 404.  Over by 14.
   * The desk has no such problem (that row ends at x=824 of 1400), so the trim
   * rides the COLLAPSE: 6 px of side padding per trigger and 4 on the Group
   * brings it to 353 (measured again 2026-08-17 through the ghost), and the
   * longest possible value ("Views: Variables") is within a character of the
   * one measured.
   *
   * The trim is padding, never a control and never a word: the whole point of
   * the change above is that a phone shows MORE of the navigation, not less.
   * It is a width economy and it rides the width decision -- it is NOT a touch
   * size, and a coarse pointer must never make a target SMALLER. */

  /* THE TWO SHAPES, and why both are measured.
   *
   * `expanded` is the natural width of the row with every view as its own tab
   * -- what has to fit for the tabs to stay.  `collapsed` is the natural width
   * of the same row with the views folded into one chooser -- the minimum this
   * row can ever need, which is what the SHELL needs to know to decide whether
   * the header still fits one line.
   *
   * Both are measured off hidden ghosts of the real markup rather than summed
   * from remembered control widths (that sum was written down once, in the
   * comment above, and it was already 14 px out).
   *
   * The signature is everything the WIDTH of a shape depends on, which is two
   * things and not one: which workspaces are visible, AND which one is active
   * -- the active tab renders at `fontWeight: 600` and the collapsed chooser
   * puts the active view's NAME in its own label (`Views: Flowsheet` against
   * `Views: none`).  Leaving the active workspace out would have left both
   * numbers quietly stale after every navigation.
   *
   * THE TAB'S KIND IS IN THE SIGNATURE TOO (2026-08-18), and not because it
   * might drift: `File` is ~43 px of this row and it renders only where the
   * chrome speaks about a case, so the kind is one of the things the WIDTH of
   * a shape depends on.  It is covered transitively today (a tab with no case
   * has no visible workspaces either), and stating it is what keeps that
   * accident from being load-bearing.
   *
   * AND SO IS THE OPEN TOOL (2026-08-18), for the same reason one level down:
   * a tool tab's row LEADS with `Tool: <name>`, and the twelve names are not
   * the same width -- measured in this row's own font (13px Inter), the
   * shortest is "Psychrometric chart" at 157 px of text and the longest
   * "Ignition / extinction (Van Heerden)" at 242 px.  85 px of difference
   * decides whether a row fits a phone, so the tool belongs in the signature
   * where it renders.  It is folded in only for a TOOL tab: on a case tab the
   * trigger does not render, and re-measuring both ghosts on every tool switch
   * would be measuring a shape nothing draws. */
  const lineupSignature =
    `${tabKind}|${visibleWorkspaces.map((w) => w.label).join(",")}@${activeWorkspace ?? "none"}`
    + `|tool=${tabKind === "tool" ? activeTool : "-"}`;
  const expandedRow  = useIntrinsicWidth(`expanded|${lineupSignature}`);
  const collapsedRow = useIntrinsicWidth(`collapsed|${lineupSignature}`);

  const available = availableWidthPx ?? (typeof window === "undefined" ? 0 : window.innerWidth);
  const collapsed = !fitsRow(expandedRow.width, available);
  const padX = collapsed ? COMPACT_PAD_X : ROOMY_PAD_X;

  /* What this row needs RIGHT NOW, handed back to the shell.  Reported from a
   * layout effect so the shell's own decision lands before the first paint --
   * a plain effect would show one painted frame of the wrong header height. */
  const rowWidth = collapsed ? collapsedRow.width : expandedRow.width;
  useLayoutEffect(() => {
    if (rowWidth > 0) onRowWidth?.(rowWidth);
  }, [rowWidth, onRowWidth]);

  /* THE ROW ITSELF, built ONCE and rendered in whichever shape the measurement
   * asked for -- the ghosts render the SAME function, so a shape can never be
   * measured as one thing and drawn as another. */
  const rowItems = (shape: { collapsed: boolean; padX: number }) => (
    <>
        {/* --- Tool -----------------------------------------------------
            THE TAB'S IDENTITY LEADS ITS OWN CHROME (2026-08-18).  Vítor, on an
            EduTools tab: "Nas EduTools o menu de cima pode ser Settings, por
            exemplo, e a selecção da tool escusa de ocupar uma linha, quando a
            linha do menu de cima está quase vazia!"

            He is describing a measurement, and it is worse than it looks.
            Measured the same day at 1400x900 on a tool tab: this row held ONE
            control (Help, 49 px) and the top bar's own minimum is 293 px, so
            362 px of 1400 were spoken for and 1038 px were empty -- while a
            SECOND full-width row underneath carried a single Select and cost
            39 px of the teaching diagram's height (45 px at 390x844, where the
            touch posture makes the input taller).  Two rows of chrome, one of
            them all but blank, over the thing the student came to read.

            So the chooser comes up here, first, where a tool tab's row has
            nothing else to say.  It is not squeezed in beside the Help menu as
            an afterthought: it is what this tab IS, so it reads as the row's
            subject -- `Tool: Absorption (Kremser)`, the category dimmed and
            the value in accent, which is the grammar ViewsMenu settled
            yesterday for exactly this problem (a trigger must name what it
            OPENS, with the current value beside it, or it reads as a lit tab
            saying *you are here* over destinations nobody can see).

            WHERE IT RENDERS IS THE TAB'S KIND, not a second question.  A CASE
            tab showing EduTools in its body (`?case=…&workspace=methods`) has
            a row that belongs to the case -- File, nine views, Help -- and
            measured at 1400 that row plus this trigger plus the top bar's
            minimum does not fit; more to the point the chrome there is not the
            tool's to lead.  That tab keeps the in-body row, and
            MethodsWorkspace decides it from the SAME `tabKindFor` call rather
            than a flag one of us sets for the other. */}
        {tabKind === "tool" && (
          <ToolMenu tool={activeTool} px={shape.padX} />
        )}

        {/* --- File -----------------------------------------------------
            ONLY where the chrome speaks about a case (tabChrome.ts).  Every
            item below is a case operation; in a tool tab there is no case, so
            the whole menu goes rather than being rendered full of disabled
            entries -- a greyed row still claims the operation exists here. */}
        {chrome.caseChrome && (
        <TopMenu label="File" px={shape.padX}>
          <Menu.Item
            onClick={newCaseCtl.open}
            rightSection={<Shortcut k="Ctrl+Shift+N" />}
          >
            New Case…
          </Menu.Item>
          {!isolated && (
            <Menu.Item
              onClick={openTutorialCtl.open}
              rightSection={<Shortcut k="Ctrl+O" />}
            >
              Open Tutorial…
            </Menu.Item>
          )}
          <Menu.Item onClick={openCase}>
            Open Case…
          </Menu.Item>
          {reopenLabel && (
            <Menu.Item onClick={() => void reopenLastCase()}>
              Reopen last: <Text span fw={600} c="accent">{reopenLabel}</Text>
            </Menu.Item>
          )}
          <Menu.Divider />
          <Menu.Item
            onClick={dupCtl.open}
            disabled={!canDuplicate}
          >
            Duplicate Case as…
          </Menu.Item>
          <Menu.Item
            onClick={reloadCase}
            rightSection={<Shortcut k="Ctrl+R" />}
          >
            Reload case from disk
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            onClick={() => downloadCaseZip(caseFiles, tutorialName)}
            disabled={!canDownloadZip}
          >
            Download case (.zip)
          </Menu.Item>
          <Menu.Item disabled>
            <Text size="xs" c="dimmed" component="span">
              Your cases stay here in Choupo; tutorials are read-only.
              Edit them with the 🤖 assistant or any text editor.
            </Text>
          </Menu.Item>
        </TopMenu>
        )}

        {/* --- Run ------------------------------------------------------ */}

        {/* --- Workspaces -------------------------------------------------
            Top-level toggles.  Active workspace is highlighted; clicking
            it again closes back to the canvas-only default. */}
        {/* COLLAPSED: one chooser over the VIEWS (see the block above for why a
            dropdown and not a scrolling strip).  Everything in this row is a
            view of the open case, so the chooser holds all of it. */}
        {shape.collapsed && visibleViews.length > 0 && (
          <ViewsMenu
            views={visibleViews}
            px={shape.padX}
            isActive={isWorkspaceActive}
            isDisabled={isWorkspaceDisabled}
            disabledHint={PINCH_DISABLED_HINT}
            onPick={openWorkspace}
          />
        )}
        {visibleWorkspaces.map((w) => {
          if (shape.collapsed) return null;   // all of them are in the chooser above
          const isActive = isWorkspaceActive(w);
          const disabled = isWorkspaceDisabled(w);
          return (
            <Button
              key={w.label}
              variant={isActive ? "filled" : "subtle"}
              color={isActive ? "accent" : "gray"}
              size="compact-xs"
              px={shape.padX}
              disabled={disabled}
              title={disabled ? PINCH_DISABLED_HINT : undefined}
              onClick={() => { if (!disabled) openWorkspace(w.label, w.key); }}
              styles={{
                root: {
                  color: isActive
                    ? "var(--mantine-color-dark-9)"
                  : "light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-0))",
                  fontWeight: isActive ? 600 : 400,
                  fontSize: 13,
                  height: 24,
                },
              }}
            >
              {w.label}
            </Button>
          );
        })}

        {/* --- Help ----------------------------------------------------- */}
        <TopMenu label="Help" px={shape.padX}>
          {/* WHERE HELP GOES IS THE TAB'S QUESTION (tabChrome.tabHelp).
              In a case tab it stays what it was: the guide AT the section for
              whatever is selected (a unit's type) or the active view.  In a
              TOOL tab it is that tool's own Theory-Guide section, named in the
              item -- `docs/help-index.json` has no `methods` entry, so the
              context resolution fell through to the User Guide's GUI chapter
              for all twelve tools, which is the "help genérico" of the
              complaint.  The same resolution backs the global F1. */}
          <Menu.Item
            rightSection={<Text size="xs" c="dimmed">F1</Text>}
            onClick={() => openGuide(help.url)}
          >
            {help.item}
          </Menu.Item>
          {/* The full topic -> guide-section index (docs/help-index.json),
              rendered as a deep-linking table of contents in a pop-out tab.
              A viewer, not an editor: it only opens the guides. */}
          <Menu.Item
            onClick={() => popOutHelpTopics()}
          >
            Browse help topics…
          </Menu.Item>
          <Menu.Divider />
          {/* The four glass-box manuals, all built by docs/Makefile and copied
              into public/docs by scripts/copyDocs.mjs (base-aware so the links
              work at "/" in dev and under a deployed base like /app):
                theoryGuide    -- first-principles model/unit/solver/property derivations
                propsGuide     -- the property-estimation + curation companion
                userGuide      -- case authoring + running the GUI/CLI
                developerGuide -- the C++ architecture for contributors */}
          <Menu.Item
            onClick={() => openGuide(guideUrl("theoryGuide"))}
          >
            Theory Guide (PDF)…
          </Menu.Item>
          {/* propsGuide is the props-MODE WORKFLOW (estimate -> fit ->
              consistency-test), NOT the property THEORY -- that lives in the
              Theory Guide, where modelDocs already deep-links it.  Label it
              honestly so it never reads as the theory home (forum 2026-06-15). */}
          <Menu.Item
            onClick={() => openGuide(guideUrl("propsGuide"))}
          >
            Props Workflow Guide (PDF)…
          </Menu.Item>
          <Menu.Item
            onClick={() => openGuide(guideUrl("userGuide"))}
          >
            User Guide (PDF)…
          </Menu.Item>
          <Menu.Item
            onClick={() => openGuide(guideUrl("developerGuide"))}
          >
            Developer Guide (PDF)…
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item onClick={aboutCtl.open}>About Choupo…</Menu.Item>
          {/* The shortcut card advertises the FILE menu's own bindings (and
              the canvas's), so it rides the same flag they do: in a tool tab
              those keys are not bound, and a card listing keys that do nothing
              is the File menu's lie in smaller type. */}
          {chrome.caseChrome && (
            <>
              <Menu.Divider />
              <Menu.Item disabled>
                <Text size="xs" c="dimmed" component="span">
                  Keyboard shortcuts:  Ctrl+O open, Ctrl+R reload, Ctrl+Enter run,
                  F fit view, Esc deselect
                </Text>
              </Menu.Item>
            </>
          )}
        </TopMenu>
    </>
  );

  /* A hidden ghost of one shape: the real markup, at the real font, laid out
   * at `max-content` so it reports what the shape WANTS rather than what the
   * box allows.  `visibility: hidden` keeps it out of the accessibility tree
   * and the tab order; `position: absolute` keeps it out of the layout; and it
   * is only in the document at all for the one pre-paint frame in which it is
   * measured (see methodsChrome.useIntrinsicWidth). */
  const ghost = (
    ref: React.MutableRefObject<HTMLDivElement | null>,
    shape: { collapsed: boolean; padX: number },
  ) => (
    <Box
      ref={ref}
      aria-hidden
      style={{
        position: "absolute", top: 0, left: 0, width: "max-content", height: "100%",
        visibility: "hidden", pointerEvents: "none",
      }}
    >
      <Group gap={2} px={shape.collapsed ? 4 : "xs"} h="100%" align="center" wrap="nowrap">
        {rowItems(shape)}
      </Group>
    </Box>
  );

  return (
    <>
      {/* `position: relative` so the ghosts anchor here and not on the page;
          `overflow: hidden` so a ghost mid-measurement can never paint or
          widen the header even for the frame it exists. */}
      <Box style={{ position: "relative", height: "100%", minWidth: 0, overflow: "hidden" }}>
        <Group
          gap={2}
          px={collapsed ? 4 : "xs"}
          h="100%"
          align="center"
        >
          {rowItems({ collapsed, padX })}
        </Group>
        {expandedRow.measuring  && ghost(expandedRow.ref,  { collapsed: false, padX: ROOMY_PAD_X })}
        {collapsedRow.measuring && ghost(collapsedRow.ref, { collapsed: true,  padX: COMPACT_PAD_X })}
      </Box>

      <Modal
        opened={aboutOpen}
        onClose={aboutCtl.close}
        title="About Choupo"
        size="sm"
        centered
      >
        <Stack gap="sm">
          <Text fw={700} size="lg">
            Choupo — Open Chemical Process Simulator
          </Text>
          <Text size="sm" c="dimmed">
            Educational chemical-process simulator — a transparent
            &ldquo;glass-box&rdquo; where every equation, Newton iteration,
            and K-value is visible in both the source and the run-time output.
          </Text>
          <Text size="sm">
            Copyright © 2026 Vítor Geraldes.
          </Text>
          <Text size="xs" c="dimmed">
            Licensed under the GNU GPL v3.0 or later — free for
            academic, research, personal, and commercial use.{" "}
            <Anchor
              href="https://www.gnu.org/licenses/gpl-3.0.html"
              target="_blank"
              rel="noreferrer"
            >
              Read the licence
            </Anchor>
.
          </Text>
          <Text size="xs" c="dimmed">
            Open source —{" "}
            <Anchor
              href="https://github.com/choupo-admin/choupo"
              target="_blank"
              rel="noreferrer"
            >
              view the source on GitHub
            </Anchor>
            .
          </Text>
          <Button variant="default" size="xs" onClick={aboutCtl.close} mt="sm">
            Close
          </Button>
        </Stack>
      </Modal>

      {/* ONE TAB, ONE THING: the tutorials browser OPENS a case, so it opens a
          TAB (one-tab-one-thing.md §4 — every "open" affordance, consistently).
          It used to call `loadTutorial` and replace whatever was on screen,
          which from the hub meant the hub stopped being the hub, and from a
          case tab meant a converged run was overwritten by a click in a
          gallery. */}
      <OpenTutorialModal
        opened={openTutorialOpen}
        onClose={openTutorialCtl.close}
        currentName={tutorialName}
        onSelect={(name) => openAppTab(caseTabSearch(name))}
      />

      <NewCaseModal opened={newCaseOpen} onClose={newCaseCtl.close} />
      <DuplicateCaseModal opened={dupOpen} onClose={dupCtl.close} />
    </>
  );
}

function TopMenu({
  label,
  children,
  width = 260,
  active = false,
  rightSection,
  px = 10,
}: {
  /** ReactNode, not string: a SELECTOR trigger renders its category and its
   *  value differently (`Views: Case`), and that is one label, not two
   *  controls. */
  label: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  /** Renders the trigger in the WORKSPACE-open posture (filled, like the
   *  workspace toggle buttons beside it), so a menu that stands in for a
   *  workspace tab still shows whether that workspace is on screen. */
  active?: boolean;
  /** Trailing adornment — the chevron that says "this opens a list".  Purely
   *  decorative: it must never be an interactive element of its own, or the
   *  trigger becomes two tab stops for one action. */
  rightSection?: React.ReactNode;
  /** Horizontal padding.  Trimmed in the narrow posture so the whole row fits
   *  390 px — see the width budget in MenuBar. */
  px?: number;
}) {
  return (
    <Menu
      trigger="click-hover"
      openDelay={0}
      closeDelay={150}
      shadow="md"
      width={width}
      position="bottom-start"
      offset={0}
      withArrow={false}
    >
      <Menu.Target>
        <Button
          variant={active ? "filled" : "subtle"}
          color={active ? "accent" : "gray"}
          size="compact-xs"
          px={px}
          rightSection={rightSection}
          styles={{
            root: {
              color: active
                ? "var(--mantine-color-dark-9)"
                : "light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-0))",
              fontWeight: active ? 600 : 400,
              fontSize: 13,
              height: 24,
            },
            section: { marginInlineStart: 4 },
          }}
        >
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>{children}</Menu.Dropdown>
    </Menu>
  );
}

/** The NARROW-posture VIEW chooser: the ten views of the open case as one
 *  dropdown.  Modes are not in here — they keep their own entries at every
 *  width (see the `narrow` note in MenuBar, and the design record).
 *
 *  It is handed the SAME entries the wide posture maps over, and the SAME
 *  active/disabled predicates — it owns no lineup of its own, so the two
 *  postures cannot drift (the arity rule, applied to a menu).
 *
 *  THE TRIGGER IS A SELECTOR, NOT A TAB, and the difference is the whole
 *  point of the 2026-08-17 decision.  It used to be labelled with the current
 *  workspace alone (`Case`) and filled like an active tab, which says *you
 *  are here* and says nothing about the other nine destinations behind it —
 *  the owner read the row as having gone short when in fact it had gone
 *  silent.  So: the category is the label, the current view is its VALUE
 *  beside it, a chevron says it opens, and the fill is gone.  Where you are
 *  is still on screen; what else exists is now on screen too. */
function ViewsMenu({ views, isActive, isDisabled, disabledHint, onPick, px }: {
  views: WorkspaceEntry[];
  isActive: (w: WorkspaceEntry) => boolean;
  isDisabled: (w: { key: WorkspaceKey | null }) => boolean;
  disabledHint: string;
  onPick: (label: string, key: WorkspaceKey | null) => void;
  px: number;
}) {
  const current = views.find((w) => isActive(w));
  const label = (
    <Text span fz={13} fw={400} c="dimmed">
      Views:{" "}
      <Text span fz={13} fw={600} c="accent">{current ? current.label : "none"}</Text>
    </Text>
  );
  return (
    <TopMenu
      label={label}
      width={240}
      px={px}
      rightSection={<IconChevronDown size={12} stroke={2} />}
    >
      <Menu.Label>Views of this case</Menu.Label>
      {views.map((w) => {
        const active = isActive(w);
        const disabled = isDisabled(w);
        return (
          <Menu.Item
            key={w.label}
            disabled={disabled}
            title={disabled ? disabledHint : undefined}
            leftSection={active
              ? <IconCheck size={14} />
              : <span style={{ display: "inline-block", width: 14 }} />}
            onClick={() => { if (!disabled) onPick(w.label, w.key); }}
            styles={{ itemLabel: { fontWeight: active ? 600 : 400 } }}
          >
            {w.label}
          </Menu.Item>
        );
      })}
    </TopMenu>
  );
}

/** THE EDUTOOLS TAB'S OWN CHOOSER, in the chrome row (2026-08-18).
 *
 *  Same shape as ViewsMenu directly above, and that is the point rather than
 *  a coincidence: both answer "which of a declared registry is on screen, and
 *  what else is there?", so they read as one grammar -- category dimmed, value
 *  in accent, a chevron that says it opens.  Writing this one differently
 *  would make two controls with one meaning look like two meanings.
 *
 *  It reads `METHOD_TOOLS`, the ONE home, and keeps no list of its own; a
 *  `planned` entry is rendered DISABLED rather than filtered out, because the
 *  registry's own rule is that the list is the roadmap, stated rather than
 *  implied.  Picking writes through `setActiveMethodTool`, which is also what
 *  updates `?workspace=methods&tool=<id>` -- so the tab's URL goes on being a
 *  shareable bookmark of what is on screen.
 *
 *  WHAT MOVING IT HERE COSTS, said rather than discovered later: the in-body
 *  row was a Mantine `Select` with `searchable`, and a menu does not search.
 *  Over twelve entries, all of them visible at once in one tap, a search field
 *  filters a list the reader can already see whole -- and a 30 px input with a
 *  border inside a 32 px menu bar reads as a form field parked in the chrome,
 *  which is the "unconsidered" the owner is objecting to in another form.  The
 *  Select survives unchanged for the case tab that still hosts the chooser in
 *  its body, so nothing is deleted; the day the registry outgrows a menu, that
 *  is the shape to come back to. */
function ToolMenu({ tool, px }: { tool: MethodToolId; px: number }) {
  const current = METHOD_TOOLS.find((m) => m.id === tool);
  const label = (
    <Text span fz={13} fw={400} c="dimmed">
      Tool:{" "}
      <Text span fz={13} fw={600} c="accent">
        {current ? current.label : "none"}
      </Text>
    </Text>
  );
  return (
    <TopMenu
      label={label}
      width={300}
      px={px}
      rightSection={<IconChevronDown size={12} stroke={2} />}
    >
      <Menu.Label>Classical method constructions</Menu.Label>
      {METHOD_TOOLS.map((m) => {
        const active = m.id === tool;
        const planned = m.status !== "live";
        return (
          <Menu.Item
            key={m.id}
            disabled={planned}
            title={planned ? `Planned — fed by ${m.fedBy ?? "an engine output not shipped yet"}` : undefined}
            leftSection={active
              ? <IconCheck size={14} />
              : <span style={{ display: "inline-block", width: 14 }} />}
            onClick={() => { if (!planned) setActiveMethodTool(m.id); }}
            styles={{ itemLabel: { fontWeight: active ? 600 : 400 } }}
          >
            {planned ? `${m.label} (planned)` : m.label}
          </Menu.Item>
        );
      })}
    </TopMenu>
  );
}

function Shortcut({ k }: { k: string }) {
  return (
    <Text size="xs" c="dimmed" ff="monospace">
      {k}
    </Text>
  );
}
