/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "SprayDryer.H"
#include "atomizer/Atomizer.H"
#include "core/Advisory.H"
#include "core/RegistryRefusal.H"
#include "solver/NewtonRaphson.H"
#include "streams/StreamMass.H"
#include "unitOperations/flash/StreamEquilibrium.H"   // the ONE resolve-and-price home
#include "unitOperations/saturation/BubblePoint.H"    // the mixture's surface pressure (C111)

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"

namespace Choupo {

int SprayDryer::solve(const DictPtr& dict,
                      const ThermoPackage& thermo,
                      int verbosity)
{
    constexpr scalar PI = 3.14159265358979323846;
    constexpr scalar G  = 9.80665;          // m/s^2
    constexpr scalar R  = 8314.462;         // J/(kmol·K)
    const std::size_t n = thermo.n();

    // -------------------------------------------------------------------
    //  Inputs: feed (liquid + dissolved solid) + dryingAir (hot gas).
    //  buildAugmentedDict writes them under `inputStreams ( {feed} {air} )`
    //  when the unit declares  inputs (feed dryingAir );
    // -------------------------------------------------------------------
    auto ins = dict->lookupDictList("inputStreams");
    if (ins.size() != 2)
        throw std::runtime_error("SprayDryer: expected exactly 2 inputs"
            " (feed liquid + drying air); got " + std::to_string(ins.size())
            + ".  Declare  inputs (feed dryingAir );");
    auto feedDict = ins[0];
    auto airDict  = ins[1];

    const scalar F_feed = feedDict->lookupScalar("F", Dims::molarFlow);   // kmol/s
    const scalar T_feed = feedDict->lookupScalar("T", Dims::temperature);
    const scalar F_air  = airDict->lookupScalar("F", Dims::molarFlow);    // kmol/s
    const scalar T_air  = airDict->lookupScalar("T", Dims::temperature);
    const scalar P_air  = airDict->lookupScalarOrDefault("P", 101325.0);
    // Feed liquid pressure -- the pump head a pressure nozzle atomises against
    // (dP = P_feed - chamber).  Absent -> equals the chamber (dP=0 from the stream,
    // so a pressure nozzle falls back to its `deltaP` override).
    const scalar P_feed = feedDict->lookupScalarOrDefault("P", P_air);

    auto readComp = [&](const DictPtr& sd) -> sVector
    {
        sVector v(n, 0.0);
        auto c = sd->subDict("composition");
        scalar s = 0.0;
        for (const auto& k : c->keys()) { v[thermo.indexOf(k)] = c->lookupScalar(k); }
        for (auto x : v) s += x;
        if (s > 0.0) for (auto& x : v) x /= s;
        return v;
    };
    const sVector zFeed = readComp(feedDict);
    const sVector yAir  = readComp(airDict);

    // Crystals already SUSPENDED in the feed (e.g. a magma from a crystalliser
    // upstream): they are not dissolved (not in `composition`), they ride in
    // s[] and must end up in the powder -- the dryer evaporates the liquor, the
    // suspended solid passes straight through.
    auto readSolids = [&](const DictPtr& sd) -> sVector
    {
        sVector v(n, 0.0);
        if (!sd->found("solids")) return v;
        auto so = sd->subDict("solids");
        if (so->found("solidMolarFlows"))
        {
            auto mf = so->subDict("solidMolarFlows");
            for (const auto& k : mf->keys()) v[thermo.indexOf(k)] = mf->lookupScalar(k);
        }
        return v;
    };
    const sVector sFeed = readSolids(feedDict);    // kmol/s of suspended crystals

    // -------------------------------------------------------------------
    //  Operation = atomiser HARDWARE only (the credo).  Liquid viscosity
    //  / surface tension default to water (Choupo carries neither yet);
    //  they are knobs, not specs.
    // -------------------------------------------------------------------
    auto oper = dict->subDict("operation");
    // Liquid viscosity for atomisation: the SOLUTION mu_L from the property layer
    // (its mixing rule -> a concentrated/viscous feed gives COARSER droplets),
    // when a liquidViscosity model is declared; else the operation knob (default
    // water, byte-stable for cases without a transport model).
    scalar muL = oper->lookupScalarOrDefault("liquidViscosity", 1.0e-3);
    std::string muLSource = "operation.liquidViscosity knob (default water 1e-3; no liquidViscosity model)";
    if (thermo.hasLiquidViscosity())
    {
        //  A DECLARED model that cannot price this feed REFUSES, quoting the
        //  package's own reason (2026-09-05).  Until then this was a
        //  catch(...) that kept the water knob: the case had DECLARED a
        //  liquid-viscosity model, the model could not serve (a solute with
        //  no viscosity block, say), and the atomiser went on with 1e-3 Pa.s
        //  and a source string naming a model that was not running.  The
        //  remedy is the record's, not the unit's, and it is named.
        try
        {
            muL = thermo.viscosityLiquid(T_feed, zFeed);
            muLSource = "property layer mu_L(T_feed, x_feed) -- SOLUTION viscosity via the mixing rule";
        }
        catch (const std::exception& e)
        {
            throw std::runtime_error("SprayDryer '" + (dict->name().empty() ? type() : dict->name()) + "': the case"
                " declares a liquidViscosity transport model and it cannot"
                " price the feed -- " + std::string(e.what()) + "\n  Remedy:"
                " give every feed component the block that model reads, or"
                " remove the liquidViscosity declaration and set"
                " `operation.liquidViscosity` explicitly.  The unit will NOT"
                " substitute water for a declared model.");
        }
    }
    const scalar nRR   = oper->lookupScalarOrDefault("spreadParameter", 2.2);  // Rosin-Rammler width
    const scalar Dch   = oper->lookupScalarOrDefault("chamberDiameter", 0.0);  // m  (drying chamber)
    const scalar Lch   = oper->lookupScalarOrDefault("chamberHeight",  0.0);   // m  (drying chamber)
    const std::string flowDir = oper->lookupWordOrDefault("flow", "co");       // co | counter current
    // The atomiser is a selectable sub-model: `operation { atomiser { model
    // <rotary|pressureNozzle|twinFluid>; ...; } }`.  Absent -> the whole
    // operation dict feeds the default rotary (reads wheelSpeed/wheelDiameter as
    // before, byte-identical).  d32 is computed at the atomisation step below.
    const DictPtr atomDict = oper->found("atomiser") ? oper->subDict("atomiser") : oper;
    auto atomiser = Atomizer::New(atomDict);
    // Chamber model (unit-level `model` slot): `lumped` (default -- inlet/outlet +
    // a PSD) or `distributed` (the axial droplet trajectory -> profiles of gas
    // humidity, particle moisture, diameter and temperature ALONG the chamber).
    // Author-named chamber models (the Choupo convention, cf. distillation
    // WangHenke): `marshall` = the lumped inlet/outlet short-cut (Marshall 1954);
    // `langrishKockel` = the 1-D axial-profile trajectory with the Characteristic
    // Drying Curve (Langrish & Kockel 2001); `chen` = the same 1-D trajectory with
    // the Reaction Engineering Approach kinetics (Chen & Xie 1997 / Chen 2008) --
    // a SMOOTH activation-energy rate, no critical-moisture break.  The descriptive
    // `lumped`/`distributed` are accepted as aliases; default lumped.
    const std::string dryerModel = dict->lookupWordOrDefault("model", "marshall");
    const bool rea = (dryerModel == "chen");
    const bool distributed = (dryerModel == "langrishKockel" || dryerModel == "distributed" || rea);
    //  AND AN UNRECOGNISED WORD REFUSES (2026-09-07).  Both booleans above are
    //  false for any word this list does not carry, so `model langrishKocke;`
    //  -- one missing letter -- ran the LUMPED Marshall short-cut with EVERY
    //  KPI byte-identical to the axial run, the difference visible only in
    //  `profile.csv`, which stopped being an axial profile and became a size
    //  distribution.  No golden can see that; a refusal can.
    if (!distributed && dryerModel != "marshall" && dryerModel != "lumped")
        throw std::runtime_error("SprayDryer: " + registryRefusal::message(
            "spray-dryer chamber model", dryerModel,
            {"marshall", "lumped", "langrishKockel", "distributed", "chen"},
            "Accepted"));

    // -------------------------------------------------------------------
    //  Identify, in the FEED, the volatile solvent and the non-volatile
    //  solid; in the AIR, the dominant dry-gas carrier (for diffusivity).
    // -------------------------------------------------------------------
    //  EVERY VOLATILE SOLVENT OF THE FEED (2026-10-20, DEV.md 4c C111).
    //  Until then the unit kept ONE solvent -- the LAST feed component with
    //  a vapour pressure -- and every later step read that one index; a
    //  second solvent (the acetone of an acetone/water spray-drying feed)
    //  was in the feed and in NO outlet: mass lost at exit 0.  `solvents`
    //  lists them all, in component order; `iSolv` stays the last of them,
    //  so a single-solvent feed takes every line below exactly as before.
    //  A feed with SEVERAL takes the equilibrium route of the energy
    //  balance below (docs/design/a-spray-dryer-with-several-solvents.md).
    std::size_t iSolv = n, iSolid = n;
    std::vector<std::size_t> solvents;
    std::vector<char>        isSolvent(n, 0);
    std::vector<std::string> noOutlet;          // neither a solid nor volatile
    for (std::size_t i = 0; i < n; ++i)
    {
        if (zFeed[i] <= 0.0) continue;
        const std::string& r = thermo.comp(i).role();
        if (r == "nonvolatile")                          iSolid = i;
        else if (thermo.comp(i).hasVaporPressure())
        { iSolv = i; solvents.push_back(i); isSolvent[i] = 1; }
        else noOutlet.push_back(thermo.comp(i).name());
    }
    //  A dissolved feed component that is neither `role nonvolatile` (it
    //  would leave in the powder) nor volatile (it would leave in the
    //  exhaust) has no outlet in this unit: it used to vanish.  Refused.
    if (!noOutlet.empty())
    {
        std::string names;
        for (const auto& s : noOutlet) names += (names.empty() ? "" : ", ") + s;
        throw std::runtime_error("SprayDryer '" + (dict->name().empty() ? type() : dict->name())
            + "': the feed carries " + names + ", which is neither a non-volatile"
              " solid (`role nonvolatile;`, it would leave in the powder) nor a"
              " volatile solvent (a `vaporPressure` block, it would leave in the"
              " exhaust).  The unit has no outlet for it and will not drop it."
              "  Remedy: give the record the role or the vapour-pressure block"
              " that says where it goes.");
    }
    const bool multiSolvent = solvents.size() > 1;
    //  EVERY non-volatile solid the feed brings leaves in the powder
    //  (2026-10-18, DEV.md 4c C97).  Until then the unit kept ONE solid --
    //  the last non-volatile dissolved in the feed -- and a second one (the
    //  polymer of an amorphous solid dispersion beside its drug, say) was
    //  in the feed and in no outlet: mass lost at exit 0.  `iSolid` stays
    //  the solid whose isotherm and name the moisture model reads; the
    //  others are carried at its side, and a powder with MORE THAN ONE
    //  solid and a sorption isotherm is refused below, because the
    //  moisture model is per kg of ONE material.  A single-solid feed is
    //  byte-identical: the sums below then have one term.
    std::vector<std::size_t> solids;
    for (std::size_t i = 0; i < n; ++i)
        if (thermo.comp(i).role() == "nonvolatile"
            && (zFeed[i] > 0.0 || sFeed[i] > 0.0))
            solids.push_back(i);
    if (iSolid == n && !solids.empty()) iSolid = solids.back();
    if (iSolv == n)
        throw std::runtime_error("SprayDryer: the feed has no volatile"
            " solvent to evaporate (need a component with vapour pressure).");
    if (iSolid == n)
        throw std::runtime_error("SprayDryer: the feed has no non-volatile"
            " solid to dry into powder (need a `role nonvolatile;` species).");
    if (solids.size() > 1)
    {
        std::vector<std::string> withIsotherm;
        for (auto i : solids)
            if (thermo.comp(i).hasSorption()) withIsotherm.push_back(thermo.comp(i).name());
        if (!withIsotherm.empty())
        {
            std::string names;
            for (const auto& s : withIsotherm) names += (names.empty() ? "" : ", ") + s;
            throw std::runtime_error("SprayDryer '" + (dict->name().empty() ? type() : dict->name())
                + "': the feed carries " + std::to_string(solids.size())
                + " non-volatile solids and " + names + " declares a `sorption {}`"
                " isotherm.  The residual-moisture model is a moisture RATIO per kg"
                " of ONE dry material; the isotherm of a mixed powder is not"
                " modelled, and applying one component's isotherm to the whole"
                " powder would be a guess.  Remedy: remove the sorption block"
                " (the powder then leaves bone-dry, phase 1, said on the run) or"
                " dry one solid at a time.");
        }
    }

    //  WHAT A FEED WITH SEVERAL SOLVENTS MAY NOT ASK FOR (C111).  Both
    //  refusals name a DROPLET model that is about ONE solvent and say
    //  what does run.
    std::string solventNames;
    for (auto i : solvents)
        solventNames += (solventNames.empty() ? "" : ", ") + thermo.comp(i).name();
    if (multiSolvent)
    {
        const std::string who0 = "SprayDryer '" + (dict->name().empty() ? type() : dict->name()) + "'";
        //  (e) The residual-moisture model: a GAB isotherm is a moisture
        //  RATIO of ONE sorbate per kg of dry solid, and the record does not
        //  say which solvent it was measured with.  Applying it to the sum
        //  of the solvents, or to whichever one the unit picked, would be a
        //  guess presented as a material property.
        std::vector<std::string> withIsotherm;
        for (auto i : solids)
            if (thermo.comp(i).hasSorption()) withIsotherm.push_back(thermo.comp(i).name());
        if (!withIsotherm.empty())
        {
            std::string names;
            for (const auto& s : withIsotherm) names += (names.empty() ? "" : ", ") + s;
            throw std::runtime_error(who0 + ": the feed carries "
                + std::to_string(solvents.size()) + " volatile solvents (" + solventNames
                + ") and " + names + " declares a `sorption {}` isotherm.  The"
                  " residual-moisture model is the equilibrium moisture of ONE sorbate per"
                  " kg of dry solid; the isotherm does not say which solvent it was"
                  " measured with, and a mixed-solvent sorption isotherm is not"
                  " modelled.  Remedy: remove the sorption block -- every solvent then"
                  " leaves in the exhaust unless the air cannot carry it, which is said"
                  " on the run -- or dry from one solvent.");
        }
        //  (d) The droplet trajectory: the axial profile (`langrishKockel`)
        //  and the Reaction Engineering Approach (`chen`) integrate the
        //  moisture of a droplet of ONE solvent.  A droplet of several
        //  evaporates them selectively (the more volatile first, as far as
        //  its internal mixing allows), which is a multicomponent droplet
        //  model this unit does not have.  The lumped chamber (`marshall`)
        //  runs: its mass and energy do not depend on the droplet history.
        if (distributed)
            throw std::runtime_error(who0 + ": chamber model `" + dryerModel
                + "` integrates the drying of a droplet of ONE solvent, and the feed"
                  " carries " + std::to_string(solvents.size()) + " (" + solventNames
                + ").  The selective evaporation of a mixed-solvent droplet is not"
                  " modelled.  Remedy: `model marshall;` (the lumped chamber: every"
                  " solvent leaves in the exhaust unless the air cannot carry it), or"
                  " dry from one solvent.");
    }

    std::size_t iDry = n; scalar ymax = 0.0;
    for (std::size_t i = 0; i < n; ++i)
        if (!isSolvent[i] && yAir[i] > ymax) { ymax = yAir[i]; iDry = i; }
    if (iDry == n)
        throw std::runtime_error("SprayDryer: dryingAir has no carrier gas.");

    const Component& solv = thermo.comp(iSolv);
    const Component& sol  = thermo.comp(iSolid);

    //  THE SOLVENT LIQUID OF THE FEED, solids left out (C111): its mole
    //  fractions `xs` over the volatile solvents -- for one solvent the unit
    //  vector at iSolv, exactly.  With several solvents the droplet's
    //  PROPERTIES below (molar mass, latent heat, vapour heat capacity,
    //  surface pressure, density, surface tension, diffusivity) are those
    //  of this liquid at its FEED composition -- a PSEUDO-SOLVENT, the
    //  simplification of DEV.md C111 (d), announced once below.  They set
    //  the droplet size, the wet bulb and the drying-time KPIs; they decide
    //  NO mass and NO energy (those go through the package's flash and
    //  `priceState`, the equilibrium route further down).
    sVector xs(n, 0.0);
    {
        scalar t = 0.0;
        for (auto i : solvents) t += zFeed[i];
        for (auto i : solvents) xs[i] = zFeed[i] / t;
    }
    scalar MW_mix = 0.0;
    for (auto i : solvents) MW_mix += xs[i] * thermo.comp(i).MW();
    const scalar MW_w = multiSolvent ? MW_mix : solv.MW();
    //  Latent heat of the solvent liquid, J/mol: one solvent's own; for a
    //  mixture the mole-fraction mean at the feed composition (the latent
    //  heat of a liquid that evaporates WITHOUT changing composition).
    auto hvapMol = [&](scalar T) -> scalar
    {
        if (!multiSolvent) return solv.Hvap_latent(T);
        scalar h = 0.0;
        for (auto i : solvents) h += xs[i] * thermo.comp(i).Hvap_latent(T);
        return h;
    };
    if (multiSolvent)
    {
        std::ostringstream m;
        m << "the feed carries " << solvents.size() << " volatile solvents (" << solventNames
          << "): every one leaves in the exhaust unless the air cannot carry it, decided"
             " by the package's flash of the exhaust at T_out (the outlet is that"
             " equilibrium; no droplet model chooses which solvent stays).  The droplet's"
             " size, wet bulb and drying-time KPIs are computed for a PSEUDO-SOLVENT -- the"
             " solvent liquid at its feed composition (mole-fraction mean latent heat and"
             " molar volume, the package's bubble pressure and surface tension of that"
             " liquid); selective evaporation inside the droplet is not modelled";
        if (AdvisoryLog::instance().add("model", "info",
                "sprayDryer '" + (dict->name().empty() ? type() : dict->name()) + "'", m.str())
            && verbosity >= 1)
            std::cout << "  [sprayDryer] " << m.str() << "\n";
    }

    // -------------------------------------------------------------------
    //  Surface tension of the atomising liquid -- HONEST CASCADE (glass-box):
    //    (1) explicit `surfaceTension` in operation{}  -> the knob wins;
    //    (2) else the property layer  thermo.surfaceTension(T_feed, x_liq)
    //        -- the REAL sigma(T) of the liquid (IAPWS R1-76 if water is
    //        IF97-flagged, else the generic SurfaceTensionModel) evaluated
    //        at the atomisation (feed) temperature.  The non-volatile solid
    //        has no liquid surface, so sigma is taken on the volatile
    //        solvent (water) -- a unit vector in iSolv -- which also keeps
    //        the BrockBird correlation off the solid's missing Tc/Pc/Tb;
    //    (3) else (no sigma model declared / the accessor throws) -> the
    //        0.072 N/m water fallback, so cases WITHOUT a sigma model stay
    //        byte-stable.
    // -------------------------------------------------------------------
    scalar sigma = 0.072;
    std::string sigmaSource = "default (0.072 N/m, water)";
    if (oper->found("surfaceTension"))
    {
        sigma = oper->lookupScalar("surfaceTension");
        sigmaSource = "operation{} knob";
    }
    else
    {
        //  surface = the volatile solvent (for several, the solvent liquid
        //  at its feed composition, through the package's mixing rule)
        const sVector& xLiq = xs;
        try
        {
            sigma = thermo.surfaceTension(T_feed, xLiq);
            sigmaSource = "property layer sigma(T_feed) of "
                + (multiSolvent ? "the solvent liquid (" + solventNames + ")" : solv.name())
                + " (Brock-Bird: OVERPREDICTS H-bonded liquids ~50%; d32 impact modest via the ^0.6 power)";
        }
        catch (const std::exception&)
        {
            sigma = 0.072;                       // no sigma model -> byte-stable fallback
            sigmaSource = "default (0.072 N/m, water -- no surfaceTension model)";
        }
    }

    // -------------------------------------------------------------------
    //  Mass balance: solid -> powder; ALL feed solvent -> vapour (the
    //  phase-1 "dry powder" assumption).  Air carries the vapour out.
    // -------------------------------------------------------------------
    scalar n_solv_feed = F_feed * zFeed[iSolv];                      // kmol/s evaporated
    if (multiSolvent)                                                // every solvent (C111)
    { n_solv_feed = 0.0; for (auto i : solvents) n_solv_feed += F_feed * zFeed[i]; }
    //  Per solid, dissolved + suspended; summed over every solid of the feed.
    sVector nSolidOf(n, 0.0);                                         // kmol/s
    scalar m_solid = 0.0;                                             // kg/s
    for (auto i : solids)
    {
        nSolidOf[i] = F_feed * zFeed[i] + sFeed[i];
        m_solid += nSolidOf[i] * thermo.comp(i).MW();
    }
    if (solids.size() > 1)
    {
        std::string names;
        for (auto i : solids) names += (names.empty() ? "" : ", ") + thermo.comp(i).name();
        const std::string msg = "the powder carries " + std::to_string(solids.size())
            + " solids (" + names + "): all leave in the powder, the particle density"
              " is their mass-weighted harmonic mean (volumes additive), and no"
              " residual moisture is modelled for a mixed powder";
        if (AdvisoryLog::instance().add("model", "info",
                "sprayDryer '" + (dict->name().empty() ? type() : dict->name()) + "'", msg)
            && verbosity >= 1)
            std::cout << "  [sprayDryer] " << msg << "\n";
    }

    scalar MW_feed = 0.0;
    for (std::size_t i = 0; i < n; ++i) MW_feed += zFeed[i] * thermo.comp(i).MW();
    scalar m_feed = F_feed * MW_feed;                      // kg/s (dissolved basis)
    for (std::size_t i = 0; i < n; ++i) m_feed += sFeed[i] * thermo.comp(i).MW();  // + suspended crystals
    const scalar x_solid_mass = (m_feed > 0.0) ? m_solid / m_feed : 0.0;

    // -------------------------------------------------------------------
    //  Wet-bulb temperature of the droplet (constant-rate surface T).
    //  Psychrometric balance with the Lewis relation (Le ~ 1 for water-air):
    //      (T_air - Twb)·cp_humid = ΔHvap(Twb)·(Y_sat(Twb) - Y_air)
    //  with absolute humidities Y in kg solvent / kg dry gas.
    // -------------------------------------------------------------------
    scalar MW_dry = 0.0, ydry = 0.0;
    for (std::size_t i = 0; i < n; ++i)
        if (!isSolvent[i]) { MW_dry += yAir[i] * thermo.comp(i).MW(); ydry += yAir[i]; }
    MW_dry = (ydry > 0.0) ? MW_dry / ydry : thermo.comp(iDry).MW();

    scalar yw_air = yAir[iSolv];
    scalar Y_air  = (yw_air < 1.0)
                  ? (MW_w / MW_dry) * yw_air / (1.0 - yw_air) : 1.0;
    if (multiSolvent)
    {
        //  kg of solvent vapour per kg of dry gas, summed over the solvents
        //  the inlet air already carries, each at its own molar mass.
        scalar mv = 0.0;  yw_air = 0.0;
        for (auto i : solvents) { mv += yAir[i] * thermo.comp(i).MW(); yw_air += yAir[i]; }
        Y_air = (yw_air < 1.0) ? mv / (MW_dry * (1.0 - yw_air)) : 1.0;
    }

    scalar cp_dry_molar = 0.0;
    for (std::size_t i = 0; i < n; ++i)
        if (!isSolvent[i] && yAir[i] > 0.0 && ydry > 0.0)   // only species present (skip the solid)
            cp_dry_molar += (yAir[i] / ydry) * thermo.comp(i).cpIdealGas().Cp(T_air);
    const scalar cp_dry = cp_dry_molar / (MW_dry / 1000.0);                 // J/(kg dry·K)
    scalar cp_vap_molar = solv.cpIdealGas().Cp(T_air);
    if (multiSolvent)
    { cp_vap_molar = 0.0; for (auto i : solvents) cp_vap_molar += xs[i] * thermo.comp(i).cpIdealGas().Cp(T_air); }
    const scalar cp_vap = cp_vap_molar / (MW_w / 1000.0);                   // J/(kg vap·K)

    //  The saturated surface: one solvent's vapour pressure and latent heat;
    //  for several, the package's BUBBLE pressure of the solvent liquid at
    //  its feed composition, and the molar mass and latent heat of the
    //  vapour that surface is in equilibrium with (the pseudo-solvent,
    //  C111) -- so the wet bulb balances the heat against the latent heat
    //  of what the surface actually emits.  Returns Y_sat; `dHvKg` [J/kg].
    auto surfaceAt = [&](scalar T, scalar& dHvKg) -> scalar
    {
        if (multiSolvent)
        {
            const BubblePoint::PressureResult b = BubblePoint::pressure(thermo, xs, T, P_air);
            scalar Mv = 0.0, Hv = 0.0;
            const bool hasY = (b.y.size() == n);
            for (auto i : solvents)
            {
                const scalar yi = hasY ? b.y[i] : xs[i];
                Mv += yi * thermo.comp(i).MW();
                Hv += yi * thermo.comp(i).Hvap_latent(T);
            }
            dHvKg = Hv / (Mv / 1000.0);
            return (b.P < 0.99 * P_air) ? (Mv / MW_dry) * b.P / (P_air - b.P) : 10.0;
        }
        dHvKg = hvapMol(T) / (MW_w / 1000.0);
        const scalar Pw = thermo.Psat(iSolv, T);
        return (Pw < 0.99 * P_air) ? (MW_w / MW_dry) * Pw / (P_air - Pw) : 10.0;
    };
    auto gwb = [&](scalar Twb) -> scalar
    {
        scalar dHv = 0.0;                                                  // J/kg
        const scalar Ys  = surfaceAt(Twb, dHv);
        const scalar cph = cp_dry + Y_air * cp_vap;                        // J/(kg dry·K)
        return (T_air - Twb) * cph - dHv * (Ys - Y_air);
    };
    auto dgwb = [&](scalar T) { const scalar h = 0.01; return (gwb(T + h) - gwb(T - h)) / (2.0 * h); };

    solver::NROptions owb;
    owb.tolerance = 1.0e-2;
    owb.maxIter   = 80;
    owb.lower     = std::min(T_feed, 280.0);
    owb.upper     = T_air;
    owb.bracket   = true;
    auto rwb = solver::newton1D(gwb, dgwb, 0.5 * (T_feed + T_air), owb);
    const scalar T_wb = rwb.x;

    // -------------------------------------------------------------------
    //  THE HAND BALANCE, NOW ONLY THE SEED (2026-09-27).  The hot air gives
    //  up sensible heat to evaporate the feed solvent:
    //      F_air·cp_air·(T_air - T_out) = n_evap·[ΔHvap + cpL·(Twb - Tfeed)]
    //  This used to BE the energy balance, and it was the largest single
    //  term in the flagship plant's first-law violation (-70.8516 kW on
    //  DRYING.SD, of a plant residual of +34.4126 kW).  It is written on its
    //  own surface -- a constant Cp for the air, a Watson latent heat at the
    //  wet bulb -- and it omits four things the outlet streams carry: the
    //  vapour superheated from T_wb to T_out, the solid and the residual
    //  moisture heated from T_feed to T_out, the heat of crystallisation of
    //  every dissolved mole of solid that leaves as powder, and (with a
    //  sorption isotherm) the water that STAYS in the powder, whose latent
    //  heat it charged anyway.  The streams are priced by the package.  So
    //  the temperature it gives is now only where the search below STARTS;
    //  the published T_out closes H(out) = H(in) on the package's surface.
    // -------------------------------------------------------------------
    scalar cpL_w = solv.hasCpLiquid()
                 ? solv.cpLiquid().Cp(0.5 * (T_feed + T_wb)) : 75.4;        // J/(mol·K)
    if (multiSolvent)                    // the seed only: a mole-fraction mean
    {
        cpL_w = 0.0;
        for (auto i : solvents)
            cpL_w += xs[i] * (thermo.comp(i).hasCpLiquid()
                              ? thermo.comp(i).cpLiquid().Cp(0.5 * (T_feed + T_wb)) : 75.4);
    }
    // Molar Cp of the inlet air -- summed over species ACTUALLY present, so
    // a non-volatile solid in the package (y = 0, no idealGasHeatCapacity)
    // is skipped rather than tripping ThermoPackage::Cp_ig's hard check.
    scalar cp_air_molar = 0.0;                                              // J/(mol·K)
    for (std::size_t i = 0; i < n; ++i)
        if (yAir[i] > 0.0) cp_air_molar += yAir[i] * thermo.comp(i).cpIdealGas().Cp(T_air);
    const scalar cp_air_W = std::max(1.0, F_air * 1000.0 * cp_air_molar);   // W/K
    const scalar q_per_evap = hvapMol(T_wb) + cpL_w * (T_wb - T_feed);           // J/mol
    const scalar n_evap_seed_max = (q_per_evap > 0.0)
                                 ? cp_air_W * (T_air - T_wb) / (1000.0 * q_per_evap)  // kmol/s
                                 : n_solv_feed;
    const scalar T_out_seed = (n_solv_feed > n_evap_seed_max)
        ? T_wb
        : T_air - n_solv_feed * 1000.0 * q_per_evap / cp_air_W;
    //  The exhaust temperature, and whether drying is ENERGY-LIMITED (the air
    //  cannot carry the solvent the kinetics release without cooling below
    //  its wet bulb).  Both are set by the balance below; the kinetics read
    //  T_out, so the two are solved together.
    scalar T_out          = T_out_seed;
    bool   energy_limited = false;

    // -------------------------------------------------------------------
    //  Atomisation -- the SELECTED atomizer returns d32 from the liquid state
    //  (mu_L, sigma, rho_L) + its own hardware.  The rotary default reproduces
    //  the Friedman/Marshall rotary-disc d32 byte-for-byte.  The droplet then
    //  shrinks to the powder particle as solvent leaves:
    //      d_p = d32 · (x_solid,mass · ρ_L / ρ_solid)^(1/3)
    // -------------------------------------------------------------------
    scalar rho_L = (solv.Vliq() > 0.0) ? (MW_w / 1000.0) / solv.Vliq() : 1000.0;
    if (multiSolvent)
    {
        //  The solvent liquid's density at its feed composition: molar
        //  volumes ADD (ideal mixing; the excess volume of acetone/water or
        //  ethanol/water is a few per cent, beneath d32's cube-root
        //  sensitivity).  A solvent with no declared Vliq keeps the water
        //  fallback of the one-solvent line above, said.
        scalar V = 0.0; bool all = true;
        for (auto i : solvents)
        {
            if (thermo.comp(i).Vliq() > 0.0) V += xs[i] * thermo.comp(i).Vliq();
            else all = false;
        }
        rho_L = (all && V > 0.0) ? (MW_w / 1000.0) / V : 1000.0;
        if (!all)
            AdvisoryLog::instance().add("model", "warning",
                "sprayDryer '" + (dict->name().empty() ? type() : dict->name()) + "'",
                "a solvent of the feed declares no liquid molar volume (Vliq): the"
                " droplet density is taken as 1000 kg/m3");
    }
    scalar MW_air_in = 0.0;
    for (std::size_t i = 0; i < n; ++i) MW_air_in += yAir[i] * thermo.comp(i).MW();
    const scalar rho_air_in = (T_air > 0.0) ? P_air * MW_air_in / (R * T_air) : 1.2;
    const Atomizer::Feed afeed { m_feed, rho_L, muL, sigma, rho_air_in, P_feed, P_air };
    const Atomizer::DropletResult drop = atomiser->dropletSize(afeed);
    const scalar d32 = drop.d32;
    if (verbosity >= 2)
        std::cout << "  [atomiser] " << atomiser->name() << ":  " << drop.note << "\n"
                  << "  [atomiser mu_L] " << muLSource << "\n";
    //  The particle density of a powder of several solids is the mass-
    //  weighted HARMONIC mean (the volumes add, an ideal-mixing assumption
    //  printed below); one solid keeps its own density exactly.
    auto rhoOf = [&](std::size_t i)
    { return (thermo.comp(i).rho_p() > 0.0) ? thermo.comp(i).rho_p() : 1500.0; };
    scalar rho_solid = rhoOf(iSolid);
    if (solids.size() > 1 && m_solid > 0.0)
    {
        scalar vol = 0.0;                                   // m3 per s of solid
        for (auto i : solids) vol += nSolidOf[i] * thermo.comp(i).MW() / rhoOf(i);
        rho_solid = m_solid / vol;
    }
    const scalar d_part = (x_solid_mass > 0.0)
                        ? d32 * std::cbrt(x_solid_mass * rho_L / rho_solid) : d32;

    // -------------------------------------------------------------------
    //  Drying kinetics -- terminal velocity (Stokes) + Ranz-Marshall.
    //  Needs the transport layer (gas mu / k / D).  WITHOUT A GAS-VISCOSITY
    //  MODEL THE UNIT REFUSES (2026-09-05).  Until then it "reported the
    //  kinetics as zero": tau_dry_constant = 0, Re = 0, h = 0, exit 0 -- a
    //  plausible-looking KPI row for a drying time nothing computed.  Every
    //  sprayDryer case in the corpus declares `transport { vapour {
    //  viscosity { model Chung; } } }`, so no golden depended on the zero
    //  (checked case by case before this refusal was written).  k and D
    //  stay optional: without them Pr and Sc are 0 and Nu = Sh = 2 -- the
    //  pure-conduction limit -- and that is announced below rather than
    //  refused, because it is a coarser model, not an absent one.
    // -------------------------------------------------------------------
    const scalar T_film  = 0.5 * (T_air + T_wb);
    scalar MW_air = 0.0; for (std::size_t i = 0; i < n; ++i) MW_air += yAir[i] * thermo.comp(i).MW();
    const scalar rho_g   = P_air * MW_air / (R * T_film);   // kg/m^3

    if (!thermo.hasTransport())
        throw std::runtime_error("SprayDryer '" + (dict->name().empty() ? type() : dict->name()) + "': the drying"
            " kinetics (Stokes terminal velocity, Ranz-Marshall Nu/Sh, the"
            " constant-rate drying time) need the gas viscosity and the case"
            " declares no transport model.  Remedy: add to"
            " constant/thermoPhysPropDict\n"
            "    transport { vapour { viscosity { model Chung; }"
            " thermalConductivity { model Eucken; } diffusivity { model"
            " Fuller; } } }\n"
            "  The unit no longer reports a drying time of zero in its place.");
    scalar mu_g = 0.0, k_g = 0.0, Dab = 0.0;
    mu_g = thermo.viscosityGas(T_film, yAir);
    if (!thermo.hasThermalConductivity() || !thermo.hasDiffusivity())
        AdvisoryLog::instance().add("model", "warning",
            "sprayDryer '" + (dict->name().empty() ? type() : dict->name()) + "'",
            std::string("drying kinetics without a declared gas ")
            + (!thermo.hasThermalConductivity() && !thermo.hasDiffusivity()
                 ? "thermalConductivity and diffusivity"
                 : (!thermo.hasThermalConductivity() ? "thermalConductivity"
                                                      : "diffusivity"))
            + " model: Pr/Sc taken as 0, so Nu = Sh = 2 (pure conduction) and"
              " the corresponding transfer coefficient is 0 -- declare the"
              " sub-block in transport { vapour { ... } } to price it");
    if (thermo.hasThermalConductivity())   k_g  = thermo.thermalConductivityGas(T_film, yAir);
    if (thermo.hasDiffusivity())
    {
        if (!multiSolvent) Dab = thermo.diffusivityGas(T_film, P_air, iSolv, iDry);
        else  // the pseudo-solvent: the mole-fraction mean of each solvent's own
            for (auto i : solvents) Dab += xs[i] * thermo.diffusivityGas(T_film, P_air, i, iDry);
    }

    const scalar d   = (d32 > 0.0) ? d32 : d_part;          // droplet drives drying
    scalar v_t = 0.0, Re = 0.0, Pr = 0.0, Sc = 0.0;
    scalar Nu = 2.0, Sh = 2.0, h = 0.0, kc = 0.0, tau_const = 0.0;
    if (mu_g > 0.0 && d > 0.0)
    {
        v_t = (rho_L - rho_g) * G * d * d / (18.0 * mu_g);
        Re  = rho_g * v_t * d / mu_g;
        const scalar cp_g_mass = cp_air_molar / (MW_air / 1000.0);         // J/(kg·K)
        if (k_g  > 0.0) Pr = cp_g_mass * mu_g / k_g;
        if (Dab  > 0.0) Sc = mu_g / (rho_g * Dab);
        Nu = 2.0 + 0.6 * std::sqrt(Re) * (Pr > 0.0 ? std::cbrt(Pr) : 0.0);
        Sh = 2.0 + 0.6 * std::sqrt(Re) * (Sc > 0.0 ? std::cbrt(Sc) : 0.0);
        if (k_g > 0.0) h  = Nu * k_g / d;                  // W/(m^2·K)
        if (Dab > 0.0) kc = Sh * Dab / d;                  // m/s

        // Constant-rate drying time of one droplet (heat-limited):
        const scalar m_water_drop = (PI / 6.0) * d * d * d * rho_L * (1.0 - x_solid_mass);
        const scalar A_drop       = PI * d * d;
        const scalar dHv_kg       = hvapMol(T_wb) / (MW_w / 1000.0);
        const scalar rate_drop    = (dHv_kg > 0.0)
                                  ? h * A_drop * (T_air - T_wb) / dHv_kg : 0.0;
        tau_const = (rate_drop > 0.0) ? m_water_drop / rate_drop : 0.0;     // s
    }

    //  THE LEWIS RELATION IS AN ASSUMPTION, AND IT IS SAID WHEN IT IS FAR
    //  FROM TRUE (2026-10-18, DEV.md 4c C97).  The wet bulb above is solved
    //  with Le = 1, which is close for water in air (Le ~ 0.85) and not for
    //  an organic solvent in nitrogen.  When the package can price both the
    //  gas conductivity and the solvent diffusivity, the film Lewis number
    //  Le = Sc/Pr is computed and, beyond +/-20 % of 1, announced -- the
    //  number moves nothing; the wet bulb (and so the constant-rate drying
    //  time) keeps the Le = 1 construction, and the run says so.
    if (Pr > 0.0 && Sc > 0.0)
    {
        const scalar Le = Sc / Pr;
        if (std::abs(Le - 1.0) > 0.20)
        {
            std::ostringstream m;
            m << "the wet bulb (and the constant-rate drying time) is solved with the"
                 " Lewis relation Le = 1, but this gas and solvent ("
              << (multiSolvent ? "the solvent liquid " + solventNames : solv.name()) << " in " << thermo.comp(iDry).name() << ") have Le = Sc/Pr = "
              << std::fixed << std::setprecision(2) << Le << " at the film ("
              << std::setprecision(1) << T_film << " K): the wet-bulb temperature carries"
                 " that approximation";
            if (AdvisoryLog::instance().add("model", "warning",
                    "sprayDryer '" + (dict->name().empty() ? type() : dict->name()) + "'", m.str())
                && verbosity >= 1)
                std::cout << "  [sprayDryer] " << m.str() << "\n";
        }
    }

    // -------------------------------------------------------------------
    //  PHASE 2 -- residual moisture (GAB equilibrium + Lewis falling rate).
    //  Phase 1 assumed the powder leaves bone-dry; in reality drying stops
    //  at a residual moisture set by the material's sorption isotherm and
    //  the air humidity.  If the solid carries a `sorption { Xm; C; K; Xc; }`
    //  block (material data) we close X_final (kg water / kg dry solid):
    //    - constant-rate period: X falls from X_in to the critical Xc at
    //      Nc = 6 h ΔT / (ΔHvap ρ_L d x_solid)  [kg/kg per s];
    //    - falling-rate period (Lewis): dX/dt = -k (X - Xe), with k tied to
    //      Nc by continuity at Xc:  k = Nc / (Xc - Xe);
    //    - Xe from GAB at the exhaust-air water activity a_w;
    //    - X_final = X(residenceTime), never below Xe.
    // -------------------------------------------------------------------
    const scalar X_in = (x_solid_mass > 0.0) ? (1.0 - x_solid_mass) / x_solid_mass : 0.0;
    scalar X_final = 0.0, X_eq = 0.0, X_cr = 0.0, a_w = 0.0, t_const = 0.0, k_fall = 0.0;
    UnitProfile axialProfile;   // populated when `model distributed` (the chamber profiles)

    scalar v_gas = 0.0, v_particle = 0.0, residence = 0.0;
    // Drying KINETICS (critical moisture Xc + curve) come from the
    // constant/dryingKinetics library, resolved by the Flowsheet into a
    // `dryingCurve` sub-dict --- kept SEPARATE from the equilibrium sorption
    // isotherm on the material.dat (the split: isotherm vs CDC).
    const bool hasDryCurve = dict->found("dryingCurve");
    // Characteristic Drying Curve (Langrish & Kockel 2001): the normalised
    // falling-rate N/Nc = f(Phi), Phi = (X-Xe)/(Xc-Xe), is a MATERIAL property.
    // Choupo models it as a power law f = Phi^p; p = 1 is the linear (Lewis) curve
    // and the default (byte-stable), p > 1 a material that resists the last water,
    // p < 1 one that gives it up quickly -- fit p to the measured drying curve.
    scalar cdcExp = 1.0, reaB = 20.0;
    if (hasDryCurve)
    {
        X_cr   = dict->subDict("dryingCurve")->lookupScalarOrDefault("Xc", 0.0);
        cdcExp = dict->subDict("dryingCurve")->lookupScalarOrDefault("characteristicExponent", 1.0);
        // REA (Chen) activation-energy decay: how fast the relative activation
        // energy ΔEv/ΔEv,∞ rises as the free moisture falls (a MATERIAL parameter,
        // fit to a measured curve).  Only read for `model chen`; the CDC ignores it.
        reaB   = dict->subDict("dryingCurve")->lookupScalarOrDefault("activationDecay", 20.0);
    }
    // The REA (`model chen`) needs no critical moisture Xc -- its rate is smooth;
    // it needs only the sorption isotherm (for X_eq and the bulk water activity).
    bool phase2 = false;
    //  THE KINETICS ARE EVALUATED AT THE EXHAUST THE UNIT PUBLISHES
    //  (2026-09-27).  They read the exhaust twice -- its temperature (the
    //  gas volume, so the residence time; the saturation pressure, so the
    //  water activity) and its humidity (the water activity) -- and they used
    //  to read a hand-balance temperature and the humidity of a phase-1
    //  "everything evaporates" exhaust, "not iterated".  Neither is the state
    //  the Exhaust stream carries, so the moisture the powder keeps was
    //  decided against an air the plant never has.  `dryingAt` takes the
    //  exhaust as an argument, and the energy balance below iterates it to
    //  the state it publishes.
    auto dryingAt = [&](scalar Tex, scalar n_evap_ex)
    {
    X_final = 0.0; X_eq = 0.0; a_w = 0.0; t_const = 0.0; k_fall = 0.0;
    axialProfile = UnitProfile{};
    v_gas = 0.0; v_particle = 0.0; residence = 0.0;
    // Residence time = chamber height / particle fall velocity --- a RESULT
    // of the chamber HARDWARE (D, L), not a free parameter (the credo).  The
    // particle falls at the gas superficial velocity plus its terminal
    // velocity (co-current); counter-current subtracts.
    if (Dch > 0.0 && Lch > 0.0)
    {
        const scalar A_ch  = PI * Dch * Dch / 4.0;                          // m^2
        const scalar Q_gas = F_air * R * (0.5 * (T_air + Tex)) / P_air;     // m^3/s
        v_gas = Q_gas / A_ch;
        v_particle = (flowDir == "counter")
                   ? std::max(1.0e-4, v_t - v_gas) : v_gas + v_t;
        residence = (v_particle > 0.0) ? Lch / v_particle : 0.0;
    }
    phase2 = sol.hasSorption() && hasDryCurve && (X_cr > 0.0 || rea)
           && h > 0.0 && residence > 0.0;
    if (phase2)
    {
        // Water activity the powder sees = relative humidity of the exhaust
        // air it leaves with (the water that actually evaporated).
        const scalar n_w_ex   = F_air * yAir[iSolv] + n_evap_ex;
        const scalar F_ex     = F_air + n_evap_ex;
        const scalar y_w_ex   = (F_ex > 0.0) ? n_w_ex / F_ex : 0.0;
        const scalar Psat_out = thermo.Psat(iSolv, Tex);
        a_w = (Psat_out > 0.0) ? std::min(0.99, y_w_ex * P_air / Psat_out) : 0.0;

        // GAB equilibrium moisture Xe(a_w).
        const scalar Xm = sol.sorpXm(), Cg = sol.sorpC(), Kg = sol.sorpK();
        const scalar Ka = Kg * a_w;
        if (Ka < 1.0 && Xm > 0.0)
            X_eq = Xm * Cg * Ka / ((1.0 - Ka) * (1.0 - Ka + Cg * Ka));
        // X_cr already read from the dryingCurve library (kinetics) above.

        // Constant-rate specific drying rate [kg water / kg dry solid / s].
        const scalar dHv_kg = solv.Hvap_latent(T_wb) / (MW_w / 1000.0);
        const scalar Nc = (dHv_kg > 0.0 && d > 0.0 && rho_L > 0.0 && x_solid_mass > 0.0)
            ? 6.0 * h * (T_air - T_wb) / (dHv_kg * d * rho_L * x_solid_mass) : 0.0;
        k_fall = (X_cr > X_eq && Nc > 0.0) ? Nc / (X_cr - X_eq) : 0.0;

        // Falling-rate moisture after a time `dt` past the critical point, starting
        // from `Xs`, integrating dX/dt = -Nc f(Phi) with the characteristic curve
        // f = Phi^p (Langrish-Kockel).  p = 1 is the Lewis exponential (exact); a
        // general p has the closed-form power-law solution.
        auto fallX = [&](scalar Xs, scalar dt) -> scalar
        {
            if (k_fall <= 0.0 || X_cr <= X_eq) return std::max(Xs, X_eq);
            const scalar Phi0 = std::max(0.0, (Xs - X_eq) / (X_cr - X_eq));
            scalar Phi;
            if (std::abs(cdcExp - 1.0) < 1.0e-9)
                Phi = Phi0 * std::exp(-k_fall * dt);              // linear CDC -> exponential
            else
            {
                const scalar base = std::pow(std::max(1.0e-300, Phi0), 1.0 - cdcExp)
                                  - (1.0 - cdcExp) * k_fall * dt;
                Phi = (base > 0.0) ? std::pow(base, 1.0 / (1.0 - cdcExp)) : 0.0;
            }
            return X_eq + (X_cr - X_eq) * Phi;
        };

        // REACTION ENGINEERING APPROACH (`model chen`; Chen & Xie 1997, Chen 2008).
        // The relative drying rate N/Nc = psi is a SMOOTH function of moisture --
        // no critical-moisture break.  The droplet surface carries a water activity
        // a_w,s = exp(-dEv/(R Tp)); dEv is an apparent activation energy that rises
        // from 0 (free water: surface saturated, a_w,s = 1, psi = 1) to dEv,inf at
        // equilibrium (a_w,s = a_w,bulk, psi = 0).  dEv,inf = -R Tp ln(a_w,bulk).
        // The relative curve dEv/dEv,inf = exp(-reaB (X - X_eq)) is a ONE-parameter
        // reduction of Chen's material characteristic (fit reaB to a measured curve).
        const scalar Rg     = 8.314462;
        const scalar aw_b   = std::min(0.999, std::max(1.0e-3, a_w));   // bulk water activity
        const scalar dEvInf = -Rg * T_wb * std::log(aw_b);             // J/mol, >= 0
        auto reaPsi = [&](scalar X) -> scalar
        {
            const scalar dEv  = dEvInf * std::exp(-reaB * std::max(0.0, X - X_eq));
            const scalar aw_s = std::exp(-dEv / (Rg * T_wb));          // surface water activity
            return std::min(1.0, std::max(0.0, (aw_s - aw_b) / (1.0 - aw_b)));
        };
        // Integrate dX/dt = -Nc psi(X) from Xs over dt (RK4; psi has no closed form).
        auto reaX = [&](scalar Xs, scalar dt) -> scalar
        {
            scalar X = Xs; const int NS = 240; const scalar hstep = dt / NS;
            for (int i = 0; i < NS && X > X_eq; ++i)
            {
                const scalar k1 = -Nc * reaPsi(X);
                const scalar k2 = -Nc * reaPsi(X + 0.5 * hstep * k1);
                const scalar k3 = -Nc * reaPsi(X + 0.5 * hstep * k2);
                const scalar k4 = -Nc * reaPsi(X + hstep * k3);
                X += (hstep / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
            }
            return std::max(X, X_eq);
        };

        if (rea)                                             // REA: one smooth rate, no Xc
            X_final = reaX(X_in, residence);
        else if (X_in > X_cr && Nc > 0.0)
        {
            t_const = (X_in - X_cr) / Nc;
            X_final = (residence <= t_const)
                ? X_in - Nc * residence                              // still constant-rate
                : fallX(X_cr, residence - t_const);                  // falling-rate (CDC)
        }
        else  // already at/below critical -> straight falling-rate from X_in
        {
            const scalar Xstart = std::max(X_in, X_eq);
            X_final = fallX(Xstart, residence);
        }
        X_final = std::max(X_final, X_eq);          // cannot dry below equilibrium

        // -------------------------------------------------------------------
        //  DISTRIBUTED model (`model distributed`): sample the droplet
        //  trajectory ALONG the chamber and report the axial PROFILES a student
        //  asked to SEE.  z = v_particle * t (co-current), t: 0 -> residence.
        //  X(t) is the EXACT piecewise solution the lumped model integrates
        //  (constant-rate linear, falling-rate Lewis exponential), so the
        //  profile's endpoint equals X_final -- the lumped model made visible.
        //  The gas water fraction and T_g interpolate with the drying progress
        //  between the known inlet and outlet states; T_p sits at the wet-bulb in
        //  the constant-rate period then rises toward T_g as the crust forms.
        // -------------------------------------------------------------------
        if (distributed)
        {
            const int NZ = 40;
            const scalar span = std::max(1.0e-9, X_in - X_final);
            for (int j = 0; j <= NZ; ++j)
            {
                const scalar t = (scalar(j) / NZ) * residence;
                scalar Xz;
                if (rea) Xz = reaX(X_in, t);                              // REA: smooth (RK4)
                else if (X_in > X_cr && t <= t_const) Xz = X_in - Nc * t; // constant-rate
                else
                {
                    const scalar t0 = (X_in > X_cr) ? t_const : 0.0;
                    const scalar Xs = (X_in > X_cr) ? X_cr : std::max(X_in, X_eq);
                    Xz = fallX(Xs, t - t0);                               // falling-rate (CDC)
                }
                Xz = std::max(Xz, X_eq);
                const scalar frac = std::min(1.0, std::max(0.0, (X_in - Xz) / span));
                const scalar yw   = yAir[iSolv] + (y_w_ex - yAir[iSolv]) * frac;
                const scalar Tgz  = T_air + (Tex - T_air) * frac;
                // Particle T: at the wet-bulb while the surface is wet, rising toward
                // the gas as it dries.  REA measures "wetness" by psi (1->0); the CDC
                // by the moisture position between Xc and X_eq.
                const scalar wetness = rea
                    ? reaPsi(Xz)
                    : (Xz > X_cr ? 1.0 : (Xz - X_eq) / std::max(1.0e-9, X_cr - X_eq));
                const scalar Tpz = T_wb + (Tgz - T_wb) * (1.0 - std::min(1.0, std::max(0.0, wetness)));
                const scalar dz   = d * std::cbrt((1.0 + Xz) / (1.0 + X_in));
                axialProfile.columns["z_m"].push_back((residence > 0.0) ? (t / residence) * Lch : 0.0);
                axialProfile.columns["t_s"].push_back(t);
                axialProfile.columns["X_moisture"].push_back(Xz);
                axialProfile.columns["d_micron"].push_back(dz * 1.0e6);
                axialProfile.columns["yWater_gas"].push_back(yw);
                axialProfile.columns["T_gas"].push_back(Tgz);
                axialProfile.columns["T_particle"].push_back(Tpz);
            }
            // Mark where the constant-rate period ends (X crosses Xc).
            if (X_in > X_cr && residence > 0.0)
                axialProfile.markers.push_back(
                    { std::min(1.0, t_const / residence) * Lch, "Xc (constant -> falling rate)" });
        }
    }
    };   // dryingAt

    // -------------------------------------------------------------------
    //  THE ENERGY BALANCE, ON THE SURFACE THE STREAMS ARE PRICED ON
    //  (2026-09-27).  Every enthalpy below is `flashState::priceState` (+
    //  `priceSolids` for the crystals): the call the energy report's own rule
    //  is, so the unit and the report cannot part.  The dryer is ADIABATIC and
    //  declares no energy item, so its whole job is
    //      H(powder, T_out) + H(exhaust, T_out) = H(feed) + H(drying air),
    //  and the report's `raw_imbalance_kW` for this unit is the residual of
    //  exactly that equation.
    //
    //  The mass split and the exhaust temperature depend on each other (the
    //  kinetics read the exhaust; the exhaust temperature depends on how much
    //  evaporated), so the two are solved TOGETHER, as one bracketed root in
    //  the evaporation (see below).  The number of evaluations is printed.
    //
    //  ENERGY-LIMITED DRYING keeps its old meaning -- the air cannot cool
    //  below its wet bulb -- but is now decided on the same surface: if even
    //  at T_wb the outlets would carry more enthalpy than came in, the exhaust
    //  leaves at T_wb and the evaporation is what the air can pay for.  The
    //  old code pinned the exhaust at T_wb and evaporated by a DIFFERENT
    //  estimate, which is the same two-surface disagreement in the other
    //  regime.
    // -------------------------------------------------------------------
    const std::string who = "sprayDryer '" + (dict->name().empty() ? type() : dict->name()) + "'";
    //  The inlets' phases: an UNPINNED authored inlet means its own
    //  equilibrium (R-E2), single phase included -- `priceState` keeps the
    //  CARRIED value on a single-phase answer, and the carried default 0
    //  priced undeclared hot air as a liquid (the solidDryer01 gap of
    //  2026-09-27, one unit over; DEV.md C33/C34).  Produced inlets keep
    //  their producer's answer.
    const bool   pinnedFeed = feedDict->lookupScalarOrDefault("phasePinned", 0.0) > 0.5;
    const scalar vfFeed     = flashState::resolvedInletVaporFraction(
        feedDict, T_feed, P_feed, zFeed, thermo, who + " feed");
    const bool   pinnedAir  = airDict->lookupScalarOrDefault("phasePinned", 0.0) > 0.5;
    const scalar vfAir      = !airDict->found("vf") ? 1.0
        : flashState::resolvedInletVaporFraction(airDict, T_air, P_air, yAir,
                                                 thermo, who + " drying air");
    const scalar H_air_in = flashState::priceState(T_air, P_air, yAir, F_air,
        pinnedAir, vfAir, thermo, who + " drying air", nullptr);             // kW
    const scalar H_in = flashState::priceState(T_feed, P_feed, zFeed, F_feed,
        pinnedFeed, vfFeed, thermo, who + " feed", nullptr)
        + flashState::priceSolids(sFeed, T_feed, thermo) + H_air_in;       // kW

    //  What both routes hand on to the outlets and the KPIs.
    scalar n_evap = 0.0, n_water_resid = 0.0, m_water_resid = 0.0;
    int    nPass  = 0;
    //  The several-solvent route publishes the flash's two phases as they
    //  are: the residual LIQUID (kmol/s per component, it rides in the
    //  powder) and the EXHAUST (kmol/s per component).
    sVector liqOut(n, 0.0), exOut(n, 0.0);
    if (multiSolvent)
    {
    //  ------------------------------------------------------------------
    //  SEVERAL SOLVENTS: THE OUTLET IS THE PACKAGE'S EQUILIBRIUM AT T_out
    //  (2026-10-20, DEV.md 4c C111).
    //
    //  No sorption isotherm is allowed here (refused above), so nothing
    //  holds a solvent in the powder except a gas that cannot carry it.
    //  Whether it can is a question about the EXHAUST, and the package
    //  answers it: the air and every solvent the feed brings are flashed
    //  at (T, P_air).  A single vapour phase means everything evaporated
    //  and the exhaust is unsaturated; a split means the air cannot carry
    //  it all -- the vapour IS the exhaust, saturated (at its own dew
    //  point, never a fog), and the liquid is what stays on the powder, at
    //  the composition the package's equilibrium gives it (the more
    //  volatile solvent leaves first, by the package's K-values, never by a
    //  per-component Raoult sum written here).  The temperature closes
    //  H(powder) + H(exhaust) = H(feed) + H(air), every term through
    //  `priceState` on the stream as it is published, so this unit's row
    //  in the energy report is zero by construction (the 2026-09-27 rule).
    //  The equilibrium H is monotone increasing in T (a positive heat
    //  capacity, the latent heat included), so the root is bracketed.
    //  ------------------------------------------------------------------
    sVector nFluid(n, 0.0);                 // kmol/s: the air + every solvent
    for (std::size_t i = 0; i < n; ++i)
        nFluid[i] = F_air * yAir[i] + (isSolvent[i] ? F_feed * zFeed[i] : 0.0);
    scalar Ffl = 0.0; for (auto v : nFluid) Ffl += v;
    sVector zfl(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) zfl[i] = nFluid[i] / Ffl;
    //  The split at T: the liquid from the flash's own x, and the exhaust
    //  by SUBTRACTION from the material, so the two close exactly.
    auto splitAt = [&](scalar T, sVector& liq, sVector& ex) -> void
    {
        std::string deferred;
        auto fs = flashState::equilibriumAt(T, P_air, zfl, false, 1.0, thermo,
                                            who + " exhaust", "model", &deferred);
        if (!fs)
            throw std::runtime_error(who + ": the feed carries several solvents ("
                + solventNames + ") and the package could not resolve the"
                  " equilibrium of the air and the solvents at T = "
                + std::to_string(T) + " K -- which decides how much of each the"
                  " exhaust can carry.  " + deferred);
        if (fs->threePhase || fs->liquidLiquid)
            throw std::runtime_error(who + ": the package resolves the air and the"
                " solvents (" + solventNames + ") at T = " + std::to_string(T)
                + " K into TWO liquids; a powder wetted by two liquid phases is not"
                  " modelled.");
        const scalar vf = flashState::vapourFractionOf(*fs);
        liq.assign(n, 0.0);
        if (vf < 1.0)
            for (std::size_t i = 0; i < n; ++i)
                liq[i] = std::min(nFluid[i], std::max(0.0, (1.0 - vf) * Ffl * fs->x[i]));
        ex.assign(n, 0.0);
        for (std::size_t i = 0; i < n; ++i) ex[i] = nFluid[i] - liq[i];
    };
    auto priceFlows = [&](const sVector& v, scalar T, scalar vfC, const std::string& what) -> scalar
    {
        scalar F = 0.0; for (auto x : v) F += x;
        if (!(F > 0.0)) return 0.0;
        sVector z(n, 0.0);
        for (std::size_t i = 0; i < n; ++i) z[i] = v[i] / F;
        return flashState::priceState(T, P_air, z, F, false, vfC, thermo, who + " " + what, nullptr);
    };
    auto gEq = [&](scalar T) -> scalar                                        // kW
    {
        sVector liq, ex;
        splitAt(T, liq, ex);
        ++nPass;
        return flashState::priceSolids(nSolidOf, T, thermo)
             + priceFlows(liq, T, 0.0, "powder") + priceFlows(ex, T, 1.0, "exhaust")
             - H_in;
    };
    //  The bracket: the hot end is the air's own temperature (the solvents
    //  evaporated and heated to it cost more than the air brought), the cold
    //  end is searched downward from the wet bulb until the outlets carry
    //  less enthalpy than came in.
    scalar Thi = std::max(T_air, T_feed);
    scalar Tlo = std::min(T_wb, T_feed);
    while (gEq(Tlo) > 0.0)
    {
        Tlo -= 10.0;
        if (Tlo < 150.0)
            throw std::runtime_error(who + ": no exhaust temperature above 150 K"
                " closes the adiabatic balance of the air and the solvents ("
                + solventNames + ").");
    }
    if (gEq(Thi) < 0.0)
        throw std::runtime_error(who + ": the outlets at the air inlet temperature"
            " carry less enthalpy than came in; the adiabatic balance has no root"
            " in [" + std::to_string(Tlo) + ", " + std::to_string(Thi) + "] K.");
    {
        //  Illinois on g(T): bracketed, cannot cycle; the flash's switch
        //  from one phase to two is continuous in H, not smooth, so no
        //  derivative is taken across it.
        scalar a = Tlo, b = Thi, ga = gEq(a), gb = gEq(b);
        int side = 0;
        for (int it = 0; it < 300 && (b - a) > 1.0e-10; ++it)
        {
            scalar c = (ga != gb) ? (a * gb - b * ga) / (gb - ga) : 0.5 * (a + b);
            if (!(c > a && c < b)) c = 0.5 * (a + b);
            const scalar gc = gEq(c);
            if (std::abs(gc) <= 1.0e-9) { a = b = c; break; }       // kW -- a microwatt
            if (gc > 0.0) { b = c; gb = gc; if (side == -1) ga *= 0.5; side = -1; }
            else          { a = c; ga = gc; if (side == +1) gb *= 0.5; side = +1; }
        }
        T_out = 0.5 * (a + b);
        const scalar gF = gEq(T_out);
        if (!(std::abs(gF) <= 1.0e-6))
            throw std::runtime_error(who + ": the adiabatic balance of the air and"
                " the solvents did not close (residual " + std::to_string(gF)
                + " kW at T_out = " + std::to_string(T_out) + " K).");
    }
    splitAt(T_out, liqOut, exOut);
    for (auto i : solvents)
    {
        n_water_resid += liqOut[i];
        m_water_resid += liqOut[i] * thermo.comp(i).MW();
    }
    n_evap = n_solv_feed - n_water_resid;
    energy_limited = (n_water_resid > 0.0);
    if (energy_limited)
    {
        //  THE AIR CANNOT CARRY EVERY SOLVENT, and the run says so: what
        //  stays, of which solvent, and that the exhaust leaves saturated.
        std::ostringstream m;
        m << "the drying gas cannot carry every solvent the feed brings: the exhaust"
             " leaves SATURATED at T_out = " << std::fixed << std::setprecision(2) << T_out
          << " K (the package's flash of the air and the solvents splits there), and"
             " the liquid in equilibrium with it stays on the powder --";
        for (auto i : solvents)
            m << " " << thermo.comp(i).name() << " " << std::setprecision(4)
              << (liqOut[i] * thermo.comp(i).MW() * 3600.0) << " kg/h of "
              << (F_feed * zFeed[i] * thermo.comp(i).MW() * 3600.0) << ";";
        m << " more air, a hotter air, or a drier air dries the powder";
        AdvisoryLog::instance().add("drying", "warning", who, m.str());
        if (verbosity >= 1) std::cout << "  [drying] " << m.str() << "\n";
    }
    //  The kinetics' own KPIs (velocities, residence time) at the exhaust the
    //  unit publishes; no isotherm, so no residual moisture comes from them.
    dryingAt(T_out, n_evap);
    }
    else
    {
    //  The two outlets, exactly as they are published below (unpinned: this
    //  unit pins nothing), for an evaporation `nev` and a temperature `T`.
    const sVector sPowder = nSolidOf;     // every solid of the feed (one term for one solid)
    sVector zWater(n, 0.0);  zWater[iSolv] = 1.0;
    auto exhaustFlows = [&](scalar nev)
    {
        sVector v(n, 0.0);
        for (std::size_t i = 0; i < n; ++i) v[i] = F_air * yAir[i];
        v[iSolv] += nev;
        return v;
    };
    auto H_out = [&](scalar T, scalar nev) -> scalar                      // kW
    {
        const scalar nres = std::max(0.0, n_solv_feed - nev);
        scalar H = flashState::priceSolids(sPowder, T, thermo);
        if (nres > 0.0)
            H += flashState::priceState(T, P_air, zWater, nres, false, 0.0,
                                        thermo, who + " powder", nullptr);
        const sVector v = exhaustFlows(nev);
        scalar Fex = 0.0; for (auto x : v) Fex += x;
        sVector zex(n, 0.0);
        if (Fex > 0.0) for (std::size_t i = 0; i < n; ++i) zex[i] = v[i] / Fex;
        H += flashState::priceState(T, P_air, zex, Fex, false, 1.0,
                                    thermo, who + " exhaust", nullptr);
        return H;
    };
    //  T_out for a given evaporation: H_out is monotone increasing in T.
    auto solveT = [&](scalar nev) -> scalar
    {
        auto g  = [&](scalar T) { return H_out(T, nev) - H_in; };
        auto dg = [&](scalar T) { const scalar dT = 1.0e-3;
                                  return (g(T + dT) - g(T - dT)) / (2.0 * dT); };
        solver::NROptions o;
        o.tolerance = 1.0e-9;                 // kW -- a microwatt
        o.maxIter   = 200;
        o.lower     = T_wb;
        o.upper     = T_air;
        o.bracket   = true;
        o.monotoneIncreasing = true;
        auto r = solver::newton1D(g, dg, std::clamp(T_out, T_wb, T_air), o);
        if (!r.converged)
            throw std::runtime_error(who + ": the adiabatic energy balance"
                " H(out) = H(in) did not converge for T_out in [T_wb, T_air]"
                " (residual " + std::to_string(r.residual) + " kW).");
        return r.x;
    };
    //  Evaporation the air can pay for with the exhaust at T_wb: H_out is
    //  monotone increasing in `nev` (vapour costs more than liquid).
    auto solveEvapAtWetBulb = [&](scalar nevMax) -> scalar
    {
        scalar lo = 0.0, hi = nevMax;
        for (int k = 0; k < 200 && (hi - lo) > 1.0e-15 * std::max(1.0, nevMax); ++k)
        {
            const scalar m = 0.5 * (lo + hi);
            if (H_out(T_wb, m) - H_in > 0.0) hi = m; else lo = m;
        }
        return 0.5 * (lo + hi);
    };

    //  THE UNKNOWN IS THE EVAPORATION, AND THE ROOT IS BRACKETED.  For an
    //  evaporation `nev` the energy balance fixes the exhaust temperature
    //  T(nev) (falling as nev rises), and the kinetics, run at that exhaust,
    //  return the evaporation they would release, nevKin(nev).  More
    //  evaporation means a cooler, wetter exhaust, a higher water activity
    //  and a powder that keeps more water, so R(nev) = nevKin - nev falls
    //  strictly: R(0) >= 0 and R at the energy cap <= 0 unless drying is
    //  ENERGY-LIMITED.  A plain successive substitution was tried first and
    //  cycled with period two on `sugarPlantEconomicsSweep` (exhaust 318 K /
    //  410 K, water activity 0 / 0.99), because near saturation the GAB
    //  isotherm makes the kinetics far steeper than the energy balance; a
    //  bracketed root cannot cycle.
    scalar n_resid_kinetic = 0.0;
    auto nevKin = [&](scalar T, scalar nev) -> scalar
    {
        dryingAt(T, nev);
        // Residual moisture the KINETICS leave in the powder, capped at the
        // water the feed brought (see the cap below).
        n_resid_kinetic = X_final * m_solid / MW_w;                        // kmol/s
        return std::max(0.0, n_solv_feed - std::min(n_solv_feed, n_resid_kinetic));
    };
    //  The energy cap: the most the air can evaporate with the exhaust at T_wb.
    const scalar nevCap = (H_out(T_wb, n_solv_feed) - H_in > 0.0)
                        ? solveEvapAtWetBulb(n_solv_feed) : n_solv_feed;
    auto Tof = [&](scalar nev) -> scalar
    {
        return (H_out(T_wb, nev) - H_in >= 0.0) ? T_wb : solveT(nev);
    };
    n_evap = nevCap;
    const scalar Rcap = nevKin(Tof(nevCap), nevCap) - nevCap;  ++nPass;
    if (Rcap >= 0.0)
    {
        //  The kinetics would release at least what the air can pay for.
        energy_limited = (nevCap < n_solv_feed * (1.0 - 1.0e-12));
        T_out  = Tof(nevCap);
        n_evap = nevCap;
    }
    else
    {
        //  Illinois (regula falsi with a bisection guard) on R(nev) over
        //  [0, nevCap]; R(0) >= 0 because the kinetics never return a
        //  negative evaporation.
        scalar a = 0.0, b = nevCap;
        scalar Ra = nevKin(Tof(0.0), 0.0);  ++nPass;
        scalar Rb = Rcap;
        int side = 0;
        const scalar tolN = 1.0e-13 * std::max(1.0e-30, n_solv_feed);
        if (Ra <= 0.0) { b = 0.0; Rb = Ra; }                 // root at the lower end
        while (std::abs(b - a) > tolN && nPass < 400)
        {
            scalar c = (Ra != Rb) ? (a * Rb - b * Ra) / (Rb - Ra) : 0.5 * (a + b);
            if (!(c > std::min(a, b) && c < std::max(a, b))) c = 0.5 * (a + b);
            const scalar Rc = nevKin(Tof(c), c) - c;  ++nPass;
            if (Rc == 0.0) { a = b = c; break; }
            if (Rc > 0.0) { a = c; Ra = Rc; if (side == +1) Rb *= 0.5; side = +1; }
            else          { b = c; Rb = Rc; if (side == -1) Ra *= 0.5; side = -1; }
        }
        if (std::abs(b - a) > tolN)
            throw std::runtime_error(who + ": the evaporation that satisfies"
                " both the drying kinetics and the adiabatic energy balance was"
                " not located in 400 evaluations.");
        n_evap = 0.5 * (a + b);
        T_out  = Tof(n_evap);
        energy_limited = false;
    }
    //  The kinetics' own KPIs at the state the unit publishes.
    (void) nevKin(T_out, n_evap);
    n_water_resid = n_solv_feed - n_evap;                                  // kmol/s

    //  A DRYER CANNOT END WETTER THAN IT STARTED.  Both residual routes above
    //  are MODEL quantities: the kinetic one is `X_final * m_solid`, a moisture
    //  RATIO carried by the dry solid, and nothing in it knows how much water
    //  the feed actually brought.  Fed a stream that is already drier than the
    //  model's equilibrium moisture at the declared water activity, it asks the
    //  powder to hold more water than exists -- and the line below used to
    //  clamp only the EVAPORATION at zero, so the surplus was silently emitted
    //  as powder moisture.  The unit created matter, reported
    //  `water_evaporated 0`, and exited 0.
    //
    //  Measured when this was found (Vitor, on the live site, 2026-09-04):
    //  the flagship sugar plant's spray dryer took 685 kg/h of water in and
    //  put 3633 kg/h out, a 22.46 % unit closure and 2948 kg/h of water from
    //  nowhere -- the whole of that plant's 13.4 % boundary violation, in one
    //  unit, on a case whose reports were switched off by its outer driver.
    //
    //  The cap is NOT silent.  A model asked for a state its inputs cannot
    //  supply is a model outside its domain, and this project announces that
    //  rather than quietly amending it (the posture of the extrapolated
    //  Antoine and the out-of-band Davies).  The answer is the physical one --
    //  the powder keeps the water it was given and nothing evaporates -- and
    //  the reader is told the equilibrium the model wanted.
    if (n_resid_kinetic > n_solv_feed * (1.0 + 1.0e-9))
    {
        std::ostringstream msg;
        msg << "the drying model asks the powder to hold "
            << std::fixed << std::setprecision(4)
            << (n_resid_kinetic * MW_w * 3600.0) << " kg/h of moisture, but the"
               " feed carries only " << (n_solv_feed * MW_w * 3600.0)
            << " kg/h.  The feed is ALREADY drier than this model's"
               " equilibrium moisture at the declared water activity, so there"
               " is nothing to evaporate: the powder leaves with the water it"
               " arrived with and `water_evaporated` is 0.  A dryer cannot end"
               " wetter than it started -- the residual is held at the feed"
               " water rather than made up, and the drying kinetics are"
               " reporting outside their domain for this feed.";
        AdvisoryLog::instance().add(
            "drying", "warning",
            "sprayDryer '" + dict->lookupWordOrDefault("name", "sprayDryer") + "'",
            msg.str());
        if (verbosity >= 1)
            std::cout << "  [drying] " << msg.str() << "\n";
    }
    m_water_resid = n_water_resid * MW_w;                    // kg/s held in the powder
    }   // one solvent
    //  The heat the drying air gives up, on the package's surface: the air
    //  as it came in, minus the same air at the exhaust temperature.  It is
    //  what the droplets receive -- exactly the enthalpy rise of the feed
    //  side, by the balance above -- and NOT an energy item: the dryer is
    //  adiabatic and the report must not count it at the boundary.
    const scalar Q = 1000.0 * (H_air_in - flashState::priceState(T_out, P_air,
        yAir, F_air, false, 1.0, thermo, who + " drying air", nullptr));    // W

    // -------------------------------------------------------------------
    //  Particle-size distribution.  Atomisation produces a SPREAD of
    //  droplet sizes, not a single d32; the powder inherits it (each
    //  droplet shrinks by the same factor).  Rosin-Rammler cumulative
    //  mass-below-d:  Q(d) = 1 - exp(-(d/d')^n),  d' ~ d_part
    //  (characteristic size), n = spread (calibratable -> FitParameters).
    // -------------------------------------------------------------------
    const int NB = 15;
    std::vector<scalar> dCen, mf, cum;
    {
        const scalar dLo = 0.2 * d_part, dHi = 3.2 * d_part;
        auto Q = [&](scalar dd){ return (d_part > 0.0)
            ? 1.0 - std::exp(-std::pow(dd / d_part, nRR)) : 0.0; };
        scalar mfSum = 0.0;
        for (int k = 0; k < NB; ++k)
        {
            const scalar a = dLo * std::pow(dHi / dLo, scalar(k)     / NB);
            const scalar b = dLo * std::pow(dHi / dLo, scalar(k + 1) / NB);
            dCen.push_back(std::sqrt(a * b));
            mf.push_back(Q(b) - Q(a));
            mfSum += mf.back();
        }
        if (mfSum > 0.0) for (auto& w : mf) w /= mfSum;       // normalise (tails clipped)
        scalar c = 0.0; for (auto w : mf) { c += w; cum.push_back(c); }
    }
    auto pctile = [&](scalar p) -> scalar
    {
        for (std::size_t k = 0; k < cum.size(); ++k)
            if (cum[k] >= p)
            {
                if (k == 0) return dCen.front();
                const scalar f = (p - cum[k - 1]) / std::max(1.0e-12, cum[k] - cum[k - 1]);
                return dCen[k - 1] + f * (dCen[k] - dCen[k - 1]);
            }
        return dCen.empty() ? d_part : dCen.back();
    };
    const scalar d10 = pctile(0.10), d50 = pctile(0.50), d90 = pctile(0.90);

    // -------------------------------------------------------------------
    //  Outlet streams.
    // -------------------------------------------------------------------
    produced_.clear();

    ProcessStream powder;
    powder.name = "powder";
    // The powder carries its dry solid in s[] AND the residual moisture as
    // bound liquid water in the fluid flow F (vf = 0): mass closes because
    // feed water = evaporated (exhaust) + residual (here).
    powder.T = T_out; powder.P = P_air; powder.vf = 0.0;
    powder.F = n_water_resid;
    powder.z.assign(n, 0.0);
    if (n_water_resid > 0.0) powder.z[iSolv] = 1.0;
    if (multiSolvent)                    // the flash's liquid, as it is (C111)
    {
        scalar FL = 0.0; for (auto v : liqOut) FL += v;
        powder.F = FL;
        powder.z.assign(n, 0.0);
        if (FL > 0.0) for (std::size_t i = 0; i < n; ++i) powder.z[i] = liqOut[i] / FL;
    }
    powder.s = nSolidOf;                 // every solid of the feed
    powder.psd.diameter = dCen;          // Rosin-Rammler spread, not a single d32
    powder.psd.massFrac = mf;
    produced_.push_back(powder);

    ProcessStream exhaust;
    exhaust.name = "exhaustAir";
    exhaust.T = T_out; exhaust.P = P_air; exhaust.vf = 1.0;
    sVector nout(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) nout[i] = F_air * yAir[i];
    nout[iSolv] += n_evap;             // only the EVAPORATED water (phase 2: not all of it)
    if (multiSolvent) nout = exOut;    // the flash's vapour, by subtraction (C111)
    scalar Fout = 0.0; for (auto v : nout) Fout += v;
    exhaust.F = Fout; exhaust.z.assign(n, 0.0);
    if (Fout > 0.0) for (std::size_t i = 0; i < n; ++i) exhaust.z[i] = nout[i] / Fout;
    produced_.push_back(exhaust);

    // -------------------------------------------------------------------
    //  KPIs.
    // -------------------------------------------------------------------
    const scalar eta_th = (T_air - T_wb > 1.0e-6) ? (T_air - T_out) / (T_air - T_wb) : 0.0;
    kpis_.clear();
    kpis_["T_out"]            = T_out;            // K  (exhaust air)
    kpis_["T_wetbulb"]        = T_wb;             // K  (droplet surface)
    kpis_["water_evaporated"] = n_evap * MW_w;    // kg/s (feed water minus residual)
    kpis_["water_residual"]   = m_water_resid;    // kg/s held in the powder
    kpis_["powder_flow"]      = m_solid + m_water_resid;   // kg/s (dry solid + moisture)
    kpis_["powder_dry"]       = m_solid;          // kg/s dry solid only
    kpis_["d_droplet"]        = d32;              // m
    kpis_["d_droplet_micron"] = d32 * 1.0e6;
    kpis_["d_particle"]       = d_part;           // m
    kpis_["d_particle_micron"]= d_part * 1.0e6;
    kpis_["solidMassFraction"]= x_solid_mass;
    kpis_["v_terminal"]       = v_t;              // m/s
    kpis_["Re"]               = Re;
    kpis_["Pr"]               = Pr;
    kpis_["Sc"]               = Sc;
    kpis_["Nu"]               = Nu;
    kpis_["Sh"]               = Sh;
    kpis_["h"]                = h;                // W/(m^2·K)
    kpis_["k_c"]              = kc;               // m/s
    kpis_["tau_dry_constant"] = tau_const;        // s
    kpis_["duty"]             = Q;                // W (heat the air gives up, package surface)
    kpis_["thermalEfficiency"]= eta_th;           // adiabatic-saturation efficiency
    kpis_["rho_liquid"]       = rho_L;
    kpis_["rho_gas"]          = rho_g;
    kpis_["d10_micron"]       = d10 * 1.0e6;      // 10 % undersize
    kpis_["d50_micron"]       = d50 * 1.0e6;      // median
    kpis_["d90_micron"]       = d90 * 1.0e6;      // 90 % undersize
    kpis_["span"]             = (d50 > 0.0) ? (d90 - d10) / d50 : 0.0;  // distribution width
    // Phase-2 moisture (kg water / kg dry solid unless noted):
    kpis_["X_initial"]        = X_in;
    kpis_["X_critical"]       = X_cr;
    kpis_["X_equilibrium"]    = X_eq;
    kpis_["X_final"]          = X_final;
    kpis_["moisture_pct_wb"]  = 100.0 * X_final / (1.0 + X_final);   // wet-basis %
    kpis_["water_activity"]   = a_w;
    kpis_["residenceTime"]    = residence;        // s  (RESULT of chamber geometry)
    kpis_["t_constant_rate"]  = t_const;
    kpis_["chamberDiameter"]  = Dch;              // m  (HARDWARE)
    kpis_["chamberHeight"]    = Lch;              // m  (HARDWARE)
    kpis_["v_gas"]            = v_gas;            // m/s superficial gas velocity
    kpis_["v_particle"]       = v_particle;       // m/s particle fall velocity
    kpis_["wheelSpeed"]       = atomDict->lookupScalarOrDefault("wheelSpeed", 0.0);  // rpm (rotary; 0 otherwise)
    kpis_["atomiserPower"]    = drop.power;       // W  shaft estimate (see the atomiser note for the split)
    if (multiSolvent)
    {
        //  SEVERAL SOLVENTS (C111): `water_evaporated` keeps its key -- the
        //  sizer reads it as the evaporation duty -- and holds EVERY solvent
        //  evaporated, by mass; each solvent is published on its own too.
        scalar mEv = 0.0, mLiq = 0.0;
        for (std::size_t i = 0; i < n; ++i) mLiq += liqOut[i] * thermo.comp(i).MW();
        for (auto i : solvents)
        {
            const scalar fed = F_feed * zFeed[i] * thermo.comp(i).MW();
            const scalar res = liqOut[i] * thermo.comp(i).MW();
            mEv += fed - res;
            kpis_["evaporated_" + thermo.comp(i).name()] = fed - res;   // kg/s
            kpis_["residual_"   + thermo.comp(i).name()] = res;         // kg/s
        }
        kpis_["water_evaporated"] = mEv;              // kg/s, every solvent
        kpis_["water_residual"]   = mLiq;             // kg/s, the liquid on the powder
        kpis_["powder_flow"]      = m_solid + mLiq;
        kpis_["solventsInFeed"]   = scalar(solvents.size());
        kpis_["exhaustSaturated"] = energy_limited ? 1.0 : 0.0;
    }

    // -------------------------------------------------------------------
    //  Profile: the powder PSD (mass fraction vs particle diameter) for
    //  the GUI's ProfilePlot (log diameter axis, like the cyclone).
    // -------------------------------------------------------------------
    UnitProfile prof;
    prof.xAxis = "diameter_micron";
    std::vector<scalar> dmic; dmic.reserve(dCen.size());
    for (auto dd : dCen) dmic.push_back(dd * 1.0e6);
    prof.columns["diameter_micron"] = dmic;
    prof.columns["massFrac"]        = mf;
    // `model distributed` reports the AXIAL chamber profiles (the trajectory);
    // `model lumped` (default) the outlet particle-size distribution.
    if (distributed && !axialProfile.columns.empty())
    {
        axialProfile.xAxis = "z_m";
        profile_ = axialProfile;
    }
    else
        profile_ = prof;

    // -------------------------------------------------------------------
    //  Report.
    // -------------------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n=========================  Spray Dryer Result  ===================\n"
                  << "  Atomiser:  " << atomiser->name() << "  --  " << drop.note << "\n"
                  << "  Air in:  " << std::setprecision(1) << T_air << " K ("
                  << (T_air - 273.15) << " °C),  " << std::scientific << std::setprecision(3)
                  << (F_air * 1000.0) << " mol/s\n"
                  << "  Feed:    " << std::fixed << std::setprecision(1) << T_feed << " K, "
                  << std::scientific << std::setprecision(3) << (m_feed) << " kg/s, "
                  << std::fixed << std::setprecision(1) << (100.0 * x_solid_mass) << " wt% solid\n"
                  << "  ----  mass + energy  ----\n"
                  << "  Water evaporated = " << std::scientific << std::setprecision(3)
                  << kpis_["water_evaporated"] << " kg/s   Powder (dry) = " << m_solid << " kg/s\n"
                  << "  Droplet wet-bulb T_wb = " << std::fixed << std::setprecision(1)
                  << T_wb << " K (" << (T_wb - 273.15) << " °C)\n"
                  << "  Exhaust air  T_out   = " << std::setprecision(1) << T_out
                  << " K (" << (T_out - 273.15) << " °C),  η_th = "
                  << std::setprecision(2) << eta_th << "\n"
                  << "  Energy: H(out) = H(in) on the package's enthalpy surface ("
                  << nPass << (multiSolvent ? " flash evaluations" : " kinetics evaluations") << "; hand-balance seed "
                  << std::setprecision(1) << T_out_seed << " K)"
                  << (energy_limited ? (multiSolvent ? "  -- the exhaust leaves SATURATED (the air cannot carry every solvent)"
                                                     : "  -- ENERGY-LIMITED: exhaust at the wet bulb") : "")
                  << "\n"
                  << "  ----  atomisation (Friedman)  ----\n"
                  << "  Surface tension sigma = " << std::scientific << std::setprecision(4)
                  << sigma << " N/m  [" << sigmaSource << "]\n"
                  << std::fixed
                  << "  Droplet d32 = " << std::setprecision(1) << (d32 * 1.0e6)
                  << " µm  ->  particle d_p = " << (d_part * 1.0e6) << " µm\n"
                  << "  Powder PSD (Rosin-Rammler, n = " << std::setprecision(1) << nRR
                  << "):  d10 = " << (d10 * 1.0e6) << "  d50 = " << (d50 * 1.0e6)
                  << "  d90 = " << (d90 * 1.0e6) << " µm  (span = "
                  << std::setprecision(2) << ((d50 > 0.0) ? (d90 - d10) / d50 : 0.0) << ")\n"
                  << "  ----  drying kinetics (Ranz-Marshall)  ----\n";
        if (mu_g > 0.0)
            std::cout << "  v_t = " << std::setprecision(3) << v_t << " m/s,  Re = "
                      << std::setprecision(2) << Re << ",  Pr = " << Pr << ",  Sc = " << Sc << "\n"
                      << "  Nu = " << Nu << " -> h = " << std::setprecision(1) << h
                      << " W/(m²·K);  Sh = " << std::setprecision(2) << Sh
                      << " -> k_c = " << std::scientific << std::setprecision(3) << kc << " m/s\n"
                      << "  Constant-rate time to evaporate ALL droplet water, tau_const = " << std::fixed << std::setprecision(4)
                      << tau_const << " s\n";
        else
            std::cout << "  (no transport block -> drying coefficients not computed;"
                         " add transport { thermalConductivity{} diffusivity{} })\n";
        if (Dch > 0.0 && Lch > 0.0)
            std::cout << "  ----  chamber (HARDWARE) -> residence time  ----\n"
                      << "  D_chamber = " << std::fixed << std::setprecision(2) << Dch
                      << " m,  L_chamber = " << Lch << " m,  " << flowDir << "-current\n"
                      << "  v_gas = " << std::setprecision(3) << v_gas << " m/s + v_terminal = "
                      << v_t << " m/s  ->  residence = " << std::setprecision(2)
                      << residence << " s\n";
        if (phase2)
            std::cout << "  ----  residual moisture (GAB + Lewis falling rate)  ----\n"
                      << "  X_in = " << std::fixed << std::setprecision(3) << X_in
                      << "  ->  X_crit = " << X_cr << "  ->  X_eq(a_w=" << std::setprecision(3)
                      << a_w << ") = " << X_eq << " kg/kg\n"
                      << "  Residence " << std::setprecision(2) << residence
                      << " s (constant-rate period ENDS -- X reaches X_crit, falling rate takes over -- at " << std::setprecision(3) << t_const
                      << " s)  ->  X_final = " << X_final << " kg/kg  ("
                      << std::setprecision(2) << (100.0 * X_final / (1.0 + X_final))
                      << " wt% wet basis)\n"
                      << "  Powder = " << std::scientific << std::setprecision(3)
                      << (m_solid + m_water_resid) << " kg/s  (" << m_solid << " dry + "
                      << m_water_resid << " moisture)\n";
        else
            std::cout << "  (no `sorption {}` block on the solid -> phase-1 dry powder)\n";
        std::cout << "==================================================================\n\n";
    }

    return rwb.converged ? 0 : 1;
}

} // namespace Choupo
