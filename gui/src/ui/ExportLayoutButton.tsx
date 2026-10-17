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
  ExportLayoutButton -- "Export as page" on the 3D plant layout (DEV.md 4c
  C81).  Drawn beside the layout in Reports, in the `?layout=` tab and on the
  EduTool bench; it saves ONE self-contained HTML file of the run on screen
  (case/layoutExport.ts builds it, pure and tested).

  Whether it shows and whether it works is `layoutExportState`: only where a
  layout is drawn, and disabled -- saying why -- while the drawn run is
  stale.  The compiled viewer (three.js + Choupo's drawing, ~0.5 MB) is a
  lazy chunk loaded at the click, so nobody who never exports downloads it.
  The version in the footer is the one the top bar's badge reads
  (case/engineVersion.ts).

  The save is the gui-credo's Blob pattern with a `download` name: a Blob,
  an object URL, a programmatic anchor click, the URL revoked after 30 s.
\*---------------------------------------------------------------------------*/

import { useState } from "react";
import { Button, Text, Tooltip } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";

import type { PlantLayout } from "../adapters/SolverAdapter.js";
import { fetchEngineVersion } from "../case/engineVersion.js";
import { buildLayoutExport, layoutExportState } from "../case/layoutExport.js";
import type { LayoutPopOutStash } from "../case/layoutPopOut.js";
import type { Staleness } from "../case/staleness.js";

function saveHtml(html: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Build and save the page for a stash (what the pop-out would draw). */
export async function exportLayoutPage(stash: LayoutPopOutStash): Promise<string> {
  const [viewer, version] = await Promise.all([
    import("virtual:layout-viewer"),
    fetchEngineVersion(import.meta.env.BASE_URL),
  ]);
  const { fileName, html } = buildLayoutExport({
    source: stash.source, caseName: stash.caseName, layout: stash.layout, ran: stash.ran,
    version, date: new Date().toISOString(),
    viewer: { script: viewer.script, threeVersion: viewer.threeVersion,
              threeLicence: viewer.threeLicence },
  });
  saveHtml(html, fileName);
  return fileName;
}

/** `layout` decides whether the button shows; `stale` whether it works;
 *  `getStash` is asked at the click, so the file is the run on screen THEN. */
export function ExportLayoutButton({ layout, stale, getStash }: {
  layout: PlantLayout | null | undefined;
  stale: Staleness;
  getStash: () => LayoutPopOutStash | null;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const state = layoutExportState(layout, stale);
  if (!state.show) return null;
  const onClick = async () => {
    const stash = getStash();
    if (!stash) return;
    setBusy(true);
    setErr(null);
    try {
      await exportLayoutPage(stash);
    } catch (e) {
      setErr(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  const button = (
    <Button size="compact-xs" variant="default" style={{ flex: "0 0 auto" }}
      leftSection={<IconDownload size={13} />} loading={busy}
      disabled={!state.enabled}
      title={state.enabled
        ? "Save this layout as ONE self-contained HTML page (opens offline in any browser)"
        : undefined}
      onClick={() => { void onClick(); }}>
      Export as page
    </Button>
  );
  return (
    <>
      {state.enabled ? button : (
        <Tooltip withArrow multiline w={300} label={state.reason}>
          <span style={{ display: "inline-block" }}>{button}</span>
        </Tooltip>
      )}
      {err && <Text size="xs" c="red">{err}</Text>}
    </>
  );
}
