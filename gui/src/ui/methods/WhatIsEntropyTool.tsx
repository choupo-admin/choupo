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
  "What is entropy?" -- ONE page, ONE mental model: an entropy value in a
  simulator is a LEDGER.  Spine ratified 2026-08-30 (owner + external
  review), built AFTER the engine trace (docs/design/entropy-glass-box-trace
  .md), so every line of the ledger cites the code that computes it.

  The live centre runs tutorials/props/molecular/entropy01_air_ledger in the
  reader's browser: the engine publishes the per-component s_ig lines beside
  its own assembled S_ig / S_R / S_real, and THIS PAGE re-adds the lines in
  front of the reader and compares against the engine's total.  The only
  arithmetic performed here is that re-addition plus the exact mixing /
  pressure formulas (-R sum y ln y, -R ln(P/P0)) for the slider -- never a
  reimplementation of the thermodynamics (the explanation cannot diverge
  from the simulator, because the simulator's own numbers are the ledger).

  Deliberately ABSENT, per the same one-page ruling that shaped the
  temperature page: heat-engine cycles, availability analysis, and every
  statistical-mechanics derivation and formula.  The microstate picture
  gets one sentence and no equations.  (The test bans the usual names of
  the cut material from this file outright, so this comment names none.)
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Alert, Box, Group, Loader, Slider, Stack, Text, Title }
  from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";
const ACCENT = "var(--mantine-primary-color-filled)";

/** The engine's own gas constant, to the digit (src/core/Constants.H:47). */
export const R_GAS = 8.314462618;

/** The witness the page runs: the entropy ledger case. */
export const ENTROPY_WITNESS = "props/molecular/entropy01_air_ledger";

/** The witness state, mirrored from the case dict (T in K, P in Pa). */
export const WITNESS_T_K = 400;
export const WITNESS_P_PA = 2.0e5;
export const WITNESS_Y = { N2: 0.79, O2: 0.21 } as const;

/** Ideal mixing line: −R·Σ yᵢ·ln yᵢ  [J/(mol·K)].  Exact formula, the same
 *  one the engine writes once at ThermoPackage.cpp (guarded y > 0). */
export function mixingLine(y: readonly number[]): number {
  let s = 0;
  for (const yi of y) if (yi > 1e-30) s -= R_GAS * yi * Math.log(yi);
  return s;
}

/** Pressure line: −R·ln(P/P°), P° = 1 bar (JANAF convention). */
export function pressureLine(P_Pa: number): number {
  return -R_GAS * Math.log(P_Pa / 1.0e5);
}

/** Minimum work to UN-mix one mole of ideal mixture at T: w = T·Δs_mix.
 *  [J/mol].  The reversible floor -- a real column pays several times it. */
export function minSeparationWork(T_K: number, y: readonly number[]): number {
  return T_K * mixingLine(y);
}

/** Rebuild the ledger from the engine's published diagnostics and compare
 *  the re-added total against the engine's own S_ig.  Every input here is
 *  an ENGINE number except the two exact formulas above. */
export interface Ledger {
  pure: number;        // Σ y·s_ig_i  (engine per-component lines)
  mixing: number;      // −RΣ y ln y  (exact)
  pressure: number;    // −R ln(P/P°) (exact)
  rebuilt: number;     // the three re-added
  S_ig: number;        // the engine's own assembled number
  S_R: number;         // the engine's residual (model line)
  S_real: number;      // the engine's total
  gap: number;         // |rebuilt − S_ig| — the page's self-check
}
export function rebuildLedger(
  d: { [k: string]: number } | undefined,
): Ledger | null {
  if (!d) return null;
  const need = ["s_ig_N2", "s_ig_O2", "S_ig", "S_R", "S_real"];
  for (const k of need) if (!(k in d)) return null;
  const pure = WITNESS_Y.N2 * d["s_ig_N2"]! + WITNESS_Y.O2 * d["s_ig_O2"]!;
  const mixing = mixingLine([WITNESS_Y.N2, WITNESS_Y.O2]);
  const pressure = pressureLine(WITNESS_P_PA);
  const rebuilt = pure + mixing + pressure;
  return {
    pure, mixing, pressure, rebuilt,
    S_ig: d["S_ig"]!, S_R: d["S_R"]!, S_real: d["S_real"]!,
    gap: Math.abs(rebuilt - d["S_ig"]!),
  };
}

