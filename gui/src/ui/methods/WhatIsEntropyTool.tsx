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

  REORGANISED 2026-09-28 after the owner's pedagogical review, on the same
  layering the temperature page took that day.  The review found one error
  and it was a real one: the opening said a local decrease of entropy "must
  be paid for by generating more elsewhere, usually with work".  That
  confuses the three terms of the balance -- VARIATION, TRANSFER and
  GENERATION.  A system's entropy falls because entropy LEAVES it with heat
  or matter; generation is never negative; and work carries no entropy at
  all.  Part A now teaches that balance first, with two blocks exchanging
  heat as the one worked example.
  What the review asked and this page DECLINED: to make the ledger an
  afterthought.  The ledger is the ratified spine, and it answers the
  question a simulator user actually has (where did this number come
  from?), so it stays whole as part B, after the balance rather than
  instead of it.  Found here and not in the review: the page hand-carried
  two catalogue counts ("517 of 604 records", "a further twelve") -- a
  derived number with a second home, which goes false the day a record is
  added.  They are gone; the sentence keeps the fact (not every record
  carries the datum, and asking one that does not refuses by name).

  The live centre runs tutorials/props/molecular/entropy01_air_ledger in the
  reader's browser: the engine publishes the per-component s_ig lines beside
  its own assembled S_ig / S_R / S_real, and THIS PAGE re-adds the lines in
  front of the reader and compares against the engine's total.  The only
  arithmetic performed here is that re-addition plus exact closed forms
  printed with their constants: the mixing and pressure lines for the
  slider, and the two blocks of part A (constant heat capacity, ln of a
  temperature ratio) -- never a reimplementation of the thermodynamics.

  Deliberately ABSENT, per the same one-page ruling that shaped the
  temperature page: heat-engine cycles, availability analysis, and every
  statistical-mechanics derivation and formula.  The microstate picture
  gets one sentence and no equations.  (The test bans the usual names of
  the cut material from this file outright, so this comment names none.)

  Notation, stated on the page: s is MOLAR entropy, J/(mol K); S is the
  entropy of a whole system, J/K.  The engine's labels S_ig, S_R and S_real
  are molar values despite the capital, and the page says so.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Alert, Box, Group, Loader, Slider, Stack, Text, Title }
  from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";
import { Tex } from "./lessonStep.js";

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

/** Minimum work to separate one mole of an IDEAL-GAS mixture COMPLETELY
 *  into its pure components, feed and products at the same T and P, heat
 *  exchanged reversibly with surroundings at that T: w = T·Δs_mix [J/mol]
 *  (Δh_mix = 0, so the reversible work is |Δg_mix|).  Those conditions are
 *  printed beside the number on the page; outside them it is not the floor. */
export function minSeparationWork(T_K: number, y: readonly number[]): number {
  return T_K * mixingLine(y);
}

/** Part A's worked example: two blocks of EQUAL, CONSTANT heat capacity C
 *  [kJ/K], isolated together, brought into contact until they share one
 *  temperature.  Exact: T_f is the mean, each block's change is C·ln(T_f/T₀),
 *  and the isolated pair's total change IS the entropy generated. */
export interface TwoBlocks {
  Tf: number;       // shared final temperature [K]
  Q: number;        // heat that crossed from hot to cold [kJ]
  dS_hot: number;   // [kJ/K], negative
  dS_cold: number;  // [kJ/K], positive
  S_gen: number;    // their sum [kJ/K] — the generation, ≥ 0
}
export function twoBlocks(C: number, T_hot: number, T_cold: number): TwoBlocks {
  const Tf = 0.5 * (T_hot + T_cold);
  const dS_hot = C * Math.log(Tf / T_hot);
  const dS_cold = C * Math.log(Tf / T_cold);
  return { Tf, Q: C * (T_hot - Tf), dS_hot, dS_cold, S_gen: dS_hot + dS_cold };
}
export const BLOCKS = { C_kJ_K: 1.0, T_hot_K: 400, T_cold_K: 300 } as const;

