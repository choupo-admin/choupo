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
  FitStatsPanel -- the "judging surface" for a parameter fit.

  Choupo exists to abolish the black box.  A fit that merely prints
  "converged" is a guess wearing a badge: a model can reproduce the data
  beautifully (low chi2, sub-Kelvin RMS) while its individual parameters
  are meaningless because they trade off against each other.  This panel
  shows the evidence the engineer needs to JUDGE the fit -- it never
  certifies it ("see, then decide").

  Reads the `fitParameters` entries of RunResult.operationResults (emitted
  by choupoProps).  Each carries, in its flat `diagnostics` map:
    chi2, chi2_reduced, rms, max_abs_resid, dof, penalised_points,
    cond_JtJ, max_abs_corr, identifiable, params_at_bound,
    fit.<i>.value / .stderr / .ci95 / .at_bound,
    corr.<i>.<j>   (upper triangle of the parameter correlation matrix).
  The parameter PATHS come from the propsDict (index <i> -> parameters[i]).

  The correlation matrix is the headline: a |corr| ~ 1 cell means two
  parameters are not separately identifiable from this data (e.g. NRTL
  tau = a + b/T at a single temperature makes a and b/T collinear).
\*---------------------------------------------------------------------------*/

import { Alert, Badge, Box, Group, Stack, Table, Text, Title } from "@mantine/core";

import type { OperationResult } from "../adapters/SolverAdapter.js";
import type { JsonDict } from "../dict/index.js";
import { formatSig } from "../state/displayUnits.js";
import { Plot, darkLayout, PLOT_CONFIG } from "./plotting/plotly.js";

/** Pull the ordered parameter paths for a named fit op out of the propsDict. */
function paramPathsFor(propsDict: JsonDict | undefined, opName: string): string[] {
  const ops = (propsDict?.["operations"] ?? []) as JsonDict[];
  const op = ops.find((o) => o["name"] === opName);
  if (!op) return [];
  const params = (op["parameters"] ?? []) as JsonDict[];
  return params.map((p) => String(p["path"] ?? ""));
}

