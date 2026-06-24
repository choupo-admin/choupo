/*---------------------------------------------------------------------------*\
  exploreMccabePopOut — open the McCabe-Thiele analyzer full-window in its own
  browser tab (gui-credo §4 "Tab citizenship", design EXPLORER-ux-redesign §2b).

  Modelled VERBATIM on unitFocus.ts:196 (popOutUnitInternals): stash a payload
  under a STABLE, never-consumed key, window.open(pathname?explore=mccabe&key=…)
  with no window features (so Firefox does not popup-block), and AppShell boots a
  full interactive React view (ExploreMccabeTab) that survives F5 and refuses
  honestly when the stash is gone (ExpiredTabPanel kind="explore").

  Why NOT plotPopOut.ts: that ships a static PNG (it says so).  McCabe's whole
  point is the R/q sliders re-walking the staircase at 60 fps in pure TS — a PNG
  kills the instrument.  No WASM re-run ships: the equilibrium curve y*(x) is
  frozen physics (read out of the SAME T-x-y CSV the inline view holds); the
  popped tab walks the staircase in TS exactly like the inline one.  The knob
  state is carried so the tab re-hydrates where the student WAS (live state, not
  a dead snapshot), but it is transient — closing the tab IS the reset.
\*---------------------------------------------------------------------------*/

/** Everything the popped McCabe tab needs — the frozen physics + provenance.
 *  (Knob state lives in the McCabePlot component; the tab mounts it at its own
 *  defaults, so the pop-out carries the curve + the run's identity, the part a
 *  fresh mount cannot recompute without the engine.) */
export interface ExploreMccabeStash {
  /** The SAME T-x-y CSV the inline view holds — the engine's y_eq(x). */
  csv: string;
  compA: string;
  compB: string;
  /** Pressure [Pa] the curve was computed at — for the frozen-at-P caption. */
  P: number;
  /** The γ model the curve was computed with — for the frozen-at-model caption. */
  model: string;
}

/** Stable, never-consumed key per binary pair (latest pop-out wins; the tab is a
 *  real tab and must survive F5).  Mirrors unitFocus.ts focusKey/internalsKey. */
export function mccabeKey(compA: string, compB: string): string {
  return `choupo.explore.${compA}-${compB}.mccabe`;
}

/** Pop the McCabe analyzer out into a new tab, carrying the frozen curve +
 *  provenance.  Best-effort: a blocked popup / storage simply does nothing. */
export function popOutExploreMccabe(stash: ExploreMccabeStash): void {
  const key = mccabeKey(stash.compA, stash.compB);
  try {
    window.localStorage.setItem(key, JSON.stringify(stash));
    window.open(
      `${window.location.pathname}?explore=mccabe&key=${encodeURIComponent(key)}`,
      "_blank",
      "noopener",
    );
  } catch {
    /* localStorage / popup blocked — nothing to do */
  }
}

/** Read a stashed McCabe payload by key.  Null when gone / corrupt (the tab
 *  then refuses honestly via ExpiredTabPanel). */
export function readExploreMccabeStash(key: string): ExploreMccabeStash | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as ExploreMccabeStash;
    if (typeof v.csv !== "string" || typeof v.compA !== "string") return null;
    return v;
  } catch {
    return null;
  }
}
