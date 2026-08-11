/*---------------------------------------------------------------------------*\
  ComponentTab — the Component Inspector full-window, in its own browser tab
  (?component=<name>).

  ADDRESSABLE, NOT STASHED, and that is the whole design (Vítor, 2026-08-11).
  exploreMccabePopOut and unitFocus stash a payload under a localStorage key
  because a computed curve or a synthesised mini-flowsheet cannot be re-derived
  without the engine; both therefore carry an ExpiredTabPanel for the day the
  stash is gone.  A component record needs none of it: it is resolvable BY NAME
  from the same catalogue the browser lists.  So this tab boots from the name in
  the URL and re-derives, which makes it

      bookmarkable    the tab survives F5 and a cold browser
      shareable       "?component=acetophenone" is a link, not a session
      linkable        the Property Guide can point AT a substance
      unexpirable     there is no stash to lose

  It exists so the inline panel never has to win an argument it cannot win:
  when ThermoML datasets, residual plots and curation dossiers outgrow a 460px
  rail, "open full" is one click away and the information hierarchy does not
  change -- it is the SAME ComponentInspector, mounted wider.

  A name that resolves to no readable record REFUSES here exactly as it does in
  the panel: a URL a student mistyped must say so, not render an empty shell
  that reads as "this substance declares nothing".
\*---------------------------------------------------------------------------*/

import { Box, Button, Code, Stack, Text } from "@mantine/core";
import { useMemo } from "react";

import { rawRecordFor } from "../../case/catalogue.js";
import { readComponentRecord } from "../../case/componentRecord.js";
import { ComponentInspector } from "./ComponentInspector.js";

/** The component name carried by the tab's URL, or "" when absent. */
export function componentTabName(search: string): string {
  return new URLSearchParams(search).get("component")?.trim() ?? "";
}

export function ComponentTab() {
  const name = useMemo(
    () => (typeof window === "undefined" ? "" : componentTabName(window.location.search)),
    [],
  );
  const record = useMemo(() => {
    const raw = name ? rawRecordFor(name) : null;
    return raw ? readComponentRecord(raw) : null;
  }, [name]);

  if (!record) {
    return (
      <Box style={{ padding: 24, maxWidth: 640 }}>
        <Stack gap="xs">
          <Text fw={700} size="lg">Component not found</Text>
          <Text size="sm" c="dimmed">
            {name
              ? <>No component named <Code>{name}</Code> is in the shared catalogue
                  (<Code>data/standards/</Code> or your <Code>data/local/</Code>).
                  Names resolve EXACTLY — the engine looks for <Code>{name}.dat</Code>,
                  and neither CAS numbers nor aliases are resolved here.</>
              : <>This tab needs a component name: <Code>?component=&lt;name&gt;</Code>.</>}
          </Text>
          <Text size="xs" c="dimmed">
            A case-local component is not reachable from a standalone tab: it
            lives in a case, so inspect it from the Explore workspace with that
            case open.
          </Text>
          <Button size="compact-xs" variant="light" color="accent" w="fit-content"
            onClick={() => { window.location.search = "?workspace=explore"; }}>
            open the Property Explorer
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box style={{ position: "absolute", inset: 0, padding: 24, overflow: "hidden",
      maxWidth: 900 }}>
      <ComponentInspector record={record} />
    </Box>
  );
}
