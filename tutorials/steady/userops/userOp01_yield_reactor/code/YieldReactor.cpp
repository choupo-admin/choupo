/*---------------------------------------------------------------------------*\
  YieldReactor implementation (user-defined unit op --- see YieldReactor.H).
\*---------------------------------------------------------------------------*/

#include "YieldReactor.H"

#include <iomanip>
#include <iostream>

namespace Choupo {

int YieldReactor::solve(const DictPtr& dict,
                        const ThermoPackage& thermo,
                        int verbosity)
{
    // The Flowsheet injects the inlet stream as `feed { F; T; P; }` +
    // `composition { ... }`, and the unit's own `operation { ... }`.
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

    const std::string reactant = oper->lookupWord("reactant");
    const std::string product  = oper->lookupWord("product");
    const scalar      X        = oper->lookupScalar("conversion");
    const std::size_t ir = thermo.indexOf(reactant);
    const std::size_t ip = thermo.indexOf(product);

    // Mole balance: convert X of the reactant; produce the product 1:1.
    sVector molesIn(n);
    for (std::size_t i = 0; i < n; ++i) molesIn[i] = F * z[i];
    const scalar converted = X * molesIn[ir];

    sVector molesOut = molesIn;
    molesOut[ir] -= converted;
    molesOut[ip] += converted;

    scalar Fout = 0.0;
    for (auto m : molesOut) Fout += m;
    sVector zout(n, 0.0);
    if (Fout > 0.0) for (std::size_t i = 0; i < n; ++i) zout[i] = molesOut[i] / Fout;

    produced_.clear();
    ProcessStream s;
    s.name = "out";
    s.F = Fout; s.T = T; s.P = P; s.z = zout; s.vf = 0.0;
    produced_.push_back(s);

    kpis_["X"]                 = X;
    kpis_["F_in_kmol_h"]       = F * 3600.0;
    kpis_["F_out_kmol_h"]      = Fout * 3600.0;
    kpis_["converted_kmol_h"]  = converted * 3600.0;
    kpis_["T"]                 = T;

    if (verbosity >= 2)
        std::cout << "YieldReactor (user op):  " << reactant << " -> " << product
                  << "   X = " << std::fixed << std::setprecision(3) << X
                  << "   converted = " << std::setprecision(4) << (converted * 3600.0)
                  << " kmol/h\n\n";
    return 0;
}

} // namespace Choupo
