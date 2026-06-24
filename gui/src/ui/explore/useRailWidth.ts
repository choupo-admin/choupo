/*---------------------------------------------------------------------------*\
  useRailWidth — the Property Explorer's resizable left-component-bar logic.

  A horizontal col-resize splitter modelled on the AgentConsole drag idiom
  (pointer-capture + clientX, AgentConsole.tsx:114-118), rotated to the
  horizontal axis.  The width is clamped to [MIN, MAX], persisted under ONE
  GLOBAL localStorage key (`choupo.explore.railWidth`, NOT case-keyed — the
  Explorer is a scratchpad over the same catalogue regardless of the open
  case), and rAF-throttled so a drag fires one layout pass per frame.

  Pure logic + a thin React hook: the clamp / parse / persist helpers are
  exported so they are unit-tested without a DOM (tests/railWidth.test.ts).
\*---------------------------------------------------------------------------*/

import { useCallback, useRef, useState } from "react";

export const RAIL_MIN = 200;     // below this, search + a checkbox row stop fitting
export const RAIL_MAX = 460;     // past this the plot starves with no catalogue benefit
export const RAIL_DEFAULT = 240; // current width, and the double-click reset target
export const RAIL_KEY = "choupo.explore.railWidth";
// Collapse is ORTHOGONAL to the dragged width (Claude.ai-style fold-to-edge):
// the panel renders at width 0 when collapsed but `width` keeps the last
// dragged value, so re-opening is lossless — the 380px browser comes back.
// Persisted under its own global key (the Explorer is a catalogue scratchpad,
// not case-keyed — mirrors RAIL_KEY's rationale).  Default = EXPANDED.
export const RAIL_COLLAPSED_KEY = "choupo.explore.railCollapsed";

/** Clamp a candidate width to the rail's [MIN, MAX] range. */
export function clampRailWidth(w: number): number {
  if (!Number.isFinite(w)) return RAIL_DEFAULT;
  return Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(w)));
}

/** Read the persisted width (clamped), or the default when absent / invalid. */
export function loadRailWidth(): number {
  if (typeof window === "undefined") return RAIL_DEFAULT;
  try {
    const raw = window.localStorage.getItem(RAIL_KEY);
    if (raw === null) return RAIL_DEFAULT;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? clampRailWidth(n) : RAIL_DEFAULT;
  } catch {
    return RAIL_DEFAULT;
  }
}

/** Persist a width (clamped) under the global key.  Best-effort. */
export function saveRailWidth(w: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RAIL_KEY, String(clampRailWidth(w)));
  } catch {
    /* storage blocked — width stays session-only */
  }
}

/** Read the persisted collapsed flag (default EXPANDED = false). */
export function loadRailCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RAIL_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the collapsed flag under the global key.  Best-effort. */
export function saveRailCollapsed(c: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RAIL_COLLAPSED_KEY, c ? "1" : "0");
  } catch {
    /* storage blocked — collapse stays session-only */
  }
}

export interface RailWidthHandle {
  /** Current rail width (px), clamped.  Kept even while collapsed (lossless). */
  width: number;
  /** Whether the rail is folded to width 0 (the dragged width is preserved). */
  collapsed: boolean;
  /** Fold / unfold the rail — bind to the chevron + the re-open tab + `[`. */
  toggleCollapsed: () => void;
  /** Start a drag — bind to the splitter's onPointerDown. */
  onPointerDown: (e: React.PointerEvent) => void;
  /** Snap back to the default — bind to the splitter's onDoubleClick. */
  reset: () => void;
}

/**
 * The drag-resize hook for the Explorer rail.  Reuses the AgentConsole
 * pointer-capture pattern: capture the pointer on the handle, track clientX,
 * setWidth(clamp(start + delta)) on move (rAF-throttled), persist on release.
 */
export function useRailWidth(): RailWidthHandle {
  const [width, setWidth] = useState<number>(loadRailWidth);
  const [collapsed, setCollapsed] = useState<boolean>(loadRailCollapsed);
  const rafRef = useRef<number | null>(null);
  const pending = useRef<number>(width);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => { const next = !c; saveRailCollapsed(next); return next; });
  }, []);

  const reset = useCallback(() => {
    pending.current = RAIL_DEFAULT;
    setWidth(RAIL_DEFAULT);
    saveRailWidth(RAIL_DEFAULT);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = pending.current;
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    // userSelect:none on the body during the drag so the text in the rail /
    // plot is not selected as the pointer sweeps across it.
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      const next = clampRailWidth(startW + (ev.clientX - startX));
      pending.current = next;
      // rAF-throttle: coalesce a burst of pointermove events into one paint.
      if (rafRef.current === null) {
        rafRef.current = window.requestAnimationFrame(() => {
          rafRef.current = null;
          setWidth(pending.current);
        });
      }
    };
    const onUp = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      try { el.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      document.body.style.userSelect = prevUserSelect;
      setWidth(pending.current);
      saveRailWidth(pending.current);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  }, []);

  return { width, collapsed, toggleCollapsed, onPointerDown, reset };
}
