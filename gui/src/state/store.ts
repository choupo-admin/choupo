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
  Global UI store.  Holds the current case, the selected node id, the
  solver-output stream, and the most recent structured RunResult.
\*---------------------------------------------------------------------------*/

import { create } from "zustand";

import { tutorialByName } from "../cases/tutorials.js";
import { readCaseAt } from "../cases/workspace.js";
import type { CaseFiles } from "../case/types.js";
import type { ScratchEdit, ScratchEdits } from "../case/scratch.js";
import type { JsonDict } from "../dict/json.js";
import type { RunResult } from "../adapters/SolverAdapter.js";
import {
  DEFAULT_PREFS,
  setDisplaySigFigs,
  type DisplayPrefs,
} from "./displayUnits.js";

const PREFS_STORAGE_KEY = "choupo.displayPrefs.v1";

function loadStoredPrefs(): DisplayPrefs {
  try {
    const raw =
      typeof window !== "undefined"
        ? window.localStorage.getItem(PREFS_STORAGE_KEY)
      : null;
    const prefs = raw
      ? {...DEFAULT_PREFS,...(JSON.parse(raw) as Partial<DisplayPrefs>) }
      : DEFAULT_PREFS;
    // Keep the module-level formatter default in sync so every format call
    // site inherits the persisted significant-figure choice.
    setDisplaySigFigs(prefs.sigFigs);
    return prefs;
  } catch {
    setDisplaySigFigs(DEFAULT_PREFS.sigFigs);
    return DEFAULT_PREFS;
  }
}

function persistPrefs(p: DisplayPrefs): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(p));
    }
  } catch {
    // localStorage may throw in private mode --- silently ignore.
  }
}

// ---- Session restore -------------------------------------------------------
// On boot the GUI reopens exactly what was open when it was last closed: the
// case, the active workspace tab, the console, and the panel layout.  This is
// UI state ONLY -- the case CONTENT is always re-read from its source of truth
// (the bundled glob for a tutorial; the bridge/disk for a workspace case), so
// restore never resurrects stale dicts.  A pop-out / deep-link window (one with
// a ?case= URL param) neither restores nor persists -- it shows its own target
// and must not clobber the main window's session.
const SESSION_KEY = "choupo.session.v1";

interface PersistedSession {
  // a tutorial is restored by id; a local case by its absolute directory.
  caseRef:
    | { kind: "tutorial"; name: string }
    | { kind: "local"; dir: string }
    | null;
  activeWorkspace: WorkspaceKey | null;
  agentOpen: boolean;
  agentDocked: boolean;
  panels: { property: boolean; output: boolean };
}

// A focus pop-out tab (?focus=<key>) shows a synthesised 1-unit mini-flowsheet;
// like a ?case= deep-link it is TRANSIENT -- it neither restores nor persists
// the main window's session.
function isolatedTab(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search);
  return q.has("case") || q.has("focus") || q.has("internals");
}

/** Public face of the isolated-tab test (gui-credo §4 "Tab citizenship"): a
 *  ?case= / ?focus= / ?internals= pop-out is a satellite of its parent case --
 *  the tutorial gallery / Ctrl+O are gated away from it (opening another case
 *  there would hijack a tab whose URL claims to be something else). */
export function isIsolatedTab(): boolean {
  return isolatedTab();
}

function loadSession(): PersistedSession | null {
  if (typeof window === "undefined" || isolatedTab()) return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PersistedSession) : null;
  } catch { return null; }
}