/** Rebuild the ledger from the engine's published diagnostics and compare
 *  the re-added total against the engine's own S_ig.  EVERY input here is
 *  an engine number; the page only adds them up. */
export interface Ledger {
  pure: number;        // the engine's own pure_line
  mixing: number;      // the engine's own mixing_line
  pressure: number;    // the engine's own pressure_line
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
  //  READ the three lines, do not recompute them (corrected 2026-08-31).
  //  The explainProperty op publishes `pure_line`, `mixing_line` and
  //  `pressure_line` as diagnostics -- the same op this witness runs -- so
  //  the table's caption ("from the engine's own run") is literally true of
  //  every row.  The exact formulas stay exported for the interactive knob,
  //  which asks a what-if the engine was never run for.
  const need = ["s_ig_N2", "s_ig_O2", "S_ig", "S_R", "S_real",
    "pure_line", "mixing_line", "pressure_line"];
  for (const k of need) if (!(k in d)) return null;
  const pure = d["pure_line"]!;
  const mixing = d["mixing_line"]!;
  const pressure = d["pressure_line"]!;
  const rebuilt = pure + mixing + pressure;
  return {
    pure, mixing, pressure, rebuilt,
    S_ig: d["S_ig"]!, S_R: d["S_R"]!, S_real: d["S_real"]!,
    gap: Math.abs(rebuilt - d["S_ig"]!),
  };
}

/** The five lines of the ledger, each with the question it answers and the
 *  ONE place in the engine that computes it.  These citations were written
 *  from the 2026-08-30 trace, not from memory.  `line`, `note` and the
 *  interrogation below carry their mathematics between `$` marks, rendered
 *  by KaTeX (owner, 2026-09-28: variables in an EduTool are mathematics). */
export const LEDGER_META = [
  {
    name: "the datum",
    line: "s^\\circ_{298}",
    question: "Where does the count start?",
    cite: "data/standards/components/<name>.dat · standardThermochemistry",
    note: "Absolute third-law molar entropy at 298.15 K and 1 bar (JANAF) — "
      + "anchored at the third law's own zero, where the enthalpy datum's "
      + "zero is the elements convention.",
  },
  {
    name: "temperature",
    line: "\\int_{298.15}^{T} \\frac{c_p}{T}\\,dT",
    question: "How much did heating add?",
    cite: "src/thermo/Component.cpp · Component::s_formation",
    note: "Closed form per $c_p$ model; phase crossings are explicit legs "
      + "between the 298 K STANDARD STATES, which are not in equilibrium "
      + "with each other — so the vaporisation leg keeps its Gibbs term, "
      + "$\\Delta s = (\\Delta h_{\\mathrm{vap}} - \\Delta g)/(298.15\\ "
      + "\\mathrm{K})$.  On the saturation curve, where $\\Delta g = 0$, "
      + "this collapses to the familiar $\\Delta h_{\\mathrm{vap}}/T$.",
  },
  {
    name: "mixing",
    line: "-R\\sum_i y_i \\ln y_i",
    question: "How much did mixing add?",
    cite: "src/thermo/ThermoPackage.cpp · ThermoPackage::S_ig",
    note: "Written explicitly in exactly TWO places — the assembly "
      + "(ThermoPackage.cpp) and the audit that re-adds it "
      + "(ExplainProperty.cpp, which is the op this page's own witness "
      + "runs); everywhere else it appears disguised as the $\\ln y_i$ of a "
      + "chemical potential.",
  },
  {
    name: "pressure",
    line: "-R\\ln(P/P^\\circ)",
    question: "How much did compression remove?",
    cite: "src/thermo/ThermoPackage.cpp · ThermoPackage::S_ig",
    note: "$P^\\circ = 1\\ \\mathrm{bar}$, the same convention the "
      + "$s^\\circ_{298}$ values are tabulated on.",
  },
  {
    name: "model",
    line: "s^{\\mathrm{R}}(T, P, y)",
    question: "What does the real gas change?",
    cite: "src/thermo/equationOfState/SRK.cpp · SRK::S_residual",
    note: "The departure from ideal — SRK (Sandler eq. 6.4-31), PR or "
      + "PC-SAFT.  A pureFluids{} IF97 route has NO residual line at all: "
      + "the fundamental equation replaces this whole ledger, and "
      + "explainProperty refuses such a state by name rather than "
      + "mislabelling the derivation.  Small at 2 bar, growing with "
      + "pressure.  PC-SAFT's is stated in the (T,ρ) convention — an open, "
      + "recorded divergence (docs/design/entropy-glass-box-trace.md §6).",
  },
] as const;

