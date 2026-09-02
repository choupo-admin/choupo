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
  USAGE COUNTING -- counts, never content.

  The site promise (bin/buildSite, publish-site.yml) is that no server ever
  solves a flash, there is no per-user state, and a case a visitor opens
  never leaves their machine.  A usage counter must keep that promise, so
  this file can emit exactly ONE kind of signal: a named, content-free event
  ("a case was run").  No case text, no component names, no KPIs, no
  identifiers of any kind travel with it; the collector (GoatCounter,
  injected by bin/buildSite only when site/analytics.conf names a site) is
  cookieless and its statistics are public.

  When no collector is injected -- every local dev server, every fork that
  did not configure one -- `window.goatcounter` is undefined and these
  functions do nothing.  Counting must never break a run, so the call is
  guarded and swallows every error.
\*---------------------------------------------------------------------------*/

type Counter = { count: (o: { path: string; event: boolean }) => void };

function collector(): Counter | undefined {
  return (window as unknown as { goatcounter?: Counter }).goatcounter;
}

/** One case was dispatched to a WASM binary.  Which case, which binary and
 *  what it contained are deliberately NOT sent. */
export function countRunCase(): void {
  try {
    collector()?.count({ path: "event/run-case", event: true });
  } catch {
    /* counting must never break a run */
  }
}