function saveSession(s: PersistedSession): void {
  try {
    if (typeof window !== "undefined")
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch { /* private mode -- ignore */ }
}

// Map the store's `tutorialName` tag to a persisted case reference.  A
// clipboard-uploaded "external:" case has no disk home -> not restorable.
function caseRefOf(tutorialName: string): PersistedSession["caseRef"] {
  if (tutorialName.startsWith("local:"))
    return { kind: "local", dir: tutorialName.slice("local:".length) };
  if (tutorialName.startsWith("external:")) return null;
  return { kind: "tutorial", name: tutorialName };
}

export type RunStatus = "idle" | "running" | "done" | "error";

export type PanelKey = "property" | "output";

/** Top-menu workspaces (Fase B of the layout redesign).  At most one
 *  is active at a time; null means the canvas is the only view.
 *  See docs/ai/gui-credo.md (forthcoming) for the contract. */
export type WorkspaceKey =
  | "streams"
  | "variables"
  | "plots"
  | "log"
  | "props"
  | "explore"
  | "control"
  | "case"
  | "reports"
  | "pinch";

interface AppState {
  tutorialName: string;
  /** Non-null when this tab booted from an isolated-tab URL (?focus=) whose
   *  localStorage stash is gone: render the honest "expired" panel instead of
   *  silently degrading to the welcome screen. */
  bootExpired: "focus" | null;
  caseFiles: CaseFiles;
  /** Snapshot of caseFiles AT LOAD TIME.  Compared against `caseFiles`
   *  to determine `hasEdits`; restored by `discardEdits`. */
  pristineCaseFiles: CaseFiles;
  selectedNodeId: string | null;
  runStatus: RunStatus;
  runLog: string;
  runResult: RunResult | null;
  // Iteration audit: monotonic stamps of the last props (choupoProps) run vs the
  // last flowsheet (choupoSolve) run.  flowsheetRunAt >= propsRunAt => the
  // simulation reflects the consolidated props; propsRunAt > flowsheetRunAt =>
  // the props were re-consolidated since the last simulation (re-simulate).
  propsRunAt: number;
  flowsheetRunAt: number;
  markPropsRun: () => void;
  markFlowsheetRun: () => void;
  panels: { [K in PanelKey]: boolean };
  activeWorkspace: WorkspaceKey | null;

  // Assistant console (a real `claude -c` session via the local bridge).
  agentOpen: boolean;
  toggleAgent: () => void;
  /** Docked (pinned at the bottom, pushes content up so nothing hides behind
   *  it) vs floating (a movable overlay).  Default docked. */
  agentDocked: boolean;
  toggleAgentDock: () => void;
  agentHeight: number;
  setAgentHeight: (px: number) => void;

  displayPrefs: DisplayPrefs;
  setDisplayPrefs: (patch: Partial<DisplayPrefs>) => void;

  loadTutorial: (name: string, opts?: { intro?: boolean }) => void;
  loadExternalCase: (displayName: string, files: CaseFiles) => void;

  // --- Navigation history (browser-style back / forward + home) ------------
  // A stack of opened-case snapshots; navPos is the cursor.  Opening a case
  // pushes (truncating any forward entries); back/forward move the cursor and
  // re-apply the snapshot WITHOUT a refetch.  Home goes to the blank welcome.
  navStack: { name: string; files: CaseFiles }[];
  navPos: number;
  goBack: () => void;
  goForward: () => void;
  goHome: () => void;

  // A freshly-opened TUTORIAL shows an intro screen first (what the case is +
  // Open/Run), so a student is not dropped into a bare flowsheet.  Set on
  // loadTutorial; cleared by dismissIntro (the Open button) and by every other
  // navigation (back/forward/home, opening a user case).
  showIntro: boolean;
  dismissIntro: () => void;
  /** A case on the user's disk (a folder at `dir`), created + read via the
   *  bridge.  tutorialName is `local:<absDir>` so the Assistant console points
   *  the agent at the folder (?dir=...) and "Reload" re-fetches it. */
  loadLocalCase: (dir: string, files: CaseFiles) => void;
  /** Live-reload: swap the dicts in place (canvas/streams/props redraw) WITHOUT
   *  changing which case is open or resetting selection -- used when the bridge
   *  reports the open local case's files changed on disk (the agent edited it). */
  refreshLocalCaseFiles: (files: CaseFiles) => void;
  /** Replace caseFiles in place (NOT pristine) -- used by the clipboard bridge
   *  to apply the agent's edits; leaves the case marked "edited" for download. */
  applyCaseFiles: (files: CaseFiles) => void;
  selectNode: (id: string | null) => void;
  /** TimeScrubber <-> FlowCanvas link: the instant index the scrubber sits on,
   *  so dragging the slider ANIMATES the dynamic flowsheet (live flux on the
   *  synthesised feed/product/jacket edges).  null = no scrub active (the
   *  flowsheet shows its steady/nominal face). */
  scrubIdx: number | null;
  setScrubIdx: (idx: number | null) => void;
  togglePanel: (key: PanelKey) => void;
  /** Toggle a workspace: if it is already active, close it; if a
   *  different one is active, switch to this one. */
  toggleWorkspace: (key: WorkspaceKey) => void;
  setActiveWorkspace: (key: WorkspaceKey | null) => void;
  startRun: () => void;
  appendLog: (chunk: string) => void;
  finishRun: (result: RunResult) => void;
  failRun: () => void;
  resetRun: () => void;

  /** One-shot landing hint for the Plots workspace.  Set by the focus-tab
   *  playground after a sweep run so PlotsWorkspace opens on "Sweep / scan"
   *  instead of its usual profile/txy priority; consumed (cleared) by the
   *  workspace on first use.  Never set by parent-case surfaces. */
  plotsViewHint: "scanCsv" | null;
  setPlotsViewHint: (h: "scanCsv" | null) => void;

  // ----- Case editing ---------------------------------------
  /** Set a scalar (number or string) inside the named unit's `operation`
   *  block.  Mutates caseFiles.flowsheet in place (immutably, via a
   *  fresh clone of just the touched path). */
  setOperationScalar: (unitName: string,
    key: string,
    value: number | string,
  ) => void;
  /** True iff caseFiles differs from pristineCaseFiles. */
  hasEdits: () => boolean;
  /** Reset caseFiles back to pristineCaseFiles. */
  discardEdits: () => void;

  // ----- Transient tinkering (the scratch overlay) -----------
  /** In-memory edits of numeric scalars grabbed in the Properties box, keyed
   *  by dict path (e.g. "streams.feed.T").  TRANSIENT + LOUD: never written to
   *  disk; Run applies them; Reset clears them.  See case/scratch.ts. */
  scratchEdits: ScratchEdits;
  /** Set (or clear, if value===from) the tinkered value at `path`. */
  setScratch: (path: string, edit: ScratchEdit) => void;
  /** Drop one tinkered field (the per-field × reset). */
  clearScratch: (path: string) => void;
  /** Drop ALL tinkered fields (Reset all -> back to disk). */
  clearAllScratch: () => void;
}

// Boot case: a `?case=<name>` in the URL (set when a sector/unit is opened in
// a new window, fractal step 4c) wins; otherwise the last session's case (a
// tutorial is restored here, synchronously; a workspace case is restored
// asynchronously via restoreWorkspaceSession after mount); otherwise the
// default tutorial.  `inherited` carries the parent run's result sliced to
// this sub-case's scope (drill-in inheritance) -- seeded as a finished run.
function bootCase(): {
  name: string; files: CaseFiles; inherited?: RunResult;
  /** Set when an isolated pop-out tab's stash is gone (cleared storage,
   *  another browser): the tab must refuse honestly instead of silently
   *  degrading to the welcome screen (gui-credo §4 "Tab citizenship"). */
  expired?: "focus";
} {
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search);
    // Focus pop-out: a self-contained 1-unit mini-flowsheet stashed in
    // localStorage by the parent tab (popOutUnitFocus) under the STABLE key
    // `choupo.focus.<unit>` (latest pop-out wins).  Deliberately NOT
    // consumed -- the tab is a real tab and must survive F5.
    const focusStashKey = q.get("focus");
    if (focusStashKey) {
      // GC the legacy one-shot keys (`choupo.focus.<unit>.<timestampMs>`)
      // older builds wrote-and-forgot.
      try {
        const ls = window.localStorage;
        if (typeof ls.length === "number" && typeof ls.key === "function") {
          for (let i = ls.length - 1; i >= 0; i--) {
            const k = ls.key(i);
            if (k && /^choupo\.focus\..+\.\d+$/.test(k)) ls.removeItem(k);
          }
        }
      } catch { /* storage blocked -- GC is best-effort */ }
      try {
        const raw = window.localStorage.getItem(focusStashKey);
        if (raw) {
          const { displayName, files } = JSON.parse(raw) as { displayName: string; files: CaseFiles };
          return { name: displayName, files };
        }
      } catch { /* corrupt stash -> expired below */ }
      return { ...BLANK_CASE, expired: "focus" };
    }
    const param = q.get("case");
    if (param) {
      const t = tutorialByName(param);
      if (t) {
        // Drill-in result inheritance: the parent tab sliced its finished
        // RunResult to this sub-case's scope and stashed it under the
        // `inherit` key (FlowCanvas.openInNewWindow).  Read + consume it so
        // the drilled tab opens WITH the parent's converged numbers, seeded
        // exactly like a finished run; Run still overrides them normally.
        const inheritKey = q.get("inherit");
        if (inheritKey) {
          try {
            const raw = window.localStorage.getItem(inheritKey);
            if (raw) {
              window.localStorage.removeItem(inheritKey);
              return { ...t, inherited: JSON.parse(raw) as RunResult };
            }
          } catch { /* corrupt / blocked stash -- open unrun */ }
        }
        return t;
      }
    }
  }
  // No deep-link: start BLANK (decided 2026-06-03).  We deliberately do NOT
  // auto-reopen the last case -- that surprised the user (the GUI "jumped" into
  // a case on launch).  The last case is preserved in the session and offered
  // in File -> "Reopen last…" so reopening is a deliberate click.
  return BLANK_CASE;
}

