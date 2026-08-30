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
  "What is exergy?" -- ONE page, ONE mental model: exergy is the PRICE TAG
  on a state, in work, against an environment the case DECLARES.  The
  sequel the entropy ledger buys: entropy says which way; exergy says what
  it costs.  Built the same day the `exergy` bench op landed, so every
  claim cites an engine surface (src/propertyOps/Exergy.cpp), never a
  textbook alone.

  The live centre runs tutorials/props/molecular/exergy01_air_dead_state
  in the reader's browser: the engine publishes the two legs (dh and
  T0*ds) beside its own b_physical, and THIS PAGE re-adds them in front of
  the reader -- plus the structural zero at the RESTRICTED dead state
  (thermo-mechanical: composition held fixed, so the zero is the physical
  exergy's, never a claim of chemical indistinguishability).  The only
  arithmetic performed here is that re-addition and one exact product
  (T0 times a published s_gen, for the Gouy-Stodola slider).

  Tightened 2026-08-31 after an external review the owner forwarded:
  restricted vs complete dead state named on every surface, the entropy
  leg's sign displayed as the engine publishes it (+T0(s-s0), subtracted
  visibly), datum-independence stated as NOT model-independence, and the
  flowsheet-balance absence stated as an implementation status rather than
  a storage-layout law.  One reviewer caution deliberately NOT taken: the
  ideal-mixing line IS composition-only, so at fixed composition it
  cancels exactly -- the page says so precisely instead of dropping the
  claim.

  Deliberately ABSENT, per the same one-page ruling as the temperature and
  entropy pages: heat-engine cycles, availability accounting frameworks,
  and CHEMICAL exergy -- which the ENGINE itself refuses by name (it needs
  a curated standard-environment model), and the page says so rather than
  teaching a formula the simulator cannot check.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Alert, Box, Group, Loader, Slider, Stack, Text, Title }
  from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";
const ACCENT = "var(--mantine-primary-color-filled)";

/** The witness the page runs: physical exergy against a declared dead state. */
export const EXERGY_WITNESS = "props/molecular/exergy01_air_dead_state";

/** The witness's declared dead state, mirrored from the case dict. */
export const DEAD_T0_K = 298.15;
export const DEAD_P0_PA = 1.0e5;

/** Rebuild b from the engine's two published legs and compare with the
 *  engine's own total.  Every input is an ENGINE number; the page only
 *  subtracts. */
export interface ExergyLedger {
  dh: number;        // h - h0, engine H_real at both states  [J/mol]
  T0ds: number;      // T0 * (s - s0), engine S_real at both  [J/mol]
  rebuilt: number;   // dh - T0ds, re-added by this page
  b: number;         // the engine's own b_physical
  gap: number;       // |rebuilt - b| -- the page's self-check
}
export function rebuildExergy(
  d: { [k: string]: number } | undefined,
): ExergyLedger | null {
  if (!d) return null;
  for (const k of ["dh", "T0ds", "b_physical"]) if (!(k in d)) return null;
  const rebuilt = d["dh"]! - d["T0ds"]!;
  return {
    dh: d["dh"]!, T0ds: d["T0ds"]!, rebuilt,
    b: d["b_physical"]!, gap: Math.abs(rebuilt - d["b_physical"]!),
  };
}

/** Gouy-Stodola: the work an irreversibility destroys, W_lost = T0 * s_gen.
 *  Exact product -- the s_gen is the machine's own published KPI. */
export function lostWork(T0_K: number, sGen: number): number {
  return T0_K * sGen;
}

