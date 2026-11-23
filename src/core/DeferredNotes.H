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
    DeferredNotes.H

Description
    ONE-TIME NOTICES FROM WORKER THREADS, IN A DETERMINISTIC ORDER
    (DEV.md 4c C473 g, the review of the per-vessel integration).

    A thermodynamic law announces "evaluated outside its window" ONCE, the first
    time any caller evaluates it there: a flag, an advisory entry, a line on
    stderr.  With several vessels integrated on threads, which vessel is first
    depends on the scheduling, and so would the text (it names the temperature
    of the first caller) and the order of the lines.

    Inside a `Capture` (one per vessel, on the thread that integrates it) a
    notice is NOT emitted: it is recorded, once per key, with the values of THIS
    vessel.  After the threads have joined the driver flushes the captures in
    vessel order; each recorded emitter runs then, on the main thread, and the
    law's own atomic once-flag lets the lowest vessel that raised it speak.
    Outside a capture `note` simply runs the emitter at once: every other run
    is as it was.
\*---------------------------------------------------------------------------*/

#pragma once

#include <atomic>
#include <functional>
#include <set>
#include <vector>

namespace Choupo::deferred
{

//- A once-flag that may be copied (a copy keeps the value) and is claimed by an
//  atomic exchange: the first claimant gets `true`.
struct OnceFlag
{
    mutable std::atomic<bool> v{false};
    OnceFlag() = default;
    OnceFlag(const OnceFlag& o) : v(o.v.load()) {}
    OnceFlag& operator=(const OnceFlag& o) { v.store(o.v.load()); return *this; }
    bool done() const { return v.load(std::memory_order_relaxed); }
    //- true for the ONE caller that claims it.
    bool claim() const { return !v.exchange(true); }
};

class Capture
{
public:
    struct Buffer
    {
        std::vector<std::function<void()>> emitters;
        std::set<const void*>              keys;
    };

    explicit Capture(Buffer& b) : prev_(current()) { current() = &b; }
    ~Capture() { current() = prev_; }
    Capture(const Capture&) = delete;
    Capture& operator=(const Capture&) = delete;

    static bool capturing() { return current() != nullptr; }

    //- Run the emitters recorded in `b`, in the order they were raised.
    static void flush(Buffer& b)
    {
        auto list = std::move(b.emitters);
        b.emitters.clear();
        b.keys.clear();
        for (auto& e : list) e();
    }

    static Buffer*& current() { static thread_local Buffer* p = nullptr; return p; }

private:
    Buffer* prev_;
};

//- Raise a notice.  Outside a capture: `emit()` now.  Inside one: remember it
//  (once per `key` and per capture) for the flush.  `emit` must itself be
//  idempotent across callers (claim an OnceFlag, or use addAnnouncedOnce).
inline void note(const void* key, std::function<void()> emit)
{
    if (Capture::Buffer* b = Capture::current())
    {
        if (b->keys.insert(key).second) b->emitters.push_back(std::move(emit));
        return;
    }
    emit();
}

} // namespace Choupo::deferred
