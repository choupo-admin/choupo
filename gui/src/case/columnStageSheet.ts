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
  columnStageSheet -- THE TRAYS AT WORK: the stage-by-stage half of the column
  datasheet (DEV.md 4c C337, Vitor 2026-11-12: "a destilacao deve ter uma
  visualizacao detalhada se for pedido o design da coluna ... parecido ao que
  se fez para o permutador").

  THE TASK THE SCREEN ANSWERS.  "I asked for the design of this column.  Show
  me the column I would build and whether each tray (or bed) works: where it
  floods, where it weeps, what the efficiency and the pressure drop are -- and
  let me see which tray is the problem."  So the page leads with ONE figure:
  the column drawn on the left and, on the same vertical axis, one small plot
  per quantity, so a tray and its numbers sit on one line; the worst tray is
  marked on both; a click on any row selects that tray and the panel below
  follows it (its plan, its approach to each limit, its numbers).

  NOTHING HERE IS HYDRAULICS.  Every number drawn is one the engine PUBLISHED
  for the run -- the unit's KPIs and its stage profile (`profiles.<unit>`,
  written by `DistillationColumn.cpp` from `TrayHydraulics::Result` and the
  solved profile) -- or one the case DECLARED.  The only arithmetic is
  geometry of the declared tray (`trayGeometry.ts`) and unit conversion.  A
  quantity the window would need and the engine does not publish is LISTED
  as missing in the sheet, never computed here: the same rule the exchanger
  sheet follows (the GUI draws, it does not compute a second answer).

  THE SHEET IS A STANDALONE HTML PAGE (opened in a new tab and printed), so
  the selection and the sortable table run on a few lines of inline script.
  The sort ORDERS are computed here, in TypeScript, by `sortRows` from
  `ui/SortableTable.tsx` -- the one home of the sort rules (numeric columns
  numerically, missing values last both ways, stable) -- and the script only
  re-appends rows in the precomputed order.  No sort rule lives in the page.

  Licence: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

import type { UnitProfile } from "../adapters/SolverAdapter.js";
import type { UnitSpec } from "./types.js";
import type { DesignSheet } from "./designSheet.js";
import { sizingValue } from "./equipmentSchematic.js";
import { holePatch, pitchForOpenArea, trayPlan, openAreaOfPitch } from "./trayGeometry.js";
import { sortRows, type SortValue } from "../ui/SortableTable.js";
import { parseScalarString } from "../dict/json.js";
import { lookupUnit } from "../dict/units.js";
import {
  DEFAULT_PREFS, flowBasis, flowToDisplay, formatSig, kToDisplay, kWToDisplay,
  paToDisplay, temperatureLabel, type DisplayPrefs,
} from "../state/displayUnits.js";

type Kpis = { [k: string]: number };
export type SheetPrefs = Pick<DisplayPrefs, "temperature" | "duty">
  & Partial<Pick<DisplayPrefs, "pressure" | "flow" | "sigFigs">>;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;");

/*  ---- what the case declared, in SI --------------------------------------*/

/** A declared scalar in SI: a bare number as written, or "<number> <unit>"
 *  through the dict's own unit table.  An affine unit (a temperature) or a
 *  word is not a length/fraction and gives undefined. */
export function declaredSI(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  const p = parseScalarString(v);
  if (!p) return undefined;
  if (p.unit === undefined) return p.value;
  const u = lookupUnit(p.unit);
  return u && !u.affine ? p.value * u.factor : undefined;
}

const dictOf = (v: unknown): { [k: string]: unknown } =>
  v && typeof v === "object" && !Array.isArray(v) ? v as { [k: string]: unknown } : {};

/*  ---- the in-sample statements, quoted from the engine's own header -------
 *
 *  The engine PRINTS a sentence about each correlation's data to the run log
 *  (`DistillationColumn.cpp`, the total-reflux report) but publishes none in
 *  the result, so the sheet quotes the model header, by file and line.  The
 *  test `columnStageSheet.test.ts` reads those lines back from the source, so
 *  a header that moves or changes its words fails the GUI suite instead of
 *  leaving a stale quotation on the page.                                    */
export const IN_SAMPLE_STATEMENTS: {
  [model: string]: { cite: string; text: string };
} = {
  ChanFair: {
    cite: "src/unitOperations/distillation/TrayEfficiency.H:124-127",
    text: "IN-SAMPLE: Table I of the paper lists Yanagi & Sakata 1982 (14 %) "
      + "and Sakata & Yanagi 1979 (8 %) in the data bank the model was fitted "
      + "on; p. 818 says the 14 % pressure runs (165 and 1138 kPa) did not fit "
      + "and are shown apart (Fig. 3).",
  },
  SyedaChuang: {
    cite: "src/unitOperations/distillation/TrayEfficiency.H:136-139",
    text: "C'' = 0.16 is the paper's constant, FITTED (p. 273) to seven FRI "
      + "data sets that include Yanagi & Sakata 1982 and Sakata & Yanagi 1979: "
      + "every Yanagi comparison with this model is IN-SAMPLE.",
  },
};

/*  ---- the stage model ------------------------------------------------------*/

export interface StageRow {
  /** 1-based stage (trays) or point index (packed), as the profile numbers it. */
  stage: number;
  /** A tray the hydraulics pass enumerated (its `floodApproach` is published
   *  and positive).  Undefined when the run had no hydraulics, so the page
   *  makes no claim about which stage is a tray. */
  isTray?: boolean;
  z?: number;                 // m, packed only (0 = bed bottom)
  T?: number;                 // K
  P?: number;                 // Pa (packed)
  xLK?: number; yLK?: number;
  V?: number;                 // kmol/s
  L?: number;                 // kmol/s
  flowFromSection?: boolean;  // V/L are the CMO section KPIs, not per stage
  flood?: number;             // fraction of flood
  dP?: number;                // Pa per tray
  hb?: number;                // mm clear liquid, downcomer backup
  E?: number; EOG?: number; Pe?: number; Fa?: number;
  HETP?: number; dPperM?: number; F?: number;
}

export interface ColumnStageModel {
  kind: "trays" | "packed";
  rows: StageRow[];
  lk?: string; hk?: string;
  /** Where the key names came from: the case's `lightKey`, or the profile
   *  (the component richest at the top / at the bottom). */
  keysFrom: "declared" | "profile" | "none";
  feeds: { stage: number; name: string; who: "declared" | "engine" }[];
  draws: { stage: number; name: string; phase: string }[];
  worst?: number;              // the stage the KPI floodStage names
  hasHydraulics: boolean;
  efficiencyModel?: string;    // declared efficiency { model }
  declaredMurphree?: number;
  /** Missing quantities, each a sentence naming what and where it lives. */
  missing: string[];
}

const col = (p: UnitProfile | undefined, k: string): number[] | undefined =>
  p?.columns[k];

/** Read the run's profile and KPIs into one row per stage.  Returns null when
 *  the run published no stage or bed profile for this unit. */
