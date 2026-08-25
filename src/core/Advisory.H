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
    Choupo::Advisory / Choupo::AdvisoryLog

Description
    A solver "speak-up" event -- a bound active at the converged solution, an
    equipment rating exceeded, an auto-initialised tear, etc.  These are the
    "no silent crutch" messages: the solver announces what it did / what is
    physically suspect, never silently.

    Each event is ALSO printed to the run log at its site (with a `[bound]` /
    `[rating]` / `[init]` tag).  AdvisoryLog is a process-wide sink so the
    SAME events can ride in the structured result JSON and be surfaced by the
    GUI (a student who never opens the Log still sees them).

    Singleton, in the spirit of DisplayUnits::instance().  The application
    clears it at the start of each runSimulation pass and drains its entries
    into the SimulationResult afterwards -- so a sweep / optimisation gets the
    advisories of each pass, and the emitted result carries the final pass's.

    Only the MEANINGFUL events are recorded here (bound-at-solution, rating
    exceedance, auto-init) -- transient per-iteration cage clips stay log-only
    so the structured list is not flooded.

    ATTRIBUTION: WHICH STATE IS THIS ADVISORY ABOUT?  (added 2026-08-24)

    The sink above records WHAT was announced and says nothing about WHERE in
    the solve it was announced -- and for an iterative solver those are
    different questions with different answers.  A Newton walks: it evaluates
    the physics at states it invents, reads the residual, and throws most of
    them away.  Every one of those evaluations can raise an advisory, and an
    advisory about a discarded trial is not a caveat about the answer.  It is
    a fact about the path.

    Left unmarked the two are INDISTINGUISHABLE, and the failure is not merely
    untidy -- it is the summary block's own failure mode returning by a
    different road.  `column13_sour_water_stage_identity` announced 99 Davies
    out-of-band warnings, one per state its MESH Jacobian visited.  Exactly one
    of them describes the CONVERGED column (stage 1 sits at I = 0.6359 mol/kg,
    genuinely beyond Davies' trust range, and the reader must be told).  The
    other 98 describe compositions that exist nowhere in the answer.  A reader
    who meets 99 identical sentences reads none of them, so the one true
    caveat was delivered and not received -- which is exactly what the
    end-of-run block exists to prevent.

    So an advisory carries two more facts, and BOTH are stamped by this sink
    rather than by the 111 sites that raise them:

        where    the innermost open frame's label ("column 'stripper' MESH")
        status   "accepted" -- it describes a state the run published
                 "trial"    -- it describes a state a solver visited and
                              may have discarded

    THE DEFAULT IS `accepted`, deliberately.  A site that says nothing keeps
    exactly today's behaviour: printed in full, in the caveat block, at the
    top.  Nothing is silently demoted to a footnote by a mechanism nobody
    opted into.  A solver that knows it is walking OPTS IN by opening an
    `AdvisoryFrame`, and only then does the collapse apply.  This is the
    declare-then-honour posture the rest of the engine uses, and it means the
    mechanism is inert until a solver claims it.

    PROMOTION, because ORDER MUST NOT DECIDE TRUTH.  The same sentence is
    usually raised first by some trial and only later at the answer.  If the
    dedup simply suppressed the second, the entry would keep the status of
    whichever evaluation happened to run first -- a race between the truth and
    the path, decided by iteration order.  So an `accepted` add matching an
    existing `trial` entry PROMOTES it in place (and re-stamps `where`); a
    `trial` add matching an `accepted` entry leaves it alone.  Status only
    ever moves toward the answer, never away from it.

    THREAD SAFETY, and why it is not optional here.  This sink is written from
    inside `newtonND`'s FINITE-DIFFERENCE JACOBIAN, which the MESH column runs
    on a thread pool (`opts.parallel = true`; the residual is asserted pure).
    An unguarded `push_back` on a shared vector from N threads is a data race
    -- undefined behaviour, not a tolerable one -- and it had been there since
    the parallel Jacobian shipped.  It did not manifest in 18 consecutive runs
    of column13 on a two-thread box (identical count, identical order), which
    is evidence about this machine and not about the contract: a thirty-thread
    box is a different experiment and UB owes nobody a crash.  One mutex now
    guards the entries, the frame stack, and every read of either.

    WHAT THIS IS NOT.  It is not a deduplicator.  It never decides that two
    differently-worded advisories are "the same fact" -- that is a similarity
    heuristic and heuristics rot.  It partitions on a field the ENGINE stamped
    at the moment of the raise, and the partition rule is one sentence a
    student can check against the source.
\*---------------------------------------------------------------------------*/

#pragma once

#include <mutex>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

struct Advisory
{
    std::string category;   // "bound" | "rating" | "init"
    std::string severity;   // "info" | "warning"
    std::string locus;      // "tear 'recycle'" | "membrane 'SW30HR'" | "vessel 'reactor'"
    std::string message;    // human-readable, same text as the log line
    std::string where;      // innermost open frame's label; empty = none open
    std::string status{"accepted"};   // "accepted" | "trial"  (see the header)
};

class AdvisoryLog
{
public:
    static AdvisoryLog& instance()
    {
        static AdvisoryLog inst;
        return inst;
    }

    void clear()
    {
        std::lock_guard<std::mutex> lk(mutex_);
        entries_.clear();
        frames_.clear();
    }

    // Returns true if the advisory was NEW (added), false if it was a
    // duplicate and skipped.  Callers gate their own log line on the return
    // value so the SAME event is not printed twice (e.g. a thermo package
    // whose activity model is constructed more than once per build).
    //
    // A PROMOTION also returns false: the sentence was already printed at its
    // site during the trial that first raised it, so printing it again would
    // be a second copy of one announcement.  What changes is the entry's
    // status, and that is what the end-of-run block reads.
    bool add(std::string category, std::string severity,
             std::string locus, std::string message)
    {
        std::lock_guard<std::mutex> lk(mutex_);

        std::string where;
        bool trial = false;
        for (const auto& f : frames_)
        {
            if (!f.label.empty()) where = f.label;   // innermost wins
            if (f.trial) trial = true;               // a trial ANYWHERE up the
        }                                            // stack discards the whole
                                                     // evaluation beneath it

        // Dedup: the same advisory can be produced more than once (e.g. a
        // thermo package rebuilt per pass).  Keep the list clean.
        for (auto& e : entries_)
            if (e.category == category && e.locus == locus && e.message == message)
            {
                //  Status only ever moves TOWARD the answer.  See "PROMOTION"
                //  in the header: iteration order must not decide whether a
                //  caveat is about the solution or about the path.
                if (!trial && e.status == "trial")
                {
                    e.status = "accepted";
                    e.where  = where;
                }
                return false;
            }

        entries_.push_back({ std::move(category), std::move(severity),
                             std::move(locus), std::move(message),
                             std::move(where), trial ? "trial" : "accepted" });
        return true;
    }

    //  A copy, not a reference: the caller may read while a solver is still
    //  running, and handing out a reference to a vector this class mutates
    //  under a mutex would hand out the race the mutex just closed.
    std::vector<Advisory> entries() const
    {
        std::lock_guard<std::mutex> lk(mutex_);
        return entries_;
    }

private:
    friend class AdvisoryFrame;

    struct Frame { std::string label; bool trial; unsigned long long id; };

    unsigned long long pushFrame(std::string label, bool trial)
    {
        std::lock_guard<std::mutex> lk(mutex_);
        frames_.push_back({ std::move(label), trial, ++nextFrameId_ });
        return nextFrameId_;
    }

    //  BY IDENTITY, NOT BY POSITION.  A solver may end its search before an
    //  inner frame has gone out of scope, and popping the back would then
    //  close somebody else's campaign -- silently, and in the direction that
    //  marks the answer as a trial.  Erasing the named frame is correct
    //  whether or not it is on top.
    void popFrame(unsigned long long id)
    {
        std::lock_guard<std::mutex> lk(mutex_);
        for (std::size_t i = frames_.size(); i-- > 0; )
            if (frames_[i].id == id)
            {
                frames_.erase(frames_.begin() + static_cast<long>(i));
                return;
            }
    }

    AdvisoryLog() = default;
    mutable std::mutex    mutex_;
    std::vector<Advisory> entries_;
    std::vector<Frame>    frames_;
    unsigned long long    nextFrameId_{0};
};

//  The solver's declaration of what it is doing to the physics right now.
//
//  Scope-bound so it cannot leak past the solve that opened it -- including
//  when the solve leaves by an exception, which is the case that matters:
//  `newtonND` propagates a residual's throw out of its thread pool, and a
//  frame left open there would mark the rest of the run as a discarded trial.
//
//  CONTRACT: open it on the thread that OWNS the solve, around the whole
//  call -- never inside a residual, and never on a worker.  The frame
//  describes an evaluation campaign, not one evaluation, and the workers
//  raising advisories underneath it are precisely who it is speaking for.
class AdvisoryFrame
{
public:
    //  `trial`: the states evaluated under this frame are candidates the
    //  solver may discard.  `false` (the default) means what is evaluated
    //  here is what the run publishes.
    explicit AdvisoryFrame(std::string label, bool trial = true)
        : id_(AdvisoryLog::instance().pushFrame(std::move(label), trial))
    {}

    //  End the campaign EARLY -- for the common shape where a solver's search
    //  and its report share one scope, and only the search is a walk.
    //  Idempotent, so the destructor stays correct after it.
    void close()
    {
        if (id_ == 0) return;
        AdvisoryLog::instance().popFrame(id_);
        id_ = 0;
    }

    ~AdvisoryFrame() { close(); }

    AdvisoryFrame(const AdvisoryFrame&)            = delete;
    AdvisoryFrame& operator=(const AdvisoryFrame&) = delete;

private:
    unsigned long long id_;
};

} // namespace Choupo
