/*
 * LiteratureWorkspace -- "who measured this?", answered with citations.
 *
 * WHY THIS EXISTS.  Choupo's differentiator is provenance: every number in
 * the tree names the article it came from.  This workspace puts that
 * question one click from the flowsheet: search the user's PRIVATE mirror
 * of the NIST/TRC ThermoML Archive (11 923 articles from five journals,
 * installed by `bin/choupo-thermoml sync` into the gitignored
 * thirdParty/thermoml/) by compound name, and get authors, journal, year,
 * DOI and the measured properties -- a READING LIST, never a value.
 *
 * THE CREDO'S THREE QUESTIONS, answered at the door:
 *   1. Founding principle -- §2.2 "LLM is the author, GUI is the viewer":
 *      this renders metadata and writes nothing, ever.
 *   2. Dict-on-disk untouched -- there is no authoring channel here; the
 *      only outbound action is opening a DOI in a new tab.
 *   3. Audience -- both: the student learns that numbers come from named
 *      papers (the provenance lesson itself), the researcher finds the
 *      primary to read.
 *
 * HONEST ABSENCE.  No mirror is a STATUS, not an empty result: the dev
 * server answers 404 and this panel names the install command.  "Nobody
 * measured this" and "you have no mirror" are different sentences, and
 * showing the second as the first would teach a student that literature
 * does not exist.  The published site has no dev server and no mirror, so
 * it always shows the status panel -- correctly: the mirror is personal.
 *
 * The search is the same rule as `choupo-thermoml search`: every typed
 * word must substring-match some compound name in the entry (case-blind).
 * Chips offer the open case's own components as one-click terms, so the
 * common question -- "who measured MY system?" -- is zero typing.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Anchor,
  Badge,
  Box,
  Button,
  Code,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconBook2, IconSearch } from "@tabler/icons-react";
import { useStore } from "../state/store.js";

interface Citation {
  file: string;
  title: string;
  authors: string[];
  journal: string;
  year: string;
  doi: string;
  compounds: string[];
  properties: string[];
}

type MirrorState =
  | { kind: "loading" }
  | { kind: "absent" }
  | { kind: "ready"; entries: Citation[] };

const SHOW_STEP = 25;

export function LiteratureWorkspace() {
  const thermoComponents = useStore(
    (s) => s.caseFiles.thermoPackage?.["components"],
  );
  const caseComponents: string[] = Array.isArray(thermoComponents)
    ? thermoComponents.filter((c): c is string => typeof c === "string")
    : [];

  const [mirror, setMirror] = useState<MirrorState>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [showN, setShowN] = useState(SHOW_STEP);

  useEffect(() => {
    let dead = false;
    //  ONE INDEX (2026-08-25).  This panel used to read a parallel
    //  citations.jsonl built by a second toolchain over a second copy of the
    //  cache; there is one index now, `bin/choupo-thermoml index`.  The dev
    //  server PROJECTS it (70 MB of CAS/InChI down to the ~7 MB of citation
    //  this panel shows) -- see thermomlIndexPlugin -- so what arrives here is
    //  already the shape below.
    //  BASE-relative, not root-absolute.  A frozen copy served from
    //  /vYYMM/app/ sent this probe to the SITE ROOT -- the same class as the
    //  engine paths fixed on 2026-09-02 (wasmModule.ts), harmless here only
    //  because the dev-server middleware that answers it is absent on every
    //  published copy anyway.  drive-app reports any request that leaves the
    //  app's own prefix, and this was the one it found on its first run.
    fetch(`${import.meta.env.BASE_URL}__thermoml/index.json`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const raw = (await r.json()) as { entries?: Citation[] };
        if (!dead) setMirror({ kind: "ready", entries: raw.entries ?? [] });
      })
      .catch(() => {
        if (!dead) setMirror({ kind: "absent" });
      });
    return () => {
      dead = true;
    };
  }, []);

  const terms = useMemo(
    () => query.toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );

  const hits = useMemo(() => {
    if (mirror.kind !== "ready" || terms.length === 0) return [];
    return mirror.entries.filter((e) => {
      const names = e.compounds.map((n) => n.toLowerCase());
      return terms.every((t) => names.some((n) => n.includes(t)));
    });
  }, [mirror, terms]);

  useEffect(() => setShowN(SHOW_STEP), [query]);

  if (mirror.kind === "loading") {
    return (
      <Stack align="center" justify="center" h="100%" gap="sm">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">reading the local citation index...</Text>
      </Stack>
    );
  }

  if (mirror.kind === "absent") {
    return (
      <Stack align="center" justify="center" h="100%" p="xl" gap="sm">
        <IconBook2 size={40} stroke={1.2} />
        <Text fw={600}>No local literature mirror</Text>
        <Text size="sm" c="dimmed" ta="center" maw={560}>
          This workspace searches your private mirror of the NIST/TRC
          ThermoML Archive — 11 923 articles from five journals, with the
          citation and measured properties of each. The mirror lives on
          your machine (thirdParty/thermoml/, gitignored and never
          committed) and the runtime never reads it. Install it once with:
        </Text>
        <Code>bin/choupo-thermoml sync</Code>
        <Text size="xs" c="dimmed" ta="center" maw={560}>
          ~190 MB from data.nist.gov, checksum-verified against the NIST
          record. If you use it in published work, NIST asks that you cite
          doi:10.18434/mds2-2422.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack h="100%" gap="xs" p="md">
      <Group gap="xs" wrap="nowrap">
        <TextInput
          style={{ flex: 1 }}
          leftSection={<IconSearch size={16} />}
          placeholder="compound names — every word must match, e.g. “formaldehyde water”"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          autoFocus
        />
      </Group>
      {caseComponents.length > 0 && (
        <Group gap={6}>
          <Text size="xs" c="dimmed">this case:</Text>
          {caseComponents.map((c) => (
            <Badge
              key={c}
              variant="light"
              style={{ cursor: "pointer", textTransform: "none" }}
              onClick={() =>
                setQuery((q) => (q.split(/\s+/).includes(c) ? q : (q + " " + c).trim()))
              }
            >
              {c}
            </Badge>
          ))}
        </Group>
      )}

      {terms.length === 0 ? (
        <Stack align="center" justify="center" style={{ flex: 1 }} gap={4}>
          <Text size="sm" c="dimmed">
            {mirror.entries.length} articles indexed. Type a compound — or
            click a chip — to ask who measured it.
          </Text>
        </Stack>
      ) : (
        <>
          <Text size="xs" c="dimmed">
            {hits.length} article{hits.length === 1 ? "" : "s"} where every
            term matches a compound
          </Text>
          <ScrollArea style={{ flex: 1 }}>
            <Stack gap="sm" pr="md">
              {hits.slice(0, showN).map((e) => (
                <Box key={e.file}>
                  <Text size="sm" fw={600}>
                    {e.authors.slice(0, 4).map((a) => (a.split("[")[0] ?? a).trim()).join("; ")}
                    {e.authors.length > 4 ? " et al." : ""}{" "}
                    <Text span c="dimmed">({e.year})</Text>
                  </Text>
                  <Text size="sm">{e.title}</Text>
                  <Group gap="xs">
                    <Text size="xs" c="dimmed">{e.journal}</Text>
                    {e.doi && (
                      <Anchor
                        size="xs"
                        href={`https://doi.org/${e.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        doi:{e.doi}
                      </Anchor>
                    )}
                  </Group>
                  {e.properties.length > 0 && (
                    <Text size="xs" c="dimmed">
                      measured: {e.properties.slice(0, 4).join("; ")}
                      {e.properties.length > 4 ? "; ..." : ""}
                    </Text>
                  )}
                </Box>
              ))}
              {hits.length > showN && (
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => setShowN((n) => n + SHOW_STEP)}
                >
                  show {Math.min(SHOW_STEP, hits.length - showN)} more
                </Button>
              )}
            </Stack>
          </ScrollArea>
          <Text size="xs" c="dimmed">
            The article is the source: read it and cite it — never this
            index. The numerical data files sit in thirdParty/thermoml/ on
            your machine.
          </Text>
        </>
      )}
    </Stack>
  );
}
