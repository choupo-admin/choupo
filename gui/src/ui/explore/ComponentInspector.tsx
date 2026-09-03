/*---------------------------------------------------------------------------*\
  ComponentInspector — a component as a SCIENTIFIC OBJECT.

  The credo's click convention, extended to the compound browser (Vítor,
  2026-08-11):

      single click   use this component in the current property task
      double click   inspect this component as a scientific object

  Inspection is not a task, so it is NOT a workspace — a workspace in this GUI
  answers "what am I doing" (Flowsheet, Props, Explore, Streams, …) and putting
  an object beside nine verbs would also make the student LEAVE the property
  task to look at a component.  It is a deeper view OF the selected object, so
  it is a panel; and because the ThermoML datasets, residual plots and curation
  dossiers ahead will outgrow a rail, the same component also mounts full-window
  in its own tab (?component=<name>).

  ADDRESSABLE, NOT STASHED.  exploreMccabePopOut stashes a payload because a
  computed curve cannot be re-derived without the engine.  A component record
  CAN: it is resolvable by name.  So the tab boots from the NAME in the URL and
  re-derives — which makes it bookmarkable, shareable and linkable from the
  Property Guide, and means there is no stash to expire.

  It renders `componentRecord.ts` and adds nothing: every verdict shown is the
  curation dossier's, every gap is the record's own silence.
\*---------------------------------------------------------------------------*/

import { Badge, Box, Button, Code, Collapse, Divider, Group, ScrollArea, Stack, Table, Text, Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconExternalLink, IconFileText } from "@tabler/icons-react";
import { useState } from "react";

import type { ComponentRecord, CurationVerdict } from "../../case/componentRecord.js";

/** How each dossier verdict is drawn.  The GUI picks a COLOUR and a sentence;
 *  it does not pick the verdict, and it does not collapse two verdicts into one
 *  badge.  `validationRefused` in particular must keep its own cell: "you
 *  fitted everything you had, so nothing tested it" is the most valuable thing
 *  a student can read here, and it is exactly what a friendlier scheme would
 *  round off into "fitted". */
const VERDICT: Record<CurationVerdict, { label: string; color: string; help: string }> = {
  validated: { label: "VALIDATED", color: "green",
    help: "fitted on declared evidence and tested against held-out points it never saw; the held-out error met the acceptance band declared BEFORE the fit" },
  notValidated: { label: "NOT VALIDATED", color: "red",
    help: "tested against held-out points and MISSED the acceptance band declared before the fit — a finding, not a failure to hide" },
  heldOutPerformed: { label: "HELD-OUT TESTED", color: "blue",
    help: "tested against held-out points, but no acceptance band was declared beforehand — the residuals are reported and no verdict is claimed" },
  validationRefused: { label: "NOT TESTED", color: "orange",
    help: "no independent evidence remained after fitting: everything available was used to fit, so nothing tested the result. The honest answer, not a smaller split" },
  notClaimed: { label: "no dossier", color: "gray",
    help: "no curation dossier is attached to this property, so no scientific claim has been made about it. The datum may be perfectly good — nobody has declared evidence for it" },
};

function VerdictCell({ v }: { v: CurationVerdict }) {
  const s = VERDICT[v];
  return (
    <Tooltip label={s.help} withArrow multiline w={300}>
      <Badge size="xs" variant="light" color={s.color} tt="none">{s.label}</Badge>
    </Tooltip>
  );
}

