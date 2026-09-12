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
  The Bode-diagram lesson, as DATA, so the arithmetic it claims can be
  recomputed against the tool's own `bodeMath` in tests/bodeLesson.test.ts —
  a page must not teach against its own code.

  THE SPINE.  A Bode diagram is not a plot of a signal; it is a plot of a
  SYSTEM, one number per frequency, and it exists because a linear system
  answers a sinusoid with a sinusoid of the same frequency.  That sentence
  buys everything else on the page: the two axes, the four elements, the two
  crossovers and the two margins.

  THE HONESTY SPINE, which is the other half and must not be allowed to blur.
  Choupo integrates plants in the time domain and MEASURES a frequency
  response one frequency per run; it computes no transfer function, no
  margin, and no Bode curve for a controller.  Steps 1-4 are about the thing
  the engine does, and the page runs it.  Steps 5-8 are classical arithmetic
  drawn in the browser, and the page says so at the top of that section in
  those words.  Every claim about the engine below carries the file and line
  that makes it true.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

export const BODE_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A linear system answers a sinusoid with a sinusoid",
    body: "Push a process with a steady sine wave and wait.  The start-up "
      + "transient dies away, and what is left at the outlet is a sine wave "
      + "of THE SAME FREQUENCY — never a different one, never a distorted "
      + "shape.  Only two things about it have changed: how big the swing "
      + "is, and how far behind the input it runs.  That is what LINEAR "
      + "buys you, and it is the entire premise of the diagram.  Two "
      + "numbers per frequency; sweep the frequency and you have two "
      + "curves.  Those two curves ARE the Bode diagram.",
    derivation: [
      { step: "Drive one inlet with a sinusoid.  This is a real experiment, "
          + "not a thought experiment: Choupo's `sinusoidal` signal writes "
          + "exactly this onto a manipulated variable "
          + "(src/control/signal/Signals.H:124).",
        eq: "u(t) = mean + A·sin(ω·t)" },
      { step: "Integrate the plant until the free response has decayed, then "
          + "look at the outlet.  It is a sinusoid at the same ω, so it can "
          + "be written with just two unknowns.",
        eq: "y(t) = mean_out + A·AR·sin(ω·t + φ)" },
      { step: "Those two unknowns are what a Bode diagram plots, each "
          + "against ω on a logarithmic axis.  Nothing else about the "
          + "response is needed, because nothing else about it can differ." },
    ],
    formula: "in    u(t) = mean + A·sin(ω·t)\n"
      + "out   y(t) = mean_out + A·AR·sin(ω·t + φ)      (transient gone)",
    where: [
      { sym: "u", means: "the INPUT signal — the manipulated variable the "
        + "experiment drives (here a tracer feed rate)" },
      { sym: "y", means: "the OUTPUT signal — the measured response (here "
        + "the outlet tracer flow)" },
      { sym: "t", means: "time", unit: "s" },
      { sym: "A", means: "the amplitude of the input swing, in the input's "
        + "own units — half the peak-to-peak" },
      { sym: "mean / mean_out", means: "the steady values the input and the "
        + "output oscillate about; a Bode diagram is about the SWING, and "
        + "these drop out of it" },
      { sym: "ω", means: "ANGULAR FREQUENCY of the drive — ω = 2π·f, and the "
        + "x-axis of both curves", unit: "rad/s" },
      { sym: "AR", means: "the AMPLITUDE RATIO — the output swing divided by "
        + "the input swing.  The magnitude curve" },
      { sym: "φ", means: "the PHASE — how far the output sinusoid is shifted "
        + "relative to the input.  NEGATIVE means the output runs BEHIND: a "
        + "lag.  The phase curve", unit: "rad (drawn in degrees)" },
    ],
    note: "This is why the diagram is worth learning even though nothing in "
      + "a chemical plant is exactly linear: around a steady operating "
      + "point, over a small enough swing, almost everything is — and a "
      + "control loop is precisely a machine for keeping a plant near one "
      + "operating point with small swings.",
  },
  {
    n: 2,
    title: "Why both axes are logarithmic, and what a decibel is",
    body: "Two reasons, and the second is the one that matters.  A process, "
      + "a valve, a sensor and a controller sit in SERIES, and their "
      + "amplitude ratios MULTIPLY while their phases ADD.  Take the "
      + "logarithm of the magnitude and multiplication becomes addition too: "
      + "on log axes a whole loop is drawn by STACKING its blocks, which is "
      + "the only reason the diagram is usable with a pencil.  The second "
      + "reason is range: a loop that matters spans three or four decades of "
      + "frequency and several of magnitude, and neither fits on a linear "
      + "axis.",
    derivation: [
      { step: "Blocks in series multiply their magnitudes and add their "
          + "phases — that is what a complex product is.",
        eq: "|G₁·G₂| = |G₁|·|G₂|          ∠(G₁·G₂) = ∠G₁ + ∠G₂" },
      { step: "So take 20·log10 of the magnitude and it adds as well.  The "
          + "factor 20 (not 10) is historical, from power ratios; what "
          + "matters here is only that it is a FIXED multiple of the "
          + "logarithm.",
        eq: "dB = 20·log10(AR)" },
      { step: "Two landmarks worth memorising, both recomputable on any "
          + "calculator: unity is the zero of the axis, and a halving of "
          + "the swing is about −6 dB.",
        eq: "AR = 1     → 20·log10(1)  = 0 dB\n"
          + "AR = 1/√2  → 20·log10(0.70711) = −3.0103 dB\n"
          + "AR = 1/2   → 20·log10(0.5)     = −6.0206 dB" },
    ],
    formula: "dB = 20·log10(AR)",
    where: [
      { sym: "dB", means: "DECIBEL — the magnitude axis, 20·log10 of the "
        + "amplitude ratio.  0 dB is a system that passes the swing "
        + "unchanged; negative is attenuation" },
      { sym: "G", means: "the system's response at one frequency, as a "
        + "complex number: its magnitude is AR and its angle is φ.  G₁ and "
        + "G₂ are two blocks in series" },
      { sym: "decade", means: "a factor of ten in frequency.  Slopes on this "
        + "diagram are quoted in dB per decade" },
    ],
    note: "A DECADE is a factor of ten in frequency, and it is the unit the "
      + "horizontal axis is ruled in.  A slope of −20 dB/decade means the "
      + "output swing falls by a factor "
      + "of ten for every factor of ten in frequency.  Recognising the two "
      + "or three slopes a chemical loop actually produces is most of what "
      + "reading a Bode diagram by eye consists of.",
  },
  {
    n: 3,
    title: "The first-order lag, derived from the tank the engine integrates",
    body: "A stirred tank at constant volume, fed a tracer.  This is the one "
      + "element on this page that Choupo can MEASURE, so it is the one "
      + "worth deriving properly — and the derivation starts from the "
      + "engine's own equation, not from a transfer function someone wrote "
      + "down.  The unit integrates dn/dt = F·z_in − F·(n/Σn) with the "
      + "outflow equal to the inflow "
      + "(src/unitOperations/dynamic/DynamicCSTR.cpp:556-559).",
    derivation: [
      { step: "Write that balance for the tracer alone, in mole fraction, "
          + "with the total inventory N and the flow F both constant "
          + "(the witness case holds F fixed by SUBSTITUTING tracer for "
          + "carrier, so the tank's residence time cannot move with the "
          + "experiment).",
        eq: "N·dx/dt = F·x_in − F·x" },
      { step: "Divide by F.  The group that appears is the residence time — "
          + "the same one the unit computes for itself at "
          + "src/unitOperations/dynamic/DynamicCSTR.cpp:377.",
        eq: "τ = N/F          τ·dx/dt + x = x_in" },
      { step: "Now feed it the sinusoid of step 1 and look for a sinusoidal "
          + "answer of the same frequency: x = AR·sin(ω·t + φ).  "
          + "Differentiate, substitute, and match the sin and cos parts.",
        eq: "x_in = sin(ω·t)   ⇒   τ·ω·AR·cos(ω·t + φ) + AR·sin(ω·t + φ) = sin(ω·t)" },
      { step: "Matching gives two equations in AR and φ; solving them is the "
          + "whole content of the first-order Bode curve.  Written in "
          + "complex form (substitute x_in = exp(i·ω·t) in the same ODE) it "
          + "is one line.",
        eq: "G(i·ω) = 1/(1 + i·ω·τ)" },
      { step: "Take the magnitude and the angle of that complex number.",
        eq: "AR = 1/√(1 + (ω·τ)²)          φ = −arctan(ω·τ)" },
    ],
    formula: "τ = N/F\n"
      + "G(i·ω) = 1/(1 + i·ω·τ)\n"
      + "AR = 1/√(1 + (ω·τ)²)          φ = −arctan(ω·τ)",
    where: [
      { sym: "N", means: "the total molar inventory held in the tank — what "
        + "the case declares as `holdupMolar`", unit: "kmol" },
      { sym: "F", means: "the molar flow through the tank, in at the feed "
        + "and out at the outlet (constant volume, so the two are equal)",
        unit: "kmol/s" },
      { sym: "x / x_in", means: "the tracer's mole fraction inside the tank "
        + "(= at the outlet, because it is well mixed) and in the feed" },
      { sym: "τ", means: "the TIME CONSTANT — here the residence time N/F.  "
        + "It is the only thing about this plant the diagram depends on",
        unit: "s" },
      { sym: "i", means: "the imaginary unit; substituting s = i·ω into a "
        + "transfer function is what turns it into a frequency response" },
      { sym: "s", means: "the Laplace variable.  A lag is 1/(τ·s + 1); "
        + "everything on this page is that object evaluated at s = i·ω" },
    ],
    note: "Two things follow that a student should carry away.  The answer "
      + "depends on ω and τ only through their PRODUCT, so every "
      + "first-order lag in the world has the same curve, slid along the "
      + "frequency axis by its own τ — which is exactly what the τ knob "
      + "below does to the measured points.  And the magnitude can never "
      + "exceed 1: a single tank cannot amplify a swing.",
  },
  {
    n: 4,
    title: "The corner, and the two asymptotes that meet at it",
    body: "Sketching a first-order lag by hand takes three facts.  Far below "
      + "the corner the tank follows the input faithfully and the magnitude "
      + "is flat at 0 dB with no lag.  Far above it, the tank averages the "
      + "input away: the magnitude falls at −20 dB per decade and the phase "
      + "sits at −90°.  The corner is at ω·τ = 1, where the two asymptotes "
      + "cross — and the true curve passes 3 dB below that crossing, with "
      + "exactly half the total phase spent.",
    formula: "ω·τ ≪ 1     AR → 1            0 dB           φ →   0°\n"
      + "ω·τ = 1     AR = 1/√2      −3.0103 dB     φ = −45°\n"
      + "ω·τ ≫ 1     AR → 1/(ω·τ)   −20 dB/decade  φ → −90°",
    where: [
      { sym: "corner frequency", means: "ω = 1/τ, where the two asymptotes "
        + "meet.  A tank with a 240 s residence time corners at "
        + "1/240 = 4.167e-3 rad/s", unit: "rad/s" },
    ],
    note: "Read the three lines the other way and they are a measurement "
      + "recipe: find the frequency at which the swing has fallen to 0.707 "
      + "of its low-frequency value, and its reciprocal is the time "
      + "constant.  The −45° point gives the same answer independently, "
      + "which is why publishing both curves is worth the paper.",
  },
  {
    n: 5,
    title: "The other three elements, by sight",
    body: "A chemical loop is almost always a product of four kinds of "
      + "block, and a reader who can recognise each by its slope and its "
      + "phase can sketch the whole loop without arithmetic.  A GAIN moves "
      + "the magnitude curve up or down bodily and does nothing at all to "
      + "the phase — which is what makes it the knob a margin is bought and "
      + "sold with.  An INTEGRATOR (a level in a tank with a pump on the "
      + "outlet, a batch temperature under constant heating) falls at −20 "
      + "dB/decade everywhere and holds a flat −90°.  A DEAD TIME (a pipe "
      + "run, a belt, an analyser cycle) is the dangerous one: its "
      + "magnitude is EXACTLY one at every frequency — it hides completely "
      + "from the magnitude curve — while its phase falls without bound.",
    formula: "gain        K              |G| = K          slope  0        ∠G = 0\n"
      + "lag         1/(τ·s+1)      |G| = 1/√(1+(ω·τ)²)  →−20 dB/dec  0 → −90°\n"
      + "integrator  1/s            |G| = 1/ω        −20 dB/dec  ∠G = −90°\n"
      + "dead time   exp(−θ·s)      |G| = 1          slope  0    ∠G = −ω·θ",
    where: [
      { sym: "K", means: "the STEADY-STATE GAIN of the process — how far the "
        + "output finally moves per unit of sustained input change.  The "
        + "engine identifies one from a step response and publishes it "
        + "(src/propertyOps/ReactionCurve.H:221)" },
      { sym: "θ", means: "DEAD TIME — a pure delay: nothing happens at all "
        + "for θ seconds, then the response begins", unit: "s" },
    ],
    note: "The dead time's phase, −ω·θ radians, is linear in ω, so on a "
      + "logarithmic frequency axis it plunges ever more steeply and passes "
      + "−180° and −360° and keeps going.  A loop with a dead time can "
      + "therefore always be destabilised by turning the gain up far "
      + "enough, and no amount of derivative action repeals it.  Choupo has "
      + "NO unit operation that models a transport delay, so unlike the "
      + "lag above this curve has no engine answer to be checked against.",
  },
  {
    n: 6,
    title: "The controller is a block too",
    body: "A PID controller has a frequency response like anything else, "
      + "and reading it explains the two things students are told to "
      + "memorise.  INTEGRAL action is huge at low frequency (it is what "
      + "kills offset) and contributes −90° of phase there — it is the term "
      + "that destabilises.  DERIVATIVE action grows at high frequency and "
      + "contributes up to +90° — it is the term that buys phase back, and "
      + "the term that amplifies measurement noise, for the same reason.  "
      + "Between them lies a band where the two cancel and the controller "
      + "is a pure gain.",
    derivation: [
      { step: "The textbook ideal form — the one every published tuning rule "
          + "is written in.",
        eq: "G_c(s) = K_c·(1 + 1/(τ_I·s) + τ_D·s)" },
      { step: "Substitute s = i·ω.  1/i = −i, so the integral term is "
          + "negative imaginary and the derivative term positive imaginary: "
          + "they sit on the SAME axis and subtract.",
        eq: "G_c(i·ω) = K_c·(1 + i·(ω·τ_D − 1/(ω·τ_I)))" },
      { step: "Magnitude and angle follow at once.  The bracket is purely "
          + "real — the controller contributes no phase at all — exactly "
          + "where the two terms cancel, at ω = 1/√(τ_I·τ_D).",
        eq: "|G_c| = K_c·√(1 + (ω·τ_D − 1/(ω·τ_I))²)\n"
          + "∠G_c = arctan(ω·τ_D − 1/(ω·τ_I))" },
      { step: "Choupo's PID is written in the PARALLEL form, and the engine "
          + "states the conversion itself, in the refusal it raises when a "
          + "case declares the textbook spelling in the dict "
          + "(src/control/PIDController.cpp:75).",
        eq: "K_p = K_c          K_i = K_c/τ_I          K_d = K_c·τ_D" },
    ],
    formula: "G_c(i·ω) = K_c·(1 + i·(ω·τ_D − 1/(ω·τ_I)))\n"
      + "K_p = K_c     K_i = K_c/τ_I     K_d = K_c·τ_D",
    where: [
      { sym: "G_c", means: "the CONTROLLER's response at one frequency" },
      { sym: "K_c", means: "controller GAIN in the textbook form — the "
        + "proportional action" },
      { sym: "τ_I", means: "INTEGRAL TIME: how long the integral term takes "
        + "to repeat the proportional action.  Small τ_I is aggressive "
        + "integral action", unit: "s" },
      { sym: "τ_D", means: "DERIVATIVE TIME — how far ahead the derivative "
        + "term extrapolates", unit: "s" },
      { sym: "K_p / K_i / K_d", means: "the three gains Choupo's dict "
        + "actually declares, in the parallel form u = u_bias + K_p·e + "
        + "K_i·∫e·dt − K_d·d(PV)/dt (src/control/PIDController.cpp:123-127)",
        unit: "K_p [-], K_i [1/s], K_d [s]" },
    ],
    note: "What is drawn here is the IDEAL derivative term.  The controller "
      + "the engine runs differentiates the MEASURED variable over one time "
      + "step, not the error (src/control/PIDController.cpp:115-120), which is a "
      + "different object at high frequency and has no set-point response "
      + "at all.  It also freezes its integral when the actuator saturates "
      + "(src/control/PIDController.cpp:135), which is not a linear "
      + "operation and therefore has no "
      + "frequency response whatsoever.  A Bode diagram is a statement "
      + "about the LINEAR part of a loop.",
  },
  {
    n: 7,
    title: "The open loop, and the two crossover frequencies",
    body: "Everything about stability is read from one object: the OPEN "
      + "loop — what a signal meets going once round the ring with the "
      + "feedback connection cut.  Multiply the blocks (add them on this "
      + "diagram) and ask a single question.  If a disturbance at some "
      + "frequency comes back round with its phase inverted, the negative "
      + "feedback has become positive; if it also comes back at least as "
      + "big as it left, it grows each lap and the loop oscillates.  So two "
      + "frequencies matter, and each is read off one curve and answered on "
      + "the other.",
    formula: "L(i·ω) = G_c(i·ω) · G_p(i·ω)\n"
      + "gain crossover    |L(ω_c)| = 1   (0 dB)     ⇒   PM = 180° + ∠L(ω_c)\n"
      + "phase crossover   ∠L(ω_u) = −180°          ⇒   GM = 1/|L(ω_u)|",
    where: [
      { sym: "L", means: "the OPEN-LOOP response: controller times process "
        + "times everything else in the ring (valve, sensor, delay)" },
      { sym: "G_p", means: "the PROCESS response — the plant as the "
        + "controller sees it, from manipulated variable to measurement" },
      { sym: "ω_c", means: "the GAIN crossover frequency, where the "
        + "open-loop magnitude passes through 1.  The phase margin is read "
        + "here", unit: "rad/s" },
      { sym: "ω_u", means: "the PHASE crossover frequency, where the "
        + "open-loop phase passes through −180°.  The gain margin is read "
        + "here.  It is also the frequency at which the loop would "
        + "oscillate", unit: "rad/s" },
      { sym: "PM", means: "PHASE MARGIN — how many more degrees of lag the "
        + "loop could take at ω_c before the phase reached −180°", unit: "°" },
      { sym: "GM", means: "GAIN MARGIN — the factor by which the loop gain "
        + "could be multiplied before the magnitude reached 1 at ω_u.  "
        + "Often quoted in dB" },
    ],
    note: "Both margins answer 'how much room is there', and they answer it "
      + "in two different currencies because the two ways a loop is "
      + "surprised are different.  The gain margin covers a valve that is "
      + "twice as effective as the datasheet said; the phase margin covers "
      + "a sample time, a filter or a fouling layer that nobody put in the "
      + "model.  The classroom targets — roughly 30° to 45° of phase and a "
      + "factor of 2 in gain — are conventions, not theorems.",
  },
  {
    n: 8,
    title: "What the criterion assumes, and where it stops being true",
    body: "The reading above is the Bode form of the Nyquist stability "
      + "criterion, and it is a SPECIAL CASE with conditions.  It holds "
      + "when the open loop is itself stable and its phase crosses −180° "
      + "once, falling.  Give the loop a resonance, or an unstable open "
      + "loop (an exothermic reactor held on the middle steady state), or "
      + "a magnitude curve that touches 0 dB three times, and the simple "
      + "reading can say 'stable' about a loop that is not.  The general "
      + "statement is Nyquist's, and it counts encirclements rather than "
      + "reading two numbers.",
    where: [
      { sym: "margin", means: "a DISTANCE from a boundary, never a promise "
        + "of good behaviour: a loop can have 45° of phase margin and still "
        + "ring unacceptably, and the diagram will not tell you so" },
    ],
    note: "This is also why the interactive below draws the margins with "
      + "both crossover frequencies marked rather than printing a verdict.  "
      + "The page's job is to show you where the two numbers come from; "
      + "whether they are enough for your plant is a judgement, and it is "
      + "yours.",
  },
];

