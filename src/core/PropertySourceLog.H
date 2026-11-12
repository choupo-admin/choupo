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
    Choupo::PropertySourceLog

Description
    WHERE EACH CONSUMER'S LIQUID PROPERTY CAME FROM (DEV.md 4c C378, slice 0;
    docs/design/thermophysical-slice0-plan.md sections 3-4).

    A unit or a sizing pass that needs a liquid density, viscosity, surface
    tension or diffusivity either asks the package through the one door
    (thermo/LiquidPropertyDoor.H) or BYPASSES it -- a record's 25 C `Vliq`
    held flat, a constant 1000 kg/m3, a value the case declares, a
    correlation of its own.  Slice 0 changes none of those numbers; it makes
    each of them SAY where it came from, per consumer.

    Two records, both kept here:
      * DECLARED -- at assembly, what each unit of the flowsheet says it
        will use (unitOperations/PropertySourceDeclarations.cpp);
      * USED     -- at run time, what each consumer actually used, recorded
        by the code that took the number (the door, or a `ConstantSource`
        / `use()` at the bypassing site).
    They are printed as two tables and published as the result block
    `propertySources`; a used source no unit declared, or a declared one
    that was never used, is a reported MISMATCH.  Aggregated per (consumer
    type, property, source) with the units listed: never one line per call.

    One run per process (or per WASM `run_case`): `clear()` at the top of
    every binary's main.  Across an outer driver's passes and a
    time-integrated run's instants the record AGGREGATES (TR-15).

    A CONSTANT A CONSUMER USES IS ONE OBJECT: `ConstantSource` carries the
    value, the id and the label together, and the site computes WITH
    `.value` and records WITH the same object, so the number and its
    description cannot be edited apart.
\*---------------------------------------------------------------------------*/

#pragma once

#include <map>
#include <mutex>
#include <ostream>
#include <set>
#include <string>
#include <tuple>
#include <vector>

namespace Choupo {

//  A number a consumer uses instead of the package, and what it is.
struct ConstantSource
{
    double      value;      // in the property's SI unit
    const char* id;         // stable word, pinned by the golden row kind `source`
    const char* label;      // the human line
};

//  A source that is not a single constant (a record field, the case's value).
struct NamedSource
{
    const char* id;
    const char* label;
};

namespace liquidSource {
//  THE ONE HOME of each bypass source of slice 0 (plan, section 1).
inline const ConstantSource diluteCarrierDensity
    { 1000.0, "constant.diluteCarrier",
      "constant 1000 kg/m3 (the dilute-carrier density the unit is built on)" };
inline const ConstantSource rhoFeedDefault
    { 1000.0, "default.rhoFeed1000",
      "rho_feed not declared: default 1000 kg/m3, unannounced by the unit" };
inline const ConstantSource batchDiafilterRhoDefault
    { 1000.0, "default.rho1000.announced",
      "rho not declared: default 1000 kg/m3 (announced)" };
inline const ConstantSource dropletDensityFallback
    { 1000.0, "fallback.1000",
      "a solvent declares no Vliq: 1000 kg/m3" };
inline const ConstantSource pumpHeadDensityFallback
    { 1000.0, "fallback.1000",
      "no component carries a liquid volume: 1000 kg/m3 for the head" };
inline const ConstantSource waterViscosityKnob
    { 1.0e-3, "default.water1e-3",
      "1e-3 Pa s (water near 20 C), the unit's default" };
inline const ConstantSource waterSurfaceTensionFallback
    { 0.072, "fallback.water0.072",
      "0.072 N/m (water), the unit's fallback on any refusal" };
inline const ConstantSource soluteDiffusivityLegacy
    { 1.6e-9, "default.legacy1.6e-9",
      "1.6e-9 m2/s (NaCl in water, roughly), the unit's legacy default" };
inline const NamedSource recordVliqFlat
    { "bypass.recordVliq25C",
      "BYPASS: the record's Vliq (25 C) held flat, no T, no P" };
inline const NamedSource recordVliqIonsMassKept
    { "bypass.recordVliq25C.ionsNoVolume",
      "BYPASS: the record's Vliq (25 C) held flat; a dissolved ion has no volume, its mass is kept" };
inline const NamedSource recordVliqSilentZero
    { "bypass.recordVliq25C.missingIsZero",
      "BYPASS: the record's Vliq (25 C) held flat; a component without one adds no volume, unannounced" };
inline const NamedSource declaredByCase
    { "declared.case", "declared by the case" };
inline const NamedSource ownWilkeChang
    { "own.WilkeChang.mixtureViscosity",
      "BYPASS: the unit's own Wilke-Chang in the mixture viscosity, linear in x" };
inline const NamedSource speciesRecordD0
    { "record.speciesD0.StokesEinstein",
      "the species records' D0 x Stokes-Einstein" };
inline const NamedSource callerValue
    { "caller.value", "the value its caller holds" };
} // namespace liquidSource

class PropertySourceLog
{
public:
    static PropertySourceLog& instance()
    {
        static PropertySourceLog inst;
        return inst;
    }

