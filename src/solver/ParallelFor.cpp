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

#include "ParallelFor.H"

#include <functional>
#include <algorithm>
#include <cstdlib>
#include <exception>
#include <iostream>
#include <vector>

#ifndef __EMSCRIPTEN__
#include <atomic>
#include <mutex>
#include <thread>
#if defined(__linux__)
#include <sched.h>
#endif
#endif

namespace Choupo::solver
{

#ifndef __EMSCRIPTEN__
namespace
{
//  The CPUs this process may use (taskset / cpuset honoured) -- the twin of
//  allowedCpus() in NewtonND.cpp.
unsigned allowedCpus()
{
#if defined(__linux__)
    cpu_set_t set;
    CPU_ZERO(&set);
    if (sched_getaffinity(0, sizeof(set), &set) == 0)
    {
        const int c = CPU_COUNT(&set);
        if (c > 0) return static_cast<unsigned>(c);
    }
#endif
    const unsigned h = std::thread::hardware_concurrency();
    return h > 0 ? h : 1u;
}
}
#endif

std::size_t workerThreads(std::size_t declared, std::size_t jobs, const std::string& who)
{
#ifdef __EMSCRIPTEN__
    (void)declared; (void)jobs; (void)who;
    return 1;
#else
    const unsigned cpus = allowedCpus();
    std::size_t t = declared > 0 ? declared
                                 : (cpus > 3u ? static_cast<std::size_t>(cpus) - 2u : 1u);
    if (const char* env = std::getenv("CHOUPO_THREADS"))
    {
        char* end = nullptr;
        const long v = std::strtol(env, &end, 10);
        if (end != env && *end == '\0' && v >= 1)
        {
            if (static_cast<std::size_t>(v) < t)
            {
                static std::once_flag announced;
                std::call_once(announced, [&]
                {
                    std::cerr << "[threads] CHOUPO_THREADS=" << v << " caps " << who
                              << " at " << v << " thread(s) (asked for " << t
                              << "); the results are the same, only the wall clock"
                                 " changes.\n";
                });
                t = static_cast<std::size_t>(v);
            }
        }
    }
    return std::max<std::size_t>(1, std::min(t, std::max<std::size_t>(jobs, 1)));
#endif
}

void parallelFor(std::size_t n, std::size_t threads,
                 const std::function<void(std::size_t)>& body)
{
    std::vector<std::exception_ptr> err(n);
#ifndef __EMSCRIPTEN__
    if (threads > 1 && n > 1)
    {
        std::atomic<std::size_t> next{0};
        const auto worker = [&]
        {
            for (std::size_t i = next++; i < n; i = next++)
            {
                try { body(i); }
                catch (...) { err[i] = std::current_exception(); }
            }
        };
        std::vector<std::thread> pool;
        const std::size_t t = std::min(threads, n);
        pool.reserve(t - 1);
        for (std::size_t k = 1; k < t; ++k) pool.emplace_back(worker);
        worker();                                   // this thread works too
        for (auto& th : pool) th.join();
        for (const auto& e : err) if (e) std::rethrow_exception(e);
        return;
    }
#else
    (void)threads;
#endif
    for (std::size_t i = 0; i < n; ++i)
    {
        try { body(i); }
        catch (...) { err[i] = std::current_exception(); }
    }
    for (const auto& e : err) if (e) std::rethrow_exception(e);
}

} // namespace Choupo::solver
