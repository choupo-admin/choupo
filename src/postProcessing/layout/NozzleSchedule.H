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
    This file is part of Choupo.  GPL-3.0-or-later; see LICENSE and NOTICE.

    SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
Namespace
    Choupo::nozzleSchedule

Description
    THE NOZZLE SCHEDULE OF EVERY EQUIPMENT SHEET (DEV.md 4c C444).  A nozzle is
    where a line ends on an item, so the schedule is read from the layout's
    pipes (which end at which item, at which port) and the line list (C207):

      MARK, SERVICE, STREAM and LINE: N1, N2 ... in the order the item's pipes
        are published; the service is the port word the layout gives the end
        (feed, vapour, liquid, suction, discharge ...) and its direction.
      NOMINAL SIZE: the line's own size where the line is sized; where the item
        publishes a criterion of its own for that port (a separator drum's
        `d_nozzle_<port>`, from the rho v^2 limit and the clearances of C318) the
        nozzle is the LARGER of the two, and a nozzle that differs from its line
        is printed as a REDUCER -- never resolved silently.  The criterion's
        diameter is turned into a nominal size by the case's own table
        (`lineDesign.nominalSizes`): the smallest size whose inside diameter, at
        its lightest declared schedule, is at least the diameter asked.
      FLANGE CLASS: the smallest class whose working pressure (psig), at the
        first temperature row at or above the design temperature, is at least
        the design pressure.  The table is the CASE's (`nozzleDesign.flangeRating
        .tables`), one per construction material, each read from a book at its
        page (the shipped cases read Perry's Handbook 9th ed., Tables 10-42a, c,
        d, p. 10-95 and 10-96, which extract ASME B16.5; Towler and Sinnott
        Table 13.5, p. 1030, agrees on carbon steel); the engine carries none.
        A material with no table is listed NOT RATED, with the reason.
      FACING: the case's default (raised face, Towler section 13.10.3) and the
        class from which a ring joint is taken (a number the case declares).
      DESIGN PRESSURE AND TEMPERATURE: the item's `pressureDesign` (gauge) when
        its sizing publishes one, else the line's design pressure; the
        temperature is the hottest stream connected to the item plus the case's
        declared margin.
      MANWAYS AND INSPECTION OPENINGS: from the case's `nozzleDesign.manway
        { ... }`: a rule per equipment kind (count and where), a clear diameter
        and nominal size for entry, the smallest vessel diameter a person can
        enter (Towler section 11.12, p. 714: stacked plates are used where the
        column is "too small for someone to enter ... say less than 1.2 m"),
        and an inspection opening of a declared size that replaces the manway
        on a vessel smaller than that.

    NOT MODELLED, said on every schedule: nozzle reinforcement (Towler section
    13.6), the minimum metal temperature of a flange, the standard's flange
    dimensions and bolting, a nozzle's elevation and projection, instrument
    and drain connections, and the machine's own flange (a pump's casing).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "result/SimulationResult.H"

namespace Choupo {
namespace nozzleSchedule {

//  Reads `nozzleDesign {}` from the layout dictionary; absent, nothing is done
//  and nothing is published.  Needs `lineDesign {}` (the nominal-size table and
//  the line sheets).  Call AFTER lineSheets::evaluate.  Fills
//  `result.layout.nozzles`.  Throws, naming the key, when a declaration is
//  missing.
void evaluate(const Dictionary& layoutDict, SimulationResult& result,
              int verbosity);

} // namespace nozzleSchedule
} // namespace Choupo
