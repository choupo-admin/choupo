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
\*---------------------------------------------------------------------------*/

import { useEffect } from "react";
import {
  Anchor,
  Button,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { useDisclosure, useHotkeys } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import { useStore, reopenLastCase, lastCaseLabel, hasCaseOpen, isIsolatedTab, type WorkspaceKey } from "../state/store.js";
import { resolveHelp, helpUrl } from "../help/helpMap.js";
import { popOutHelpTopics } from "./helpTopicsPopOut.js";
import { OpenTutorialModal } from "./OpenTutorialModal.js";
import { NewCaseModal } from "./NewCaseModal.js";
import { DuplicateCaseModal } from "./DuplicateCaseModal.js";
import { readCaseAt } from "../cases/workspace.js";
import { localCaseDir } from "../case/caseName.js";
import { downloadCaseZip } from "../case/saveCase.js";
import { openCaseZip, openCaseFolder, SUPPORTS_DIR_PICKER } from "../cases/loadCase.js";
import { canComputePinch } from "../case/pinch.js";
import { collectControllerKnobs } from "../case/controllerKnobs.js";

// Workspaces in the top menu.  Each is a top-level toggle:
//   - implemented entries (`key` truthy) flip the global activeWorkspace
//   - placeholders ({ key: null }) still show a "coming soon" notification
//     so the menu reads as the contract for what is on the way
// "Flowsheet" is the canvas itself (activeWorkspace === null); it is handled
// specially in openWorkspace (by label) so you can switch BACK from Props to
// the flowsheet symmetrically, the mirror of "Simulate process ->".
const WORKSPACES: { label: string; key: WorkspaceKey | null }[] = [
  { label: "Flowsheet", key: null        },
  { label: "Props",     key: "props"     },   // right next to Flowsheet -- the two phases
  { label: "Explore",   key: "explore"   },   // interactive property scratchpad (see, then decide)
  { label: "Streams",   key: "streams"   },
  { label: "Variables", key: "variables" },
  { label: "Control",   key: "control"   },   // PID tuning bench (choupoCtrl + a PID)
  { label: "Plots",     key: "plots"     },
  { label: "Log",       key: "log"       },
  { label: "Case",      key: "case"      },
  { label: "Pinch",     key: "pinch"     },   // greyed until a run yields heat duties
  { label: "Reports",   key: "reports"   },   // utilities + global balances (post-run)
];

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
  // Frankenstein the props GUI was accused of) never shows.  With NO case open
  // (blank boot) there are no tabs at all -- just File + Help.
  //   choupoProps  -> Props · Plots · Log · Case       (no canvas/streams/duties)
  //   choupoSolve  -> the full steady set              (streams, variables, pinch)
  //   choupoBatch/Ctrl -> Flowsheet · Props · Plots · Log · Case
  //                       (no steady-only Streams/Variables/Pinch/Reports)
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
  // "Explore" is in EVERY set: the property explorer synthesizes its own
  // transient case, so it is independent of the loaded case's type.
  const SET_PROPS = new Set(["Props", "Explore", "Plots", "Log", "Case"]);
  const SET_SOLVE = new Set(["Flowsheet", "Props", "Explore", "Streams", "Variables", "Plots", "Log", "Case", "Pinch", "Reports"]);
  const SET_TIME = new Set([
    "Flowsheet", "Props", "Explore", "Plots", "Log", "Case",
    ...(hasPid ? ["Control"] : []),
  ]);
  const allowedLabels: Set<string> =
    !hasCaseOpen(tutorialName) ? new Set(["Explore"])            // blank boot: only the standalone Explorer
    : showIntro ? new Set()                                      // intro -> no tabs
    : isPropsCase || application === "choupoProps" ? SET_PROPS
    : application === "choupoBatch" || application === "choupoCtrl" ? SET_TIME
    : SET_SOLVE;                                                  // choupoSolve / default
  const visibleWorkspaces = WORKSPACES.filter((w) => allowedLabels.has(w.label));
  const activeWorkspace = useStore((s) => s.activeWorkspace);
  const toggleWorkspace = useStore((s) => s.toggleWorkspace);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);

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
  // Load the user's OWN case INTO the GUI from explicit input (no bridge, no
  // disk snooping) -- works on the hosted site. .zip = every browser; folder =
  // Chromium only.  Both build CaseFiles in memory + go through loadExternalCase.
  const openZipCase = () => {
    openCaseZip()
      .then((r) => { if (r) loadExternalCase(r.name, r.files); })
      .catch((e) => notifications.show({ title: "Could not open the .zip case", message: (e as Error).message, color: "red" }));
  };
  const openFolderCase = () => {
    openCaseFolder()
      .then((r) => { if (r) loadExternalCase(r.name, r.files); })
      .catch((e) => notifications.show({ title: "Could not open the folder", message: (e as Error).message, color: "red" }));
  };

  // The WelcomeScreen (blank boot) fires these to drive the modals MenuBar owns,
  // so its buttons reach New Case / Open Tutorial / Open .zip without lifting the
  // modals out of here (mirrors the choupo:run decoupling).
  useEffect(() => {
    const onNew = () => newCaseCtl.open();
    const onTut = () => openTutorialCtl.open();
    const onZip = () => openZipCase();
    window.addEventListener("choupo:welcome:new-case", onNew);
    window.addEventListener("choupo:welcome:open-tutorial", onTut);
    window.addEventListener("choupo:welcome:open-zip", onZip);
    return () => {
      window.removeEventListener("choupo:welcome:new-case", onNew);
      window.removeEventListener("choupo:welcome:open-tutorial", onTut);
      window.removeEventListener("choupo:welcome:open-zip", onZip);
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
          <Menu.Item onClick={openZipCase}>
            Open Case (.zip)…
          </Menu.Item>
          {SUPPORTS_DIR_PICKER && (
            <Menu.Item onClick={openFolderCase}>
              Open Case Folder…
            </Menu.Item>
          )}
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
              Your cases live in $CHOUPO_WORKSPACE; tutorials are read-only.
              Edit the dicts with your editor or the 🤖 console.
            </Text>
          </Menu.Item>
        </TopMenu>

        {/* --- Run ------------------------------------------------------ */}

        {/* --- Workspaces -------------------------------------------------
            Top-level toggles.  Active workspace is highlighted; clicking
            it again closes back to the canvas-only default. */}
        {visibleWorkspaces.map((w) => {
          // In a props case the centre is PropsView by default, so "Props" is
          // the home (active when no other workspace is open).
          const isActive = w.label === "Flowsheet"
            ? activeWorkspace === null               // the canvas itself
            : isPropsCase && w.label === "Props"
            ? activeWorkspace === null || activeWorkspace === "props"
            : w.key !== null && w.key === activeWorkspace;
          // Pinch needs a completed run with heat duties -> greyed until then.
          const disabled = w.key === "pinch" && !pinchReady;
          return (
            <Button
              key={w.label}
              variant={isActive ? "filled" : "subtle"}
              color={isActive ? "accent" : "gray"}
              size="compact-xs"
              px={10}
              disabled={disabled}
              title={disabled ? "Run the flowsheet first — pinch needs the converged duties" : undefined}
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
              window.open(helpUrl(target, import.meta.env.BASE_URL), "_blank", "noopener");
            }}
          >
            Help on current view
          </Menu.Item>
          {/* The full topic -> guide-section index (docs/help-index.json),
              rendered as a deep-linking table of contents in a pop-out tab.
              A viewer, not an editor: it only opens the guides. */}
          <Menu.Item
            onClick={() => popOutHelpTopics(import.meta.env.BASE_URL)}
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
            onClick={() => window.open(`${import.meta.env.BASE_URL}docs/theoryGuide.pdf`, "_blank", "noopener")}
          >
            Theory Guide (PDF)…
          </Menu.Item>
          {/* propsGuide is the props-MODE WORKFLOW (estimate -> fit ->
              consistency-test), NOT the property THEORY -- that lives in the
              Theory Guide, where modelDocs already deep-links it.  Label it
              honestly so it never reads as the theory home (forum 2026-06-15). */}
          <Menu.Item
            onClick={() => window.open(`${import.meta.env.BASE_URL}docs/propsGuide.pdf`, "_blank", "noopener")}
          >
            Props Workflow Guide (PDF)…
          </Menu.Item>
          <Menu.Item
            onClick={() => window.open(`${import.meta.env.BASE_URL}docs/userGuide.pdf`, "_blank", "noopener")}
          >
            User Guide (PDF)…
          </Menu.Item>
          <Menu.Item
            onClick={() => window.open(`${import.meta.env.BASE_URL}docs/developerGuide.pdf`, "_blank", "noopener")}
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
}: {
  label: string;
  children: React.ReactNode;
  width?: number;
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
          variant="subtle"
          color="gray"
          size="compact-xs"
          px={10}
          styles={{
            root: {
              color: "light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-0))",
              fontWeight: 400,
              fontSize: 13,
              height: 24,
            },
          }}
        >
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>{children}</Menu.Dropdown>
    </Menu>
  );
}

function Shortcut({ k }: { k: string }) {
  return (
    <Text size="xs" c="dimmed" ff="monospace">
      {k}
    </Text>
  );
}
