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
  COSMO-SAC, DERIVED -- the first page written under the owner's ruling of
  2026-08-31 (gui-credo §10): EduTools replace the textbook, so a model is
  presented by DERIVING it, not by describing what it knows.  The occasion
  was this model's card in `four-ways-mixture`: five fields and one
  paragraph, correct against the old bar and empty against this one.

  THE COMPARISON PAGE STAYS AND IS NOT DUPLICATED.  `four-ways-mixture`
  answers "which rung should I stand on and what did it know"; this page
  answers "where does that number come from".  Two questions, two pages, and
  the comparison card links here rather than growing a derivation of its own.

  EVERY EQUATION HERE IS THE ONE THE ENGINE RUNS, cited to file:line in
  `src/thermo/activityCoefficient/CosmoSac.cpp`.  That requirement is not
  bureaucracy: writing this page meant READING that file, which is where the
  constants below (and the fact that the segment equation is implicit and
  damped) came from.  If the implementation moves, these citations are what
  makes the page falsifiable rather than merely old.

  ZERO PHYSICS IN TYPESCRIPT.  Nothing on this page is computed here.  The
  constants are quoted from the source with their units; the live numbers
  come from the witness run.

  LICENCE HONESTY, inherited and restated rather than assumed known: the
  public tree ships SYNTHETIC teaching surrogates for the sigma profiles
  (the VT-2005 set cannot be redistributed), so the shipped run demonstrates
  the MECHANISM and its numbers are not validated against measurement.  A
  reader's own copy installs via bin/choupo-import-cosmo.
\*---------------------------------------------------------------------------*/

import { Alert, Box, Code, Group, Loader, Stack, Text, Title }
  from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";

export const COSMO_WITNESS = "props/molecular/cosmoSAC01_water_ethanol";

/** The constants the engine compiles in, quoted with their units and the line
 *  that declares them.  A reader redoing an exchange energy by hand needs
 *  every one of these, and a page that shows the equation without them is
 *  showing a shape, not a model. */
export const COSMO_CONSTANTS = [
  { sym: "a_eff", val: "7.5", unit: "Å²", what: "effective segment area",
    line: "CosmoSac.cpp:18" },
  { sym: "α'", val: "16466.72", unit: "kcal·Å⁴/(mol·e²)",
    what: "misfit constant", line: "CosmoSac.cpp:19" },
  { sym: "c_HB", val: "85580", unit: "kcal·Å⁴/(mol·e²)",
    what: "hydrogen-bond constant", line: "CosmoSac.cpp:20" },
  { sym: "σ_HB", val: "0.0084", unit: "e/Å²",
    what: "hydrogen-bond cutoff — below it, no H-bond term at all",
    line: "CosmoSac.cpp:21" },
  { sym: "z", val: "10", unit: "—", what: "coordination number",
    line: "CosmoSac.cpp:22" },
  { sym: "r₀", val: "66.69", unit: "Å³", what: "volume normalisation",
    line: "CosmoSac.cpp:23" },
  { sym: "q₀", val: "79.53", unit: "Å²", what: "area normalisation",
    line: "CosmoSac.cpp:24" },
  { sym: "R", val: "0.001987", unit: "kcal/(mol·K)",
    what: "gas constant, in the units the constants above are fitted in",
    line: "CosmoSac.cpp:25" },
] as const;

/** The derivation, in the order the engine performs it.  Each step names the
 *  ASSUMPTION it makes at the moment it is made -- a derivation that hides
 *  its assumptions until a "limitations" section at the end has taught the
 *  reader that they are optional. */