/** The claims of the page, each with the engine surface that carries it. */
export const EXERGY_META = [
  {
    line: "b = (h − h0) − T0·(s − s0)",
    question: "What is this state worth, in work?",
    cite: "src/propertyOps/Exergy.cpp · Exergy::run",
    note: "Every term is the engine's own H_real / S_real at the SAME "
      + "composition — the op subtracts and publishes both legs, nothing "
      + "more.",
  },
  {
    line: "deadState { T0; P0; } — declared",
    question: "Against WHICH environment?",
    cite: "src/propertyOps/Exergy.cpp · the missing-deadState refusal",
    note: "An exergy is a statement about a state AND an environment. The "
      + "engine REFUSES to assume one — a silently defaulted 25 °C would "
      + "hand a plant in another climate the wrong number with nothing to "
      + "see.  The block declares the reference temperature and pressure "
      + "the physical-exergy op needs — two numbers do not define a "
      + "complete environment, and the page does not pretend they do.",
  },
  {
    line: "b_ph(restricted dead state) = 0, identically",
    question: "Where does the price hit zero?",
    cite: "tutorials/props/molecular/exergy01_air_dead_state · b_dead",
    note: "The witness's second row evaluates (T0, P0) at the SAME "
      + "composition: both legs are exactly zero, by construction — the "
      + "structural zero the golden pins.  Thermo-mechanical distance is "
      + "exhausted there; the stream may still differ CHEMICALLY from the "
      + "environment, and that part is refused, never silently zeroed.",
  },
  {
    line: "datum-independence",
    question: "Why doesn't the reference zero matter?",
    cite: "src/propertyOps/Exergy.cpp · the differencing comment",
    note: "Only DIFFERENCES at fixed composition enter, so additive "
      + "reference offsets common to both states — the enthalpy datum, the "
      + "s_298 anchors, the ideal-mixing line (composition-only, identical "
      + "in both states), the 1 bar reference-pressure convention — all "
      + "drop out.  Datum-independent is NOT model-independent: different "
      + "models predict different Δh and Δs, and that difference is "
      + "physics, not bookkeeping.",
  },
  {
    line: "E_D = T0·dS_gen (Gouy–Stodola)",
    question: "What does an irreversibility cost?",
    cite: "src/unitOperations/rotating/IsentropicCore.cpp · dS_gen KPI",
    note: "Every compressor and turbine already publishes dS_gen — and for "
      + "these ADIABATIC machines the stream's entropy rise IS the "
      + "generation (a unit with heat transfer would need the boundary "
      + "term too).  Multiply by T0 and the entropy the machine generated "
      + "becomes the exergy it destroyed.",
  },
] as const;

/** The questions this page installs. */
export const EXERGY_INTERROGATION = [
  "Against which restricted dead state (T0, P0) is this exergy quoted — and who declared it?",
  "Is this the physical exergy alone, or does someone claim a chemical part — and from which standard environment?",
  "How much of the inlet exergy leaves in the product, and how much was destroyed (T0·s_gen)?",
  "Would this number change if the enthalpy datum changed? (It must not — and why not?)",
  "At the dead state itself, does the claimed formula actually return zero?",
] as const;

// ---- visual pieces ----------------------------------------------------------

function ExergyTable({ lg }: { lg: ExergyLedger }) {
  const row = (label: string, v: number, accent?: boolean) => (
    <Group justify="space-between" px="sm" py={4}
      style={{ borderBottom: `1px solid ${GRID}` }}>
      <Text size="sm" fw={accent ? 700 : 400}>{label}</Text>
      <Text size="sm" ff="monospace" fw={accent ? 700 : 400}
        c={accent ? ACCENT : undefined}>
        {v >= 0 ? "+" : ""}{v.toFixed(2)}
      </Text>
    </Group>
  );
  return (
    <Box my={8} style={{ border: `1px solid ${GRID}`, borderRadius: 6 }}>
      <Group justify="space-between" px="sm" py={6}
        style={{ borderBottom: `2px solid ${GRID}` }}>
        <Text size="xs" c={INK} fw={700} tt="uppercase">
          the price, from the engine’s own run  [J/mol]
        </Text>
      </Group>
      {row("enthalpy leg  h − h0", lg.dh)}
      {row("entropy leg  T0·(s − s0)", lg.T0ds)}
      {row("b = (h − h0) − T0·(s − s0), rebuilt here", lg.rebuilt, true)}
      {row("the engine’s own b_physical", lg.b, true)}
      <Text size="xs" c={INK} px="sm" py={6}>
        Both legs are shown with the sign the engine publishes them at;
        the subtraction is visible in the rebuilt row.  The engine
        publishes the two property differences; this page independently
        reconstructs b from them and compares with the engine’s own value
        — they agree to {lg.gap.toExponential(1)} J/mol, computed from the
        published values at their published precision.  If the two ever
        disagreed, this row is where you would see it.
      </Text>
    </Box>
  );
}

