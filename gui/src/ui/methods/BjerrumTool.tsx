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
  Speciation versus pH -- the Bjerrum diagram, drawn from a titration.

  ZERO PHYSICS IN TYPESCRIPT, and here that rule is the tool's whole subject
  rather than a convention it happens to obey.  A page that computed the
  fractions from two pK's would be drawing the textbook diagram -- pH in,
  ratios out -- and would silently contradict everything the lesson says.
  Every number below is read out of `operationResults[].diagnostics` of a
  choupoProps run over tutorials/props/electrolyte/bjerrum01_carbonate_pH:
  44 speciate operations, each a separate equilibrium calculation whose pH
  came back from its own charge balance.

  THE POINTS ARE PLOTTED IN THE ORDER THE ENGINE SOLVED THEM, and they are
  sorted by the pH that came OUT, never by the titrant that went in.  That is
  not a presentation choice: sorting by the input would let a reader believe
  the abscissa was something the case set.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Alert, Box, Group, Slider, Stack, Text, Title } from "@mantine/core";

import { useMethodRun, type ScalarOverride } from "../../case/methodRun.js";
import { KnobField } from "./knobPanel.js";
import { BJERRUM_LIMITS, BJERRUM_STEPS } from "./bjerrumLesson.js";

export const BJERRUM_WITNESS = "props/electrolyte/bjerrum01_carbonate_pH";
export const BJERRUM_PROPS_DICT = "system/propsDict";

const INK = "dimmed";
const GRID = "var(--mantine-color-default-border)";

/** The three carbon-bearing species the diagram draws, in protonation order,
 *  with the colour each keeps everywhere on the page. */
export const BJERRUM_SPECIES = [
  { key: "m_CO2aq", label: "CO2(aq)", colour: "#c2410c" },
  { key: "m_HCO3", label: "HCO3-", colour: "#0369a1" },
  { key: "m_CO3", label: "CO3--", colour: "#15803d" },
] as const;

export interface BjerrumPoint {
  pH: number;
  /** Fraction of the TOTAL carbon read on this point, one per species above. */
  f: number[];
  /** Sum of the three fractions.  Deliberately kept: it is 0.9997, not 1, and
   *  the shortfall is a fourth species the diagram cannot draw. */
  closure: number;
  gammaCO3: number;
  I: number;
}

/** Read the diagram out of the run.  Returns points sorted by the pH that
 *  came OUT of each calculation -- see the header. */
export function readBjerrum(
  ops: readonly {
    name?: string; diagnostics?: Record<string, number>;
  }[] | undefined,
): BjerrumPoint[] {
  const num = (d: Record<string, number>, k: string): number | null => {
    const v = d[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const out: BjerrumPoint[] = [];
  for (const o of ops ?? []) {
    const d = o.diagnostics;
    if (!d) continue;
    const pH = num(d, "pH");
    if (pH === null) continue;
    const m: number[] = [];
    let ok = true;
    for (const sp of BJERRUM_SPECIES) {
      const v = num(d, sp.key);
      if (v === null) { ok = false; break; }
      m.push(v);
    }
    if (!ok) continue;
    const drawn = m.reduce((a, b) => a + b, 0);
    if (!(drawn > 0)) continue;
    //  The ion pair is OPTIONAL by construction: in a beaker with no sodium
    //  the species does not exist, and the engine refuses to report one that
    //  is not in its table.  Absent contributes nothing and closure reads 1,
    //  which is the truth for that beaker rather than a gap to explain.
    const pair = num(d, "m_NaHCO3aq") ?? 0;
    const gamma = num(d, "gamma_CO3");
    const ionic = num(d, "I");
    out.push({
      pH,
      f: m.map((v) => v / drawn),
      closure: drawn / (drawn + pair),
      gammaCO3: gamma === null ? NaN : gamma,
      I: ionic === null ? NaN : ionic,
    });
  }
  out.sort((a, b) => a.pH - b.pH);
  return out;
}

/** Where two curves cross, by linear interpolation between the two points
 *  that bracket the crossing.  Returns null when the pair never crosses in
 *  the range the run covers -- a crossing INVENTED beyond the data would be
 *  the page asserting a pK it never measured. */
export function crossover(
  pts: readonly BjerrumPoint[], a: number, b: number,
): number | null {
  const gap = (q: BjerrumPoint | undefined): number | null => {
    if (!q) return null;
    const fa = q.f[a], fb = q.f[b];
    return (typeof fa === "number" && typeof fb === "number") ? fa - fb : null;
  };
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i];
    const d0 = gap(p0), d1 = gap(p1);
    if (d0 === null || d1 === null || !p0 || !p1) continue;
    if (d0 === 0) return p0.pH;
    if (d0 * d1 < 0) {
      const t = d0 / (d0 - d1);
      return p0.pH + t * (p1.pH - p0.pH);
    }
  }
  return null;
}

