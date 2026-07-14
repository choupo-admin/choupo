/*  SPDX-License-Identifier: GPL-3.0-or-later
    Part of Choupo -- see the header for the contract.  */

#include "core/ThermoResolution.H"
#include "core/Advisory.H"

#include <iostream>

namespace Choupo
{

bool announceProvenanceConsumption(const std::vector<PairResolution>& entries)
{
    std::string predictive, overridden;
    for (const auto& pr : entries)
    {
        if (pr.origin == Origin::predictive)
            predictive += (predictive.empty() ? "" : ", ") + pr.i + "-" + pr.j;
        if (pr.promotedDespite.has_value())
            overridden += (overridden.empty() ? "" : ", ") + pr.i + "-" + pr.j;
    }
    if (!predictive.empty())
    {
        std::cout << "[provenance] PREDICTIVE pairs in use: " << predictive
                  << "  (model-derived surrogates, not data)\n";
        AdvisoryLog::instance().add("provenance", "warning",
                                    "predictive pairs", predictive);
    }
    if (!overridden.empty())
    {
        std::cout << "[provenance] promotedDespite pairs in use: " << overridden
                  << "  (promoted past a diagnostic -- see the pair files)\n";
        AdvisoryLog::instance().add("provenance", "warning",
                                    "promotedDespite pairs", overridden);
    }
    return !predictive.empty() || !overridden.empty();
}

} // namespace Choupo