export function columnStageModel(unit: UnitSpec, kpis: Kpis | undefined,
  profile: UnitProfile | undefined): ColumnStageModel | null {
  if (!profile) return null;
  const k = kpis ?? {};
  const op = dictOf(unit.operation);
  const eff = dictOf(op["efficiency"]);
  const pack = dictOf(op["packing"]);
  const missing: string[] = [];

  //  ---- the keys ---------------------------------------------------------
  const comps = Object.keys(profile.columns)
    .filter((c) => c.startsWith("x_") || c.startsWith("y_"))
    .map((c) => c.slice(2));
  const names = [...new Set(comps)];
  const declaredLK = typeof eff["lightKey"] === "string" ? eff["lightKey"] as string
    : typeof pack["lightKey"] === "string" ? pack["lightKey"] as string : undefined;

  if (profile.xAxis === "z") {
    const z = col(profile, "z") ?? [];
    const lk = declaredLK ?? names[0];
    const rows: StageRow[] = z.map((zz, i) => ({
      stage: i + 1, z: zz,
      T: col(profile, "T")?.[i], P: col(profile, "P")?.[i],
      yLK: lk ? col(profile, `y_${lk}`)?.[i] : undefined,
      HETP: col(profile, "HETP")?.[i],
      dPperM: col(profile, "dP_Pa_per_m")?.[i],
      F: col(profile, "F")?.[i],
    }));
    missing.push(
      "the local approach to flood along the bed (only its maximum, "
        + "`dP_over_dPflood_max`, is published) -- so no point of the bed can "
        + "be marked as the flooding one",
      "the local liquid hold-up, liquid load u_L and wetted area a_e/a_p along "
        + "the bed (only their means are published: `holdup_mean`, "
        + "`uL_mean_m3_m2h`, `aeOverAp_mean`)",
      "the liquid composition along the bed (only the vapour `y` of the light "
        + "key is published; at total reflux x = y on every section, but the "
        + "profile does not carry it)",
    );
    return {
      kind: "packed", rows, lk, keysFrom: declaredLK ? "declared" : (lk ? "profile" : "none"),
      feeds: [], draws: [], hasHydraulics: false, missing,
    };
  }

  //  ---- a staged column --------------------------------------------------
  const stage = col(profile, "stage") ?? [];
  const xs = (c: string) => col(profile, `x_${c}`);
  let lk = declaredLK, hk: string | undefined;
  let keysFrom: ColumnStageModel["keysFrom"] = declaredLK ? "declared" : "none";
  if (names.length >= 2) {
    const n = stage.length;
    const richest = (j: number) => names.reduce((a, b) =>
      (xs(b)?.[j] ?? -1) > (xs(a)?.[j] ?? -1) ? b : a);
    if (!lk) { lk = richest(0); keysFrom = "profile"; }
    hk = richest(n - 1);
    if (hk === lk) hk = names.find((c) => c !== lk);
  }
  if (keysFrom !== "declared")
    missing.push("which components the run took as the light and heavy keys "
      + "(the KPIs `x_D_LK` / `x_B_HK` carry values, not names) -- the sheet "
      + "plots the component richest at the top and the one richest at the "
      + "bottom, and says so");

  const fl = col(profile, "floodApproach");
  const hasHydraulics = fl !== undefined;
  const Vst = col(profile, "V_kmol_h");
  const feedStage = declaredSI(op["feedStage"]) ?? k["feedStage"];
  const rows: StageRow[] = stage.map((s, i) => {
    const r: StageRow = {
      stage: s,
      T: col(profile, "T")?.[i],
      xLK: lk ? xs(lk)?.[i] : undefined,
      yLK: lk ? col(profile, `y_${lk}`)?.[i] : undefined,
      E: col(profile, "E_MV")?.[i],
      EOG: col(profile, "E_OG")?.[i],
      Pe: col(profile, "Pe")?.[i],
      Fa: col(profile, "F_active")?.[i],
    };
    if (fl) {
      r.isTray = (fl[i] ?? 0) > 0;
      if (r.isTray) {
        r.flood = fl[i];
        r.dP = col(profile, "dP_Pa")?.[i];
        r.hb = col(profile, "h_backup_mm")?.[i];
      }
    }
    if (Vst) r.V = (Vst[i] ?? NaN) / 3600;
    else if (feedStage !== undefined && k["V_rect"] !== undefined
             && k["V_strip"] !== undefined) {
      //  The CMO section flows as the engine published them.  Which side of
      //  the feed a stage is on is `TrayHydraulics`' own rule (a stage above
      //  the feed is rectifying, `s.index < feedStage`); the feed stage and
      //  everything below it carry the stripping values.
      const rect = s < feedStage;
      r.V = rect ? k["V_rect"] : k["V_strip"];
      r.L = rect ? k["L_rect"] : k["L_strip"];
      r.flowFromSection = true;
    }
    return r;
  });
  if (hasHydraulics && Math.round(k["nTrays"] ?? -1) !== rows.filter((r) => r.isTray).length)
    missing.push("a consistent tray enumeration: the profile's non-zero "
      + "`floodApproach` rows do not match the `nTrays` KPI");

  if (Vst) missing.push("the liquid molar flow of each stage (only the vapour "
    + "`V_kmol_h` is in the profile)");
  else missing.push("the liquid and vapour molar flows of each stage (only the "
    + "section values `L_rect`, `V_rect`, `L_strip`, `V_strip` are published, "
    + "and those are what is drawn)");
  if (hasHydraulics) {
    missing.push(
      "per tray: the vapour velocity and the flood velocity "
        + "(`TrayHydraulics::Stage::uVapour`, `uFlood`), and the flow parameter "
        + "F_LV with its capacity C_SB -- the vapour-load axis, the liquid-load "
        + "axis and the flood line of the operating window",
      "per tray: the hole velocity and the weep-point hole velocity "
        + "(`Stage::u_h`, `u_hMin`) and the weep verdict (`Stage::weeps`) -- "
        + "only the COUNT `weepingStages` is published, so no tray can be "
        + "marked as the weeping one",
      "the downcomer-backup limit h_b,max = 0.5 (tray spacing + weir height) "
        + "(`Stage::h_bMax`) and the per-tray `downcomerFloods` verdict -- only "
        + "the count `downcomerFloodStages` is published, so the backup is "
        + "drawn without its limit line",
      "an entrainment limit: the hydraulics pass computes none (the Kister & "
        + "Haas entrainment-flood correlation is deliberately not implemented, "
        + "TrayHydraulics.H), and the fractional entrainment psi of the "
        + "efficiency models is published only as its mean `psi_mean`",
    );
  } else {
    missing.push("tray hydraulics: this run declared no `hydraulics {}` block, "
      + "so no tray was rated -- no flood, pressure drop or downcomer backup "
      + "exists to draw, and no stage can be called a tray rather than an "
      + "equilibrium stage");
  }

  //  ---- feeds and side draws, as the case DECLARED them -------------------
  const inputs = Array.isArray(unit.in) ? unit.in : (unit.in ? [unit.in] : []);
  const feeds: ColumnStageModel["feeds"] = [];
  const declFeeds = op["feeds"];
  if (Array.isArray(declFeeds)) {
    for (const f of declFeeds) {
      const d = dictOf(f);
      const st = declaredSI(d["stage"]);
      if (st !== undefined) feeds.push({ stage: Math.round(st),
        name: String(d["stream"] ?? "feed"), who: "declared" });
    }
  } else if (op["feedStage"] !== undefined) {
    const st = declaredSI(op["feedStage"]);
    if (st !== undefined) feeds.push({ stage: Math.round(st),
      name: inputs[0] ?? "feed", who: "declared" });
  } else if (k["feedStage"] !== undefined) {
    feeds.push({ stage: Math.round(k["feedStage"]), name: inputs[0] ?? "feed",
      who: "engine" });
  }
  const draws: ColumnStageModel["draws"] = [];
  const declDraws = op["sideDraws"];
  if (Array.isArray(declDraws)) {
    declDraws.forEach((dr, i) => {
      const d = dictOf(dr);
      const st = declaredSI(d["stage"]);
      if (st !== undefined) draws.push({ stage: Math.round(st),
        name: unit.outputs?.[2 + i] ?? `side draw ${i + 1}`,
        phase: String(d["phase"] ?? "liquid") });
    });
  }

  const worst = hasHydraulics && k["floodStage"] ? Math.round(k["floodStage"]) : undefined;
  const em = typeof eff["model"] === "string" ? eff["model"] as string : undefined;
  return {
    kind: "trays", rows, lk, hk, keysFrom, feeds, draws, worst, hasHydraulics,
    efficiencyModel: em,
    declaredMurphree: declaredSI(op["murphreeEfficiency"]),
    missing,
  };
}

/*  ---- formatting -----------------------------------------------------------*/

interface Fmt {
  sig: number;
  /** Display-unit VALUES for plotting -- never rounded to the sig figs. */
  tv: (K: number) => number;
  pv: (Pa: number) => number;
  fv: (kmolPerS: number) => number;
  n: (v: number | undefined) => string;
  T: (K: number | undefined) => string;
  tU: string;
  P: (Pa: number | undefined) => string;
  pU: string;
  F: (kmolPerS: number | undefined) => string;
  fU: string;
  Q: (kW: number | undefined) => string;
  qU: string;
  pct: (f: number | undefined) => string;
}

export function sheetFormat(prefs: SheetPrefs = DEFAULT_PREFS): Fmt {
  const sig = prefs.sigFigs ?? DEFAULT_PREFS.sigFigs;
  const n = (v: number | undefined) => v === undefined || !Number.isFinite(v)
    ? "—" : formatSig(v, sig);
  const pu = prefs.pressure ?? "bar";
  //  A mass flow unit needs a molar mass per stage, which the profile does
  //  not carry: the stage flows stay molar (kmol/h) and the label says so.
  const fu = prefs.flow && flowBasis(prefs.flow) === "molar" ? prefs.flow : "kmol/h";
  return {
    sig, n,
    tv: (K) => kToDisplay(K, prefs.temperature),
    pv: (Pa) => paToDisplay(Pa, pu),
    fv: (F) => flowToDisplay(F, fu),
    T: (K) => K === undefined ? "—" : n(kToDisplay(K, prefs.temperature)),
    tU: temperatureLabel(prefs.temperature),
    P: (Pa) => Pa === undefined ? "—" : n(paToDisplay(Pa, pu)),
    pU: pu,
    F: (f) => f === undefined ? "—" : n(flowToDisplay(f, fu)),
    fU: fu,
    Q: (kW) => kW === undefined ? "—" : n(kWToDisplay(kW, prefs.duty)),
    qU: prefs.duty,
    pct: (f) => f === undefined || !Number.isFinite(f) ? "—" : `${formatSig(f * 100, sig)} %`,
  };
}

