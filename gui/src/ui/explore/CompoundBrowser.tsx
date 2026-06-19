/*---------------------------------------------------------------------------*\
  CompoundBrowser — the Property Explorer's left rail.

  Browse the standard catalogue (catalogue.ts manifest), search by name/formula,
  filter by role, click to add/remove components into the selected SET (the
  single driving state of the explorer).  Lives ONLY inside the Explore
  workspace (vanishes on Esc) -- not the permanent left panel the credo killed.
  Pure UI: it renders names + role badges and emits component NAMES; no physics.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Badge, Box, Button, Chip, CloseButton, Group, ScrollArea, Stack, Text, TextInput, Tooltip, UnstyledButton } from "@mantine/core";
import { IconFlask } from "@tabler/icons-react";

import { CATALOGUE, PROPOSED_CATALOGUE, type ComponentMeta, formulaIfDistinct, searchCatalogue } from "../../case/catalogue.js";

type RoleFilter = "all" | "vle" | "solute";

export function CompoundBrowser({
  selected, onAdd, onRemove, vleContext = false, caseComponents, onEstimate,
}: {
  selected: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  /** true when the active plot needs VLE-able compounds (VLE / ternary) — then
   *  non-VLE rows are dimmed (still clickable) so ineligibility is visible. */
  vleContext?: boolean;
  /** the open case's case-local components — shown as a SEPARATE list above the
   *  frozen standard catalogue (walked from the whole case tree). */
  caseComponents: ComponentMeta[];
  /** open the "estimate a missing component" modal (G3), prefilled with a name. */
  onEstimate: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("all");

  const passFilter = (m: ComponentMeta) =>
    filter === "vle" ? m.vleAble : filter === "solute" ? m.kind === "nonvolatile" : true;

  // Case components (separate list) and standard catalogue — the standard side
  // drops any name the case shadows, so each name appears in exactly one section.
  const caseResults = useMemo(() => caseComponents.filter((m) => {
    const t = q.trim().toLowerCase();
    return (!t || m.name.toLowerCase().includes(t) || m.formula.toLowerCase().includes(t)) && passFilter(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [caseComponents, q, filter]);
  const localNames = useMemo(() => new Set(caseComponents.map((m) => m.name)), [caseComponents]);
  const stdResults = useMemo(
    () => searchCatalogue(q, CATALOGUE).filter((m) => !localNames.has(m.name) && passFilter(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, filter, localNames],
  );
  // PROPOSED (data/proposed/) — unverified; drop any name a verified standard or
  // a case-local file already provides (those tiers shadow a proposal).
  const stdNames = useMemo(() => new Set(CATALOGUE.map((m) => m.name)), []);
  const proposedResults = useMemo(
    () => searchCatalogue(q, PROPOSED_CATALOGUE)
      .filter((m) => !localNames.has(m.name) && !stdNames.has(m.name) && passFilter(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, filter, localNames],
  );
  const nothing = caseResults.length === 0 && stdResults.length === 0 && proposedResults.length === 0;

  const sel = new Set(selected);

  const renderRow = (m: ComponentMeta) => {
    const on = sel.has(m.name);
    return (
      <UnstyledButton key={m.name}
        onClick={() => (on ? onRemove(m.name) : onAdd(m.name))}
        style={{
          padding: "3px 6px", borderRadius: 4,
          background: on ? "var(--mantine-color-accent-light)" : "transparent",
          opacity: vleContext && !m.vleAble ? 0.45 : 1,
        }}>
        <Group justify="space-between" gap={6} wrap="nowrap">
          <Text size="xs" fw={on ? 600 : 400} truncate>
            {m.name}
            {formulaIfDistinct(m) && (
              <Text span c="dimmed" size="xs">{" "}{formulaIfDistinct(m)}</Text>
            )}
          </Text>
          <Group gap={3} wrap="nowrap">
            {m.origin === "proposed" && (
              <Tooltip withArrow multiline w={250}
                label="Extended-tier component (data/proposed/) — machine-ingested / estimated, USABLE but not yet hand-curated. The solver prints a [proposed] notice; review its gaps (esp. Cp / formation) before relying on it, then promote it to the verified catalogue.">
                <Badge size="xs" variant="light" color="orange">proposed</Badge>
              </Tooltip>
            )}
            {(m.origin === "local" || m.origin === "local-shadow") && (
              <Tooltip withArrow multiline w={230}
                label={m.origin === "local-shadow"
                  ? "case-local .dat — overrides the standard component of the same name (shipped to the solver)"
                  : "case-local component — shipped to the solver as a raw .dat"}>
                <Badge size="xs" variant="light" color="teal">
                  {m.origin === "local-shadow" ? "override" : "local"}
                </Badge>
              </Tooltip>
            )}
            {!m.vleAble && (
              <Tooltip withArrow multiline w={220}
                label={m.kind === "nonvolatile"
                  ? "no vapour pressure — cannot appear in VLE / ternary plots"
                  : "no Tc / no Antoine — cannot appear in VLE / ternary plots"}>
                <Badge size="xs" variant="light" color="gray">
                  {m.kind === "nonvolatile" ? "nonvol" : "frag"}
                </Badge>
              </Tooltip>
            )}
          </Group>
        </Group>
      </UnstyledButton>
    );
  };

  return (
    <Stack gap={6} style={{ height: "100%", minHeight: 0 }}>
      <Group justify="space-between" align="center" gap={4} wrap="nowrap">
        <Text size="xs" fw={700} c="dimmed">COMPONENTS</Text>
        <Tooltip label="Estimate a component the catalogue lacks, by Joback groups" withArrow multiline w={220}>
          <Button size="compact-xs" variant="subtle" color="accent"
            leftSection={<IconFlask size={13} />} onClick={() => onEstimate(q.trim())}>
            estimate
          </Button>
        </Tooltip>
      </Group>
      <TextInput size="xs" placeholder="search name / formula"
        value={q} onChange={(e) => setQ(e.currentTarget.value)} />
      <Chip.Group value={filter} onChange={(v) => setFilter((v as RoleFilter) || "all")}>
        <Group gap={4}>
          {/* color="accent" so the CHECKED chip's --chip-color comes from the
              variant resolver (autoContrast → black) instead of the CSS default
              white-on-teal (Chip.css sets --chip-color: white unless color/variant
              is passed). */}
          <Chip size="xs" value="all" color="accent">all</Chip>
          <Chip size="xs" value="vle" color="accent">VLE</Chip>
          <Chip size="xs" value="solute" color="accent">nonvolatile</Chip>
        </Group>
      </Chip.Group>

      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        <Stack gap={1}>
          {/* CASE COMPONENTS — the open case's tree, a separate list above the
              frozen standard catalogue. */}
          {caseResults.length > 0 && (
            <Text size="xs" fw={700} c="teal.6" mt={2}>CASE COMPONENTS</Text>
          )}
          {caseResults.map(renderRow)}
          {caseResults.length > 0 && stdResults.length > 0 && (
            <Text size="xs" fw={700} c="dimmed" mt={8}>STANDARD CATALOGUE</Text>
          )}
          {stdResults.map(renderRow)}
          {/* PROPOSED — the extended data/proposed/ tier (usable, review first), last + clearly marked. */}
          {proposedResults.length > 0 && (
            <Tooltip withArrow multiline w={260}
              label="data/proposed/ — extended catalogue (bulk-ingested / estimated). Usable for screening, but not yet hand-curated: the solver flags it, and you should review its gaps (esp. Cp / formation) before relying on it.">
              <Text size="xs" fw={700} c="orange.6" mt={8}>PROPOSED — review before relying ({proposedResults.length})</Text>
            </Tooltip>
          )}
          {proposedResults.map(renderRow)}
          {nothing && (
            <Stack gap={6} align="center" mt="sm">
              <Text size="xs" c="dimmed" ta="center">no match</Text>
              {q.trim() && (
                <Button size="compact-xs" variant="light" color="accent"
                  leftSection={<IconFlask size={13} />} onClick={() => onEstimate(q.trim())}>
                  estimate “{q.trim()}” by groups
                </Button>
              )}
            </Stack>
          )}
        </Stack>
      </ScrollArea>

      {selected.length > 0 && (
        <Box>
          <Text size="xs" c="dimmed" mb={3}>SET ({selected.length})</Text>
          <Group gap={4}>
            {selected.map((n) => (
              <Badge key={n} size="sm" variant="filled" color="accent" tt="none"
                rightSection={<CloseButton size={12} onClick={() => onRemove(n)}
                  aria-label={`remove ${n}`} style={{ color: "inherit" }} />}>
                {n}
              </Badge>
            ))}
          </Group>
        </Box>
      )}
    </Stack>
  );
}