export const BODE_LIMITS: readonly LessonLimit[] = [
  {
    id: "no-frequency-domain",
    title: "Choupo computes no transfer function, and no margin.",
    body: "Searched across src/ on 2026-09-12: nothing in the engine "
      + "evaluates a transfer function, a Nyquist plot, a gain margin or a "
      + "phase margin.  What the engine has is a time integrator and the "
      + "`frequencyResponse {}` experiment, which MEASURES one point of a "
      + "Bode diagram per run "
      + "(src/applications/choupoCtrl/main.cpp:1530-1577).  The measured "
      + "curve on this page is that experiment, swept.  The constructed "
      + "curve, the elements and both margins are classical arithmetic "
      + "drawn in the browser and are not an engine answer.",
  },
  {
    id: "one-judged-element",
    title: "Only the first-order lag is checked against the engine.",
    body: "The measured points are laid on the constructed first-order "
      + "curve, so that element is verified on screen at every run.  The "
      + "integrator, the dead time and the PID have NO engine answer in "
      + "this tree to be checked against — no unit operation models a "
      + "transport delay, and the controller's own frequency response is "
      + "not computed anywhere.  Their curves are the textbook closed "
      + "forms, and that is all they are.",
  },
  {
    id: "linear-only",
    title: "A Bode diagram is a statement about a linearised plant.",
    body: "The witness tank is rigorously linear in the tracer, which is "
      + "why the engine's fit residual is so small — and that is the "
      + "unusual case, arranged deliberately so the comparison means "
      + "something.  A real loop is linear only near an operating point "
      + "and over a small swing.  Saturation, a valve's characteristic and "
      + "the controller's own anti-windup are all outside this description "
      + "entirely.",
  },
  {
    id: "measured-bias",
    title: "The measurement has a phase lag of its own, and it is not removed.",
    body: "The fit reads accepted states on a time grid, which lags the "
      + "continuous answer by half a step: exactly ω·Δt/2 radians.  Here Δt "
      + "is set to the drive period over 1000, so that bias is π/1000 = "
      + "3.1416e-3 rad = 0.18° at EVERY point of the sweep.  It is printed "
      + "beside the residual and deliberately not corrected away — a "
      + "measurement system's own contribution is part of what a student "
      + "should learn to look for.",
  },
  {
    id: "no-closed-loop-run",
    title: "The tuned loop is not simulated here.",
    body: "The margins are read off the construction.  Nothing on this page "
      + "closes the loop and integrates it, so nothing here confirms that "
      + "the settings you chose behave as the margins suggest.  Choupo does "
      + "run closed loops — that is what `choupoCtrl` and the PID are for "
      + "(tutorials/ctrl/) — and where the three numbers K, τ and θ should "
      + "come from is the engine's own step-response identification, the "
      + "`reactionCurve` property operation "
      + "(src/propertyOps/ReactionCurve.H), which also publishes three "
      + "cited tuning rules and their disagreement.",
  },
  {
    id: "theory-guide-gap",
    title: "The Theory Guide has no frequency-response chapter.",
    body: "Every EduTool names a Theory Guide destination; this one points "
      + "at the PID chapter (ch:pid), which derives the controller whose "
      + "three terms are drawn above, and at nothing about Bode diagrams, "
      + "because docs/theoryGuide.tex contains no such section.  The "
      + "derivations above are therefore this page's own, with no formal "
      + "treatment behind them to check them against.  Stated rather than "
      + "left for a reader to discover by following the link.",
  },
];
