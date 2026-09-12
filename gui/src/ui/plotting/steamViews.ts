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
  steamViews -- which columns of an IF97 steam table the plot shows, and under
  what names.

  Kept free of React / Plotly imports (the csvShape.ts rationale) so the
  SELECTION is unit-testable: it had TWO homes and they disagreed.  The steam
  lens remembers one property pick across a mode switch, and the two modes
  offer DIFFERENT sets -- `psat` exists only on the saturation table, `cp` only
  on the isobar -- so the remembered pick can name a view the active mode does
  not have.  The toolbar resolved that with a fallback to `h`; the PLOT did
  not, and `shapeSteamCsv` then took its "unknown view" arm and handed the WHOLE
  raw table to the generic scan renderer.  On the isobar table that draws the
  `region` index as a curve and labels v / h / s / cp with the MOLAR units the
  generic unit map gives those bare tokens -- over IF97's mass-basis numbers --
  while the toolbar on screen still reads "h".  The resolution now happens
  INSIDE shapeSteamCsv, so no caller can pass a stale pick.
\*---------------------------------------------------------------------------*/

export interface SteamView {
  label: string;
  keep: string[];
  rename: Record<string, string>;
}

export type SteamMode = "saturation" | "isobar";

/** The default view, and the one a pick the active mode does not offer falls
 *  back to.  Both modes carry `h`. */
export const STEAM_DEFAULT_VIEW = "h";

// The steam CSVs are MASS-basis SI (J/kg, J/(kg·K), m³/kg) while the generic
// plot maps the bare tokens h/s/v/cp to MOLAR units -- so the kept columns are
// renamed to steam-specific names (hf, hg, …, hmass, …) the unit map labels
// correctly.  Pure column selection/renaming on the engine's CSV -- zero
// physics in TS.
export const STEAM_SAT_VIEWS: Record<string, SteamView> = {
  h:    { label: "h (h_f, h_g, h_fg)", keep: ["h_f", "h_g", "h_fg"],
          rename: { h_f: "hf", h_g: "hg", h_fg: "hfg" } },
  s:    { label: "s (s_f, s_g)", keep: ["s_f", "s_g"], rename: { s_f: "sf", s_g: "sg" } },
  v:    { label: "v (v_f, v_g)", keep: ["v_f", "v_g"], rename: { v_f: "vf", v_g: "vg" } },
  psat: { label: "psat", keep: ["psat"], rename: {} },
};

export const STEAM_ISO_VIEWS: Record<string, SteamView> = {
  h:  { label: "h", keep: ["h"], rename: { h: "hmass" } },
  s:  { label: "s", keep: ["s"], rename: { s: "smass" } },
  v:  { label: "v", keep: ["v"], rename: { v: "vmass" } },
  cp: { label: "cp", keep: ["cp"], rename: { cp: "cpmass" } },
};

/** The view table of a mode. */
export const steamViews = (mode: SteamMode): Record<string, SteamView> =>
  (mode === "saturation" ? STEAM_SAT_VIEWS : STEAM_ISO_VIEWS);

/** THE ONE HOME for "which property view is in force": the remembered pick
 *  when this MODE offers it, else the default.  The toolbar label and the
 *  plotted columns both read this, so they cannot disagree. */
export function steamViewKey(mode: SteamMode, prop: string): string {
  return steamViews(mode)[prop] ? prop : STEAM_DEFAULT_VIEW;
}

/** Keep T + the chosen property columns of a steam CSV (renamed per the view).
 *  The mixed-magnitude full table (psat ~1e7 Pa beside v_f ~1e-3 m³/kg) is
 *  unreadable on one axis -- one property family at a time reads best.
 *
 *  `prop` is resolved through `steamViewKey`, so a pick left over from the
 *  other mode selects that mode's default instead of falling through to the
 *  raw table. */
export function shapeSteamCsv(csv: string, mode: SteamMode, prop: string): string {
  const view = steamViews(mode)[steamViewKey(mode, prop)];
  if (!view) return csv;
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length === 0) return csv;
  const header = lines[0]!.split(",").map((s) => s.trim());
  const keep = header.map((h, i) => ({ h, i })).filter(({ h }) => h === "T" || view.keep.includes(h));
  if (keep.length < 2) return csv;   // stale CSV from another mode -- pass through
  return [
    keep.map(({ h }) => view.rename[h] ?? h).join(","),
    ...lines.slice(1).map((l) => {
      const cells = l.split(",");
      return keep.map(({ i }) => cells[i] ?? "").join(",");
    }),
  ].join("\n");
}