/*  ---- the figure: column + small multiples on one stage axis --------------*/

interface Panel {
  key: string;
  title: string;
  unit: string;
  /** One or two series; each value is in DISPLAY units already. */
  series: { label: string; get: (r: StageRow) => number | undefined; dash?: boolean }[];
  min?: number; max?: number;
  bars?: boolean;
  /** Vertical reference lines, display units. */
  refs?: { at: number; label: string; strong?: boolean }[];
  note?: string;
}

function niceRange(vals: number[], min?: number, max?: number): [number, number] {
  const f = vals.filter((v) => Number.isFinite(v));
  let lo = min ?? (f.length ? Math.min(...f) : 0);
  let hi = max ?? (f.length ? Math.max(...f) : 1);
  if (!(hi > lo)) { const d = Math.abs(lo) * 0.05 || 1; lo -= d; hi += d; }
  if (min === undefined) lo -= (hi - lo) * 0.06;
  if (max === undefined) hi += (hi - lo) * 0.06;
  return [lo, hi];
}

export interface StageFigure {
  svg: string;
  toScale: boolean;
  /** Sentences for the caption, in the order they matter. */
  notes: string[];
}

export interface FigureInput {
  model: ColumnStageModel;
  unit: UnitSpec;
  kpis: Kpis;
  shell: DesignSheet | null;
  fmt: Fmt;
  selected: number;
}

/** The figure.  Classes, not colours: the page's stylesheet themes them for
 *  light, dark and print. */
