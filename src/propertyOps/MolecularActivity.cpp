/*---------------------------------------------------------------------------*\
  MolecularActivity -- see MolecularActivity.H.
  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "propertyOps/MolecularActivity.H"

#include "thermo/ThermoPackage.H"

#include <fstream>
#include <iomanip>
#include <stdexcept>

namespace Choupo {

int MolecularActivity::run(const DictPtr& dict, const ThermoPackage& thermo, int /*verbosity*/)
{
    diag_.clear();

    const scalar T = dict->lookupScalarOrDefault("temperature", 298.15);

    const std::size_t n = thermo.n();
    if (!dict->found("composition"))
        throw std::runtime_error("activityCoefficients: a `composition { <comp> <x>; ... }`"
            " block is required.");
    auto cd = dict->subDict("composition");

    sVector x(n, 0.0);
    scalar sum = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        x[i] = cd->lookupScalarOrDefault(thermo.comp(i).name(), 0.0);
        sum += x[i];
    }
    if (sum <= 0.0)
        throw std::runtime_error("activityCoefficients: composition sums to zero.");
    for (auto& xi : x) xi /= sum;

    const sVector g = thermo.activity().gamma(T, x);

    if (dict->found("output"))
    {
        std::ofstream csv(dict->subDict("output")->lookupWord("file"));
        if (csv.is_open())
        {
            csv << "component,x,gamma\n";
            csv << std::setprecision(8);
            for (std::size_t i = 0; i < n; ++i)
                csv << thermo.comp(i).name() << "," << x[i] << "," << g[i] << "\n";
        }
    }

    for (std::size_t i = 0; i < n; ++i)
        diag_["gamma_" + thermo.comp(i).name()] = g[i];
    return 0;
}

} // namespace Choupo
