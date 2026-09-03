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
  CompoundCatalogue -- the Compounds tab: choose substances, read what the
  record says about each, and hand the set to the Property Explorer.

  WHY IT IS ITS OWN TAB (Vítor, 2026-09-03: "a landing page deve permitir
  escolher os compostos ... um botão que abre outro tab onde se faz a
  exploração das propriedades ... o painel direito mostra a info de cada
  componente selecionado").

  THIS IS THE EXPLORER'S LANDING (`?workspace=explore`), which is the screen
  the owner pointed at when he named it: "eu chamo isto a landing do explorer".
  The property surfaces moved to `?workspace=properties`.

  The Explore workspace was doing two jobs on one surface.  Its NO-REBLOAT
  invariant (gui-credo §3) says "the plot is the ONE primary surface", which is
  why the catalogue had to live in a foldable 28-px-collapsible rail -- and a
  rail is the wrong shape for several hundred substances arranged in a family
  tree.  Splitting them is `one tab, one thing` (Vítor 2026-08-17) applied to
  the panel instead of the menu row: the same argument that gave the case tab a
  menu of its own.

  THE CATALOGUE IS A DOOR, NOT A GATE.  This is the one amendment to the ask,
  and it is structural rather than a promise: the Explore tab keeps its own
  compound rail and its own address, is listed beside this one on the hub, and
  the button below is enabled with an EMPTY set (it then opens Explore empty).
  A pair of tabs where the second is reachable only through the first is the
  "setup wizard / first-step dialog" the credo §5 forbids by name, and the way
  to not build one is to leave both doors open rather than to promise restraint.

  WHAT THE HAND-OVER CARRIES.  A link, and nothing else -- no shared store, no
  localStorage (`explore/selectionLink.ts` is the one home for the format).  A
  tab whose answer depends on state its address does not name is the coupling
  the EduTools were freed from; here it would also cost the thing that makes
  this useful in a class, which is that the resulting exploration is a URL a
  professor can paste.

  THE RIGHT PANEL IS THE SAME ComponentInspector the Explore rail pops open --
  the identity, the dossier verdict, the warnings.  It is mounted WIDER, not
  rewritten: the information hierarchy a student learns in one place is the one
  they meet in the other (the ComponentTab precedent, 2026-08-11).
\*---------------------------------------------------------------------------*/

import { Badge, Box, Button, Group, Stack, Text } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";

import { useNarrowViewport } from "./methods/methodsChrome.js";

import { rawRecordFor } from "../case/catalogue.js";
import { readComponentRecord } from "../case/componentRecord.js";
import { ComponentInspector } from "./explore/ComponentInspector.js";
import { CompoundBrowser } from "./explore/CompoundBrowser.js";
import { EstimateForm } from "./explore/EstimateForm.js";
import { propertiesLink } from "./explore/selectionLink.js";
import { openAppTab } from "./openInTab.js";
import {
  CATALOGUE_BROWSER_PANEL, PanelResizeHandle, usePanel,
} from "./panelContract.js";

/*  ON A PHONE THE TWO COLUMNS BECOME TWO ROWS, and this is not a nicety.
 *  Measured at 390x844 with the chunk warm: a fixed 420-px column beside a
 *  flexible one leaves the right column no room at all -- 103 elements ended
 *  up outside the viewport, the hand-over button among them, its left edge
 *  215 px past the screen.  `scrollWidth` still read 390, because the
 *  container clips rather than scrolls, so the content was not merely awkward
 *  to reach: it was UNREACHABLE, and a horizontal-overflow check of the kind
 *  that passed the landing this morning would have called the page clean.
 *
 *  The posture question has ONE home (`methods/methodsChrome.useNarrowViewport`),
 *  which reads the pointer as well as the width; a second breakpoint spelled
 *  here would be the arity sin in CSS. */

/** Width of the catalogue column on a desk.  Generous on purpose: this tab exists
 *  because a family tree of several hundred substances does not fit a rail --
 *  the Explore rail it came from maxes out at 460 and defaults to 240
 *  (state/prefs.ts PANELS.exploreRail), so the split alone is most of the room
 *  the owner asked for.
 *
 *  DELIBERATELY NOT RESIZABLE YET.  `panelContract` would give it a drag
 *  handle in three lines, but the same contract also gives a FOLD, and folding
 *  away the one thing a tab exists to show is a trap rather than a feature.
 *  Resize without fold is a change to the contract, not a call site, and it is
 *  not this slice's. */
export function CompoundCatalogue() {
  const narrow = useNarrowViewport();
  //  THE WIDTH IS THE READER'S, through the ONE contract (2026-09-03, Vítor:
  //  "o painel da esquerda não dá para mudar a largura").  It was a fixed 420
  //  px because adopting the contract seemed to bring a FOLD with it, and
  //  folding away this tab's own subject is a trap -- but the fold is opt-in:
  //  `CATALOGUE_BROWSER_PANEL` declares `contentMin: 0` and no shortcut, so
  //  nothing folds it, while the drag, the arrow keys, the double-click reset
  //  and the remembered width all come from `panelContract`.  Writing a second
  //  resizer here would have been the arity sin in pixels.
  const browser = usePanel(CATALOGUE_BROWSER_PANEL);
  const [selected, setSelected] = useState<string[]>([]);
  //  The compound whose record the right panel shows.  It is the last one
  //  TOUCHED, not "the first selected": a student walking a family reads them
  //  one after another, and the panel must follow the reading, not the order
  //  of a list.  Removing a compound from the set does not blank the panel --
  //  membership and information are different questions.
  const [focus, setFocus] = useState<string | null>(null);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [estimatePrefill, setEstimatePrefill] = useState("");

  const add = useCallback((name: string) => {
    setSelected((s) => (s.includes(name) ? s : [...s, name]));
    setFocus(name);
  }, []);
  const remove = useCallback((name: string) => {
    setSelected((s) => s.filter((n) => n !== name));
  }, []);
  const openEstimate = useCallback((name: string) => {
    setEstimatePrefill(name); setEstimateOpen(true);
  }, []);

  const record = useMemo(() => {
    const raw = focus ? rawRecordFor(focus) : null;
    return raw ? readComponentRecord(raw) : null;
  }, [focus]);

  return (
    <Box style={{ position: "absolute", inset: 0, display: "flex", minHeight: 0,
      flexDirection: narrow ? "column" : "row" }}>
      <EstimateForm opened={estimateOpen} onClose={() => setEstimateOpen(false)}
        prefillName={estimatePrefill} />

      {/* LEFT — the catalogue, with the room this tab was made for. */}
      <Box style={narrow
        ? { flex: "0 0 45%", minHeight: 0, width: "100%", padding: 10,
            borderBottom: "1px solid var(--mantine-color-default-border)" }
        : { width: browser.size, flex: `0 0 ${browser.size}px`, minWidth: 0,
            height: "100%", padding: 10, display: "flex",
            flexDirection: "column", gap: 8,
            borderRight: "1px solid var(--mantine-color-default-border)" }}>
        <Box style={{ flex: 1, minHeight: 0 }}>
          <CompoundBrowser
            selected={selected} onAdd={add} onRemove={remove}
            caseComponents={[]} onEstimate={openEstimate} onInspect={setFocus} />
        </Box>
        {/*  THE ACTION SITS WITH THE SET IT CONSUMES (2026-09-03, Vítor:
             "depois de escolher o set de compostos devia de abrir um tab
             dedicado, para não complicar").  It DID open a dedicated browser
             tab already -- the defect was where the button lived: on the
             right-hand header, whose subject is the ONE focused compound,
             while the set is chosen on the left.  A reader who has just
             built a set looks at the set, and the button that acts on it
             must be there.  Still enabled with an empty set: a disabled
             button would teach "choose first", which is the wizard this pair
             of tabs exists not to be. */}
        <Button size="compact-sm" color="accent" variant="light"
          fullWidth
          leftSection={<IconExternalLink size={14} />}
          onClick={() => openAppTab(propertiesLink(selected))}>
          {selected.length === 0
            ? "Explore properties"
            : `Explore properties of ${selected.length} compound${selected.length === 1 ? "" : "s"}`}
        </Button>
      </Box>
      {!narrow && <PanelResizeHandle panel={browser} />}

      {/* RIGHT — the set, the hand-over, and the record of the focused one. */}
      <Box style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex",
        flexDirection: "column", height: narrow ? undefined : "100%" }}>
        {/*  MEMBERSHIP HAS ONE HOME, AND IT IS THE BROWSER'S OWN `SET` FOOTER
             on the left.  This header first carried a second chip row, and one
             screenshot was enough: the same set drawn twice on one screen, which
             is the arity sin with pixels.  What this row says instead is what
             the panel below is SHOWING -- a different question, and the one a
             reader of the right-hand panel actually has.  */}
        <Group justify="space-between" align="center" wrap="nowrap" gap={8}
          style={{ padding: "10px 14px",
            borderBottom: "1px solid var(--mantine-color-default-border)" }}>
          <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
            {focus
              ? <>
                  <Text size="xs" c="dimmed" style={{ flex: "0 0 auto" }}>reading</Text>
                  <Badge variant="light" color="accent" size="sm"
                    style={{ textTransform: "none" }}>{focus}</Badge>
                  <Text size="xs" c="dimmed" truncate>
                    {selected.includes(focus)
                      ? `· in the set (${selected.length})`
                      : "· not in the set — click it in the catalogue to add it"}
                  </Text>
                </>
              : <Text size="xs" c="dimmed">
                  Click a compound to add it to the set · double click to read its
                  record without changing anything
                </Text>}
          </Group>
        </Group>

        <Box style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
          {record
            ? <ComponentInspector record={record} />
            : <Stack gap={6} maw={560}>
                <Text fw={600}>The compound catalogue</Text>
                <Text size="sm" c="dimmed">
                  Every substance the shared catalogue carries, grouped by the
                  family its own record declares — the UNIFAC groups it decomposes
                  into where it has them, its elemental formula otherwise — after
                  the two classes a substance is named by its STATE: the gases at
                  25 °C and the salts &amp; minerals.  Pick one to read what the
                  record says: identity, how each value was produced, the curation
                  dossier's verdict, and the warnings that come with it.
                </Text>
                <Text size="sm" c="dimmed">
                  Compounds you click gather in the <b>SET</b> at the foot of the catalogue.  <b>Explore properties</b> opens
                  them in the Property Explorer, in its own tab — and that tab opens
                  on its own too, with or without a selection.
                </Text>
              </Stack>}
        </Box>
      </Box>
    </Box>
  );
}