export function stageFigureSvg(inp: FigureInput): StageFigure {
  const { model: m, kpis: k, fmt: f } = inp;
  const op = dictOf(inp.unit.operation);
  const hyd = dictOf(op["hydraulics"]);
  const pack = dictOf(op["packing"]);
  const notes: string[] = [];
  const p: string[] = [];
  const t = (x: number, y: number, s: string, cls = "cs-t", anchor = "start") =>
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="${cls}" text-anchor="${anchor}">${esc(s)}</text>`;

  const rows = m.rows;
  const N = rows.length;
  const packed = m.kind === "packed";

  //  ---- the vertical scale ------------------------------------------------
  let D: number | undefined, Dwho = "";
  let pitch: number, pxPerM = 0, toScale = false, top = 96;
  let stackH: number;
  const TS = packed ? undefined
    : (declaredSI(hyd["traySpacing"]) ?? sizingValue(inp.shell, "traySpacing")?.value);
  if (packed) {
    D = declaredSI(pack["diameter"]); Dwho = "declared";
    const Hb = declaredSI(pack["height"]) ?? (rows[N - 1]?.z ?? 0);
    pxPerM = Math.min(460 / Hb, 150 / (D ?? 1));
    stackH = Hb * pxPerM;
    pitch = stackH / Math.max(1, N - 1);
    toScale = D !== undefined && Hb > 0;
  } else {
    const sD = sizingValue(inp.shell, "D")?.value;
    if (sD) { D = sD; Dwho = "Choupo"; }
    else if (k["diameter"]) { D = k["diameter"]; Dwho = k["diameterDesigned"] ? "Choupo" : "declared"; }
    else if (declaredSI(hyd["diameter"])) { D = declaredSI(hyd["diameter"]); Dwho = "declared"; }
    pitch = Math.max(6, Math.min(30, 560 / Math.max(1, N)));
    stackH = N * pitch;
    if (D && TS) {
      pxPerM = pitch / TS;
      const w = D * pxPerM;
      toScale = w >= 16 && w <= 170;
    }
  }
  const Hshell = packed ? undefined : sizingValue(inp.shell, "H")?.value;
  const shellExtra = toScale && Hshell && pxPerM
    ? Math.max(0, (Hshell * pxPerM - stackH) / 2) : pitch * 0.6;
  top = 96 + shellExtra;
  const yBand = (i: number) => packed ? top + stackH - ((rows[i]?.z ?? 0) * pxPerM) - pitch / 2
    : top + i * pitch;                                // band top, i 0-based
  const yMid = (i: number) => packed ? top + stackH - (rows[i]?.z ?? 0) * pxPerM
    : top + (i + 0.5) * pitch;
  const H = top + stackH + shellExtra + 96;

  //  ---- the column --------------------------------------------------------
  const cx = 140;
  const wPx = toScale && D ? D * pxPerM : 70;
  const xL = cx - wPx / 2, xR = cx + wPx / 2;
  const sTop = top - shellExtra, sBot = top + stackH + shellExtra;
  p.push(`<rect x="${xL}" y="${sTop}" width="${wPx}" height="${sBot - sTop}" rx="${Math.min(14, wPx / 3)}" class="cs-shell"/>`);

  if (packed) {
    p.push(`<rect x="${xL + 3}" y="${top}" width="${wPx - 6}" height="${stackH}" class="cs-bed" fill="url(#cs-hatch)"/>`);
    const Hb = declaredSI(pack["height"]);
    p.push(t(xR + 10, top + stackH / 2 - 6, `bed ${Hb !== undefined ? f.n(Hb) + " m" : ""}`, "cs-t cs-decl"));
    p.push(t(xR + 10, top + stackH / 2 + 8, "(declared)", "cs-t cs-small"));
    const ap = declaredSI(pack["specificArea"]), eps = declaredSI(pack["voidFraction"]);
    p.push(t(xR + 10, top + stackH / 2 + 24, `${String(pack["model"] ?? "structured")} packing`, "cs-t cs-small cs-decl"));
    if (ap) p.push(t(xR + 10, top + stackH / 2 + 36, `aₚ ${f.n(ap)} m²/m³`, "cs-t cs-small cs-decl"));
    if (eps) p.push(t(xR + 10, top + stackH / 2 + 48, `ε ${f.n(eps)}`, "cs-t cs-small cs-decl"));
    //  z axis: bottom of the bed is z = 0, as the engine's march writes it.
    p.push(t(xL - 8, top + stackH + 4, "z = 0", "cs-t cs-small", "end"));
    p.push(t(xL - 8, top + 4, `z = ${f.n(rows[N - 1]?.z)} m`, "cs-t cs-small", "end"));
    notes.push("Distributors, collectors and the bed support are NOT drawn: the "
      + "case declares none and Choupo models none.");
  } else {
    const eachLabel = Math.max(1, Math.ceil(13 / pitch));
    rows.forEach((r, i) => {
      const yb = yBand(i), y = yb + pitch * 0.78;
      if (r.isTray === false) {
        //  The non-tray stage of the hydraulics enumeration: the sump the
        //  reboiler draws from.
        p.push(`<rect x="${xL + 2}" y="${yb + pitch * 0.35}" width="${wPx - 4}" height="${pitch * 0.65}" class="cs-liquid"/>`);
        p.push(t(xL - 8, yMid(i) + 3, `${r.stage} (not a tray)`, "cs-t cs-small", "end"));
        return;
      }
      p.push(`<line x1="${xL + 2}" y1="${y}" x2="${xR - 2}" y2="${y}" class="cs-tray"/>`);
      const left = i % 2 === 0;
      const wx = left ? xL + wPx * 0.18 : xR - wPx * 0.18;
      p.push(`<line x1="${wx}" y1="${y}" x2="${wx}" y2="${y - Math.min(5, pitch * 0.3)}" class="cs-weir"/>`);
      if (i < N - 1)
        p.push(`<line x1="${wx}" y1="${y}" x2="${wx}" y2="${y + pitch * 0.9}" class="cs-dc"/>`);
      if (i % eachLabel === 0 || r.stage === m.worst)
        p.push(t(xL - 8, yMid(i) + 3, String(r.stage), "cs-t cs-small", "end"));
    });
    if (TS && N > 1 && pitch >= 10) {
      const y1 = yBand(0) + pitch * 0.78, y2 = yBand(1) + pitch * 0.78, xd = xR + 14;
      p.push(`<line x1="${xd}" y1="${y1}" x2="${xd}" y2="${y2}" class="cs-dim" marker-start="url(#cs-arr)" marker-end="url(#cs-arr)"/>`);
      p.push(t(xd + 5, (y1 + y2) / 2 + 3, `TS ${f.n(TS)} m`, "cs-t cs-small cs-decl"));
    }
    //  Sections of different need: the engine builds the tower straight at
    //  the wider section (ColumnSize) and publishes both requirements; the
    //  narrower one is drawn DASHED, as what that section would have needed.
    const dR = k["diameter_rectifying"], dS = k["diameter_stripping"];
    const fs = m.feeds[0]?.stage;
    if (toScale && dR && dS && fs && Math.abs(dR - dS) / Math.max(dR, dS) > 0.01) {
      const rectSmall = dR < dS;
      const w = Math.min(dR, dS) * pxPerM;
      const iF = rows.findIndex((r) => r.stage === fs);
      if (iF > 0) {
        const yA = rectSmall ? yBand(0) : yBand(iF);
        const yB = rectSmall ? yBand(iF) : yBand(N - 1) + pitch;
        p.push(`<rect x="${cx - w / 2}" y="${yA}" width="${w}" height="${yB - yA}" class="cs-ghost"/>`);
        notes.push(`The ${rectSmall ? "rectifying" : "stripping"} section needs only `
          + `⌀ ${f.n(Math.min(dR, dS))} m (dashed) against ⌀ ${f.n(Math.max(dR, dS))} m `
          + `for the other (KPIs \`diameter_rectifying\`, \`diameter_stripping\`, `
          + `${f.n(Math.abs(dR - dS) / Math.max(dR, dS) * 100)} % apart); the tower `
          + `is built straight at the wider one and no swage is priced.`);
      }
    }
  }

  //  ---- condenser and reboiler symbols -----------------------------------
  const Qc = k["Q_condenser_kW"], Qr = k["Q_reboiler_kW"];
  if (Qc !== undefined && Qc !== 0) {
    const yc = sTop - 46;
    p.push(`<line x1="${cx}" y1="${sTop}" x2="${cx}" y2="${yc + 13}" class="cs-pipe"/>`);
    p.push(`<circle cx="${cx}" cy="${yc}" r="13" class="cs-hx"/>`);
    p.push(`<path d="M${cx - 9} ${yc + 4} l4 -8 l4 8 l4 -8 l4 8" class="cs-coil"/>`);
    p.push(t(cx + 20, yc - 2, "condenser", "cs-t"));
    p.push(t(cx + 20, yc + 11, `${f.Q(Qc)} ${f.qU}`, "cs-t cs-small"));
  }
  if (Qr !== undefined && Qr !== 0) {
    const yr = sBot + 46;
    p.push(`<line x1="${cx}" y1="${sBot}" x2="${cx}" y2="${yr - 13}" class="cs-pipe"/>`);
    p.push(`<circle cx="${cx}" cy="${yr}" r="13" class="cs-hx"/>`);
    p.push(`<path d="M${cx - 9} ${yr + 4} l4 -8 l4 8 l4 -8 l4 8" class="cs-coil"/>`);
    p.push(t(cx + 20, yr - 2, "reboiler", "cs-t"));
    p.push(t(cx + 20, yr + 11, `${f.Q(Qr)} ${f.qU}`, "cs-t cs-small"));
  }

  //  ---- the diameter ------------------------------------------------------
  if (D) {
    const yd = sBot + 14;
    p.push(`<line x1="${xL}" y1="${yd}" x2="${xR}" y2="${yd}" class="cs-dim" marker-start="url(#cs-arr)" marker-end="url(#cs-arr)"/>`);
    p.push(t(xL - 4, yd + 4, `⌀ ${f.n(D)} m`, `cs-t cs-small ${Dwho === "Choupo" ? "cs-sized" : "cs-decl"}`, "end"));
  }

  //  ---- feeds and side draws ---------------------------------------------
  const rowIndex = (s: number) => rows.findIndex((r) => r.stage === s);
  for (const fd of m.feeds) {
    const i = rowIndex(fd.stage);
    if (i < 0) continue;
    const y = yMid(i);
    p.push(`<line x1="${xL - 44}" y1="${y}" x2="${xL}" y2="${y}" class="cs-feed" marker-end="url(#cs-arrF)"/>`);
    p.push(t(xL - 46, y - 5, fd.name, "cs-t cs-small", "end"));
    p.push(t(xL - 46, y + 9, `stage ${fd.stage}`, `cs-t cs-small ${fd.who === "declared" ? "cs-decl" : ""}`, "end"));
  }
  for (const dr of m.draws) {
    const i = rowIndex(dr.stage);
    if (i < 0) continue;
    const y = yMid(i);
    p.push(`<line x1="${xR}" y1="${y}" x2="${xR + 40}" y2="${y}" class="cs-feed" marker-end="url(#cs-arrF)"/>`);
    p.push(t(xR + 44, y + 3, `${dr.name} (${dr.phase}) · stage ${dr.stage}`, "cs-t cs-small cs-decl"));
  }

  //  ---- the panels --------------------------------------------------------
  const panels: Panel[] = [];
  if (packed) {
    panels.push({ key: "T", title: "Temperature", unit: f.tU,
      series: [{ label: "T", get: (r) => r.T === undefined ? undefined : f.tv(r.T) }] });
    if (m.lk) panels.push({ key: "y", title: `y ${m.lk}`, unit: "mol frac", min: 0, max: 1,
      series: [{ label: "y", get: (r) => r.yLK }] });
    panels.push({ key: "HETP", title: "HETP (local)", unit: "m", min: 0,
      series: [{ label: "HETP", get: (r) => r.HETP }],
      refs: k["HETP"] !== undefined ? [{ at: k["HETP"], label: `bed ${f.n(k["HETP"])}` }] : [] });
    panels.push({ key: "dP", title: "Pressure gradient", unit: `${f.pU}/m`,
      series: [{ label: "dP", get: (r) => r.dPperM === undefined ? undefined
        : f.pv(r.dPperM) }] });
    panels.push({ key: "F", title: "F-factor", unit: "Pa^0.5", min: 0,
      series: [{ label: "F", get: (r) => r.F }] });
  } else {
    panels.push({ key: "T", title: "Temperature", unit: f.tU,
      series: [{ label: "T", get: (r) => r.T === undefined ? undefined : f.tv(r.T) }] });
    if (m.lk) panels.push({ key: "xy", title: `${m.lk}`, unit: "mol frac", min: 0, max: 1,
      series: [{ label: "x", get: (r) => r.xLK }, { label: "y", get: (r) => r.yLK, dash: true }],
      note: "x solid, y dashed" });
    const anyFlow = rows.some((r) => r.V !== undefined);
    if (anyFlow) panels.push({ key: "LV", title: "Traffic", unit: f.fU, min: 0,
      series: [{ label: "V", get: (r) => r.V === undefined ? undefined : f.fv(r.V) },
               ...(rows.some((r) => r.L !== undefined)
                 ? [{ label: "L", get: (r: StageRow) => r.L === undefined ? undefined : f.fv(r.L), dash: true }] : [])],
      note: rows.some((r) => r.flowFromSection) ? "section KPIs" : "V only" });
    if (m.hasHydraulics) {
      const ff = declaredSI(hyd["floodFraction"]);
      panels.push({ key: "flood", title: "Approach to flood", unit: "%", min: 0,
        max: Math.max(105, ...rows.map((r) => (r.flood ?? 0) * 100 * 1.05)), bars: true,
        series: [{ label: "flood", get: (r) => r.flood === undefined ? undefined : r.flood * 100 }],
        refs: [{ at: 100, label: "flood", strong: true },
               ...(ff !== undefined ? [{ at: ff * 100, label: `target ${f.n(ff * 100)}` }] : [])] });
      panels.push({ key: "dPtray", title: "Tray ΔP", unit: f.pU, min: 0, bars: true,
        series: [{ label: "dP", get: (r) => r.dP === undefined ? undefined : f.pv(r.dP) }] });
      panels.push({ key: "hb", title: "Downcomer backup", unit: "mm liq.", min: 0, bars: true,
        series: [{ label: "hb", get: (r) => r.hb }], note: "limit not published" });
    }
    if (rows.some((r) => r.E !== undefined))
      panels.push({ key: "E", title: "Murphree E_MV", unit: "-", min: 0,
        max: Math.max(1, ...rows.map((r) => r.E ?? 0)),
        series: [{ label: "E_MV", get: (r) => r.isTray === false || r.stage === rows[N - 1]?.stage && (r.E === 1) ? undefined : r.E }],
        note: m.efficiencyModel ? "computed" : "declared" });
  }

  const PW = 112, GAP = 16, X0 = 330;
  const yTop = top, yBot = packed ? top + stackH : top + stackH;
  panels.forEach((pn, j) => {
    const x0 = X0 + j * (PW + GAP);
    const vals = rows.flatMap((r) => pn.series.map((s) => s.get(r) ?? NaN));
    const refVals = (pn.refs ?? []).map((r) => r.at);
    const [lo, hi] = niceRange([...vals, ...refVals], pn.min, pn.max);
    const X = (v: number) => x0 + ((v - lo) / (hi - lo)) * PW;
    p.push(`<rect x="${x0}" y="${yTop}" width="${PW}" height="${yBot - yTop}" class="cs-frame"/>`);
    p.push(t(x0, yTop - 22, pn.title, "cs-t cs-ph"));
    p.push(t(x0, yTop - 9, pn.note ? `${pn.unit} · ${pn.note}` : pn.unit, "cs-t cs-small"));
    p.push(t(x0, yBot + 13, f.n(lo), "cs-t cs-small"));
    p.push(t(x0 + PW, yBot + 13, f.n(hi), "cs-t cs-small", "end"));
    (pn.refs ?? []).forEach((rf, ir) => {
      if (rf.at < lo || rf.at > hi) return;
      p.push(`<line x1="${X(rf.at)}" y1="${yTop}" x2="${X(rf.at)}" y2="${yBot}" class="${rf.strong ? "cs-limit" : "cs-ref"}"/>`);
      p.push(t(X(rf.at), yBot + 26 + 11 * ir, rf.label, rf.strong ? "cs-t cs-small cs-bad" : "cs-t cs-small", "middle"));
    });
    for (const s of pn.series) {
      const pts: string[] = [];
      rows.forEach((r, i) => {
        const v = s.get(r);
        if (v === undefined || !Number.isFinite(v)) return;
        const y = yMid(i);
        if (pn.bars) {
          const cls = pn.key === "flood" && v >= 100 ? "cs-bar cs-barbad"
            : r.stage === m.worst ? "cs-bar cs-barworst" : "cs-bar";
          p.push(`<rect x="${X(Math.max(lo, 0))}" y="${y - Math.min(pitch * 0.35, 6)}" width="${Math.max(0.5, X(v) - X(Math.max(lo, 0)))}" height="${Math.min(pitch * 0.7, 12)}" class="${cls}"/>`);
        } else {
          pts.push(`${X(v).toFixed(1)},${y.toFixed(1)}`);
        }
      });
      if (!pn.bars && pts.length > 0) {
        p.push(`<polyline points="${pts.join(" ")}" class="cs-line${s.dash ? " cs-dash" : ""}"/>`);
        if (!packed && pitch >= 8)
          for (const q of pts) { const [a, b] = q.split(","); p.push(`<circle cx="${a}" cy="${b}" r="1.8" class="cs-dot"/>`); }
      }
    }
  });
  const W = X0 + panels.length * (PW + GAP) + 10;

  //  ---- the worst tray, across the whole figure ---------------------------
  if (m.worst !== undefined) {
    const i = rowIndex(m.worst);
    if (i >= 0) {
      p.unshift(`<rect x="${xL - 4}" y="${yBand(i)}" width="${W - xL}" height="${pitch}" class="cs-worst"/>`);
      const fa = rows[i]?.flood;
      p.push(t(xR + 6, yMid(i) - 2, `◀ worst: tray ${m.worst}`, "cs-t cs-bad"));
      p.push(t(xR + 6, yMid(i) + 10, `${f.pct(fa)} of flood`, "cs-t cs-small cs-bad"));
    }
  }

  //  ---- selection band and click targets ----------------------------------
  const iSel = Math.max(0, rowIndex(inp.selected));
  p.push(`<rect id="cs-sel" x="${xL - 4}" y="${yBand(iSel)}" width="${W - xL}" height="${pitch}" class="cs-selbox"/>`);
  rows.forEach((r, i) => p.push(`<rect class="cs-hit" data-stage="${r.stage}" x="0" y="${yBand(i)}" width="${W}" height="${pitch}"><title>${packed ? `z = ${f.n(r.z)} m` : `stage ${r.stage}`} — click to inspect</title></rect>`));

  const defs = `<defs>`
    + `<marker id="cs-arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="cs-arrhead"/></marker>`
    + `<marker id="cs-arrF" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" class="cs-feedhead"/></marker>`
    + `<pattern id="cs-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(${packed ? declaredSI(pack["corrugationAngle"]) ?? 45 : 45})"><line x1="0" y1="0" x2="0" y2="8" class="cs-hatchline"/></pattern>`
    + `</defs>`;

  notes.unshift(toScale
    ? (packed ? `The bed is drawn TO SCALE: its declared height and diameter in one scale.`
      : `The tray stack is drawn TO SCALE: the tray spacing and the diameter in one scale${Hshell ? `, and the shell at the sheet's height H = ${f.n(Hshell)} m centred on the stack (how the leftover height splits between top space and sump is not published)` : ""}.`)
    : (packed ? `The bed is NOT to scale: its height or diameter is not declared.`
      : `The trays are NOT drawn to scale: ${!D ? "no diameter was published or declared" : !TS ? "no tray spacing was declared or sized" : "at this ratio a true-scale drawing is unreadable"}; one row per stage.`));
  if (!packed) notes.push("Weirs and downcomers are schematic and alternate "
    + "sides (single-pass crossflow); they carry no dimension.");

  const svg = `<svg viewBox="0 0 ${W} ${H.toFixed(0)}" width="100%" style="max-width:${W}px" class="cs-fig" role="img" aria-label="column elevation and per-stage profiles">${defs}${p.join("")}</svg>`;
  return { svg, toScale, notes };
}

