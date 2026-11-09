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
  stackDispersionToy -- the defaults, the knobs and the witness of the
  `stack-dispersion` EduTool.  Every number here is a STARTING POINT the
  student moves; none is a limit value or a regulation.  A limit is the
  student's own input, with its source and date typed beside it (the price-data
  doctrine applied to a regulation): the page compiles in NO limit.
\*---------------------------------------------------------------------------*/

import type { PanelKnob } from "./knobPanel.js";
import type { Terrain, Weather } from "./stackDispersionMath.js";

/** The engine half's case: a methane burner at 1800 K, the equilibrium flue
 *  gas of which carries NO.  Read from its `flueGas` stream. */
export const STACK_WITNESS = "gibbs06_thermal_nox";
export const STACK_STREAM = "flueGas";
export const STACK_SPECIES = "NO";

export interface StackKnobs {
  hs: number;       // m
  u: number;        // m/s (10 m wind; also the Turner-table wind)
  vs: number;       // m/s
  d: number;        // m
  Ts: number;       // K
  Ta: number;       // K
  Q: number;        // g/s (toy source)
  terrain: Terrain;
  weather: Omit<Weather, "wind10">;
  /** which of the two classes of an A-B cell the figures use; "worst" = all */
  limit: number;    // ug/m3, the student's own number
  limitSource: string;
  limitDate: string;
  fence: number;    // m, radius of the fence about the stack
  hb: number;       // m, nearby building height
  wb: number;       // m, its projected width
}

export const STACK_DEFAULT: StackKnobs = {
  hs: 40, u: 4, vs: 12, d: 1.5, Ts: 420, Ta: 288, Q: 5,
  terrain: "rural",
  weather: { day: true, insolation: "moderate", cloud: "clear" },
  limit: 20, limitSource: "(type the source of your limit)", limitDate: "(date)",
  fence: 400, hb: 20, wb: 30,
};

const k = (id: string, label: string, min: number, max: number, step: number,
  unit: string, why?: string): PanelKnob => ({ id, label, min, max, step, unit, why });

export const KNOB_HS = k("hs", "physical stack height \\(h_s\\)", 0, 200, 1, "m",
  "Raise it and the whole plume rises with it: the exponent \\(H^2/2\\sigma_z^2\\) grows, so the ground sees less.");
export const KNOB_U = k("u", "wind speed at 10 m, \\(u\\)", 1, 12, 0.5, "m/s",
  "Wind dilutes and flattens the rise, both as \\(1/u\\); the class changes with it, through Turner's table.");
export const KNOB_VS = k("vs", "exit velocity \\(v_s\\)", 1, 30, 0.5, "m/s");
export const KNOB_D = k("d", "stack diameter \\(d\\)", 0.3, 5, 0.1, "m");
export const KNOB_TS = k("Ts", "exit temperature \\(T_s\\)", 290, 700, 5, "K");
export const KNOB_TA = k("Ta", "ambient temperature \\(T_a\\)", 260, 313, 1, "K");
export const KNOB_Q = k("Q", "emission rate \\(Q\\)", 0.1, 50, 0.1, "g/s");
export const KNOB_FENCE = k("fence", "fence radius about the stack", 50, 2000, 10, "m");
export const KNOB_HB = k("hb", "nearby building height \\(H_b\\)", 0, 80, 1, "m");
export const KNOB_WB = k("wb", "its projected width", 5, 150, 1, "m");
export const KNOB_TRAINS = k("trains", "identical burner trains on the stack", 1, 400, 1, "",
  "The case is a laboratory-scale burner (about 10 kmol/h of flue gas); this is the student's declared scale-up, not the engine's.");
export const KNOB_TS_STACK = k("TsStack", "stack-gas temperature \\(T_s\\)", 350, 900, 10, "K",
  "The stream is the burner's outlet at its own temperature; what the gas cools to before the stack is not in the plant yet, so it is the student's input.");
export const KNOB_D_STACK = k("dStack", "stack diameter \\(d\\)", 0.5, 6, 0.1, "m");