/** The questions this page installs. */
export const INTERROGATION = [
  "Is it a molar entropy $s$ or the entropy $S$ of a whole system — and "
    + "is it a value, a change, or a generation?",
  "What datum does it start from — the measured $s^\\circ_{298}$, or a "
    + "model's own zero?",
  "Which lines of the ledger are in the number — temperature, pressure "
    + "(at what reference pressure $P^\\circ$?), mixing, residual?",
  "Which model supplied the residual line, and at what pressure does it "
    + "stop being small?",
  "If two states are compared, which lines cancel — and is the difference "
    + "a transfer across a boundary or a generation inside it?",
] as const;

// ---- visual pieces ----------------------------------------------------------

function M({ t }: { t: string }): JSX.Element {
  return <Tex src={t} mode="inline" />;
}

/** Prose with its mathematics between `$` marks, for the text that lives in
 *  data (the ledger notes, the interrogation) rather than in JSX. */
function Md({ s }: { s: string }): JSX.Element {
  return (
    <>
      {s.split("$").map((part, i) => (i % 2 === 1
        ? <Tex key={i} src={part} mode="inline" />
        : <span key={i}>{part}</span>))}
    </>
  );
}

/** The heading of one of the page's three parts. */
function Layer({ letter, title, note }: {
  letter: string; title: string; note: string;
}): JSX.Element {
  return (
    <Box mt={6} pt={6} style={{ borderTop: `2px solid ${ACCENT}` }}>
      <Text size="xs" c={INK} fw={700} tt="uppercase">Part {letter}</Text>
      <Title order={4}>{title}</Title>
      <Text size="xs" c={INK} mt={2}>{note}</Text>
    </Box>
  );
}

/** A question the reader answers before reading on, with its answer. */
function Check({ q, a }: { q: ReactNode; a: ReactNode }): JSX.Element {
  return (
    <Box mt={6} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
      <Text size="sm" fw={600}>{q}</Text>
      <Text size="sm" c={INK} mt={2}><em>Answer:</em> {a}</Text>
    </Box>
  );
}

function BlocksTable(): JSX.Element {
  const b = twoBlocks(BLOCKS.C_kJ_K, BLOCKS.T_hot_K, BLOCKS.T_cold_K);
  const row = (label: ReactNode, v: number, accent?: boolean) => (
    <Group justify="space-between" px="sm" py={4}
      style={{ borderBottom: `1px solid ${GRID}` }}>
      <Text size="sm" fw={accent ? 700 : 400}>{label}</Text>
      <Text size="sm" ff="monospace" fw={accent ? 700 : 400}
        c={accent ? ACCENT : undefined}>
        {v >= 0 ? "+" : ""}{v.toFixed(4)} kJ/K
      </Text>
    </Group>
  );
  return (
    <Box my={8} style={{ border: `1px solid ${GRID}`, borderRadius: 6 }}>
      <Group justify="space-between" px="sm" py={6}
        style={{ borderBottom: `2px solid ${GRID}` }}>
        <Text size="xs" c={INK} fw={700} tt="uppercase">
          two blocks, {b.Q.toFixed(0)} kJ of heat crossing, final
          {" "}{b.Tf.toFixed(0)} K
        </Text>
      </Group>
      {row(<>hot block <M t="\Delta S_{\mathrm{hot}} = C\ln(350/400)" /></>,
        b.dS_hot)}
      {row(<>cold block <M t="\Delta S_{\mathrm{cold}} = C\ln(350/300)" /></>,
        b.dS_cold)}
      {row(<>the isolated pair <M t="\Delta S_{\mathrm{total}} = S_{\mathrm{gen}}" /></>,
        b.S_gen, true)}
    </Box>
  );
}

