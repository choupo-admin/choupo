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
  THE LOCAL-COMPOSITION FAMILY, DERIVED -- Wilson, NRTL and UNIQUAC from one
  trunk.  Second page under the owner's textbook ruling (credo §10).

  ONE PAGE FOR THREE MODELS, deliberately, and the reason is pedagogical
  rather than economical: they are not three ideas.  They are one idea --
  that a molecule's neighbourhood is not the bulk composition -- carried
  three distances.  Three separate pages would repeat the trunk three times
  and hide what actually distinguishes them, which is the SHAPE of the
  correction each one is willing to pay for.

  Every equation is the one the engine runs, cited file:line.  Writing it
  meant reading Wilson.cpp, NRTL.cpp and UNIQUAC.cpp, which is where the
  ideal-fallback paragraph came from: a pair with no parameters does not
  fail here, it runs at tau = 0, and THAT is a lesson no textbook teaches
  because no textbook has an implementation to be honest about.

  ZERO PHYSICS IN TYPESCRIPT: nothing is computed on this page.
\*---------------------------------------------------------------------------*/

import { Alert, Box, Code, Stack, Text, Title } from "@mantine/core";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";

/** The shared trunk, then one branch per model.  Order is historical AND
 *  pedagogical: each model answers a limitation the previous one has. */
