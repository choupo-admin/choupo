#!/usr/bin/env bash
# usage: sabotage.sh <repo-root> <scratch-dir>
R=$1; S=$2; cd "$R" || exit 2
G="python3 bin/curate/check_source_headers.py"
run() { local name="$1"; out=$($G 2>&1); ec=$?; first=$(echo "$out" | sed -n '2p'); [ $ec -eq 0 ] && first=$(echo "$out"|head -1|cut -c1-90); printf '%s\t%s\t%s\n' "$name" "$ec" "$first"; }
restore() { git checkout -q -- . ; git reset -q; git clean -fdq -e __pycache__ src gui bin newroot zz_root.py >/dev/null 2>&1; }
# 1 engine copyright line removed
sed -i '/U nits *| Copyright (C) 2026 Vítor Geraldes/d' src/core/Dictionary.cpp; run "S1 engine copyright line removed"; restore
# 2 identifier line only removed from a script
sed -i '3d' bin/header; run "S2 SPDX line removed from bin/header"; restore
# 3 accent dropped
sed -i '2s/Vítor/Vitor/' bin/header; run "S3 accent dropped in bin/header"; restore
# 4 year changed
sed -i '2s/2026/2025/' bin/header; run "S4 year 2026->2025 in bin/header"; restore
sed -i '2s/2026/1999/' bin/header; run "S4b year 1999 in bin/header"; restore
# 5 new files of each kind with no header
for f in src/core/ZzNew.cpp gui/src/zzNew.ts gui/tests/zzNew.test.ts bin/curate/zz_new.py bin/zz_new.sh gui/scripts/zz.mjs .github/workflows/zz.yml; do mkdir -p $(dirname $f); printf 'x\n' > $f; git add -N $f; run "S5 new headerless $f"; git reset -q $f; rm -f $f; done
# 6 new dir outside the roots, and a root-level script
mkdir -p newroot; printf 'print(1)\n' > newroot/x.py; git add -N newroot/x.py; run "S6 new root dir newroot/x.py"; git reset -q newroot/x.py; rm -rf newroot
printf 'print(1)\n' > zz_root.py; git add -N zz_root.py; run "S6b root-level zz_root.py"; git reset -q zz_root.py; rm -f zz_root.py
printf 'x=1\n' > src/zz.h; git add -N src/zz.h; run "S6c src/zz.h (lower-case .h)"; git reset -q src/zz.h; rm -f src/zz.h
# 7 project header on excluded files
sed -i '1i # Copyright (C) 2026 Vítor Geraldes\n# SPDX-License-Identifier: GPL-3.0-or-later' bin/curate/enrtl_ref/enrtl.py; run "S7 header on third-party IDAES enrtl.py"; restore
sed -i '1i # Copyright (C) 2026 Vitor Geraldes' bin/curate/enrtl_ref/enrtl.py; run "S7b holder WITHOUT accent on enrtl.py"; restore
sed -i '1i # SPDX-License-Identifier: GPL-3.0-or-later' bin/curate/enrtl_ref/enrtl.py; run "S7c SPDX only on enrtl.py"; restore
sed -i '1i # Copyright (C) 2026 Vítor Geraldes\n# SPDX-License-Identifier: GPL-3.0-or-later' bin/curate/enrtl_ref/enrtl_proto.py; run "S7d header on HELD enrtl_proto.py"; restore
f=$(git ls-files 'bin/curate/nanofiltran/*' | grep -iE '\.(f|f90|for|txt)$' | head -1); printf '! Copyright (C) 2026 Vítor Geraldes\n' | cat - "$f" > $S/nf.tmp && cp $S/nf.tmp "$f"; run "S7e header on nanofiltran $f"; restore
f=gui/public/THIRD_PARTY_NOTICES; sed -i '1i Copyright (C) 2026 Vítor Geraldes' $f; run "S7f header on gui/public THIRD_PARTY_NOTICES"; restore
# 8 header pushed down
python3 - <<'PY'
p="bin/header"; L=open(p,encoding="utf-8").read().split("\n"); hdr=L[1:3]; del L[1:3]; L[3:3]=["# filler"]*45+hdr; open(p,"w",encoding="utf-8").write("\n".join(L))
PY
run "S8 header below line 48 (within 4000 chars)"; restore
python3 - <<'PY'
p="bin/header"; L=open(p,encoding="utf-8").read().split("\n"); hdr=L[1:3]; del L[1:3]; L[3:3]=["# "+"f"*78]*60+hdr; open(p,"w",encoding="utf-8").write("\n".join(L))
PY
run "S8b header after ~4800 chars"; restore
# 9 header inside a string literal rather than a comment
python3 - <<'PY'
p="bin/curate/gate_claim.py"; s=open(p,encoding="utf-8").read(); s=s.replace("# Copyright (C) 2026 Vítor Geraldes\n# SPDX-License-Identifier: GPL-3.0-or-later\n","_X = 'Copyright (C) 2026 Vítor Geraldes | SPDX-License-Identifier: GPL-3.0-or-later'\n",1); open(p,"w",encoding="utf-8").write(s)
PY
run "S9 header in a string literal (gate_claim.py)"; restore
python3 - <<'PY'
p="bin/curate/gate_claim.py"; s=open(p,encoding="utf-8").read(); s=s.replace("# Copyright (C) 2026 Vítor Geraldes\n# SPDX-License-Identifier: GPL-3.0-or-later\n","# see Copyright (C) 2026 Vítor Geraldes's notes; SPDX-License-Identifier: GPL-3.0-or-later is not this file's\n",1); open(p,"w",encoding="utf-8").write(s)
PY
run "S9b both strings in one disclaiming comment"; restore
# 10 a second, foreign notice / identifier added beside ours
sed -i '2i # Copyright 2019 Someone Else, MIT licence' bin/header; run "S10 foreign notice without (C) added"; restore
sed -i '2i # Copyright (C) 2019 Someone Else' bin/header; run "S10b foreign (C) notice added beside ours"; restore
sed -i '2i # SPDX-License-Identifier: MIT' bin/header; run "S10c a second SPDX identifier (MIT)"; restore
sed -i '2s/Vítor Geraldes/Vítor Geraldes and Someone Else/' bin/header; run "S10d co-holder appended to the holder line"; restore
sed -i '2s/Vítor Geraldes/another AUTHORS name/' bin/header; run "S10e holder replaced by another AUTHORS name"; restore
# 11 kind emptied
git rm --cached -q site/sw.js; run "S11 site/sw.js untracked (site-js kind emptied)"; git reset -q site/sw.js
git ls-files '*.bat' > $S/bats; xargs git rm --cached -q < $S/bats; run "S11b every .bat untracked (batch kind emptied)"; git reset -q; 
# 12 git unavailable
mkdir -p $S/nogit; for b in python3 sed head; do ln -sf $(command -v $b) $S/nogit/$b; done
out=$(PATH=$S/nogit python3 bin/curate/check_source_headers.py 2>&1); printf 'S12 git not on PATH\t%s\t%s\n' "$?" "$(echo "$out"|tail -1|cut -c1-90)"
restore