/** The five lines of the ledger, each with the question it answers and the
 *  ONE place in the engine that computes it.  These citations were written
 *  from the 2026-08-30 trace, not from memory. */
export const LEDGER_META = [
  {
    line: "s_298 (the datum)",
    question: "Where does the count start?",
    cite: "data/standards/components/<name>.dat · standardThermochemistry",
    note: "Absolute third-law entropy at 298.15 K, 1 bar (JANAF). MEASURED "
      + "— unlike the enthalpy datum, which is a convention.",
  },
  {
    line: "∫Cp/T dT (temperature)",
    question: "How much did heating add?",
    cite: "src/thermo/Component.cpp · Component::s_formation",
    note: "Closed form per Cp model; phase crossings are explicit legs — "
      + "the vaporisation entropy is (ΔHvap − ΔG)/T, deliberately not "
      + "ΔHvap/T.",
  },
  {
    line: "−R·Σy·ln y (mixing)",
    question: "How much did mixing add?",
    cite: "src/thermo/ThermoPackage.cpp · ThermoPackage::S_ig",
    note: "Written explicitly exactly ONCE in the whole engine; everywhere "
      + "else it appears disguised as the ln y of a chemical potential.",
  },
  {
    line: "−R·ln(P/P°) (pressure)",
    question: "How much did compression remove?",
    cite: "src/thermo/ThermoPackage.cpp · ThermoPackage::S_ig",
    note: "P° = 1 bar, the same convention the s_298 values are tabulated "
      + "on.",
  },
  {
    line: "S_residual (the model)",
    question: "What does the real gas change?",
    cite: "src/thermo/equationOfState/SRK.cpp · SRK::S_residual",
    note: "The departure from ideal — SRK (Sandler eq. 6.4-31), PR, "
      + "PC-SAFT, or the IF97 steam surface. Small at 2 bar, growing with "
      + "pressure. PC-SAFT's is stated in the (T,ρ) convention — an open, "
      + "recorded divergence (docs/design/entropy-glass-box-trace.md §6).",
  },
] as const;

/** The questions this page installs. */
export const INTERROGATION = [
  "What datum does this entropy start from — the measured s_298, or a model's own zero?",
  "Which lines of the ledger are in the number — temperature, pressure, mixing, residual?",
  "Which model supplied the residual line, and at what pressure does it stop being small?",
  "At what reference pressure is the pressure line taken (P° = 1 bar here)?",
  "If two states are compared, which lines cancel — and which one is doing the work?",
] as const;

// ---- visual pieces ----------------------------------------------------------

function LedgerTable({ lg }: { lg: Ledger }) {
  const row = (label: string, v: number, accent?: boolean) => (
    <Group justify="space-between" px="sm" py={4}
      style={{ borderBottom: `1px solid ${GRID}` }}>
      <Text size="sm" fw={accent ? 700 : 400}>{label}</Text>
      <Text size="sm" ff="monospace" fw={accent ? 700 : 400}
        c={accent ? ACCENT : undefined}>
        {v >= 0 ? "+" : ""}{v.toFixed(4)}
      </Text>
    </Group>
  );
  return (
    <Box my={8} style={{ border: `1px solid ${GRID}`, borderRadius: 6 }}>
      <Group justify="space-between" px="sm" py={6}
        style={{ borderBottom: `2px solid ${GRID}` }}>
        <Text size="xs" c={INK} fw={700} tt="uppercase">
          the ledger, from the engine’s own run  [J/(mol·K)]
        </Text>
      </Group>
      {row("pure-component line  Σy·s°ᵢ(400 K)", lg.pure)}
      {row("mixing line  −R·Σy·ln y", lg.mixing)}
      {row("pressure line  −R·ln(2 bar / 1 bar)", lg.pressure)}
      {row("re-added by this page", lg.rebuilt, true)}
      {row("the engine’s own S_ig", lg.S_ig, true)}
      {row("model line  S_residual (SRK)", lg.S_R)}
      {row("the engine’s S_real", lg.S_real)}
      <Text size="xs" c={INK} px="sm" py={6}>
        The re-added total and the engine’s S_ig agree to
        {" "}{lg.gap.toExponential(1)} J/(mol·K) — the page adds the lines,
        the engine assembled them; if this page ever disagreed with the
        simulator, this row is where you would see it.
      </Text>
    </Box>
  );
}

