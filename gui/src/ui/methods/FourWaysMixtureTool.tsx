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
  "Four ways to price a mixture" -- ONE page, ONE mental model: every
  mixture model is an answer to the question "what did you KNOW about this
  pair before you priced it?"  Nothing (ideal), this exact pair's measured
  data (Wilson/NRTL), the molecule's groups (UNIFAC), its quantum charge
  surface (COSMO-SAC), or a molecular theory with association (PC-SAFT).
  Requested by the owner (2026-08-31): COSMO-SAC, PC-SAFT and the rest
  presented properly to students, with practical examples.

  The live centre runs tutorials/props/compare/compare_vle_etoh_water in
  the reader's browser: four activity models priced against the SAME
  measured 1-atm dataset, and the AAD table below is the ENGINE's own
  validation block -- this page computes nothing, so nothing can be
  arranged.  The Herington row shows the data itself being cross-examined
  before any model is graded against it.

  Static numbers quoted from goldens (each re-verified by every runTests):
  flash20's twin flash (PC-SAFT vs NRTL K-values at one (T,P)) and
  fitNRTL02's held-out lesson (a fit wins where its evidence was taken and
  loses where it was not).  COSMO-SAC's card carries the licence honesty:
  the public tree ships SYNTHETIC teaching surrogates, and says so.
\*---------------------------------------------------------------------------*/

import { useMemo } from "react";
import { Alert, Box, Group, Loader, Stack, Text, Title }
  from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";
import type { AadRecord } from "../../adapters/SolverAdapter.js";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";
const ACCENT = "var(--mantine-primary-color-filled)";

/** The witness the page runs: four models vs one measured dataset. */
export const MIXTURE_WITNESS = "props/compare/compare_vle_etoh_water";

/** Display order + labels for the AAD table (the engine's own op names). */
export const AAD_MODELS = [
  { op: "txy_ideal", label: "ideal (γ = 1)" },
  { op: "txy_wilson", label: "Wilson (fitted pair)" },
  { op: "txy_nrtl", label: "NRTL (fitted pair)" },
  { op: "txy_unifac", label: "UNIFAC (predictive)" },
] as const;

/** The ladder of information: what each model had to KNOW, and what that
 *  buys.  Citations into the engine and the witnesses, per the citation
 *  rule; every quoted number is golden-pinned in the named case. */
export const MODEL_LADDER = [
  {
    name: "ideal solution",
    knows: "nothing beyond each pure component's Psat",
    line: "γ_i = 1",
    cite: "src/thermo/activityCoefficient/ · the ideal baseline",
    note: "The honest floor.  On ethanol/water it misses the bubble curve "
      + "by 5.35 K on average and cannot make an azeotrope at all — an "
      + "azeotrope IS non-ideality.  Every other rung is paid for by what "
      + "it fixes here.",
  },
  {
    name: "fitted pair — Wilson · NRTL",
    knows: "THIS binary's own measured data, regressed into 2-3 constants",
    line: "γ from τ_ij fitted to the pair",
    cite: "src/thermo/activityCoefficient/NRTL.cpp · data/standards/parameters/",
    note: "The gold standard where its evidence was taken — and only "
      + "there.  The held-out lesson (fitNRTL02, golden-pinned): the "
      + "catalogue pair scores 0.0821 K on the 1-atm points its evidence "
      + "covers, while a fit regressed on three VACUUM isobars predicts "
      + "those same points at 0.3857 K — a factor of 4.7 lost where the "
      + "fit never looked.  A fitted constant is a record of an "
      + "experiment, not a law.",
  },
  {
    name: "UNIFAC — group contribution",
    knows: "only the molecules' GROUPS (CH3, OH, H2O, …) — no pair data",
    line: "γ from group interactions",
    cite: "src/thermo/activityCoefficient/UNIFAC.cpp",
    note: "Predictive: the pair may never have been measured.  On this "
      + "well-studied binary it lands 0.41 K — close behind the fitted "
      + "models, which is the method working exactly as advertised on "
      + "chemistry its group table has seen a thousand times.  Trust it "
      + "less the stranger your molecule.",
  },
  {
    name: "COSMO-SAC — the charge surface",
    knows: "each molecule's quantum-derived σ-profile — no binary data, "
      + "no groups",
    line: "γ from segment-charge statistics",
    cite: "src/thermo/activityCoefficient/CosmoSac.cpp · cosmoSAC01",
    note: "The most predictive rung: two σ-profiles walk in, an activity "
      + "coefficient walks out.  LICENCE HONESTY, said plainly: the "
      + "public tree ships SYNTHETIC teaching surrogates (the VT-2005 "
      + "profiles cannot be redistributed), so the shipped witness "
      + "demonstrates the MECHANISM, not validated numbers — your own "
      + "copy installs via bin/choupo-import-cosmo, and the model refuses "
      + "by name without it.",
  },
  {
    name: "PC-SAFT — a molecular equation of state",
    knows: "3-5 molecular constants per component + an association "
      + "scheme (water is 2B here — the scheme is part of the fit)",
    line: "one Gibbs surface, BOTH phases, density included",
    cite: "src/thermo/equationOfState/PCSAFT.cpp · flash20",
    note: "Not an activity model: a full equation of state from "
      + "perturbation theory, pricing vapour, liquid and density with one "
      + "set of physics.  The twin flash (flash20, golden-pinned) shows "
      + "what that generality costs on a polar azeotropic pair: at the "
      + "same 358.15 K and 1 atm, fitted NRTL gives K_ethanol = 3.90 and "
      + "V/F = 0.512; predictive PC-SAFT gives K_ethanol = 11.47 and "
      + "V/F = 0.649.  Shown side by side, never hidden — where PC-SAFT "
      + "earns its keep is high pressure, density, and mixtures no one "
      + "has measured.",
  },
] as const;