    void clear() { used_.clear(); declared_.clear(); }

    //  At assembly: unit `unit` of type `type` will take `property` from a
    //  source of `sourceClass` ("kernel", "bypass", "declared", "own",
    //  "record", "caller").
    void declare(const std::string& type, const std::string& unit,
                 const std::string& property, const std::string& sourceClass);

    //  At run time.  `kernel`: the number came through the door.
    //  `pressureNote`: "applied", "not applied" or "" (no pressure involved).
    //  `leftOut`: components left out of the call, "" when none.
    void use(const std::string& type, const std::string& unit,
             const std::string& property, const std::string& sourceId,
             const std::string& label, const std::string& sourceClass,
             const std::string& pressureNote, const std::string& leftOut = "");
    void use(const std::string& type, const std::string& unit,
             const std::string& property, const ConstantSource& s,
             const std::string& sourceClass = "bypass")
    { use(type, unit, property, s.id, s.label, sourceClass, ""); }
    void use(const std::string& type, const std::string& unit,
             const std::string& property, const NamedSource& s,
             const std::string& sourceClass, const std::string& pressureNote = "")
    { use(type, unit, property, s.id, s.label, sourceClass, pressureNote); }

    //  The same, for the consumer being solved (Scope below); nothing is
    //  recorded when none is.
    void useHere(const std::string& property, const NamedSource& s,
                 const std::string& sourceClass, const std::string& pressureNote = "");
    void useHere(const std::string& property, const ConstantSource& s,
                 const std::string& sourceClass = "bypass");

    bool empty() const { return used_.empty() && declared_.empty(); }

    //  THE CONSUMER BEING SOLVED.  The flowsheet sets it around each unit's
    //  solve and a sizing pass around each item, so the door records a use
    //  without every helper (tray hydraulics, a slurry core) passing a name
    //  through.  A plain process-wide value, not thread-local: a unit that
    //  prices on a worker pool is still the unit being solved.
    class Scope
    {
    public:
        Scope(const std::string& type, const std::string& unit);
        ~Scope();
        Scope(const Scope&) = delete;
        Scope& operator=(const Scope&) = delete;
    private:
        std::string prevType_, prevUnit_;
    };
    //  False when no consumer is being solved (a props bench, a probe).
    bool current(std::string& type, std::string& unit) const;

    //  The two tables and the mismatches, as printed in the log.
    void printDeclared(std::ostream& os) const;
    void printUsed(std::ostream& os) const;
    //  The result block (a leading ",\n" like the other optional blocks), or
    //  "" when nothing was declared or used.
    std::string json() const;

    struct Used
    {
        std::string label, sourceClass, pressureNote;
        std::set<std::string> units, leftOut;
    };
    //  (consumer type, property, source id) -> what was used
    using Key = std::tuple<std::string, std::string, std::string>;
    const std::map<Key, Used>& used() const { return used_; }

private:
    PropertySourceLog() = default;
    mutable std::mutex mutex_;
    std::string currentType_, currentUnit_;
    std::map<Key, Used> used_;
    //  (type, unit, property) -> declared source classes
    std::map<std::tuple<std::string, std::string, std::string>,
             std::set<std::string>> declared_;

    std::vector<std::string> mismatches() const;
};

} // namespace Choupo