// Boot workspace: the landing deep-links the Property Explorer via
// `?workspace=explore` (a frictionless "try it" CTA).  The explorer is
// standalone, so it opens with no case loaded.
function bootWorkspace(): WorkspaceKey | null {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const w = params.get("workspace");
    if (w === "explore") return "explore";
    // The landing hero deep-links the Control Room on a ctrl case
    // (?case=ctrl02_disturbance_rejection&view=control).
    const v = params.get("view");
    if (v === "control" || w === "control") return "control";
  }
  return null;
}

// The empty boot state: no case open.  `name === ""` is the blank sentinel the
// UI keys off (welcome canvas, disabled Run, "No case open" in the switcher).
// A minimal CaseFiles with no flowsheet/propsDict so every consumer that reads
// caseFiles.* stays undefined-safe.
export const BLANK_CASE: { name: string; files: CaseFiles } = {
  name: "",
  files: { controlDict: {}, thermoPackage: {}, rawFiles: {} },
};
export function hasCaseOpen(tutorialName: string): boolean {
  return tutorialName !== "";
}

const initial = bootCase();
const bootSession = loadSession();

// Set while goBack/goForward re-apply a snapshot, so the nav-history subscriber
// below does NOT re-push (which would defeat back/forward).
let navigating = false;

export const useStore = create<AppState>((set, get) => ({
  tutorialName: initial.name,
  bootExpired: initial.expired ?? null,
  caseFiles: initial.files,
  pristineCaseFiles: initial.files,
  scratchEdits: {},
  navStack: [{ name: initial.name, files: initial.files }],
  navPos: 0,
  showIntro: false,
  selectedNodeId: null,
  // A drilled-in tab may boot WITH the parent run's sliced result (see
  // bootCase): stored exactly as a finished run would be -- status "done",
  // the result, and its one-line "[inherit] ..." note as the log -- so the
  // canvas / streams / cards light up without a re-run.  Running the
  // sub-case overrides all of it via the normal startRun/finishRun path.
  runStatus: initial.inherited ? initial.inherited.status : "idle",
  runLog: initial.inherited?.log ?? "",
  runResult: initial.inherited ?? null,
  propsRunAt: 0,
  flowsheetRunAt: initial.inherited && initial.files.flowsheet ? 1 : 0,
  panels: bootSession?.panels ?? { property: true, output: true },
  // Workspace restore: the deep-link (?workspace=explore, the landing CTA) wins.
  // Otherwise restore the session's workspace -- EXCEPT a stale `explore` on a
  // BLANK boot, which would hijack the WelcomeScreen via the standalone-explorer
  // branch (the standalone explorer must come from the deep-link or a click, not
  // a restored session). Other restored workspaces are harmless on no case
  // (not rendered until a case opens).
  activeWorkspace:
    bootWorkspace()
    ?? (initial.name === "" && bootSession?.activeWorkspace === "explore"
          ? null
          // A result view (plots/reports/streams/variables/log/pinch) needs a
          // run -- opening a case must land on the FLOWSHEET, never a stale or
          // empty result view restored from the last session.  Only a run-free
          // workspace (props/explore/case) is restored; otherwise null = Flowsheet.
          : (["plots", "reports", "streams", "variables", "log", "pinch"] as WorkspaceKey[])
              .includes(bootSession?.activeWorkspace as WorkspaceKey)
              ? null
              : bootSession?.activeWorkspace ?? null),
  displayPrefs: loadStoredPrefs(),

  setDisplayPrefs: (patch) =>
    set((s) => {
      const next = {...s.displayPrefs,...patch };
      persistPrefs(next);
      setDisplaySigFigs(next.sigFigs);
      return { displayPrefs: next };
    }),

  // --- Navigation (browser-style) ------------------------------------------
  goBack: () =>
    set((s) => {
      if (s.navPos <= 0) return {};
      const t = s.navStack[s.navPos - 1]!;
      navigating = true;
      return {
        navPos: s.navPos - 1,
        tutorialName: t.name, caseFiles: t.files, pristineCaseFiles: t.files,
        showIntro: false,
        selectedNodeId: null, runStatus: "idle", runLog: "", runResult: null,
      scratchEdits: {},
      };
    }),
  goForward: () =>
    set((s) => {
      if (s.navPos >= s.navStack.length - 1) return {};
      const t = s.navStack[s.navPos + 1]!;
      navigating = true;
      return {
        navPos: s.navPos + 1,
        tutorialName: t.name, caseFiles: t.files, pristineCaseFiles: t.files,
        showIntro: false,
        selectedNodeId: null, runStatus: "idle", runLog: "", runResult: null,
      scratchEdits: {},
      };
    }),
  goHome: () =>
    set(() => ({
      tutorialName: BLANK_CASE.name, caseFiles: BLANK_CASE.files,
      pristineCaseFiles: BLANK_CASE.files,
      showIntro: false,
      selectedNodeId: null, runStatus: "idle", runLog: "", runResult: null,
      scratchEdits: {},
      activeWorkspace: null,
    })),
  dismissIntro: () => {
    set(() => ({ showIntro: false }));
    // Entering the flowsheet from the intro is its OWN browser-history step, so
    // the browser's Back returns to the intro (not all the way to the welcome).
    // Same navPos (same case) -- only the `intro` flag differs.
    if (typeof history !== "undefined" && !isolatedTab()) {
      try { history.pushState({ pos: get().navPos, intro: false }, ""); } catch { /* */ }
    }
  },

  loadTutorial: (name, opts) =>
    set(() => {
      const t = tutorialByName(name);
      if (!t) return {};
      return {
        tutorialName: t.name,
        caseFiles: t.files,
        pristineCaseFiles: t.files,
        // The glass-box intro is a NEWCOMER on-ramp only -- shown when a student
        // clicks a "New here? Start with one of these" card on the welcome
        // screen (opts.intro).  Opening a case any other way (Open Tutorial,
        // Reopen, reload, drill-in) goes straight to the case.
        showIntro: opts?.intro ?? false,
        selectedNodeId: null,
        runStatus: "idle",
        runLog: "",
        runResult: null,
        propsRunAt: 0,
        flowsheetRunAt: 0,
      };
    }),

  // External case: anything loaded from the user's local filesystem
  // via "File / Open Case... / Browse local folder...".  Display name
  // is prefixed with "external:" so the TopBar and the rest of the UI
  // can distinguish it from bundled tutorials.
  loadExternalCase: (displayName, files) =>
    set(() => ({
      tutorialName: `external:${displayName}`,
      caseFiles: files,
      pristineCaseFiles: files,
      scratchEdits: {},
      showIntro: false, // a user's own case -> straight in, no intro
      selectedNodeId: null,
      runStatus: "idle",
      runLog: "",
      runResult: null,
      propsRunAt: 0,
      flowsheetRunAt: 0,
    })),

  loadLocalCase: (dir, files) =>
    set(() => ({
      tutorialName: `local:${dir}`,
      caseFiles: files,
      pristineCaseFiles: files,
      scratchEdits: {},
      showIntro: false, // a user's own case -> straight in, no intro
      selectedNodeId: null,
      runStatus: "idle",
      runLog: "",
      runResult: null,
      propsRunAt: 0,
      flowsheetRunAt: 0,
    })),

  // Live-reload: the file on disk changed (the agent edited it), so any tinkered
  // overlay is stale -- drop it so the box can't show edits over a file that
  // moved underneath them.
  refreshLocalCaseFiles: (files) =>
    set(() => ({ caseFiles: files, pristineCaseFiles: files, scratchEdits: {} })),

  applyCaseFiles: (files) => set(() => ({ caseFiles: files })),

  setOperationScalar: (unitName, key, value) =>
    set((s) => {
      const fs = s.caseFiles.flowsheet as { units?: unknown } | undefined;
      if (!fs || !Array.isArray(fs.units)) return {};
      // Immutable update: clone JUST the touched unit + its operation.
      // The flowsheet is loosely typed as JsonDict; we narrow to the
      // shape the unit-op factory speaks and cast back on the way out.
      const oldUnits = fs.units as Array<{ [k: string]: unknown }>;
      const idx = oldUnits.findIndex(
        (u) => u && (u as { name?: unknown }).name === unitName,
      );
      if (idx < 0) return {};
      const oldUnit = oldUnits[idx]!;
      const oldOperation =
        (oldUnit.operation as { [k: string]: unknown } | undefined) ?? {};
      const newOperation = {...oldOperation, [key]: value };
      const newUnit = {...oldUnit, operation: newOperation };
      const newUnits = [...oldUnits];
      newUnits[idx] = newUnit;
      // Cast back through JsonDict at the boundary --- the field is
      // recursive JsonValue inside CaseFiles.
      const newFlowsheet = {
...(fs as Record<string, unknown>),
        units: newUnits,
      } as JsonDict;
      return {
        caseFiles: {...s.caseFiles, flowsheet: newFlowsheet },
      };
    }),

  hasEdits: () => {
    const s = get();
    // Cheap structural comparison: a JSON-stringify diff is enough for the
    // current edit surface (numbers / strings inside operation blocks).
    // Heavy edits would deserve a deeper diff, but the typical pattern is
    // 1-3 changed scalars.
    return JSON.stringify(s.caseFiles) !== JSON.stringify(s.pristineCaseFiles);
  },

  discardEdits: () =>
    set((s) => ({
      caseFiles: s.pristineCaseFiles,
    })),

  setScratch: (path, edit) =>
    set((s) => {
      // A value tinkered back to its on-disk original is no edit at all --
      // drop it so the badge count + amber state stay honest.
      if (edit.value === edit.from) {
        if (!(path in s.scratchEdits)) return {};
        const next = { ...s.scratchEdits };
        delete next[path];
        return { scratchEdits: next };
      }
      return { scratchEdits: { ...s.scratchEdits, [path]: edit } };
    }),
  clearScratch: (path) =>
    set((s) => {
      if (!(path in s.scratchEdits)) return {};
      const next = { ...s.scratchEdits };
      delete next[path];
      return { scratchEdits: next };
    }),
  clearAllScratch: () => set({ scratchEdits: {} }),

  selectNode: (id) => set({ selectedNodeId: id }),

  scrubIdx: null,
  setScrubIdx: (idx) => set({ scrubIdx: idx }),

  togglePanel: (key) =>
    set((s) => ({ panels: {...s.panels, [key]: !s.panels[key] } })),

  toggleWorkspace: (key) =>
    set((s) => ({
      activeWorkspace: s.activeWorkspace === key ? null : key,
      // Clear selection when entering a new workspace so the right-side
      // detail panel isn't pre-filled with a stale node from the previous
      // view.  Reopening the same workspace keeps selection.
      selectedNodeId: s.activeWorkspace === key ? s.selectedNodeId : null,
    })),

  setActiveWorkspace: (key) => set({ activeWorkspace: key }),

  agentOpen: bootSession?.agentOpen ?? false,
  toggleAgent: () => set((s) => ({ agentOpen: !s.agentOpen })),
  agentDocked: bootSession?.agentDocked ?? true,
  toggleAgentDock: () => set((s) => ({ agentDocked: !s.agentDocked })),
  agentHeight: 360,
  setAgentHeight: (px) => set({ agentHeight: Math.max(140, Math.min(px, window.innerHeight - 80)) }),

  startRun: () => set({ runStatus: "running", runLog: "", runResult: null, scrubIdx: null }),
  appendLog: (chunk) => set((s) => ({ runLog: s.runLog + chunk })),
  finishRun: (result) => set({ runStatus: result.status, runResult: result }),
  markPropsRun: () =>
    set((s) => ({ propsRunAt: Math.max(s.propsRunAt, s.flowsheetRunAt) + 1 })),
  markFlowsheetRun: () =>
    set((s) => ({ flowsheetRunAt: Math.max(s.propsRunAt, s.flowsheetRunAt) + 1 })),
  failRun: () => set({ runStatus: "error" }),
  resetRun: () => set({ runStatus: "idle", runLog: "", runResult: null }),

  plotsViewHint: null,
  setPlotsViewHint: (h) => set({ plotsViewHint: h }),
}));

