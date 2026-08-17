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

  EduTools (2026-08-16, Vítor's order) is the one workspace entry that is a
  MENU rather than a toggle button.  Its tool list used to be a permanent
  252px rail inside the workspace, and a tool panel painted over it — with the
  rail covered there was nothing to select with.  A dropdown costs no width
  when shut and cannot be painted over.  It renders from methods/registry.ts —
  the SAME registry the workspace body reads, never a second hand-written list
  here — and picking a tool opens the workspace on it.

  MODES AND VIEWS (2026-08-17, docs/design/modes-and-views-in-the-top-row.md).
  The lineup and its `kind` live in workspaces.ts, NOT here: this file renders
  it twice (wide row, narrow chooser) and must not own it, or the two postures
  would each acquire a lineup to drift.  What this file adds is the POSTURE
  rule the record decided — modes stay visible at every width, views collapse
  into a chooser labelled for what it OPENS with the current view as its
  VALUE.  The old collapsed control was labelled `Case`, which is a lit tab
  saying *you are here* while ten destinations sat unannounced behind it.
\*---------------------------------------------------------------------------*/

import { useEffect } from "react";
import {
  Anchor,
  Badge,
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
  WORKSPACES, splitWorkspaces, visibleWorkspacesFor, type WorkspaceEntry,
} from "./workspaces.js";
import { resolveHelp, helpUrl } from "../help/helpMap.js";
import { popOutHelpTopics } from "./helpTopicsPopOut.js";
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
import {
  EDUTOOLS_BLURB, EDUTOOLS_LABEL, METHOD_TOOLS, setActiveMethodTool,
  useActiveMethodTool,
} from "./methods/registry.js";
import { useNarrowViewport } from "./methods/methodsChrome.js";

export function MenuBar() {
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
  /* THE SPLIT, taken ONCE and consumed by both postures (workspaces.ts owns
   * the property; this is only a rendering of it). */
  const { views: visibleViews } = splitWorkspaces(visibleWorkspaces);
  /* NARROW POSTURE: the VIEWS become one chooser; the MODES do not.
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
   * WHAT THE 2026-08-17 DECISION CHANGED, and why (docs/design/
   * modes-and-views-in-the-top-row.md).  That first collapse swept ALL of it
   * into the dropdown, MODES INCLUDED, and labelled the trigger with the
   * current workspace.  Two consequences, both wrong:
   *
   *   1. `Explore` -- one of only two things a visitor with nothing open can
   *      do -- ended up inside a menu named after a view of a case.  The flat
   *      strip had made that category error invisible; the dropdown made it
   *      structural.  So MODES no longer collapse: they are few (two), they
   *      never change with the case, and they are the whole offer on a blank
   *      boot.  Only VIEWS go into the chooser.
   *   2. The trigger read `Case`, i.e. a lit tab saying *you are here* over
   *      ten unannounced destinations.  It now reads `Views: Case` -- the
   *      category is the LABEL, the current view is its VALUE -- and it is
   *      styled as a selector rather than an active tab, because the fill was
   *      exactly the "arrived" signal that hid the ten.
   *
   * EduTools keeps its OWN trigger in both postures, because it is not merely
   * a tab: its dropdown is the only chooser for the twelve tools (the rail
   * moved into the top bar in 9e5ff796 and MethodsWorkspace renders no tool
   * list of its own).  Folding it into a plain item would open the workspace
   * with no way to change tool.  That was already true before it was also a
   * mode; the two reasons agree.
   *
   * The WIDE posture is untouched: every workspace is its own entry there, in
   * declared order, so the split costs the desk nothing (§5 of the record --
   * this is not a navigation redesign). */
  const narrow = useNarrowViewport();
  const activeWorkspace = useStore((s) => s.activeWorkspace);
  const toggleWorkspace = useStore((s) => s.toggleWorkspace);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);

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
  useHotkeys([
    ["mod+O", () => { if (!isolated) openTutorialCtl.open(); }],
    ["mod+shift+N", (e) => { e.preventDefault(); newCaseCtl.open(); }],
    ["mod+R", (e) => { e.preventDefault(); reloadCase(); }],
    ["mod+Enter", () => { if (runStatus !== "running") fireRun(); }],
  ]);

  return (
    <>
      <Group
        gap={2}
        px="xs"
        h="100%"
        align="center"
      >
        {/* --- File ----------------------------------------------------- */}
        <TopMenu label="File">
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

        {/* --- Run ------------------------------------------------------ */}

        {/* --- Workspaces -------------------------------------------------
            Top-level toggles.  Active workspace is highlighted; clicking
            it again closes back to the canvas-only default. */}
        {/* NARROW: one chooser over the VIEWS (see `narrow` above for why a
            dropdown and not a scrolling strip, and why the modes stay out of
            it).  The modes keep their own entries, rendered by the map below
            in declared order. */}
        {narrow && visibleViews.length > 0 && (
          <ViewsMenu
            views={visibleViews}
            isActive={isWorkspaceActive}
            isDisabled={isWorkspaceDisabled}
            disabledHint={PINCH_DISABLED_HINT}
            onPick={openWorkspace}
          />
        )}
        {visibleWorkspaces.map((w) => {
          // EduTools is a DROPDOWN in the same slot the other workspaces put a
          // toggle button: the tool list is what the student is choosing, so
          // the chooser belongs where the chooser is, not as a band inside the
          // workspace it is supposed to be showing.  It survives the narrow
          // collapse for the same reason.
          if (w.key === "methods") {
            return (
              <EduToolsMenu
                key={w.label}
                active={activeWorkspace === "methods"}
                onPick={() => setActiveWorkspace("methods")}
                onClose={() => toggleWorkspace("methods")}
              />
            );
          }
          if (narrow && w.kind === "view") return null;   // in the chooser above
          const isActive = isWorkspaceActive(w);
          const disabled = isWorkspaceDisabled(w);
          return (
            <Button
              key={w.label}
              variant={isActive ? "filled" : "subtle"}
              color={isActive ? "accent" : "gray"}
              size="compact-xs"
              px={10}
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
        <TopMenu label="Help">
          {/* Context-sensitive: opens the guide AT the section for whatever is
              selected (a unit's type) or the active workspace.  Same resolution
              as the global F1 shortcut. */}
          <Menu.Item
            rightSection={<Text size="xs" c="dimmed">F1</Text>}
            onClick={() => {
              const s = useStore.getState();
              let selectedUnitType: string | null = null;
              const sel = s.selectedNodeId;
              if (sel && sel.startsWith("unit:") && s.caseFiles.flowsheet) {
                const name = sel.slice(5);
                const units = (s.caseFiles.flowsheet["units"] ?? []) as Array<Record<string, unknown>>;
                selectedUnitType = (units.find((x) => x["name"] === name)?.["type"] as string | undefined) ?? null;
              }
              const target = resolveHelp({ selectedUnitType, activeWorkspace: s.activeWorkspace });
              openGuide(helpUrl(target));
            }}
          >
            Help on current view
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
          <Menu.Divider />
          <Menu.Item disabled>
            <Text size="xs" c="dimmed" component="span">
              Keyboard shortcuts:  Ctrl+O open, Ctrl+R reload, Ctrl+Enter run,
              F fit view, Esc deselect
            </Text>
          </Menu.Item>
        </TopMenu>
      </Group>

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

      <OpenTutorialModal
        opened={openTutorialOpen}
        onClose={openTutorialCtl.close}
        currentName={tutorialName}
        onSelect={loadTutorial}
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
          px={10}
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
function ViewsMenu({ views, isActive, isDisabled, disabledHint, onPick }: {
  views: WorkspaceEntry[];
  isActive: (w: WorkspaceEntry) => boolean;
  isDisabled: (w: { key: WorkspaceKey | null }) => boolean;
  disabledHint: string;
  onPick: (label: string, key: WorkspaceKey | null) => void;
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

/** The EduTools dropdown — the classical method constructions, listed from
 *  methods/registry.ts (ONE registry; the workspace body reads the same array,
 *  so the menu and the workspace can never disagree about what exists).
 *
 *  Behaviour where the brief left a choice: clicking the top-bar item opens
 *  ONLY the menu; the workspace opens when a tool is PICKED.  Opening a
 *  workspace behind a menu the student has not chosen from yet would move the
 *  screen out from under them before they said what they wanted.
 *
 *  Planned entries stay VISIBLE and disabled (the list is the roadmap, stated
 *  rather than implied) — there are none today, and the branch stays so that
 *  adding one is a registry edit, not a menu edit. */
function EduToolsMenu({ active, onPick, onClose }: {
  active: boolean;
  onPick: () => void;
  onClose: () => void;
}) {
  const tool = useActiveMethodTool();
  return (
    <TopMenu label={EDUTOOLS_LABEL} width={330} active={active}>
      <Menu.Label>Classical method constructions</Menu.Label>
      {METHOD_TOOLS.map((m) => {
        // The check marks what is ON SCREEN, so it is shown only while the
        // workspace is actually open: with EduTools closed, the registry still
        // remembers a selection, but nothing is being displayed and a tick
        // would claim otherwise.
        const isCurrent = active && m.id === tool;
        return (
          <Menu.Item
            key={m.id}
            disabled={m.status === "planned"}
            leftSection={
              isCurrent
                ? <IconCheck size={14} />
                : <span style={{ display: "inline-block", width: 14 }} />
            }
            rightSection={m.status === "planned"
              ? <Badge size="xs" variant="outline" color="gray" tt="none">planned</Badge>
              : undefined}
            onClick={() => {
              if (m.status !== "live") return;
              setActiveMethodTool(m.id);
              onPick();
            }}
            styles={{ itemLabel: { fontWeight: isCurrent ? 600 : 400 } }}
          >
            {m.label}
          </Menu.Item>
        );
      })}
      {active && (
        <>
          <Menu.Divider />
          <Menu.Item onClick={onClose}>Close {EDUTOOLS_LABEL}</Menu.Item>
        </>
      )}
      <Menu.Divider />
      <Menu.Item disabled>
        <Text size="xs" c="dimmed" component="span" style={{ whiteSpace: "normal" }}>
          {EDUTOOLS_BLURB}
        </Text>
      </Menu.Item>
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