export const LC_STEPS = [
  {
    n: 1,
    title: "The idea: a molecule does not see the bulk composition",
    body: "Raoult's law assumes a molecule's neighbours are drawn at random "
      + "from the mixture, so a molecule of 1 in a 50/50 mixture is "
      + "surrounded by half 1 and half 2.  In a real liquid that is false "
      + "whenever the molecules prefer each other: ethanol near water sits "
      + "in a neighbourhood richer in water than the bulk is.  Call the "
      + "LOCAL mole fraction x_ji — the fraction of the molecules around a "
      + "central molecule i that are of type j.  Every model on this page "
      + "is one answer to: how is x_ji related to the bulk x_j?",
    assumes: "That a single 'local composition' is a meaningful average — "
      + "that we can speak of the neighbourhood without tracking where "
      + "each neighbour actually is.",
    cites: "the shared premise; each model below implements it differently",
  },
  {
    n: 2,
    title: "Boltzmann does the weighting",
    body: "If sitting next to a j costs energy g_ji rather than g_ii, then "
      + "at equilibrium the neighbourhood is populated by Boltzmann odds:",
    eq: "x_ji / x_ii = ( x_j / x_i ) · exp[ −(g_ji − g_ii) / RT ]",
    after: "That is the whole physical content of the family.  Everything "
      + "that follows is a choice about what to do with it — which excess "
      + "Gibbs energy to build from it, and how many parameters per pair "
      + "the answer is allowed to cost.  Note that ONLY DIFFERENCES of "
      + "energy appear: no model here knows an absolute g, and none needs "
      + "one.",
    assumes: "The energy of a neighbourhood is the sum of independent "
      + "pairwise contributions, and the Boltzmann factor uses the same T "
      + "for all pairs.",
    cites: "Wilson.cpp:226 · NRTL.cpp:356 · UNIQUAC.cpp:238 — each of the "
      + "three exponentials below is this factor, differently dressed",
  },
  {
    n: 3,
    title: "Wilson — the cheapest branch, and what it cannot do",
    body: "Wilson (1964) folds the Boltzmann factor and the size ratio into "
      + "one quantity per ordered pair:",
    eq: "Λ_ij = ( V_j / V_i ) · exp( −A_ij / RT )\n"
      + "ln γ_i = 1 − ln( Σ_j x_j Λ_ij ) − Σ_j [ x_j Λ_ji / Σ_k x_k Λ_jk ]",
    after: "V_j and V_i are the pure LIQUID molar volumes, read from the "
      + "component records — so Wilson costs two energy parameters per "
      + "pair and borrows its size information from data already on the "
      + "shelf.  Its famous limitation is structural, not numerical: no "
      + "choice of A_12 and A_21 makes this expression predict a "
      + "LIQUID-LIQUID SPLIT.  The function simply cannot produce the "
      + "shape.  If your system separates into two liquid phases, Wilson "
      + "is not a bad fit for it — it is the wrong instrument.",
    assumes: "Local volume fractions, not local mole fractions; and "
      + "complete miscibility, which is where the LLE limitation comes "
      + "from rather than from any parameter.",
    cites: "Wilson.cpp:226 (Λ), Wilson.cpp:238-251 (γ)",
  },
  {
    n: 4,
    title: "NRTL — buy back the non-randomness with a third parameter",
    body: "Renon and Prausnitz (1968) keep the local-composition idea but "
      + "add a parameter α that says HOW non-random the neighbourhood is "
      + "(α = 0 recovers a random mixture; typical values are 0.2–0.47). "
      + "Two quantities per ordered pair:",
    eq: "τ_ij = a_ij + b_ij / T           (τ_ii = 0)\n"
      + "G_ij = exp( −α_ij · τ_ij )        (G_ii = 1)\n"
      + "ln γ_i = Σ_j τ_ji G_ji x_j / Σ_k G_ki x_k\n"
      + "       + Σ_j [ x_j G_ij / Σ_k G_kj x_k ]"
      + " · ( τ_ij − Σ_k τ_kj G_kj x_k / Σ_k G_kj x_k )",
    after: "The temperature dependence lives entirely in τ = a + b/T, so a "
      + "pair fitted at one temperature extrapolates by that form and by "
      + "nothing else — which is why the held-out lesson on the comparison "
      + "page matters. The payoff for the third parameter is the one "
      + "Wilson could not buy: NRTL CAN describe two liquid phases, and "
      + "this is why Choupo's extraction and LLE cases use it.",
    assumes: "The non-randomness parameter α is a property of the PAIR and "
      + "is symmetric (α_ij = α_ji), which is a modelling convention, not "
      + "a derived result.",
    cites: "NRTL.cpp:355-358 (τ, G), NRTL.cpp:380-393 (the two terms)",
  },
  {
    n: 5,
    title: "UNIQUAC — split the problem in two before modelling either half",
    body: "Abrams and Prausnitz (1975) make explicit what Wilson smuggled "
      + "in through V_j/V_i: two different things make a mixture "
      + "non-ideal, and they should not share a parameter.  SIZE and SHAPE "
      + "change the entropy even with no energetic preference at all; "
      + "ENERGY does the rest.  So γ is built from two pieces.",
    eq: "φ_i = r_i x_i / Σ_j r_j x_j        θ_i = q_i x_i / Σ_j q_j x_j\n"
      + "l_i = (z/2)(r_i − q_i) − (r_i − 1)\n"
      + "ln γ_i^C = ln(φ_i/x_i) + (z/2) q_i ln(θ_i/φ_i) + l_i"
      + " − (φ_i/x_i) Σ_j x_j l_j\n"
      + "ln γ_i^R = q_i [ 1 − ln( Σ_j θ_j τ_ji ) − Σ_j θ_j τ_ij / Σ_k θ_k τ_kj ]\n"
      + "τ_ij = exp[ −( a_ij + b_ij T + c_ij T² ) / T ]",
    after: "r_i and q_i are volume and surface-area parameters of the "
      + "MOLECULE, tabulated once and reused for every pair it appears in "
      + "— which is the door UNIFAC walks through. The combinatorial half "
      + "is Staverman–Guggenheim, the SAME expression the COSMO-SAC page "
      + "derives: it is not a coincidence and not a borrowing, it is the "
      + "standard lattice answer to 'what does size alone cost?'.  Setting "
      + "c = 0 recovers the usual a + bT form; the quadratic exists so a "
      + "regressed pair can carry it.",
    assumes: "That the size and energy contributions are separable and "
      + "simply add — the same assumption the plus sign makes on the "
      + "COSMO-SAC page, and it is no better justified here.",
    cites: "UNIQUAC.cpp:238 (τ), UNIQUAC.cpp:247-248 (φ, θ), "
      + "UNIQUAC.cpp:273-277 (combinatorial), UNIQUAC.cpp:286 (residual)",
  },
] as const;