// Persist the session (case + active workspace + console + panels) whenever it
// changes, so the next boot reopens exactly what was open.  Skipped entirely in
// a pop-out / deep-link window (?case=) so it never clobbers the main session.
if (typeof window !== "undefined" && !isolatedTab()) {
  let prevKey = "";
  useStore.subscribe((s) => {
    const blob: PersistedSession = {
      // Blank (no case open) preserves the previously-saved ref so "Reopen
      // last…" still works -- only a real case updates it.
      caseRef: hasCaseOpen(s.tutorialName)
        ? caseRefOf(s.tutorialName)
        : (loadSession()?.caseRef ?? null),
      activeWorkspace: s.activeWorkspace,
      agentOpen: s.agentOpen,
      agentDocked: s.agentDocked,
      panels: { property: s.panels.property, output: s.panels.output },
    };
    const key = JSON.stringify(blob);
    if (key !== prevKey) { prevKey = key; saveSession(blob); }
  });
}

// Nav-history recorder: push a snapshot whenever the OPEN CASE changes (not on
// run-status / live-reload churn).  A back/forward re-apply sets `navigating` so
// it is not re-pushed.  The follow-up setState here only touches navStack/navPos
// (tutorialName unchanged), so the guard below prevents an infinite loop.
{
  let navPrevName = initial.name;
  useStore.subscribe((s) => {
    if (s.tutorialName === navPrevName) return; // not a case change
    navPrevName = s.tutorialName;
    if (navigating) { navigating = false; return; } // back/forward -> don't push
    const stack = s.navStack.slice(0, s.navPos + 1);
    stack.push({ name: s.tutorialName, files: s.caseFiles });
    useStore.setState({ navStack: stack, navPos: stack.length - 1 });
    // Mirror into the browser history so Firefox's OWN back/forward arrows
    // (the muscle-memory ones, top-left) navigate the app.
    if (typeof history !== "undefined" && !isolatedTab()) {
      try { history.pushState({ pos: stack.length - 1, intro: s.showIntro }, ""); } catch { /* */ }
    }
  });
  // Native back/forward -> apply the snapshot at the history entry's position.
  if (typeof window !== "undefined" && typeof window.addEventListener === "function" && !isolatedTab()) {
    window.addEventListener("popstate", (e) => {
      const pos = e.state && typeof (e.state as { pos?: unknown }).pos === "number"
        ? (e.state as { pos: number }).pos : 0;
      const s = useStore.getState();
      const t = s.navStack[pos];
      if (!t) return; // history points outside this session's stack (after reload)
      navigating = true;
      useStore.setState({
        navPos: pos,
        tutorialName: t.name, caseFiles: t.files, pristineCaseFiles: t.files,
        // Restore the intro/flowsheet step recorded in this history entry, so
        // Back from the flowsheet returns to the tutorial's intro page.
        showIntro: (e.state as { intro?: boolean } | null)?.intro === true,
        selectedNodeId: null, runStatus: "idle", runLog: "", runResult: null,
      scratchEdits: {},
      });
    });
  }
}

