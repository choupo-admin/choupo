/*---------------------------------------------------------------------------*\
  CompoundBrowser — the Property Explorer's left rail.

  Browse the standard catalogue (catalogue.ts manifest), search by name/formula,
  filter by role, click to add/remove components into the selected SET (the
  single driving state of the explorer).  Lives ONLY inside the Explore
  workspace (vanishes on Esc) -- not the permanent left panel the credo killed.
  Pure UI: it renders names + role badges and emits component NAMES; no physics.
\*---------------------------------------------------------------------------*/

import { useCallback, useMemo, useRef, useState } from "react";
import { Badge, Box, Button, Chip, CloseButton, Group, ScrollArea, Stack, Text, TextInput, Tooltip, UnstyledButton } from "@mantine/core";
import { IconArrowRight, IconFlask } from "@tabler/icons-react";

import { CATALOGUE, DATA_LOCAL_CATALOGUE, type ComponentMeta, formulaIfDistinct, searchCatalogue } from "../../case/catalogue.js";
import { FIRST_PATH } from "../../cases/tutorials.js";
import { familyOf, familyRank, type Family } from "../../case/family.js";

type RoleFilter = "all" | "vle" | "solute";

// Recently-used compounds — a small MRU list (last 6), persisted GLOBALLY (the
// Explorer is a scratchpad over the same catalogue regardless of the open case).
// View-only convenience, never disk; surfaced as a "Recently used" sub-group.
const RECENT_KEY = "choupo.explore.recentComponents";
const RECENT_MAX = 6;
function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch { return []; }
}
function pushRecent(name: string): string[] {
  const next = [name, ...loadRecent().filter((n) => n !== name)].slice(0, RECENT_MAX);
  try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* blocked */ }
  return next;
}

// Group a STANDARD-catalogue result list by what each group UNLOCKS — metadata
// that ALREADY exists (vleAble, isElectrolyte, isPermanentGas, kind), no new
// data, no recommended badge.  Grouping-by-what-it-unlocks is self-documenting:
// a student wanting a psychro chart SEES "Permanent gases" and learns the
// carrier concept.
//
// TWO ORDERS, TWO LISTS (2026-09-03).  Classification is first-match and its
// precedence is a fact about the tests (a radical is also a gas, so radicals
// must be tested before gases); display is a fact about WHO IS LOOKING.  One
// list served both until today, so the 44 combustion radicals opened the
// Explore browser -- the opposite of what was asked for on 2026-09-01.
// `groupOf` carries the precedence in its statement order; DISPLAY_ORDER
// carries the reading order; neither is derived from the other.
//  CAPABILITY IS A FILTER, NOT A LEVEL (2026-09-03, Vítor: "VLE e nonvolatile
//  no topo não faz muita lógica").  He is right, and the numbers say how much:
//  "Volatile liquids (VLE-able)" held 352 of 570 records -- 62 % of the
//  catalogue behind a label describing what the SOLVER can do, with the actual
//  chemistry (102 alkanes, 26 aromatics, 18 alcohols, ...) buried one level
//  below it; and "Non-volatile solutes / polymers / others" was 18 records in a
//  bin whose name ends in "others", which is what a classification says when it
//  has stopped classifying.
//
//  The clinching argument was already on screen: the browser carries `all /
//  VLE / nonvolatile` FILTER CHIPS.  The same fact was drawn twice -- once as a
//  filter, correctly, and once as a hierarchy -- and the hierarchy copy was
//  most of the catalogue.
//
//  So the two capability buckets are gone as GROUPS.  Their members are filed
//  by WHAT THEY ARE, using the family machinery that already existed one level
//  down (`case/family.ts`: the record's own UNIFAC groups, else its formula,
//  each label saying which -- never a name).  Nothing else moved: the
//  classification PRECEDENCE below is untouched, so no record changes hands
//  between the groups that remain.
type GroupKey = string;   // a fixed key below, or `fam:<familyKey>`