export function ComponentInspector({ record, onClose }: {
  record: ComponentRecord;
  onClose?: () => void;
}) {
  const [rawOpen, setRawOpen] = useState(false);

  return (
    <Stack gap="sm" style={{ height: "100%", minHeight: 0 }}>
      <Group justify="space-between" align="baseline" wrap="nowrap">
        <Group gap={8} align="baseline">
          <Text fw={700} size="lg">{record.name}</Text>
          {record.formula && <Text c="dimmed" size="sm">{record.formula}</Text>}
        </Group>
        {onClose && <Button size="compact-xs" variant="subtle" onClick={onClose}>close</Button>}
      </Group>

      {record.marks.length > 0 && (
        <Stack gap={4}>
          {record.marks.map((m) => (
            <Group key={m.kind + m.text} gap={6} wrap="nowrap" align="flex-start">
              {m.tone === "warn" && <IconAlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0 }} />}
              <Text size="xs" c={m.tone === "warn" ? "orange.6" : "dimmed"}>{m.text}</Text>
            </Group>
          ))}
        </Stack>
      )}

      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        <Stack gap="md">
          <Section title="IDENTITY">
            <Table fz="xs" withRowBorders={false}>
              <Table.Tbody>
                {record.identity.map((r) => (
                  <Table.Tr key={r.label}>
                    <Table.Td w={110} c="dimmed">{r.label}</Table.Td>
                    <Table.Td>
                      {r.value !== null
                        ? <Text size="xs" ff="monospace">{r.value}</Text>
                        : <Text size="xs" c="dimmed" fs="italic">— {r.gap}</Text>}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Section>

          <Section title="PROPERTY COVERAGE">
            <Table fz="xs" withRowBorders={false}>
              <Table.Tbody>
                {record.capabilities.map((c) => (
                  <Table.Tr key={c.key}>
                    <Table.Td w={16}>
                      <Text size="sm" fw={700} c={c.present ? "green.5" : "red.5"}>
                        {c.present ? "✓" : "✗"}
                      </Text>
                    </Table.Td>
                    <Table.Td w={150}>{c.label}</Table.Td>
                    <Table.Td>
                      {c.present
                        ? <Text size="xs" ff="monospace" c="dimmed">{c.detail}</Text>
                        : <Text size="xs" c="dimmed" fs="italic">{c.unlocks}</Text>}
                    </Table.Td>
                    <Table.Td w={110} ta="right">
                      {c.present && <VerdictCell v={c.verdict} />}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Text size="xs" c="dimmed" mt={4}>
              ✓ means the record CARRIES the block — never that the numbers are
              good.  The right-hand column is the curation dossier's verdict, and
              it is the only thing here that speaks to quality.
            </Text>
          </Section>

          {record.models.length > 0 && (
            <Section title="RESOLVED MODELS">
              <Table fz="xs" withRowBorders={false}>
                <Table.Tbody>
                  {record.models.map((m) => (
                    <Table.Tr key={m.slot + m.model}>
                      <Table.Td w={180} c="dimmed">{m.slot}</Table.Td>
                      <Table.Td><Text size="xs" ff="monospace">{m.detail}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Section>
          )}

          {record.valueOrigins.length > 0 && (
            <Section title="HOW EACH VALUE WAS PRODUCED">
              <Table fz="xs" withRowBorders={false}>
                <Table.Tbody>
                  {record.valueOrigins.map((v) => (
                    <Table.Tr key={v.field}>
                      <Table.Td w={70}><Text size="xs" ff="monospace">{v.field}</Text></Table.Td>
                      <Table.Td w={90}>
                        <Badge size="xs" variant="light"
                          color={v.origin === "measured" || v.origin === "experimental"
                                   || v.origin === "literature" ? "green" : "yellow"}>
                          {v.origin}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" ff="monospace" c="dimmed">
                          {v.method}{v.methodVersion ? ` · ${v.methodVersion}` : ""}
                        </Text>
                        {v.inputFingerprint && (
                          <Text size="xs" c="dimmed" ff="monospace">
                            inputs {v.inputFingerprint}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td w={130} ta="right">
                        {v.uncertaintyStatus
                          ? <Text size="xs" c={v.uncertaintyStatus === "unquantified"
                                                 ? "yellow.6" : "dimmed"}>
                              {v.uncertaintyStatus}
                            </Text>
                          : <Text size="xs" c="dimmed" fs="italic">not declared</Text>}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <Text size="xs" c="dimmed" mt={4}>
                Read straight off the record&apos;s own <Code>provenance {"{}"}</Code>
                {" "}blocks — one per value that declares an <Code>origin</Code>.  A
                value produced by a correlation is not a measured one, and a
                generated component would otherwise be indistinguishable on this
                screen from a curated one.  <b>unquantified</b> is the
                record&apos;s own answer about its error, not a missing field.
              </Text>
            </Section>
          )}

          <Section title="EVIDENCE / PROVENANCE">
            <Text size="xs" c="dimmed">
              No curation dossier is attached to this component.  A dossier is
              produced by <Code>bin/choupo-curate &lt;{record.name}&gt;</Code>,
              which extracts ThermoML datasets, DECLARES which are fitted and
              which are held out <i>before</i> fitting, and records the held-out
              residuals beside the acceptance band.  Until then every property
              above reads <b>no dossier</b> — not because the data is bad, but
              because nobody has declared evidence for it.
            </Text>
          </Section>

          <Box>
            <Button size="compact-xs" variant="subtle" leftSection={<IconFileText size={13} />}
              onClick={() => setRawOpen((v) => !v)}>
              {rawOpen ? "hide" : "view"} raw record
            </Button>
            <Collapse in={rawOpen}>
              <Code block fz={10} mt={6} style={{ maxHeight: 360, overflow: "auto" }}>
                {record.raw}
              </Code>
            </Collapse>
          </Box>
        </Stack>
      </ScrollArea>

      <Button size="compact-xs" variant="light" color="accent"
        leftSection={<IconExternalLink size={13} />}
        onClick={() => window.open(
          `${window.location.pathname}?component=${encodeURIComponent(record.name)}`,
          "_blank", "noopener")}>
        open full
      </Button>
    </Stack>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text size="xs" fw={700} c="dimmed" mb={4}>{title}</Text>
      <Divider mb={6} />
      {children}
    </Box>
  );
}