export const COSMO_STEPS = [
  {
    n: 1,
    title: "A molecule is a charged surface, not a sphere with a parameter",
    body: "Every other activity model on the comparison page describes a "
      + "molecule by numbers fitted to how it BEHAVES — an interaction "
      + "energy, a group count, a segment diameter.  COSMO-SAC starts one "
      + "level down.  A quantum-chemistry calculation places the molecule "
      + "in a perfect conductor, which screens its charge exactly, and "
      + "reads off the screening charge density σ at every point of the "
      + "cavity surface.  Nothing about a mixture has been used yet: this "
      + "is a property of ONE molecule, computed once, forever.",
    assumes: "The conductor screening is a good stand-in for a real "
      + "solvent, and the correction back to reality is the pairwise "
      + "energy of step 3.",
    cites: "the cosmo{} block on each component record",
  },
  {
    n: 2,
    title: "Collapse the surface into a σ-profile",
    body: "The geometry is thrown away and only the STATISTICS are kept: "
      + "p_i(σ) is how much of molecule i's surface carries charge density "
      + "σ, tabulated on a fixed grid of 51 points from −0.025 to 0.025 "
      + "e/Å² in steps of 0.001.  Together with the cavity area A_i and "
      + "volume V_i, that profile is the WHOLE input — no binary data, no "
      + "group table, nothing fitted to this pair.",
    assumes: "Where a segment sits on the molecule does not matter, only "
      + "how much charge density it carries.  This is why COSMO-SAC cannot "
      + "distinguish isomers whose profiles coincide.",
    cites: "CosmoSac.cpp:26-27 (grid), CosmoSac.cpp:88-92 (area, volume, "
      + "profile read per component)",
  },
  {
    n: 3,
    title: "Restore reality: what it costs to put two segments together",
    body: "In the conductor every segment was screened perfectly.  In a "
      + "real liquid a segment of density σ_m must sit against some "
      + "segment of density σ_n, and unless they cancel, that costs "
      + "energy.  Two terms, and the second is zero almost everywhere.",
    eq: "ΔW(σ_m, σ_n) = (α'/2)(σ_m + σ_n)²\n"
      + "              + c_HB · max(0, σ_acc − σ_HB) · min(0, σ_don + σ_HB)",
    after: "The first term is the MISFIT: it punishes two segments whose "
      + "charges do not cancel, and it is symmetric — two positives cost "
      + "as much as two negatives.  The second is the HYDROGEN BOND, "
      + "written with σ_acc = max(σ_m,σ_n) and σ_don = min(σ_m,σ_n): it "
      + "is non-zero only when one segment is more positive than +σ_HB "
      + "AND the other more negative than −σ_HB, and then it is NEGATIVE "
      + "— an attraction.  That single product is why water and ethanol "
      + "behave unlike water and hexane in this model, and it is switched "
      + "on by a cutoff of 0.0084 e/Å², not by anyone declaring that a "
      + "hydrogen bond exists.",
    assumes: "Interactions are PAIRWISE between surface segments and "
      + "independent of what the rest of either molecule is doing.",
    cites: "CosmoSac.cpp:103-107",
  },
  {
    n: 4,
    title: "The segment activity coefficient — and it is implicit",
    body: "Now ask: in a liquid whose surface has the composite profile "
      + "p(σ), how much is a segment of density σ_m disfavoured?  The "
      + "answer depends on what it will meet, which depends on how "
      + "disfavoured THOSE segments are — so the equation contains itself.",
    eq: "Γ(σ_m) = 1 / Σ_n p(σ_n) · Γ(σ_n) · exp( −ΔW(σ_m,σ_n) / RT )",
    after: "This is a fixed point, not a formula: the engine starts from "
      + "Γ ≡ 1, sweeps the grid, and averages the new estimate with the "
      + "old one half-and-half — damping, without which it oscillates — "
      + "until no Γ moves by more than 1e-8, giving up after 500 sweeps.  "
      + "It is worth seeing that the ONLY place temperature enters this "
      + "model is the RT in that exponential.  The σ-profiles do not "
      + "depend on T, and neither does ΔW.",
    assumes: "The liquid is a random mixture of surface segments — each "
      + "segment sees the AVERAGE composition of the mixture's surface, "
      + "never a preferred neighbour.",
    cites: "CosmoSac.cpp:118-133",
  },
  {
    n: 5,
    title: "The residual part: move each molecule's segments into the mixture",
    body: "Solve step 4 twice.  Once for the MIXTURE's composite profile "
      + "p_S(σ) — the area-weighted average over all components — and once "
      + "for the pure component's own profile p_i(σ).  The residual "
      + "activity coefficient is the cost of moving molecule i's segments "
      + "from the second environment to the first, one segment at a time:",
    eq: "ln γ_i^res = (A_i / a_eff) · Σ_k p_i(σ_k) · [ ln Γ_S(σ_k) − ln Γ_i(σ_k) ]",
    after: "Read the prefactor: A_i/a_eff is simply HOW MANY segments "
      + "molecule i has.  And read the difference: if the mixture's "
      + "environment is identical to the pure one, every bracket is zero "
      + "and ln γ_i^res = 0 exactly.  That is not a numerical coincidence "
      + "— it is why a pure component returns γ = 1 to machine precision, "
      + "which the witness checks.",
    assumes: "Nothing new; this step is bookkeeping over steps 3 and 4.",
    cites: "CosmoSac.cpp:138-149 (mixture profile), CosmoSac.cpp:167-173",
  },
  {
    n: 6,
    title: "The combinatorial part: molecules are different sizes",
    body: "Even with no energetic preference at all, mixing molecules of "
      + "different size and shape changes the entropy.  COSMO-SAC borrows "
      + "the Staverman–Guggenheim expression the UNIQUAC family uses, with "
      + "the size and area parameters taken from the SAME cavity the "
      + "σ-profile came from rather than from a separate table:",
    eq: "r_i = V_i / r₀ ,   q_i = A_i / q₀ ,   l_i = (z/2)(r_i − q_i) − (r_i − 1)\n"
      + "ln γ_i^comb = ln(φ_i/x_i) + (z/2) q_i ln(θ_i/φ_i) + l_i "
      + "− (φ_i/x_i) Σ_j x_j l_j",
    after: "The engine forms φ_i/x_i and θ_i/x_i as ratios and never "
      + "divides by x_i, so the expression stays finite at infinite "
      + "dilution — the limit where an activity coefficient matters most "
      + "and where a naive transcription of this formula returns NaN.",
    assumes: "The entropy of mixing depends on volume and surface area "
      + "only, through the lattice picture Staverman and Guggenheim "
      + "derived it in.",
    cites: "CosmoSac.cpp:151-162, CosmoSac.cpp:175-183",
  },
  {
    n: 7,
    title: "Put them together",
    eq: "ln γ_i = ln γ_i^comb + ln γ_i^res",
    body: "That is the whole model.  Two σ-profiles, two areas, two "
      + "volumes, eight constants — and not one number fitted to the pair "
      + "in front of you.  Everything the model will ever say about "
      + "water/ethanol was decided before anyone thought about mixing "
      + "them.",
    after: "Which is the claim to test, and the reason the comparison page "
      + "exists: predictive means “no mixture data used”, never “as "
      + "accurate as a fit”.",
    assumes: "That the two contributions are SEPARABLE and simply add — "
      + "that the entropy of packing different-sized molecules and the "
      + "energy of pairing their surfaces can be computed independently "
      + "and summed.  The typechecker caught this step declaring no "
      + "assumption at all while the other six did, which is worth "
      + "recording: it is the assumption easiest to forget, because it is "
      + "made by the plus sign rather than by any term.",
    cites: "CosmoSac.cpp:185",
  },
] as const;