/** The questions this page installs. */
export const MIXTURE_INTERROGATION = [
  "What did this model KNOW about my pair — its own data, its groups, its charge surface, or nothing?",
  "Is my pair inside the fitted evidence, or am I extrapolating someone's regression?",
  "What is the predictive method's error on a system LIKE mine — and does my design survive it?",
  "Is the vapour priced by the same model as the liquid (an EoS), or is this a gamma-phi split?",
  "Has anyone compared this model with a measured point on THIS system — and where is that number?",
] as const;

// ---- visual pieces ----------------------------------------------------------

function AadTable({ aad }: { aad: AadRecord[] }) {
  const cell = (r: AadRecord | undefined) =>
    r && r.status === "ok" && r.aadAbs !== null
      ? `${r.aadAbs.toFixed(3)} ${r.aadAbsUnit ?? ""}`.trim()
      : "—";
  const find = (op: string, prop: string) =>
    aad.find((r) => r.model === op && r.property === prop);
  return (
    <Box my={8} style={{ border: `1px solid ${GRID}`, borderRadius: 6 }}>
      <Group justify="space-between" px="sm" py={6}
        style={{ borderBottom: `2px solid ${GRID}` }}>
        <Text size="xs" c={INK} fw={700} tt="uppercase">
          each model vs the measured 1-atm dataset — the engine’s own AADs
        </Text>
      </Group>
      <Group px="sm" py={4} style={{ borderBottom: `1px solid ${GRID}` }}>
        <Text size="xs" c={INK} style={{ flex: 2 }}>model</Text>
        <Text size="xs" c={INK} ta="right" style={{ flex: 1 }}>
          T_bubble AAD
        </Text>
        <Text size="xs" c={INK} ta="right" style={{ flex: 1 }}>
          y_ethanol AAD
        </Text>
      </Group>
      {AAD_MODELS.map((m) => (
        <Group key={m.op} px="sm" py={4}
          style={{ borderBottom: `1px solid ${GRID}` }}>
          <Text size="sm" style={{ flex: 2 }}>{m.label}</Text>
          <Text size="sm" ff="monospace" ta="right" style={{ flex: 1 }}>
            {cell(find(m.op, "T_bubble"))}
          </Text>
          <Text size="sm" ff="monospace" ta="right" style={{ flex: 1 }}>
            {cell(find(m.op, "y_eq_ethanol"))}
          </Text>
        </Group>
      ))}
      <Text size="xs" c={INK} px="sm" py={6}>
        Every number above is the engine’s own validation block — the AAD
        of each model’s 51-point curve against 12 measured points.  This
        page computes nothing, so nothing can be arranged.  Note what the
        table actually says: on a binary this well studied, the predictive
        UNIFAC sits close behind the fitted pair models — and the ideal
        baseline is off by an order of magnitude more than any of them.
      </Text>
    </Box>
  );
}

// ---- the page ---------------------------------------------------------------

