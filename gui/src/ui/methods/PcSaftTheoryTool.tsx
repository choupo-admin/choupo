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
  PC-SAFT, DERIVED -- fourth page under the textbook ruling (credo §10), and
  the first one on this shelf that is an EQUATION OF STATE rather than an
  activity model.  That difference is the page's opening move: the three
  previous pages all built an excess Gibbs energy and differentiated it for
  gamma, and none of them knows what a density is.  This one builds a
  residual Helmholtz energy and gets BOTH phases, the density included, from
  one surface.

  Every equation is the one PCSAFT.cpp runs, cited file:line.

  THE SCHEME STORY IS THE PAGE'S SHARPEST LESSON and it is this project's
  own, recorded in CLAUDE.md: water curated as 4C instead of the paper's 2B
  passed a PURE-DENSITY anchor by coincidence while the ethanol/water
  mixture flash collapsed to K_water = 0.0044.  A mixture witness catches
  what a pure anchor cannot.  It is told here because a student who believes
  the association scheme is a detail will make exactly that mistake.

  ZERO PHYSICS IN TYPESCRIPT: nothing is computed here.
\*---------------------------------------------------------------------------*/

import { Alert, Box, Code, Stack, Text, Title } from "@mantine/core";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";

export const PCSAFT_STEPS = [
  {
    n: 1,
    title: "A different kind of model, and it matters before any equation",
    body: "Wilson, NRTL, UNIQUAC, UNIFAC and COSMO-SAC all build an EXCESS "
      + "GIBBS ENERGY and differentiate it to get γ.  Not one of them knows "
      + "what a density is: they price the liquid's non-ideality and hand "
      + "the vapour to a separate model.  PC-SAFT (Gross & Sadowski, 2001) "
      + "builds a residual HELMHOLTZ energy as a function of temperature, "
      + "density and composition — so one surface gives the liquid root, "
      + "the vapour root, the density of each, and the fugacity in both.  "
      + "That is why it can flash a supercritical component, which a γ-model "
      + "cannot even express.",
    assumes: "Nothing yet — this is a statement about what kind of object "
      + "is being built.",
    cites: "PCSAFT.cpp:193-194 (the sum that IS the model)",
  },
  {
    n: 2,
    title: "The molecule: a chain of m spheres",
    body: "Three numbers describe a component, and they are not fitted to "
      + "any mixture: m, the number of tangent spherical segments in the "
      + "chain; σ, their diameter; and ε/k, the depth of the attraction "
      + "between them.  Methane is a short fat chain, an n-alkane a long "
      + "thin one, and m need not be an integer — it is a fitted shape "
      + "parameter, not a count of atoms.",
    after: "The residual Helmholtz energy is then assembled from physically "
      + "NAMED contributions, which is the whole appeal of the SAFT family "
      + "over a patched cubic: you can point at the term that is failing.",
    eq: "a_res / NkT = a_hc + a_disp + a_assoc",
    assumes: "That the contributions are separable and additive — the same "
      + "plus sign as on the three previous pages, and no better justified "
      + "here either.",
    cites: "PCSAFT.cpp:193-194",
  },
  {
    n: 3,
    title: "The hard chain: a reference that already knows about shape",
    body: "Start with hard spheres that cannot overlap and have no "
      + "attraction, then tie them into chains.  First the spheres get a "
      + "TEMPERATURE-DEPENDENT diameter — real molecules are soft, and at "
      + "higher T you can push them closer:",
    eq: "d_i(T) = σ_i [ 1 − 0.12 exp( −3 ε_i/kT ) ]\n"
      + "ζ_n = (π/6) ρ Σ_i x_i m_i d_i^n            (n = 0,1,2,3)\n"
      + "η = ζ_3   (the packing fraction — the fraction of space filled)",
    after: "The four ζ moments carry everything the hard-sphere mixture "
      + "needs; a_hs is the Boublík–Mansoori–Carnahan–Starling–Leland "
      + "expression in them, and the chain correction subtracts the cost of "
      + "bonding segments together, weighted by the radial distribution "
      + "function at contact:",
    eq2: "a_hc = m̄ · a_hs − Σ_i x_i (m_i − 1) ln g_ii^hs(d_ii)",
    assumes: "Chains are freely jointed — the segments have no preferred "
      + "angle, so PC-SAFT cannot distinguish a branched isomer from a "
      + "linear one of the same m, σ, ε.",
    cites: "PCSAFT.cpp:133 (d), PCSAFT.cpp:136-139 (ζ, η), "
      + "PCSAFT.cpp:142-146 (a_hs), PCSAFT.cpp:148-156 (a_hc)",
  },
  {
    n: 4,
    title: "Dispersion: switch the attraction back on",
    body: "The attraction is added as a perturbation on the hard chain, "
      + "through two integrals that Gross and Sadowski fitted as power "
      + "series in the packing fraction with m-dependent coefficients:",
    eq: "I₁(η,m̄) = Σ_{n=0}^{6} a_n(m̄) η^n     I₂(η,m̄) = Σ_{n=0}^{6} b_n(m̄) η^n\n"
      + "a_disp = −2πρ I₁ ⟨m²εσ³⟩ − πρ m̄ C₁ I₂ ⟨m²ε²σ³⟩",
    after: "C₁ is a compressibility factor of the hard chain, written out "
      + "in full in the source.  The two bracketed averages are where the "
      + "MIXTURE enters, by the same van der Waals one-fluid rule the "
      + "cubics use: σ_ij = ½(σ_i + σ_j) and ε_ij = √(ε_i ε_j)(1 − k_ij).  "
      + "So a mixture costs at most one number per binary — and usually "
      + "zero, see the note below.",
    assumes: "That the perturbation series, fitted to n-alkane data, "
      + "transfers to whatever molecule you give it.",
    cites: "PCSAFT.cpp:167-168 (I₁, I₂), PCSAFT.cpp:170-173 (C₁), "
      + "PCSAFT.cpp:176-187 (mixing and a_disp)",
  },
  {
    n: 5,
    title: "Association: hydrogen bonds as a chemical equilibrium of sites",
    body: "For water, alcohols and acids the dispersion term is not enough: "
      + "much of the physics IS the directional bond.  Wertheim's first-"
      + "order theory puts discrete SITES on the segments and asks what "
      + "fraction of each site type is still unbonded.  Two parameters per "
      + "component — the bond energy ε^AB/k and the bonding volume κ^AB — "
      + "plus a SCHEME saying how many donor and acceptor sites there are.",
    eq: "Δ^AB_ij = g_ij^hs σ_ij³ κ^AB_ij [ exp(ε^AB_ij / kT) − 1 ]\n"
      + "X^A = 1 / ( 1 + ρ Σ_j x_j Σ_B X^B Δ^AB )     ← solved as a fixed point",
    after: "X^A appears on both sides: the fraction of free sites depends "
      + "on how many other sites are free, exactly as COSMO-SAC's segment "
      + "activity did.  Cross-association between different molecules uses "
      + "the Wolbach–Sandler rules — the energies averaged, the volumes "
      + "combined geometrically — which is how ethanol's OH finds water's.",
    assumes: "One bond per site (TPT1), no ring formation, and sites within "
      + "a class treated as equivalent.",
    cites: "PCSAFT.cpp:207-250 (Δ and the X fixed point), "
      + "PCSAFT.cpp:189-194 (strict add-on: with no associating component "
      + "the term is never evaluated and the arithmetic is byte-identical "
      + "to the pre-association path)",
  },
] as const;