function LedgerTable({ lg }: { lg: Ledger }) {
  const row = (label: ReactNode, v: number, accent?: boolean) => (
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
      {row(<>pure-component line <M t="\sum_i y_i\, s^\circ_i(400\ \mathrm{K})" /></>,
        lg.pure)}
      {row(<>mixing line <M t="-R\sum_i y_i \ln y_i" /></>, lg.mixing)}
      {row(<>pressure line <M t="-R\ln(2\ \mathrm{bar}/1\ \mathrm{bar})" /></>,
        lg.pressure)}
      {row("re-added by this page", lg.rebuilt, true)}
      {row(<>the engine’s own <M t="s^{\mathrm{ig}}" /> (S_ig)</>, lg.S_ig, true)}
      {row(<>model line <M t="s^{\mathrm{R}}" /> (S_residual, SRK)</>, lg.S_R)}
      {row(<>the engine’s <M t="s" /> (S_real)</>, lg.S_real)}
      <Text size="xs" c={INK} px="sm" py={6}>
        <strong>An internal arithmetic consistency check, not a
        validation.</strong>  The re-added total and the engine’s
        {" "}<M t="s^{\mathrm{ig}}" /> agree to
        {" "}{lg.gap.toExponential(1)} J/(mol·K): this page adds the same
        lines the engine assembled, and if it ever disagreed with the
        simulator this row is where you would see it.  It says nothing about
        whether the lines are RIGHT — that rests on the data behind
        {" "}<M t="s^\circ_{298}" /> and <M t="c_p" />, whose homes part C
        names.
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
        <M t="y_{\mathrm{N_2}}" /> = <Text span ff="monospace">{yN2.toFixed(2)}</Text>
      </Text>
      <Slider min={0.01} max={0.99} step={0.01} value={yN2}
        onChange={setYN2} label={null} my={6} />
      <Text size="sm">
        <M t="\Delta s_{\mathrm{mix}} = -R\sum_i y_i \ln y_i" /> ={" "}
        <Text span ff="monospace">{sMix.toFixed(3)}</Text> J/(mol·K)
      </Text>
      <Text size="sm">
        minimum separation work at {WITNESS_T_K} K:
        {" "}<M t="w_{\min} = T\,\Delta s_{\mathrm{mix}}" /> ={" "}
        <Text span ff="monospace">{w.toFixed(1)}</Text> J/mol
      </Text>
      <Text size="xs" c={INK} mt={4}>
        Maximal at 50/50, zero at either pure end — mixing what is already
        mixed adds nothing.  This is the exact formula the engine writes at
        both of its mixing-line sites; the slider only moves
        {" "}<M t="y" />.
      </Text>
    </Box>
  );
}

// ---- the page ---------------------------------------------------------------