function MixingKnob() {
  const [yN2, setYN2] = useState<number>(WITNESS_Y.N2);
  const y = [yN2, 1 - yN2];
  const sMix = mixingLine(y);
  const w = minSeparationWork(WITNESS_T_K, y);
  return (
    <Box my={8} px="sm" py={8} style={{ border: `1px solid ${GRID}`,
      borderRadius: 6 }}>
      <Text size="xs" c={INK} fw={700} tt="uppercase">
        the mixing line, under your finger
      </Text>
      <Text size="sm" mt={4}>
        y(N₂) = <Text span ff="monospace">{yN2.toFixed(2)}</Text>
      </Text>
      <Slider min={0.01} max={0.99} step={0.01} value={yN2}
        onChange={setYN2} label={null} my={6} />
      <Text size="sm" ff="monospace">
        Δs_mix = −R·Σy·ln y = {sMix.toFixed(3)} J/(mol·K)
      </Text>
      <Text size="sm" ff="monospace">
        minimum un-mixing work at {WITNESS_T_K} K:
        {" "}T·Δs_mix = {w.toFixed(1)} J/mol
      </Text>
      <Text size="xs" c={INK} mt={4}>
        Maximal at 50/50, zero at either pure end — mixing what is already
        mixed adds nothing.  This is the exact formula the engine writes at
        its one mixing-line site; the slider only moves y.
      </Text>
    </Box>
  );
}

// ---- the page ---------------------------------------------------------------

