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
  The effectiveness-NTU lesson, as DATA, so the argument can be asserted to
  still run end to end -- prose is the part of a tool that rots with nothing
  failing.

  The spine is the question LMTD cannot answer.  Q = U A dT_lm needs all FOUR
  terminal temperatures, and a rating or design problem gives you two INLETS
  and a piece of hardware.  eps-NTU is the same first law rearranged so the
  answer comes out of what you actually know -- which is why it exists, and
  the only reason worth opening the page with.

  Every arithmetic claim below is recomputed from the tool's own
  `epsilonNtu` in tests/epsilonNtuLesson.test.ts, so a page teaching against
  its own code fails rather than ships.
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
export type { LessonStep, SymbolGloss };

export const ENTU_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The question LMTD cannot answer",
    body: "Q = U·A·ΔT_lm is the first heat-exchanger equation anyone learns, "
      + "and it needs all four terminal temperatures, because the log-mean "
      + "difference is built out of the two end approaches.  A rating or "
      + "design problem hands you the opposite: the two inlets and a piece of "
      + "hardware, with the outlets as the unknowns.  So the LMTD route has "
      + "to guess an outlet, compute a duty, correct the guess and go round "
      + "again.  The ε-NTU method is the same first law rearranged so that "
      + "the duty falls out of what you already know.",
    formula: String.raw`\begin{array}{lll}
\text{LMTD route} & Q = U A\, \Delta T_\mathrm{lm} & \text{needs } T_{h,\mathrm{in}},\ T_{h,\mathrm{out}},\ T_{c,\mathrm{in}},\ T_{c,\mathrm{out}}\\
\varepsilon\text{-NTU route} & Q = \varepsilon\, C_\mathrm{min} (T_{h,\mathrm{in}} - T_{c,\mathrm{in}}) & \text{needs the two inlets}
\end{array}`,
    where: [
      { sym: "Q", means: "the duty — heat actually crossing from the hot "
        + "stream to the cold one", unit: "W" },
      { sym: "U", means: "the overall heat-transfer coefficient, hot side to "
        + "cold side through the wall", unit: "W/(m²·K)" },
      { sym: "A", means: "the heat-transfer area of the exchanger",
        unit: "m²" },
      { sym: "\\Delta T_\\mathrm{lm}",
        means: "the log-mean temperature difference — the "
        + "average driving force along the exchanger, which needs all four "
        + "terminal temperatures and therefore needs the answer before it "
        + "can be computed", unit: "K" },
      { sym: "\\varepsilon",
        means: "the effectiveness — the duty as a fraction of the "
        + "most this pair of streams could possibly exchange" },
      { sym: "C_\\mathrm{min}",
        means: "the smaller of the two capacity rates ṁ·c_p, "
        + "defined in the next step", unit: "W/K" },
      { sym: "T_{h,\\mathrm{in}} \\,/\\, T_{c,\\mathrm{in}}",
        means: "the hot and cold inlet temperatures",
        unit: "K" },
      { sym: "T_{h,\\mathrm{out}} \\,/\\, T_{c,\\mathrm{out}}",
        means: "the two outlet temperatures — what "
        + "the LMTD route needs and the ε-NTU route does not", unit: "K" },
    ],
    note: "Choupo's exchanger takes the second route: it solves the duty and "
      + "both outlets from ε-NTU, and only then computes the LMTD, printing "
      + "U·A·LMTD beside the duty as a cross-check.  Two routes to one number "
      + "is worth the arithmetic — but only where the two routes describe the "
      + "same exchanger.  What the method allows: Q = U·A·ΔT_lm holds as "
      + "written for a single-pass, purely counter- or co-current exchanger "
      + "whose U is constant and whose streams each have a constant heat "
      + "capacity rate, or sit at a constant temperature.  A pure fluid "
      + "condensing or boiling at constant temperature against a "
      + "single-phase stream is the textbook case where it is exact (C_r = "
      + "0 and ε = 1 − exp(−NTU), the two routes agree).  It fails where a "
      + "stream's temperature is not a straight line against the heat "
      + "exchanged: a desuperheating or subcooling zone beside the "
      + "condensing one, a condensation temperature that glides (a mixture, "
      + "or a pressure drop), or strongly varying properties; there the "
      + "exchanger is divided into segments and each is treated alone.  A "
      + "1-shell / 2-tube-pass exchanger obeys Q = U·A·F·ΔT_lm with a "
      + "correction factor F below one, so the plain product is expected to "
      + "exceed Q (the engine prints the F that the two numbers imply).  "
      + "What this unit models: a sensible duty only.  Its duty is built from "
      + "the capacity rate of each stream's inlet phase, with no latent "
      + "term, so when a side changes phase the duty is not that of a "
      + "condenser or an evaporator, the engine announces it, and U·A·LMTD "
      + "is no check there (HeatExchanger.cpp:1028-1053, 1222-1225).  That "
      + "is a limit of the unit, not a statement that the log-mean fails "
      + "across a phase change.",
  },
  {
    n: 2,
    title: "The most you could possibly get, and why C_min sets it",
    body: "Before asking how well an exchanger performs, ask what performing "
      + "perfectly would mean.  No exchanger can push a stream past the other "
      + "stream's inlet temperature — that is the second law, and it caps "
      + "everything.  So the largest temperature swing available to either "
      + "stream is ΔT_max = T_h,in − T_c,in, and the duty that swing carries "
      + "is C·ΔT_max, where the capacity rate C = ṁ·c_p is the watts per "
      + "kelvin a stream can absorb or release.  Work it out for each stream "
      + "and you get two different numbers, and only the smaller is "
      + "achievable: the stream with the smaller C is the one that can swing "
      + "the whole ΔT_max, because handing that swing to the larger-C stream "
      + "would force the smaller-C one straight past its partner's inlet.",
    formula: String.raw`\begin{aligned}
C &= \dot m\, c_p & C_\mathrm{min} &= \min(C_\mathrm{hot},\, C_\mathrm{cold})\\
Q_\mathrm{max} &= C_\mathrm{min} (T_{h,\mathrm{in}} - T_{c,\mathrm{in}})
\end{aligned}`,
    where: [
      { sym: "C", means: "the capacity rate of a stream — how much heat it "
        + "carries away per degree", unit: "W/K" },
      { sym: "\\dot m", means: "mass flow rate", unit: "kg/s" },
      { sym: "c_p", means: "specific heat capacity", unit: "J/(kg·K)" },
      { sym: "C_\\mathrm{min}",
        means: "the smaller of the two capacity rates — the "
        + "stream that changes temperature fastest, and therefore the one "
        + "that limits the exchange" },
      { sym: "C_\\mathrm{hot} \\,/\\, C_\\mathrm{cold}",
        means: "the capacity rates of the hot and the "
        + "cold stream", unit: "W/K" },
      { sym: "C_\\mathrm{max}", means: "the larger of the two" },
      { sym: "Q_\\mathrm{max}",
        means: "the largest duty this pair of streams could "
        + "exchange, at infinite area", unit: "W" },
      { sym: "T_{h,\\mathrm{in}} \\,/\\, T_{c,\\mathrm{in}}",
        means: "the two inlet temperatures — the only "
        + "temperatures the ε-NTU route needs", unit: "K" },
    ],
    note: "Q_max is what a counterflow exchanger of infinite area would "
      + "deliver.  That is not a rhetorical infinity: it is the ceiling the "
      + "counter-current curves on the plot climb towards, and the one the "
      + "co-current curves visibly do not.",
  },
  {
    n: 3,
    title: "Two dimensionless numbers: what it achieves, and how big it is",
    body: "Effectiveness is the duty as a fraction of that maximum — a pure "
      + "ratio, no units, between 0 and 1, and it says what this exchanger "
      + "got out of the temperature difference it was given.  NTU is the "
      + "dimensionless size: the heat-transfer conductance U·A measured "
      + "against the capacity rate it has to serve.  Double the area, or "
      + "double U, and you double NTU.",
    formula: String.raw`\begin{aligned}
\varepsilon &= \frac{Q}{Q_\mathrm{max}} &\qquad& 0 \le \varepsilon \le 1\\
\mathrm{NTU} &= \frac{U A}{C_\mathrm{min}}
\end{aligned}`,
    where: [
      { sym: "\\mathrm{NTU}",
        means: "the number of transfer units: the exchanger's size made "
        + "dimensionless against the stream that limits it.  It is the size "
        + "variable of the method, as epsilon is its performance variable" },
    ],
    note: "ε is not a thermodynamic efficiency: it is a fraction of the "
      + "largest duty the second law allows, and says nothing about how much "
      + "availability is destroyed.  Only a balanced counter-current "
      + "exchanger closes its temperature difference everywhere as ε → 1; "
      + "any other arrangement at its limiting ε still transfers heat across "
      + "a finite difference.  And NTU is a "
      + "size only relative to the flow it serves — the same shell is a large "
      + "exchanger for a trickle and a small one for a torrent.",
  },
  {
    n: 4,
    title: "C_r, the parameter nobody remembers, and the two limits it brackets",
    body: "The third parameter is the capacity ratio, and it is the one "
      + "students skip.  It says how matched the two streams are, and it "
      + "decides whether the flow arrangement matters at all.  Two limits "
      + "bracket every curve on the plot, and once you can place them the "
      + "whole family becomes readable.",
    formula: String.raw`\begin{array}{lll}
C_r = \dfrac{C_\mathrm{min}}{C_\mathrm{max}} & & 0 \le C_r \le 1\\[4pt]
C_r = 0 & \varepsilon = 1 - \exp(-\mathrm{NTU}) & \text{every arrangement}\\
C_r = 1 & \varepsilon = \dfrac{\mathrm{NTU}}{1 + \mathrm{NTU}} & \text{counter-current}
\end{array}`,
    where: [
      { sym: "\\mathrm{NTU}",
        means: "the number of transfer units, U·A/C_min — the "
        + "exchanger's size measured against the stream that limits it, and "
        + "dimensionless because it is a ratio of two conductances" },
      { sym: "C_r", means: "the capacity-rate ratio C_min/C_max — how evenly "
        + "matched the two streams are.  0 when one side changes phase and "
        + "holds its temperature; 1 when both swing equally" },
      { sym: "T_h \\,/\\, T_c", means: "hot-side and cold-side temperature, at "
        + "whichever end the subscript names", unit: "K" },
    ],
    note: "C_r = 0 is a stream whose temperature does not move — condensing "
      + "steam, a boiling liquid, or simply a service stream so large that "
      + "its outlet is its inlet.  With one side isothermal there is no "
      + "\"which way round\" left to ask, and all three arrangements collapse "
      + "onto one curve.  C_r = 1 is balanced streams, the hardest case and "
      + "the one where the arrangements differ most: counter-current still "
      + "climbs towards ε = 1, slowly, while co-current stops dead at "
      + "1/(1 + C_r) = 0.5 however much area you buy.",
  },
  {
    n: 5,
    title: "What the shape costs you",
    body: "Read the counter-current curves left to right and the lesson is in "
      + "the bend.  ε climbs steeply out of the origin and then flattens, "
      + "because every extra unit of NTU is working on a smaller remaining "
      + "temperature difference than the one before it.  At C_r = 0.5 the "
      + "first three NTU buy an effectiveness of 0.87; the next three — "
      + "doubling the exchanger — buy 0.10 more.  Past the bend you are "
      + "paying area for duty that is no longer there to collect.  The same "
      + "reading also rules an arrangement out before any sizing: if you need "
      + "ε = 0.7 at C_r = 0.5, no co-current exchanger of any size can reach "
      + "it, because its ceiling is 1/(1 + C_r) = 0.667.",
    note: "This is why exchanger design ends in a trade-off and not a "
      + "maximum: area costs capital, recovered duty saves operating cost, "
      + "and the two cross somewhere on this curve.  Where they cross depends "
      + "on prices and on the pumping power the extra area costs — neither of "
      + "which is on this plot, and neither of which the numbers here can "
      + "tell you.",
  },
];

