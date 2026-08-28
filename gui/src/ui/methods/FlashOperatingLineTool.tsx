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
  FlashOperatingLineTool -- the single stage, and the line that solves it.

  WHY THIS IS FIRST.  Until it existed the EduTools list went straight from
  "what is a temperature" to McCabe-Thiele: the student met the STAIRCASE
  before ever meeting one STEP.  A flash is that step -- one equilibrium
  curve, one material balance drawn as a straight line, and their intersection
  is the answer.  Kremser, Rayleigh and Hunter-Nash are the same idea on other
  axes; McCabe-Thiele is this construction repeated down a column.

  ZERO PHYSICS IN THIS FILE, and almost none in the module under it.  The
  engine computes the equilibrium curve (a propertyScan1D of T_bubble and
  y_eq over x); `case/binaryFlash.ts` does the graphical construction on those
  rows -- interpolation, inversion, the lever rule, the operating line.  A
  binary flash at frozen P has a frozen curve (Duhem: two of {T, P, V/F} fix
  it), so the composition and vapour-fraction knobs are pure redraws, while
  the PRESSURE knob re-runs the engine because it moves the curve itself.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { lessonStepper } from "./lessonStep.js";
import { Alert, Badge, Box, Group, Loader, Slider, Stack, Text, Title }
  from "@mantine/core";

import {
  eqCurveFromTxyCsv, flashAtVF, leverSegments, operatingLine,
  type EqCurve, type FlashSolution,
} from "../../case/binaryFlash.js";
import { useMethodRun } from "../../case/methodRun.js";
import { KnobField } from "./knobPanel.js";

const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const GRID = "var(--mantine-color-default-border)";
const ACCENT = "var(--mantine-primary-color-filled)";
const HOT = "#e8590c";

/** The bundled case whose ONLY job is to publish the equilibrium curve. */
export const FLASH_WITNESS = "props/molecular/flash01_operating_line";
export const FLASH_CSV = "txy.csv";
const PROPS_DICT = "system/propsDict";

/** The engine's own answer for this pair, from a DIFFERENT case that actually
 *  flashes it (tutorials/steady/flash/flash01_benzene_toluene at 370 K, 1 bar,
 *  z = 0.40).  It is the check on the construction: the geometry on this page
 *  must land where the solver did. */
export const ENGINE_CHECK =
  { z: 0.40, T_K: 370.0, P_bar: 1.0, VF: 0.30398357314 } as const;

/** The lesson, as data, so a test can assert the argument still runs end to
 *  end.  Prose is the part of a tool that rots with nothing failing. */
export const FLASH_STEPS: readonly {
  n: number; title: string; body: string; formula?: string; note?: string;
}[] = [
  {
    n: 1,
    title: "One stage, and everything else is this repeated",
    body: "Heat a liquid mixture until part of it boils, let the two phases "
      + "come to equilibrium, and take them away separately.  That is a "
      + "flash: the simplest separation there is, and one drum on a P&ID.  "
      + "Everything harder — a column, an absorber, an extraction cascade — "
      + "is this same step performed again and again, so it is worth being "
      + "able to draw it before drawing anything else.",
  },
  {
    n: 2,
    title: "Two things are true at once, and each is a curve",
    body: "EQUILIBRIUM says what vapour a given liquid makes: y*(x), which "
      + "the engine computes from the thermodynamics and which knows nothing "
      + "about how much feed you have.  The MATERIAL BALANCE says the feed "
      + "must be shared out: whatever leaves as liquid plus whatever leaves "
      + "as vapour is what came in.  Neither alone gives an answer.  Both at "
      + "once give exactly one.",
    formula: "F·z = L·x + V·y",
  },
  {
    n: 3,
    title: "The balance is a straight line, and it pivots on the feed",
    body: "Divide the balance by F and let ψ = V/F be the vapour fraction.  "
      + "The result is a line — and two things about it do all the teaching.  "
      + "It passes through (z, z), a point ON THE DIAGONAL, no matter what ψ "
      + "is: the line PIVOTS about the feed.  And its slope is −L/V, the "
      + "phase ratio itself.",
    formula: "y = −((1−ψ)/ψ)·x + z/ψ      through (z, z),  slope −L/V",
    note: "ψ → 0 turns it VERTICAL (nothing has boiled: the liquid is the "
      + "feed — the bubble point).  ψ → 1 turns it HORIZONTAL (everything has "
      + "boiled: the vapour is the feed — the dew point).  Between those two "
      + "the line sweeps out every split the drum can produce.",
  },
  {
    n: 4,
    title: "Where they cross is the answer",
    body: "The intersection of the operating line with the equilibrium curve "
      + "is the only state that satisfies both, so it IS the flash: read x "
      + "off the horizontal axis for the liquid, y off the vertical for the "
      + "vapour.  And the feed pivot splits the segment between them in the "
      + "ratio of the two products — the LEVER RULE, which is the material "
      + "balance read as a length.",
    formula: "V/F = (z − x) / (y − x)",
    note: "That intersection is Rachford-Rice, solved with a ruler.  The "
      + "engine solves the same equation numerically and gets the same point "
      + "— which is what the check below compares.",
  },
];

