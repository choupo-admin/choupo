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
import {
  VAN_KREVELEN_GROUPS, YANG2020_GROUPS, VK_QUICKPICKS, YANG_QUICKPICKS,
  selectData, groupBy, type PolymerGroup, type QuickPick,
} from "./polymerGroups.js";

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

// The three estimate modes the form offers.  Joback (small molecule) stays the
// default; the two polymer modes run the SAME estimateComponent op through the
// VanKrevelen / Yang2020 group estimators (data/standards/{vanKrevelen,yang2020}).
type Mode = "Joback" | "VanKrevelen" | "Yang2020";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "Joback", label: "Small molecule — Joback (Tc, Pc, ω, Psat)" },
  { value: "VanKrevelen", label: "Polymer density — Van Krevelen (ρ)" },
  { value: "Yang2020", label: "Polymer Tg — Yang 2020 (Tg∞)" },
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
  const [mode, setMode] = useState<Mode>("Joback");
  const [name, setName] = useState(prefillName);
  const [rows, setRows] = useState<Row[]>([{ group: "CH3", count: 1 }]);
  // Van Krevelen packing factor k (V = k·Vw → ρ = M0/V).  1.60 amorphous/glassy,
  // ~1.43 crystalline.  Visible + the student's to own (no-silent-crutch credo).
  const [packing, setPacking] = useState<string>("1.60");

  // The group table + UX bits for the current mode.
  const isPolymer = mode === "VanKrevelen" || mode === "Yang2020";
  const groupTable: PolymerGroup[] | null =
    mode === "VanKrevelen" ? VAN_KREVELEN_GROUPS : mode === "Yang2020" ? YANG2020_GROUPS : null;
  const groupSelect = mode === "Joback" ? JOBACK_GROUPS : selectData(groupTable!);
  const groupIndex = groupTable ? groupBy(groupTable) : null;
  const quickPicks: QuickPick[] =
    mode === "VanKrevelen" ? VK_QUICKPICKS : mode === "Yang2020" ? YANG_QUICKPICKS : [];
  const defaultGroup = (): string => groupSelect[0]?.value ?? "CH2";
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

  // Switching mode swaps the group catalogue: reset the rows to a valid group of
  // the new table (a Joback key is meaningless to Yang and vice-versa) + clear
  // the stale result.  Joback's default first group is CH3.
  const switchMode = (m: Mode) => {
    setMode(m);
    const table = m === "VanKrevelen" ? VAN_KREVELEN_GROUPS : YANG2020_GROUPS;
    const first = m === "Joback" ? "CH3" : (table[0]?.name ?? "CH2");
    setRows([{ group: first, count: 1 }]);
    setResult(null); setErr(null);
  };

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { group: defaultGroup(), count: 1 }]);
  const delRow = (i: number) => setRows((rs) => rs.filter((_, k) => k !== i));
  const applyQuickPick = (qp: QuickPick) => {
    setName(qp.name);
    setRows(qp.rows.map((r) => ({ ...r })));
    setResult(null); setErr(null);
  };

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
          estimator: mode,
          // small-molecule reference (Tb/Tc/Pc/ω) is only meaningful for Joback
          ...(mode === "Joback" && Object.keys(reference).length > 0 ? { reference } : {}),
          // Van Krevelen density needs the packing factor; Yang's Tg does not.
          ...(mode === "VanKrevelen" ? { polymer: { packing: num(packing, 1.6), state: "amorphous" } } : {}),
        },
      });
      const resolved = await resolveAdapter("wasm");
      if (resolved.kind === "unavailable") {
        setErr(resolved.fallbackReason ?? "The solver (WASM) could not be loaded."); setBusy(false); return;
      }
      const res = await resolved.adapter.run(files, () => {}, undefined, "choupoProps");
      if (res.status !== "done")
        setErr(`estimateComponent did not finish — check the groups (every group must be a known ${mode} key).`);
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
  // Joback (small molecule) result rows.
  const jobackRows: [number | undefined, string, string, number | undefined][] = [
    [d.Tb_K, "Tb (normal b.p.)", "K", rd.Tb],
    [d.Tc_K, "Tc (critical)", "K", rd.Tc],
    [d.Pc_bar, "Pc (critical)", "bar", rd.Pc_bar],
    [d.omega, "ω (acentric)", "—", rd.omega],
    [d.Vliq298_cm3mol, "Vliq(298 K)", "cm³/mol", undefined],
    [d.dHf_kJmol, "ΔHf°(298, gas)", "kJ/mol", undefined],
    [d.Cp298, "Cp_ig(298 K)", "J/mol·K", undefined],
    [d.Psat_298_bar, "Psat(298 K)", "bar", undefined],
  ];
  // Polymer result rows — keys from EstimateComponent::runPolymer diagnostics.
  const vanKrevelenRows: [number | undefined, string, string, number | undefined][] = [
    [d.M0_g_per_mol, "M0 (repeat-unit mass)", "g/mol", undefined],
    [d.Vw_cm3_per_mol, "Vw (van der Waals vol.)", "cm³/mol", undefined],
    [d.packing_k, "k (packing factor)", "—", undefined],
    [d.V_cm3_per_mol, "V = k·Vw (molar vol.)", "cm³/mol", undefined],
    [d.density_g_cm3, "ρ (density)", "g/cm³", undefined],
  ];
  const yangRows: [number | undefined, string, string, number | undefined][] = [
    [d.M0_g_per_mol, "M0 (repeat-unit mass)", "g/mol", undefined],
    [d.YgSum_1e3gKmol, "ΣYg (Tg function)", "10³ g·K/mol", undefined],
    [d.Tg_K, "Tg∞ (glass transition)", "K", undefined],
  ];
  const constRows = mode === "VanKrevelen" ? vanKrevelenRows
    : mode === "Yang2020" ? yangRows : jobackRows;

  // Glass-box additive breakdown (group | count | MW·count | contribution·count).
  // The GUI recomputes the SUM the engine also prints — same numbers, two places;
  // the engine's diagnostics remain the authoritative result above.
  const breakdown = (isPolymer && groupIndex)
    ? rows.map((r) => {
        const g = groupIndex[r.group];
        const c = Math.round(r.count);
        return {
          group: r.group, count: c,
          mw: g ? g.mw * c : undefined,
          contrib: g ? g.contrib * c : undefined,
        };
      })
    : [];
  const contribLabel = mode === "VanKrevelen" ? "n·Vw (cm³/mol)" : "n·Yg (10³ g·K/mol)";

  const title = mode === "VanKrevelen"
    ? "Estimate a polymer density — Van Krevelen group contribution"
    : mode === "Yang2020"
      ? "Estimate a polymer Tg — Yang 2020 group contribution"
      : "Estimate a new component — Joback group contribution";

  const intro = mode === "Joback" ? (
    <Text size="xs" c="dimmed">
      Declare the molecular groups; the engine estimates the pure-component
      constants (+ Psat by Ambrose-Walton, Vliq by Rackett). The result is an
      <b> ESTIMATE</b> you DOWNLOAD as a reviewable proposal — rename it to
      <code> constant/components/{name.trim() || "<name>"}.dat</code> on disk to promote.
    </Text>
  ) : mode === "VanKrevelen" ? (
    <Text size="xs" c="dimmed">
      Decompose the polymer's <b>repeat unit</b> into Van Krevelen groups; the
      engine sums M0 = Σn·MW and Vw = Σn·Vw (Bondi 1964) and returns
      <b> ρ = M0 / (k·Vw)</b>. k is the packing factor (≈1.60 amorphous, ≈1.43
      crystalline) — yours to set, and shown, never hidden.
    </Text>
  ) : (
    <Text size="xs" c="dimmed">
      Decompose the polymer's <b>repeat unit</b> into Yang 2020 groups; the engine
      sums M0 = Σn·MW and Yg = Σn·Yg (ACS Omega 2020, CC-BY) and returns the
      infinite-Mw glass transition <b>Tg∞ = ΣYg·10³ / M0</b>. For most vinyl
      polymers Nb (backbone-in-side-chain) = 0; add the <code>backboneSideChain</code>
      group only when a backbone atom sits in a side chain.
    </Text>
  );

  return (
    <Modal opened={opened} onClose={onClose} size="lg" title={<Text fw={600}>{title}</Text>}>
      <Stack gap="sm">
        <Select label="What to estimate" data={MODE_OPTIONS} value={mode}
          allowDeselect={false} onChange={(v) => v && switchMode(v as Mode)} />

        {intro}

        <TextInput label={isPolymer
          ? "Polymer name (the filename stem you will type in cases)"
          : "Component name (the filename stem you will type in cases)"}
          placeholder={isPolymer ? "polystyrene" : "pentadiene"}
          value={name} onChange={(e) => setName(e.currentTarget.value)} />

        {quickPicks.length > 0 && (
          <Group gap="xs" align="center">
            <Text size="xs" c="dimmed">Quick-pick repeat unit:</Text>
            {quickPicks.map((qp) => (
              <Button key={qp.name} variant="light" size="compact-xs"
                onClick={() => applyQuickPick(qp)}>{qp.label}</Button>
            ))}
          </Group>
        )}

        <div>
          <Text size="sm" fw={500} mb={4}>
            {isPolymer ? `Repeat-unit groups (${mode})` : "Molecular groups (Joback)"}
          </Text>
          <Stack gap={6}>
            {rows.map((r, i) => (
              <Group key={i} gap="xs" wrap="nowrap">
                <Select data={groupSelect} value={r.group} searchable
                  onChange={(v) => setRow(i, { group: v ?? defaultGroup() })} w={320} allowDeselect={false} />
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

        {mode === "VanKrevelen" && (
          <NumberInput label="Packing factor k  (V = k·Vw; ≈1.60 amorphous, ≈1.43 crystalline)"
            value={packing} min={1.0} max={2.0} step={0.01} decimalScale={2} w={360}
            onChange={(v) => setPacking(String(v ?? "1.60"))} />
        )}

        {mode === "Joback" && (
          <>
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
          </>
        )}

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
            {isPolymer && breakdown.length > 0 && (
              <>
                <Divider label="Additive group sum (glass-box — redo it by hand)" labelPosition="center" />
                <Table withRowBorders={false} verticalSpacing={2} fz="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>group</Table.Th><Table.Th ta="right">count</Table.Th>
                      <Table.Th ta="right">n·MW (g/mol)</Table.Th>
                      <Table.Th ta="right">{contribLabel}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {breakdown.map((b, i) => (
                      <Table.Tr key={i}>
                        <Table.Td ff="monospace">{b.group}</Table.Td>
                        <Table.Td ta="right">{b.count}</Table.Td>
                        <Table.Td ta="right" ff="monospace">{b.mw !== undefined ? b.mw.toFixed(3) : "—"}</Table.Td>
                        <Table.Td ta="right" ff="monospace">{b.contrib !== undefined ? b.contrib.toFixed(3) : "—"}</Table.Td>
                      </Table.Tr>
                    ))}
                    <Table.Tr>
                      <Table.Td fw={600}>Σ (M0, {mode === "VanKrevelen" ? "Vw" : "Yg"})</Table.Td>
                      <Table.Td />
                      <Table.Td ta="right" fw={600} ff="monospace">
                        {breakdown.reduce((s, b) => s + (b.mw ?? 0), 0).toFixed(3)}
                      </Table.Td>
                      <Table.Td ta="right" fw={600} ff="monospace">
                        {breakdown.reduce((s, b) => s + (b.contrib ?? 0), 0).toFixed(3)}
                      </Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
              </>
            )}

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
            {mode === "Yang2020" && d.Tg_K !== undefined && (
              <Text size="xs" c="dimmed">
                Tg∞ is the <b>infinite-molecular-weight limit</b>; a real sample's Tg(Mn) =
                Tg∞ − K/Mn sits a little below it.
              </Text>
            )}
            <Group gap={6}>
              <Badge size="sm" variant="light" color="orange">origin: estimate</Badge>
              <Text size="xs" c="dimmed">
                {mode === "VanKrevelen"
                  ? "Van Krevelen / Bondi 1964 Vw — ρ carries the packing-factor k uncertainty (try crystalline k≈1.43)."
                  : mode === "Yang2020"
                    ? "Yang 2020 (ACS Omega, CC-BY) — additive main-chain Tg∞; over-predicts bulky pendants (e.g. polystyrene +19%)."
                    : "Joback + Lee-Kesler ω + Ambrose-Walton Psat + Rackett Vliq — corresponding states, a few % error (worse for polar species)."}
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
