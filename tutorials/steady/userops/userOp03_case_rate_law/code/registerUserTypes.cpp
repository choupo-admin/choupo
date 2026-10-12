/*---------------------------------------------------------------------------*\
  registerUserTypes  --  the case's hook into the factories.

  bin/buildCode links this file (instead of the empty library stub) into a
  per-case binary, so the choupoSolve main() calls THIS at start-up, right
  after ReactionRate::registerBuiltins() and UnitOperation::registerBuiltins().
  Register every case-local type here with the same explicit factory the
  built-ins use --- no macro self-registration.  This case registers a RATE
  LAW; userOp01 registers a unit operation through the same hook.
\*---------------------------------------------------------------------------*/

#include "MichaelisMenten.H"

#include <memory>

// Global namespace, matching the extern declaration in
// src/applications/choupoSolve/main.cpp.
void registerUserTypes()
{
    Choupo::ReactionRate::registerType(
        "michaelisMenten",
        [](const Choupo::DictPtr& rxn, const Choupo::ThermoPackage& thermo,
           const std::string& who, const Choupo::RateOffer&)
            -> std::unique_ptr<Choupo::ReactionRate>
        { return std::make_unique<Choupo::MichaelisMenten>(rxn, thermo, who); });
}
