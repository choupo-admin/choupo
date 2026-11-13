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
-------------------------------------------------------------------------------
Class
    Choupo::liquidProperty::DensityLeaf

Description
    ONE COMPONENT'S LIQUID MOLAR VOLUME, as a method (DEV.md 4c C378 pilot;
    docs/design/density-pilot-plan.md section 1).  A leaf is what a set
    method mixes: it answers v_i(T, P) of the component it is bound to, and
    the words that describe its route, so `idealMixing` composes its label
    from what each leaf says about itself and writes no route's words.

    Leaves of the pilot, in the order the resolver prefers them for one
    component (section 2 of the plan):
      pureFluid           the case's `pureFluids` selection (an explicit act;
                          it pins the component's leaf in every set);
      referenceEquation   a Helmholtz record that names the component
                          (by the fact, with pressure);
      recordVolume.*      the record's `Vliq` on its route (anchored
                          Rackett, flat, bare Rackett) -- today's code, bit
                          for bit;
      massWithoutVolume   the declared hypothesis: mass kept, no volume.
\*---------------------------------------------------------------------------*/

#pragma once

#include "DensityMethod.H"

#include <string>
#include <vector>

namespace Choupo {

class Component;

namespace liquidProperty {

class DensityLeaf : public DensityMethod
{
public:
    explicit DensityLeaf(const Binding& b);

    bool isLeaf() const override { return true; }

    //  The component this leaf prices (index into the package).
    std::size_t component() const { return i_; }

    //  The leaf's molar volume [m3/mol] at (T, P); throws a
    //  PropertyDomainError outside the leaf's domain.
    virtual scalar molarVolume(scalar T_K, scalar P_Pa) const = 0;

    //  How `idealMixing` groups leaves in its words: the leaves of one key
    //  share one phrase; keys are printed in ascending rank.
    virtual std::string routeKey() const = 0;
    virtual int         routeRank() const = 0;
    //  The phrase for this route, completed by the datum temperatures the
    //  leaves of the group state ("CH4 at 111.66 K"; empty: none states one).
    virtual std::string routeWords(const std::vector<std::string>& statedAt) const = 0;
    //  "CH4 at 111.66 K" when the record states the temperature of its
    //  datum; "" when it does not (or the leaf reads no stored datum).
    virtual std::string statedDatum() const { return ""; }
    //  The datum the leaf reads, stated or not ("water at 25 C"); "" for a
    //  leaf that reads no stored volume.
    virtual std::string datum() const { return ""; }
    virtual std::string origin() const = 0;
    virtual bool        pressureApplied() const { return false; }
    virtual std::string evidence() const { return "not quantified"; }

    //  The leaf answered as a method of its own (a one-component view).
    DensityAnswer evaluate(scalar T_K, scalar P_Pa, const sVector& x) const override;

protected:
    const ThermoPackage* thermo_ = nullptr;
    std::size_t          i_ = 0;
    const Component&     comp() const;
};

//  THE ONE HOME of the record-volume routes' words, shared with the slice-0
//  door's description of `ThermoPackage::density` (LiquidPropertyDoor.cpp).
const char* recordRouteId(int route);
std::string recordRouteWords(int route, const std::vector<std::string>& statedAt);
const char* recordRouteOrigin(int route);
//  "CH4 at 111.66 K" (the record's `VliqT`) or "CH4 at 25 C".
std::string datumOf(const Component& c);

} // namespace liquidProperty
} // namespace Choupo
