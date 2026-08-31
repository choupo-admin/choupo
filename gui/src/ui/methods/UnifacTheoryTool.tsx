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
  UNIFAC, DERIVED -- third page under the textbook ruling (credo §10), and
  deliberately written to be read AFTER `local-composition`: UNIFAC is not a
  new theory, it is UNIQUAC's residual term evaluated one level down, on
  groups instead of molecules.  The page says so rather than re-deriving the
  lattice from scratch, because a student who has just met Staverman-
  Guggenheim twice should be told when they are meeting it a third time.

  Every equation is the one UNIFAC.cpp runs, cited file:line.

  THE GAP PARAGRAPH IS THE POINT OF READING THE SOURCE.  Both this model and
  NRTL fall back to ideal when a parameter is missing, and a page that
  treated those as the same failure would teach the wrong lesson: NRTL's gap
  is "nobody fitted YOUR pair", UNIFAC's is "the PUBLISHED TABLE has holes"
  -- Hansen 1991 genuinely does not report every main-group pair.  Same
  symptom, different problem, different remedy.

  ZERO PHYSICS IN TYPESCRIPT: nothing is computed here.
\*---------------------------------------------------------------------------*/

import { Alert, Box, Code, Stack, Text, Title } from "@mantine/core";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";

export const UNIFAC_STEPS = [
  {
    n: 1,
    title: "The door UNIQUAC left open",
    body: "UNIQUAC's size parameters r_i and q_i belong to the MOLECULE, "
      + "not to the pair — a fact that looks like bookkeeping until you ask "
      + "where they come from.  They come from adding up the molecule's "
      + "pieces.  Ethanol is two CH_x groups and one OH; if every group "
      + "carries a published volume R_k and area Q_k, then",
    eq: "r_i = Σ_k ν_k^(i) R_k        q_i = Σ_k ν_k^(i) Q_k",
    after: "where ν_k^(i) is simply HOW MANY groups of type k molecule i "
      + "contains.  Nothing has been predicted yet — this is still UNIQUAC, "
      + "with its r and q assembled rather than tabulated.  The step that "
      + "makes UNIFAC predictive is the next one.",
    assumes: "That a molecule's volume and surface are the sum of its "
      + "groups', independent of how they are joined.",
    cites: "UNIFAC.cpp:153-154",
  },
  {
    n: 2,
    title: "Solution of groups: forget the molecules",
    body: "Here is the whole idea, and it is audacious.  A mixture of "
      + "molecules is treated as a mixture of GROUPS.  The liquid does not "
      + "contain ethanol and water; it contains so many CH₃, so many CH₂, "
      + "so many OH, so many H₂O, all stirred together.  Interaction "
      + "energies are then needed only between GROUP TYPES — of which there "
      + "are a few dozen — instead of between molecule pairs, of which "
      + "there are millions.  That is the trade, and it is why UNIFAC can "
      + "price a pair nobody has ever measured.",
    assumes: "That a group behaves the same way wherever it sits.  The OH "
      + "in ethanol and the OH in a long-chain alcohol are the same object "
      + "to this model — which is exactly where it fails when the "
      + "neighbouring group matters (proximity effects), and why UNIFAC "
      + "has main groups and subgroups at all.",
    cites: "UNIFAC.cpp:288-292 (the mixture's group census)",
  },
  {
    n: 3,
    title: "The group interaction, and the one temperature dependence",
    body: "Between two group types sits one number a_mn, published in a "
      + "table, asymmetric (a_mn ≠ a_nm), and entering exactly one place:",
    eq: "Ψ_mk = exp( −a_mn / T )      (Ψ = 1 within one main group, a = 0)",
    after: "Groups belonging to the SAME main group — CH₃ and CH₂ both "
      + "belong to main group CH₂ — interact with a = 0, hence Ψ = 1: "
      + "athermally.  A model that distinguished them energetically would "
      + "be claiming that a methyl feels a methylene, which the table does "
      + "not claim.  As in NRTL, temperature enters this model in exactly "
      + "one exponential and nowhere else.",
    assumes: "One number per ordered main-group pair, temperature-"
      + "independent, valid across every molecule those groups appear in.",
    cites: "UNIFAC.cpp:248-254",
  },
  {
    n: 4,
    title: "The group activity coefficient — UNIQUAC's residual, one level down",
    body: "Now the same expression you have already seen, with groups where "
      + "molecules used to be.  Area fractions first, then the activity of "
      + "each group in whatever surroundings it finds:",
    eq: "Θ_m = Q_m X_m / Σ_n Q_n X_n\n"
      + "ln Γ_k = Q_k [ 1 − ln( Σ_m Θ_m Ψ_mk )"
      + " − Σ_m Θ_m Ψ_km / ( Σ_n Θ_n Ψ_nm ) ]",
    after: "Compare it, term for term, with UNIQUAC's residual on the "
      + "local-composition page: it IS that expression, with Θ for θ, Ψ for "
      + "τ, and Q_k for q_i.  UNIFAC did not invent a new theory; it moved "
      + "an existing one down a level, from molecules to their parts.",
    assumes: "Nothing new — this inherits every assumption of UNIQUAC's "
      + "residual term, now applied to groups.",
    cites: "UNIFAC.cpp:257-273",
  },
  {
    n: 5,
    title: "The subtraction that makes it an activity coefficient",
    body: "A group activity is not yet what we want: a group in PURE "
      + "ethanol is already in some environment, and γ must measure the "
      + "change on mixing, not the absolute state.  So solve step 4 twice "
      + "— once for the mixture's group census, once for the census of "
      + "pure i — and subtract:",
    eq: "ln γ_i^R = Σ_k ν_k^(i) [ ln Γ_k − ln Γ_k^(i) ]",
    after: "In pure i the two censuses are identical, every bracket is "
      + "zero, and ln γ_i^R = 0 exactly — the same structural guarantee "
      + "the COSMO-SAC residual has, for the same reason.  The "
      + "combinatorial half is unchanged Staverman-Guggenheim, now with r "
      + "and q assembled from step 1, and γ_i = exp(ln γ_i^C + ln γ_i^R).",
    assumes: "That the two contributions add — the same plus sign, still "
      + "no better justified than on the two previous pages.",
    cites: "UNIFAC.cpp:310-315 (residual), UNIFAC.cpp:299-307 "
      + "(combinatorial), UNIFAC.cpp:317",
  },
] as const;

