/*---------------------------------------------------------------------------*\
  registerUserTypes  --  the case's hook into the factory.

  buildCode links this file (instead of the empty library stub) into the
  per-case binary, so choupoSolve's main() calls it at start-up, right
  after UnitOperation::registerBuiltins().  Register every case-local
  unit op here with the usual explicit factory --- no macro magic.
\*---------------------------------------------------------------------------*/

#include "ComponentSplitter.H"

#include <memory>

// Global namespace, matching the extern declaration in
// src/applications/choupoSolve/main.cpp.
void registerUserTypes()
{
    Choupo::UnitOperation::registerType(
        "componentSplitter",
        [] { return std::make_unique<Choupo::ComponentSplitter>(); });
}