export function LocalCompositionTool(): JSX.Element {
  return (
    //  THE SCROLL CONTAINER, and it is not decoration.  A tool renders
    //  into a FLEX parent, so without `flex: 1` + `minHeight: 0` +
    //  `overflowY: auto` the content overflows and everything below the
    //  fold is unreachable -- the page looks finished and is unusable.
    //  `minHeight: 0` is the load-bearing half: a flex child refuses to
    //  shrink below its content without it, so the inner scroll never
    //  engages.  Reported by the owner on the COSMO-SAC page, 2026-08-31.
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
    <Stack gap={14}>
      <Box>
        <Title order={3}>Local composition, derived</Title>
        <Text size="sm" mt={4}>
          Wilson, NRTL and UNIQUAC are not three ideas.  They are{" "}
          <strong>one</strong> idea — that a molecule's neighbourhood is not
          the bulk composition — carried three distances, and each one exists
          because of something the previous one could not do.  Derived here in
          that order, with every equation cited to the line of the engine that
          runs it.
        </Text>
      </Box>

      {LC_STEPS.map((s) => (
        <Box key={s.n}>
          <Title order={5}>{s.n} · {s.title}</Title>
          <Text size="sm" mt={4}>{s.body}</Text>
          {"eq" in s && s.eq && (
            <Box my={8} px="sm" py={8} style={{ borderLeft: `3px solid ${GRID}` }}>
              <Text size="sm" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
                {s.eq}
              </Text>
            </Box>
          )}
          {"after" in s && s.after && <Text size="sm">{s.after}</Text>}
          <Text size="xs" c={INK} mt={6}>
            <strong>Assumed here:</strong> {s.assumes}
          </Text>
          <Text size="xs" c={INK}>
            <strong>In the engine:</strong>{" "}
            <Code style={{ fontSize: 11 }}>{s.cites}</Code>
          </Text>
        </Box>
      ))}

      <Alert variant="light" color="orange"
        title="What happens when a pair has no parameters — and why no textbook tells you">
        <Text size="sm">
          Every model on this page needs numbers fitted to <em>your</em> pair.
          A textbook stops there.  An implementation cannot: it has to do
          something when the pair is not in the catalogue, and what Choupo
          does is run that pair at <Code>τ = 0</Code>, which is{" "}
          <strong>exactly ideal</strong> — γ = 1, Raoult's law, as though the
          molecules had no preference at all.
        </Text>
        <Text size="sm" mt={6}>
          That is a defensible choice and a dangerous one, so it is neither
          silent nor free: the run announces the pair, and if the case has not
          AUTHORISED the substitution the engine <strong>refuses</strong>
          {" "}rather than quietly answering a different question.  A declared
          NRTL system running two of its pairs as ideal is not an NRTL answer,
          and the reader is told so beside the number.
        </Text>
        <Text size="xs" c={INK} mt={6}>
          <Code style={{ fontSize: 11 }}>NRTL.cpp:178, NRTL.cpp:219-245,
          NRTL.cpp:304 · thermo/ApproximationAuthorisation</Code>
        </Text>
      </Alert>

      <Box>
        <Title order={5}>Which one, and the honest answer</Title>
        <Text size="sm" mt={4}>
          If the system stays one liquid phase and you have data for the
          pair, all three will fit it and the choice barely matters.  If it
          splits into two liquid phases, <strong>Wilson cannot</strong> and
          the other two can.  If you have no data for the pair, none of the
          three can help you at all — and that absence, not a preference
          among them, is what sends you to UNIFAC, COSMO-SAC or PC-SAFT,
          each of which buys reach at a price shown on the comparison page.
        </Text>
      </Box>
    </Stack>
    </Box>
  );
}