/*  ---- the tray plan view ---------------------------------------------------*/

export interface PlanView { svg: string; notes: string[] }

export function trayPlanSvg(unit: UnitSpec, kpis: Kpis, shell: DesignSheet | null,
  fmt: Fmt): PlanView | null {
  const op = dictOf(unit.operation);
  const hyd = dictOf(op["hydraulics"]);
  const eff = dictOf(op["efficiency"]);
  const D = sizingValue(shell, "D")?.value ?? kpis["diameter"] ?? declaredSI(hyd["diameter"]);
  const fd = declaredSI(hyd["downcomerAreaFraction"]) ?? 0.12;
  const fdDeclared = hyd["downcomerAreaFraction"] !== undefined;
  const lwf = declaredSI(hyd["weirLengthFraction"]);
  const phi = declaredSI(hyd["holeAreaFraction"]);
  const dh = declaredSI(hyd["holeDiameter"]);
  const pitchDecl = declaredSI(eff["holePitch"]);
  if (!D || Object.keys(hyd).length === 0) return null;
  const plan = trayPlan(D, fd, lwf, phi);
  const notes: string[] = [];
  const S = 240, R = 100, cx = 125, cy = 118;
  const s = R / (D / 2);
  const c = plan.chordOffset * s, hc = plan.chordLength / 2 * s;
  const p: string[] = [];
  const t = (x: number, y: number, str: string, cls = "cs-t cs-small", a = "start") =>
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="${cls}" text-anchor="${a}">${esc(str)}</text>`;
  p.push(`<circle cx="${cx}" cy="${cy}" r="${R}" class="cs-planbg"/>`);
  //  The two downcomer segments (left = inlet, right = outlet), the active
  //  area between their chords.
  const seg = (sgn: number) => `M${cx + sgn * c} ${cy - hc} A${R} ${R} 0 0 ${sgn > 0 ? 1 : 0} ${cx + sgn * c} ${cy + hc} Z`;
  p.push(`<path d="${seg(-1)}" class="cs-dcseg"/>`, `<path d="${seg(1)}" class="cs-dcseg"/>`);
  p.push(`<rect x="${cx - c}" y="${cy - Math.sqrt(R * R - c * c)}" width="${2 * c}" height="${2 * Math.sqrt(R * R - c * c)}" class="cs-active" clip-path="url(#cs-clip)"/>`);
  p.push(`<line x1="${cx + c}" y1="${cy - hc}" x2="${cx + c}" y2="${cy + hc}" class="cs-weirline"/>`);
  p.push(t(4, cy + R + 16, "◀ inlet downcomer", "cs-t cs-small"));
  p.push(t(S + 6, cy + R + 16, "outlet downcomer, weir ▶", "cs-t cs-small", "end"));
  p.push(t(cx, cy - R - 8, `⌀ ${fmt.n(D)} m`, "cs-t cs-small", "middle"));
  p.push(`<line x1="${cx - c + 6}" y1="${cy + R * 0.72}" x2="${cx + c - 6}" y2="${cy + R * 0.72}" class="cs-dim" marker-end="url(#cs-arrP)"/>`);
  p.push(t(cx, cy + R * 0.72 - 4, "liquid flow", "cs-t cs-small", "middle"));
  //  The hole patch: a window in the active area, drawn at the true pitch and
  //  hole size, magnified.
  let patchNote = "";
  if (dh && (pitchDecl || phi)) {
    const pitch = pitchDecl ?? pitchForOpenArea(dh, phi as number);
    const hp = holePatch(dh, pitch, 8);
    const box = 64, k = box / Math.max(hp.width, hp.height);
    const bx = cx - box / 2, by = cy - box / 2 - 16;
    p.push(`<rect x="${bx}" y="${by}" width="${hp.width * k}" height="${hp.height * k}" class="cs-patch"/>`);
    for (const [hx, hy] of hp.holes)
      p.push(`<circle cx="${(bx + hx * k).toFixed(2)}" cy="${(by + hy * k).toFixed(2)}" r="${(dh / 2 * k).toFixed(2)}" class="cs-hole"/>`);
    p.push(t(cx, by + hp.height * k + 11, "hole patch, magnified", "cs-t cs-small", "middle"));
    const arr = openAreaOfPitch(dh, pitch);
    patchNote = `The hole patch is a DRAWING AID, NOT A DESIGN: ${hp.holes.length} holes of `
      + `d = ${fmt.n(dh * 1000)} mm on an equilateral-triangular pitch of `
      + `${fmt.n(pitch * 1000)} mm (${pitchDecl ? "declared `holePitch`" : "the pitch at which a triangular array has the declared open area"}), magnified; `
      + `the open area counted on the patch is ${fmt.n(hp.countedOpenArea * 100)} % of the perforated deck`
      + (phi !== undefined ? `, against the declared A_h/A_a = ${fmt.n(phi * 100)} % of the active area` : "")
      + (pitchDecl && phi !== undefined && Math.abs(arr - phi) / phi > 0.02
        ? `.  The two differ by ${fmt.n((arr / phi - 1) * 100)} %: at the declared pitch the perforated deck is `
          + `${fmt.n(phi / arr * 100)} % of the active area, the rest unperforated (calming zones and margins Choupo does not model or publish)` : "")
      + ".  Choupo publishes no hole count and no deck layout.";
  }
  const defs = `<defs><clipPath id="cs-clip"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>`
    + `<marker id="cs-arrP" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" class="cs-arrhead"/></marker></defs>`;
  notes.push(`Single-pass crossflow tray. Each downcomer is ${fmt.n(fd * 100)} % of the tower area `
    + `(${fdDeclared ? "declared" : "the engine's announced default 0.12"}), A_d = ${fmt.n(plan.A_d)} m²; `
    + `the active area A_a = A_T − 2 A_d = ${fmt.n(plan.A_a)} m² of A_T = ${fmt.n(plan.A_T)} m², as `
    + `TrayHydraulics.cpp:321 takes it`
    + (plan.A_h !== undefined ? `; holes A_h = ${fmt.n(plan.A_h)} m²` : "") + ".");
  notes.push(`The chord drawn is the one A_d implies: l = ${fmt.n(plan.chordFraction)} D = ${fmt.n(plan.chordLength)} m.`
    + (plan.weirFraction !== undefined
      ? `  The case declares a weir of ${fmt.n(plan.weirFraction)} D = ${fmt.n(plan.weirLength)} m`
        + (Math.abs(plan.weirFraction - plan.chordFraction) / plan.chordFraction > 0.01
          ? `, ${fmt.n((plan.weirFraction / plan.chordFraction - 1) * 100)} % from the chord: the engine reads the `
            + `weir length for the crest over the weir and A_d for the areas, and does not require them to agree.`
          : `, the same chord to within 1 %.`)
      : ""));
  if (patchNote) notes.push(patchNote);
  const svg = `<svg viewBox="0 0 ${S + 10} ${S + 10}" width="100%" style="max-width:300px" class="cs-fig" role="img" aria-label="tray plan view">${defs}${p.join("")}</svg>`;
  return { svg, notes };
}