function GouyStodolaKnob() {
  //  A representative machine irreversibility; the reader substitutes any
  //  dS_gen a compressor or turbine run publishes as a KPI.
  const S_GEN = 1.0;   // J/(mol·K)
  const [T0, setT0] = useState<number>(DEAD_T0_K);
  const w = lostWork(T0, S_GEN);
  return (
    <Box my={8} px="sm" py={8} style={{ border: `1px solid ${GRID}`,
      borderRadius: 6 }}>
      <Text size="xs" c={INK} fw={700} tt="uppercase">
        what one unit of dS_gen costs, under your finger
      </Text>
      <Text size="sm" mt={4}>
        environment T0 = <Text span ff="monospace">{T0.toFixed(0)} K</Text>
      </Text>
      <Slider min={250} max={330} step={1} value={T0}
        onChange={setT0} label={null} my={6} />
      <Text size="sm" ff="monospace">
        W_lost = T0 · dS_gen = {w.toFixed(0)} J/mol
        {"  "}(per 1 J/(mol·K) generated)
      </Text>
      <Text size="xs" c={INK} mt={4}>
        For a FIXED entropy generation, a higher declared T0 assigns a
        larger exergy destruction to the same irreversibility — the
        entropy a machine generates is priced at T0.  Take any dS_gen
        from a compressor or turbine run and multiply; this slider is
        that one exact product, nothing more.
      </Text>
    </Box>
  );
}

// ---- the page ---------------------------------------------------------------

