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
  Top toolbar.  Sits below the classic MenuBar and provides the primary
  action surface: brand, case breadcrumb, adapter badge, and the
  Run/Stop button.  Run/Stop are owned here because they hold the
  AbortController for the in-flight solver; the MenuBar dispatches
  `choupo:run` / `choupo:stop` DOM events that we listen for to keep
  one source of truth.
\*---------------------------------------------------------------------------*/

import { compositeMembers } from "../case/toGraph.js";
import { readEdges } from "../case/toGraph.js";
import { zeroStateText } from "../case/toGraph.js";
import { ActionIcon, Badge, Group, Text, Tooltip } from "@mantine/core";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { resolveAdapter, type AdapterKind } from "../adapters/index.js";
import { withDisplayPrefs } from "../case/applyPrefs.js";
import { withFrozenBoundaryState } from "../case/resultSlice.js";
import { applyScratch } from "../case/scratch.js";
import { downloadFlowsheetDict } from "../case/saveCase.js";
import { caseHasUserCode, USER_CODE_MSG } from "../case/userCode.js";
import { TUTORIALS } from "../cases/tutorials.js";
import { useStore, hasCaseOpen } from "../state/store.js";
import { UnitsMenu } from "./UnitsMenu.js";
import { ColoursMenu } from "./ColoursMenu.js";
import { ColorSchemeToggle } from "./ColorSchemeToggle.js";
import { ClipboardBridge } from "./ClipboardBridge.js";
import { CaseSwitcher } from "./CaseSwitcher.js";

interface EngineVersion { version: string; target?: string; commit?: string }

