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
File
    ParallelFor.H

Description
    A parallel loop over INDEPENDENT jobs, std::thread only (C++17, no
    library), for work whose items share nothing they write: the N+1
    integrations of a brute-force sensitivity (Theory Guide,
    sec:ignition-sensitivity) are the use it was written for.

    DETERMINISM.  Each job writes only its own slot of the caller's result
    vector and reads shared data that nothing writes while the loop runs, so
    the results are the same bits whatever the thread count and whatever
    order the threads take the jobs in.  An exception thrown by a job is
    kept in that job's slot and the one of the LOWEST index is rethrown after
    every thread has joined: the error a run reports does not depend on the
    thread count either.

    HOW MANY THREADS (workerThreads), one rule with the parallel Jacobian of
    NewtonND.cpp (whose allowedCpus it mirrors):
        threads = min( declared > 0 ? declared : allowed CPUs - 2 (at least 1),
                       CHOUPO_THREADS if set,      (the orchestrator's cap)
                       number of jobs )
    "Allowed" is sched_getaffinity on Linux.  bin/runTests sets
    CHOUPO_THREADS so that cases x threads stays within the machine.

    WEBASSEMBLY.  The browser build has no threads (Emscripten without
    pthreads): under __EMSCRIPTEN__ the loop is the plain serial loop and
    workerThreads returns 1 -- the same results, in one thread.
\*---------------------------------------------------------------------------*/

#pragma once

#include <cstddef>
#include <functional>
#include <string>

namespace Choupo::solver
{

//- The worker count for `jobs` independent items (see the rule above).
//  `who` names the caller in the one-line notice printed when
//  CHOUPO_THREADS binds.
std::size_t workerThreads(std::size_t declared, std::size_t jobs, const std::string& who);

//- body(i) for every i in [0, n) on `threads` threads (1: in this thread,
//  in order).  Rethrows the exception of the lowest i that threw.
void parallelFor(std::size_t n, std::size_t threads,
                 const std::function<void(std::size_t)>& body);

} // namespace Choupo::solver
