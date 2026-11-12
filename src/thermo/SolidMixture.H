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
    Choupo::solidMixture

Description
    THE ONE HOME of the particle density of a mixture of solids, and of the
    announcement of a shape factor nobody declared (review SP-01..SP-05,
    2026-11-12).

    particleDensity: the solids of a stream are a MECHANICAL MIXTURE, so
    their volumes add:

        1 / rho_p  =  sum_i  w_i / rho_p,i     (w_i = mass fraction among
                                                the solids)

    i.e. the mass-weighted HARMONIC mean.  One solid keeps its own density
    exactly.  A solid with no particle density REFUSES, by name (component,
    unit, the key to declare and where): before this, the cyclone and the
    pneumatic conveyor counted it as zero density while its mass stayed in the
    denominator, and the spray dryer assumed 1500 kg/m3.  No material
    property is invented.  A mixture of two or more solids is announced once,
    in the same words, whichever unit asked.

    announceDefaultShapeFactor: k_v is a SHAPE assumption, not a material
    datum; when a record declares none, the sphere pi/6 is used and ANNOUNCED
    (advisory, category "model"), naming the component and the value.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "thermo/ThermoPackage.H"

#include <string>

namespace Choupo {
namespace solidMixture {

//  `solidMolarFlows`: kmol/s of each component in the stream's solid phase
//  (entries <= 0 are not solids of this stream).  `unitLabel` names the unit
//  in the refusal / announcement, e.g. "cyclone 'cyc1'".
scalar particleDensity(const ThermoPackage& thermo,
                       const sVector& solidMolarFlows,
                       const std::string& unitLabel,
                       int verbosity);

//  Announce (once per run) that component `c` has no declared k_v and the
//  sphere is assumed.  No-op when the record declares k_v.
void announceDefaultShapeFactor(const Component& c,
                                const std::string& unitLabel,
                                int verbosity);

} // namespace solidMixture
} // namespace Choupo
