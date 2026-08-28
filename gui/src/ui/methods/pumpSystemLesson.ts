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
  The pump-and-system lesson, as DATA, for the reason every lesson in this
  directory is: prose is the part of a tool that rots with nothing failing,
  and an argument held as data can be asserted against the engine numbers it
  claims to describe (tests/pumpSystemLesson.test.ts recomputes the scaling
  claims from the witness's own sweep CSV).

  THE FACT THIS PAGE IS BUILT ON: a pump does not set a flow.  Two curves set
  it together, and the student who believes otherwise reads every pump
  datasheet wrongly for years.

  WHAT THE PAGE MAY CLAIM is bounded by what the engine models, and that was
  read off the source before a word of this was written:

    * `src/unitOperations/hydraulics/Pipe.cpp` -- the system side.  The
      single-phase branch computes dP = f (L/D) rho v^2/2  +  sumK rho v^2/2
      +  rho g dz, with f from the registered friction family (the witness
      declares Churchill, whose declared window is all Re and all roughness).
      So the static-plus-friction split, and the near-quadratic growth, are
      real and the page may teach them.
    * `src/unitOperations/rotating/Pump.cpp` -- the machine side.  It is an
      INCOMPRESSIBLE closed form, dP = eta W_shaft / Q, with eta a declared
      CONSTANT.  There is no speed, no impeller diameter, no efficiency
      curve, no suction geometry, and a repository-wide search for NPSH or
      cavitation returns nothing at all.

  So steps 4 and 5 -- throttling versus speed, and NPSH -- are written as
  what the diagram does NOT decide, with the classical relations stated and
  explicitly NOT evaluated.  Writing them as though the page computed them
  would be the exact failure this project's honesty rules exist to prevent.
\*---------------------------------------------------------------------------*/

export interface LessonStep {
  n: number;
  title: string;
  body: string;
  formula?: string;
  note?: string;
}

export const PUMP_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The pump does not set the flow",
    body: "This is the thing to get right first, because everything else "
      + "follows from it.  A pump is not a flow meter with a motor attached: "
      + "install the same pump on two different pipe runs and you get two "
      + "different flows.  The flow is decided by TWO curves at once — what "
      + "the pipework DEMANDS at each flow, and what the machine can DELIVER "
      + "at each flow.  One curve rises, the other falls, so they meet at "
      + "exactly one place, and that crossing is the operating point: the "
      + "only flow the installation can actually run at.",
    formula: "Δp_pump(Q*) = Δp_system(Q*)      →      Q* , the operating point",
    note: "Read the plot below as two answers to the same question.  The "
      + "sweep behind it IMPOSES a flow at each of its points and asks each "
      + "side what pressure it would want there; at every flow but one the "
      + "two answers differ, and the difference has nowhere to go.  The "
      + "system curve in this case carries no terminal-pressure term, so the "
      + "crossing is exactly the flow at which the delivered pressure comes "
      + "back to the pressure the suction was given — the closure that makes "
      + "that one flow, and no other, a state this installation can sit in.",
  },
  {
    n: 2,
    title: "The system curve: what the pipework demands",
    body: "Split the demand in two, because the halves behave completely "
      + "differently.  The STATIC head is the part that does not care how "
      + "fast you push: lifting the liquid through an elevation, and pushing "
      + "it into a vessel held at a different pressure.  Stop the flow "
      + "entirely and it is still there.  The FRICTION head is everything "
      + "the moving liquid rubs away — the pipe wall along the run, plus the "
      + "elbows, bends and valves — and it grows roughly as the SQUARE of "
      + "the flow, because it is driven by the velocity head ρv²/2.",
    formula: "Δp_system = ρ g Δz              (static — flat in Q)\n"
      + "          + ( f·L/D + ΣK ) · ρ v² / 2   (friction — grows ≈ Q²)\n"
      + "with   v = Q / A",
    note: "Roughly the square, not exactly: the minor-loss term is truly "
      + "quadratic, because ΣK is a constant, but the distributed friction "
      + "carries the friction factor f, and f falls slowly as the Reynolds "
      + "number rises — so the friction term grows a little less steeply "
      + "than Q².  In this case the static part is the elevation term "
      + "alone: the pipe model carries no terminal-pressure-difference term, "
      + "so an installation discharging into a pressurised vessel has a "
      + "static head this diagram does not include.",
  },
  {
    n: 3,
    title: "The pump curve: what THIS model delivers",
    body: "A real centrifugal pump's curve falls as flow rises — that shape "
      + "is the impeller's own characteristic, and it is MEASURED on a test "
      + "rig, not derived.  The curve on this page falls too, but for a "
      + "different reason, and the difference matters: the pump model here "
      + "is given a fixed shaft power and a fixed efficiency, so the "
      + "pressure rise is whatever that power buys when it is spread over "
      + "the volume passing through.  Twice the flow, half the rise.",
    formula: "Δp_pump = η · W_shaft / Q        (Q = volumetric flow)",
    note: "So the falling line below is a constant-shaft-power hyperbola of "
      + "the MODEL, never a manufacturer's tested H(Q) curve, and the plot "
      + "says so beside itself.  Because η is a declared constant here and "
      + "not a curve, there is no best-efficiency point on this diagram "
      + "either: a real pump is efficient over a band and poor outside it, "
      + "and choosing an operating point is partly about landing in that "
      + "band.  If the case had specified the pump by P_out or dP instead, "
      + "the line would come out FLAT — a specification echoed back rather "
      + "than a characteristic — and the tool greys it and says that too.",
  },
  {
    n: 4,
    title: "Moving the operating point: throttle the system, or change the machine",
    body: "There are two places to push, and they cost wildly different "
      + "amounts.  THROTTLING closes a valve, which raises ΣK: the system "
      + "curve steepens, the crossing slides LEFT to a lower flow at a "
      + "higher pressure, and the head the valve eats is destroyed — "
      + "dissipated as heat in the liquid.  You still pay the pump for it.  "
      + "CHANGING SPEED moves the PUMP curve instead, and the affinity "
      + "laws relate one speed to another: the flow follows the speed, the "
      + "head follows its square, and the power follows its CUBE.  That "
      + "cube is the whole argument for variable-speed drives — head a "
      + "throttle destroys is head the pump never has to produce in the "
      + "first place.",
    formula: "throttle:  ΣK ↑   →  system curve steepens  →  Q* falls\n"
      + "affinity:  Q ∝ N        H ∝ N²        P ∝ N³",
    note: "NEITHER move is computed on this page, and the difference is "
      + "worth being precise about.  There is no valve knob: a throttle "
      + "raises ΣK, and although the classroom case declares a globe valve, "
      + "no knob "
      + "reaches its K — the panel steepens the system curve by shrinking D "
      + "or lengthening L instead, which moves the crossing the same way "
      + "through a different mechanism.  And this pump model has NO SPEED "
      + "at all — W_shaft is shaft power, not rpm — so the affinity laws "
      + "above are stated and never evaluated.  Nothing you see on the plot "
      + "is an affinity-law prediction.  Be careful with the cube even away "
      + "from this page: it relates HOMOLOGOUS points on the pump's own "
      + "curves, and it carries over to the installation's operating point "
      + "only when the system curve passes through the origin — all "
      + "friction, no static head.  With a static lift the crossing does "
      + "not slide along an affinity parabola, and the saving is smaller "
      + "than the cube suggests.  Still real; still smaller.",
  },
  {
    n: 5,
    title: "NPSH: the separate question that can stop the whole thing",
    body: "A good operating point is not enough, because cavitation is "
      + "decided somewhere else entirely — on the SUCTION side, before the "
      + "impeller.  The NPSH AVAILABLE is how much head the liquid arrives "
      + "with above its own vapour pressure, and it FALLS as flow rises, "
      + "because the suction line's friction grows with flow.  The NPSH "
      + "REQUIRED is the pump's own property, measured by its maker, and it "
      + "RISES with flow.  Where those two cross, the liquid flashes to "
      + "vapour in the eye of the impeller and the bubbles collapse against "
      + "the blades: the pump stops delivering the curve it was chosen on, "
      + "it gets noisy, and it erodes.  None of that is visible in a "
      + "pump-versus-system diagram, however good the crossing looks.",
    formula: "NPSH_a = (P_suction − P_vap)/(ρ g) + z_suction − h_f,suction   (falls with Q)\n"
      + "NPSH_r = the pump's own, measured                                (rises with Q)\n"
      + "cavitation when   NPSH_a ≤ NPSH_r",
    note: "Choupo computes NONE of this, and the page will not pretend "
      + "otherwise: no unit in the engine publishes an NPSH of either kind, "
      + "the pump model carries no suction geometry, and it never checks its "
      + "inlet against the liquid's vapour pressure.  The three lines above "
      + "are a question you have to answer somewhere else.  This diagram "
      + "cannot fail you on it — which is exactly what makes it dangerous "
      + "to read on its own.",
  },
];

