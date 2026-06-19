/*---------------------------------------------------------------------------*\
  ComponentSplitter implementation (user-defined unit op --- see .H).
\*---------------------------------------------------------------------------*/

#include "ComponentSplitter.H"

#include <iomanip>
#include <iostream>

namespace Choupo {

int ComponentSplitter::solve(const DictPtr& dict,
                             const ThermoPackage& thermo,
                             int verbosity)
{
    // The Flowsheet injects the inlet stream (feed + composition) and the
    // unit's own operation block.
    auto feed = dict->subDict("feed");
    auto comp = dict->subDict("composition");
    auto oper = dict->subDict("operation");

    const scalar F = feed->lookupScalar("F");        // kmol/s (SI)
    const scalar T = feed->lookupScalar("T");
    const scalar P = feed->lookupScalar("P");

    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& k : comp->keys())
    {
        const std::size_t i = thermo.indexOf(k);
        z[i] = comp->lookupScalar(k);
        zsum += z[i];
    }
    if (zsum > 0.0) for (auto& v : z) v /= zsum;

    // Per-component recovery to the overhead (0..1).  Components not listed
    // default to 0 (everything to the bottoms).
    auto rec = oper->subDict("recovery");
    sVector r(n, 0.0);
    for (const auto& k : rec->keys())
        r[thermo.indexOf(k)] = rec->lookupScalar(k);

    // Per-component split: overhead = recovery * feed; bottoms = the rest.
    sVector nIn(n), nOver(n), nBot(n);
    for (std::size_t i = 0; i < n; ++i)
    {
        nIn[i]   = F * z[i];
        nOver[i] = r[i] * nIn[i];
        nBot[i]  = nIn[i] - nOver[i];
    }
    scalar Fover = 0.0, Fbot = 0.0;
    for (auto m : nOver) Fover += m;
    for (auto m : nBot)  Fbot  += m;

    sVector zOver(n, 0.0), zBot(n, 0.0);
    if (Fover > 0.0) for (std::size_t i = 0; i < n; ++i) zOver[i] = nOver[i] / Fover;
    if (Fbot  > 0.0) for (std::size_t i = 0; i < n; ++i) zBot[i]  = nBot[i]  / Fbot;

    // Two outlet streams, in the order the flowsheetDict's `outputs` lists.
    produced_.clear();
    ProcessStream ov; ov.name = "overhead"; ov.F = Fover; ov.T = T; ov.P = P; ov.z = zOver; ov.vf = 0.0;
    ProcessStream bt; bt.name = "bottoms";  bt.F = Fbot;  bt.T = T; bt.P = P; bt.z = zBot;  bt.vf = 0.0;
    produced_.push_back(ov);
    produced_.push_back(bt);

    kpis_["F_overhead_kmol_h"] = Fover * 3600.0;
    kpis_["F_bottoms_kmol_h"]  = Fbot  * 3600.0;
    kpis_["overhead_fraction"] = (F > 0.0) ? Fover / F : 0.0;

    if (verbosity >= 2)
        std::cout << "ComponentSplitter (user op):  overhead "
                  << std::fixed << std::setprecision(4) << (Fover * 3600.0)
                  << " kmol/h,  bottoms " << (Fbot * 3600.0) << " kmol/h\n\n";
    return 0;
}

} // namespace Choupo
