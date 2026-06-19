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
  LiveReload -- keeps the open LOCAL case in sync with its dicts on disk.

  When a case lives on disk (tutorialName "local:<dir>") the Assistant (or any
  text editor) edits the dicts there.  The bridge watches the case folder and
  pushes a "changed" event over ws://.../watch?dir=...; this component re-fetches
  the case and swaps the dicts in place, so the canvas / streams / props redraw
  without a manual reload.  Bundled tutorials and clipboard-only cases have no
  disk watch -> this is a no-op for them.  Renders nothing.
\*---------------------------------------------------------------------------*/

import { useEffect } from "react";

import { useStore } from "../state/store.js";
import { readCaseAt } from "../cases/workspace.js";
import { localCaseDir } from "../case/caseName.js";

const PORT = 7682;

export function LiveReload() {
  const tutorialName = useStore((s) => s.tutorialName);
  const refresh = useStore((s) => s.refreshLocalCaseFiles);

  useEffect(() => {
    const dir = localCaseDir(tutorialName);
    if (!dir) return;            // only local cases are watched

    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let pull: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const reload = () => {
      // small settle delay so we read AFTER the agent's multi-file write
      if (pull) clearTimeout(pull);
      pull = setTimeout(() => {
        readCaseAt(dir)
          .then(({ caseFiles }) => { if (!disposed) refresh(caseFiles); })
          .catch(() => { /* transient (mid-write / bridge blip) -- next event recovers */ });
      }, 120);
    };

    const connect = () => {
      if (disposed) return;
      try {
        ws = new WebSocket(`ws://${location.hostname}:${PORT}/watch?dir=${encodeURIComponent(dir)}`);
      } catch { return; }
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(typeof ev.data === "string" ? ev.data : "");
          if (m.type === "changed") reload();
        } catch { /* ignore */ }
      };
      // If the bridge restarts or drops, retry quietly (no nag).
      ws.onclose = () => { if (!disposed) { retry = setTimeout(connect, 3000); } };
      ws.onerror = () => { try { ws?.close(); } catch { /* */ } };
    };

    connect();

    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      if (pull) clearTimeout(pull);
      try { ws?.close(); } catch { /* */ }
    };
  }, [tutorialName, refresh]);

  return null;
}
