/*---------------------------------------------------------------------------*\
  ElectrolytePackageActivity -- see ElectrolytePackageActivity.H.
  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "propertyOps/ElectrolytePackageActivity.H"

#include "thermo/ThermoPackage.H"
#include "thermo/electrolyte/ElectrolyteModel.H"

#include <algorithm>
#include <fstream>
#include <iomanip>
#include <stdexcept>

namespace Choupo {

int ElectrolytePackageActivity::run(const DictPtr& dict,
                                    const ThermoPackage& thermo, int /*verbosity*/)
{
    diag_.clear();

    if (!thermo.hasElectrolyte())
        throw std::runtime_error("electrolyteActivity: the property package assembled "
            "no electrolyte model -- select an electrolyte propertyMethod (e.g. pitzer).");
    const ElectrolyteModel& e = thermo.electrolyte();

    // Isothermal; the model is T-dependent and defaults to 25 C.
    const scalar T = dict->lookupScalarOrDefault("temperature", 298.15);

    // -- molality grid --------------------------------------------------------
    scalar mFrom = 0.1, mTo = 6.0;
    std::size_t n = 30;
    if (dict->found("molality"))
    {
        auto md = dict->subDict("molality");
        mFrom = md->lookupScalarOrDefault("from", mFrom);
        mTo   = md->lookupScalarOrDefault("to",   mTo);
        if (md->found("n"))
            n = std::max<std::size_t>(2, static_cast<std::size_t>(md->lookupScalar("n")));
    }

    // -- output ---------------------------------------------------------------
    std::ofstream csv(dict->subDict("output")->lookupWord("file"));
    if (!csv.is_open())
        throw std::runtime_error("electrolyteActivity: cannot open output file");
    csv << "m,gamma_pm,phi,a_w\n";
    csv << std::scientific << std::setprecision(8);
    const scalar dm = (n > 1) ? (mTo - mFrom) / static_cast<scalar>(n - 1) : 0.0;
    for (std::size_t k = 0; k < n; ++k)
    {
        const scalar m = mFrom + dm * static_cast<scalar>(k);
        csv << m << "," << e.gammaPM(m, T) << "," << e.osmotic(m, T)
            << "," << e.waterActivity(m, T) << "\n";
    }

    // -- diagnostics (same KPIs as pitzerActivity) ----------------------------
    diag_["gamma_pm_1m"] = e.gammaPM(1.0, T);
    diag_["gamma_pm_3m"] = e.gammaPM(3.0, T);
    diag_["phi_1m"]      = e.osmotic(1.0, T);
    diag_["aw_1m"]       = e.waterActivity(1.0, T);
    return 0;
}

} // namespace Choupo
