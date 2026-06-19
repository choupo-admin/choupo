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
Description
    The "validation weapon": quantify how well a MODEL curve matches MEASURED
    data by an average absolute deviation (AAD), per (model, property).  This is
    the glass-box answer to "see, then decide" --- the visual overlay shows the
    fit; the AAD puts a defensible NUMBER on it.

    Founding rule: a WRONG AAD is worse than no AAD.  So every record carries
    what it compared, over how many points, and any out-of-range / non-finite /
    near-zero exclusions; a number is emitted ONLY when status == "ok"
    (otherwise the caller prints JSON null + the status reason).

    Honest design choices:
      * MEASURED points are ground truth -- the MODEL curve is interpolated onto
        each measured abscissa (never the reverse).  Never extrapolate: measured
        points outside the model's scanned range are EXCLUDED and counted.
      * The dependent column is classified by its DECLARED SI UNIT (not a name
        guess): a temperature (affine source unit -> "K") uses an absolute-K
        metric; a dimensionless fraction ("-") an absolute metric; any other
        dimensional column a relative-% metric (with an absolute companion and a
        near-zero guard).  This is why this pass runs ONLY on the self-describing
        `columns` dataset format, where each column's unit is declared and the
        echoed values are canonical SI --- the legacy 2-column format is NOT SI
        by construction and is refused (status "unsupportedDatasetFormat").
\*---------------------------------------------------------------------------*/

#pragma once

#include <string>
#include <vector>

namespace Choupo {

struct AadRecord
{
    std::string model;
    std::string property;          // dependent column name; "" if model wholesale-skipped
    std::string kind;              // temperature | fraction | relative | ""
    std::string unit;              // SI unit label of aadAbs ("K", "-", "Pa", "SI")
    bool        hasAbs = false;
    double      aadAbs = 0.0;       // primary for temperature/fraction; companion for relative
    bool        hasRel = false;
    double      aadRelPct = 0.0;    // primary for relative kind
    int         nMeas = 0;
    int         nUsed = 0;          // points entering the PRIMARY mean
    int         nOutOfRange = 0;
    int         nNearZeroSkipped = 0;
    int         nNonFinite = 0;
    std::string status;            // ok | partialCoverage | tooFewPoints | noOverlap |
                                   // abscissaMismatch | modelCsvMissing | noModelOp |
                                   // noModelColumn | suspectedUnitMismatch
    std::string note;              // human-readable detail (mismatch names, range, ...)
};

// Compute AAD records for one experimental entry.
//   expCsvPath     : the echoed exp_<name>.csv (canonical SI, columns format)
//   expColSiUnits  : SI unit label per exp column, parallel to the CSV header
//                    ("K" / "-" / "Pa" / "SI"); column 0 is the abscissa
//   modelCsvPaths  : one CSV path per model (parallel to modelNames); ""/missing
//                    -> that model gets a single status=noModelOp/modelCsvMissing record
//   modelNames     : model (op) names, for labelling
std::vector<AadRecord> computeAad(const std::string& expCsvPath,
                                  const std::vector<std::string>& expColSiUnits,
                                  const std::vector<std::string>& modelCsvPaths,
                                  const std::vector<std::string>& modelNames);

} // namespace Choupo