/** The components the first-path tutorials declare (`tier tutorial;` cases,
 *  read off the bundle -- recounted, never listed by hand).  A student's
 *  first screen opens on the substances the first cases actually use. */
export const FIRST_PATH_COMPONENTS: ReadonlySet<string> = new Set(
  FIRST_PATH.flatMap((e) => {
    const c = (e.files.thermoPackage as { components?: unknown }).components;
    return Array.isArray(c) ? c.map(String) : [];
  }),
);

//  EVERY GROUP IS DERIVED FROM DECLARED RECORD FACTS (catalogue.ts metaFromDat)
//  -- tags, solidPhases, dissociatesTo, Tb, vaporPressure -- never from a
//  name.  Asked for by the owner 2026-09-01: "gases at room temperature and
//  salts are the obvious ones", and radicals filed as their own group before
//  the release, so a student does not meet OH between octane and phenol.
const FIXED_LABEL: Record<string, string> = {
  firstPath: "Used in the first-path tutorials",
  radicals: "Radicals (open-shell species)",
  salts: "Salts & minerals",
  gases25: "Gases at 25 °C (Tb below 298.15 K)",
  combustion: "Gas-phase combustion species",
  //  compA/compB/compC and friends: synthetic stand-ins used by the regression
  //  suite.  Kept visible, kept LAST, labelled for what they are.
  synthetic: "Synthetic test stand-ins (NOT real substances)",
};

/** The label of any group key -- a fixed one, or the family's own.  ONE home:
 *  a family's wording belongs to `case/family.ts`, which derives it from the
 *  record, and copying it here would be a second spelling of the same fact. */
export function groupLabel(g: GroupKey): string {
  if (FIXED_LABEL[g]) return FIXED_LABEL[g]!;
  const key = g.startsWith("fam:") ? g.slice(4) : g;
  return FAMILY_LABEL.get(key) ?? key;
}
/** READING order: what a student charges to a vessel first; the mechanism
 *  library, the radicals and the synthetic stand-ins last and folded. */
/** Every family the catalogue actually contains, in the PRINCIPAL-GROUP order
 *  `family.ts` already declares (acids, esters, aldehydes, ketones, alcohols,
 *  amines, ethers, ... then the formula-derived ones, then the unplaced).  That
 *  is a chemical reading order and it is not re-decided here -- deriving it
 *  from the same `familyRank` the sub-tree used keeps one home for it. */
const CATALOGUE_FAMILIES: { key: string; label: string; rank: number }[] = (() => {
  const seen = new Map<string, { key: string; label: string; rank: number }>();
  for (const m of CATALOGUE) {
    const f = familyOf(m);
    if (!seen.has(f.key)) seen.set(f.key, { key: f.key, label: f.label, rank: familyRank(f) });
  }
  return [...seen.values()].sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
})();
const FAMILY_LABEL = new Map(CATALOGUE_FAMILIES.map((f) => [f.key, f.label]));

/** READING order: the way in first, then the two classes a student names by
 *  STATE rather than by chemistry (gases at 25 °C, salts & minerals), then the
 *  chemical families, then the mechanism library, the radicals and the
 *  synthetic stand-ins last. */
export const DISPLAY_ORDER: GroupKey[] = [
  "firstPath", "gases25", "salts",
  ...CATALOGUE_FAMILIES.map((f) => `fam:${f.key}`),
  "combustion", "radicals", "synthetic",
];
/** THE BROWSER IS A TREE (2026-09-03, Vítor: "GUI em forma de tree").  Every
 *  group is a node that folds; a group with more members than a screen holds
 *  is subdivided into FAMILIES (case/family.ts -- from the record's own UNIFAC
 *  groups, else from its formula, each label saying which), and families fold
 *  too, closed on first sight with their count.  Open by default: the groups
 *  a student charges to a vessel; folded: the mechanism library, the radicals
 *  and the synthetic stand-ins -- never 44 radicals or 352 names at the top. */