export function WhatIsExergyTool(): JSX.Element {
  const run = useMethodRun(EXERGY_WITNESS, [], "exergy-ledger",
    "choupoProps");
  const [lg, zero] = useMemo(() => {
    const ops = run.result?.operationResults;
    const st = ops?.find((o) => o.name === "b_state");
    const dd = ops?.find((o) => o.name === "b_dead");
    return [rebuildExergy(st?.diagnostics),
            rebuildExergy(dd?.diagnostics)] as const;
  }, [run.result]);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 760, margin: "0 auto" }}>

        <Box>
          <Title order={3}>What is exergy?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            The entropy page ended with a ledger; this one puts the price
            tag on it.  Energy is conserved — the first law will not let a
            joule vanish — but <strong>usefulness is not conserved</strong>,
            and exergy is usefulness made a number: what a state is worth
            in <em>work</em>, against the environment it will finally be
            dumped into.
          </Text>
        </Box>

        <Box>
          <Title order={5}>1 · Same energy, different worth</Title>
          <Text size="sm" mt={4}>
            A mole of air at 400 K and 2 bar can, in principle, deliver
            work as it is brought reversibly down to 298.15 K and 1 bar.
            The same mole already sitting at 298.15 K and 1 bar has no
            physical work potential left against those surroundings.
            Energy conservation holds in both cases — the first law is
            never in question; what differs is <em>distance from the
            declared environment</em>.  Exergy measures that distance in
            the only currency an engineer can bank: work.
          </Text>
        </Box>

        <Box>
          <Title order={5}>2 · The formula, and the declaration inside it</Title>
          <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="xs" c={INK} fw={700} tt="uppercase">
              physical (thermo-mechanical) flow exergy
            </Text>
            <Text size="sm" ff="monospace" mt={4}>
              b_ph = (h − h0) − T0·(s − s0)
            </Text>
            <Text size="xs" c={INK} mt={4}>
              both reference properties at (T0, P0) with the stream’s OWN
              composition — the restricted dead state
            </Text>
          </Box>
          <Text size="sm">
            <strong>Physical flow exergy is the maximum useful work
            obtainable as a flowing stream is brought reversibly to
            (T0, P0), with its composition held fixed.</strong>  Two engine
            differences and one product: the enthalpy you give up reaching
            the environment, minus the part the second law taxes away (heat
            that must be dumped at T0 carries T0·ds of it).  What this
            expression deliberately excludes: <em>chemical</em> exergy (the
            op refuses it by name — see the end of this page),
            and <em>kinetic</em> and <em>potential</em> exergy (streams
            here carry no velocity or elevation).  The subscript 0 is not a
            constant of nature — it is a <strong>declaration</strong>.
            This simulator refuses to run the op without
            a <Text span ff="monospace">deadState {"{"} T0;
            P0; {"}"}</Text> block, because an exergy is a statement about a
            state AND an environment, and your environment is your fact,
            not the engine’s.  The block declares the reference temperature
            and pressure this operation needs, and only those — two numbers
            do not define a complete environmental dead state, which would
            also need chemical equilibrium with a declared environmental
            composition.
          </Text>
        </Box>

        <Box>
          <Title order={5}>3 · The price, live</Title>
          <Text size="sm" mt={4}>
            Your browser has just asked the real engine to price 79/21
            N₂/O₂ at 400 K and 2 bar against a declared 298.15 K / 1 bar
            dead state — and to price the dead state itself:
          </Text>
          {run.busy && (
            <Group gap={8} my={8}><Loader size="xs" />
              <Text size="sm" c="dimmed">
                running the exergy case in your browser…
              </Text></Group>
          )}
          {run.err && (
            <Alert color="yellow" my={8}>
              The witness could not run here ({run.err}) — the table below
              needs the WASM build.  The case is
              tutorials/{EXERGY_WITNESS}; run it with runCase to see the
              same numbers.
            </Alert>
          )}
          {lg && <ExergyTable lg={lg} />}
          {zero && (
            <Text size="sm" ff="monospace" c={INK}>
              b_ph(restricted dead state) = {zero.b.toFixed(2)} J/mol —
              both legs exactly zero, by construction.  At (T0, P0), with
              the composition held fixed, no thermo-mechanical distance
              remains; any CHEMICAL distance from the environment is
              neither computed nor hidden — the op refuses it.
            </Text>
          )}
          <Box my={8}>
            {EXERGY_META.map((m) => (
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
        </Box>

        <Box>
          <Title order={5}>4 · What an engineer does with it</Title>
          <Text size="sm" mt={4}>
            <strong>Irreversibility has a bill, and dS_gen is the
            meter.</strong>  Every compressor and turbine in this simulator
            publishes the entropy its declared inefficiency generated — and
            for these adiabatic machines the stream’s entropy rise IS the
            generation.  Gouy–Stodola prices that generation as exergy
            destroyed, in energy units, relative to the declared
            environment: E_D = T0 times the entropy generated.  (Economics
            may later put money on that lost work potential; the number
            itself is joules.)  Move the environment and watch the bill
            move:
          </Text>
          <GouyStodolaKnob />
          <Text size="sm" mt={6}>
            This is why the entropy page’s cancellation matters here too:
            b_ph is built from <em>differences</em> at fixed composition,
            so additive reference offsets common to both states — the
            enthalpy datum, the s_298 anchors, the ideal-mixing line
            (composition-only, identical in both states), the 1 bar
            reference-pressure convention — all drop out.  Physical exergy
            is therefore <strong>datum-independent, not
            model-independent</strong>: different thermodynamic models
            predict different Δh and Δs and hence different exergies, and
            those are physical model differences, never reference-zero
            arbitrariness.  The dead-state row proves the zero instead of
            asking you to trust it.
          </Text>
        </Box>

        <Box>
          <Title order={5}>5 · Back to the number</Title>
          <Text size="sm" mt={4}>
            When anyone hands you an exergy, you own it when you can ask:
          </Text>
          <Box my={8} px="sm" py={8} style={{ borderLeft: `3px solid ${ACCENT}` }}>
            {EXERGY_INTERROGATION.map((q) => (
              <Text size="sm" key={q} mb={4}>· {q}</Text>
            ))}
          </Box>
          <Text size="xs" c={INK} mt={6}>
            What this engine deliberately does NOT compute, and says so by
            name: CHEMICAL exergy — the work available from a composition
            differing from the environment’s — refuses in the op itself,
            because it needs a standard-environment model (Szargut’s
            reference substances, or another) that is a curated,
            primary-cited data decision, not a formula to transcribe.  And
            no audited flowsheet-wide exergy balance is implemented or
            claimed: this operation prices the physical exergy of one
            state.  A complete flowsheet ledger would additionally need
            explicit, traceable stream, work, heat-boundary and
            entropy-generation terms — and chemical exergy wherever
            composition changes relative to the environment.  The recorded
            status of the missing entropy provenance lives in the design
            trace (docs/design/entropy-glass-box-trace.md).
          </Text>
        </Box>

      </Stack>
    </Box>
  );
}
