/*--- LinearTbEstimate implementation (user-defined property op). ---*/
#include "LinearTbEstimate.H"
#include <iomanip>
#include <iostream>
namespace Choupo {
int LinearTbEstimate::run(const DictPtr& dict, const ThermoPackage& /*thermo*/, int verbosity)
{
    const std::string comp = dict->lookupWordOrDefault("component", "newComponent");
    const scalar base = dict->lookupScalarOrDefault("base", 198.2);
    scalar Tb = base;
    if (dict->found("groups"))
        for (const auto& g : dict->lookupDictList("groups"))
        {
            const scalar incr = g->lookupScalar("incr");
            const int    n    = static_cast<int>(g->lookupScalarOrDefault("count", 1.0));
            Tb += n * incr;
        }
    diag_["Tb_K"] = Tb;
    if (verbosity >= 1)
        std::cout << "\n=====  linearTbEstimate (USER CODE): " << comp << "  =====\n"
                  << "  Tb = base + sum(count x incr) = " << std::fixed
                  << std::setprecision(2) << Tb << " K\n"
                  << "  (a student's own group-contribution method, compiled into choupoProps)\n";
    return 0;
}
} // namespace Choupo