export function TopBar() {
  // The version badge reads wasm/version.json -- written by the WASM build
  // BESIDE the binaries this app loads, so the announced version and the
  // engine that runs can never disagree (a user landing on /app/ must know
  // what they are about to run).
  const [engineVersion, setEngineVersion] = useState<EngineVersion | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}wasm/version.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v: EngineVersion | null) => {
        if (v && typeof v.version === "string" && v.version) setEngineVersion(v);
      })
      .catch(() => { /* absent (odd deployment): show no badge, never a guess */ });
  }, []);

  const status = useStore((s) => s.runStatus);
  const startRun = useStore((s) => s.startRun);
  const finishRun = useStore((s) => s.finishRun);
  const markFlowsheetRun = useStore((s) => s.markFlowsheetRun);
  const failRun = useStore((s) => s.failRun);
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
  const hasEdits = useMemo(
    () => JSON.stringify(caseFiles) !== JSON.stringify(pristineCaseFiles),
    [caseFiles, pristineCaseFiles],
  );
  // Transient tinkering: numbers grabbed in the Properties box, applied at Run,
  // never written to disk.  A loud amber badge announces them; Reset clears.
  const clearAllScratch = useStore((s) => s.clearAllScratch);
  const scratchCount = Object.keys(scratchEdits).length;

  const [activeKind, setActiveKind] = useState<AdapterKind | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const currentEntry = useMemo(
    () => TUTORIALS.find((t) => t.name === tutorialName) ?? null,
    [tutorialName],
  );
  // Nothing to run on a blank boot (no case) or a case with neither a
  // flowsheet nor a propsDict.
  const nothingToRun = !caseFiles.flowsheet && !caseFiles.propsDict;
  const runDisabled =
    status === "running" || nothingToRun || !!currentEntry?.unsupportedReason;

  const onRun = useCallback(async () => {
    if (runDisabled) return;
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
    setActiveKind(resolved.kind);

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
      const result = await resolved.adapter.run(filesForRun,
        appendLog,
        ctl.signal,
      );
      finishRun(result);
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
            + "Curate the per-sector properties; add the connections to assemble + simulate the plant.",
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
            message: "Properties computed — see the Props view.",
            color: "teal",
            icon: <IconCircleCheck size={16} />,
            autoClose: 4000,
          });
        } else {
          const iters = result.convergence.reduce(
            (m, c) => Math.max(m, c.residuals.length), 0);
          const advisories = result.advisories ?? [];
          const nAdv = advisories.length;
          // Model-boundary audit findings count as flags too: a REFUSED
          // boundary especially must never hide behind a teal "Run complete".
          const boundaries = result.modelBoundaries ?? [];
          const nMb = boundaries.length;
          const nRefused = boundaries.filter((b) => b.refused).length;
          const solved = iters > 0
            ? `Solved in ${iters} iteration${iters === 1 ? "" : "s"}`
            : "Solved";
          // Category hint from the ACTUAL advisories present (bound / rating /
          // init / thermo / electrolyte / ...), never a hardcoded pair.
          const cats = [...new Set(advisories.map((a) => a.category))].join(" / ");
          const flagged: string[] = [];
          if (nAdv > 0)
            flagged.push(`${nAdv} advisor${nAdv === 1 ? "y" : "ies"}${cats ? ` (${cats})` : ""}`);
          if (nMb > 0)
            flagged.push(`${nMb} model boundar${nMb === 1 ? "y" : "ies"}${nRefused > 0 ? ` (${nRefused} refused)` : ""}`);
          const attention = flagged.length > 0;
          notifications.show({
            title: attention
              ? `Run complete — check ${nAdv > 0 && nMb > 0
                  ? "advisories + model boundaries"
                : nAdv > 0 ? "advisories" : "model boundaries"}`
              : "Run complete",
            message: attention
              ? `${solved} with ${flagged.join(", ")} — see Streams (details in the Log)`
              : `${solved} — see Streams`,
            color: attention ? "yellow" : "teal",
            icon: attention ? <IconAlertTriangle size={16} /> : <IconCircleCheck size={16} />,
            autoClose: attention ? 7000 : 4000,
          });
        }
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

  return (
    <>
    <Group
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
        <Group gap={7} align="center" wrap="nowrap" style={{ cursor: "pointer" }}
          onClick={goHome} title="Home (welcome)">
          <img src={`${import.meta.env.BASE_URL}logo2-mark.png`} alt="" height={26} style={{ display: "block", width: "auto", marginBottom: 1 }} />
          <Text fw={700} size="md" style={{ letterSpacing: 0.3, lineHeight: 1 }}>
            <span style={{ color: "light-dark(var(--mantine-color-accent-7), var(--mantine-color-accent-4))" }}>C</span>HOUPO<sup style={{ fontSize: "0.55em", fontWeight: 600, verticalAlign: "super", letterSpacing: 0 }}>™</sup>
          </Text>
        </Group>
        {engineVersion && (
          <Tooltip withArrow multiline w={260}
            label={engineVersion.version === "Choupo-dev"
              ? `Development build toward ${engineVersion.target || "the next release"} — no stability promises.  Stable releases: choupo.org/releases`
              : "The engine version this app runs — releases, development line and citation at choupo.org/releases"}>
            <Badge size="sm" radius="sm" variant="light"
              color={engineVersion.version === "Choupo-dev" ? "orange" : "gray"}
              styles={{ root: { textTransform: "none", cursor: "help" } }}>
              {engineVersion.version === "Choupo-dev"
                ? `Choupo-dev${engineVersion.commit ? ` · ${engineVersion.commit}` : ""}`
                : engineVersion.version}
            </Badge>
          </Tooltip>
        )}
        <Text c="dimmed">|</Text>
        <CaseSwitcher />
        {currentEntry?.unsupportedReason && (
          <Tooltip label={currentEntry.unsupportedReason} multiline w={300} withArrow>
            <Badge size="xs" radius="sm" variant="light" color="yellow">
              view only
            </Badge>
          </Tooltip>
        )}
        {activeKind && (
          <Badge
            size="xs"
            radius="sm"
            variant="light"
            color={activeKind === "wasm" ? "accent" : "yellow"}
          >
            {activeKind === "wasm" ? "WASM" : "MOCK"}
          </Badge>
        )}
        {hasEdits && (
          <Tooltip
            label="Case has unsaved edits.  Click the save icon to download the modified flowsheetDict; click the restore icon to discard."
            multiline w={300} withArrow
          >
            <Badge size="xs" radius="sm" variant="filled" color="orange">
              ● edited
            </Badge>
          </Tooltip>
        )}
        {scratchCount > 0 && (
          <Tooltip
            label="Tinkering: numbers you changed in the Properties box.  They are applied when you Run, but NOT saved to disk — the file is still the source of truth.  Reset (↺) returns to the file."
            multiline w={320} withArrow
          >
            <Badge size="xs" radius="sm" variant="filled" color="yellow"
              leftSection={<IconFlask size={11} />}>
              tinkering — {scratchCount} unsaved {scratchCount === 1 ? "edit" : "edits"}
            </Badge>
          </Tooltip>
        )}
      </Group>

      <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
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
        {/* Run/Stop are no longer a global toolbar button -- each view owns its
            own run (the flowsheet canvas runs choupoSolve, the Props view runs
            choupoProps).  TopBar still ORCHESTRATES the flowsheet run, firing on
            the choupo:run / choupo:stop events those buttons dispatch. */}
      </Group>
    </Group>
    <ClipboardBridge opened={clipOpen} onClose={() => setClipOpen(false)} />
    </>
  );
}
