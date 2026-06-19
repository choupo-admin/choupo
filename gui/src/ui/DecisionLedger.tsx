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
  DecisionLedger -- the artefact that makes the props GRADEABLE.

  One row per decision a student made in the property foundation: which model /
  binary pair / kinetic order / fit, its value, its SOURCE (library / literature
  / fitted / assumed / undeclared), and the EVIDENCE (chi2/RMS, identifiable?).
  Built entirely from what the engine emits (operationResults + provenance,
  thermoResolution, experimentalDatasets) -- one source of truth, no re-walk.

  The professor opens a handed-in case, runs the props, and reads this table to
  judge whether every decision was well made -- the answer to "in past years
  nobody could audit what they did".  A red flag marks an UNDECLARED or
  NOT-IDENTIFIABLE choice: a guess wearing the same polish as a defended one.
  Exportable as CSV for the submission.
\*---------------------------------------------------------------------------*/

import { Alert, Badge, Box, Button, Group, Stack, Table, Text, Title } from "@mantine/core";
import { IconDownload, IconAlertTriangle, IconCircleCheck } from "@tabler/icons-react";

import type { OperationResult, PairResolution, ExperimentalDataset } from "../adapters/SolverAdapter.js";

type Flag = "ok" | "warn" | "bad";
interface Row {
  decision: string;   // category
  what: string;       // the chosen value
  source: string;
  evidence: string;
  rationale?: string;
  flag: Flag;
}

function num(d: { [k: string]: number } | undefined, k: string): number | undefined {
  const v = d?.[k];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function sig(v: number | undefined): string {
  if (v === undefined) return "—";
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2);
  return String(Number(v.toPrecision(3)));
}

export function buildLedger(
  ops: OperationResult[],
  pairs: PairResolution[],
  datasets: ExperimentalDataset[],
): Row[] {
  const rows: Row[] = [];

  // Binary-interaction pairs (foundation).
  for (const p of pairs) {
    const placeholder = p.provSource === "placeholder";
    const ideal = p.status === "idealDefault";
    rows.push({
      decision: "binary pair",
      what: `${p.i}–${p.j}  (${p.model})`,
      source: ideal ? "ideal-default (no params)"
        : p.provSource && p.provSource !== "inline" ? `${p.status} · ${p.provSource}`
        : p.status,
      evidence: ideal ? "no interaction" : placeholder ? "placeholder values" : "—",
      flag: ideal || placeholder ? "warn" : "ok",
    });
  }

  for (const op of ops) {
    const src = op.provenance?.["source"] ?? "undeclared";
    const rationale = op.provenance?.["rationale"];
    if (op.type === "fitParameters") {
      const ident = (num(op.diagnostics, "identifiable") ?? 0) > 0.5;
      const mc = num(op.diagnostics, "max_abs_corr");
      rows.push({
        decision: "parameter fit",
        what: op.name,
        source: "fitted",
        evidence: ident ? `identifiable (χ² ${sig(num(op.diagnostics, "chi2"))})`
          : `NOT identifiable (max|corr| ${sig(mc)})`,
        flag: ident ? "ok" : "bad",
      });
    } else if (op.type === "kinetics1D") {
      const rms = num(op.diagnostics, "rms");
      const order = num(op.diagnostics, "order");
      const kfit = num(op.diagnostics, "k");
      const r2 = num(op.diagnostics, "R2");
      const wasFit = (num(op.diagnostics, "fitted") ?? 0) > 0.5;
      const isArrhenius = (num(op.diagnostics, "arrhenius") ?? 0) > 0.5;
      if (isArrhenius) {
        // Multi-temperature Arrhenius fit: Ea + k0 from the ln k vs 1/T line.
        const Ea = num(op.diagnostics, "Ea_kJ_per_mol");
        const k0 = num(op.diagnostics, "k0");
        const nT = num(op.diagnostics, "n_temps");
        rows.push({
          decision: "reaction kinetics",
          what: `${op.name}  (order ${order ?? "?"}, Arrhenius)`,
          source: "fitted",
          evidence: `fitted Ea=${sig(Ea)} kJ/mol · k₀=${sig(k0)} · R²=${sig(r2)} (${sig(nT)} T)`,
          rationale,
          flag: "ok",
        });
      } else {
        // Single isotherm: the FITTED k + R^2 (what discriminates the order).
        const ev = rms !== undefined
          ? `${wasFit ? "fitted " : ""}k=${sig(kfit)}`
            + (r2 !== undefined ? ` · R²=${sig(r2)}` : "")
            + ` · RMS ${sig(rms)} (n=${sig(num(op.diagnostics, "n_data"))})`
          : "NO evidence (no dataset)";
        rows.push({
          decision: "reaction kinetics",
          what: `${op.name}  (order ${order ?? "?"})`,
          source: wasFit ? "fitted" : src,
          evidence: ev,
          rationale,
          flag: rms === undefined ? "bad" : (wasFit || src !== "undeclared") ? "ok" : "bad",
        });
      }
    } else if (op.provenance?.["model"]) {
      // a property scan that picked a model (VLE etc.)
      const model = op.provenance["model"];
      // A model choice is JUSTIFIED if it declares EITHER a source (whence) OR
      // a rationale (why).  The IDEAL model is the BASELINE / null hypothesis
      // (Raoult, no parameters) -- it never needs a source, so never flag it.
      const isBaseline = model === "ideal" || model === "idealGas";
      const justified = isBaseline || src !== "undeclared" || !!rationale;
      rows.push({
        decision: "property model",
        what: `${op.name}  (${model})`,
        source: isBaseline ? "baseline (no params)" : src,
        evidence: isBaseline ? "null model (Raoult)" : rationale ? "rationale given" : "—",
        rationale,
        flag: justified ? "ok" : "bad",
      });
    }
  }

  // Experimental datasets (the lab truth decisions are judged against).
  for (const d of datasets) {
    rows.push({
      decision: "experimental data",
      what: `${d.name}  (${d.nPoints} pts)`,
      source: d.source || "undeclared",
      evidence: d.citation || "no citation",
      flag: !d.source || d.source === "undeclared" ? "bad" : "ok",
    });
  }

  return rows;
}

