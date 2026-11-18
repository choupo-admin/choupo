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
Namespace
    Choupo::rheology

Description
    A LIQUID'S FLOW CURVE, MEASURED (DEV.md 4c C421 (7), form 3 of the
    property door; docs/design/measured-facts-materials-and-flow-curves.md,
    sections 2-4, rules R1-R10).

    The property dictionary declares, in the liquid's own block and
    Newtonian by absence,

        transport { liquid { rheology { measured
        {
            <name>
            {
                use            method;
                interpolation  logLog;          // | linear: tau(gamma) between the rows
                reason         "...";
                fit            { model powerLaw; }   // optional DERIVED view (R1)
            }
        } } } }

    and the data in constant/experiments/<name>.dat, an experiment record of
    kind FLOW CURVE:

        provenance { citation "..."; kind measured | adopted | estimated; basis "..."; }
        property   flowCurve;
        system     ( <components> );   solvent <c>;      // the set the curve describes
        conditions
        {
            instrument  capillary;                 // REQUIRED (R8)
            corrected   ( RabinowitschMooney endEffects slipChecked laminarOnly );
            T           298.15 K;                  // the state the sample was held at
            w           { <component> <mass fraction>; ... }   // the solvent is the rest
            viscoelastic yes|no;  timeDependent yes|no;        // optional, refusal inputs (R9)
        }
        yieldStress { value 38.2 Pa; how "vane, eq. 2.53, p. 95"; }   // optional DATUM (R8)
        columns ( { name gamma; unit 1/s; } { name tau; unit Pa; } );  // two of gamma | tau | mu
        data ( ... );
        authorised { gamma (lo hi); T (lo hi); w[<c>] (lo hi); reason "..."; }  // only when wider

    WHAT THE ENGINE DOES WITH IT.
      R1  The rows are the fact.  A `fit { model powerLaw | Bingham |
          HerschelBulkley; }` is a derived view: fitted at load by least
          squares (powerLaw and HerschelBulkley on ln tau against ln gamma,
          Bingham on tau through the yield stress), the parameters, the
          residual of every row and the range fitted are PRINTED, nothing is
          stored.  Bingham and HerschelBulkley take the yield stress from the
          record's DATUM and never fit it (R8; Chhabra & Richardson, p. 23 and
          p. 36: the fitted yield stress is an operational parameter that
          differs by model).
      R2  The SUPPORT is the rows' span in shear rate; the AUTHORISED domain
          is the case-record's `authorised { gamma }` (default: the support).
          Inside the support the declared interpolation; between support and
          authorised the CHORD OF THE END SEGMENT (log-log), the largest
          excursion announced; outside the authorised domain, and outside the
          T and composition box, a typed refusal (the book, p. 36:
          "extrapolation should be avoided").
      R8  A record that does not declare its instrument and the corrections
          that instrument's raw readings need before they are a flow curve
          (Rabinowitsch-Mooney, Bagley end effects, wall slip, laminar-only for
          a capillary, p. 57-75; wide-gap shear rate, p. 79-80; ...) is
          refused as a flow curve, naming the correction missing.  A record
          that merely tabulates a constitutive equation (`instrument model`)
          must say `kind adopted` or `estimated`: it is not a measurement.
          The shear stress must RISE with the shear rate (a falling branch is
          slip, thixotropy or an instrument artefact, not a flow curve).
      R9  `timeDependent yes` is refused wherever the curve is asked: the book
          states no general law for it (p. 22).  `viscoelastic yes` is refused
          by the agitation power (p. 397).

    The shear is THE CALLER'S: a rate or a stress, from its own geometry.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <map>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

class Component;