/*  ---- the selected-tray panels --------------------------------------------*/

function bar(label: string, frac: number | undefined, valueText: string,
  limitText: string, bad = false): string {
  const w = frac === undefined || !Number.isFinite(frac) ? 0 : Math.max(0, Math.min(1.25, frac));
  return `<div class="cs-meter"><div class="cs-ml">${esc(label)}</div>`
    + `<div class="cs-mtrack"><div class="cs-mfill${bad ? " bad" : ""}" style="width:${(w / 1.25 * 100).toFixed(1)}%"></div>`
    + `<div class="cs-mlim" style="left:${(1 / 1.25 * 100).toFixed(1)}%"></div></div>`
    + `<div class="cs-mv">${valueText}</div><div class="cs-mlimtxt">${limitText}</div></div>`;
}

function stagePanels(m: ColumnStageModel, k: Kpis, unit: UnitSpec, f: Fmt,
  selected: number): string {
  const op = dictOf(unit.operation);
  const hyd = dictOf(op["hydraulics"]);
  const ff = declaredSI(hyd["floodFraction"]);
  return m.rows.map((r) => {
    const tags: string[] = [];
    if (r.stage === m.worst) tags.push(`<span class="cs-tag bad">worst tray</span>`);
    for (const fd of m.feeds) if (fd.stage === r.stage) tags.push(`<span class="cs-tag">feed ${esc(fd.name)}</span>`);
    for (const d of m.draws) if (d.stage === r.stage) tags.push(`<span class="cs-tag">${esc(d.name)} draw</span>`);
    if (r.isTray === false) tags.push(`<span class="cs-tag">not a tray (no vapour traffic rated)</span>`);
    const head = m.kind === "packed"
      ? `<h3>Bed at z = ${f.n(r.z)} m <span>(point ${r.stage} of ${m.rows.length}, z from the bed bottom)</span></h3>`
      : `<h3>Stage ${r.stage} ${tags.join(" ")}</h3>`;
    let meters = "";
    if (m.kind === "trays" && m.hasHydraulics && r.isTray) {
      meters += bar("Approach to flood", r.flood, f.pct(r.flood),
        `flood = 100 %${ff !== undefined ? ` · design target ${f.n(ff * 100)} %` : ""}`, (r.flood ?? 0) >= 1);
      meters += `<div class="cs-meter"><div class="cs-ml">Downcomer backup</div><div class="cs-mv">${f.n(r.hb)} mm liquid</div>`
        + `<div class="cs-mlimtxt">its limit h_b,max is not published; the run counted `
        + `${Math.round(k["downcomerFloodStages"] ?? 0)} downcomer-flooded tray(s)</div></div>`;
      meters += `<div class="cs-meter"><div class="cs-ml">Weeping</div><div class="cs-mv">—</div>`
        + `<div class="cs-mlimtxt">${k["weepingStages"] !== undefined
          ? `not published per tray; the run counted ${Math.round(k["weepingStages"])} weeping tray(s) of ${Math.round(k["nTrays"] ?? 0)}`
          : "not checked: the case declares no weep constant K2"}</div></div>`;
      meters += `<div class="cs-meter"><div class="cs-ml">Entrainment</div><div class="cs-mv">—</div>`
        + `<div class="cs-mlimtxt">no limit computed${k["psi_mean"] !== undefined ? `; mean fractional entrainment ψ = ${f.n(k["psi_mean"])} over the trays` : ""}</div></div>`;
    }
    const cells: [string, string][] = [];
    const add = (a: string, b: string | undefined) => { if (b !== undefined && b !== "—") cells.push([a, b]); };
    if (m.kind === "packed") {
      add(`T (${f.tU})`, f.T(r.T));
      add(`P (${f.pU})`, f.P(r.P));
      if (m.lk) add(`y ${m.lk}`, f.n(r.yLK));
      add("HETP local (m)", f.n(r.HETP));
      add(`ΔP/H (${f.pU}/m)`, f.P(r.dPperM));
      add("F-factor (Pa^0.5)", f.n(r.F));
    } else {
      add(`T (${f.tU})`, f.T(r.T));
      if (m.lk) { add(`x ${m.lk}`, f.n(r.xLK)); add(`y ${m.lk}`, f.n(r.yLK)); }
      add(`V (${f.fU})${r.flowFromSection ? " · section" : ""}`, f.F(r.V));
      add(`L (${f.fU})${r.flowFromSection ? " · section" : ""}`, f.F(r.L));
      add("approach to flood", f.pct(r.flood));
      add(`tray ΔP (${f.pU})`, f.P(r.dP));
      add("downcomer backup (mm)", f.n(r.hb));
      add("Murphree E_MV", f.n(r.E));
      add("point E_OG", f.n(r.EOG));
      add("Peclet Pe", f.n(r.Pe));
      add("active-area F-factor", f.n(r.Fa));
    }
    const tbl = `<table class="cs-kv"><tbody>${cells.map(([a, b]) =>
      `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}</tbody></table>`;
    return `<div class="cs-stage" data-stage="${r.stage}"${r.stage === selected ? "" : " hidden"}>${head}`
      + `<div class="cs-stagegrid"><div>${meters || (m.kind === "packed"
        ? `<p class="cs-why">The approach to flood along the bed is not published point by point (only its maximum, ${f.n(k["dP_over_dPflood_max"])} of the flooding pressure drop).</p>`
        : `<p class="cs-why">No hydraulics on this stage.</p>`)}</div><div>${tbl}</div></div></div>`;
  }).join("");
}

/*  ---- the sortable stage table ---------------------------------------------*/

interface ColDef { key: string; head: string; get: (r: StageRow) => SortValue; show: (r: StageRow) => string }

function stageTable(m: ColumnStageModel, f: Fmt): string {
  const cols: ColDef[] = m.kind === "packed" ? [
    { key: "z", head: "z (m)", get: (r) => r.z, show: (r) => f.n(r.z) },
    { key: "T", head: `T (${f.tU})`, get: (r) => r.T, show: (r) => f.T(r.T) },
    { key: "y", head: `y ${m.lk ?? ""}`, get: (r) => r.yLK, show: (r) => f.n(r.yLK) },
    { key: "HETP", head: "HETP (m)", get: (r) => r.HETP, show: (r) => f.n(r.HETP) },
    { key: "dP", head: `ΔP/H (${f.pU}/m)`, get: (r) => r.dPperM, show: (r) => f.P(r.dPperM) },
    { key: "F", head: "F (Pa^0.5)", get: (r) => r.F, show: (r) => f.n(r.F) },
  ] : [
    { key: "stage", head: "stage", get: (r) => r.stage, show: (r) => String(r.stage) },
    { key: "T", head: `T (${f.tU})`, get: (r) => r.T, show: (r) => f.T(r.T) },
    ...(m.lk ? [
      { key: "x", head: `x ${m.lk}`, get: (r: StageRow) => r.xLK, show: (r: StageRow) => f.n(r.xLK) },
      { key: "y", head: `y ${m.lk}`, get: (r: StageRow) => r.yLK, show: (r: StageRow) => f.n(r.yLK) }] : []),
    ...(m.rows.some((r) => r.V !== undefined) ? [
      { key: "V", head: `V (${f.fU})`, get: (r: StageRow) => r.V, show: (r: StageRow) => f.F(r.V) }] : []),
    ...(m.rows.some((r) => r.L !== undefined) ? [
      { key: "L", head: `L (${f.fU})`, get: (r: StageRow) => r.L, show: (r: StageRow) => f.F(r.L) }] : []),
    ...(m.hasHydraulics ? [
      { key: "flood", head: "flood (%)", get: (r: StageRow) => r.flood, show: (r: StageRow) => r.flood === undefined ? "—" : f.n(r.flood * 100) },
      { key: "dP", head: `ΔP (${f.pU})`, get: (r: StageRow) => r.dP, show: (r: StageRow) => f.P(r.dP) },
      { key: "hb", head: "h_b (mm)", get: (r: StageRow) => r.hb, show: (r: StageRow) => f.n(r.hb) }] : []),
    ...(m.rows.some((r) => r.E !== undefined) ? [
      { key: "E", head: "E_MV", get: (r: StageRow) => r.E, show: (r: StageRow) => f.n(r.E) }] : []),
  ];
  const idx = m.rows.map((_, i) => i);
  const orders: { [k: string]: { asc: number[]; desc: number[] } } = {};
  for (const c of cols) orders[c.key] = {
    asc: sortRows(idx, (i) => c.get(m.rows[i]!), "asc"),
    desc: sortRows(idx, (i) => c.get(m.rows[i]!), "desc"),
  };
  return `<table class="cs-sortable" data-orders='${JSON.stringify(orders)}'><thead><tr>`
    + cols.map((c) => `<th data-sort="${c.key}" aria-sort="none" title="sort by this column (click again to reverse)">${esc(c.head)}<span class="cs-arrow"> ↕</span></th>`).join("")
    + `</tr></thead><tbody>`
    + m.rows.map((r, i) => `<tr data-i="${i}" data-stage="${r.stage}"${r.stage === m.worst ? ` class="worst"` : ""}>`
      + cols.map((c) => `<td>${esc(c.show(r))}</td>`).join("") + `</tr>`).join("")
    + `</tbody></table>`;
}

/*  ---- the page fragment ----------------------------------------------------*/

export interface StageSection {
  html: string;
  model: ColumnStageModel;
  selected: number;
}

export function columnStageSection(unit: UnitSpec, kpis: Kpis | undefined,
  profile: UnitProfile | undefined, shell: DesignSheet | null,
  prefs: SheetPrefs = DEFAULT_PREFS): StageSection | null {
  const m = columnStageModel(unit, kpis, profile);
  if (!m || m.rows.length === 0) return null;
  const k = kpis ?? {};
  const f = sheetFormat(prefs);
  //  The default selection is the worst tray; a packed bed with no published
  //  local flood is opened at its largest local HETP, and says so.
  let selected = m.worst ?? m.rows[0]!.stage, selWhy = m.worst ? "the worst tray" : "the top stage";
  if (m.kind === "packed") {
    const iMax = m.rows.reduce((a, r, i) => (r.HETP ?? -1) > (m.rows[a]!.HETP ?? -1) ? i : a, 0);
    selected = m.rows[iMax]!.stage; selWhy = "the largest local HETP";
  }
  const fig = stageFigureSvg({ model: m, unit, kpis: k, shell, fmt: f, selected });
  const plan = m.kind === "trays" ? trayPlanSvg(unit, k, shell, f) : null;

  const inSample = m.efficiencyModel ? IN_SAMPLE_STATEMENTS[m.efficiencyModel] : undefined;
  const effLine = m.efficiencyModel
    ? `<p class="cs-eff">Tray efficiency COMPUTED by <b>${esc(m.efficiencyModel)}</b>: mean E_MV ${f.n(k["E_MV_mean"])}`
      + (k["E_MV_min"] !== undefined ? ` (${f.n(k["E_MV_min"])} – ${f.n(k["E_MV_max"])})` : "")
      + (k["overallTrayEfficiency"] !== undefined ? `, overall tray efficiency ${f.n(k["overallTrayEfficiency"])}` : "")
      + `.</p>`
    : m.declaredMurphree !== undefined
      ? `<p class="cs-eff">Murphree efficiency DECLARED by the case: E_MV = ${f.n(m.declaredMurphree)} on every tray.</p>`
      : "";
  const inSampleBox = inSample
    ? `<div class="cs-insample"><b>In-sample.</b> ${esc(inSample.text)} <span class="cs-cite">— the model's own header, <code>${esc(inSample.cite)}</code></span></div>`
    : "";
  const packedSummary = m.kind === "packed"
    ? `<p class="cs-eff">Bed HETP ${f.n(k["HETP"])} m (bed height over ${f.n(k["theoreticalStages_bed"])} Fenske stages), pressure drop ${f.n(k["dP_bed_mbar_per_m"])} mbar/m, highest ΔP/ΔP_flood ${f.n(k["dP_over_dPflood_max"])}.</p>`
    : "";

  const html = `<section id="cs-root" class="cs">
  <h2>${m.kind === "packed" ? "The bed at work <span>· along the bed" : "The trays at work <span>· stage by stage"}, from the run's own profile</span></h2>
  <p class="cap">Click any row — on the column, on a plot or in the table — and the panel below shows that ${m.kind === "packed" ? "point of the bed" : "tray"}. It opens on ${selWhy}.</p>
  ${effLine}${packedSummary}${inSampleBox}
  <div class="cs-figbox">${fig.svg}</div>
  <ul class="notes">${fig.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
  <div class="cs-sel${plan ? "" : " noplan"}">
    ${plan ? `<div class="cs-plan"><h3>Tray plan <span>(every tray: the geometry is one declaration)</span></h3>${plan.svg}<ul class="notes one">${plan.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}
    <div class="cs-stages">${stagePanels(m, k, unit, f, selected)}
      ${m.kind === "trays" && m.hasHydraulics ? `<p class="cs-why"><b>Why bars and not an operating window.</b> A tray's operating window plots its vapour load against its liquid load inside the flood, entrainment, weeping and downcomer-backup limit lines. This run publishes the approach to flood, the tray pressure drop and the downcomer backup for each tray, but not the loads nor any limit line, so the window is not drawn; what it would need is listed below.</p>` : ""}
    </div>
  </div>
  <h2>Stage table <span>· click a header to sort, a row to select</span></h2>
  <div class="cs-tablebox">${stageTable(m, f)}</div>
  <h2>Not published by the engine <span>· what this sheet would need to draw more</span></h2>
  <ul class="cs-missing">${m.missing.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
</section>`;
  return { html, model: m, selected };
}

/** The page's script: selection and the precomputed sort orders.  Plain ES5,
 *  no globals beyond one IIFE. */
export const STAGE_SHEET_SCRIPT = `<script>(function(){
var root=document.getElementById('cs-root');if(!root)return;
function sel(n){
  var ps=root.querySelectorAll('.cs-stage');for(var i=0;i<ps.length;i++){ps[i].hidden=ps[i].getAttribute('data-stage')!==n;}
  var h=root.querySelector('rect.cs-hit[data-stage="'+n+'"]'),b=document.getElementById('cs-sel');
  if(h&&b){b.setAttribute('y',h.getAttribute('y'));b.setAttribute('height',h.getAttribute('height'));}
  var rs=root.querySelectorAll('tr[data-stage]');for(var j=0;j<rs.length;j++){rs[j].classList.toggle('on',rs[j].getAttribute('data-stage')===n);}
}
root.addEventListener('click',function(e){
  var th=e.target.closest&&e.target.closest('th[data-sort]');
  if(th){var tb=th.closest('table'),o=JSON.parse(tb.getAttribute('data-orders')),k=th.getAttribute('data-sort');
    var cur=tb.getAttribute('data-key'),dir=(cur===k&&tb.getAttribute('data-dir')==='asc')?'desc':'asc';
    tb.setAttribute('data-key',k);tb.setAttribute('data-dir',dir);
    var body=tb.tBodies[0],rows={};for(var r=0;r<body.rows.length;r++){rows[body.rows[r].getAttribute('data-i')]=body.rows[r];}
    var ord=o[k][dir];for(var q=0;q<ord.length;q++){body.appendChild(rows[ord[q]]);}
    var hs=tb.querySelectorAll('th[data-sort]');for(var z=0;z<hs.length;z++){var on=hs[z]===th;
      hs[z].setAttribute('aria-sort',on?(dir==='asc'?'ascending':'descending'):'none');
      hs[z].querySelector('.cs-arrow').textContent=on?(dir==='asc'?' ▲':' ▼'):' ↕';}
    return;}
  var t=e.target.closest&&e.target.closest('[data-stage]');if(t&&!t.classList.contains('cs-stage'))sel(t.getAttribute('data-stage'));
});
})();</script>`;

/** The stylesheet the fragment needs, themed by the page's tokens. */
export const STAGE_SHEET_CSS = `
  .cs h2{margin-top:22px}
  .cs h3{font-size:13px;margin:4px 0 8px}
  .cs h3 span{color:var(--muted);font-weight:400;font-size:11px}
  .cs-figbox{border:1px solid var(--rule);border-radius:8px;padding:8px;background:var(--panel);overflow-x:auto}
  .cs-fig text{font-family:system-ui,sans-serif}
  .cs-t{fill:var(--fg);font-size:11px}
  .cs-small{font-size:9.5px;fill:var(--muted)}
  .cs-ph{font-weight:600;font-size:11.5px}
  .cs-decl{fill:var(--declared)} .cs-sized{fill:var(--sized)}
  .cs-bad{fill:var(--bad);font-weight:600}
  .cs-shell{fill:var(--steel);stroke:var(--fg);stroke-width:1.4}
  .cs-tray{stroke:var(--metal);stroke-width:1.6}
  .cs-weir{stroke:var(--fg);stroke-width:1.6}
  .cs-dc{stroke:var(--muted);stroke-width:1;stroke-dasharray:2 2}
  .cs-liquid{fill:var(--cool);opacity:.35}
  .cs-bed{stroke:var(--metal);stroke-width:1}
  .cs-hatchline{stroke:var(--metal);stroke-width:1.2}
  .cs-ghost{fill:none;stroke:var(--muted);stroke-dasharray:5 3;stroke-width:1.2}
  .cs-dim{stroke:var(--muted);stroke-width:1}
  .cs-arrhead{fill:var(--muted)} .cs-feedhead{fill:var(--accent)}
  .cs-feed{stroke:var(--accent);stroke-width:2.5}
  .cs-pipe{stroke:var(--metal);stroke-width:2}
  .cs-hx{fill:var(--panel);stroke:var(--fg);stroke-width:1.4}
  .cs-coil{fill:none;stroke:var(--fg);stroke-width:1.2}
  .cs-frame{fill:none;stroke:var(--rule)}
  .cs-line{fill:none;stroke:var(--accent);stroke-width:1.6}
  .cs-dash{stroke-dasharray:4 3}
  .cs-dot{fill:var(--accent)}
  .cs-bar{fill:var(--accent);opacity:.75} .cs-barworst{fill:var(--bad);opacity:.9} .cs-barbad{fill:var(--bad)}
  .cs-ref{stroke:var(--muted);stroke-dasharray:3 3}
  .cs-limit{stroke:var(--bad);stroke-width:1.4}
  .cs-worst{fill:var(--bad);opacity:.13}
  .cs-selbox{fill:none;stroke:var(--fg);stroke-width:1.4;stroke-dasharray:6 3}
  .cs-hit{fill:transparent;cursor:pointer}
  .cs-hit:hover{fill:var(--fg);fill-opacity:.06}
  .cs-planbg{fill:var(--steel);stroke:var(--fg);stroke-width:1.4}
  .cs-dcseg{fill:var(--cool);fill-opacity:.35;stroke:var(--fg);stroke-width:1}
  .cs-active{fill:none}
  .cs-weirline{stroke:var(--fg);stroke-width:3}
  .cs-patch{fill:var(--panel);stroke:var(--muted)}
  .cs-hole{fill:var(--fg);fill-opacity:.7}
  .cs-sel{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:16px;margin-top:14px;align-items:start}
  .cs-sel.noplan{grid-template-columns:1fr}
  .cs-stagegrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .cs-meter{display:grid;grid-template-columns:130px 1fr;gap:2px 8px;margin-bottom:9px;font-size:12px}
  .cs-ml{font-weight:600}
  .cs-mtrack{position:relative;height:10px;background:var(--rule);border-radius:5px;align-self:center}
  .cs-mfill{position:absolute;left:0;top:0;bottom:0;background:var(--accent);border-radius:5px}
  .cs-mfill.bad{background:var(--bad)}
  .cs-mlim{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--bad)}
  .cs-mv{grid-column:1}
  .cs-mlimtxt{grid-column:2;color:var(--muted);font-size:11px}
  .cs-kv td{padding:3px 8px}
  .cs-tag{font-size:10.5px;font-weight:500;background:var(--rule);border-radius:4px;padding:1px 6px;margin-left:4px}
  .cs-tag.bad{background:var(--bad);color:#fff}
  .cs-why{font-size:11.5px;color:var(--muted);line-height:1.5}
  .cs-eff{font-size:12.5px;margin:4px 0}
  .cs-insample{border-left:3px solid var(--bad);padding:6px 10px;margin:8px 0;font-size:12px;background:var(--panel)}
  .cs-cite{color:var(--muted);font-size:11px}
  .cs-sortable{margin-top:0}
  .cs-tablebox{max-height:460px;overflow-y:auto;border:1px solid var(--rule);margin-top:6px}
  .cs-tablebox th{position:sticky;top:0}
  .cs-sortable th{background:var(--head);color:#fff;cursor:pointer;white-space:nowrap}
  .cs-sortable td{font-variant-numeric:tabular-nums}
  .cs-sortable td:first-child{width:auto;color:var(--fg)}
  .cs-sortable tr.worst td{color:var(--bad);font-weight:600}
  .cs-sortable tr.on td{background:var(--panel);outline:1px dashed var(--muted)}
  .cs-sortable tbody tr{cursor:pointer}
  .cs-missing{font-size:12px;line-height:1.55;color:var(--fg)}
  .notes.one{column-count:1}
  @media (max-width:700px){.cs-sel,.cs-stagegrid{grid-template-columns:1fr}}
`;
