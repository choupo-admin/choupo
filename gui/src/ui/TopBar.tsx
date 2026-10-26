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
  Top toolbar.  Shares the header row with the MenuBar and provides the
  primary action surface: brand, case breadcrumb, and THE case's Run
  (ui/RunButton.tsx -- one Run in one fixed place, DEV.md 4c C172 item 5).
  The run is ORCHESTRATED here because this holds the AbortController for
  the in-flight solver; the button and the Ctrl+Enter hotkey dispatch
  `choupo:run` / `choupo:stop` DOM events that we listen for, one source of
  truth.  The engine version and the adapter that ran are implementation
  metadata: they left this bar for the status bar (ui/StatusBar.tsx).
\*---------------------------------------------------------------------------*/

import { compositeMembers } from "../case/toGraph.js";
import { readEdges } from "../case/toGraph.js";
import { zeroStateText } from "../case/toGraph.js";
import { ActionIcon, Badge, Group, Text, Tooltip } from "@mantine/core";
import { RunButton } from "./RunButton.js";
import { editsBesideRunWrites } from "../case/caseWrites.js";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconDeviceFloppy,
  IconFlask,
  IconRestore,
  IconRobot,
  IconClipboardCopy,
} from "@tabler/icons-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { resolveAdapter } from "../adapters/index.js";
import { withDisplayPrefs } from "../case/applyPrefs.js";
import { withFrozenBoundaryState } from "../case/resultSlice.js";
import { applyScratch } from "../case/scratch.js";
import { declaredInputsOf, runInputsOf } from "../case/staleness.js";
import { downloadFlowsheetDict } from "../case/saveCase.js";
import { caseHasUserCode, USER_CODE_MSG } from "../case/userCode.js";
import { TUTORIALS } from "../cases/tutorials.js";
import { useStore, hasCaseOpen } from "../state/store.js";
import { useCaseMode } from "../state/useCaseMode.js";
import { binaryForMode, MODE_LABEL } from "../case/caseModes.js";
import { UnitsMenu } from "./UnitsMenu.js";
import { ColoursMenu } from "./ColoursMenu.js";
import { ColorSchemeToggle } from "./ColorSchemeToggle.js";
import { ClipboardBridge } from "./ClipboardBridge.js";
import { CaseSwitcher } from "./CaseSwitcher.js";
import { tabChromeFor } from "./tabChrome.js";

/** The case bar's state badges at the one minimum text size (DEV.md 4c C168
 *  slice 2: Mantine's xs badge is 9 px), and a light badge's word in an ink
 *  that holds on its own tint (the light variant's teal measured ~2:1). */
const BADGE_11 = { root: { fontSize: 11, height: 18 } } as const;
const BADGE_11_INK = (c: string) => ({ root: { fontSize: 11, height: 18,
  color: `light-dark(var(--mantine-color-${c}-9), var(--mantine-color-${c}-3))` } });