export function WhatIsEntropyTool(): JSX.Element {
  const run = useMethodRun(ENTROPY_WITNESS, [], "entropy-ledger",
    "choupoProps");
  //  FIND THE OP BY WHAT IT PUBLISHES, NEVER BY ITS NAME.  This looked up
  //  `o.name === "ledger"` -- and the witness's op called `ledger` is a
  //  `propertyPoint`, while the three lines this table is built from are
  //  published only by `explainProperty`, which that case names `explainS`.
  //  So the lookup found an op, read no lines, returned null, and the table
  //  vanished with nothing said.  Found 2026-09-02 by an audit that drove
  //  the published app.  Publishing `pure_line` is what makes an op THIS
  //  table's source; a name is a label the case author may change.
  const lg = useMemo(() => {
    const ops = run.result?.operationResults;
    const led = ops?.find((o) => o.diagnostics
                              && "pure_line" in o.diagnostics);
    return rebuildLedger(led?.diagnostics);
  }, [run.result]);
  const blocks = twoBlocks(BLOCKS.C_kJ_K, BLOCKS.T_hot_K, BLOCKS.T_cold_K);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 760, margin: "0 auto" }}>

        <Box>
          <Title order={3}>What is entropy?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Your simulator just used an entropy — to size a compressor, to
            place a chemical equilibrium, to say what a turbine can deliver.
            This page is read in three parts: <strong>A</strong>, what
            entropy measures and how it is balanced; <strong>B</strong>, how
            a simulator’s entropy value is built, as a
            <strong> ledger</strong> of lines you can read one by one; and
            {" "}<strong>C</strong>, where each line is computed in Choupo.
            Stop after A if the balance is new to you.
          </Text>
          <Text size="xs" c={INK} mt={4}>
            Notation: <M t="s" /> is a molar entropy, in J/(mol·K);
            {" "}<M t="S" /> is the entropy of a whole system, in J/K (or
            kJ/K).  The engine’s own labels S_ig, S_R and S_real are molar
            values despite the capital letter.
          </Text>
        </Box>

        <Layer letter="A" title="What entropy measures"
          note="The balance: what changes an entropy, and the one term that can never be negative." />

        <Box>
          <Title order={5}>1 · Mixed, and never unmixed</Title>
          <Text size="sm" mt={4}>
            Open a valve between nitrogen and oxygen: they mix, by
            themselves, every time.  They never unmix by themselves.  No
            energy was lost either way; the first law is silent about it.
            Entropy is the quantity that records the direction.  Its
            bookkeeping has three terms, and they must not be confused:
          </Text>
          <Box component="ul" my={6} style={{ paddingLeft: 22 }}>
            <li><Text size="sm"><strong>variation</strong> — how much the
              entropy of the system changed;</Text></li>
            <li><Text size="sm"><strong>transfer</strong> — entropy that
              crossed the system’s boundary, carried by heat or by matter
              (never by work);</Text></li>
            <li><Text size="sm"><strong>generation</strong> — entropy
              created inside by irreversibilities (mixing, friction, heat
              crossing a finite temperature difference); it is zero only in
              the reversible limit and never negative.</Text></li>
          </Box>
          <Text size="sm">
            So the entropy of a system can go up or down, because entropy
            crosses its boundary with heat or with matter.  Irreversibilities
            generate entropy.  In an isolated whole, where nothing crosses
            the outer boundary, only generation is left:{" "}
            <strong>in an isolated system it cannot decrease</strong>.  A
            gas cooled in an exchanger loses entropy, legitimately — it
            leaves with the heat and arrives in the coolant.  (There is a
            molecular story — more arrangements count as “mixed” than
            “sorted” — worth one sentence here and a statistical mechanics
            course later.)
          </Text>
        </Box>

        <Box>
          <Title order={5}>2 · Two blocks exchange heat</Title>
          <Text size="sm" mt={4}>
            Two blocks, each of constant heat capacity
            {" "}<M t="C = 1\ \mathrm{kJ/K}" />, one at 400 K and one at
            300 K, are put in contact and insulated from everything else.
            They end at <M t="T_f = 350\ \mathrm{K}" />, and
            {" "}{blocks.Q.toFixed(0)} kJ of heat has crossed.  For a block of
            constant <M t="C" /> heated or cooled from <M t="T_0" /> to
            {" "}<M t="T_f" />, <M t="\Delta S = C\ln(T_f/T_0)" />:
          </Text>
          <BlocksTable />
          <Text size="sm">
            The hot block’s entropy <em>fell</em>, and nothing is wrong with
            that: entropy left it with the heat.  The cold block gained more
            than the hot one lost, because the same heat arrived at a lower
            temperature.  The pair is isolated, so nothing crossed its outer
            boundary and the whole of the total,
            {" "}+{blocks.S_gen.toFixed(4)} kJ/K, is generation — created at
            the contact, by heat crossing a finite temperature difference.
            Make that difference smaller and the generation shrinks; in the
            limit where the two temperatures differ only infinitesimally the
            heat crosses with <M t="dS_{\mathrm{hot}} = -dS_{\mathrm{cold}}" />:
            entropy is <em>transferred</em> and none is generated.  That
            limit is what the word <em>reversible</em> means.
          </Text>
        </Box>

        <Box>
          <Title order={5}>3 · The balance, written down</Title>
          <Text size="sm" mt={4}>
            For a closed system, with heat <M t="\delta Q" /> crossing its
            boundary where the boundary is at temperature
            {" "}<M t="T_b" />:
          </Text>
          <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="xs" c={INK} fw={700} tt="uppercase">
              entropy balance
            </Text>
            <Tex mode="display"
              src="\Delta S = \int \frac{\delta Q}{T_b} + S_{\mathrm{gen}}, \qquad S_{\mathrm{gen}} \ge 0" />
          </Box>
          <Text size="sm">
            The integral is the transfer, <M t="S_{\mathrm{gen}}" /> the
            generation, <M t="\Delta S" /> the variation.  Work appears
            nowhere in it: <strong>work carries no entropy</strong>.  For a
            unit with streams, at steady state, the streams carry entropy in
            and out as well:
          </Text>
          <Tex mode="display"
            src="0 = \sum_{\mathrm{in}} \dot n\, s - \sum_{\mathrm{out}} \dot n\, s + \sum \frac{\dot Q}{T_b} + \dot S_{\mathrm{gen}}" />
          <Text size="sm">
            An adiabatic machine with one stream in and one out has no heat
            term and does work that carries nothing, so
            {" "}<M t="s_{\mathrm{out}} - s_{\mathrm{in}} = \dot S_{\mathrm{gen}}/\dot n \ge 0" />:
            its entropy rise is all generation.  Part B comes back to that.
          </Text>
        </Box>

        <Box>
          <Title order={5}>4 · The definition, and a measured zero</Title>
          <Text size="sm" mt={4}>
            The balance rests on the thermodynamic definition, for a closed
            system taken along a <em>reversible</em> path, where
            {" "}<M t="T" /> is the system’s own temperature (on such a path
            it equals the boundary’s):
          </Text>
          <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="xs" c={INK} fw={700} tt="uppercase">
              thermodynamic definition
            </Text>
            <Tex mode="display"
              src="dS = \frac{\delta Q_{\mathrm{rev}}}{T}" />
          </Box>
          <Text size="sm">
            Entropy is a property of the state, so the change between two
            states is the same whatever happened between them: to compute it
            for an irreversible process, choose any reversible path between
            the same two end states.  What you may not do is divide the
            heat of the <em>actual</em> irreversible path by
            {" "}<M t="T" /> — that gives the transfer only, and misses the
            generation.
          </Text>
          <Text size="sm" mt={6}>
            The definition fixes only <em>differences</em>.  What makes an
            absolute value possible is the <strong>third law</strong>: a
            perfect crystal with a unique ground state has
            {" "}<M t="S = 0" /> at 0 K, so the molar entropy of a substance
            at 298.15 K can be DETERMINED calorimetrically — integrating
            {" "}<M t="c_p/T" /> up from near absolute zero and adding each
            phase transition crossed on the way (the very
            {" "}<M t="\int c_p/T\,dT" /> structure the ledger in part B
            reuses).  That number is the <M t="s^\circ_{298}" /> in a
            component’s data file.  Not every record carries it: the salts,
            minerals and polymers priced on another route carry no
            thermochemistry block at all, and some records carry the block
            without this datum; asking any of them for an entropy refuses by
            name rather than inventing one.  The contrast with enthalpy is
            subtle and worth owning: both columns rest on experiment, but
            entropy’s <em>zero</em> is the third law’s own — absolute —
            while enthalpy’s zero (elements at 25 °C) is an agreed
            convention.
          </Text>
          <Text size="xs" c={INK} mt={4}>
            A note, not needed for the rest of the page: some real crystals
            (carbon monoxide, ice) freeze with their molecules in more than
            one orientation and keep a small residual entropy at 0 K; for
            them the calorimetric integral falls short of the true value by
            that residual.
          </Text>
        </Box>

        <Box>
          <Title order={5}>Check yourself</Title>
          <Check
            q="A gas is cooled in a heat exchanger and its entropy falls. Does that break the second law?"
            a={<>No.  The gas is not isolated: its entropy left with the heat
              and entered the coolant, which gained at least as much.  The
              second law speaks about generation, and about isolated
              wholes.</>} />
          <Check
            q="A turbine delivers shaft work. How much entropy leaves with that work?"
            a={<>None — work carries no entropy.  In an adiabatic turbine the
              only way <M t="s" /> can change from inlet to outlet is
              generation, so <M t="s_{\mathrm{out}} - s_{\mathrm{in}} \ge 0" />.</>} />
          <Check
            q="In the two-block example, where is the entropy generated?"
            a={<>At the contact, where heat crosses a finite temperature
              difference.  Each block alone only gives or receives heat; the
              generation is what the isolated pair gained,
              {" "}+{blocks.S_gen.toFixed(4)} kJ/K.</>} />
          <Check
            q="Can the entropy change of an irreversible process be computed?"
            a={<>Yes, because entropy is a property of the state: take any
              reversible path between the same end states and integrate
              {" "}<M t="\delta Q_{\mathrm{rev}}/T" /> along it.  Dividing the
              heat of the actual path by <M t="T" /> gives the transfer, not
              the change.</>} />
        </Box>

        <Layer letter="B" title="The ledger"
          note="How a simulator builds an entropy value — live, from the engine's own run." />

        <Box>
          <Text size="sm" mt={4}>
            Here is the mental model for a simulator’s number.  The molar
            entropy of a gas mixture at <M t="(T, P, y)" /> is assembled as a
            short sum — and your browser has just asked the real engine (the
            same WASM solver that runs your cases) to publish every line for
            79/21 <M t="\mathrm{N_2}/\mathrm{O_2}" /> at 400 K and 2 bar:
          </Text>
          <Tex mode="display"
            src="s(T,P,y) = \sum_i y_i\, s^\circ_i(T) - R\sum_i y_i\ln y_i - R\ln\frac{P}{P^\circ} + s^{\mathrm{R}}(T,P,y)" />
          <Text size="sm">
            where <M t="s^\circ_i(T) = s^\circ_{298,i} + \int_{298.15}^{T} \frac{c_{p,i}}{T}\,dT" />
            {" "}for each component as an ideal gas at 1 bar, and
            {" "}<M t="s^{\mathrm{R}}" /> is what the real-gas model adds.
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
          {/*  AN ABSENT LEDGER MUST SAY SO.  A run that produced no lines
              must not remove, in silence, the row this page advertises as
              the place you would catch it disagreeing with the simulator.
              Three states are told apart: still running, the run failed
              (above), and the run SUCCEEDED and published no ledger, which
              is an engine-or-case defect and says so. */}
          {!lg && !run.err && (
            <Alert color={run.busy ? "gray" : "orange"} my={8}
                   title={run.busy ? undefined
                                   : "The ledger did not arrive"}>
              {run.busy
                ? "running the ledger case in your browser…"
                : `The witness ran, but no operation in it published the
                   pure/mixing/pressure lines this table is built from, so
                   there is nothing to show and this page cannot check
                   itself against the engine.  That is a defect in
                   tutorials/${ENTROPY_WITNESS} or in the explainProperty
                   op, not something you did.`}
            </Alert>
          )}
        </Box>

        <Box>
          <Title order={5}>What an engineer does with it</Title>
          <Text size="sm" mt={4}>
            <strong>Separation has a floor.</strong>  The mixing line is the
            one you pay to reverse.  Separating one mole of an ideal-gas
            mixture <em>completely</em> into its pure components, feed and
            products delivered at the same T and P, with heat exchanged
            reversibly with surroundings at that same <M t="T" />, costs at
            least <M t="w_{\min} = T\,\Delta s_{\mathrm{mix}}" /> of work —
            the reversible floor.  Outside those conditions (a partial
            split, a non-ideal liquid, products at another pressure) it is
            not the floor.  Move the slider and watch it move:
          </Text>
          <MixingKnob />
          <Text size="sm" mt={6}>
            Do not set this number beside a distillation column’s reboiler
            duty: the column is driven by <em>heat</em>, and this is
            <em> work</em>.  Comparing the two needs the work-equivalent of
            that heat, which is the subject of the exergy page beside this
            one.
          </Text>
          <Text size="sm" mt={6}>
            <strong>Machines generate it.</strong>  A compressor or turbine
            in this simulator is adiabatic — its energy balance carries shaft
            work and nothing else, which is what lets
            {" "}<M t="s_{\mathrm{out}} - s_{\mathrm{in}}" /> read directly as
            the entropy generated (part A, section 3) — and it is solved by
            matching entropy: the ideal outlet satisfies
            {" "}<M t="s(T_{\mathrm{out}}, P_{\mathrm{out}}, y) = s(T_{\mathrm{in}}, P_{\mathrm{in}}, y)" />
            {" "}— a Newton iteration on the real entropy surface
            (src/unitOperations/rotating/IsentropicCore.cpp) — and the
            distance the REAL outlet falls short is published on every run
            as the KPI <Text span ff="monospace">dS_gen</Text>, the entropy
            generated by the irreversibility.  Every bit of it is work that
            could have been had and was not: the machine destroys exergy in
            proportion to what it generates.  Because the composition is
            fixed through the machine, the datum, the mixing line and the
            reference pressure all cancel in the difference: the isentropic
            answer hangs on <M t="\int c_p/T\,dT" /> and
            {" "}<M t="-R\ln(P_2/P_1)" /> alone (+ the model line).  In the
            rankine02 tutorial the same machinery runs on the IF97 steam
            entropy surface, verified digit-for-digit against the standard’s
            own tables.
          </Text>
        </Box>

        <Layer letter="C" title="How Choupo computes it"
          note="Each line of the ledger, the question it answers, and the one place in the engine that computes it." />

        <Box>
          <Box my={8}>
            {LEDGER_META.map((m) => (
              <Box key={m.name} px="sm" py={6}
                style={{ borderLeft: `3px solid ${GRID}`, marginBottom: 6 }}>
                <Group justify="space-between">
                  <Text size="sm" fw={700}><M t={m.line} /></Text>
                  <Text size="xs" c={INK}>{m.question}</Text>
                </Group>
                <Text size="xs" mt={2}><Md s={m.note} /></Text>
                <Text size="xs" c={INK} ff="monospace" mt={2}>{m.cite}</Text>
              </Box>
            ))}
          </Box>
          <Text size="sm">
            One name to read carefully: the engine’s
            {" "}<Text span ff="monospace">s_formation</Text> returns the
            <em> absolute</em> (third-law) molar entropy of the species at
            {" "}<M t="T" />, <M t="s^\circ_{298} + \int c_p/T\,dT" /> — not an
            entropy change of forming it from the elements.  Why a search for
            “entropy” finds none of this: the code speaks the ledger’s names
            (monospace, as code; the page’s symbols are mathematics) —{" "}
            <Text span ff="monospace">
              s_298 → s_formation → s_pure_ig → S_ig → S_residual → S_real
              → dS_gen
            </Text>
            {" "}— seven names, one ledger, and the word itself survives as
            a code identifier in exactly one place
            ({" "}<Text span ff="monospace">NASA7Cp::entropySeg_</Text>,
            which computes part of the temperature line).
          </Text>
        </Box>

        <Box>
          <Title order={5}>Back to the number</Title>
          <Text size="sm" mt={4}>
            When anyone — a simulator, a paper, a colleague — hands you an
            entropy, you can defend it when you can ask:
          </Text>
          <Box my={8} px="sm" py={8} style={{ borderLeft: `3px solid ${ACCENT}` }}>
            {INTERROGATION.map((q) => (
              <Text size="sm" key={q} mb={4}>· <Md s={q} /></Text>
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
            engine does NOT carry — wet-steam entropy, liquid excess
            entropy, an entropy column on streams — is recorded there too.
            Physical exergy IS carried now (the `exergy` op, and the page
            beside this one); what stays absent there is CHEMICAL exergy and
            any exergy balance over a flowsheet.
          </Text>
        </Box>

      </Stack>
    </Box>
  );
}
