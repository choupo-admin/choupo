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
  RULES OF THUMB — and the page deliberately contains none of them.

  Asked for by the owner, 2026-09-01, the same evening he could not find the
  Design Guide in the Help menu.  The two are one problem: `docs/designGuide.tex`
  IS the rules-of-thumb reference — 2400 lines, twenty-six chapters, its own
  title "Process Design Heuristics" — and it was unreachable from the app.

  THE TEMPTING BUILD IS THE WRONG ONE.  Transcribing heuristics into this file
  would give a nicer page and a second home for numbers a student would act
  on, several of which sit beside named safety standards.  Prose copies of
  golden values drifted three times in this tree in one week for far smaller
  stakes.  So this page carries the guide's STRUCTURE and no rule text: every
  row deep-links into the PDF at that chapter's own named destination, and the
  index is DERIVED (bin/curate/design_guide_index.py -> generated/
  designGuideIndex.json, copied beside the PDFs by scripts/copyDocs.mjs).

  What the page adds that the PDF cannot: a filter across every chapter and
  subsection title at once, and the guide's own framing kept in front of the
  reader — a rule is a starting bet, not a verdict, and the point of a
  glass-box simulator is that you can falsify it in an afternoon.

  ZERO PHYSICS IN TYPESCRIPT: nothing is computed here, and nothing is quoted.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useState } from "react";
import { Alert, Anchor, Box, Code, Loader, Stack, Text, TextInput, Title } from "@mantine/core";
import { guideUrl, openGuide } from "../../help/guideLinks.js";

const INK = "var(--mantine-color-dimmed)";

type Row = { title: string; label: string };
type Section = Row & { subsections: readonly Row[] };

export function RulesOfThumbTool(): JSX.Element
{
    const [sections, setSections] = useState<Section[] | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [q, setQ] = useState("");

    useEffect(() => {
        //  The index lives beside the PDFs (public/docs), fetched like
        //  guides.json.  A page may fetch; the Help MENU may not, which is
        //  why that one imports a generated module instead.
        const url = new URL("docs/designGuideIndex.json",
                            new URL(import.meta.env.BASE_URL,
                                    window.location.href)).href;
        fetch(url, { cache: "no-cache" })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((d) => setSections(d.sections as Section[]))
            //  SAY SO.  An empty page would read as "the guide has no
            //  chapters", which is a claim about the guide rather than
            //  about a failed fetch.
            .catch((e) => setFailed(String(e)));
    }, []);

    const shown = useMemo(() => {
        if (!sections) return [];
        const needle = q.trim().toLowerCase();
        if (!needle) return sections;
        return sections
            .map((s) => {
                const hitSelf = s.title.toLowerCase().includes(needle);
                const subs = s.subsections.filter((x) =>
                    x.title.toLowerCase().includes(needle));
                return hitSelf || subs.length > 0
                    ? { ...s, subsections: hitSelf ? s.subsections : subs }
                    : null;
            })
            .filter((s): s is Section => s !== null);
    }, [sections, q]);

    const total = sections
        ? sections.reduce((n, s) => n + 1 + s.subsections.length, 0)
        : 0;

    return (
        //  `minHeight: 0` is the load-bearing half: a flex child refuses to
        //  shrink below its content without it, so the inner scroll never
        //  engages.  Reported by the owner on the COSMO-SAC page, 2026-08-31.
        <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
        <Stack gap={12}>
            <Box>
                <Title order={3}>Rules of thumb</Title>
                <Text size="sm" mt={4}>
                    The whole of{" "}
                    <Anchor size="sm" onClick={() => openGuide(guideUrl("designGuide"))}>
                        Process Design Heuristics
                    </Anchor>{" "}
                    — what to pick when the problem stops being <em>solve this
                    flash</em> and becomes <em>what equipment do I even choose?</em>
                    {"  "}Every line below opens the guide at that chapter.
                </Text>
            </Box>

            <Alert variant="light" color="orange" title="A rule is a starting bet, not a verdict">
                <Text size="sm">
                    “Pick a PFR for a fast, high-conversion liquid reaction” buys
                    you 80 % of the answer for 20 % of the effort.  It is not a
                    substitute for the run — and this simulator is glass-box
                    precisely so you can test the bet: build the case, watch the
                    Newton iterations, read the KPIs, and confirm or refute it.
                    <strong> A heuristic you have personally falsified once is
                    worth ten you memorised.</strong>
                </Text>
                <Text size="sm" mt={6}>
                    Safety-critical decisions — pressure relief, fired equipment,
                    toxic or flammable inventories, area classification, effluent
                    limits — follow the applicable standard and competent review,
                    never a rule of thumb.  The guide names the controlling
                    standard wherever a number could touch safety.
                </Text>
            </Alert>

            {failed !== null && (
                <Alert variant="light" color="red" title="The index did not load">
                    <Text size="sm">
                        <Code>docs/designGuideIndex.json</Code> could not be
                        fetched ({failed}).  This says nothing about the guide,
                        which is still one click away above — it says this page
                        has no index to show.  Run{" "}
                        <Code>bin/curate/design_guide_index.py</Code> and rebuild.
                    </Text>
                </Alert>
            )}

            {sections === null && failed === null && <Loader size="sm" />}

            {sections !== null && (
                <TextInput
                    size="xs"
                    placeholder={`Filter ${total} chapters and sections — try “pinch”, “velocity”, “crystall”`}
                    value={q}
                    onChange={(e) => setQ(e.currentTarget.value)}
                />
            )}

            {sections !== null && shown.length === 0 && (
                <Text size="sm" c={INK}>
                    Nothing matches “{q}”.  The guide covers structure, reactors,
                    separation trains, absorption, extraction, membranes, solids,
                    evaporation, exchangers, pinch, fired heaters, compressors,
                    drivers, hydraulics, valves, refrigeration and vacuum,
                    storage, control, relief, effluent, cost and materials.
                </Text>
            )}

            {shown.map((s) => (
                <Box key={s.label}>
                    <Anchor
                        fw={600}
                        onClick={() => openGuide(guideUrl("designGuide", s.label))}
                    >
                        {s.title}
                    </Anchor>
                    {s.subsections.length > 0 && (
                        <Box pl="md" mt={2}>
                            {s.subsections.map((x) => (
                                <Box key={x.label}>
                                    <Anchor
                                        size="sm"
                                        onClick={() =>
                                            openGuide(guideUrl("designGuide", x.label))}
                                    >
                                        {x.title}
                                    </Anchor>
                                </Box>
                            ))}
                        </Box>
                    )}
                </Box>
            ))}

            {sections !== null && (
                <Text size="xs" c={INK} mt={4}>
                    Index derived from <Code style={{ fontSize: 11 }}>docs/designGuide.tex</Code>{" "}
                    by <Code style={{ fontSize: 11 }}>bin/curate/design_guide_index.py</Code> —
                    titles and links only.  The rules themselves live in the
                    guide and nowhere else, so nothing here can drift from them.
                </Text>
            )}
        </Stack>
        </Box>
    );
}