function toCsv(rows: Row[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = "decision,what,source,evidence,rationale,flag";
  const body = rows.map((r) =>
    [r.decision, r.what, r.source, r.evidence, r.rationale ?? "", r.flag].map(esc).join(",")).join("\n");
  return head + "\n" + body + "\n";
}

const FLAG_COLOR: Record<Flag, string> = { ok: "teal", warn: "yellow", bad: "red" };

export function DecisionLedger({ ops, pairs, datasets }: {
  ops: OperationResult[];
  pairs: PairResolution[];
  datasets: ExperimentalDataset[];
}) {
  const rows = buildLedger(ops, pairs, datasets);
  if (rows.length === 0) {
    return (
      <Stack align="center" justify="center" h="100%" gap="xs">
        <Text c="dimmed" size="sm">Run the properties to populate the decision ledger.</Text>
      </Stack>
    );
  }
  const bad = rows.filter((r) => r.flag === "bad");
  const warn = rows.filter((r) => r.flag === "warn");

  const downloadCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "decision_ledger.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box style={{ height: "100%", overflow: "auto" }} p="md">
      <Group justify="space-between" mb="sm">
        <Title order={5} c="accent">Decision ledger</Title>
        <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} onClick={downloadCsv}>
          Export CSV
        </Button>
      </Group>

      {bad.length > 0 ? (
        <Alert color="red" variant="light" mb="sm" icon={<IconAlertTriangle size={16} />}
          title={`${bad.length} decision(s) unjustified or untrustworthy`}>
          <Text size="sm">
            These are undeclared guesses or non-identifiable fits — a grader cannot accept them as
            defended: {bad.map((r) => r.what).join("; ")}.
          </Text>
        </Alert>
      ) : (
        <Alert color="teal" variant="light" mb="sm" icon={<IconCircleCheck size={16} />}
          title="Every decision carries a source + evidence">
          <Text size="sm">Each choice below is traceable to library/literature/a fit and its evidence.
            {warn.length > 0 ? ` (${warn.length} placeholder/ideal-default to revisit.)` : ""}</Text>
        </Alert>
      )}

      <Table withTableBorder withColumnBorders striped fz="xs" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>decision</Table.Th>
            <Table.Th>chosen</Table.Th>
            <Table.Th>source</Table.Th>
            <Table.Th>evidence</Table.Th>
            <Table.Th ta="center">status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r, i) => (
            <Table.Tr key={i}>
              <Table.Td>{r.decision}</Table.Td>
              <Table.Td title={r.rationale}><code>{r.what}</code>{r.rationale ? " ⓘ" : ""}</Table.Td>
              <Table.Td>{r.source}</Table.Td>
              <Table.Td>{r.evidence}</Table.Td>
              <Table.Td ta="center">
                <Badge color={FLAG_COLOR[r.flag]} variant={r.flag === "ok" ? "light" : "filled"} size="xs">
                  {r.flag === "ok" ? "ok" : r.flag === "warn" ? "revisit" : "unjustified"}
                </Badge>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}