export const ENTU_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "sensible-only",
    title: "A sensible duty only — the C_r = 0 limit is on the chart, not in the unit.",
    body: "The exchanger's duty comes from sensible capacity rates: each "
      + "stream's c_p is read from the phase its vapour fraction declares "
      + "(liquid below 0.5, ideal gas above), and flow, composition and "
      + "pressure pass through unchanged. A condensing or boiling stream — "
      + "the physical C_r = 0 — is not something this unit solves in its "
      + "ε-NTU. The outlet state is found afterwards from the enthalpy, so a "
      + "stream may leave partly boiled (a pure one at its saturation "
      + "temperature, its vapour fraction carried as a pin), but the duty "
      + "that boiled it came from a sensible c_p — so such a duty is not the "
      + "duty of a condenser or an evaporator, and the engine says so: when "
      + "either outlet leaves in a different phase from its inlet, the run "
      + "announces that the duty (not only the outlet) rests on a sensible "
      + "model and that U·A·LMTD is no check there. On this page's witness "
      + "the knobs keep both sides liquid (the hot inlet stops at 390 K, "
      + "below the 393 K saturation of water at the case's 2 bar), so the "
      + "exercise stays in the domain the model covers. With the knobs you "
      + "can only approach C_r = 0 by starving one side's flow, which reaches "
      + "the same ratio but not the same physics: a starved stream swings "
      + "through the whole temperature difference while the other side "
      + "barely moves, whereas a boiling stream holds its temperature because "
      + "its heat goes into latent change.",
  },
  {
    id: "constant-U",
    title: "One U, for the whole exchanger.",
    body: "U is a single declared number, used unchanged along the entire "
      + "area — the 21-point temperature profile beside the chart is "
      + "integrated with it. A real U varies along the exchanger with "
      + "velocity, viscosity and wall temperature. Each stream's c_p is "
      + "re-evaluated at its own mean temperature (two passes), so the "
      + "capacity rates are mean-temperature values; U gets no such "
      + "treatment. The unit's separate geometry mode computes one U from a "
      + "tube bundle and its correlations, but it is still one U.",
  },
  {
    id: "no-fouling",
    title: "No fouling resistance on this page.",
    body: "The overall resistance carries a film on each side and, in "
      + "geometry mode, the tube wall. In the epsNTU mode this page runs "
      + "there is no fouling term and no cleanliness factor, so every number "
      + "here describes a clean exchanger on its first day. The geometry "
      + "mode accepts an optional fouling resistance per side, and the "
      + "sizing pass's detailed design requires one -- because how much "
      + "extra area a real design carries is usually decided by exactly "
      + "that term.",
  },
  {
    id: "no-pressure-drop",
    title: "Pressure drop is not charged to the streams.",
    body: "Outlet streams leave at their inlet pressure. In geometry mode the "
      + "unit computes Kern tube- and shell-side pressure drops and publishes "
      + "them as KPIs, but they are reported and not applied — nothing "
      + "downstream sees them. In the epsNTU mode this page runs, no pressure "
      + "drop is computed at all. Pumping power is the other half of the area "
      + "trade-off in step 5, and it is not on this chart.",
  },
  {
    id: "arrangements",
    title: "Three arrangements, and an unrecognised word is refused.",
    body: "Counter-current, co-current, and 1 shell pass / 2N tube passes "
      + "(reached by declaring passes ≥ 2). Crossflow — either fluid mixed or "
      + "unmixed — is not implemented, and neither is any multi-shell "
      + "arrangement. The unit reads `flow` as a single word: co, cocurrent "
      + "and parallel are co-current, counter and countercurrent are "
      + "counter-current, and any other word -- crossflow, a capital Co, a "
      + "typo -- is refused by name, with the accepted set in the message. "
      + "It used to fall back to counter-current instead, which is the "
      + "optimistic arrangement, so a typo quietly undersized the exchanger "
      + "at exit 0.",
  },
];
