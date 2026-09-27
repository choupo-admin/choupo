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

    THE LOG IS PER PASS; THE CONSOLE LINE MAY BE PER PROCESS (2026-09-27).

    Some sites print their console line ONCE PER PROCESS -- an unreviewed
    record, a component read from the local tier, a Henry pair extrapolated --
    because a sweep reloads every record on every pass and the same sentence
    repeated forty times is read by nobody.  Those sites used to put their
    `add()` INSIDE that once-per-process gate, and so the per-pass `clear()`
    erased the fact from every pass after the first: `cavett01` run directly
    listed `UNVERIFIED DATA (7)`, and the same case under a 2-point sweep
    announced all seven `[unreviewed]` lines at their site and then closed
    with a caveat block, "the LAST pass only", that listed NONE of them.  The
    last pass consumed exactly those seven records.  Silence there did not
    mean "nothing raised"; it meant "raised in an earlier pass".

    The two questions have two answers and now have two latches, both HERE:

        the ENTRY   is recorded by every pass that raises it -- the log
                    describes the pass, so a record the pass consumed is in
                    that pass's list;
        the LINE    is printed once per process -- `addAnnouncedOnce`
                    returns true only the first time its KEY is raised in
                    this process, and the caller prints on that answer.

    `clear()` resets the per-pass key set and keeps the process set, which is
    the whole partition in one sentence.  A site that repeats its console
    line per pass, or never gates it, keeps calling plain `add()`.  What must
    not happen is an `add()` gated by a process-lifetime latch of the site's
    own -- the log cannot see such a latch, and the fact then belongs to
    whichever pass came first.  `check_caveat_surface` arm (g) reads the
    source for that shape.

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
#include <set>
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

    //  Start a new PASS.  The entries, the open frames and the per-pass keys
    //  go; the PROCESS keys stay, because they answer "has this console line
    //  been printed?", and a new pass has not un-printed it.
    void clear()
    {
        std::lock_guard<std::mutex> lk(mutex_);
        entries_.clear();
        frames_.clear();
        passKeys_.clear();
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
        return addLocked(std::move(category), std::move(severity),
                         std::move(locus), std::move(message));
    }

    //  A fact whose CONSOLE LINE is printed once per process (see "THE LOG IS
    //  PER PASS" in the header).  `key` names the fact the way the site's
    //  once-per-process latch used to ("interim:<component>").
    //
    //    * The FIRST raise of `key` in a pass records the entry exactly as
    //      `add()` would (same dedup, same stamping, same promotion rule).
    //      Later raises of the same key in the SAME pass change nothing --
    //      which is precisely what the old in-gate `add()` did within its
    //      one pass, so a single-pass run records the same list as before.
    //    * Returns true only when the key is new to the PROCESS and the entry
    //      was new to the log -- the caller prints its site line on that
    //      answer and on no other, so the line appears once per run exactly
    //      as it always has.
    bool addAnnouncedOnce(const std::string& key,
                          std::string category, std::string severity,
                          std::string locus, std::string message)
    {
        std::lock_guard<std::mutex> lk(mutex_);
        if (!passKeys_.insert(key).second) return false;   // this pass has it
        const bool firstInProcess = processKeys_.insert(key).second;
        const bool isNew = addLocked(std::move(category), std::move(severity),
                                     std::move(locus), std::move(message));
        return firstInProcess && isNew;
    }

    //  Has THIS pass already recorded `key`?  For a site in a hot loop that
    //  wants to stop before building its sentence (a Henry constant is asked
    //  for on every K evaluation).  Purely an early exit: `addAnnouncedOnce`
    //  makes the same decision on its own, under the lock.
    bool passHas(const std::string& key) const
    {
        std::lock_guard<std::mutex> lk(mutex_);
        return passKeys_.count(key) != 0;
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

    //  The one recording path; the caller holds `mutex_`.
    bool addLocked(std::string category, std::string severity,
                   std::string locus, std::string message)
    {
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
    std::set<std::string> passKeys_;      // keys raised in THIS pass
    std::set<std::string> processKeys_;   // keys whose line was printed; never cleared
};

//  The solver's declaration of what it is doing to the physics right now.
//
//  Scope-bound so it cannot leak past the solve that opened it -- including
//  when the solve leaves by an exception, which is the case that matters:
//  `newtonND` propagates a residual's throw out of its thread pool, and a
//  frame left open there would mark the rest of the run as a discarded trial.
//
//  CONTRACT: open it around a whole search, never around one evaluation.  The
//  frame describes a CAMPAIGN.
//
//  THE STACK IS PROCESS-WIDE AND SHARED, and that is deliberate rather than
//  careless: the MESH column opens its frame on the thread that owns the
//  solve, and the advisories it is speaking for are raised by the pool
//  threads of `newtonND`'s finite-difference Jacobian.  A thread-local stack
//  would be invisible to exactly the workers it exists to cover.
//
//  So a frame can also be opened ON a worker -- `ReactiveVLE`'s outer Newton
//  does, because the MESH residual reaches it from the pool.  That is SAFE:
//  every push, pop and read is under the mutex, and a frame is popped BY
//  IDENTITY, so interleaved opens and closes cannot close each other's
//  campaigns.  Two consequences follow, and neither is hidden:
//
//    * `status` is the OR over every open frame.  With several searches
//      genuinely running at once, an advisory raised under any of them is a
//      trial.  That is the conservative direction for the flood and the
//      dangerous one for the answer -- but the owning thread is blocked in
//      `join()` for the whole parallel region and raises nothing there, so
//      no accepted advisory is demoted by a sibling's frame.
//    * `where` is the innermost frame at the moment of the raise, which
//      under concurrency may name a SIBLING search rather than the exact
//      one.  Every concurrent frame today is a trial frame with a
//      near-identical label, so the reported attribution is right; what is
//      not claimed is that it would stay right if two differently-named
//      searches ever ran side by side.
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
