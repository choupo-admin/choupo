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

#include "OdsWriter.H"
#include "core/MiniZip.H"

#include <cstdio>

namespace Choupo {

const char* OdsWriter::styleName(Style st)
{
    switch (st)
    {
        case Header:  return "ceHeader";
        case Title:   return "ceTitle";
        case Bold:    return "ceBold";
        case Good:    return "ceGood";
        case Bad:     return "ceBad";
        case Feed:    return "ceFeed";
        case Product: return "ceProduct";
        case Plain:
        default:      return "cePlain";
    }
}

std::string OdsWriter::xmlEscape(const std::string& s)
{
    std::string o;
    o.reserve(s.size());
    for (char c : s)
    {
        switch (c)
        {
            case '&':  o += "&amp;";  break;
            case '<':  o += "&lt;";   break;
            case '>':  o += "&gt;";   break;
            case '"':  o += "&quot;"; break;
            default:   o += c;        break;
        }
    }
    return o;
}

void OdsWriter::beginSheet(const std::string& name)
{
    closeSheet();
    body_ += "<table:table table:name=\"" + xmlEscape(name) + "\">";
    inSheet_ = true;
}

void OdsWriter::closeRow()
{
    if (inRow_) { body_ += "</table:table-row>"; inRow_ = false; }
}

void OdsWriter::closeSheet()
{
    if (inSheet_)
    {
        closeRow();
        body_ += "</table:table>";
        inSheet_ = false;
    }
}

void OdsWriter::newRow()
{
    closeRow();
    body_ += "<table:table-row>";
    inRow_ = true;
}

void OdsWriter::textCell(const std::string& s, Style st)
{
    body_ += "<table:table-cell table:style-name=\"";
    body_ += styleName(st);
    body_ += "\" office:value-type=\"string\"><text:p>";
    body_ += xmlEscape(s);
    body_ += "</text:p></table:table-cell>";
}

void OdsWriter::numberCell(double v, int decimals, Style st)
{
    char raw[64], shown[64];
    std::snprintf(raw,   sizeof raw,   "%.10g", v);
    std::snprintf(shown, sizeof shown, "%.*f", decimals, v);
    body_ += "<table:table-cell table:style-name=\"";
    body_ += styleName(st);
    body_ += "\" office:value-type=\"float\" office:value=\"";
    body_ += raw;
    body_ += "\"><text:p>";
    body_ += shown;
    body_ += "</text:p></table:table-cell>";
}

void OdsWriter::emptyCell(int n)
{
    if (n == 1)
        body_ += "<table:table-cell/>";
    else
        body_ += "<table:table-cell table:number-columns-repeated=\""
               + std::to_string(n) + "\"/>";
}

void OdsWriter::save(const std::string& path) const
{
    // Finish any open structure (const-correct: work on a copy of state).
    std::string body = body_;
    if (inRow_)   body += "</table:table-row>";
    if (inSheet_) body += "</table:table>";

    // ---- content.xml -----------------------------------------------------
    auto cellStyle = [](const char* name, const char* bg,
                        const char* fg, bool bold) -> std::string
    {
        std::string s = "<style:style style:name=\"";
        s += name;
        s += "\" style:family=\"table-cell\">";
        if (bg && *bg)
            s += std::string("<style:table-cell-properties fo:background-color=\"")
               + bg + "\"/>";
        s += "<style:text-properties";
        if (bold) s += " fo:font-weight=\"bold\"";
        if (fg && *fg) s += std::string(" fo:color=\"") + fg + "\"";
        s += "/>";
        s += "</style:style>";
        return s;
    };

    std::string content =
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        "<office:document-content "
        "xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\" "
        "xmlns:table=\"urn:oasis:names:tc:opendocument:xmlns:table:1.0\" "
        "xmlns:text=\"urn:oasis:names:tc:opendocument:xmlns:text:1.0\" "
        "xmlns:style=\"urn:oasis:names:tc:opendocument:xmlns:style:1.0\" "
        "xmlns:fo=\"urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0\" "
        "office:version=\"1.2\">"
        "<office:automatic-styles>";
    content += cellStyle("cePlain",    "",        "",        false);
    content += cellStyle("ceHeader",   "#2f5496", "#ffffff", true);
    content += cellStyle("ceTitle",    "",        "#1f3864", true);
    content += cellStyle("ceBold",     "#d9e1f2", "",        true);
    content += cellStyle("ceGood",     "#c6efce", "#006100", false);
    content += cellStyle("ceBad",      "#ffc7ce", "#9c0006", false);
    content += cellStyle("ceFeed",     "#ddebf7", "",        false);
    content += cellStyle("ceProduct",  "#fff2cc", "",        false);
    content += "</office:automatic-styles>"
               "<office:body><office:spreadsheet>";
    content += body;
    content += "</office:spreadsheet></office:body></office:document-content>";

    // ---- META-INF/manifest.xml ------------------------------------------
    const std::string manifest =
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        "<manifest:manifest "
        "xmlns:manifest=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\" "
        "manifest:version=\"1.2\">"
        "<manifest:file-entry manifest:full-path=\"/\" "
        "manifest:media-type=\"application/vnd.oasis.opendocument.spreadsheet\"/>"
        "<manifest:file-entry manifest:full-path=\"content.xml\" "
        "manifest:media-type=\"text/xml\"/>"
        "</manifest:manifest>";

    // ---- assemble the ODS (mimetype FIRST + stored) ---------------------
    MiniZip zip;
    zip.add("mimetype", "application/vnd.oasis.opendocument.spreadsheet");
    zip.add("content.xml", content);
    zip.add("META-INF/manifest.xml", manifest);
    zip.save(path);
}

} // namespace Choupo
