# C200 phase C -- how to write a pack (the architect's specification)

Read first: /home/vitor/Choupo/docs/design/an-llm-learns-choupo-from-a-brief.md (the record) and the
brief (drafted as `kernel.md`, landed as docs/ai/brief.md)
(it landed together with the packs).

THE READER is a student's own assistant (ChatGPT, Claude.ai, any LLM) with a limited context, which has
read the brief and now needs ONE topic to finish a DESIGN.md and write the case files.  It cannot run
the engine.  It must not copy a tutorial.

A PACK is docs/ai/packs/<name>.md, at most ~6 k tokens (aim 3-5 k; measure: bytes/4).  Telegraphic,
imperative, one fact per line, grammar SHOWN.  No project history, no rulings, no "settled on <date>",
no gate names.  Sections:
  1. When to read this pack (one line) and the decision rule between the units it covers.
  2. Per unit: ports (in/inputs, outputs IN ORDER), operation keys -- required / optional, with units and
     defaults -- what is COMPUTED, the degree-of-freedom count, the `model` words if any, and the two or
     three refusals a newcomer meets most (quote the engine's own message text briefly, cite file:line).
  3. Design guidance a chemical engineer would give a student for this topic (how to choose the key
     numbers, typical ranges, what to estimate by hand before running).
  4. ONE minimal example written FOR the pack (never a tutorial copy) -- the flowsheetDict fragment, any
     constant/ file it needs, and the authored 0/ inlets.  YOU MUST RUN IT: build it as a case in your
     scratch dir, `bin/choupo-init0 <case>` then the binary (choupoSolve), exit 0, balances closing.
     Paste it exactly as run.  State in an HTML comment at the end of the pack the command you ran.
  5. A SOURCES HTML comment block at the end: every key and default with the src file:line it was READ at.
     The long reference docs/ai/unit-ops.md is a starting point and is NOT authoritative: it has been
     wrong before.  Read the unit's C++ (the operation keys it looks up) and believe the code.

If you find a doc in docs/ai that contradicts the code, list it in your report (do not fix it).
RULES: work only in your worktree; never pkill/killall; check `free -m` >= 2 GB before running a case;
`make -j1` only if you must build (the primary checkout /home/vitor/Choupo has a native build: you may run
/home/vitor/Choupo/choupoSolve and /home/vitor/Choupo/bin/choupo-init0 with CHOUPO_HOME=/home/vitor/Choupo
on cases in YOUR scratch dir; never write into /home/vitor/Choupo).  Never `git add -A`.  Commit on your
branch: author "Vítor Geraldes <talentgroundlda@gmail.com>", committer env GIT_COMMITTER_NAME="Claude"
GIT_COMMITTER_EMAIL="noreply@anthropic.com", NO Co-Authored-By trailer.  Do not push.  Run
bin/curate/check_doc_references.py, check_glossary_bans.py and check_doctrine.py on your branch (the pack
must not name a commercial simulator).  No yes-men: if the brief draft states something false about your
topic, say so in your report with the file:line.  Report: pack size in bytes, the example's run result,
the contradictions found, your branch name.
