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
-------------------------------------------------------------------------------
Description
    CARRIED QUANTITIES (C427 spike; docs/design/measured-facts-materials-and-
    flow-curves.md sections 5b and 5d).

    A stream carries, beside its molar part, an ORDERED SET of carried
    quantities, each `{ kind, name, carrier, unit, values }`.  The KINDS are
    a closed list registered by the explicit factory pattern of CLAUDE.md
    section 5 (`registerType` / `New` / `registerBuiltins`, called by the
    `main.cpp` of each binary); a kind is ONE class owning

        its BASIS            (what the number is, in which unit),
        its law of MIXING    (what a mixer does with the inlets' copies),
        its law of DIVISION  (what a splitter does with one copy, WITHOUT
                              fractionating: a fractionating unit says so),
        its BALANCE          (whether a PRODUCTION or DESTRUCTION term may
                              exist for the kind, and the invariants a
                              transformed copy must still satisfy),
        its STATE-FILE form  (written in `0/` and `converged/`, read back),
        its REPORT form      (one line a student reads).

    A carried quantity is NOT thereby conserved (architect's correction,
    2026-11-18): two particles that merge keep their mass and halve their
    number; the moments of a distribution change under reaction.  A quantity
    changes only inside a unit that SOLVES ITS BALANCE and hands the result
    to `CarriedKind::transform`, which refuses a change the kind does not
    allow (a material's mass has no production term) and checks the kind's
    invariants (a size distribution's fractions still sum to what they did).
    A unit that changes a carrier and cannot supply the term refuses.

    The mixer and the splitter call these laws and know no kind.  A unit
    declares the kinds it MODELS in `UnitAcceptance::carried`; any other kind
    on an inlet is refused by name before the solve (`carriedFindings`).

    Kinds of the spike
        sizeDistribution  the existing `ProcessStream::psd` (intensive: mass
                          fractions of the solid, weighted by the solid mass);
                          its mixing law is the one the mixer carried by hand
                          (C361), MOVED here unchanged.  Its STORAGE stays the
                          `psd` field the solid units read; the kind reaches
                          it through `carriedOfInlet` / `applyCarried`.  Every
                          unit that reads or writes it DECLARES that in its
                          acceptance (second slice, 2026-11-18): it is checked
                          like any other kind, with no exemption.
        materialMass      the mass flow of a declared material [kg/s].
        chainMoment       order 0 or 2 of a declared polymer's chain-length
                          distribution [kmol/s of chains x length^order].
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <filesystem>
#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <ostream>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

class Dictionary;
struct ProcessStream;
struct ParticleSizeDistribution;

//  The core type KNOWS NO KIND.  What belongs to one kind (a size
//  distribution's diameters, edges and weighing mass; a chain moment's order)
//  lives in the named-attribute block, which ONLY the kind reads, writes and
//  validates (`CarriedKind::validate`, called on construction, read and
//  write): an attribute the kind does not name is refused by it.
struct CarriedQuantity
{
    std::string kind;       // registry key
    std::string name;       // the quantity's own name (unique on a stream)
    std::string carrier;    // the material, polymer or "solid" it belongs to
    std::string unit;       // declared unit, printed
    std::vector<scalar> values;   // extensive kinds: one value; psd: massFrac
    std::map<std::string, std::vector<scalar>> attributes;   // the kind's own

    //  The named attribute, or an empty vector when the quantity has none.
    const std::vector<scalar>& attribute(const std::string& n) const
    {
        static const std::vector<scalar> none;
        const auto it = attributes.find(n);
        return it == attributes.end() ? none : it->second;
    }
    //  The attribute's single number, or `dflt` (a one-valued attribute).
    scalar attributeScalar(const std::string& n, scalar dflt) const
    {
        const auto& v = attribute(n);
        return v.empty() ? dflt : v.front();
    }
};

//  One inlet's copy of a quantity, for a mixing law.
struct CarriedPart
{
    std::string            inlet;
    const CarriedQuantity* q = nullptr;
};

//  What a mixing law may need from the unit that calls it.
struct CarriedMixContext
{
    const Dictionary* unitDict  = nullptr;   // the unit's own dict (`sizeGrid`)
    int               verbosity = 0;
    //  A law that has to say something (a re-binning) says it here; the unit
    //  owns the advisory channel.
    std::function<void(const std::string& inlet, const std::string& msg)> advise;
};

class CarriedKind
{
public:
    using Factory = std::function<std::unique_ptr<CarriedKind>()>;
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<CarriedKind> New(const std::string& kind);
    static void registerBuiltins();                 // idempotent
    static std::vector<std::string> availableTypes();

    virtual ~CarriedKind() = default;
    virtual std::string kindName() const = 0;
    //  A new quantity of this kind, validated: `kind` and `unit` are filled
    //  by the kind, the attributes are checked by `validate`.
    CarriedQuantity create(const std::string& name, const std::string& carrier,
                           const std::vector<scalar>& values,
                           const std::map<std::string, std::vector<scalar>>&
                               attributes = {}) const;
    //  THE KIND'S OWN INVARIANTS on a quantity of its kind: the attribute
    //  names it allows, their sizes and ranges.  Throws a sentence naming the
    //  quantity.  Called by create, readState, writeState, transform, mix and
    //  divide results -- a quantity that violates its kind cannot be built,
    //  read or written.
    virtual void validate(const CarriedQuantity& q) const = 0;
    //  The unit the values are printed in.
    virtual std::string unitOf(const CarriedQuantity& q) const = 0;
    //  True for a kind whose STORAGE is still the stream's own `psd` field
    //  (and the `solids {}` wire), not the `carried {}` block (registered for
    //  its own slice).
    virtual bool storedInStreamPsd() const { return false; }
    //  True when the kind's `total` is a MASS FLOW in kg/s: the plant-boundary
    //  mass balance adds it to the boundary streams' in and out.
    virtual bool totalIsMass() const { return false; }
    //  Mixing: `parts` are the inlets that carry a quantity of this name.
    //  nullopt = nothing to publish.
    virtual std::optional<CarriedQuantity>
        mix(const std::vector<CarriedPart>& parts,
            const CarriedMixContext& ctx) const = 0;
    //  Division by a splitter: the carrier's fraction `f` of the quantity.
    virtual CarriedQuantity divide(const CarriedQuantity& q, scalar f) const = 0;
    //  State-file block of ONE quantity at `indent` (a complete block).
    virtual void writeState(std::ostream& os, const CarriedQuantity& q,
                            const std::string& indent) const = 0;
    virtual CarriedQuantity readState(const std::string& name,
                                      const Dictionary& d) const = 0;
    virtual void report(std::ostream& os, const CarriedQuantity& q) const = 0;
    //  THE BALANCE.  May a production or destruction term exist for this kind
    //  (number-like and moment-like: yes; mass-like: no)?
    virtual bool allowsProduction() const = 0;
    //  THE TRANSFORMATION: a unit that solved this quantity's balance (with
    //  its own rate, the term the kind allows) hands the SOLVED values over;
    //  the kind refuses a change it does not allow and checks its invariants
    //  (`unit` names the unit for the message).  Returns the quantity with
    //  the solved values, every other field unchanged.
    virtual CarriedQuantity transform(const CarriedQuantity& in,
                                      const std::vector<scalar>& solved,
                                      const std::string& unit) const = 0;
    //  The extensive total a balance reads (0 for an intensive kind).
    virtual scalar total(const CarriedQuantity&) const { return 0.0; }
    //  What a unit publishes as KPIs for a quantity it produced (none by
    //  default; the size distribution publishes d10..d90, d32, Sv).
    virtual void publishKpis(std::map<std::string, scalar>&,
                             const CarriedQuantity&) const {}
};

//  The wire form between the flowsheet and a unit: `carried { <name> {...} }`
//  inside a unit's inlet dict.  (The size distribution keeps its existing
//  `solids {}` wire; `carriedOfInlet` reads both.)  Written only when the
//  stream carries something, so every other dict is unchanged.
void carriedToDict(Dictionary& inletDict, const ProcessStream& s);
//  `solidMass` weighs the size distribution (0 = the inlet has no solid).
std::vector<CarriedQuantity>
carriedOfInlet(const Dictionary& inletDict, scalar solidMass);
//  Every quantity a stream carries, the size distribution included (weight
//  0: a stream does not know the molar masses).
std::vector<CarriedQuantity> carriedOfStream(const ProcessStream& s);
//  Put quantities on a produced stream: the psd into `psd`, the rest into
//  `carried`.
void applyCarried(ProcessStream& s, const std::vector<CarriedQuantity>& qs);

//  MIX: one result per distinct quantity name over all inlets (in the order
//  the names first appear).
std::vector<CarriedQuantity>
mixCarried(const std::vector<std::pair<std::string,
                                       std::vector<CarriedQuantity>>>& inlets,
           const CarriedMixContext& ctx);
//  DIVIDE every quantity by the fraction `f` of its carrier.
std::vector<CarriedQuantity>
divideCarried(const std::vector<CarriedQuantity>& qs, scalar f);

//  The state-file block `carried { ... }` of a stream (nothing when it
//  carries nothing) and its reader (an old file without the block reads as
//  "none carried").
void writeCarriedBlock(std::ostream& os, const ProcessStream& s);
void readCarriedBlock(const Dictionary& streamDict, ProcessStream& s);
//  The psd's block, through its kind: the text the state writer printed
//  before the kinds existed.
void writePsdState(std::ostream& os, const ParticleSizeDistribution& psd,
                   const std::string& indent);

//  One report line per quantity of the stream's carried set.
void reportCarried(std::ostream& os, const ProcessStream& s,
                   const std::string& indent);

//  The KPIs of a set of produced quantities, each through its kind.
void publishCarriedKpis(std::map<std::string, scalar>& kpis,
                        const std::vector<CarriedQuantity>& qs);

//  The extensive total of one quantity name over a set of streams (for the
//  closure the probe prints): sum of `total()` of every quantity so named.
scalar carriedTotal(const std::vector<const ProcessStream*>& streams,
                    const std::string& name);

//  THE MASS-LIKE QUANTITIES OF A STREAM [kg/s], by quantity name: every
//  carried quantity whose kind states `totalIsMass()`.  The plant-boundary
//  mass balance adds these to its in and out (a material the report cannot
//  see is mass outside the closure, CLAUDE.md rule 4b).  Empty for a stream
//  that carries no mass-like quantity.
std::map<std::string, scalar> carriedMassFlows(const ProcessStream& s);

//  A driver whose units model NO carried quantity refuses a state tree that
//  carries one: every file under `zeroDir` is scanned for a `carried {}`
//  block or a size distribution, and the first is refused by name with
//  `driver` and the file (a closed batch vessel's holdup has no home for it).
void refuseCarriedInStateTree(const std::filesystem::path& zeroDir,
                              const std::string&           driver);

} // namespace Choupo
