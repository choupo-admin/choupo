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
  methodFeeds — the ONE home for the engine-run specs that feed a classical
  METHOD CONSTRUCTION (Methods workspace) or a property lens (Explore).

  Extracted from ExploreWorkspace 2026-08-15 when McCabe-Thiele and the
  psychrometric chart moved to the Methods workspace: the binary-VLE feed is
  shared (Explore's T-x-y / γ(x) / flash lenses and Methods' McCabe tool
  consume the SAME engine run), so its spec construction must have exactly one
  copy — two would drift (the arity sin).  Pure spec building, zero physics:
  every number plotted downstream comes from the engine running the
  synthesized case (exploreSynth.ts → the WASM adapter).
\*---------------------------------------------------------------------------*/

import { metaByName, type ComponentMeta } from "./catalogue.js";
import { unifacGroupsBlock, type buildLocalUnifac } from "./unifacGroups.js";
import type { ExploreSpec } from "./exploreSynth.js";

export type LocalUnifac = ReturnType<typeof buildLocalUnifac>;

/** The lenses fed by ONE binary-VLE engine run.  "txy" / "mccabe" / "flash"
 *  share the T_bubble + y_eq(x) + liquid-stability sweep (the construction on
 *  top — staircase, tie-line — is pure geometry in the plot component);
 *  "gamma" sweeps the two activity coefficients instead. */
export type BinaryVleKind = "txy" | "gamma" | "flash" | "mccabe";

/** Put the MORE VOLATILE component (lower normal boiling point) first, so the
 *  equilibrium curve y*(x) lies ABOVE the y=x diagonal and a McCabe-Thiele
 *  staircase can be drawn at all.  Only reorders when BOTH boiling points are
 *  known (else the caller's order is kept). */
export function orderBinaryByVolatility(
  pair: [string, string], catalogue: ComponentMeta[],
): [string, string] {
  const tb0 = metaByName(pair[0], catalogue)?.tb;
  const tb1 = metaByName(pair[1], catalogue)?.tb;
  return typeof tb0 === "number" && typeof tb1 === "number" && tb1 < tb0
    ? [pair[1], pair[0]]
    : pair;
}

/** The binary-VLE feed: sweep x of the more volatile component 0→1 at fixed P.
 *  McCabe-Thiele and the binary flash need the SAME y_eq(x) curve as the
 *  T-x-y, so all three take this spec; the staircase / tie-line is then pure
 *  TS geometry, zero re-solve.  The T-x-y family also runs the per-x
 *  liquid-liquid stability probe so an immiscibility gap is marked instead of
 *  a phantom homogeneous curve. */
export function binaryVleSpec(args: {
  pair: [string, string];
  catalogue: ComponentMeta[];
  kind: BinaryVleKind;
  /** Liquid activity model ("ideal" | "NRTL" | "Wilson" | "UNIFAC"). */
  activity: string;
  /** Vapour EOS ("idealGas" | "SRK" | "PR"). */
  eos: string;
  /** Fixed pressure [Pa], canonical SI. */
  P: number;
  /** Points along the composition axis. */
  n: number;
  localUnifac: LocalUnifac;
  /** Case-local component .dat bodies that must reach the WASM run. */
  componentFiles?: Record<string, string>;
}): ExploreSpec {
  const vle = orderBinaryByVolatility(args.pair, args.catalogue);
  const c1 = vle[0], c2 = vle[1];
  const isTxy = args.kind !== "gamma";
  const properties = isTxy
    ? ["T_bubble", `y_eq_${c1}`, "liquid_stable"]
    : [`gamma_${c1}`, `gamma_${c2}`];
  return {
    components: [...vle],
    properties,
    axis: { variable: `x[${c1}]`, from: 0, to: 1, n: Math.max(2, Math.round(args.n)) },
    state: { P: args.P, composition: { [c1]: 0.5, [c2]: 0.5 } },
    activityModel: { model: args.activity },     // NRTL auto-resolves the pair by name
    equationOfState: { model: args.eos },
    ...(isTxy ? { vleTwoLiquid: true } : {}),    // 2-liquid package so the LL probe can fire
    // UNIFAC is predictive — ship the group decomposition so it isn't ideal
    ...(args.activity === "UNIFAC"
      ? { unifacGroups: unifacGroupsBlock(vle, args.localUnifac) } : {}),
    ...(args.componentFiles && Object.keys(args.componentFiles).length > 0
      ? { componentFiles: args.componentFiles } : {}),
  };
}

/** The psychrometric-chart feed (psychrometricChart engine op).  Carrier =
 *  the lower-Tb of the pair (stays gas); condensable = the higher-Tb (needs a
 *  vapour-pressure model).  Transport models ride along so the op can compute
 *  the Lewis number (true wet-bulb): Chung viscosity → Eucken k_gas + Fuller
 *  D_AB; a component lacking a diffusion volume silently omits that line
 *  engine-side. */
export function psychroSpec(args: {
  pair: [string, string];
  catalogue: ComponentMeta[];
  /** Fixed pressure [Pa], canonical SI. */
  P: number;
  /** Dry-bulb range, canonical SI [K] (converted to the op's °C here — once). */
  TminK: number;
  TmaxK: number;
  gridN: number;
  /** Relative-humidity curve interval + step [%]. */
  rhFrom: number;
  rhTo: number;
  rhStep: number;
  /** ΔT [°C] between wet-bulb / adiabatic-saturation anchor lines. */
  wbStepC: number;
  componentFiles?: Record<string, string>;
}): ExploreSpec {
  const byTb = [...args.pair].sort((a, b) =>
    (metaByName(a, args.catalogue)?.tb ?? 0) - (metaByName(b, args.catalogue)?.tb ?? 0));
  const carrier = byTb[0] ?? "";
  const condensable = byTb[byTb.length - 1] ?? "";
  const TminC = args.TminK - 273.15;
  const TmaxC = args.TmaxK - 273.15;
  const rh: number[] = [];
  for (let p = args.rhFrom; p <= args.rhTo + 1e-9 && p < 100; p += Math.max(1, args.rhStep))
    rh.push(Math.round(p));
  // Wet-bulb / adiabatic-saturation anchors at ROUND temperatures (10, 20,
  // … °C) so each line meets the saturation curve at a clean value.  The
  // engine drops any anchor past the condensable's boiling point.
  const wetBulb: number[] = [];
  const dTsat = Math.max(5, args.wbStepC);
  for (let t = Math.ceil(TminC / dTsat) * dTsat; t <= Math.min(TmaxC, 95); t += dTsat)
    wetBulb.push(t);
  return {
    components: [carrier, condensable],
    properties: [],
    axis: { variable: "T", from: 0, to: 1, n: 2 },   // unused
    state: { composition: { [carrier]: 0.5, [condensable]: 0.5 } },
    psychrometry: {
      carrier, condensable, P: args.P, TminC, TmaxC,
      gridN: Math.max(20, Math.round(args.gridN)), rh, wetBulb,
    },
    transport: { model: "Chung", thermalConductivity: "Eucken", diffusivity: "Fuller" },
    ...(args.componentFiles && Object.keys(args.componentFiles).length > 0
      ? { componentFiles: { ...args.componentFiles } } : {}),
  };
}
