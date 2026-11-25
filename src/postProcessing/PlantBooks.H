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
    Choupo::PlantBooks (free functions)

Description
    The plant's books (DEV.md 4c C524): the economics pass's yearly rows read as
    an income statement, a balance sheet and a cash-flow statement, tied
    together.  Pure reading of an EconomicsSummary -- it adds no input and moves
    no appraisal number.  The accounts, the six identities and every accounting
    choice are in docs/design/plant-books.md and the Theory Guide section
    `sec:plant-books`.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/ResultRecords.H"

#include <string>

namespace Choupo {

class OdsWriter;

//  Fill e.books from e.cashFlow, e.loanSchedule, e.workingCapital, the land,
//  the salvage and the fixed operating cost.  Needs e.cashFlow non-empty.
void buildPlantBooks(EconomicsSummary& e);

//  The one-line log echo: the worst identity error and where.
std::string plantBooksLogLine(const PlantBooks& b);

//  reports/economics/{incomeStatement,balanceSheet,cashFlowStatement}.csv
void writePlantBooksCsv(const EconomicsSummary& e);

//  Three sheets appended to the .ods the run already writes.
void addPlantBooksSheets(OdsWriter& ods, const EconomicsSummary& e);

//  `kpis.books.*`: assets, liabilities, equity each year; the worst error.
//  A year t is written `y<t>`, a negative one `ym<|t|>`.
std::string plantBooksYearKey(int year);

} // namespace Choupo
