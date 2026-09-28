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

  CORRECTED 2026-09-28, after an external review the owner forwarded,
  each claim checked against PCSAFT.cpp and the flash20 golden before it
  was changed.  ERRORS fixed: "a gamma-model cannot even express a
  supercritical component" (gamma-phi with a Henry standard state for the
  dissolved gas does exactly that, and Choupo ships Henry pairs); "the
  UNIFAC fallback leaves an ideal mixture" (a missing a_mn makes ONE group
  pair athermal; the combinatorial term and every other pair remain -- the
  UNIFAC page's own heading said the same and is corrected with it);
  "flash20 loses to NRTL by only a few per cent" (its golden pins
  K_ethanol 11.47 against 3.896 and V/F 0.649 against 0.512, and the
  reference is a fitted model, not a measurement).  Found here, not in the
  review: the page said "the engine refuses a profile whose declared scheme
  does not match its parameter set" -- it does not; it refuses an UNKNOWN
  scheme and a partial trio, and a mismatched scheme is caught only by the
  mixture witness's golden.  GAPS closed, because a derivation that stops
  before the property is not one: the reduced residual Helmholtz energy
  and the number density are defined; the two dispersion averages are
  written out; the association term is closed from X to a_assoc; and a
  new step takes the surface to pressure, density roots and fugacity --
  saying that the density solver returns candidate roots and that a phase
  equilibrium is the flash's question, not the root finder's.
  DECLINED: re-sequencing the page (spheres -> chains -> attraction ->
  sites is already its order) and a live P(rho) curve, which needs an
  engine witness that scans density, which no propsDict op does today --
  a new feature, recorded in DEV.md rather than faked in TypeScript.

  ZERO PHYSICS IN TYPESCRIPT: nothing is computed here.
\*---------------------------------------------------------------------------*/

import type { ReactNode } from "react";
import { Alert, Box, Code, Stack, Text, Title } from "@mantine/core";

import { Tex } from "./lessonStep.js";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";

/** One derivation step.  `body`, `after` and `assumes` carry their
 *  mathematics between `$` marks; `eq` and `eq2` are displayed equations,
 *  one KaTeX source per line (owner, 2026-09-28: variables are mathematics). */
export interface PcSaftStep {
  n: number;
  title: string;
  body: string;
  eq?: readonly string[];
  after?: string;
  eq2?: readonly string[];
  assumes: string;
  cites: string;
}

