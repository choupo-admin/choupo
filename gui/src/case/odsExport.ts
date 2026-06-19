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
  Export a table as an OpenDocument Spreadsheet (.ods) for LibreOffice Calc.

  ODS is ODF -- an open, ZIP-of-XML, glass-box format (no proprietary binary).
  A minimal valid .ods is three entries: an uncompressed `mimetype`, a
  `META-INF/manifest.xml`, and a `content.xml` holding the table.  Numeric cells
  carry office:value-type="float" so Calc can sort, filter and compute on them;
  text cells are office:value-type="string".  Pure download (Blob + anchor) --
  the GUI never writes to disk.  Built with fflate (already a dependency).
\*---------------------------------------------------------------------------*/

import { strToU8, zipSync } from "fflate";

export type OdsValue = string | number | null;

function xmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cellXml(v: OdsValue): string {
  if (typeof v === "number" && Number.isFinite(v)) {
    return `<table:table-cell office:value-type="float" office:value="${v}">`
         + `<text:p>${v}</text:p></table:table-cell>`;
  }
  const t = v === null || v === undefined ? "" : xmlEsc(String(v));
  return `<table:table-cell office:value-type="string"><text:p>${t}</text:p></table:table-cell>`;
}

function rowXml(cells: OdsValue[]): string {
  return `<table:table-row>${cells.map(cellXml).join("")}</table:table-row>`;
}

/** Build a .ods file (header row + data rows) and trigger a download. */
export function downloadOds(
  sheetName: string, headers: string[], rows: OdsValue[][], filename: string,
): void {
  const content =
    `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<office:document-content`
    + ` xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"`
    + ` xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"`
    + ` xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"`
    + ` office:version="1.3">`
    + `<office:body><office:spreadsheet>`
    + `<table:table table:name="${xmlEsc(sheetName)}">`
    + rowXml(headers) + rows.map(rowXml).join("")
    + `</table:table></office:spreadsheet></office:body></office:document-content>`;

  const manifest =
    `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<manifest:manifest`
    + ` xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"`
    + ` manifest:version="1.3">`
    + `<manifest:file-entry manifest:full-path="/"`
    + ` manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>`
    + `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>`
    + `</manifest:manifest>`;

  // mimetype MUST be the first entry and stored uncompressed (ODF spec).
  const zip = zipSync({
    "mimetype": [strToU8("application/vnd.oasis.opendocument.spreadsheet"), { level: 0 }],
    "META-INF/manifest.xml": strToU8(manifest),
    "content.xml": strToU8(content),
  });
  const blob = new Blob([zip.slice()],
    { type: "application/vnd.oasis.opendocument.spreadsheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