namespace rheology {

//  The one-line summary of a derived fit (R1): printed, never stored.
struct Fit
{
    std::string model;                // powerLaw | Bingham | HerschelBulkley
    scalar m = 0.0, n = 1.0;          // Pa s^n, -   (powerLaw, HerschelBulkley)
    scalar tau0 = 0.0;                // Pa: the record's DATUM (Bingham, HerschelBulkley)
    scalar muB = 0.0;                 // Pa s (Bingham)
    std::vector<scalar> residual;     // (tau_fit / tau_row - 1) per row
    scalar rms = 0.0;                 // root mean square of the residuals
    scalar gammaLo = 0.0, gammaHi = 0.0;   // the range fitted
    std::string words;                // "powerLaw: tau = m gamma^n, m = ..."
};

//  What a flow-curve evaluation found: where the point lies in the three
//  domains of R2.
struct Status
{
    bool        insideSupport = true;
    bool        extended = false;        // between support and authorised: the end chord
    std::string words;                   // "inside the rows (...)" | "past the support ... chord"
};

class FlowCurve
{
public:
    //  ---- the declaration and the record, as read ----
    std::string name, use, reason, citation, where, basis, kind, instrument, interpolation;
    std::vector<std::string> corrected;
    bool viscoelastic = false, timeDependent = false;
    std::vector<std::size_t> set;                    // package indices, ascending
    std::string solvent;
    scalar T = 0.0;                                  // K: the state the curve was taken at
    std::map<std::string, scalar> w;                 // stated mass fractions (solvent = the rest)
    std::pair<scalar, scalar> boxT{0, 0};
    std::map<std::string, std::pair<scalar, scalar>> boxW;
    std::vector<scalar> gamma, tau;                  // the rows, ascending in shear rate, SI
    bool   hasYield = false;
    scalar yield = 0.0;                              // Pa
    std::string yieldHow;
    scalar gammaLoAuth = 0.0, gammaHiAuth = 0.0;     // the authorised domain, 1/s
    std::optional<Fit> fit;
    std::string fitModel;                            // what the case asked ("" = the rows)

    //  Shear stress at a shear rate: the rows (or the derived fit), the chord
    //  between support and authorised, a PropertyDomainError beyond.
    scalar stressAt(scalar g, Status* st = nullptr) const;
    //  The same without the domain check (the pipe's integral needs the curve
    //  from zero stress: it states what part came from below the support).
    scalar stressUnchecked(scalar g) const;
    //  Shear rate at a shear stress above the yield stress (0 at or below it),
    //  by the rows' inverse, the chord of the end segment outside them.  No
    //  domain check: the caller refuses on the rate it ends up with
    //  (`admitRate`).
    scalar rateAt(scalar stress) const;
    //  Refuse a rate outside the authorised domain (typed), or report where it lies.
    Status admitRate(scalar g, const std::string& asker) const;
    //  Refuse a state (T, mass fractions) outside the box; "" when inside.
    std::string outsideBox(scalar Tstate, const std::map<std::string, scalar>& wstate) const;
    //  True at the stated point (T and every mass fraction), false in the box away from it.
    bool atStatedPoint(scalar Tstate, const std::map<std::string, scalar>& wstate) const;
    //  Apparent viscosity tau / gamma at a rate (domain-checked).
    scalar apparentViscosityAt(scalar g, Status* st = nullptr) const;
    //  d ln tau / d ln gamma at a rate (central, in the curve's own variables).
    scalar index(scalar g) const;
    //  The largest d ln tau / d ln gamma on [g, gammaHiAuth] (shear-thickening test).
    scalar maxIndexAbove(scalar g) const;
    //  The lowest shear rate the rows (or the authorised domain) reach, and the highest.
    scalar supportLo() const { return gamma.front(); }
    scalar supportHi() const { return gamma.back(); }
    std::string describe() const;                    // one line for the tables

    //  Said once per record and run, restated at the end of the run: a rate taken
    //  between support and authorised domain.
    void announceExtension(scalar g, const std::string& asker) const;
};

//  Reads `transport.liquid.rheology.measured {}` (the flat block `liquidRheology`
//  of the package's transport dictionary); empty when absent.  `comps` are the
//  package's components.
std::vector<FlowCurve> readFlowCurves(const DictPtr& transportBlock,
                                      const std::vector<Component>& comps);

//  A liquid that declares a flow curve has no ONE viscosity: the Newtonian
//  question (`viscosityLiquid`, door form 1) is refused by name, with the line to
//  ask instead.  Throws PropertyDomainError(missingDatum).
[[noreturn]] void refuseNewtonianAsk(const FlowCurve& c, const std::vector<Component>& comps, const sVector& x);

//  The correction words an instrument's raw readings need, with the book's pages.
//  (For the refusal and for the guide.)
struct CorrectionRule { std::string instrument; std::vector<std::pair<std::string, std::string>> required; };
const std::vector<CorrectionRule>& correctionRules();

} // namespace rheology
} // namespace Choupo