export const PCSAFT_STEPS: readonly PcSaftStep[] = [
  {
    n: 1,
    title: "A different kind of model, and it matters before any equation",
    body: "Wilson, NRTL, UNIQUAC, UNIFAC and COSMO-SAC all build an EXCESS "
      + "GIBBS ENERGY and differentiate it to get $\\gamma$.  Not one of them "
      + "knows what a density is: they price the liquid's non-ideality and "
      + "hand the vapour to a separate model.  PC-SAFT (Gross & Sadowski, "
      + "2001) builds a residual HELMHOLTZ energy as a function of "
      + "temperature, density and composition — so one surface gives the "
      + "liquid root, the vapour root, the density of each, and the fugacity "
      + "in both, including for a component above its critical temperature.  "
      + "An activity model can still handle a dissolved supercritical gas, "
      + "but only inside a $\\gamma$–$\\varphi$ approach with a different "
      + "standard state for it (Henry's law) and a separate vapour model; "
      + "the equation of state needs neither.",
    assumes: "Nothing yet — this is a statement about what kind of object "
      + "is being built.",
    cites: "PCSAFT.cpp:193 (the sum that IS the model)",
  },
  {
    n: 2,
    title: "The molecule: a chain of m spheres",
    body: "Three numbers describe a component, and they are not fitted to "
      + "any mixture: $m$, the number of tangent spherical segments in the "
      + "chain; $\\sigma$, their diameter; and $\\varepsilon/k$, the depth of "
      + "the attraction between them.  Methane is a short fat chain, an "
      + "n-alkane a long thin one, and $m$ need not be an integer — it is a "
      + "fitted shape parameter, not a count of atoms.",
    after: "The residual Helmholtz energy is then assembled from physically "
      + "NAMED contributions, which is the whole appeal of the SAFT family "
      + "over a patched cubic: you can point at the term that is failing.  "
      + "Notation, used on the rest of this page: $A^{\\mathrm{res}}$ is the "
      + "residual Helmholtz energy of $N$ molecules (in J), and "
      + "$\\tilde a = A^{\\mathrm{res}}/(NkT)$ its REDUCED, dimensionless form "
      + "— the one the engine computes.  $\\rho = N/V$ is the NUMBER "
      + "density, molecules per m³, so that $\\rho\\sigma^3$ (with "
      + "$\\sigma$ in m) is dimensionless; the engine converts $\\sigma$ from "
      + "the record's ångström on load.",
    eq: ["\\tilde a \\equiv \\frac{A^{\\mathrm{res}}}{NkT} = \\tilde a^{\\mathrm{hc}} + \\tilde a^{\\mathrm{disp}} + \\tilde a^{\\mathrm{assoc}}"],
    assumes: "That the contributions are separable and additive — the same "
      + "plus sign as on the three previous pages, and no better justified "
      + "here either.",
    cites: "PCSAFT.cpp:193 (the sum), PCSAFT.cpp:65 (σ from Å to m)",
  },
  {
    n: 3,
    title: "The hard chain: a reference that already knows about shape",
    body: "Start with hard spheres that cannot overlap and have no "
      + "attraction, then tie them into chains.  First the spheres get a "
      + "TEMPERATURE-DEPENDENT diameter — real molecules are soft, and at "
      + "higher $T$ you can push them closer:",
    eq: [
      "d_i(T) = \\sigma_i \\left[ 1 - 0.12 \\exp\\!\\left( -\\frac{3\\,\\varepsilon_i}{kT} \\right) \\right]",
      "\\zeta_n = \\frac{\\pi}{6}\\, \\rho \\sum_i x_i\\, m_i\\, d_i^{\\,n} \\qquad (n = 0,1,2,3)",
      "\\eta = \\zeta_3 \\quad \\text{(the packing fraction: the fraction of space filled)}",
    ],
    after: "The four $\\zeta$ moments carry everything the hard-sphere "
      + "mixture needs; $\\tilde a^{\\mathrm{hs}}$ is the "
      + "Boublík–Mansoori–Carnahan–Starling–Leland expression in them, and "
      + "the chain correction subtracts the cost of bonding segments "
      + "together, weighted by the radial distribution function at contact "
      + "($\\bar m = \\sum_i x_i m_i$ is the mean chain length):",
    eq2: ["\\tilde a^{\\mathrm{hc}} = \\bar m\\, \\tilde a^{\\mathrm{hs}} - \\sum_i x_i\\, (m_i - 1) \\ln g_{ii}^{\\mathrm{hs}}(d_{ii})"],
    assumes: "Chains are freely jointed — the segments have no preferred "
      + "angle, so PC-SAFT cannot distinguish a branched isomer from a "
      + "linear one of the same $m$, $\\sigma$, $\\varepsilon$.",
    cites: "PCSAFT.cpp:133 (d), PCSAFT.cpp:136-138 (ζ, η), "
      + "PCSAFT.cpp:142-145 (ã_hs), PCSAFT.cpp:148-156 (ã_hc)",
  },
  {
    n: 4,
    title: "Dispersion: switch the attraction back on",
    body: "The attraction is added as a perturbation on the hard chain, "
      + "through two integrals that Gross and Sadowski fitted as power "
      + "series in the packing fraction with $\\bar m$-dependent "
      + "coefficients:",
    eq: [
      "I_1(\\eta,\\bar m) = \\sum_{n=0}^{6} a_n(\\bar m)\\, \\eta^n \\qquad I_2(\\eta,\\bar m) = \\sum_{n=0}^{6} b_n(\\bar m)\\, \\eta^n",
      "\\tilde a^{\\mathrm{disp}} = -2\\pi\\rho\\, I_1\\, \\overline{m^2 \\varepsilon \\sigma^3} - \\pi\\rho\\, \\bar m\\, C_1\\, I_2\\, \\overline{m^2 \\varepsilon^2 \\sigma^3}",
    ],
    after: "$C_1$ is a compressibility term of the hard chain, written out in "
      + "full in the source.  The two overlined averages are where the "
      + "MIXTURE enters, and they are double sums over pairs, with the "
      + "energy REDUCED by $kT$ so that each term is dimensionless once "
      + "multiplied by $\\rho$:",
    eq2: [
      "\\overline{m^2 \\varepsilon \\sigma^3} = \\sum_i \\sum_j x_i x_j\\, m_i m_j \\left(\\frac{\\varepsilon_{ij}}{kT}\\right) \\sigma_{ij}^3 \\qquad \\overline{m^2 \\varepsilon^2 \\sigma^3} = \\sum_i \\sum_j x_i x_j\\, m_i m_j \\left(\\frac{\\varepsilon_{ij}}{kT}\\right)^{\\!2} \\sigma_{ij}^3",
      "\\sigma_{ij} = \\tfrac12 (\\sigma_i + \\sigma_j) \\qquad \\varepsilon_{ij} = \\sqrt{\\varepsilon_i \\varepsilon_j}\\,(1 - k_{ij})",
    ],
    assumes: "That the perturbation series, fitted to n-alkane data, "
      + "transfers to whatever molecule you give it; and the van der Waals "
      + "one-fluid combining rules above, with at most one correction "
      + "$k_{ij}$ per binary.",
    cites: "PCSAFT.cpp:168 (I₁, I₂), PCSAFT.cpp:170-173 (C₁), "
      + "PCSAFT.cpp:176-187 (the averages and ã_disp)",
  },
  {
    n: 5,
    title: "Association: hydrogen bonds as a chemical equilibrium of sites",
    body: "For water, alcohols and acids the dispersion term is not enough: "
      + "much of the physics IS the directional bond.  Wertheim's "
      + "first-order theory puts discrete SITES on the segments and asks "
      + "what fraction of each site type is still unbonded.  Two parameters "
      + "per component — the bond energy $\\varepsilon^{AB}/k$ and the "
      + "bonding volume $\\kappa^{AB}$ — plus a SCHEME saying how many donor "
      + "and acceptor sites there are ($2B$: one of each; $4C$: two of "
      + "each).",
    eq: [
      "\\Delta^{AB}_{ij} = g_{ij}^{\\mathrm{hs}}\\, \\sigma_{ij}^3\\, \\kappa^{AB}_{ij} \\left[ \\exp\\!\\left(\\frac{\\varepsilon^{AB}_{ij}}{kT}\\right) - 1 \\right]",
      "X^A_i = \\frac{1}{1 + \\rho \\sum_j x_j \\sum_B X^B_j\\, \\Delta^{AB}_{ij}} \\qquad \\text{(solved as a fixed point)}",
    ],
    after: "$X^A_i$ appears on both sides: the fraction of free sites "
      + "depends on how many other sites are free, exactly as COSMO-SAC's "
      + "segment activity did.  Cross-association between different "
      + "molecules uses the Wolbach–Sandler rules — the energies averaged, "
      + "the volumes combined geometrically — which is how ethanol's OH "
      + "finds water's.  Once the fixed point has converged, the site "
      + "fractions CLOSE into the association contribution, summed over "
      + "the sites $A$ of each molecule ($M_i$ of them in all):",
    eq2: ["\\tilde a^{\\mathrm{assoc}} = \\sum_i x_i \\left[ \\sum_{A \\in i} \\left( \\ln X^A_i - \\frac{X^A_i}{2} \\right) + \\frac{M_i}{2} \\right]"],
    assumes: "One bond per site (TPT1), no ring formation, and sites within "
      + "a class treated as equivalent.",
    cites: "PCSAFT.cpp:244 (Δ), PCSAFT.cpp:268 (the damped fixed point), "
      + "PCSAFT.cpp:285-287 (the closure to ã_assoc), PCSAFT.cpp:189-194 "
      + "(strict add-on: with no associating component the term is never "
      + "evaluated and the arithmetic is byte-identical to the "
      + "pre-association path)",
  },
  {
    n: 6,
    title: "From the surface to what a flash needs: pressure, density, fugacity",
    body: "Everything so far is one function, $\\tilde a(T, \\rho, x)$.  The "
      + "properties are its derivatives.  Differentiate with respect to "
      + "density and you have the compressibility factor and the pressure; "
      + "differentiate $N\\tilde a$ with respect to the amount of one "
      + "component, at fixed $T$ and $V$, and you have its residual chemical "
      + "potential and hence its fugacity coefficient:",
    eq: [
      "Z = 1 + \\rho \\left( \\frac{\\partial \\tilde a}{\\partial \\rho} \\right)_{T,x} \\qquad P = \\rho\\, k T\\, Z",
      "\\ln \\varphi_i = \\frac{\\mu^{\\mathrm{res}}_i}{kT} - \\ln Z, \\qquad \\frac{\\mu^{\\mathrm{res}}_i}{kT} = \\left( \\frac{\\partial (N \\tilde a)}{\\partial N_i} \\right)_{T,V,N_{j \\ne i}}",
    ],
    after: "To use it at a given $(T, P)$ the engine turns the first line "
      + "around: it scans the packing fraction for every density at which "
      + "$P(\\rho)$ equals the requested pressure, and there can be one root "
      + "or three.  The smallest is the vapour-like root and the largest "
      + "the liquid-like one; a middle root has $\\partial P/\\partial\\rho < "
      + "0$ — compress it and its pressure FALLS — so it is mechanically "
      + "unstable and is never used.  Two roots are two CANDIDATE phases, "
      + "not an equilibrium: which phases exist, and in what amounts, is "
      + "decided by the flash, which requires every component's fugacity to "
      + "be equal in the phases it keeps.  (Both derivatives are taken "
      + "numerically, by central differences of the analytic $\\tilde a$, "
      + "and a verification step checks them against identities the exact "
      + "derivatives must satisfy.)",
    assumes: "That the root finder's scan is fine enough to see every sign "
      + "change of $P(\\rho) - P$ below the closest-packing limit "
      + "$\\eta < 0.74$; a state with no root there is refused as outside "
      + "the model's domain.",
    cites: "PCSAFT.cpp:298 (∂ã/∂ρ), PCSAFT.cpp:311-346 (the root scan and "
      + "which root is taken), PCSAFT.cpp:380-405 (ln φ from the "
      + "mole-number derivative at fixed V)",
  },
];

