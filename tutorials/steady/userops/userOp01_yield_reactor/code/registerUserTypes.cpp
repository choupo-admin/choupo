/*---------------------------------------------------------------------------*\
  registerUserTypes  --  the case's hook into the factory.

  bin/buildCase links this file (instead of the empty library stub) into
  a per-case binary, so the choupoSolve main() calls THIS at start-up,
  right after UnitOperation::registerBuiltins().  Register every
  case-local unit op here with the same explicit factory the built-ins
  use --- no macro self-registration.
\*---------------------------------------------------------------------------*/

#include "YieldReactor.H"

#include <memory>

// Global namespace, matching the extern declaration in
// src/applications/choupoSolve/main.cpp.
void registerUserTypes()
{
    Choupo::UnitOperation::registerType(
        "yieldReactor",
        [] { return std::make_unique<Choupo::YieldReactor>(); });
}
