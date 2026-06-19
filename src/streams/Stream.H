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
Class
    Choupo::Stream

Description
    Material stream: temperature, pressure, total molar flow, composition,
    and (optionally) vapour fraction.  Used both as input to a unit
    operation and as its product.  Not yet hooked into a flowsheet graph
    (has a single unit at a time); the design is ready for it.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>

namespace Choupo {

class Stream
{
public:
    Stream() = default;
    Stream(std::string name, std::size_t nComponents)
  :   name_(std::move(name)), z_(nComponents, 0.0) {}

    // ---- Identification ----------------------------------------------------
    const std::string& name() const { return name_; }
    void setName(std::string s)  { name_ = std::move(s); }

    // ---- Conditions --------------------------------------------------------
    scalar T()  const { return T_;  }       // [K]
    scalar P()  const { return P_;  }       // [bar]
    scalar F()  const { return F_;  }       // [kmol/h]
    scalar vf() const { return vf_; }       // vapour fraction [-]
    void setT (scalar v) { T_  = v; }
    void setP (scalar v) { P_  = v; }
    void setF (scalar v) { F_  = v; }
    void setVF(scalar v) { vf_ = v; }

    // ---- Composition -------------------------------------------------------
    const sVector& z() const { return z_; }
    sVector&       z()       { return z_; }

private:
    std::string name_;
    scalar      T_  = 0.0;
    scalar      P_  = 0.0;
    scalar      F_  = 0.0;
    scalar      vf_ = 0.0;
    sVector     z_;
};

} // namespace Choupo
