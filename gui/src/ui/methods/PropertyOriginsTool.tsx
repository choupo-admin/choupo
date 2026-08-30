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
  "Where do properties come from?" -- ONE page, ONE mental model: every
  number in a component's data file has a PROVENANCE -- measured, fitted,
  or estimated -- and you can always ask which.  Requested by the owner
  (2026-08-31): the estimation methods and the data each component carries,
  presented to students.

  The live centre runs tutorials/props/estimate/estimate_acetone in the
  reader's browser: the engine prices acetone from its molecular GROUPS
  (Joback: 2xCH3 + 1 ketone) and THIS PAGE sets the estimates beside the
  case's own NIST-cited reference values, computing each error on screen.
  The only arithmetic performed here is those percentage differences --
  the estimates, the anatomy and the provenance tags are all the engine's.

  Deliberately ABSENT, per the settled property architecture (do NOT
  relitigate): any suggestion that the RUNTIME estimates -- estimation is
  a CURATION-time resolution, reviewed and promoted by a person; the hot
  path only ever reads curated records.  And no second copy of the .dat
  field reference -- the anatomy cards carry the CONSUMER each field
  feeds, which is the part a table of fields cannot say.
\*---------------------------------------------------------------------------*/

import { useMemo } from "react";
import { Alert, Box, Group, Loader, Stack, Text, Title }
  from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";
const ACCENT = "var(--mantine-primary-color-filled)";

/** The witness the page runs: Joback estimation of a known substance. */
export const ORIGINS_WITNESS = "props/estimate/estimate_acetone";

/** The case's OWN cited reference values, mirrored from its dict (the
 *  test pins the mirror against the case file).  Source string verbatim. */
export const REFERENCE_SOURCE = "NIST WebBook / Poling et al.";
export const REFERENCE = {
  Tb_K: 329.2,
  Tc_K: 508.1,
  Pc_bar: 47.0,
  omega: 0.307,
} as const;

/** Signed percentage error of an estimate against a reference. */
export function pctError(est: number, ref: number): number {
  return 100.0 * (est - ref) / ref;
}

/** The rows the comparison table shows: the witness's published diag key,
 *  the reference (where the case cites one), and the display label. */
export const ORIGIN_ROWS = [
  { key: "Tb_K", label: "normal boiling point Tb [K]", ref: REFERENCE.Tb_K },
  { key: "Tc_K", label: "critical temperature Tc [K]", ref: REFERENCE.Tc_K },
  { key: "Pc_bar", label: "critical pressure Pc [bar]", ref: REFERENCE.Pc_bar },
  { key: "omega", label: "acentric factor ω [–]", ref: REFERENCE.omega },
  { key: "dHf_kJmol", label: "ΔHf° (formation) [kJ/mol]", ref: null },
  { key: "Hvap_kJmol", label: "ΔHvap(Tb) [kJ/mol]", ref: null },
  { key: "Cp298", label: "Cp°(298 K) [J/(mol·K)]", ref: null },
] as const;

/** The anatomy cards: each field family of a component .dat, the question
 *  it answers, and the CONSUMER it feeds -- which is what a plain field
 *  table cannot say.  Citations into the engine, per the citation rule. */
export const ANATOMY = [
  {
    field: "MW",
    question: "How heavy is a mole?",
    cite: "src/thermo/Component.H · every mass anywhere",
    note: "The one field with no model behind it — a weighing. Every kg in "
      + "every balance routes through it.",
  },
  {
    field: "standardThermochemistry { dHf_298; s_298; }",
    question: "Where do H and S start counting?",
    cite: "src/thermo/Component.cpp · h_pure_ig / s_pure_ig",
    note: "The caloric anchors: the elements-convention enthalpy datum and "
      + "the MEASURED third-law entropy. Every duty, every Kp, every "
      + "exergy stands on them (the entropy page walks the ledger).",
  },
  {
    field: "idealGasHeatCapacity { coefficients }",
    question: "How do H and S move with T?",
    cite: "src/thermo/heatCapacity/PolynomialCp.cpp · closed-form integrals",
    note: "The temperature SHAPE of H, S, G — integrated on paper once, "
      + "evaluated exactly, never a quadrature loop.",
  },
  {
    field: "Tc, Pc, omega",
    question: "How does the REAL gas depart from ideal?",
    cite: "src/thermo/equationOfState/SRK.cpp · a(T) = a_c·α(Tr; ω)",
    note: "Asleep under idealGas; they wake when a case declares a cubic. "
      + "ω is a PARAMETER OF A MODEL as much as a property of a substance "
      + "— it is regressed from a vapour-pressure correlation, not "
      + "measured on a bench.",
  },
  {
    field: "Tb, HvapTb",
    question: "What does boiling cost, and where?",
    cite: "src/thermo/Component.cpp · Hvap_latent (Watson transport)",
    note: "One latent heat, tabulated at one temperature, carried to any "
      + "other by Watson's corresponding-states law.",
  },
  {
    field: "vaporPressure { Antoine + Trange }",
    question: "When does it boil, at THIS pressure?",
    cite: "src/thermo/vaporPressure/ · Psat(T), window-checked",
    note: "FITTED, not measured: three coefficients regressed to data over "
      + "a declared window. Outside the window the engine announces the "
      + "extrapolation rather than pretending.",
  },
  {
    field: "groups ( ... )",
    question: "What is the molecule MADE of?",
    cite: "src/propertyOps/EstimateComponent.cpp · Joback decomposition",
    note: "The curation recipe: when nobody measured a constant, the "
      + "molecule is priced by its parts — visibly, group by group, as "
      + "the table above shows.",
  },
] as const;