// Async half of session restore: a local case must be re-fetched from the
// bridge by its absolute path (the build-time glob cannot see it).  Called once
// on app mount.  If the bridge is down or the case was deleted, we silently
// stay on the default -- restore is a convenience, never a hard failure.
// The display label of the last-opened case (for File -> "Reopen last…"), or
// null if there is none / it is not reopenable (an "external:" clipboard case
// has no disk home).  Just the leaf name -- short enough for a menu item.
export function lastCaseLabel(): string | null {
  const ref = loadSession()?.caseRef;
  if (!ref) return null;
  if (ref.kind === "tutorial") return ref.name.split("/").pop() || ref.name;
  return ref.dir.split("/").pop() || ref.dir;
}

// Reopen the last case saved in the session: a tutorial by id (synchronous), or
// a local case re-fetched from the bridge by its path (async).  No-op if there
// is none.  This is the DELIBERATE reopen behind the File menu, replacing the
// old auto-restore-on-boot (which surprised the user by jumping into a case).
export async function reopenLastCase(): Promise<void> {
  if (typeof window === "undefined" || isolatedTab()) return;
  const ref = loadSession()?.caseRef;
  if (!ref) return;
  if (ref.kind === "tutorial") {
    useStore.getState().loadTutorial(ref.name);
    return;
  }
  if (useStore.getState().tutorialName === `local:${ref.dir}`) return;
  try {
    const { caseFiles } = await readCaseAt(ref.dir);
    useStore.getState().loadLocalCase(ref.dir, caseFiles);
  } catch { /* bridge down / case gone -> stay blank, no nag */ }
}

// --- Hot reload: when any tutorial dict file under tutorials/ changes,
// Vite re-evaluates../cases/tutorials.js; this accept handler then
// re-loads whatever case is currently selected so the canvas, property
// panel, and operation schemas all reflect the new dict text.
if (import.meta.hot) {
  import.meta.hot.accept("../cases/tutorials.js", (next) => {
    if (!next) return;
    const cur = useStore.getState().tutorialName;
    const lookup = (next as unknown as {
      tutorialByName: typeof tutorialByName;
    }).tutorialByName;
    const fresh = lookup(cur);
    if (fresh) {
      useStore.setState({
        tutorialName: fresh.name,
        caseFiles: fresh.files,
        pristineCaseFiles: fresh.files,
        scratchEdits: {},
        selectedNodeId: null,
        runStatus: "idle",
        runLog: "",
        runResult: null,
      });
    }
  });
}