export function WhatIsEntropyTool(): JSX.Element {
  const run = useMethodRun(ENTROPY_WITNESS, [], "entropy-ledger",
    "choupoProps");
  const lg = useMemo(() => {
    const ops = run.result?.operationResults;
    const led = ops?.find((o) => o.name === "ledger");
    return rebuildLedger(led?.diagnostics);
  }, [run.result]);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 760, margin: "0 auto" }}>

        <Box>
          <Title order={3}>What is entropy?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Your simulator just used an entropy — to size a compressor, to
            place a chemical equilibrium, to say what a turbine can deliver.
            By the end of this page an entropy value should read to you as a
            <strong> ledger</strong>: a short sum of lines, each answering
            one physical question, each computed in one named place — not a
            mysterious number nature printed on the stream.
          </Text>
        </Box>

        <Box>
          <Title order={5}>1 · Mixed, and never unmixed</Title>
          <Text size="sm" mt={4}>
            Open a valve between nitrogen and oxygen: they mix, by
            themselves, every time.  They never unmix by themselves — not
            once, ever.  No energy was lost either way; the first law is
            silent about it.  <strong>Entropy is the bookkeeping of that
            one-way street</strong>: the property that increases in every
            process that happens by itself, and that you must PAY to push
            back.  (There is a molecular story — more arrangements count as
            “mixed” than “sorted” — worth one sentence here and a statistical
            mechanics course later.)
          </Text>
        </Box>

        <Box>
          <Title order={5}>2 · The formal definition, and a measured zero</Title>
          <Text size="sm" mt={4}>
            The intuition has an exact formulation, boxed after it rather
            than instead of it:
          </Text>
          <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="xs" c={INK} fw={700} tt="uppercase">
              thermodynamic definition
            </Text>
            <Text size="sm" ff="monospace" mt={4}>
              dS = δq_rev / T
            </Text>
          </Box>
          <Text size="sm">
            That defines only <em>differences</em>.  What makes an absolute
            value possible is the <strong>third law</strong>: a perfect
            crystal at 0 K has S = 0, so the entropy of a substance at
            298.15 K is something a calorimeter can MEASURE, walking up from
            near absolute zero.  That measured number is the
            {" "}<Text span ff="monospace">s_298</Text> in every component’s
            data file — and note the contrast with enthalpy, whose datum
            (the formation convention) is an agreement, not a measurement.
            One column of your data files is convention; this one is
            experiment.
          </Text>
        </Box>

        <Box>
          <Title order={5}>3 · The ledger</Title>
          <Text size="sm" mt={4}>
            Here is the mental model.  The entropy of a gas mixture at
            (T, P, y) is assembled as a short sum — and your browser has
            just asked the real engine (the same WASM solver that runs your
            cases) to publish every line for 79/21 N₂/O₂ at 400 K and
            2 bar:
          </Text>
          {run.busy && (
            <Group gap={8} my={8}><Loader size="xs" />
              <Text size="sm" c="dimmed">
                running the ledger case in your browser…
              </Text></Group>
          )}
          {run.err && (
            <Alert color="yellow" my={8}>
              The witness could not run here ({run.err}) — the ledger below
              needs the WASM build.  The case is
              tutorials/{ENTROPY_WITNESS}; run it with runCase to see the
              same numbers.
            </Alert>
          )}
          {lg && <LedgerTable lg={lg} />}
          <Box my={8}>
            {LEDGER_META.map((m) => (
              <Box key={m.line} px="sm" py={6}
                style={{ borderLeft: `3px solid ${GRID}`, marginBottom: 6 }}>
                <Group justify="space-between">
                  <Text size="sm" fw={700} ff="monospace">{m.line}</Text>
                  <Text size="xs" c={INK}>{m.question}</Text>
                </Group>
                <Text size="xs" mt={2}>{m.note}</Text>
                <Text size="xs" c={INK} ff="monospace" mt={2}>{m.cite}</Text>
              </Box>
            ))}
          </Box>
          <Text size="sm">
            Why a search for “entropy” finds none of this: the code speaks
            the ledger’s names —{" "}
            <Text span ff="monospace">
              s_298 → s_formation → s_pure_ig → S_ig → S_residual → S_real
            </Text>
            {" "}— seven names, one ledger, and the word itself appears only
            in prose.
          </Text>
        </Box>

        <Box>
          <Title order={5}>4 · What an engineer does with it</Title>
          <Text size="sm" mt={4}>
            <strong>Separation has a price floor.</strong>  The mixing line
            is the one you pay to reverse.  Un-mixing one mole of an ideal
            mixture at temperature T costs AT LEAST T·Δs_mix of work — the
            reversible floor; a real distillation column, with its reboiler
            and its finite trays, pays several times that.  Move the slider
            and watch the floor move:
          </Text>
          <MixingKnob />
          <Text size="sm" mt={6}>
            <strong>Machines spend it.</strong>  A compressor or turbine in
            this simulator is solved by matching entropy: the ideal outlet
            satisfies s(T_out, P_out, y) = s(T_in, P_in, y) — a Newton
            iteration on the real entropy surface
            (src/unitOperations/rotating/IsentropicCore.cpp) — and the
            distance the REAL outlet falls short is published on every run
            as the KPI <Text span ff="monospace">dS_gen</Text>, the entropy
            generated by the irreversibility.  Because the composition is
            fixed through the machine, the datum, the mixing line and the
            reference pressure all cancel in the difference: the isentropic
            answer hangs on ∫Cp/T and −R·ln(P₂/P₁) alone (+ the model
            line).  In the rankine02 tutorial the same machinery runs on the
            IF97 steam entropy surface, verified digit-for-digit against the
            standard’s own tables.
          </Text>
        </Box>

        <Box>
          <Title order={5}>5 · Back to the number</Title>
          <Text size="sm" mt={4}>
            When anyone — a simulator, a paper, a colleague — hands you an
            entropy, you own it when you can ask:
          </Text>
          <Box my={8} px="sm" py={8} style={{ borderLeft: `3px solid ${ACCENT}` }}>
            {INTERROGATION.map((q) => (
              <Text size="sm" key={q} mb={4}>· {q}</Text>
            ))}
          </Box>
          <Text size="sm">
            An entropy you can read line by line is a ledger.  One you
            cannot is just a number — and this simulator’s promise is that
            none of its numbers has to stay that way.
          </Text>
          <Text size="xs" c={INK} mt={6}>
            The full engine trace behind this page, with every claim at its
            file and line: docs/design/entropy-glass-box-trace.md.  What the
            engine does NOT carry — wet-steam entropy, exergy, liquid excess
            entropy, an entropy column on streams — is recorded there too.
          </Text>
        </Box>

      </Stack>
    </Box>
  );
}