/** The questions this page installs. */
export const ORIGINS_INTERROGATION = [
  "Who measured this number — or is it fitted, or estimated? (The record's provenance tags answer.)",
  "Is it a property of the substance or a parameter of a model — which correlation was ω regressed from?",
  "What is the estimation method's typical error on THIS property class — and does your design survive it?",
  "Is the datum on the rung the record declares (ideal gas / pure liquid / pure solid)?",
  "If the value is an estimate, who reviews it before it enters the catalogue?",
] as const;

// ---- visual pieces ----------------------------------------------------------

function EstimateTable({ d }: { d: { [k: string]: number } }) {
  return (
    <Box my={8} style={{ border: `1px solid ${GRID}`, borderRadius: 6 }}>
      <Group justify="space-between" px="sm" py={6}
        style={{ borderBottom: `2px solid ${GRID}` }}>
        <Text size="xs" c={INK} fw={700} tt="uppercase">
          acetone, priced by its parts — 2×CH₃ + 1 ketone (Joback)
        </Text>
      </Group>
      <Group px="sm" py={4} style={{ borderBottom: `1px solid ${GRID}` }}>
        <Text size="xs" c={INK} style={{ flex: 2 }}>property</Text>
        <Text size="xs" c={INK} ta="right" style={{ flex: 1 }}>estimate</Text>
        <Text size="xs" c={INK} ta="right" style={{ flex: 1 }}>reference</Text>
        <Text size="xs" c={INK} ta="right" style={{ flex: 1 }}>error</Text>
      </Group>
      {ORIGIN_ROWS.map((r) => {
        const est = d[r.key];
        if (est === undefined) return null;
        return (
          <Group key={r.key} px="sm" py={4}
            style={{ borderBottom: `1px solid ${GRID}` }}>
            <Text size="sm" style={{ flex: 2 }}>{r.label}</Text>
            <Text size="sm" ff="monospace" ta="right" style={{ flex: 1 }}>
              {est.toFixed(2)}
            </Text>
            <Text size="sm" ff="monospace" ta="right" style={{ flex: 1 }}
              c={r.ref === null ? INK : undefined}>
              {r.ref === null ? "—" : r.ref.toFixed(2)}
            </Text>
            <Text size="sm" ff="monospace" ta="right" style={{ flex: 1 }}
              c={r.ref === null ? INK : ACCENT}>
              {r.ref === null ? "uncited"
                : `${pctError(est, r.ref) >= 0 ? "+" : ""}`
                  + `${pctError(est, r.ref).toFixed(1)}%`}
            </Text>
          </Group>
        );
      })}
      <Text size="xs" c={INK} px="sm" py={6}>
        Reference column: {REFERENCE_SOURCE}, cited in the case file itself.
        The error column is computed on this page from the two columns
        beside it — nothing here is graded by the engine, so nothing can be
        arranged.  Rows marked “uncited” are estimates the case quotes no
        reference for: a visible gap, not a hidden one.
      </Text>
    </Box>
  );
}

// ---- the page ---------------------------------------------------------------