/** The limits, all of them, in one home. */
export const FLASH_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "binary",
    title: "BINARY ONLY. The operating line is a line only for two components.",
    body: "With three or more there is no x–y plane to draw it in, the "
      + "intersection stops being a picture, and Rachford-Rice has to be "
      + "solved as an equation rather than read off a page. Everything about "
      + "the IDEA survives — equilibrium and the balance, both at once — but "
      + "the construction does not. Do not leave this page thinking a "
      + "multicomponent flash is a drawing.",
  },
  {
    id: "ideal",
    title: "This pair is IDEAL and monotone, chosen so the curve does not fight the lesson.",
    body: "Benzene/toluene has no azeotrope: y*(x) stays above the diagonal "
      + "the whole way, so the only thing moving is the operating line. A "
      + "real non-ideal pair can cross the diagonal, and there the "
      + "construction still works but the reading changes completely — the "
      + "corpus carries those (props/compare/acetone04_acetone_water_vle). "
      + "An azeotropic curve is a better SECOND case and a worse first one.",
  },
  {
    id: "interp",
    title: "The construction interpolates LINEARLY between the engine's rows.",
    body: "51 points, straight segments between them, no spline — a spline "
      + "would overshoot near a sharp curvature and invent equilibrium the "
      + "engine never computed. So the sampling IS the resolution of every "
      + "number read off this diagram, and the deviation against the engine's "
      + "own flash below is the honest measure of it.",
  },
  {
    id: "isothermal",
    title: "Nothing here is an energy balance.",
    body: "The flash temperature is READ off the boiling locus at the "
      + "converged liquid composition; it is not obtained from a duty. A real "
      + "adiabatic flash solves the energy balance simultaneously and lands "
      + "at a different temperature — Choupo has that operation "
      + "(adiabaticFlash), and it is a different question from this one.",
  },
];

// ---- the drawing ------------------------------------------------------------

const PW = 560, PH = 470, ML = 62, MR = 22, MT = 18, MB = 52;
const sx = (x: number): number => ML + x * (PW - ML - MR);
const sy = (y: number): number => PH - MB - y * (PH - MT - MB);

