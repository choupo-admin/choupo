/*--- SharpSplitColumn implementation (user-defined distillation op). ---*/
#include "SharpSplitColumn.H"
#include <algorithm>
#include <iostream>
namespace Choupo {
int SharpSplitColumn::solve(const DictPtr& dict, const ThermoPackage& thermo, int verbosity)
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
    const scalar rec = oper->lookupScalar("recovery");
    std::vector<std::string> tops = oper->lookupWordList("topComponents");
    auto isTop = [&](std::size_t i){
        for (const auto& t : tops) if (thermo.indexOf(t) == i) return true;
        return false; };
    sVector mt(n,0.0), mb(n,0.0);
    for (std::size_t i=0;i<n;++i){
        scalar mi = F*z[i];
        if (isTop(i)) { mt[i]=rec*mi; mb[i]=(1.0-rec)*mi; }
        else          { mb[i]=mi; }
    }
    scalar Ft=0.0, Fb=0.0; for (std::size_t i=0;i<n;++i){ Ft+=mt[i]; Fb+=mb[i]; }
    sVector zt(n,0.0), zb(n,0.0);
    if (Ft>0.0) for (std::size_t i=0;i<n;++i) zt[i]=mt[i]/Ft;
    if (Fb>0.0) for (std::size_t i=0;i<n;++i) zb[i]=mb[i]/Fb;
    produced_.clear();
    ProcessStream top; top.name="top"; top.F=Ft; top.T=T; top.P=P; top.z=zt; top.vf=1.0;
    ProcessStream bot; bot.name="bottom"; bot.F=Fb; bot.T=T; bot.P=P; bot.z=zb; bot.vf=0.0;
    produced_.push_back(top); produced_.push_back(bot);
    kpis_["F_top_kmol_s"]=Ft; kpis_["F_bottom_kmol_s"]=Fb; kpis_["recovery"]=rec;
    if (verbosity>=3) std::cout << "  [sharpSplitColumn] top=" << Ft
        << " bottom=" << Fb << " kmol/s (recovery " << rec << ")\n";
    return 0;
}
} // namespace Choupo
