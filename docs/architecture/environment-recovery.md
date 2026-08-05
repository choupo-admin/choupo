# Environment and recovery — the hosted-checkout rollback

> **STATUS: OPERATIONAL RECORD.**  Not an authority; it decides nothing.  It
> documents an ENVIRONMENT failure that is not caused by this repository, so
> that the next session recognises it in seconds instead of misdiagnosing it as
> a git or repository fault.  Authority map: [`README.md`](README.md).

---

## 1. The failure

In a hosted development session the working checkout **silently reverts to an
older commit**, taking the working tree and `/tmp` with it.  Observed **five
times in one session** on 2026-08-04/05, and previously five times on
2026-07-31.

It is **not** git misbehaving and **not** this repository.  The reflog shows a
`reset: moving to FETCH_HEAD` that no session command issued.

## 2. Signature — how to recognise it in under a minute

All of these appear together:

- `git log --oneline -1` shows a commit OLDER than the session's last work;
- `git reflog` contains a `reset: moving to FETCH_HEAD` nobody typed;
- `/tmp` scratch files from the session are gone, replaced by files from an
  earlier session;
- files appear MODIFIED in the working tree that this session never touched —
  typically a half-finished draft of work that has since been completed and
  pushed;
- the build products are stale relative to the sources.

## 3. Recovery, in order — do NOT skip step 2

```bash
git fetch origin <branch>
git log --oneline -1                       # 1. where am I really
git merge-base --is-ancestor HEAD origin/<branch>   # 2. is anything local UNPUSHED?
git status --short                         # 3. INSPECT every modification
# ...verify each modification is subsumed by the remote before discarding it...
git reset --hard origin/<branch>           # 4. only now
```

**Step 2 and 3 are the whole discipline.**  `reset --hard` before inspecting is
how a rollback turns into data loss: on 2026-08-04 the tree carried a
`wallCooled` draft that LOOKED like unpushed work.  It was not — the remote's
version contained the same line plus an additional `expand` term, so the draft
was strictly older and subsumed.  That was PROVED by diffing before discarding,
not assumed.

## 4. Verified recovery point

> **`b10d523d`** — *"guides: the Edwards truncation, in three registers"* —
> is a verified-good state: full suite **408 PASS / 0 FAIL / 5 EXPECTED-FAIL**
> on a clean tree with no concurrent build.
>
> Later commits are also good but were pushed without a full re-run, since
> they are documentation-only.  If a rollback ever leaves genuine doubt about
> the engine, `b10d523d` is the state to reason from.

## 5. Why the standing rules exist

Three project rules that look like paranoia are direct consequences of this
failure, and must not be relaxed:

1. **Push within minutes of writing.**  Work exists only once pushed.  Five
   rollbacks cost nothing across this session because nothing waited.
2. **Never `reset --hard` before inspecting.**  §3.
3. **Cap parallel work-in-progress.**  Uncommitted work spread across several
   assistants, through a rollback, is unrecoverable.  This is a governing
   constraint on fleet size — see
   [`development-governance.md`](development-governance.md) §3.

## 6. What has NOT been established

The cause.  This record is a recognition-and-recovery procedure, not a
diagnosis; the hosting platform's behaviour has not been instrumented from
inside the session.  Recorded as unknown rather than guessed at.
