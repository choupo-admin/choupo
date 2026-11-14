#!/usr/bin/env bash
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
#  ci-not-checked.sh <fast|full>
#
#  Says, BY NAME, what a run on GitHub's runner does not (or cannot) check, so
#  a reader of the log never has to infer it from a green tick.  It changes no
#  gate and skips nothing: it only measures which private inputs are absent
#  here and prints the consequence.  A gate that cannot work on the runner by
#  design must not pass silently, and this is where the runner case is made
#  explicit (DEV.md 4c C253).
#
#  Read-only; exits 0 always (it reports, it does not judge).
tier="${1:-fast}"
echo "================ NOT CHECKED ON CI ($tier) ================"

# 1. the private data tier
n_local=$(find data/local -type f ! -name README.md ! -name .gitkeep 2>/dev/null | wc -l)
echo "data/local (private tier, gitignored): $n_local record file(s) present."
echo "  -> NOT CHECKED ON CI: any behaviour that depends on private pairs or"
echo "     records (the ChemSep-derived pair tier).  The public tree ships this"
echo "     tier empty; gates that read it run against the empty tier."

# 2. third-party archives
for a in thirdParty/chemsep/chemsep1.xml; do
  if [ -e "$a" ]; then echo "$a: present."
  else
    echo "$a: ABSENT."
    echo "  -> NOT CHECKED ON CI: the arms of gates that need the archive"
    echo "     (check_unifac_key's archive comparison states its own reduced"
    echo "     claim when the archive is absent)."
  fi
done

# 3. the literature folder
if [ -d "$HOME/Choupo-Literature" ]; then echo "~/Choupo-Literature: present."
else
  echo "~/Choupo-Literature: ABSENT (the maintainer's paper folder)."
  echo "  -> NOT CHECKED ON CI: nothing in bin/ reads it; it is where papers"
  echo "     are READ from by people, never by a gate."
fi

# 4. the WASM / browser side
echo "WASM engines and the in-browser EduTool smoke: NOT built by ci.yml."
echo "  -> checked by publish-site.yml / site-smoke.yml on their own triggers."

if [ "$tier" = fast ]; then
  echo "Tier fast: runs ONE case per tutorial family and the scoped conservation"
  echo "  gates only (the preflight proofs, workspace truth and build freshness,"
  echo "  run in every tier).  Every other gate and the golden-manifest checks"
  echo "  are NOT CHECKED here -- the nightly full sweep (job 'full') runs them."
fi
echo "==========================================================="
exit 0
