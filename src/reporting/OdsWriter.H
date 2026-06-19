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
-------------------------------------------------------------------------------
Class
    Choupo::OdsWriter

Description
    Builds an OpenDocument Spreadsheet (.ods) with coloured, styled
    cells --- the "tudo formatadinho com cores" report --- using only
    the standard library + the dependency-free MiniZip.  One sheet per
    table; a small fixed palette of named cell styles (header, good,
    bad, feed, product, title, bold).

    Usage:
        OdsWriter ods;
        ods.beginSheet("Stream Table");
        ods.newRow();
        ods.textCell("stream", OdsWriter::Header);
...
        ods.numberCell(100.0, 3, OdsWriter::Good);
        ods.save("report.ods");
\*---------------------------------------------------------------------------*/

#pragma once

#include <string>

namespace Choupo {

class OdsWriter
{
public:
    enum Style {
        Plain = 0,   // default
        Header,      // dark-blue fill, white bold  (column headers)
        Title,       // large bold, no fill         (sheet titles)
        Bold,        // bold, no fill               (totals)
        Good,        // light-green fill            (closure ~100 %)
        Bad,         // light-red fill              (closure off)
        Feed,        // light-cyan fill             (feed streams)
        Product      // light-amber fill            (product streams)
    };

    void beginSheet(const std::string& name);
    void newRow();
    void textCell(const std::string& s, Style st = Plain);
    void numberCell(double v, int decimals, Style st = Plain);
    void emptyCell(int n = 1);

    void save(const std::string& path) const;

private:
    std::string body_;        // accumulated <table:table>... </table:table>
    bool        inSheet_ = false;
    bool        inRow_   = false;

    void closeRow();
    void closeSheet();
    static const char* styleName(Style st);
    static std::string xmlEscape(const std::string& s);
};

} // namespace Choupo
