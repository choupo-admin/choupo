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
  ONE PAGE, ONE MENTAL MODEL (split out of "What is a temperature?" on
  2026-08-29, by the owner's pedagogical ruling):

      Never trust a thermophysical-property record merely because it exists.
      Test its internal consistency, and read its declared validity.

  The material here — the boiling-point ladder, the water record that
  disagrees with itself by 0.70 K, the glycerol correlation that misses by a
  factor of 19 — was born inside the temperature page, where it was teaching
  the wrong lesson in the right words: it is not about what a temperature IS,
  it is about when a DATABASE can be believed.  Moved whole, not destroyed,
  because the examples are excellent; they now teach where they belong.

  ZERO PHYSICS IN TYPESCRIPT: every vapour pressure in the table is an engine
  run of `props/thermo/temperature02_engineers_ladder` in the reader's own
  browser.  Each rung asks one question of one record: at the temperature
  this substance's file calls its normal boiling point, what does its own
  vapour-pressure correlation say the pressure is?  It should be one
  atmosphere -- that is what a normal boiling point MEANS -- so every row is
  a record cross-examined against itself, which is the page's whole method.
\*---------------------------------------------------------------------------*/

import { Fragment, useMemo } from "react";
import { Alert, Box, Group, Loader, Stack, Text, Title } from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";

const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const GRID = "var(--mantine-color-default-border)";

/** The witness: the ladder of normal boiling points, verified. */
export const LADDER_WITNESS = "props/thermo/temperature02_engineers_ladder";

/** One rung, as the page reads it out of the run's own diagnostics.  The
 *  labels are what the substance IS on a plant, which is the half a reader
 *  needs and a formula cannot supply; the NUMBERS are all the engine's. */
export const LADDER: readonly {
  op: string; comp: string; T: number; what: string; caveat?: string;
}[] = [
  { op: "rung_H2",    comp: "H2",    T: 20.39,  what: "liquid hydrogen" },
  { op: "rung_neon",  comp: "neon",  T: 27.10,  what: "neon" },
  { op: "rung_N2",    comp: "N2",    T: 77.35,  what: "liquid nitrogen — air separation" },
  { op: "rung_Ar",    comp: "Ar",    T: 87.30,  what: "argon" },
  { op: "rung_O2",    comp: "O2",    T: 90.17,  what: "liquid oxygen" },
  { op: "rung_CH4",   comp: "CH4",   T: 111.66, what: "LNG" },
  { op: "rung_C2H4",  comp: "C2H4",  T: 169.42, what: "cryogenic ethylene" },
  { op: "rung_benzene", comp: "benzene", T: 353.24, what: "benzene — the aromatics train" },
  { op: "rung_water", comp: "water", T: 373.15, what: "water at one atmosphere" },
  { op: "rung_ethyleneGlycol", comp: "ethyleneGlycol", T: 470.45,
    what: "ethylene glycol — dehydration, glycol regeneration" },
  { op: "rung_naphthalene", comp: "naphthalene", T: 491.16, what: "naphthalene" },
  { op: "rung_biphenyl", comp: "biphenyl", T: 528.15,
    what: "biphenyl — a component of the hot-oil fluids" },
  { op: "rung_glycerol", comp: "glycerol", T: 563.15,
    what: "glycerol — and here the ladder breaks, on purpose",
    caveat: "This record's vapour pressure is `origin predictive` — "
      + "Ambrose-Walton corresponding states from Tc, Pc and omega, at "
      + "omega = 1.54, far outside where such a correlation was fitted.  The "
      + "record itself says \u201cvalidate against saturation data\u201d, and this "
      + "row IS that validation: it misses by a factor of 19.  Kept, and "
      + "labelled, because a table that only shows the rungs that land "
      + "teaches that records can be trusted without being checked." },
];

/** How far a rung's computed vapour pressure sits from one atmosphere, in per
 *  cent.  Derived from the engine's own diagnostics; the page computes no
 *  pressure of its own. */
export function rungDeparturePct(psat: number): number {
  return (psat / 101325 - 1) * 100;
}

/** Pull each rung's computed vapour pressure out of the run's own operation
 *  diagnostics.  A rung the run did not produce is left OUT, never defaulted
 *  to 101325 -- that would paint a missing answer as a perfect one. */
export function readLadder(
  ops: readonly { name?: string; diagnostics?: Record<string, number> }[] | undefined,
): { op: string; psat: number }[] {
  const out: { op: string; psat: number }[] = [];
  for (const r of LADDER) {
    const o = ops?.find((x) => x.name === r.op);
    const v = o?.diagnostics?.["Psat_" + r.comp];
    if (typeof v === "number" && Number.isFinite(v)) out.push({ op: r.op, psat: v });
  }
  return out;
}

// ---- the page ---------------------------------------------------------------

export function PropertyTrustTool(): JSX.Element {
  //  The ladder takes no knob -- it is the same thirteen questions every
  //  time -- so it runs once with no overrides.
  const ladderRun = useMethodRun(LADDER_WITNESS, [], "ladder", "choupoProps");
  const ladder = useMemo(
    () => readLadder(ladderRun.result?.operationResults),
    [ladderRun.result]);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 760, margin: "0 auto" }}>

        <Box>
          <Title order={3}>When a property database lies to you</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Every number your simulation produces descends from a property
            record somebody once typed.  This page installs one habit:{" "}
            <strong>never trust a record merely because it exists.</strong>
            {" "}Ask it two questions first — does it agree{" "}
            <em>with itself</em>, and does it declare <em>where it is
            valid</em>?  Below, the engine puts exactly those questions to
            thirteen records, live, and two of them fail.
          </Text>
        </Box>

        <Box>
          <Title order={5}>1 · The cross-examination</Title>
          <Text size="sm" mt={4}>
            Each row asks one record one question it must answer correctly by
            definition: <strong>at the temperature your file calls the normal
            boiling point, what does your own vapour-pressure correlation
            say?</strong>  It should say one atmosphere — that is what a
            normal boiling point <em>means</em>:
          </Text>
          <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="sm" ff="monospace">
              P_sat(T_b)  =  101 325 Pa        by definition of T_b
            </Text>
          </Box>
          <Text size="sm">
            No external truth is needed: the record is checked against
            itself — its own correlation, evaluated at its own declared
            boiling point, against the definition both must satisfy.
          </Text>
          <Text size="sm" mt={6}>
            The thirteen substances climb the whole range a process engineer
            works in, from liquid hydrogen to glycerol — chosen so that the
            table also reads as a tour of what boils where on a plant.
          </Text>
        </Box>

        {ladderRun.busy && (
          <Group gap={8}><Loader size="xs" />
            <Text size="xs" c="dimmed">solving the ladder…</Text></Group>
        )}

        {ladder.length > 0 && (
          <Box style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%",
              fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${GRID}` }}>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>T [K]</th>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>what it is</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>P<sub>sat</sub> / atm</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>off by</th>
                </tr>
              </thead>
              <tbody>
                {LADDER.map((r) => {
                  const hit = ladder.find((x) => x.op === r.op);
                  if (!hit) return null;
                  const d = rungDeparturePct(hit.psat);
                  const bad = Math.abs(d) > 2;
                  return (
                    <Fragment key={r.op}>
                    <tr style={{ borderBottom: r.caveat ? "none"
                      : `1px solid ${GRID}` }}>
                      <td style={{ padding: "4px 8px" }}>{r.T.toFixed(2)}</td>
                      <td style={{ padding: "4px 8px", color: INK }}>{r.what}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>
                        {(hit.psat / 101325).toFixed(3)}
                      </td>
                      <td style={{ padding: "4px 8px", textAlign: "right",
                        fontWeight: bad ? 700 : 400 }}>
                        {d >= 0 ? "+" : ""}{d.toFixed(1)} %
                      </td>
                    </tr>
                    {r.caveat && (
                      <tr style={{ borderBottom: `1px solid ${GRID}` }}>
                        <td colSpan={4} style={{ padding: "0 8px 6px 8px",
                          color: INK, fontSize: 12, lineHeight: 1.45 }}>
                          {r.caveat}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </Box>
        )}

        <Alert variant="light" color="orange"
          title="And the worst rung is the one you trust most">
          <Text size="sm">
            Seven cryogens no reader has any intuition for land inside 1.4 %.
            <strong> Water does not</strong> — it comes out at 1.026 atm.  And
            it is worth being exact about what that does and does not show,
            because the obvious reading is wrong.
          </Text>
          <Text size="sm" mt={6}>
            The run does raise an extrapolation notice, unasked:{" "}
            <code>[psat] component &apos;water&apos;: Antoine evaluated at
            T = 373.15 K, OUTSIDE its declared Trange (273 373).</code>{" "}
            <strong>But 0.15 K of extrapolation is not what went wrong.</strong>
            {" "}At 373.00 K, safely inside the window, the same correlation
            already reads 1.020 atm.  The extrapolation is worth about half a
            per cent of the two and a half.
          </Text>
          <Text size="sm" mt={6}>
            What the rung actually found is this:{" "}
            <strong>solve the record’s own Antoine coefficients for one
            atmosphere and they give 372.45 K</strong>, while the same record
            declares <code>Tb 373.15</code> a few lines above.  The file
            disagrees with itself by <strong>0.70 K</strong>.
          </Text>
          <Text size="sm" mt={6}>
            So the engine has <em>not</em> discovered that water disobeys its
            boiling point.  It has discovered that <strong>its own water record
            does not close</strong> — two homes for one fact, drifted apart,
            and nothing had ever asked them the same question until this table
            did.  That is a data defect, and finding it is exactly why
            declared validity ranges and a correlation you can interrogate are
            worth having.
          </Text>
          <Text size="sm" mt={6}>
            The lesson, aimed correctly: <strong>familiarity is not
            accuracy</strong>.  The rung nobody would think to check is the
            one that failed.
          </Text>
        </Alert>

        <Box>
          <Title order={5}>2 · The two failure modes, named</Title>
          <Text size="sm" mt={4}>
            The two bad rungs fail differently, and the difference is the
            page:
          </Text>
          <Text size="sm" mt={6}>
            <strong>Water is an inconsistency.</strong>  Two homes for one
            fact — a declared Tb and a fitted correlation — drifted 0.70 K
            apart, in the most familiar record in the file.  No one home is
            “the wrong one” until a primary source is consulted; what the
            check establishes is only, and exactly, that they cannot both be
            right.
          </Text>
          <Text size="sm" mt={6}>
            <strong>Glycerol is an extrapolated estimate wearing a number’s
            clothes.</strong>  Its vapour pressure is declared{" "}
            <code>origin predictive</code> — a corresponding-states closure
            used far outside where such correlations were fitted — and the
            record itself asks to be validated.  The table did, and it missed
            by a factor of 19.  The record was <em>honest</em>; a reader who
            skipped the provenance line would still have been burned.
          </Text>
          <Text size="sm" mt={6}>
            Notice what caught both: not a better database, not an external
            truth — <strong>the record cross-examined against itself</strong>.
            Nobody knows the “true” vapour pressure of glycerol at 563 K, and
            nobody needed to.
          </Text>
        </Box>

        <Box>
          <Title order={5}>3 · The habit, generalised</Title>
          <Text size="sm" mt={4}>
            What this engine does about it, everywhere, so you can rely on the
            behaviour rather than on your own vigilance:
          </Text>
          <Text size="sm" mt={6} component="div">
            <ul style={{ marginTop: 4, paddingLeft: 20 }}>
              <li><strong>Correlations declare validity windows</strong>, and
                a value taken outside one is ANNOUNCED — returned, because
                extrapolation is a legitimate engineering choice, but never
                silent;</li>
              <li><strong>estimates are labelled at the value</strong>{" "}
                (<code>origin predictive</code>, <code>[estimate]</code>,{" "}
                <code>[unreviewed]</code>), so provenance travels with the
                number instead of living in a comment;</li>
              <li><strong>internal-consistency checks run in the test
                suite</strong>, so a record whose declared Tb and fitted Psat
                disagree past a band is a named finding, not a surprise;</li>
              <li>and <strong>a gap is left visible rather than filled
                in</strong>: a missing datum refuses by name, because a
                plausible invented value is the one failure no reader can
                detect.</li>
            </ul>
          </Text>
          <Text size="sm" mt={6}>
            Take the habit to every table you will ever use, commercial
            simulators included: ask a record where its numbers came from,
            over what range they hold, and whether it agrees with itself.  A
            database that cannot answer is not wrong — it is{" "}
            <em>unexamined</em>, which for design purposes is the same thing
            until someone looks.
          </Text>
          <Text size="xs" c={INK} mt={6}>
            The epistemology behind this page’s method — testing instruments
            without possessing the truth, Regnault’s comparability — is the
            deep dive: <em>How do we know a thermometer is right?</em>
          </Text>
        </Box>

        <Box>
          <Title order={5}>What this page is not</Title>
          <Text size="xs" c={INK} mt={4}>
            • Not a claim that these thirteen records are the corpus’s worst —
            they are the ones a boiling-point question can reach; other
            properties have other checks.
            <br />• Not a measurement: no number here is compared against
            laboratory data.  Both failures are established by internal
            consistency alone, which is precisely the lesson.
            <br />• Not a reason to distrust simulation — a reason to
            interrogate inputs.  The record that admits its origin
            (glycerol) served the reader better than the familiar one that
            said nothing (water).
          </Text>
        </Box>

        <Text size="xs" c={TEXT} mt="xs">
          Runs tutorials/{LADDER_WITNESS} in your browser.  Every pressure in
          the table is the engine’s; the page computes none of its own.
        </Text>
      </Stack>
    </Box>
  );
}

export default PropertyTrustTool;