function num(d: { [k: string]: number }, key: string): number | undefined {
  const v = d[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Render every fitParameters operation's stats; nothing if there are none. */
export function FitStatsPanel({ results, propsDict }: {
  results: OperationResult[];
  propsDict: JsonDict | undefined;
}) {
  const fits = results.filter((r) => r.type === "fitParameters");
  if (fits.length === 0) return null;

  return (
    <Stack gap="lg">
      {fits.map((fit) => (
        <OneFit key={fit.name} fit={fit} paths={paramPathsFor(propsDict, fit.name)} />
      ))}
    </Stack>
  );
}

function OneFit({ fit, paths }: { fit: OperationResult; paths: string[] }) {
  const d = fit.diagnostics;
  const P = num(d, "n_params") ?? 0;
  const N = num(d, "n_data") ?? 0;
  const dof = num(d, "dof") ?? 0;
  const converged = (num(d, "converged") ?? 0) > 0.5;
  // Fail-SAFE: a missing identifiability verdict reads as NOT identifiable
  // (never optimistically "fine") -- the whole point is to not over-trust.
  const identifiable = (num(d, "identifiable") ?? 0) > 0.5;
  const invertible = (num(d, "invertible") ?? 0) > 0.5;
  const wellConditioned = (num(d, "well_conditioned") ?? 0) > 0.5;
  const maxCorr = num(d, "max_abs_corr");
  const cond = num(d, "cond_JtJ");
  const atBound = num(d, "params_at_bound") ?? 0;
  const penalised = num(d, "penalised_points") ?? 0;
  const tcrit = num(d, "t_crit95");

  // Anchor the verdict on the ENGINE's identifiability flag (single source of
  // truth -- it already folds dof, conditioning, and correlation together).
  // A converged-but-not-identifiable fit is NOT a bad fit: the model can
  // predict well while the data simply don't pin each parameter separately.
  const trouble = converged && !identifiable;
  const caution = converged && identifiable && maxCorr !== undefined && maxCorr > 0.9;

  const verdictColor = !converged ? "gray" : trouble ? "red" : caution ? "yellow" : "teal";
  const verdictTitle = !converged
    ? "Did not converge"
    : trouble
      ? "Converged — but the data don't pin all parameters individually"
      : caution
        ? "Converged; parameters determined but correlated"
        : "Converged; parameters well-determined";

  // Name the culprit correlated pairs (|corr| > 0.99) by parameter path.
  const culprits = correlatedPairs(d, paths, P, 0.99);

  const reasons: string[] = [];
  if (!invertible)
    reasons.push("the data provide no independent information to estimate these parameters separately (the JᵀJ matrix is singular — too few points, or the data vary in only one direction)");
  if (dof <= 0)
    reasons.push(`there are not enough data points: ${N} point(s) for ${P} parameters (need more points than parameters)`);
  if (invertible && !wellConditioned)
    reasons.push(`the fit is ill-conditioned (cond(JᵀJ) ≈ ${fmt(cond)}) — small data changes swing the parameters wildly`);
  if (culprits.length > 0)
    reasons.push(`these parameter pairs are essentially perfectly correlated (they trade off — a change in one is cancelled by a change in the other): ${culprits.join("; ")}. For NRTL, τ = a + b/T is linear in BOTH a and b/T at a fixed pressure, so varying temperature alone cannot separate them — add bubble-T data at a DIFFERENT PRESSURE.`);
  if (atBound > 0)
    reasons.push(`${atBound} parameter(s) pinned at a bound — the optimum may lie outside the allowed range; widen the bounds and refit`);

  return (
    <Box>
      <Group justify="space-between" align="center" mb={6}>
        <Title order={5} c="accent">{fit.name}</Title>
        <Badge color={verdictColor} variant="light" size="lg">{verdictTitle}</Badge>
      </Group>

      {trouble && (
        <Alert color={verdictColor} variant="light" mb="sm" title="What the statistics say">
          <Text size="sm">
            The model reproduces the data (RMS {fmt(num(d, "rms"))} K) — but the
            individual fitted numbers are not uniquely determined:
          </Text>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {reasons.map((r, i) => <li key={i}><Text size="sm">{r}</Text></li>)}
          </ul>
        </Alert>
      )}

      {caution && (
        <Alert color="yellow" variant="light" mb="sm" title="Inspect the correlations">
          <Text size="sm">
            The fit converged and the parameters are identifiable, but some are
            strongly correlated (max |corr| = {maxCorr?.toFixed(3)}). Look at the
            matrix below before trusting any single value.
          </Text>
        </Alert>
      )}

      {!converged && (
        <Alert color="gray" variant="light" mb="sm" title="Fit did not converge">
          <Text size="sm">
            The Levenberg–Marquardt loop hit its iteration limit (or λ diverged)
            without meeting the tolerance — confidence intervals and standard
            errors are not reported. Try a different initial guess, looser
            tolerance, or more iterations.
          </Text>
        </Alert>
      )}

      {/* Summary stat chips */}
      <Group gap="xs" mb="sm">
        <Stat label="χ²" value={fmt(num(d, "chi2"))} />
        <Stat label="reduced χ²" value={fmt(num(d, "chi2_reduced"))} hint={`χ²/dof, dof=${dof}`} />
        <Stat label="RMS" value={fmt(num(d, "rms"))} hint="K (bubble-T residual)" />
        <Stat label="max|resid|" value={fmt(num(d, "max_abs_resid"))} hint="K" />
        <Stat label="data / params" value={`${N} / ${P}`} />
        <Stat label="cond(JᵀJ)" value={fmt(num(d, "cond_JtJ"))} hint="pivot-ratio estimate; large ⇒ ill-conditioned" />
        {penalised > 0 && <Stat label="non-converged pts" value={String(penalised)} />}
      </Group>

      {/* Parameter table with t-95 confidence intervals */}
      <Table withTableBorder withColumnBorders striped highlightOnHover mb="sm" fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>parameter</Table.Th>
            <Table.Th ta="right">fitted value</Table.Th>
            <Table.Th ta="right" title="half-width of the 95% confidence interval; the full interval is value ± this">
              95% CI half-width (±){tcrit ? `, t=${tcrit.toFixed(3)}` : ""}
            </Table.Th>
            <Table.Th ta="right">std. error</Table.Th>
            <Table.Th ta="center">at bound?</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {Array.from({ length: P }, (_, i) => {
            const val = num(d, `fit.${i}.value`);
            const ci = num(d, `fit.${i}.ci95`);
            const se = num(d, `fit.${i}.stderr`);
            const pinned = (num(d, `fit.${i}.at_bound`) ?? 0) > 0.5;
            // A CI wider than the value itself => the sign isn't even resolved.
            const loose = val !== undefined && ci !== undefined && Math.abs(ci) > Math.abs(val);
            return (
              <Table.Tr key={i}>
                <Table.Td><code>{paths[i] ?? `param ${i}`}</code></Table.Td>
                <Table.Td ta="right">{fmt(val)}</Table.Td>
                <Table.Td ta="right" c={loose ? "red.4" : undefined}
                  title={loose ? "the interval is wider than the value itself — the parameter's sign is not even resolved; see the correlation matrix" : undefined}>
                  {fmt(ci)}</Table.Td>
                <Table.Td ta="right">{fmt(se)}</Table.Td>
                <Table.Td ta="center">{pinned ? <Badge color="red" size="xs">yes</Badge> : "—"}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>

      <CorrelationHeatmap d={d} paths={paths} P={P} />
    </Box>
  );
}

function CorrelationHeatmap({ d, paths, P }: {
  d: { [k: string]: number }; paths: string[]; P: number;
}) {
  if (P < 2) return null;

  // If the engine did NOT compute the correlations (singular JᵀJ / dof ≤ 0),
  // do NOT paint a zero matrix -- that would read as "all uncorrelated", the
  // exact opposite of the truth.  Show an honest placeholder instead.
  const corrComputed = (num(d, "corr_computed") ?? 0) > 0.5;
  if (!corrComputed) {
    return (
      <Alert color="gray" variant="light" title="Correlation matrix not computed">
        <Text size="sm">
          The JᵀJ matrix could not be inverted (singular, or fewer data points
          than parameters), so the parameter correlations are undefined. This is
          itself a strong sign the parameters are not identifiable from this data.
        </Text>
      </Alert>
    );
  }

  // Reconstruct the symmetric matrix from the upper-triangle corr.<i>.<j>.
  // A missing off-diagonal key is genuinely unknown -> NaN (blank cell), never 0.
  const z: number[][] = [];
  for (let i = 0; i < P; i++) {
    const row: number[] = [];
    for (let j = 0; j < P; j++) {
      if (i === j) row.push(1);
      else {
        const a = Math.min(i, j), b = Math.max(i, j);
        row.push(num(d, `corr.${a}.${b}`) ?? Number.NaN);
      }
    }
    z.push(row);
  }
  // Short labels: last dotted segment (a_ij, b_ij, ...) or param index.
  const labels = Array.from({ length: P }, (_, i) => {
    const p = paths[i] ?? `p${i}`;
    const tail = (p.split(".").pop() ?? p).replace(/\[\d+\]/g, "");
    return tail.length > 0 ? tail : `p${i}`;
  });
  // Render 0.995–0.999 as "≈1" (a hard 1.00 would hide that it isn't exactly 1),
  // bold the |corr| > 0.99 culprits.
  const cellText = (v: number): string => {
    if (Number.isNaN(v)) return "";
    const a = Math.abs(v);
    if (a > 0.99 && a < 0.9995) return (v < 0 ? "−≈1" : "≈1");
    return v.toFixed(2);
  };

  return (
    <Box>
      <Text size="xs" c="dimmed" mb={4}>
        Parameter correlation matrix — a cell near ±1 (bold) means those two parameters
        are not separately identifiable. Inspect this even when the verdict is green.
      </Text>
      <Box style={{ height: Math.min(60 + P * 46, 420) }}>
        <Plot
          data={[{
            type: "heatmap",
            x: labels,
            y: labels,
            z,
            zmin: -1,
            zmax: 1,
            colorscale: "RdBu",
            reversescale: true,
            hovertemplate: "%{y} ↔ %{x}: %{z:.3f}<extra></extra>",
            colorbar: { title: { text: "corr", side: "right" }, thickness: 12 },
          }]}
          layout={{
...darkLayout,
            autosize: true,
            xaxis: {...darkLayout.xaxis, automargin: true },
            yaxis: {...darkLayout.yaxis, automargin: true, autorange: "reversed" },
            margin: {...darkLayout.margin, l: 60, b: 60, r: 70 },
            annotations: z.flatMap((row, i) =>
              row.map((v, j) => {
                const danger = i !== j && Math.abs(v) > 0.99;
                return {
                  x: labels[j], y: labels[i], text: cellText(v),
                  showarrow: false,
                  font: {
                    size: danger ? 12 : 10,
                    color: danger ? "#fde68a" : Math.abs(v) > 0.6 ? "#fff" : "#cbd5e1",
                  },
                };
              }),
            ),
          }}
          config={PLOT_CONFIG}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
      </Box>
    </Box>
  );
}

/** List the parameter pairs whose |correlation| exceeds `thr`, by path,
 *  e.g. "a_ij ↔ b_ij (1.00)".  Used to name the culprits in the verdict. */
function correlatedPairs(d: { [k: string]: number }, paths: string[],
  P: number, thr: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < P; i++) {
    for (let j = i + 1; j < P; j++) {
      const c = num(d, `corr.${i}.${j}`);
      if (c !== undefined && Math.abs(c) > thr) {
        const li = (paths[i] ?? `p${i}`).split(".").pop() ?? `p${i}`;
        const lj = (paths[j] ?? `p${j}`).split(".").pop() ?? `p${j}`;
        out.push(`${li.replace(/\[\d+\]/g, "")} ↔ ${lj.replace(/\[\d+\]/g, "")} (${c.toFixed(2)})`);
      }
    }
  }
  return out;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Box
      style={{
        padding: "4px 10px",
        borderRadius: 6,
        background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))",
        border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
      }}
      title={hint}
    >
      <Text size="9px" c="dimmed" tt="uppercase" style={{ letterSpacing: 0.5 }}>{label}</Text>
      <Text size="sm" fw={600} c="var(--mantine-color-text)">{value}</Text>
    </Box>
  );
}

function fmt(v: number | undefined): string {
  if (v === undefined) return "—";
  return formatSig(v);
}