function Diagram({ curve, sol, z, comp }: {
  curve: EqCurve; sol: FlashSolution; z: number; comp: string;
}): JSX.Element {
  const L = operatingLine(z, sol.VF);
  //  The operating line, clipped to the unit box.  Drawn from its two
  //  crossings of the frame rather than from x = 0 to 1, because at small ψ
  //  the intercept z/ψ is far above the box and a naive segment would leave
  //  the plot entirely.
  let ax = 0, ay = 0, bx = 1, by = 1;
  if (L.vertical) { ax = bx = z; ay = 0; by = 1; }
  else {
    const pts: { x: number; y: number }[] = [];
    for (const x of [0, 1]) {
      const y = L.m * x + L.b;
      if (y >= -1e-9 && y <= 1 + 1e-9) pts.push({ x, y });
    }
    for (const y of [0, 1]) {
      const x = (y - L.b) / L.m;
      if (x >= -1e-9 && x <= 1 + 1e-9) pts.push({ x, y });
    }
    if (pts.length >= 2) { ax = pts[0]!.x; ay = pts[0]!.y; bx = pts[1]!.x; by = pts[1]!.y; }
  }
  const eq = curve.x.map((x, i) => `${sx(x)},${sy(curve.yEq[i]!)}`).join(" ");
  const two = sol.regime === "two-phase";
  const tick = (v: number): string => v.toFixed(2);

  return (
    <svg viewBox={`0 0 ${PW} ${PH}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label={"Equilibrium diagram for a binary flash: the equilibrium "
        + "curve y*(x), the 45 degree diagonal, the operating line through "
        + "the feed point on the diagonal, and their intersection marking the "
        + "liquid and vapour compositions"}>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={sx(v)} y1={sy(0)} x2={sx(v)} y2={sy(1)} stroke={GRID}
            strokeWidth={0.5} />
          <line x1={sx(0)} y1={sy(v)} x2={sx(1)} y2={sy(v)} stroke={GRID}
            strokeWidth={0.5} />
          <text x={sx(v)} y={sy(0) + 16} textAnchor="middle" fontSize={10}
            fill={INK}>{tick(v)}</text>
          <text x={sx(0) - 8} y={sy(v) + 3.5} textAnchor="end" fontSize={10}
            fill={INK}>{tick(v)}</text>
        </g>
      ))}
      <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke={INK}
        strokeWidth={1} strokeDasharray="3 3" />
      <text x={sx(0.86)} y={sy(0.90)} fontSize={10} fill={INK}>y = x</text>

      <polyline points={eq} fill="none" stroke={ACCENT} strokeWidth={2} />
      <text x={sx(0.30)} y={sy(0.62)} fontSize={11} fill={ACCENT}>y*(x)</text>

      <line x1={sx(ax)} y1={sy(ay)} x2={sx(bx)} y2={sy(by)} stroke={HOT}
        strokeWidth={2} />
      <text x={sx(0.03)} y={sy(0.06)} fontSize={11} fill={HOT}>
        operating line
      </text>

      {/* the pivot: the feed, always on the diagonal */}
      <circle cx={sx(z)} cy={sy(z)} r={4.5} fill="none" stroke={TEXT}
        strokeWidth={1.6} />
      <text x={sx(z) + 8} y={sy(z) + 14} fontSize={10} fill={TEXT}>
        feed z = {z.toFixed(3)}
      </text>

      {two && (
        <g>
          <line x1={sx(sol.xLiq)} y1={sy(0)} x2={sx(sol.xLiq)} y2={sy(sol.yVap)}
            stroke={TEXT} strokeWidth={0.8} strokeDasharray="2 3" />
          <line x1={sx(0)} y1={sy(sol.yVap)} x2={sx(sol.xLiq)} y2={sy(sol.yVap)}
            stroke={TEXT} strokeWidth={0.8} strokeDasharray="2 3" />
          <circle cx={sx(sol.xLiq)} cy={sy(sol.yVap)} r={5} fill={HOT} />
          <text x={sx(sol.xLiq) + 9} y={sy(sol.yVap) - 7} fontSize={10.5}
            fill={TEXT}>
            x = {sol.xLiq.toFixed(3)}, y = {sol.yVap.toFixed(3)}
          </text>
        </g>
      )}

      <text x={(sx(0) + sx(1)) / 2} y={PH - 12} textAnchor="middle"
        fontSize={11} fill={TEXT}>
        x — liquid mole fraction of {comp}
      </text>
      <text x={16} y={(sy(0) + sy(1)) / 2} fontSize={11} fill={TEXT}
        transform={`rotate(-90 16 ${(sy(0) + sy(1)) / 2})`}
        textAnchor="middle">
        y — vapour mole fraction of {comp}
      </text>
    </svg>
  );
}

// ---- the page ---------------------------------------------------------------

export function FlashOperatingLineTool(): JSX.Element {
  const [z, setZ] = useState(0.40);
  const [vf, setVf] = useState(0.30);
  const [pBar, setPBar] = useState(1.0);

  //  `unit` is declared and CHECKED: the substitution keeps the dict's unit
  //  and replaces only the number, so a Pa value written into an `atm` slot
  //  would read 200000 atm and run happily.  Found on this tool's first test.
  const overrides = useMemo(() => [{
    file: PROPS_DICT, key: "P", value: pBar, occurrence: 1, unit: "bar",
  }], [pBar]);
  const run = useMethodRun(FLASH_WITNESS, overrides, String(pBar), "choupoProps");

  const curve = useMemo(
    () => eqCurveFromTxyCsv(run.result?.csvFiles?.[FLASH_CSV] ?? ""),
    [run.result]);
  const sol = useMemo(
    () => (curve ? flashAtVF(curve, z, vf) : null), [curve, z, vf]);
  const arms = sol ? leverSegments(sol) : null;

  const step = lessonStepper(FLASH_STEPS);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 860, margin: "0 auto" }}>

        <Box>
          <Title order={3}>The flash, and the line that solves it</Title>
          <Text size="sm" c={INK} mt={4}>
            The first graphical construction, and the one every other is built
            from.  Two facts about a drum, drawn as two curves; where they
            cross is the answer.
          </Text>
        </Box>

        {run.err && (
          <Alert color="red" variant="light" title="the engine refused">
            <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
              {run.err}
            </Text>
          </Alert>
        )}

        {step(1)}
        {step(2)}
        {step(3)}

        <Box>
          <Title order={5}>Turn the vapour fraction and watch it pivot</Title>
          <Text size="sm" mt={4}>
            The <strong>feed</strong> knob slides the pivot along the diagonal.
            The <strong>vapour fraction</strong> knob rotates the line about
            it — vertical at 0, horizontal at 1.  The{" "}
            <strong>pressure</strong> knob is the only one that re-runs the
            engine, because it is the only one that moves the equilibrium
            curve; the other two are geometry on a curve already computed.
          </Text>
        </Box>

        <Box style={{ display: "grid", gap: 14,
          gridTemplateColumns: "minmax(200px, 240px) 1fr" }}>
          <Stack gap={10}>
            <KnobField label={`feed z = ${z.toFixed(3)}`}>
              <Slider min={0.02} max={0.98} step={0.01} value={z}
                onChange={setZ} label={null} />
            </KnobField>
            <KnobField label={`vapour fraction V/F = ${vf.toFixed(2)}`}>
              <Slider min={0} max={1} step={0.01} value={vf} onChange={setVf}
                label={null} />
            </KnobField>
            <KnobField label={`pressure = ${pBar.toFixed(2)} bar`}>
              <Slider min={0.2} max={4} step={0.1} value={pBar}
                onChange={setPBar} label={null} />
            </KnobField>
            {run.busy && (
              <Group gap={6} wrap="nowrap">
                <Loader size="xs" />
                <Text size="xs" c={INK}>re-solving the curve…</Text>
              </Group>
            )}
            {sol && (
              <Stack gap={4}>
                <Badge variant="light" color="orange" tt="none">
                  T = {sol.T.toFixed(2)} K
                </Badge>
                <Badge variant="light" color="teal" tt="none">
                  bubble {sol.Tbubble.toFixed(1)} · dew {sol.Tdew.toFixed(1)} K
                </Badge>
                {arms && sol.regime === "two-phase" && (
                  <Badge variant="light" color="grape" tt="none">
                    lever V/F = {arms.vfFromArms.toFixed(3)}
                  </Badge>
                )}
              </Stack>
            )}
          </Stack>

          <Box style={{ minWidth: 0 }}>
            {curve && sol
              ? <Diagram curve={curve} sol={sol} z={z} comp={curve.comp} />
              : (
                <Text size="sm" c={INK}>
                  {run.busy ? "solving the equilibrium curve…"
                    : "the equilibrium curve has not arrived yet"}
                </Text>
              )}
          </Box>
        </Box>

        {sol && sol.regime !== "two-phase" && (
          <Alert variant="light" color="yellow"
            title="At this setting the feed does not split">
            <Text size="sm">
              {sol.regime === "all-liquid"
                ? "Nothing has boiled: the operating line is vertical, the "
                  + "liquid IS the feed, and there is no vapour to read.  This "
                  + "is the bubble point, and it is a limit of the "
                  + "construction rather than a failure of it."
                : "Everything has boiled: the line is horizontal, the vapour "
                  + "IS the feed, and there is no liquid to read.  This is the "
                  + "dew point."}
            </Text>
          </Alert>
        )}

        {step(4)}

        <Alert variant="light" title="Does the drawing agree with the solver?">
          <Text size="sm">
            The corpus carries the same pair flashed by the ENGINE — not by
            this construction — in{" "}
            <code>tutorials/steady/flash/flash01_benzene_toluene</code>: at{" "}
            {ENGINE_CHECK.T_K} K, {ENGINE_CHECK.P_bar} bar and z ={" "}
            {ENGINE_CHECK.z}, Rachford-Rice returns{" "}
            <strong>V/F = {ENGINE_CHECK.VF.toFixed(5)}</strong>.
          </Text>
          <Text size="sm" mt={6}>
            Set the knobs to that feed and vapour fraction and the intersection
            should land at that temperature.  Any gap is the price of reading a
            curve sampled at 51 points with straight lines between them — which
            is a property of the DRAWING, not of the physics, and is the
            honest thing this page can show you about its own method.
          </Text>
        </Alert>

        <Box>
          <Title order={5}>Why this comes first</Title>
          <Text size="sm" mt={4}>
            Look at what you just did: put one balance line on one equilibrium
            curve and read the intersection.  <strong>McCabe-Thiele is that
            step repeated down a column</strong> — a staircase between the
            same two curves, with the operating line replaced by one per
            section.  Kremser is the same idea on absorption axes;
            Hunter-Nash on a ternary triangle; the Rayleigh still is the same
            balance integrated in time.
          </Text>
          <Text size="sm" mt={6}>
            Meeting the staircase before the step is the usual way to learn
            this, and it is why so many students can draw McCabe-Thiele
            without being able to say what either line means.
          </Text>
        </Box>

        <Box>
          <Title order={5}>What this does not model</Title>
          <Box mt={4} style={{ display: "grid", columnGap: 16, rowGap: 6,
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            {FLASH_LIMITS.map((l) => (
              <Text key={l.id} size="xs" c={INK}>
                <b>{l.title}</b> {l.body}
              </Text>
            ))}
          </Box>
        </Box>

        <Text size="xs" c={TEXT}>
          Runs tutorials/{FLASH_WITNESS} in your browser.  The equilibrium
          curve is the engine’s; the operating line, the intersection and the
          lever rule are geometry on it, computed in{" "}
          <code>case/binaryFlash.ts</code> and nowhere else.
        </Text>
      </Stack>
    </Box>
  );
}

export default FlashOperatingLineTool;