// ---- visual pieces ----------------------------------------------------------

function M({ t }: { t: string }): JSX.Element {
  return <Tex src={t} mode="inline" />;
}

/** Prose with its mathematics between `$` marks. */
function Md({ s }: { s: string }): JSX.Element {
  return (
    <>
      {s.split("$").map((part, i) => (i % 2 === 1
        ? <Tex key={i} src={part} mode="inline" />
        : <span key={i}>{part}</span>))}
    </>
  );
}

function Eqs({ lines }: { lines: readonly string[] }): JSX.Element {
  return (
    <Box my={8} px="sm" py={4} style={{ borderLeft: `3px solid ${GRID}` }}>
      {lines.map((l) => <Tex key={l} src={l} mode="display" />)}
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
          <Code>src/thermo/equationOfState/PCSAFT.cpp</Code> executes.  A
          non-associating fluid is the place to meet it first:
          {" "}<Code>props/molecular/pcsaft01_pure_nhexane</Code> runs steps
          1–4 and 6 alone, before water and ethanol add step 5.
        </Text>
      </Box>

      {PCSAFT_STEPS.map((s) => (
        <Box key={s.n}>
          <Title order={5}>{s.n} · {s.title}</Title>
          <Text size="sm" mt={4}><Md s={s.body} /></Text>
          {s.eq && <Eqs lines={s.eq} />}
          {s.after && <Text size="sm"><Md s={s.after} /></Text>}
          {s.eq2 && <Eqs lines={s.eq2} />}
          <Text size="xs" c={INK} mt={6}>
            <strong>Assumed here:</strong> <Md s={s.assumes} />
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
          it are one object</em>.  Pair the published
          {" "}<M t="\varepsilon^{AB}" /> and <M t="\kappa^{AB}" /> with a
          different scheme and you are quoting the authors under a model they
          did not use.
        </Text>
        <Text size="sm" mt={6}>
          This is not hypothetical.  Water WAS curated here as 4C.  It{" "}
          <strong>passed a pure-density anchor</strong> — by coincidence,
          because a pure fluid can absorb the error into the other
          parameters — while the ethanol/water mixture flash collapsed to
          {" "}<M t="K_{\mathrm{water}} = 0.0044" />.  A mixture witness
          catches what a pure anchor cannot, which is why
          {" "}<Code>flash20_ethanol_water_pcsaft</Code> exists and pins the
          mixture’s K-values.  The engine itself cannot tell: it refuses an
          UNKNOWN scheme and a partial parameter trio, but a record does not
          say which scheme its numbers were regressed under, so a known
          scheme paired with the wrong numbers runs — and only the mixture
          witness’s golden fails.
        </Text>
      </Alert>

      <Alert variant="light"
        title="k_ij = 0, and why this absence is milder than the others">
        <Text size="sm">
          A binary with no <M t="k_{ij}" /> runs at zero, announced.  On the
          local-composition page you met NRTL running a pair at
          {" "}<M t="\tau = 0" />, which for that pair is exactly ideal; on
          the UNIFAC page a missing group pair runs at
          {" "}<M t="\Psi = 1" />, which makes that one GROUP pair athermal
          while the combinatorial term and every other group pair stay.
          Both drop a fitted interaction and put nothing in its place.
        </Text>
        <Text size="sm" mt={6}>
          Here the fallback is different in kind, not just in degree.  The
          interaction is still fully present: it comes from the two
          components’ own <M t="m" />, <M t="\sigma" /> and
          {" "}<M t="\varepsilon" /> through
          {" "}<M t="\sqrt{\varepsilon_i \varepsilon_j}" />.
          {" "}<M t="k_{ij}" /> is a <strong>correction</strong> to that
          estimate, so <M t="k_{ij} = 0" /> is a genuine prediction rather
          than a surrender — which is exactly what “predictive” means for
          this model.
        </Text>
        <Text size="sm" mt={6}>
          How good a prediction is a separate, measured question, and
          {" "}<Code>flash20</Code> answers it for one state: at 358.15 K and
          1 atm its golden pins the predictive PC-SAFT flash at
          {" "}<M t="V/F = 0.649" /> against 0.512 for the fitted NRTL, and
          the converged <M t="K_{\mathrm{ethanol}} = 11.47" /> against
          3.896 (<M t="K_{\mathrm{water}}" /> 0.581 against 0.602).  That is
          not “a few per cent”, and the reference is itself a model fitted
          to ethanol/water data, not a measurement at this state — so it
          measures the distance between a prediction and a fit, which is
          the honest thing it can say.
        </Text>
      </Alert>

      <Box>
        <Title order={5}>Check yourself</Title>
        <Check
          q="Does k_ij = 0 switch the attraction between two components off?"
          a={<>No.  The cross energy is still
            {" "}<M t="\sqrt{\varepsilon_i\varepsilon_j}" />, the combining
            rule’s estimate; <M t="k_{ij}" /> only corrects it.</>} />
        <Check
          q="Water’s parameters were fitted with scheme 2B. Is the same set with scheme 4C the same fit?"
          a={<>No.  The site count and <M t="\varepsilon^{AB}" />,
            {" "}<M t="\kappa^{AB}" /> were regressed together; with 4C the
            association term is a different function of the same numbers.</>} />
        <Check
          q="If the model reproduces a pure liquid’s density, is its mixture equilibrium validated?"
          a={<>No.  A pure fluid can absorb an error into its other
            parameters, as water under 4C did; only a mixture witness tests
            the mixture.</>} />
        <Check
          q="The density solver found two roots at (T, P). Is that a vapour–liquid equilibrium?"
          a={<>No.  They are two candidate phases.  Equilibrium needs every
            component’s fugacity equal across the phases, and that is what
            the flash solves.</>} />
      </Box>

      <Box>
        <Title order={5}>What it does not do</Title>
        <Text size="sm" mt={4}>
          Freely-jointed chains cannot see branching, so isomers sharing
          {" "}<M t="m" />, <M t="\sigma" /> and <M t="\varepsilon" /> are
          the same substance to this model.  The dispersion series was fitted
          to n-alkanes and is extrapolated everywhere else.  And the
          parameters, though not fitted to your MIXTURE, were still fitted to
          something — usually pure vapour pressure and liquid density — so a
          component far from that evidence is being extrapolated too,
          quietly.
        </Text>
      </Box>
    </Stack>
    </Box>
  );
}
