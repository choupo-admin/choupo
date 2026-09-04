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

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
// Our own variable overrides -- MUST come after Mantine's so they win.
import "./theme-overrides.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";

//  A DEPLOY MUST NOT LEAVE A VISITOR STARING AT NOTHING.
//
//  The app entry HTML is served by GitHub Pages with `cache-control:
//  max-age=600` and its chunks carry content hashes in their filenames.  So a
//  visitor who loaded the page BEFORE a deploy and reloads within ten minutes
//  gets the OLD html from their cache, which names chunk hashes the new deploy
//  has replaced -- every one of them 404s and the app renders NOTHING.  No
//  error, no message, a white screen indistinguishable from "it is broken".
//
//  MEASURED on 2026-09-04, minutes after publish-site run 420: a plain fetch
//  of /app/ returned html naming `index-D_ANeivu.js` (404 at both /assets/ and
//  /app/assets/); the same URL with a cache-buster named `index-DLUcAie8.js`
//  (200).  Three deploys landed that day.
//
//  The host cannot be told to stop caching the entry (Pages sets that header
//  and does not take one from the repository), so the fix belongs in the page:
//  Vite raises `vite:preloadError` when a dynamic chunk fails to load, and a
//  stale-html visit raises it on the first lazy import.  ONE reload, guarded by
//  a sessionStorage flag so a genuinely missing chunk cannot become a loop --
//  a reload loop is worse than the blank screen it was meant to fix, because it
//  never settles and never says anything either.
//
//  It is deliberately NOT a general error handler: only this one event, only
//  once per tab.  If the reload does not fix it, the second attempt lets the
//  error through to the ErrorBoundary, which says something.
const RELOAD_FLAG = "choupo:staleChunkReloaded";
window.addEventListener("vite:preloadError", (event) => {
  let already = "1";
  try { already = sessionStorage.getItem(RELOAD_FLAG) ?? ""; } catch { already = "1"; }
  if (already) return;          // second failure: let the boundary report it
  try { sessionStorage.setItem(RELOAD_FLAG, "1"); } catch { return; }
  event.preventDefault();       // do not surface a transient stale-deploy error
  window.location.reload();
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element in index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

//  A SUCCESSFUL LOAD RESTORES THE BUDGET.  Without this the flag set above
//  would stand for the life of the tab, so a SECOND deploy while the tab is
//  open would find the guard spent and show the blank screen it exists to
//  prevent.  Cleared here, the rule becomes "one reload per successful load",
//  which still cannot loop: a reload that fails to mount never reaches this
//  line.
try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* private mode */ }

// Offline support was rolled back (a Chrome rendering glitch we could not verify
// headless).  We do NOT register a service worker.  Any browser that cached the
// old worker is cleaned up by the self-destructing /sw.js (see site/sw.js),
// which the browser fetches as an update to the existing registration.