//  ONLY THE WAY IN IS OPEN.  With the capability buckets dissolved the top
//  level is ~20 nodes, every one of them a chemistry a student recognises, and
//  opening five of those would put several hundred names on the first screen --
//  the very thing the tree was built to stop.  Each folded node carries its
//  count, so the shape of the catalogue is readable without opening anything.
const OPEN_BY_DEFAULT: ReadonlySet<GroupKey> = new Set(["firstPath"]);
/** A group with more members than this is shown as families. */
const FAMILY_THRESHOLD = 24;
const groupNode = (g: GroupKey) => `g:${g}`;
const familyNode = (g: GroupKey, f: Family) => `g:${g}/f:${f.key}`;

//  CLASSIFICATION precedence: a record can satisfy several tests (a radical
//  is also a gas, a salt may carry a Tb), so the first match files it.
//  Synthetic first because it is a claim about the RECORD, not the substance;
//  first-path membership next because it is a claim about the CORPUS.
/** EXPORTED for the test that checks no record lands outside DISPLAY_ORDER.
 *  The test must call THIS function: a copy of the precedence in a test file
 *  would be a second home for the classification, and the two would agree
 *  exactly until the day one of them changed. */
export function groupOf(m: ComponentMeta): GroupKey {
  if (m.isSynthetic) return "synthetic";
  if (FIRST_PATH_COMPONENTS.has(m.name)) return "firstPath";
  if (m.isRadical) return "radicals";
  if (m.isSaltOrMineral) return "salts";
  if (m.isRoomTemperatureGas) return "gases25";
  //  The two branches that used to answer `volatiles` and `nonvolatile` now
  //  answer with the substance's own family.  The TESTS and their order are
  //  untouched, so a record files exactly where it filed before -- only the
  //  NAME of the bucket it lands in has stopped being a solver capability.
  if (m.vleAble) return `fam:${familyOf(m).key}`;
  if (m.isCombustion) return "combustion";
  return `fam:${familyOf(m).key}`;
}