export function FourWaysMixtureTool(): JSX.Element {
  const run = useMethodRun(MIXTURE_WITNESS, [], "four-ways-mixture",
    "choupoProps");
  const [aad, herington] = useMemo(() => {
    const block = run.result?.validation?.find(
      (v) => v.dataset === "etoh_water_1atm");
    const cons = run.result?.operationResults?.find(
      (o) => o.name === "consistency_etoh_water")?.diagnostics;
    return [block?.aad ?? null, cons ?? null] as const;
  }, [run.result]);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 760, margin: "0 auto" }}>

        <Box>
          <Title order={3}>Four ways to price a mixture</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Ethanol and water do not mix indifferently — they azeotrope,
            and a model that misses that will design you a column that
            cannot exist.  Five models will now price the same binary, and
            by the end of this page each one should come with a reflex
            question attached: <strong>what did it KNOW about this pair
            before it answered?</strong>
          </Text>
        </Box>

        <Box>
          <Title order={5}>1 · One binary, one question</Title>
          <Text size="sm" mt={4}>
            The test system is ethanol/water at 1 atm — the most measured
            binary in the discipline, non-ideal enough to have an
            azeotrope, and the witness carries 12 measured T-x-y points to
            grade every model against.  The data itself is cross-examined
            before any model is: a Gibbs-Duhem consistency op runs the
            Herington area test on the measured points
            {herington && typeof herington["herington_D"] === "number" && (
              <>{" "}(live from your browser’s run: D = {
                (herington["herington_D"] as number).toFixed(1)}, J = {
                (herington["herington_J"] as number).toFixed(1)},
                |D − J| &lt; 10 — <strong>the dataset passes</strong>)</>
            )}
            .  A model graded against inconsistent data would inherit the
            data’s own sins.
          </Text>
        </Box>

        <Box>
          <Title order={5}>2 · The ladder of information</Title>
          <Text size="sm" mt={4}>
            Every mixture model is a position on one ladder: how much did
            it have to know?  Climbing down the ladder buys reach —
            answers about pairs nobody measured — and pays in accuracy on
            the pairs somebody did.
          </Text>
          <Box my={8}>
            {MODEL_LADDER.map((m) => (
              <Box key={m.name} px="sm" py={6}
                style={{ borderLeft: `3px solid ${GRID}`, marginBottom: 6 }}>
                <Group justify="space-between">
                  <Text size="sm" fw={700}>{m.name}</Text>
                  <Text size="xs" ff="monospace" c={INK}>{m.line}</Text>
                </Group>
                <Text size="xs" mt={2} fw={600} c={INK}>
                  knows: {m.knows}
                </Text>
                <Text size="xs" mt={2}>{m.note}</Text>
                <Text size="xs" c={INK} ff="monospace" mt={2}>{m.cite}</Text>
              </Box>
            ))}
          </Box>
        </Box>

        <Box>
          <Title order={5}>3 · The score, live</Title>
          <Text size="sm" mt={4}>
            Your browser has just asked the real engine to sweep all four
            activity models across the full composition range and grade
            each curve against the measured points:
          </Text>
          {run.busy && (
            <Group gap={8} my={8}><Loader size="xs" />
              <Text size="sm" c="dimmed">
                pricing ethanol/water four ways in your browser…
              </Text></Group>
          )}
          {run.err && (
            <Alert color="yellow" my={8}>
              The witness could not run here ({run.err}) — the table below
              needs the WASM build.  The case is
              tutorials/{MIXTURE_WITNESS}; run it with runCase to see the
              same numbers.
            </Alert>
          )}
          {aad && <AadTable aad={aad} />}
          <Text size="sm" mt={6}>
            PC-SAFT and COSMO-SAC are deliberately NOT rows in this table:
            PC-SAFT is an equation of state, priced against this system in
            its own twin-flash witness (flash20 — the K-values on its card
            above), and the public COSMO-SAC profiles are teaching
            surrogates that would make any AAD here a number about the
            surrogate, not the method.  A missing row is honest; a wrong
            row would not be.
          </Text>
        </Box>

        <Box>
          <Title order={5}>4 · Back to the number</Title>
          <Text size="sm" mt={4}>
            When a simulation hands you a separation, you own it when you
            can ask:
          </Text>
          <Box my={8} px="sm" py={8} style={{ borderLeft: `3px solid ${ACCENT}` }}>
            {MIXTURE_INTERROGATION.map((q) => (
              <Text size="sm" key={q} mb={4}>· {q}</Text>
            ))}
          </Box>
          <Text size="xs" c={INK} mt={6}>
            The mixing-rules side of the same story — how a CUBIC prices a
            multicomponent mixture through a_mix and b_mix, pair by pair,
            declared kij beside the defaulted ones — is the mixingRules
            bench op (tutorials/props/molecular/mixrules01_natural_gas).
            And “When a property database lies to you” is the page to
            read before trusting any of these models’ INPUTS.
          </Text>
        </Box>

      </Stack>
    </Box>
  );
}