export function UnifacTheoryTool(): JSX.Element {
  return (
    <Stack gap={14} p="md">
      <Box>
        <Title order={3}>UNIFAC, derived</Title>
        <Text size="sm" mt={4}>
          How to price a pair nobody has ever measured.  Read this after{" "}
          <em>Local composition</em>: UNIFAC is not a new theory but{" "}
          <strong>UNIQUAC's residual term evaluated one level down</strong>,
          on groups instead of molecules — and saying so is more useful than
          deriving the lattice a third time.
        </Text>
      </Box>

      {UNIFAC_STEPS.map((s) => (
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
        title="Two models fall back to ideal, and it is NOT the same failure">
        <Text size="sm">
          On the local-composition page you met NRTL running a pair at{" "}
          <Code>τ = 0</Code> when nobody had fitted it.  UNIFAC does the
          arithmetically identical thing — a missing <Code>a_mn</Code> is
          taken as 0, which makes <Code>Ψ = 1</Code>, an athermal group pair.
          Same symptom.  <strong>Different problem, and a student who
          conflates them will look for the wrong remedy.</strong>
        </Text>
        <Text size="sm" mt={6}>
          NRTL's gap is <em>nobody has fitted YOUR pair</em>: it closes by
          regressing data, and the tree has a fitter for exactly that.
          UNIFAC's gap is <em>the PUBLISHED TABLE has holes</em> — Hansen
          1991 genuinely does not report every main-group pair — so no
          amount of your own data closes it, because the missing number is a
          missing entry in somebody else's matrix.
        </Text>
        <Text size="sm" mt={6}>
          Which is why the engine treats them differently.  Refusing on a
          missing group pair would make hundreds of otherwise usable systems
          unusable, so it runs and <strong>lists every gap by name at
          construction</strong> — once, where the group set is built, never
          inside the flash loop that would print it thousands of times.  The
          gaps are a property of the parameter table, not of the state being
          solved.
        </Text>
        <Text size="xs" c={INK} mt={6}>
          <Code style={{ fontSize: 11 }}>UNIFAC.cpp:162-166, UNIFAC.cpp:176-185,
          UNIFAC.cpp:207-222</Code>
        </Text>
      </Alert>

      <Box>
        <Title order={5}>What it costs, and where it breaks</Title>
        <Text size="sm" mt={4}>
          Predictive here means <strong>no data on your pair was used</strong>,
          never <em>as accurate as a fit</em> — and the comparison page prices
          that difference in kelvin on a real dataset.  The characteristic
          failures follow from step 2's assumption rather than from any
          parameter: molecules whose groups sit close enough to feel each
          other (proximity effects), isomers that decompose into the same
          group list and are therefore the same molecule to this model, and
          anything whose behaviour is dominated by a structure the group
          decomposition cannot see.
        </Text>
      </Box>
    </Stack>
  );
}