export function CompoundBrowser({
  selected, onAdd, onRemove, vleContext = false, caseComponents, onEstimate, onInspect, unlockLine,
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
  /** DOUBLE click — inspect the component as a scientific object.  Single click
   *  stays "use it in the current task"; the two never compete, because one
   *  changes the SET and the other changes nothing. */
  onInspect?: (name: string) => void;
  /** "what unlocks next" — a structural fact shown under the SET chips
   *  (EXPLORER-ux-redesign §4); null when nothing further unlocks. */
  unlockLine?: string | null;
}) {
  const [q, setQ] = useState("");
  //  THE CAPABILITY FILTER BELONGS TO THE SURFACE THAT NEEDS IT, NOT TO THE
  //  CATALOGUE (2026-09-03, Vítor: "porque continuo a ter VLE no top?!").
  //
  //  Dissolving the `volatiles` / `nonvolatile` GROUPS was half the fix.  The
  //  `all / VLE / nonvolatile` chips stayed, leading the first screen of the
  //  compound catalogue with a modelling acronym -- and the catalogue's
  //  question is "what substances exist and what do we know about them", not
  //  "which of these can I put in a T-x-y plot".  That second question belongs
  //  where the plot is being built, and `vleContext` already marks exactly
  //  that: `ExploreWorkspace` passes it as `isVle || isTernary`.
  //
  //  Nothing is lost on the landing.  The capability is still legible where it
  //  is ABOUT SOMETHING -- the per-row `nonvol` / `frag` badge on the
  //  substances that cannot do VLE, and the record panel beside the tree.
  //
  //  The state is FORCED to "all" where the chips are not drawn: a control the
  //  reader cannot see must not still be filtering, which would hide compounds
  //  with no way to find out why.
  const [rawFilter, setFilter] = useState<RoleFilter>("all");
  const filter: RoleFilter = vleContext ? rawFilter : "all";
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [showDataLocal, setShowDataLocal] = useState(false);
  // Open tree nodes, by node key.  Groups start per OPEN_BY_DEFAULT; family
  // nodes start closed (a family is a count until it is asked for).
  const [openNodes, setOpenNodes] = useState<Set<string>>(
    () => new Set([...OPEN_BY_DEFAULT].map(groupNode)));
  const toggleNode = (k: string) => setOpenNodes((u) => {
    const n = new Set(u); if (n.has(k)) n.delete(k); else n.add(k); return n;
  });

  // Adding a component records it in the MRU (the "Recently used" group); the
  // recompute is driven by the parent's selected[] as before.
  //
  // The MRU is fed ONLY by selection, so "used" means "taken into a property
  // task" -- not "looked at" (Vitor, 2026-08-11).  A double click therefore
  // must not feed it: the first of its two clicks passes through `add` on the
  // way, so `add` remembers the list it displaced and `inspect` puts it back.
  // Six lines to make the sentence true in both directions -- a double click
  // leaves the SET and the MRU exactly as it found them, so INSPECTION CHANGES
  // NOTHING is a statement about the whole component, not just the set.
  const mruBeforeAdd = useRef<string[] | null>(null);
  const add = useCallback((name: string) => {
    mruBeforeAdd.current = loadRecent();
    setRecent(pushRecent(name));
    onAdd(name);
  }, [onAdd]);
  const inspect = useCallback((name: string) => {
    const before = mruBeforeAdd.current;
    if (before) {
      try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(before)); } catch { /* blocked */ }
      setRecent(before);
      mruBeforeAdd.current = null;
    }
    onInspect?.(name);
  }, [onInspect]);

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
  // data/local/ — the private working tier, UNVERIFIED; drop any name a curated
  // standard or a case-local file already provides.  This mirrors the engine's
  // own precedence (Database.cpp): standards BEATS local, local fills gaps.
  const stdNames = useMemo(() => new Set(CATALOGUE.map((m) => m.name)), []);
  const dataLocalResults = useMemo(
    () => searchCatalogue(q, DATA_LOCAL_CATALOGUE)
      .filter((m) => !localNames.has(m.name) && !stdNames.has(m.name) && passFilter(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, filter, localNames],
  );
  const nothing = caseResults.length === 0 && stdResults.length === 0 && dataLocalResults.length === 0;

  const sel = new Set(selected);

  // STANDARD section grouped by what each group UNLOCKS, with sticky sub-headers
  // (Recently used top, then Volatiles / Electrolytes / Permanent gases /
  // Non-volatile).  Search FLATTENS across the groups (q overrides grouping).
  const grouped = q.trim().length === 0;
  const recentRows = useMemo(() => {
    if (!grouped) return [];
    const present = new Map(stdResults.map((m) => [m.name, m]));
    return recent.map((n) => present.get(n)).filter((m): m is ComponentMeta => !!m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, stdResults, recent]);
  const recentSet = useMemo(() => new Set(recentRows.map((m) => m.name)), [recentRows]);
  const stdGroups = useMemo(() => {
    const buckets: Record<GroupKey, ComponentMeta[]> = {};
    for (const g of DISPLAY_ORDER) buckets[g] = [];
    for (const m of stdResults) {
      if (grouped && recentSet.has(m.name)) continue;   // already in "Recently used"
      //  A family key not in DISPLAY_ORDER cannot happen -- the order is
      //  derived from the same `familyOf` over the whole catalogue -- but a
      //  missing bucket would drop the record SILENTLY, and a browser that
      //  loses a compound without saying so is the failure mode this whole
      //  screen exists to avoid.
      const g = groupOf(m);
      (buckets[g] ??= []).push(m);
    }
    // Within a group, read by the NAME and not by its locants: a plain sort
    // opened "Volatile liquids" on 112Trichloroethane, 11Dichloroethane,
    // 1234Tetramethylbenzene -- every digit-prefixed IUPAC name ahead of
    // acetone.  The key moves leading locants aside (112Trichloroethane
    // files under T); the displayed name is untouched.
    const key = (m: ComponentMeta) => m.name.replace(/^[0-9,]+/, "").toLowerCase();
    for (const list of Object.values(buckets))
      list.sort((x, y) => key(x).localeCompare(key(y)) || x.name.localeCompare(y.name));
    return buckets;
  }, [stdResults, grouped, recentSet]);

  const renderRow = (m: ComponentMeta, keyPrefix = "") => {
    const on = sel.has(m.name);
    return (
      <UnstyledButton key={keyPrefix + m.name}
        onClick={() => (on ? onRemove(m.name) : add(m.name))}
        // Double click INSPECTS.  The browser deliberately keeps the plain
        // onClick/onDoubleClick pair FolderNav already uses (no debounce
        // timer), which means a double click toggles twice and leaves the SET
        // exactly as it found it -- inspection changes nothing.  That falls out
        // of the pattern rather than being engineered; `inspect` above restores
        // the MRU the passing clicks displaced, so the same is true there.
        onDoubleClick={onInspect ? () => inspect(m.name) : undefined}
        title={onInspect ? "click to use · double click to inspect" : undefined}
        className="choupo-compound-row"
        data-on={on ? "true" : undefined}
        style={{
          padding: "3px 6px", borderRadius: 4,
          background: on ? "var(--mantine-color-accent-light)" : undefined,
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
            {m.origin === "dataLocal" && (
              <Tooltip withArrow multiline w={250}
                label="Your PRIVATE working tier (data/local/, gitignored) — UNVERIFIED, not part of the curated catalogue. The solver announces it '[local] … UNVERIFIED'; the curated data/standards/ entry WINS where one exists (local fills gaps). Review its gaps (esp. Cp / formation), then promote it to data/standards/.">
                <Badge size="xs" variant="light" color="orange">local</Badge>
              </Tooltip>
            )}
            {(m.origin === "caseLocal" || m.origin === "caseShadow") && (
              <Tooltip withArrow multiline w={230}
                label={m.origin === "caseShadow"
                  ? "case-local .dat — overrides the standard component of the same name (shipped to the solver)"
                  : "case-local component — shipped to the solver as a raw .dat"}>
                <Badge size="xs" variant="light" color="teal">
                  {m.origin === "caseShadow" ? "override" : "case"}
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
      {vleContext && (
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
      )}

      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        <Stack gap={1}>
          {/* CASE COMPONENTS — the open case's tree, a separate list above the
              frozen standard catalogue. */}
          {caseResults.length > 0 && <SubHeader label="CASE COMPONENTS" c="teal.6" />}
          {caseResults.map((m) => renderRow(m, "case-"))}

          {/* STANDARD CATALOGUE — grouped by what each group UNLOCKS (sticky
              sub-headers), or a flat list while searching (q overrides). */}
          {grouped ? (
            <>
              {recentRows.length > 0 && <SubHeader label="Recently used" />}
              {recentRows.map((m) => renderRow(m, "recent-"))}
              {DISPLAY_ORDER.map((g) => {
                const members = stdGroups[g] ?? [];
                if (members.length === 0) return null;
                const gk = groupNode(g);
                const open = openNodes.has(gk);
                // Families: only where a flat list would be a wall.
                //  A FAMILY GROUP DOES NOT SUB-DIVIDE INTO ITSELF.  Since
                //  2026-09-03 the families ARE the top level for everything
                //  that is not a state class, so asking for families inside
                //  one would produce a single child node wearing its parent's
                //  name -- a fold that folds nothing.
                const families = (!g.startsWith("fam:") && members.length > FAMILY_THRESHOLD) ? (() => {
                  const map = new Map<string, { fam: Family; rows: ComponentMeta[] }>();
                  for (const m of members) {
                    const fam = familyOf(m);
                    const e = map.get(fam.key) ?? { fam, rows: [] };
                    e.rows.push(m); map.set(fam.key, e);
                  }
                  return [...map.values()].sort((a, b) => familyRank(a.fam) - familyRank(b.fam));
                })() : null;
                return (
                  <Box key={g} data-group={g} data-open={open ? "true" : "false"}>
                    <SubHeader label={`${groupLabel(g)} (${members.length})`}
                      onToggle={() => toggleNode(gk)} open={open} />
                    {open && !families && members.map((m) => renderRow(m, `${g}-`))}
                    {open && families && families.map(({ fam, rows }) => {
                      const fk = familyNode(g, fam);
                      const fopen = openNodes.has(fk);
                      return (
                        <Box key={fk} data-family={fam.key} data-basis={fam.basis} data-open={fopen ? "true" : "false"}>
                          <SubHeader label={`${fam.label} (${rows.length})`} indent={1} sticky={false}
                            onToggle={() => toggleNode(fk)} open={fopen} />
                          {fopen && <Box pl={14}>{rows.map((m) => renderRow(m, `${g}-${fam.key}-`))}</Box>}
                        </Box>
                      );
                    })}
                  </Box>
                );
              })}
            </>
          ) : (
            <>
              {caseResults.length > 0 && stdResults.length > 0 && <SubHeader label="STANDARD CATALOGUE" />}
              {stdResults.map((m) => renderRow(m))}
            </>
          )}

          {/* data/local/ — YOUR private working tier (gitignored), last + clearly marked. */}
          {dataLocalResults.length > 0 && (
            <Tooltip withArrow multiline w={260}
              label="data/local/ — your PRIVATE working tier (gitignored, never shipped). Usable for screening, but UNVERIFIED: the solver announces every consumption '[local] … UNVERIFIED', and you should review its gaps (esp. Cp / formation) before relying on it.">
              <UnstyledButton mt={8} onClick={() => setShowDataLocal((v) => !v)}
                aria-expanded={q.trim().length > 0 || showDataLocal}>
                <Text size="xs" fw={700} c="orange.6">
                  data/local/ — UNVERIFIED, review before relying ({dataLocalResults.length}) · {q.trim().length > 0 || showDataLocal ? "hide" : "show"}
                </Text>
              </UnstyledButton>
            </Tooltip>
          )}
          {(q.trim().length > 0 || showDataLocal) && dataLocalResults.map((m) => renderRow(m, "dataLocal-"))}
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
          {/* "What unlocks next" — a structural fact (two VLE compounds HAVE a
              McCabe diagram), not a recommendation.  Teaching, no badge. */}
          {unlockLine && (
            <Group gap={4} mt={6} wrap="nowrap" align="flex-start">
              <IconArrowRight size={13} style={{ marginTop: 2, flexShrink: 0, opacity: 0.7 }} />
              <Text size="xs" c="dimmed" style={{ lineHeight: 1.3 }}>{unlockLine}</Text>
            </Group>
          )}
        </Box>
      )}
    </Stack>
  );
}

/** A sticky sub-header for a catalogue group — stays pinned at the top of the
 *  scroll area as the group scrolls under it. */
function SubHeader({ label, c = "dimmed", onToggle, open = true, indent = 0, sticky = true }: {
  label: string; c?: string;
  /** when given, the header is a fold: click shows / hides its rows */
  onToggle?: () => void; open?: boolean;
  /** tree depth: a family header sits one step in under its group */
  indent?: number;
  /** group headers pin to the top as their rows scroll under them; a family
   *  header must not, or it would stack over its group's */
  sticky?: boolean;
}) {
  const style = {
    ...(sticky ? { position: "sticky" as const, top: 0, zIndex: 2 } : {}),
    letterSpacing: 0.3, paddingLeft: indent * 14,
    background: "light-dark(var(--mantine-color-body), var(--mantine-color-dark-7))",
  };
  if (!onToggle) {
    return <Text size="xs" fw={700} c={c} mt={6} pb={1} style={style}>{label}</Text>;
  }
  return (
    <UnstyledButton onClick={onToggle} aria-expanded={open} style={{ ...style, width: "100%" }}
      mt={6} pb={1}>
      <Text size="xs" fw={700} c={c} component="span">
        {open ? "▾" : "▸"} {label}
      </Text>
    </UnstyledButton>
  );
}