export function PcSaftTheoryTool(): JSX.Element {
  return (
    //  The scroll container the 23 working pages carry; minHeight: 0 is the
    //  load-bearing half (2026-08-31, owner found three pages frozen).
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
    <Stack gap={14}>
      <Box>
        <Title order={3}>PC-SAFT, derived</Title>
        <Text size="sm" mt={4}>
          The first model on this shelf that is an <strong>equation of
          state</strong> rather than an activity model — and that difference
          is not a technicality, it is what lets one surface give you both
          phases and their densities.  Every equation is the one{" "}
          <Code>src/thermo/equationOfState/PCSAFT.cpp</Code> executes.
        </Text>
      </Box>

      {PCSAFT_STEPS.map((s) => (
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
          {"eq2" in s && s.eq2 && (
            <Box my={8} px="sm" py={8} style={{ borderLeft: `3px solid ${GRID}` }}>
              <Text size="sm" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
                {s.eq2}
              </Text>
            </Box>
          )}
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
        title="The association scheme is part of the FIT — paid for once, in this repository">
        <Text size="sm">
          A student meeting <Code>assocScheme</Code> naturally reads it as a
          structural fact: water has two lone pairs and two hydrogens, so
          surely it is <strong>4C</strong>.  The Gross &amp; Sadowski 2002
          parameter set that Choupo ships was regressed with water as{" "}
          <strong>2B</strong>, and <em>the site count and the numbers beside
          it are one object</em>.  Pair the published ε^AB and κ^AB with a
          different scheme and you are quoting the authors under a model they
          did not use.
        </Text>
        <Text size="sm" mt={6}>
          This is not hypothetical.  Water WAS curated here as 4C.  It{" "}
          <strong>passed a pure-density anchor</strong> — by coincidence,
          because a pure fluid can absorb the error into the other
          parameters — while the ethanol/water mixture flash collapsed to
          K_water = 0.0044.  A mixture witness catches what a pure anchor
          cannot, which is why <Code>flash20_ethanol_water_pcsaft</Code>{" "}
          exists and why the engine refuses a profile whose declared scheme
          does not match its parameter set.
        </Text>
      </Alert>

      <Alert variant="light"
        title="k_ij = 0, and why this absence is milder than the others">
        <Text size="sm">
          A binary with no <Code>k_ij</Code> runs at zero, announced.  On the
          local-composition page you met NRTL falling back to τ = 0, and on
          the UNIFAC page a missing group pair falling back to Ψ = 1 — and
          both of those throw away <em>the entire interaction</em>, leaving
          an ideal mixture.
        </Text>
        <Text size="sm" mt={6}>
          Here the fallback is different in kind, not just in degree.  The
          interaction is still fully present: it comes from the two
          components' own m, σ and ε through √(ε_i ε_j).  <Code>k_ij</Code>
          {" "}is a <strong>correction</strong> to that estimate, so k_ij = 0
          is a genuine prediction rather than a surrender — which is exactly
          what "predictive" means for this model, and why{" "}
          <Code>flash20</Code> can compare it against fitted NRTL and lose by
          only a few per cent.
        </Text>
      </Alert>

      <Box>
        <Title order={5}>What it does not do</Title>
        <Text size="sm" mt={4}>
          Freely-jointed chains cannot see branching, so isomers sharing m, σ
          and ε are the same substance to this model.  The dispersion series
          was fitted to n-alkanes and is extrapolated everywhere else.  And
          the parameters, though not fitted to your MIXTURE, were still
          fitted to something — usually pure vapour pressure and liquid
          density — so a component far from that evidence is being
          extrapolated too, quietly.
        </Text>
      </Box>
    </Stack>
    </Box>
  );
}
