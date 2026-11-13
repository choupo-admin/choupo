/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "IdealMixing.H"

#include "DensityResolver.H"
#include "thermo/ApproximationAuthorisation.H"
#include "thermo/PropertyDomainError.H"
#include "thermo/ThermoPackage.H"

#include <cmath>
#include <cstdio>
#include <map>
#include <stdexcept>

namespace Choupo {
namespace liquidProperty {

IdealMixing::IdealMixing(const Binding& b)
  : thermo_(b.thermo), set_(b.set)
{
    if (!thermo_ || b.parts.size() != set_.size() || set_.empty())
        throw std::logic_error("IdealMixing: one leaf per constituent is required");
    for (const auto& p : b.parts)
    {
        auto leaf = std::dynamic_pointer_cast<const DensityLeaf>(p);
        if (!leaf) throw std::logic_error("IdealMixing: a part is not a leaf");
        leaves_.push_back(leaf);
    }

    //  The words, from the leaves: one phrase per route, in rank order.  A
    //  route's phrase is told the datum temperatures of its leaves only when
    //  one of them states its own (so a set at 25 C keeps the words byte for
    //  byte).
    struct Group { int rank; const DensityLeaf* first; std::vector<std::string> datum; bool stated; };
    std::map<std::pair<int, std::string>, Group> groups;
    pressureApplied_ = true;
    for (const auto& l : leaves_)
    {
        auto& g = groups[{ l->routeRank(), l->routeKey() }];
        if (!g.first) { g.rank = l->routeRank(); g.first = l.get(); g.stated = false; }
        const std::string d = l->datum();
        if (!d.empty()) g.datum.push_back(d);
        if (!l->statedDatum().empty()) g.stated = true;
        if (!l->pressureApplied()) pressureApplied_ = false;
    }
    id_    = "idealMixing[";
    label_ = "property kernel: ideal mixing of liquid volumes, ";
    bool first = true;
    for (const auto& kv : groups)
    {
        const Group& g = kv.second;
        id_    += std::string(first ? "" : "+") + kv.first.second;
        label_ += std::string(first ? "" : "; ")
                + g.first->routeWords(g.stated ? g.datum : std::vector<std::string>{});
        const std::string o = g.first->origin();
        if (origin_.empty() || o == "estimated") origin_ = o;
        first = false;
    }
    id_ += "]";
}

DensityAnswer IdealMixing::evaluate(scalar T, scalar P, const sVector& x) const
{
    //  The package's liquid branch, term for term (ThermoPackage::density):
    //  the mean molar mass over the set, then the mole-weighted volumes.
    scalar Mbar = 0.0, zsum = 0.0;
    for (const std::size_t i : set_)
        if (x[i] > 0.0) { Mbar += x[i] * thermo_->comp(i).MW(); zsum += x[i]; }
    if (zsum <= 0.0)
        throw PropertyDomainError(PropertyDomainError::Kind::invalidState,
            "liquid density: empty composition");
    Mbar = (Mbar / zsum) / 1000.0;                               // kg/mol

    DensityAnswer a;
    scalar Vmix = 0.0;
    for (std::size_t k = 0; k < set_.size(); ++k)
    {
        const std::size_t i = set_[k];
        if (x[i] <= 0.0) continue;
        Vmix += (x[i] / zsum) * leaves_[k]->molarVolume(T, P);
        a.leaves.push_back({ thermo_->comp(i).name(), leaves_[k]->id(), x[i] / zsum });
    }
    //  THE HYPOTHESIS' BOUND (MassWithoutVolume.H): the sum of the mass
    //  fractions of the components that keep their mass and add no volume.
    scalar wMassless = 0.0;
    std::string listed;
    for (std::size_t k = 0; k < set_.size(); ++k)
        if (leaves_[k]->isMassless() && x[set_[k]] > 0.0)
        {
            const std::size_t i = set_[k];
            wMassless += (x[i] / zsum) * thermo_->comp(i).MW() / (Mbar * 1000.0);
            listed += (listed.empty() ? "" : ", ") + thermo_->comp(i).name();
        }
    if (!listed.empty())
    {
        const scalar wMax = ApproximationAuthorisation::instance().maxMassFractionWithoutVolume();
        if (wMassless > wMax)
        {
            char b[160];
            std::snprintf(b, sizeof b, "the sum of their mass fractions is %.6g, above"
                          " the maxMassFraction %.6g", wMassless, wMax);
            throw PropertyDomainError(PropertyDomainError::Kind::outsideHardDomain,
                "liquid density: the case's hypothesis massWithoutVolume (" + listed
                + " keep their mass and add no volume) does not stand here: " + b
                + " the case itself declared (approximations.massWithoutVolume).",
                "a liquid within the declared bound, a larger bound with its reason,"
                " or a volume for the component (a record `Vliq` or a solution record)");
        }
        noteMassWithoutVolume(listed, wMassless);
    }
    if (!(Vmix > 0.0) || !std::isfinite(Vmix))
        throw PropertyDomainError(PropertyDomainError::Kind::invalidState,
            "liquid density: the mixture's liquid molar volume is not a finite"
            " positive number");
    a.v   = Vmix;
    a.rho = Mbar / Vmix;                                          // kg/m3
    a.methodId          = id_;
    a.label             = label_;
    a.pressureApplied   = pressureApplied_;
    a.quality.origin    = origin_;
    a.quality.provenance = "the component records' Vliq, Tc, Pc, omega";
    a.quality.domain    = "not declared";
    a.quality.evidence  = "not quantified";
    return a;
}

} // namespace liquidProperty
} // namespace Choupo