export function CosmoSacTheoryTool(): JSX.Element {
  const run = useMethodRun(COSMO_WITNESS, [], "cosmo-sac-theory",
    "choupoProps");

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
        <Title order={3}>COSMO-SAC, derived</Title>
        <Text size="sm" mt={4}>
          Where an activity coefficient comes from when nobody has measured
          your pair.  Every equation below is the one{" "}
          <Code>src/thermo/activityCoefficient/CosmoSac.cpp</Code> executes,
          cited to its line, and every constant is quoted from that file
          with its units — so you can redo any step on paper and check the
          engine, which is the point of a glass box.
        </Text>
      </Box>

      <Alert variant="light" color="orange"
        title="Read this before you trust a number on this page">
        <Text size="sm">
          The public tree ships <strong>synthetic teaching surrogates</strong>
          {" "}for the σ-profiles: the VT-2005 set that COSMO-SAC 2002 was
          published with cannot be redistributed here.  The mechanism below
          is exact and the code is the real one; the NUMBERS the witness
          produces demonstrate behaviour and are <strong>not validated
          against measurement</strong>.  Install your own copy with{" "}
          <Code>bin/choupo-import-cosmo</Code> and the model reads it; without
          it, it refuses by name rather than substituting anything.
        </Text>
      </Alert>

      <Box>
        <Title order={5}>The eight constants, with their units</Title>
        <Box mt={6} style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%",
            fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${GRID}` }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>symbol</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>value</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>unit</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>what it is</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>declared at</th>
              </tr>
            </thead>
            <tbody>
              {COSMO_CONSTANTS.map((c) => (
                <tr key={c.sym} style={{ borderBottom: `1px solid ${GRID}` }}>
                  <td style={{ padding: "4px 8px", fontFamily: "monospace" }}>{c.sym}</td>
                  <td style={{ padding: "4px 8px", fontFamily: "monospace" }}>{c.val}</td>
                  <td style={{ padding: "4px 8px" }}>{c.unit}</td>
                  <td style={{ padding: "4px 8px" }}>{c.what}</td>
                  <td style={{ padding: "4px 8px", fontSize: 12, color: "var(--mantine-color-dimmed)" }}>
                    {c.line}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <Text size="xs" c={INK} mt={6}>
          Note the gas constant: 0.001987 kcal/(mol·K), not 8.314.  The
          misfit and hydrogen-bond constants were fitted in kcal, and mixing
          unit systems inside that exponential is the commonest way to get a
          plausible wrong answer out of this model.
        </Text>
      </Box>

      {COSMO_STEPS.map((s) => (
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

      <Box>
        <Title order={5}>The worked example, run in this browser</Title>
        <Text size="sm" mt={4}>
          The witness is{" "}
          <Code>tutorials/{COSMO_WITNESS}</Code>, at 298.15 K and 1 bar.  It
          asks the model four questions, and the first is the one that tests
          step 5's exact cancellation: <strong>pure water</strong>, where the
          mixture profile IS the pure profile, so every bracket in the
          residual sum is zero and ln γ must come back as zero — not small,
          zero.  Then a 50/50 water/ethanol, a ternary with acetone, and
          water/hexane, where the hydrogen-bond term of step 3 has nothing to
          pair with on the hexane side.
        </Text>
        {run.busy && (
          <Group gap={8} mt={8}><Loader size="sm" />
            <Text size="sm" c="dimmed">running the witness…</Text></Group>
        )}
        {run.err && (
          <Alert color="red" variant="light" title="the engine refused" mt={8}>
            <Text size="xs">{run.err}</Text>
          </Alert>
        )}
        {!run.busy && !run.err && (
          <Text size="xs" c={INK} mt={8}>
            The run writes one curve per op; open the case to read the
            γ values it produced.  They are shown here as the ENGINE's
            output and nothing on this page recomputes them.
          </Text>
        )}
      </Box>

      <Box>
        <Title order={5}>What this page does not do</Title>
        <Text size="sm" mt={4}>
          It does not generate a σ-profile: that needs a quantum-chemistry
          calculation, which is outside this simulator by a settled decision
          and always will be.  It covers the <strong>2002</strong> variant
          only — the one the engine implements — and a profile carrying
          another variant's label is refused rather than run against these
          constants, because a profile and its constants are one fitted
          object.  And it makes no accuracy claim: for that, go to the
          comparison page, where four models are graded against the same
          measured dataset.
        </Text>
      </Box>
    </Stack>
    </Box>
  );
}
