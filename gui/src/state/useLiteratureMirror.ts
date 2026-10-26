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
  useLiteratureMirror -- the ONE probe of the reader's private literature
  mirror (`__thermoml/index.json`, served by the dev server's
  scripts/thermomlIndexPlugin.ts and by nothing on a published site).

  Two readers ask the same question and must get one answer: the menu (the
  Literature entry is SHOWN only when the mirror answers -- an entry with no
  content on the open case is hidden, DEV.md 4c C172 item 5) and the
  Literature workspace itself (which, reached by a deep link with no mirror,
  says so as a status rather than as an empty result).  So the fetch happens
  ONCE per page and both read its outcome.
\*---------------------------------------------------------------------------*/

import { useEffect, useState } from "react";

export interface MirrorCitation {
  file: string;
  title: string;
  authors: string[];
  journal: string;
  year: string;
  doi: string;
  compounds: string[];
  properties: string[];
}

export type MirrorState =
  | { kind: "loading" }
  | { kind: "absent" }
  | { kind: "ready"; entries: MirrorCitation[] };

let probe: Promise<MirrorState> | null = null;

/** The mirror's outcome, fetched once per page (BASE-relative, so a frozen
 *  /vYYMM/app/ copy probes its own prefix and never the site root). */
export function probeLiteratureMirror(): Promise<MirrorState> {
  if (!probe) {
    probe = fetch(`${import.meta.env.BASE_URL}__thermoml/index.json`)
      .then(async (r): Promise<MirrorState> => {
        if (!r.ok) throw new Error(String(r.status));
        const raw = (await r.json()) as { entries?: MirrorCitation[] };
        return { kind: "ready", entries: raw.entries ?? [] };
      })
      .catch((): MirrorState => ({ kind: "absent" }));
  }
  return probe;
}

export function useLiteratureMirror(): MirrorState {
  const [state, setState] = useState<MirrorState>({ kind: "loading" });
  useEffect(() => {
    let dead = false;
    void probeLiteratureMirror().then((s) => { if (!dead) setState(s); });
    return () => { dead = true; };
  }, []);
  return state;
}
