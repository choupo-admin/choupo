/*--- StoichReactor implementation (user-defined unit op). ---*/
#include "StoichReactor.H"
#include <iostream>
namespace Choupo {
int StoichReactor::solve(const DictPtr& dict, const ThermoPackage& thermo, int verbosity)
{
    auto feed = dict->subDict("feed");
    auto comp = dict->subDict("composition");
    auto oper = dict->subDict("operation");
    const scalar F = feed->lookupScalar("F");
    const scalar T = feed->lookupScalar("T");
    const scalar P = feed->lookupScalar("P");
    const std::size_t n = thermo.n();
    sVector z(n, 0.0); scalar zsum = 0.0;
    for (const auto& k : comp->keys()) { std::size_t i = thermo.indexOf(k); z[i] = comp->lookupScalar(k); zsum += z[i]; }
    if (zsum > 0.0) for (auto& v : z) v /= zsum;
    const std::string reactant = oper->lookupWord("reactant");
    const std::string product  = oper->lookupWord("product");
    const scalar      X        = oper->lookupScalar("conversion");
    const std::size_t ir = thermo.indexOf(reactant);
    const std::size_t ip = thermo.indexOf(product);
    sVector m(n); for (std::size_t i=0;i<n;++i) m[i]=F*z[i];
    const scalar conv = X * m[ir];
    m[ir] -= conv; m[ip] += conv;
    scalar Fout=0.0; for (auto v:m) Fout+=v;
    sVector zo(n,0.0); if (Fout>0.0) for (std::size_t i=0;i<n;++i) zo[i]=m[i]/Fout;
    produced_.clear();
    ProcessStream s; s.name="rOut"; s.F=Fout; s.T=T; s.P=P; s.z=zo; s.vf=0.0;
    produced_.push_back(s);
    kpis_["conversion"]=X; kpis_["converted_kmol_s"]=conv;
    if (verbosity>=3) std::cout << "  [stoichReactor] converted " << conv
        << " kmol/s of " << reactant << " -> " << product << " (X=" << X << ")\n";
    return 0;
}
} // namespace Choupo