export function TopBar({ onMinWidth }: {
  /* THE WIDTH THIS BAR MUST KEEP, measured and handed to the shell.
   *
   * The header is one line shared with the navigation, and something has to
   * say how that line is divided.  Whatever the answer, it may not be a
   * remembered number: this bar's own content decides it (the icon cluster
   * grows a control when the case has unsaved tinkering), so a constant would
   * be right on the day it was written and quietly wrong after.
   *
   * The minimum is the BRAND LOCKUP (also the Home control) plus the ICON
   * CLUSTER (five to seven real controls, `flexShrink: 0` -- a control that
   * disappears is not a control that works), plus the row's own padding and
   * gap read off the live computed style rather than restated from Mantine's
   * spacing scale.  Everything between them -- the version badge, the case
   * path, the status pills -- is INFORMATION and is allowed to ellipsize;
   * that is why the case path grew a `truncate` in the same change.
   *
   * Absent (a TopBar mounted outside the shell) nothing is reported and
   * nothing depends on it. */
  onMinWidth?: (px: number) => void;
} = {}) {
  const status = useStore((s) => s.runStatus);
  const startRun = useStore((s) => s.startRun);
  const finishRun = useStore((s) => s.finishRun);
  const markFlowsheetRun = useStore((s) => s.markFlowsheetRun);
  const failRun = useStore((s) => s.failRun);
  const finishPropsRun = useStore((s) => s.finishPropsRun);
  const carryRunWrites = useStore((s) => s.carryRunWrites);
  const markPropsRun = useStore((s) => s.markPropsRun);
  //  THE RUN FOLLOWS THE MODE ON SCREEN (DEV.md 4c C157).  A two-mode case
  //  shown in Properties & data runs its propsDict (choupoProps) on every
  //  door -- the screen's own button, Ctrl+Enter, the menu -- and one shown
  //  in Process runs its flowsheet, by bin/runCase's rule
  //  (case/caseModes.ts binaryForMode).  It ran the controlDict's
  //  application whatever the screen showed, so Ctrl+Enter on the fit
  //  screen solved the flowsheet.  A one-mode case keeps its application.
  const caseMode = useCaseMode();
  const appendLog = useStore((s) => s.appendLog);
  const caseFiles = useStore((s) => s.caseFiles);
  const runResult = useStore((s) => s.runResult);
  const pristineCaseFiles = useStore((s) => s.pristineCaseFiles);
  const scratchEdits = useStore((s) => s.scratchEdits);
  const tutorialName = useStore((s) => s.tutorialName);
  const displayPrefs = useStore((s) => s.displayPrefs);
  const discardEdits = useStore((s) => s.discardEdits);
  const agentOpen = useStore((s) => s.agentOpen);
  const toggleAgent = useStore((s) => s.toggleAgent);
  const goHome = useStore((s) => s.goHome);
  const [clipOpen, setClipOpen] = useState(false);
  const showIntro = useStore((s) => s.showIntro);
  const dismissIntro = useStore((s) => s.dismissIntro);
  const setAdapterKind = useStore((s) => s.setAdapterKind);
  /* THE IDENTITY SLOT BELONGS TO A TAB THAT IS ABOUT A CASE (2026-08-18,
   * ui/tabChrome.ts).  A tool tab has no case, so its "No case open" was
   * reporting the absence of something that is not that tab's business -- the
   * top-bar half of the same defect as the File menu, and it rides the SAME
   * flag rather than a second condition spelled here. */
  const activeWorkspace = useStore((s) => s.activeWorkspace);
  const caseChrome = tabChromeFor({
    hasCase: hasCaseOpen(tutorialName), activeWorkspace,
  }).caseChrome;
  // The 🤖 console runs a REAL `claude -c` through the LOCAL bridge (port 7682),
  // which only exists when you run `bin/runGui` on your own machine.  On the
  // hosted site (a Tailscale/remote hostname) there is no bridge, so the robot
  // would only error -- show it ONLY on localhost.  The 📋 clipboard bridge
  // (bring-your-own claude.ai) works everywhere and stays.
  const localBridgeHost = typeof location !== "undefined"
    && (location.hostname === "localhost" || location.hostname === "127.0.0.1");
  // Edit tracking: derive locally so React re-renders when either side
  // changes.  JSON-stringify is fine for the small edit surface today
  // (a few scalars in operation blocks); switch to a flag if it ever
  // shows up in profiling.
  //  A FILE THE RUN WROTE INTO THE CASE IS NOT AN EDIT (DEV.md 4c C172
  //  item 6): a fit that writes its record changes the open case, and the
  //  bar called that "edited" -- asking the reader to save or discard work
  //  they did not do.  The run's own writes are "updated by run"; only what
  //  differs beside them is the reader's edit (case/caseWrites.ts).
  const { userEdited: hasEdits, runUpdated } = useMemo(
    () => editsBesideRunWrites(caseFiles, pristineCaseFiles),
    [caseFiles, pristineCaseFiles],
  );
  // Transient tinkering: numbers grabbed in the Properties box, applied at Run,
  // never written to disk.  A loud amber badge announces them; Reset clears.
  const clearAllScratch = useStore((s) => s.clearAllScratch);
  const scratchCount = Object.keys(scratchEdits).length;

  const abortRef = useRef<AbortController | null>(null);

  const currentEntry = useMemo(
    () => TUTORIALS.find((t) => t.name === tutorialName) ?? null,
    [tutorialName],
  );
  // Nothing to run on a blank boot (no case) or a case with neither a
  // flowsheet nor a propsDict.
  const nothingToRun = !caseFiles.flowsheet && !caseFiles.propsDict;
  const cannotRun = nothingToRun || !!currentEntry?.unsupportedReason;
  const runDisabled = status === "running" || cannotRun;

  const onRun = useCallback(async () => {
    if (runDisabled) return;
    //  Run from the tutorial's intro screen: the intro's own "Open & run"
    //  door left with the other three (C172), so the toolbar's Run, pressed
    //  there, opens the case it runs.
    if (showIntro) dismissIntro();
    // A case with its OWN C++ (code/) needs local compilation (buildCode); the
    // browser can't compile C++, so pre-empt with a clear message instead of a
    // raw "unknown type" failure from the prebuilt WASM.
    if (caseHasUserCode(caseFiles)) {
      notifications.show({
        title: "Custom-code case — run it locally",
        message: USER_CODE_MSG,
        color: "yellow",
        icon: <IconAlertTriangle size={16} />,
        autoClose: false,
      });
      return;
    }
    startRun();
    const resolved = await resolveAdapter("wasm");
    setAdapterKind(resolved.kind);

    // Hosted build, WASM missing: REFUSE to run -- never fabricate numbers with
    // the mock.  Loud, blocking, no auto-close.
    if (resolved.kind === "unavailable") {
      failRun();
      notifications.show({
        title: "Solver unavailable — nothing was run",
        message: resolved.fallbackReason
          ?? "The real (WebAssembly) solver could not be loaded.",
        color: "red",
        icon: <IconAlertTriangle size={16} />,
        autoClose: false,
      });
      return;
    }
    // Dev only: the mock ran.  Make it unmistakable the numbers are NOT real.
    if (resolved.kind === "mock" && resolved.fallbackReason) {
      notifications.show({
        title: "Using the MOCK solver — numbers are NOT real",
        message: resolved.fallbackReason,
        color: "yellow",
        icon: <IconAlertTriangle size={16} />,
        autoClose: 8000,
      });
    }

    const ctl = new AbortController();
    abortRef.current = ctl;

    try {
      // Apply the TRANSIENT tinkering overlay (numbers grabbed in the
      // Properties box) onto the case JSON for THIS run only -- the dicts on
      // disk are untouched (scratch lives in the store, never written).
      const tinkered = applyScratch(caseFiles, scratchEdits);
      // Splice the active display preset into controlDict.units so
      // the solver log honours the same choice as the StreamsTable.
      let filesForRun = withDisplayPrefs(tinkered, displayPrefs);
      // Drilled sector: freeze its boundary inlets as per-stream 0/ state
      // files (extraFiles) from the inherited (or last) run, so Run re-solves
      // with the parent's inputs instead of unfed boundary inlets.  Done HERE
      // (run time) so it holds no matter how the tab was opened; a 0/ state
      // the sub-case already carries still wins.  Stream state never enters
      // the flowsheet dict -- the engine refuses a streams{} block.
      filesForRun = withFrozenBoundaryState(filesForRun, runResult);
      // Visible diagnosis: a drilled sector with a boundary inlet that STILL has
      // no feed will solve to nothing.  Name them so the failure is obvious.
      {
        const fsr = filesForRun.flowsheet as Record<string, unknown> | undefined;
        const bnd = fsr?.["boundary"] as Record<string, unknown> | undefined;
        const inl = bnd?.["inlets"];
        // An inlet is FED if it carries a 0/ state file -- at the root
        // (0/RawJuice) OR sector-owned (0/CONCENTRATION/PlantSteam), the
        // ownership layout the engine uses (a feed is owned by its consuming
        // sector) -- authored (rawFiles) or projected for this run
        // (extraFiles, incl. the frozen boundary state above).
        const present = { ...(caseFiles.rawFiles ?? {}),
                          ...(filesForRun.extraFiles ?? {}) };
        const unfed = Array.isArray(inl)
          ? inl.filter((x): x is string =>
              typeof x === "string"
              && zeroStateText(present, x) === undefined) : [];
        if (unfed.length) {
          notifications.show({
            color: "yellow", title: "Boundary inlet has no feed",
            message: `Inlet(s) ${unfed.join(", ")} are unfed — re-open this sector from the parent's finished run so their values carry over.`,
            autoClose: 8000,
          });
        }
      }
      const binary = caseMode.modes
        ? binaryForMode(caseMode.mode, caseFiles.controlDict["application"]) : undefined;
      if (caseMode.modes)
        appendLog(`[gui] ${MODE_LABEL[caseMode.mode]} mode on screen -- running ${binary}\n`);
      const result = await resolved.adapter.run(filesForRun,
        appendLog,
        ctl.signal,
        binary,
      );
      //  Files the run wrote INTO the case (a fitted record) are carried
      //  back into it and announced in the Log (case/caseWrites.ts).
      const carried = carryRunWrites(result)
        .filter((n) => n.change !== "unchanged");
      //  A TWO-MODE case's Properties & data run keeps its own result slot:
      //  the Process result (streams, KPIs) is not replaced by a fit.
      if (caseMode.modes && caseMode.mode === "props") {
        finishPropsRun(result, declaredInputsOf(useStore.getState().caseFiles, scratchEdits));
        if (result.status === "done") markPropsRun();
        notifications.show({
          title: result.status === "done" ? "Properties & data run complete" : "Properties & data run failed",
          message: result.status !== "done"
            ? "choupoProps did not finish -- the Log has the engine's own message."
            : carried.length > 0
              ? `${carried.map((n) => n.path).join(", ")} ${carried.length === 1 ? "was" : "were"} written into the case `
                + "(see the Log) -- Process mode now reads it."
              : "See the results on this screen.",
          color: result.status === "done" ? "teal" : "red",
          icon: result.status === "done" ? <IconCircleCheck size={16} /> : <IconAlertTriangle size={16} />,
          autoClose: result.status === "done" ? 6000 : 8000,
        });
        return;
      }
      //  STAMP WHAT WAS RUN.  `tinkered` -- not `filesForRun` -- is the
      //  subject: the display preset and a drilled sector's frozen boundary
      //  state are added by the run, not declared by the student, and
      //  fingerprinting them would make every result read as stale.  See
      //  case/staleness.ts.
      //  A file the run itself wrote into the case is part of what this
      //  result answers, so the stamp is taken on the case WITH it --
      //  otherwise a fit's own record would make its result read as stale.
      finishRun(result, carried.length > 0
        ? declaredInputsOf(useStore.getState().caseFiles, scratchEdits)
        : runInputsOf(tinkered, scratchEdits));
      // CURATION-PHASE: a composite case (sectors) whose streams are not wired
      // (children but empty connections) is still in curation -- choupoSolve
      // emits the curation message and there is NOTHING simulated.  The GUI must
      // say so, NOT "Solved" (and must NOT mark a flowsheet run).
      const fs = caseFiles.flowsheet;
      const inCuration = !!fs
        && compositeMembers(fs).length > 0
        && (readEdges(fs).length === 0);
      if (result.status === "done" && inCuration) {
        notifications.show({
          title: "Property-curation phase — not simulated",
          message: "The sectors are not wired yet (the flowsheet has no connections). "
            + "Open a sector (double-click it) to curate its properties as its own case; "
            + "add the connections to assemble + simulate the plant.",
          color: "yellow",
          icon: <IconAlertTriangle size={16} />,
          autoClose: 8000,
        });
      } else if (result.status === "done") {
        // Iteration audit: a real flowsheet run -- stamp it so the Props view can
        // tell whether the simulation reflects the consolidated props.
        if (caseFiles.flowsheet) markFlowsheetRun();
        // A props-only case has no streams to point at -- its results are the
        // property views (overlays / cards / consistency), not a stream table.
        if (!caseFiles.flowsheet) {
          notifications.show({
            title: "Run complete",
            //  The results lead the screen after a run (DEV.md 4c C168): the
            //  toast no longer points elsewhere.
            message: "Properties computed — the results lead this screen.",
            color: "teal",
            icon: <IconCircleCheck size={16} />,
            autoClose: 4000,
          });
        }
        //  A FLOWSHEET RUN ENDS IN NO TOAST (DEV.md 4c C168): what it
        //  concluded -- converged, the closures, the advisories, the products
        //  -- is the persistent run-summary strip above the canvas
        //  (ui/RunSummaryStrip.tsx), a status region read off the result.
        //  The toast pointed elsewhere and was gone in four seconds, and it
        //  counted "iterations" off the longest residual history in TS.
      }
    } catch (e) {
      appendLog(`\n[adapter] uncaught error: ${(e as Error).message}\n`);
      failRun();
    } finally {
      abortRef.current = null;
    }
  }, [
    runDisabled,
    caseFiles,
    runResult,
    scratchEdits,
    displayPrefs,
    startRun,
    appendLog,
    finishRun,
    failRun,
    finishPropsRun,
    carryRunWrites,
    markPropsRun,
    caseMode.modes,
    caseMode.mode,
    showIntro,
    dismissIntro,
    setAdapterKind,
  ]);

  const onStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Wire the menu-bar's Run / Stop items.
  useEffect(() => {
    const r = () => onRun();
    const s = () => onStop();
    window.addEventListener("choupo:run", r);
    window.addEventListener("choupo:stop", s);
    return () => {
      window.removeEventListener("choupo:run", r);
      window.removeEventListener("choupo:stop", s);
    };
  }, [onRun, onStop]);

  /* THE MINIMUM, MEASURED (see the `onMinWidth` prop for what it is and why it
   * is not a constant).  Read in a layout effect so the shell's header
   * decision lands before the first paint, and re-read whenever the two
   * clusters change size -- the icon cluster gains a control when a case picks
   * up unsaved tinkering, and that is a real change of this bar's minimum. */
  const rowRef = useRef<HTMLDivElement | null>(null);
  const brandRef = useRef<HTMLDivElement | null>(null);
  const iconsRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!onMinWidth) return;
    const read = () => {
      const row = rowRef.current, brand = brandRef.current, icons = iconsRef.current;
      if (!row || !brand || !icons) return;
      const cs = getComputedStyle(row);
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const gap = parseFloat(cs.columnGap) || 0;
      const px = Math.ceil(brand.getBoundingClientRect().width
                         + icons.getBoundingClientRect().width + pad + gap);
      if (px > 0) onMinWidth(px);
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    if (brandRef.current) ro.observe(brandRef.current);
    if (iconsRef.current) ro.observe(iconsRef.current);
    return () => ro.disconnect();
  }, [onMinWidth]);

  return (
    <>
    <Group
      ref={rowRef}
      justify="space-between"
      px="sm"
      h="100%"
      align="center"
      wrap="nowrap"
      style={{ minWidth: 0 }}
    >
      <Group gap="sm" align="center" wrap="nowrap" style={{ minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
        {/* The lockup doubles as "home": click -> the welcome screen.  (Back /
            forward is the browser's OWN -- the store mirrors navigation into
            history so Firefox's arrows navigate the app.) */}
        <Group ref={brandRef} gap={7} align="center" wrap="nowrap" style={{ cursor: "pointer" }}
          onClick={goHome} title="Home (welcome)">
          <img src={`${import.meta.env.BASE_URL}logo2-mark.png`} alt="" height={26} style={{ display: "block", width: "auto", marginBottom: 1 }} />
          <Text fw={700} size="md" data-logotype="" style={{ letterSpacing: 0.3, lineHeight: 1 }}>
            <span style={{ color: "light-dark(var(--mantine-color-accent-7), var(--mantine-color-accent-4))" }}>C</span>HOUPO<sup style={{ fontSize: "0.55em", fontWeight: 600, verticalAlign: "super", letterSpacing: 0 }}>®</sup>
          </Text>
        </Group>
        {caseChrome && (
          <>
            {/* The separator belongs to the slot it separates: without the
                case identity beside it, a lone "|" after the brand is a rule
                between the brand and nothing. */}
            <Text c="dimmed">|</Text>
            <CaseSwitcher />
          </>
        )}
        {currentEntry?.unsupportedReason && (
          <Tooltip label={currentEntry.unsupportedReason} multiline w={300} withArrow>
            <Badge size="xs" radius="sm" variant="light" color="yellow" styles={BADGE_11_INK("yellow")}>
              view only
            </Badge>
          </Tooltip>
        )}
        {hasEdits && (
          <Tooltip
            label="Case has unsaved edits.  Click the save icon to download the modified flowsheetDict; click the restore icon to discard."
            multiline w={300} withArrow
          >
            <Badge size="xs" radius="sm" variant="filled" color="orange" styles={BADGE_11}>
              ● edited
            </Badge>
          </Tooltip>
        )}
        {runUpdated.length > 0 && (
          <Tooltip withArrow multiline w={320}
            label={`Written into the open case by the last run: ${runUpdated.join(", ")}.  `
              + "The next run reads it and File > Download case (.zip) carries it; the files on disk are unchanged."}>
            <Badge size="xs" radius="sm" variant="light" color="teal" data-run-updated=""
              styles={{ root: { ...BADGE_11_INK("teal").root, textTransform: "none" } }}>
              updated by run
            </Badge>
          </Tooltip>
        )}
        {scratchCount > 0 && (
          <Tooltip
            label="What-if: values you changed on the selection card edit the OPEN COPY of the case only.  The next run uses them; they are never written to disk -- the file is still the source of truth.  Reset (↺) returns to the file."
            multiline w={320} withArrow
          >
            <Badge size="xs" radius="sm" variant="filled" color="yellow" styles={BADGE_11}
              leftSection={<IconFlask size={11} />}>
              what-if — {scratchCount} pending {scratchCount === 1 ? "edit" : "edits"}, not on disk
            </Badge>
          </Tooltip>
        )}
      </Group>

      <Group ref={iconsRef} gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
        {/* THE case's Run (DEV.md 4c C172): one control, one place, its label
            naming what it runs.  It belongs to a tab ABOUT a case, so a tool
            tab has none.  Inside the measured minimum: a control that
            disappears is not a control that works. */}
        {caseChrome && hasCaseOpen(tutorialName) && (
          <RunButton disabled={cannotRun}
            disabledReason={currentEntry?.unsupportedReason
              ?? (nothingToRun ? "This case declares neither a flowsheet nor a propsDict: nothing to run." : undefined)} />
        )}
        {scratchCount > 0 && (
          <Tooltip label="Reset tinkering — drop all unsaved Properties-box edits and return to the file" withArrow>
            <ActionIcon
              variant="subtle"
              size="sm"
              color="yellow"
              onClick={clearAllScratch}
              aria-label="Reset tinkering"
            >
              <IconRestore size={14} />
            </ActionIcon>
          </Tooltip>
        )}
        {hasEdits && (
          <>
            <Tooltip label="Discard edits (revert to disk)" withArrow>
              <ActionIcon
                variant="subtle"
                size="sm"
                color="gray"
                onClick={discardEdits}
                aria-label="Discard edits"
              >
                <IconRestore size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Save: download the modified flowsheetDict.  Copy it back into your case directory." withArrow>
              <ActionIcon
                variant="subtle"
                size="sm"
                color="accent"
                onClick={() => downloadFlowsheetDict(caseFiles, tutorialName)}
                aria-label="Save modified flowsheetDict"
              >
                <IconDeviceFloppy size={14} />
              </ActionIcon>
            </Tooltip>
          </>
        )}
        <UnitsMenu />
        <ColoursMenu />
        <ColorSchemeToggle />
        <Tooltip label="Ask your own claude.ai — copy the case+guide, paste the reply back (any OS, no install)" withArrow>
          <ActionIcon
            variant="subtle" size="sm" color="gray"
            onClick={() => setClipOpen(true)}
            aria-label="Clipboard bridge to claude.ai"
          >
            <IconClipboardCopy size={15} />
          </ActionIcon>
        </Tooltip>
        {localBridgeHost && hasCaseOpen(tutorialName) && (
          <Tooltip label="Assistant — talk to claude -c; it edits the dicts (reload to see)" withArrow>
            <ActionIcon
              variant={agentOpen ? "filled" : "subtle"}
              size="sm"
              color={agentOpen ? "accent" : "gray"}
              onClick={toggleAgent}
              aria-label="Toggle assistant console"
            >
              <IconRobot size={15} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Group>
    <ClipboardBridge opened={clipOpen} onClose={() => setClipOpen(false)} />
    </>
  );
}