export function PropertyOriginsTool(): JSX.Element {
  const run = useMethodRun(ORIGINS_WITNESS, [], "property-origins",
    "choupoProps");
  const d = useMemo(() => {
    const ops = run.result?.operationResults;
    return ops?.find((o) => o.name === "estimate_acetone")?.diagnostics;
  }, [run.result]);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 760, margin: "0 auto" }}>

        <Box>
          <Title order={3}>Where do properties come from?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Your simulator carries hundreds of components, each with dozens
            of numbers.  Nobody measured them all.  By the end of this page
            every number in a data file should carry a question you ask by
            reflex: <strong>measured, fitted, or estimated — and says
            who?</strong>
          </Text>
        </Box>

        <Box>
          <Title order={5}>1 · Three origins, one file</Title>
          <Text size="sm" mt={4}>
            A <strong>measured</strong> number came off an instrument: a
            boiling point, a calorimeter’s heat, a weighing.  A
            <strong> fitted</strong> number is a parameter of a model
            regressed to measurements — Antoine’s three coefficients are
            not properties of acetone; they are the shape a correlation
            took when pressed against acetone’s data, valid inside a
            declared window and announced outside it.  An
            <strong> estimated</strong> number was never measured at all:
            the molecule is priced by its parts, group by group, because a
            design needed a number and the literature had none.  All three
            live in the same file — which is why the file carries
            provenance, not just values.
          </Text>
        </Box>

        <Box>
          <Title order={5}>2 · Estimation, live — and what it costs</Title>
          <Text size="sm" mt={4}>
            The honest way to trust an estimation method is to aim it at a
            substance you already know.  Your browser has just asked the
            real engine to build acetone from its molecular groups
            (Joback), and the case cites its reference values so the error
            has nowhere to hide:
          </Text>
          {run.busy && (
            <Group gap={8} my={8}><Loader size="xs" />
              <Text size="sm" c="dimmed">
                estimating acetone in your browser…
              </Text></Group>
          )}
          {run.err && (
            <Alert color="yellow" my={8}>
              The witness could not run here ({run.err}) — the table below
              needs the WASM build.  The case is
              tutorials/{ORIGINS_WITNESS}; run it with runCase to see the
              same numbers.
            </Alert>
          )}
          {d && <EstimateTable d={d} />}
          <Text size="sm" mt={6}>
            A couple of percent on the criticals, a few tenths on the
            formation enthalpy — good enough to size a first design, and
            exactly the number you must NOT forget you are standing on.
            The engine writes the estimate as a reviewable
            <em> proposal file</em>, with its gaps left as visible TODOs;
            it never slips an estimate into the catalogue, because
            <strong> unsourced must never become falsely sourced</strong>.
          </Text>
        </Box>

        <Box>
          <Title order={5}>3 · What each field feeds</Title>
          <Text size="sm" mt={4}>
            The anatomy that makes the file legible: not what each field
            IS, but what CONSUMES it — because that is what breaks when the
            number is wrong.
          </Text>
          <Box my={8}>
            {ANATOMY.map((m) => (
              <Box key={m.field} px="sm" py={6}
                style={{ borderLeft: `3px solid ${GRID}`, marginBottom: 6 }}>
                <Group justify="space-between">
                  <Text size="sm" fw={700} ff="monospace">{m.field}</Text>
                  <Text size="xs" c={INK}>{m.question}</Text>
                </Group>
                <Text size="xs" mt={2}>{m.note}</Text>
                <Text size="xs" c={INK} ff="monospace" mt={2}>{m.cite}</Text>
              </Box>
            ))}
          </Box>
          <Text size="sm">
            And the standing rule of this engine’s architecture:
            <strong> estimation is a curation-time act, never a runtime
            one</strong>.  The hot path only ever reads curated records; an
            estimate reaches it exclusively through a person who reviewed
            and promoted the proposal.  A simulator that estimated silently
            at run time would hand you numbers nobody can defend.
          </Text>
        </Box>

        <Box>
          <Title order={5}>4 · Back to the number</Title>
          <Text size="sm" mt={4}>
            When a data file hands you a value, you own it when you can
            ask:
          </Text>
          <Box my={8} px="sm" py={8} style={{ borderLeft: `3px solid ${ACCENT}` }}>
            {ORIGINS_INTERROGATION.map((q) => (
              <Text size="sm" key={q} mb={4}>· {q}</Text>
            ))}
          </Box>
          <Text size="xs" c={INK} mt={6}>
            The neighbouring page “When a property database lies to you”
            picks up from here: what to do when two SOURCES disagree.  This
            one is about the step before — knowing which kind of number you
            are holding at all.
          </Text>
        </Box>

      </Stack>
    </Box>
  );
}
