/*---------------------------------------------------------------------------*\
  EstimateForm — the in-Explorer "estimate a missing component" modal (G3).

  See → decide → DOWNLOAD: the student declares the molecular groups, the ENGINE
  (choupoProps estimateComponent, via WASM — zero physics in TS) estimates the
  pure-component constants by Joback + corresponding states, the deviation vs an
  optional reference is shown, and the result is a REVIEWABLE case-local
  `<name>.estimate-DATE.dat` proposal the student DOWNLOADS via Save-As
  (gui-credo guard-rail 6: the GUI never writes <name>.dat in place; promotion =
  the student's `mv`/rename on disk).
\*---------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import {
  ActionIcon, Alert, Badge, Button, Collapse, Divider, Group, Loader, Modal,
  NumberInput, Select, Stack, Table, Text, TextInput, Tooltip,
} from "@mantine/core";
import { IconDownload, IconPlus, IconTrash } from "@tabler/icons-react";

import { resolveAdapter } from "../../adapters/index.js";
import type { RunResult } from "../../adapters/SolverAdapter.js";
import { synthesizeExploreCase } from "../../case/exploreSynth.js";
import { downloadComponentProposal } from "../../case/saveCase.js";

// The Joback first-order groups the engine knows (mirrors EstimateComponent's
// table — a new group is added there + here together).
const JOBACK_GROUPS: { value: string; label: string }[] = [
  { value: "CH3", label: "CH3 (methyl)" },
  { value: "CH2", label: "CH2 (methylene)" },
  { value: "CH", label: "CH (methine)" },
  { value: "C", label: "C (quaternary)" },
  { value: "eCH2", label: "=CH2 (alkene, terminal)" },
  { value: "eCH", label: "=CH– (alkene)" },
  { value: "eC", label: "=C< (alkene)" },
  { value: "OH", label: "OH (alcohol)" },
  { value: "ether", label: "–O– (ether)" },
  { value: "ketone", label: ">C=O (ketone)" },
  { value: "aldehyde", label: "–CHO (aldehyde)" },
  { value: "acid", label: "–COOH (acid)" },
  { value: "ester", label: "–COO– (ester)" },
  { value: "arCH", label: "=CH– (aromatic)" },
  { value: "arC", label: "=C< (aromatic)" },
];

interface Row { group: string; count: number; }

function num(v: number | string, fallback: number): number {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export function EstimateForm({
  opened, onClose, prefillName,
}: {
  opened: boolean;
  onClose: () => void;
  prefillName: string;
}) {
  const [name, setName] = useState(prefillName);
  const [rows, setRows] = useState<Row[]>([{ group: "CH3", count: 1 }]);
  // optional reference (validation): user-facing units (K, K, bar, -)
  const [refOpen, setRefOpen] = useState(false);
  const [refTb, setRefTb] = useState<string>("");
  const [refTc, setRefTc] = useState<string>("");
  const [refPc, setRefPc] = useState<string>("");
  const [refW, setRefW] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  // Reseed the name when the modal is (re)opened with a new prefill.
  useEffect(() => { if (opened) { setName(prefillName); setResult(null); setErr(null); } }, [opened, prefillName]);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { group: "CH2", count: 1 }]);
  const delRow = (i: number) => setRows((rs) => rs.filter((_, k) => k !== i));

  // The reference the user typed (display units) — also used to show dev%.
  const refDisplay = (): { Tb?: number; Tc?: number; Pc_bar?: number; omega?: number } => ({
    ...(refTb ? { Tb: num(refTb, NaN) } : {}),
    ...(refTc ? { Tc: num(refTc, NaN) } : {}),
    ...(refPc ? { Pc_bar: num(refPc, NaN) } : {}),
    ...(refW ? { omega: num(refW, NaN) } : {}),
  });

  const canRun = name.trim().length > 0 && rows.length > 0 && rows.every((r) => r.group && r.count > 0);

  const run = async () => {
    if (!canRun) return;
    setBusy(true); setErr(null); setResult(null);
    try {
      const rd = refDisplay();
      // engine reference is SI (Tb,Tc in K, Pc in Pa, omega -)
      const reference: { [k: string]: number } = {
        ...(rd.Tb !== undefined && Number.isFinite(rd.Tb) ? { Tb: rd.Tb } : {}),
        ...(rd.Tc !== undefined && Number.isFinite(rd.Tc) ? { Tc: rd.Tc } : {}),
        ...(rd.Pc_bar !== undefined && Number.isFinite(rd.Pc_bar) ? { Pc: rd.Pc_bar * 1e5 } : {}),
        ...(rd.omega !== undefined && Number.isFinite(rd.omega) ? { omega: rd.omega } : {}),
      };
      const files = synthesizeExploreCase({
        components: [], properties: [], axis: { variable: "T", from: 0, to: 1, n: 2 },
        state: { composition: {} },
        estimate: {
          component: name.trim(),
          groups: rows.map((r) => ({ group: r.group, count: Math.round(r.count) })),
          estimator: "Joback",
          ...(Object.keys(reference).length > 0 ? { reference } : {}),
        },
      });
      const resolved = await resolveAdapter("wasm");
      if (resolved.kind === "unavailable") {
        setErr(resolved.fallbackReason ?? "The solver (WASM) could not be loaded."); setBusy(false); return;
      }
      const res = await resolved.adapter.run(files, () => {}, undefined, "choupoProps");
      if (res.status !== "done")
        setErr("estimateComponent did not finish — check the groups (every group must be a known Joback key).");
      setResult(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const op = result?.operationResults?.find((r) => r.type === "estimateComponent");
  const d = op?.diagnostics ?? {};
  const proposalEntry = Object.entries(result?.proposals ?? {}).find(
    ([p]) => p.includes(`${name.trim()}.estimate`),
  );
  const proposalName = proposalEntry ? proposalEntry[0].split("/").pop()! : null;
  const proposalText = proposalEntry ? proposalEntry[1] : null;
  const rd = refDisplay();

  const devPct = (est: number | undefined, ref: number | undefined): string => {
    if (est === undefined || ref === undefined || !Number.isFinite(ref) || ref === 0) return "";
    const dv = ((est - ref) / ref) * 100;
    return `${dv >= 0 ? "+" : ""}${dv.toFixed(2)}%`;
  };

  // (estimated value, label, unit, reference value for dev)
  const constRows: [number | undefined, string, string, number | undefined][] = [
    [d.Tb_K, "Tb (normal b.p.)", "K", rd.Tb],
    [d.Tc_K, "Tc (critical)", "K", rd.Tc],
    [d.Pc_bar, "Pc (critical)", "bar", rd.Pc_bar],
    [d.omega, "ω (acentric)", "—", rd.omega],
    [d.Vliq298_cm3mol, "Vliq(298 K)", "cm³/mol", undefined],
    [d.dHf_kJmol, "ΔHf°(298, gas)", "kJ/mol", undefined],
    [d.Cp298, "Cp_ig(298 K)", "J/mol·K", undefined],
    [d.Psat_298_bar, "Psat(298 K)", "bar", undefined],
  ];

  return (
    <Modal opened={opened} onClose={onClose} size="lg" title={
      <Text fw={600}>Estimate a new component — Joback group contribution</Text>
    }>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          Declare the molecular groups; the engine estimates the pure-component
          constants (+ Psat by Ambrose-Walton, Vliq by Rackett). The result is an
          <b> ESTIMATE</b> you DOWNLOAD as a reviewable proposal — rename it to
          <code> constant/components/{name.trim() || "<name>"}.dat</code> on disk to promote.
        </Text>

        <TextInput label="Component name (the filename stem you will type in cases)"
          placeholder="pentadiene" value={name} onChange={(e) => setName(e.currentTarget.value)} />

        <div>
          <Text size="sm" fw={500} mb={4}>Molecular groups (Joback)</Text>
          <Stack gap={6}>
            {rows.map((r, i) => (
              <Group key={i} gap="xs" wrap="nowrap">
                <Select data={JOBACK_GROUPS} value={r.group} searchable
                  onChange={(v) => setRow(i, { group: v ?? "CH3" })} w={250} allowDeselect={false} />
                <NumberInput value={r.count} min={1} w={90}
                  onChange={(v) => setRow(i, { count: Math.max(1, Math.round(num(v, 1))) })} />
                <ActionIcon variant="subtle" color="gray" aria-label="remove group"
                  onClick={() => delRow(i)} disabled={rows.length <= 1}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
          <Button variant="subtle" size="compact-xs" leftSection={<IconPlus size={14} />}
            onClick={addRow} mt={6}>add group</Button>
        </div>

        <Button variant="subtle" size="compact-xs" onClick={() => setRefOpen((o) => !o)} w="fit-content">
          {refOpen ? "Hide reference (validation)" : "Reference values (optional — see the deviation)"}
        </Button>
        <Collapse in={refOpen}>
          <Group gap="xs" wrap="wrap">
            <NumberInput label="Tb (K)" value={refTb} onChange={(v) => setRefTb(String(v ?? ""))} w={110} />
            <NumberInput label="Tc (K)" value={refTc} onChange={(v) => setRefTc(String(v ?? ""))} w={110} />
            <NumberInput label="Pc (bar)" value={refPc} onChange={(v) => setRefPc(String(v ?? ""))} w={110} />
            <NumberInput label="ω (-)" value={refW} onChange={(v) => setRefW(String(v ?? ""))} w={110} />
          </Group>
        </Collapse>

        <Group>
          <Button color="accent" onClick={() => void run()} disabled={!canRun || busy}
            leftSection={busy ? <Loader size={14} /> : undefined}>
            {busy ? "Estimating…" : "Estimate"}
          </Button>
          {!canRun && <Text size="xs" c="dimmed">name + at least one group required</Text>}
        </Group>

        {err && <Alert color="red" variant="light">{err}</Alert>}

        {op && (
          <>
            <Divider label="Estimated properties (ESTIMATE — review before trusting)" labelPosition="center" />
            <Table withRowBorders={false} verticalSpacing={2} fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>property</Table.Th><Table.Th ta="right">value</Table.Th>
                  <Table.Th>unit</Table.Th><Table.Th ta="right">vs ref</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {constRows.filter(([v]) => v !== undefined).map(([v, label, unit, ref]) => (
                  <Table.Tr key={label}>
                    <Table.Td>{label}</Table.Td>
                    <Table.Td ta="right" ff="monospace">{v!.toPrecision(5)}</Table.Td>
                    <Table.Td c="dimmed">{unit}</Table.Td>
                    <Table.Td ta="right" c="dimmed">{devPct(v, ref)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Group gap={6}>
              <Badge size="sm" variant="light" color="orange">origin: estimate</Badge>
              <Text size="xs" c="dimmed">
                Joback + Lee-Kesler ω + Ambrose-Walton Psat + Rackett Vliq — corresponding states, a few % error (worse for polar species).
              </Text>
            </Group>

            <Group justify="space-between" align="center" mt={4}>
              <Text size="xs" c="dimmed">
                Downloads a dated proposal; review its gaps, then rename to
                <code> {name.trim()}.dat</code> to promote (the GUI never writes it in place).
              </Text>
              <Tooltip label={proposalText
                ? "Save the dated .estimate-DATE.dat proposal (Save-As lets you pick the folder)"
                : "no proposal produced"} withArrow multiline w={240}>
                <Button leftSection={<IconDownload size={16} />} disabled={!proposalText}
                  onClick={() => proposalText && proposalName && void downloadComponentProposal(proposalName, proposalText)}>
                  Download proposal
                </Button>
              </Tooltip>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