export const PUMP_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "not-a-manufacturer-curve",
    title: "The pump curve is a MODEL, not a datasheet.",
    body: "Δp = η·W_shaft/Q is the constant-shaft-power characteristic of "
      + "Choupo's pump model. A real machine's H(Q) is measured on a test "
      + "rig and has its own shape; the two agree only in falling. Nothing "
      + "here is fitted to, or checked against, a tested curve.",
  },
  {
    id: "no-npsh",
    title: "No NPSH, no cavitation check, anywhere in the engine.",
    body: "Neither NPSH available nor NPSH required is computed or "
      + "published by any unit. The pump model has no suction geometry and "
      + "never compares its inlet pressure with the liquid's vapour "
      + "pressure. A crossing on this diagram is silent about whether the "
      + "pump can actually run there.",
  },
  {
    id: "constant-efficiency",
    title: "η is a declared constant, so there is no best-efficiency point.",
    body: "The case states one efficiency and the model uses it at every "
      + "flow. A real pump's efficiency is a curve that peaks at the BEP and "
      + "falls away either side, which is half of what makes a pump the "
      + "right or wrong choice for a duty. That curve does not exist here, "
      + "so neither does any efficiency-versus-flow reading.",
  },
  {
    id: "no-affinity-laws",
    title: "No speed and no impeller diameter, so the affinity laws are unreachable.",
    body: "The model's inputs are shaft power and efficiency; rotational "
      + "speed and impeller size appear nowhere. Q ∝ N, H ∝ N² and P ∝ N³ "
      + "are stated in the lesson as the reason variable speed beats "
      + "throttling, and are never evaluated by this page. Turning W_shaft "
      + "down is not the same experiment as slowing the pump.",
  },
  {
    id: "static-head-is-elevation-only",
    title: "The static head here is ρgΔz alone.",
    body: "The pipe model's static term is the elevation change. There is no "
      + "terminal-pressure-difference term, so an installation pumping into "
      + "a vessel held above or below the suction pressure has a static head "
      + "this system curve does not contain. Suction and discharge vessel "
      + "pressures are not part of the model.",
  },
  {
    id: "no-valve-knob",
    title: "Throttling is emulated, not actuated.",
    body: "A throttle raises ΣK. The case declares its fittings — elbows and "
      + "a globe valve — but no knob reaches their K, so the panel steepens "
      + "the system curve by shrinking the diameter or lengthening the pipe "
      + "instead. The crossing moves the same way; the mechanism on the "
      + "screen is not the mechanism in the plant.",
  },
  {
    id: "fixed-sweep-window",
    title: "The swept flow window is fixed, and the view never extrapolates.",
    body: "The witness's outerDict declares its flow range as a LIST, which "
      + "the scalar-override channel the knobs ride cannot rewrite (v1). "
      + "Push the knobs far enough and the crossing leaves the window: the "
      + "tool then says there is no crossing inside it rather than "
      + "extrapolating one.",
  },
  {
    id: "steady-incompressible-liquid",
    title: "Steady state, single-phase, incompressible liquid.",
    body: "Both curves are families of converged steady solves. Start-up, "
      + "valve slam, water hammer, surge and any transient at all are "
      + "outside this picture, and so is a compressible or two-phase "
      + "suction — the pump model's own closed form assumes an "
      + "incompressible liquid.",
  },
];
