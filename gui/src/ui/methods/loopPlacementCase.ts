/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  loopPlacementCase -- re-wire the shipped two-loop reactor (ctrl22) for the
  "Where to put a control loop" page.

  WHY A BUILDER AND NOT SCALAR OVERRIDES.  The page has to REMOVE controllers
  (the inflow's step, the temperature loop) and ADD others on different
  manipulated variables, which a scalar override cannot do.  The edit is
  therefore a text edit of two dictionaries -- the `controllers ( ... )` list
  and a few scalars -- and the rest of the case (the vessel, its reaction, its
  level loop LC1, the feed and the initial state) is the shipped one, byte for
  byte.  The level loop's own text is taken from the shipped file, so its
  gains are the case's, not the page's.

  A PURE FUNCTION OF TEXT, so a node test can run the very same edit through
  the native choupoCtrl.  Every edit refuses when its target is absent or
  ambiguous (the override helpers' rule): a silent no-op would run the engine
  on a question nobody asked.

  THE FIVE LOOPS A WIRING MAY CONTAIN, by the pair (controlled variable,
  manipulated variable) the engine's names give them:

    level  : cv level          -> mv F_out      (the shipped LC1, kept)
    T-Tj   : cv T              -> mv T_jacket
    x-F    : cv x_2Butanol     -> mv F_in       (the feed rate as a valve)
    T-F    : cv T              -> mv F_in
    x-Tj   : cv x_2Butanol     -> mv T_jacket

  cv `x_2Butanol` is the vessel's product mole fraction
  (src/unitOperations/dynamic/DynamicCSTR.cpp:1400) and mv `F_in` scales the
  inlet's component flows proportionally (DynamicCSTR.cpp:1296).
\*---------------------------------------------------------------------------*/

import { applyScalarOverride } from "../../case/methodRun.js";
import {
  BASE_TJ_K, CLOSED_END_S, OPEN_END_S, SP_T_K, SP_X, piFromGain, type Gain2,
} from "./loopPlacementMath.js";

export type LoopId = "level" | "T-Tj" | "x-F" | "T-F" | "x-Tj";

/** One wiring of the reactor.  `open` runs the vessel with NO loop but the
 *  level and takes the jacket temperature and the feed rate as inputs. */
export type Wiring =
  | { kind: "open"; Tj: number; F: number }
  | { kind: "closed"; loops: readonly LoopId[]; K: Gain2; scale?: number };

/** The named wirings the page offers. */
export const WIRINGS = {
  /** T by the jacket, x by the feed rate; level on the outflow. */
  natural: ["level", "T-Tj", "x-F"],
  /** The swapped pairing: T by the feed rate, x by the jacket. */
  swapped: ["level", "T-F", "x-Tj"],
  /** The natural pairing with NO level loop: the inventory is left alone. */
  noLevel: ["T-Tj", "x-F"],
  /** The feed rate is FIXED (throughput set); level, and x by the jacket. */
  fixedThroughput: ["level", "x-Tj"],
} as const satisfies { [k: string]: readonly LoopId[] };

export type WiringName = keyof typeof WIRINGS;

const FILES = {
  flowsheet: "system/flowsheetDict",
  control: "system/controlDict",
  feed: "0/feed",
} as const;

function need(raw: { [rel: string]: string }, rel: string): string {
  const t = raw[rel];
  if (t === undefined)
    throw new Error(`loop placement: the witness lacks '${rel}'`);
  return t;
}

/** The shipped level loop, copied out of the shipped controllers list. */
function shippedLevelLoop(text: string): string {
  const m = /\n    \{\n        name         LC1;[\s\S]*?\n    \}\n/.exec(text);
  if (!m)
    throw new Error("loop placement: the shipped LC1 block was not found in"
      + " the witness's controllers list");
  return m[0].slice(1);
}

interface LoopRecipe {
  name: string; cv: string; mv: string; sp: number;
  min: number; max: number; bias: number;
  gainOf: (K: Gain2) => number;
}

const RECIPES: { [id in Exclude<LoopId, "level">]: LoopRecipe } = {
  "T-Tj": { name: "TC1", cv: "T", mv: "T_jacket", sp: SP_T_K, min: 280, max: 420,
    bias: BASE_TJ_K, gainOf: (K) => K.K11 },
  "x-F": { name: "CC1", cv: "x_2Butanol", mv: "F_in", sp: SP_X, min: 2e-4, max: 3e-3,
    bias: 1.0e-3, gainOf: (K) => K.K22 },
  "T-F": { name: "TC1", cv: "T", mv: "F_in", sp: SP_T_K, min: 2e-4, max: 3e-3,
    bias: 1.0e-3, gainOf: (K) => K.K12 },
  "x-Tj": { name: "CC1", cv: "x_2Butanol", mv: "T_jacket", sp: SP_X, min: 280, max: 420,
    bias: BASE_TJ_K, gainOf: (K) => K.K21 },
};

function pidBlock(r: LoopRecipe, K: Gain2, scale: number): string {
  const { Kp, Ki } = piFromGain(r.gainOf(K), scale);
  return `    {
        name         ${r.name};
        type         PID;
        measurement  { unit reactor;  cv ${r.cv}; }
        actuator     { unit reactor;  mv ${r.mv}; }
        setpoint     ${r.sp};
        gains        { Kp ${Kp}; Ki ${Ki}; Kd 0.0; }
        output       { min ${r.min}; max ${r.max}; bias ${r.bias}; }
    }
`;
}

/** The raw files of the wired case, from the witness's raw files.  The input
 *  map is not modified. */
export function buildLoopCase(
  raw: { [rel: string]: string }, w: Wiring,
): { [rel: string]: string } {
  const out = { ...raw };
  const fsText = need(raw, FILES.flowsheet);
  const at = fsText.indexOf("\ncontrollers\n(");
  if (at < 0)
    throw new Error("loop placement: no `controllers (` list in the witness");
  const level = shippedLevelLoop(fsText);
  const head = fsText.slice(0, at + 1);

  let loops: string[];
  let end: number;
  let tj: number | null = null;
  let feed: number | null = null;
  if (w.kind === "open") {
    loops = [level];
    end = OPEN_END_S;
    tj = w.Tj;
    feed = w.F;
  } else {
    loops = w.loops.map((id) =>
      id === "level" ? level : pidBlock(RECIPES[id], w.K, w.scale ?? 1));
    end = CLOSED_END_S;
  }
  const wired = head + "controllers\n(\n" + loops.join("") + ");\n";
  out[FILES.flowsheet] = tj === null ? wired : applyScalarOverride(wired,
    { file: FILES.flowsheet, key: "T_jacket", value: tj, unit: "K" });

  out[FILES.control] = applyScalarOverride(applyScalarOverride(
    need(raw, FILES.control),
    { file: FILES.control, key: "endTime", value: end }),
    { file: FILES.control, key: "writeInterval", value: 1000 });

  // A rewired case is not the case its declared figures were written for: the
  // witness's views name controllers (LC1, TC1) a wiring may remove, and the
  // engine refuses a view whose source is absent before it integrates (C487).
  // The page draws its own figures from the trajectory, so the views go.
  delete out["system/postDict"];

  if (feed !== null)
    out[FILES.feed] = applyScalarOverride(need(raw, FILES.feed),
      { file: FILES.feed, key: "2Methyl1Propanol", value: feed, unit: "kmol/s" });
  return out;
}