// ---- the drawing -----------------------------------------------------------

const W = 620, H = 380, ML = 52, MR = 16, MT = 14, MB = 40;

export function BjerrumPlot({ pts }: { pts: readonly BjerrumPoint[] }): JSX.Element {
  if (pts.length < 2) {
    return (
      <Box style={{ height: H, display: "flex", alignItems: "center",
        justifyContent: "center" }}>
        <Text size="sm" c={INK}>waiting for the run…</Text>
      </Box>
    );
  }
  const first = pts[0], last = pts[pts.length - 1];
  if (!first || !last) return <Box style={{ height: H }} />;
  const pLo = Math.floor(first.pH), pHi = Math.ceil(last.pH);
  const x = (p: number) => ML + (p - pLo) / (pHi - pLo) * (W - ML - MR);
  const y = (f: number) => H - MB - f * (H - MT - MB);

  //  A point missing a species cannot be drawn on that curve, and inventing
  //  a y for it would be the page filling in a number the engine did not
  //  give; the segment simply breaks (M, not L, on the next real point).
  const path = (k: number) => {
    let d = "", pen = false;
    for (const q of pts) {
      const f = q.f[k];
      if (typeof f !== "number" || !Number.isFinite(f)) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${x(q.pH).toFixed(1)},${y(f).toFixed(1)} `;
      pen = true;
    }
    return d.trim();
  };

  const ticks: number[] = [];
  for (let p = pLo; p <= pHi; p++) ticks.push(p);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label="carbonate speciation against pH">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={ML} y1={y(f)} x2={W - MR} y2={y(f)} stroke={GRID}
            strokeWidth={f === 0 || f === 1 ? 1 : 0.5} />
          <text x={ML - 8} y={y(f) + 4} fontSize={10} textAnchor="end"
            fill="currentColor" opacity={0.6}>{f.toFixed(2)}</text>
        </g>
      ))}
      {ticks.map((p) => (
        <g key={p}>
          <line x1={x(p)} y1={H - MB} x2={x(p)} y2={H - MB + 4} stroke={GRID} />
          <text x={x(p)} y={H - MB + 16} fontSize={10} textAnchor="middle"
            fill="currentColor" opacity={0.6}>{p}</text>
        </g>
      ))}
      <text x={(ML + W - MR) / 2} y={H - 6} fontSize={11} textAnchor="middle"
        fill="currentColor" opacity={0.75}>
        pH — solved, not set
      </text>
      <text x={14} y={(MT + H - MB) / 2} fontSize={11} textAnchor="middle"
        fill="currentColor" opacity={0.75}
        transform={`rotate(-90 14 ${(MT + H - MB) / 2})`}>
        fraction of total carbon
      </text>

      {BJERRUM_SPECIES.map((s, k) => (
        <path key={s.key} d={path(k)} fill="none" stroke={s.colour}
          strokeWidth={2} />
      ))}
      {/* the points the engine actually solved -- the curve between them is
          drawn, the dots are computed, and a reader should be able to tell */}
      {pts.map((q, i) => BJERRUM_SPECIES.map((s, k) => {
        const f = q.f[k];
        if (typeof f !== "number" || !Number.isFinite(f)) return null;
        return (
          <circle key={`${i}-${s.key}`} cx={x(q.pH)} cy={y(f)} r={1.8}
            fill={s.colour} opacity={0.85} />
        );
      }))}
    </svg>
  );
}

// ---- the tool --------------------------------------------------------------

export interface BjerrumKnobs { T: number; C_T: number; }
export const BJERRUM_KNOB_DEFAULTS: BjerrumKnobs = { T: 298.15, C_T: 1.0 };

/** knob -> dict scalar.  BOTH keys live in the case's `variables` block and
 *  therefore appear EXACTLY ONCE in the file -- which is the only reason a
 *  knob is possible here: applyScalarOverride refuses an ambiguous key, and
 *  before the case was restructured `temperature` appeared 44 times.  The
 *  units are declared and CHECKED: C_T's slot says mol/kg, so the knob works
 *  in mmol/kg and divides. */
export function bjerrumOverrides(k: BjerrumKnobs): ScalarOverride[] {
  return [
    { file: BJERRUM_PROPS_DICT, key: "T", value: k.T, unit: "K" },
    { file: BJERRUM_PROPS_DICT, key: "C_T", value: k.C_T / 1000, unit: "mol/kg" },
  ];
}

export function BjerrumTool(): JSX.Element {
  const [knobs, setKnobs] = useState<BjerrumKnobs>(BJERRUM_KNOB_DEFAULTS);
  const key = JSON.stringify(knobs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const overrides = useMemo(() => bjerrumOverrides(knobs), [key]);
  const run = useMethodRun(BJERRUM_WITNESS, overrides, key, "choupoProps");

  const pts = useMemo(
    () => readBjerrum(run.result?.operationResults), [run.result]);
  const x1 = crossover(pts, 0, 1);
  const x2 = crossover(pts, 1, 2);
  const worstClosure = pts.length
    ? pts.reduce((m, q) => Math.min(m, q.closure), 1) : NaN;

  const step = (n: number): JSX.Element | null => {
    const st = BJERRUM_STEPS.find((s) => s.n === n);
    if (!st) return null;
    return (
      <Box>
        <Title order={5}>{st.n} · {st.title}</Title>
        <Text size="sm" mt={4}>{st.body}</Text>
        {st.formula && (
          <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="sm" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
              {st.formula}
            </Text>
          </Box>
        )}
        {st.note && <Text size="sm" c={INK}>{st.note}</Text>}
      </Box>
    );
  };

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>

        <Box>
          <Title order={3}>Speciation against pH, with the pH earned</Title>
          <Text size="sm" c={INK} mt={4}>
            The diagram every textbook draws — and the one thing about it no
            textbook can show, because a book puts pH on the axis and this
            engine has no pH to put there.
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

        <Box style={{ display: "grid", gap: 14,
          gridTemplateColumns: "minmax(200px, 240px) 1fr" }}>
          <Stack gap={10}>
            <KnobField label={`temperature = ${knobs.T.toFixed(2)} K`}>
              <Slider min={278.15} max={348.15} step={1} value={knobs.T}
                onChange={(v) => setKnobs({ ...knobs, T: v })} label={null} />
            </KnobField>
            <KnobField label={`total carbonate = ${knobs.C_T.toFixed(2)} mmol/kg`}>
              <Slider min={0.1} max={20} step={0.1} value={knobs.C_T}
                onChange={(v) => setKnobs({ ...knobs, C_T: v })} label={null} />
            </KnobField>
            <Text size="xs" c={INK}>
              Both knobs re-run the engine: there is nothing on this page a
              formula in the browser could have produced.
            </Text>
            <Stack gap={2}>
              {BJERRUM_SPECIES.map((s) => (
                <Group key={s.key} gap={6}>
                  <svg width={18} height={8}><line x1={0} y1={4} x2={18} y2={4}
                    stroke={s.colour} strokeWidth={2} /></svg>
                  <Text size="xs">{s.label}</Text>
                </Group>
              ))}
            </Stack>
          </Stack>
          <Box style={{ minWidth: 0 }}>
            <BjerrumPlot pts={pts} />
          </Box>
        </Box>

        <Box>
          <Text size="sm">
            {pts.length > 0 ? (
              <>
                <strong>{pts.length}</strong> equilibrium calculations, spanning
                pH {(pts[0]?.pH ?? NaN).toFixed(2)} to{" "}
                {(pts[pts.length - 1]?.pH ?? NaN).toFixed(2)}.
                {x1 !== null && (
                  <> CO2(aq) and HCO3<sup>−</sup> cross at{" "}
                    <strong>pH {x1.toFixed(3)}</strong>.</>)}
                {x2 !== null && (
                  <> HCO3<sup>−</sup> and CO3<sup>2−</sup> cross at{" "}
                    <strong>pH {x2.toFixed(3)}</strong>.</>)}
                {" "}Neither pK was an input to any of them.
              </>
            ) : "waiting for the run…"}
          </Text>
        </Box>

        {step(4)}
        {step(5)}

        {Number.isFinite(worstClosure) && (
          <Box px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="sm" ff="monospace">
              three drawn species / all carbon-bearing species, at worst:{" "}
              {worstClosure.toFixed(5)}
            </Text>
          </Box>
        )}

        {step(6)}

        <Box>
          <Title order={5}>What this diagram does not show</Title>
          <Stack gap={8} mt={6}>
            {BJERRUM_LIMITS.map((l) => (
              <Box key={l.id}>
                <Text size="sm" fw={600}>{l.title}</Text>
                <Text size="sm" c={INK}>{l.body}</Text>
              </Box>
            ))}
          </Stack>
        </Box>

        <Text size="xs" c={INK}>
          Witness: <code>tutorials/{BJERRUM_WITNESS}</code>, run by{" "}
          <code>choupoProps</code> with the two knobs written into its{" "}
          <code>variables</code> block.
        </Text>
      </Stack>
    </Box>
  );
}
