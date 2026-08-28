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

export interface LessonStep {
  n: number;
  title: string;
  body: string;
  formula?: string;
  note?: string;
}

export const ENTU_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The question LMTD cannot answer",
    body: "Q = U·A·ΔT_lm is the first heat-exchanger equation anyone learns, "
      + "and it needs all FOUR terminal temperatures, because the log-mean "
      + "difference is built out of the two end approaches.  A rating or "
      + "design problem hands you the opposite: the two INLETS and a piece of "
      + "hardware, with the outlets as the unknowns.  So the LMTD route has "
      + "to guess an outlet, compute a duty, correct the guess and go round "
      + "again.  The ε-NTU method is the same first law rearranged so that "
      + "the duty falls out of what you already know.",
    formula: "LMTD route   Q = U·A·ΔT_lm       needs T_h,in T_h,out T_c,in T_c,out\n"
      + "ε-NTU route  Q = ε·C_min·(T_h,in − T_c,in)   needs the two INLETS",
    note: "Choupo's exchanger takes the second route: it solves the duty and "
      + "both outlets from ε-NTU, and only then computes the LMTD, printing "
      + "U·A·LMTD beside the duty as a cross-check.  Two routes to one number "
      + "is worth the arithmetic; if they disagree, one of them is wrong.",
  },
  {
    n: 2,
    title: "The most you could possibly get, and why C_min sets it",
    body: "Before asking how well an exchanger performs, ask what performing "
      + "perfectly would mean.  No exchanger can push a stream past the OTHER "
      + "stream's inlet temperature — that is the second law, and it caps "
      + "everything.  So the largest temperature swing available to either "
      + "stream is ΔT_max = T_h,in − T_c,in, and the duty that swing carries "
      + "is C·ΔT_max, where the capacity rate C = ṁ·c_p is the watts per "
      + "kelvin a stream can absorb or release.  Work it out for each stream "
      + "and you get two different numbers, and only the SMALLER is "
      + "achievable: the stream with the smaller C is the one that can swing "
      + "the whole ΔT_max, because handing that swing to the larger-C stream "
      + "would force the smaller-C one straight past its partner's inlet.",
    formula: "C = ṁ·c_p          C_min = min(C_hot, C_cold)\n"
      + "Q_max = C_min · (T_h,in − T_c,in)",
    note: "Q_max is what a COUNTERFLOW exchanger of infinite area would "
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
      + "dimensionless SIZE: the heat-transfer conductance U·A measured "
      + "against the capacity rate it has to serve.  Double the area, or "
      + "double U, and you double NTU.",
    formula: "ε = Q / Q_max              0 ≤ ε ≤ 1\n"
      + "NTU = U·A / C_min",
    note: "ε is not a thermodynamic efficiency: it is a fraction of a "
      + "FIRST-LAW maximum, and an exchanger at ε = 1 still destroys plenty "
      + "of availability across its temperature difference.  And NTU is a "
      + "size only relative to the flow it serves — the same shell is a large "
      + "exchanger for a trickle and a small one for a torrent.",
  },
  {
    n: 4,
    title: "C_r, the parameter nobody remembers, and the two limits it brackets",
    body: "The third parameter is the capacity ratio, and it is the one "
      + "students skip.  It says how MATCHED the two streams are, and it "
      + "decides whether the flow arrangement matters at all.  Two limits "
      + "bracket every curve on the plot, and once you can place them the "
      + "whole family becomes readable.",
    formula: "C_r = C_min / C_max                    0 ≤ C_r ≤ 1\n"
      + "C_r = 0    ε = 1 − exp(−NTU)           every arrangement\n"
      + "C_r = 1    ε = NTU / (1 + NTU)         counter-current",
    note: "C_r = 0 is a stream whose temperature does not move — condensing "
      + "steam, a boiling liquid, or simply a service stream so large that "
      + "its outlet is its inlet.  With one side isothermal there is no "
      + "\"which way round\" left to ask, and all three arrangements collapse "
      + "onto ONE curve.  C_r = 1 is balanced streams, the hardest case and "
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
      + "and the two cross somewhere on this curve.  WHERE they cross depends "
      + "on prices and on the pumping power the extra area costs — neither of "
      + "which is on this plot, and neither of which the numbers here can "
      + "tell you.",
  },
];

export const ENTU_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "sensible-only",
    title: "Sensible heat only — the C_r = 0 limit is on the chart, not in the unit.",
    body: "The exchanger changes each stream's TEMPERATURE and nothing else: "
      + "flow, composition, pressure and vapour fraction pass through "
      + "unchanged, and each stream's c_p is read from the phase its vapour "
      + "fraction declares (liquid below 0.5, ideal gas above). A condensing "
      + "or boiling stream — the physical C_r = 0 — is not something this "
      + "unit solves. With the knobs you can only approach C_r = 0 by "
      + "starving one side's flow, which reaches the same ratio by a "
      + "different road.",
  },
  {
    id: "constant-U",
    title: "ONE U, for the whole exchanger.",
    body: "U is a single declared number, used unchanged along the entire "
      + "area — the 21-point temperature profile beside the chart is "
      + "integrated with it. A real U varies along the exchanger with "
      + "velocity, viscosity and wall temperature. Each stream's c_p IS "
      + "re-evaluated at its own mean temperature (two passes), so the "
      + "capacity rates are mean-temperature values; U gets no such "
      + "treatment. The unit's separate geometry mode computes one U from a "
      + "tube bundle and its correlations, but it is still one U.",
  },
  {
    id: "no-fouling",
    title: "No fouling resistance anywhere.",
    body: "The overall resistance carries a film on each side and, in "
      + "geometry mode, the tube wall. There is no fouling term, no "
      + "cleanliness factor and no allowance for one, so every number here "
      + "describes a clean exchanger on its first day. How much extra area a "
      + "real design carries is usually decided by exactly the term that is "
      + "missing.",
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
    title: "Three arrangements, and an unrecognised word becomes counter-current.",
    body: "Counter-current, co-current, and 1 shell pass / 2N tube passes "
      + "(reached by declaring passes ≥ 2). Crossflow — either fluid mixed or "
      + "unmixed — is not implemented, and neither is any multi-shell "
      + "arrangement. The unit reads `flow` as a single word and treats co, "
      + "cocurrent and parallel as co-current and EVERYTHING ELSE as "
      + "counter-current, so a name it does not know is silently "
      + "counter-current rather than refused.",
  },
];
