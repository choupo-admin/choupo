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
  File pop-out: open a case dict file in a SEPARATE browser tab, so the
  student can read flowsheetDict / thermoPackage etc. side-by-side with
  the flowsheet (instead of in an interruptive modal).  Same Blob+anchor
  technique as the streams pop-out — bypasses Firefox's popup blocker.
\*---------------------------------------------------------------------------*/

// ---- pop-out colour scheme -------------------------------------------------
// A pop-out is a FRESH document with no Mantine, so it cannot inherit the app's
// theme.  We resolve the MAIN window's active colour scheme here and emit a
// matching palette so a pop-out is light when the app is light, dark when dark.

export interface PopoutColors {
  bg: string; panel: string; cell: string; unitTint: string; border: string;
  text: string; textStrong: string; dim: string; accent: string;
  blue: string; orange: string; red: string; liquidTint: string; vapourTint: string;
}
const POPOUT_DARK: PopoutColors = {
  bg: "#1a1b1e", panel: "#25262b", cell: "#2c2e33", unitTint: "#2c3a42", border: "#373a40",
  text: "#c1c2c5", textStrong: "#d0d1d3", dim: "#909296", accent: "#4dd0c0",
  blue: "#74c0fc", orange: "#ffa94d", red: "#ff8a80", liquidTint: "#1a4859", vapourTint: "#5c3826",
};
const POPOUT_LIGHT: PopoutColors = {
  bg: "#ffffff", panel: "#f1f3f5", cell: "#e9ecef", unitTint: "#e7f5f8", border: "#dee2e6",
  text: "#343a40", textStrong: "#212529", dim: "#495057", accent: "#0c8599",
  blue: "#1971c2", orange: "#e8590c", red: "#e03131", liquidTint: "#e3fafc", vapourTint: "#fff4e6",
};
export function popoutColors(): PopoutColors {
  const attr = typeof document !== "undefined"
    ? document.documentElement.getAttribute("data-mantine-color-scheme") : null;
  const dark = attr === "dark"
    || ((attr === null || attr === "auto")
        && typeof window !== "undefined"
        && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  return dark ? POPOUT_DARK : POPOUT_LIGHT;
}

export function popOutFileHtml(rel: string, raw: string): void {
  const C = popoutColors();
  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<title>Choupo — ${escAttr(rel)}</title>
<style>
  body { margin: 0; background: ${C.bg}; color: ${C.text};
         font-family: system-ui, sans-serif; }
  h2 { margin: 16px 24px 4px; font-size: 16px; font-weight: 500;
       color: ${C.accent}; font-family: 'JetBrains Mono', monospace; }
  p.hint { margin: 0 24px 16px; font-size: 12px; color: ${C.dim}; }
  pre { margin: 0 24px 24px; padding: 16px 20px;
        background: ${C.panel}; color: ${C.textStrong}; border-radius: 4px;
        font: 13px/1.5 'JetBrains Mono', Consolas, monospace;
        white-space: pre; overflow: auto; }
</style>
</head><body>
<h2>${escText(rel)}</h2>
<p class="hint">Read-only.  Edit this file in your text editor and reload the
case in the Choupo tab.</p>
<pre>${escText(raw)}</pre>
</body></html>`;
  openHtmlInNewTab(html);
}

/** Open an HTML string in a new browser tab via Blob URL + programmatic
 *  anchor click.  Reliable across Firefox / Chrome / Safari — none of
 *  them treat this as a "popup". */
export function openHtmlInNewTab(html: string): void {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Generous timeout: a cold Firefox tab can take a few seconds to
  // load the blob.  Revoking too soon shows a blank page.  30 s is
  // safely past the slowest load we have observed.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function escText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}
function escAttr(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
