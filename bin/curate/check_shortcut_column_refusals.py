#!/usr/bin/env python3
"""The FUG shortcut refuses what it used to substitute for, and says why.

WHAT THIS GATE IS ABOUT.  `shortcutColumn` had three places where an absence
came back as a number, all at exit 0 with a plausible answer:

  (1) THE FEED BUBBLE POINT.  `Tref = bub.converged ? bub.T : Tf` -- a bubble
      point that failed fell back on the feed's DECLARED temperature.  That is
      the method's ONLY thermodynamic evaluation: every relative volatility,
      and hence N_min, theta, R_min, N and the feed stage, comes from it.  A
      failed bubble point therefore did not produce an error, it produced a
      column designed for a different mixture state.
  (2) THE OPERATING REFLUX.  `R = 1.3 * Rmin` with the comment "sensible
      default".  It IS the usual heuristic, which is what made the silence
      expensive: the stage count a student reads off the output was decided by
      a number they never chose and cannot defend.  BOTH corpus cases already
      declare `refluxFactor 1.3`, so the default branch was reached by nothing
      -- an unexercised branch is one nothing tests.
  (3) THE FEED STAGE.  Kirkbride needs the heavy key present in the distillate
      and the light key in the feed.  When it could not be formed, `feed_stage`
      was published as 0.0 -- and stage 0 is not a stage, it reads as the top
      of the column.  Absent and zero are different claims.

All three now refuse or withhold BY NAME, each naming the remedy.

WHAT THIS GATE DOES NOT CHECK.  Nothing about whether FUG's answer is RIGHT --
the method's accuracy is Gilliland's correlation's, and no anchor here bears on
it.  It does not check the products' temperatures, which are still both set to
the FEED bubble point (a separate, recorded gap: a total condenser's distillate
leaves at its own bubble point, not the feed's).  And arm (c) does NOT exercise the
withholding: reaching it needs the heavy key absent from the distillate or the
light key absent from the feed, and BOTH are refused earlier by Underwood's
no-sign-change check.  So `feed_stage 0.0` was LATENT and never actually
published; the withholding is a guard against that ordering changing, and this
arm pins the unreachability instead of claiming coverage it lacks.
"""
import os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASE = os.path.join(ROOT, 'tutorials/steady/distillation/shortcut01_benzene_toluene')
SOLVE = os.path.join(ROOT, 'choupoSolve')

def run(case):
    p = subprocess.run([SOLVE, case], capture_output=True, text=True, timeout=300)
    return p.returncode, p.stdout + p.stderr

def probe(tmp, edit, rel='system/flowsheetDict'):
    """Copy the witness, apply `edit` to one of its files, return (rc, out)."""
    d = os.path.join(tmp, 'probe')
    if os.path.isdir(d): shutil.rmtree(d)
    shutil.copytree(BASE, d)
    f = os.path.join(d, rel)
    s = open(f).read()
    s2 = edit(s)
    if s2 == s:
        sys.exit("FAIL check_shortcut_column_refusals: a probe edit changed "
                 "nothing -- the gate is not testing what it says it is.")
    open(f, 'w').write(s2)
    return run(d)

def main():
    if not os.path.exists(SOLVE):
        sys.exit("FAIL check_shortcut_column_refusals: choupoSolve not built.")
    bad = []
    with tempfile.TemporaryDirectory() as tmp:

        # -- the NEGATIVE: the shipped witness still runs and still answers ---
        rc, out = run(BASE)
        if rc != 0:
            bad.append("the shipped witness no longer runs (rc=%d)" % rc)
        if 'Shortcut Column (FUG)' not in out:
            bad.append("the witness printed no FUG report")
        if 'feed at stage' not in out:
            bad.append("the witness did not publish a feed stage -- the "
                       "withholding branch has swallowed a live case")

        # -- (a) no reflux declared -> refuse, naming BOTH keys and R_min -----
        rc, out = probe(tmp, lambda s: re.sub(r'refluxFactor\s+[\d.]+\s*;', '', s))
        if rc == 0:
            bad.append("(a) a case declaring NO operating reflux ran to "
                       "completion -- the 1.3*R_min default is back")
        for want in ('refluxFactor', 'refluxRatio', 'no operating reflux'):
            if want not in out:
                bad.append("(a) the refusal does not mention %r" % want)
        if not re.search(r'R_min for this feed[^.]*is \d', out):
            bad.append("(a) the refusal does not quote the computed R_min, so "
                       "the author cannot pick a factor from it")

        # -- (b) bubble point cannot converge -> refuse, never substitute -----
        #    A pressure far above the mixture's critical region leaves no
        #    bubble point to find.
        #  The feed's pressure lives in `0/feed`, not the flowsheetDict.
        def hike_P(s):
            return re.sub(r'^P\s+\S+\s*(\S*)\s*;', 'P 500 bar;', s,
                          flags=re.M)
        rc, out = probe(tmp, hike_P, rel='0/feed')
        if rc == 0:
            bad.append("(b) a case whose feed bubble point cannot be found ran "
                       "to completion -- the silent fallback to the feed's "
                       "declared temperature is back")
        else:
            if 'FEED BUBBLE POINT did not' not in out:
                bad.append("(b) the run failed but not with the bubble-point "
                           "refusal; got: " + out.strip().splitlines()[-1][:160])
            for want in ('every relative volatility', 'Remedies'):
                if want not in out:
                    bad.append("(b) the refusal does not mention %r" % want)

        # -- (c) the Kirkbride withholding branch is LATENT, and this arm
        #    says so rather than claiming to exercise it.  Reaching it needs
        #    xD[HK] == 0 or z[LK] == 0, and BOTH are refused EARLIER, by
        #    Underwood's own no-sign-change refusal (which is itself already
        #    explicit that it will not fall back on the bracket midpoint).
        #    So `feed_stage 0.0` was never actually published: the defect was
        #    latent, the withholding is a guard against the ordering changing,
        #    and crediting it with coverage it does not have would be the
        #    error this project keeps finding in its own gates.
        for name, edit in (
            ("no heavy key in the feed",
             lambda s: re.sub(r'toluene\s+\S+\s+\S+;', 'toluene 0 kmol/h;', s)),
            ("no light key in the feed",
             lambda s: re.sub(r'benzene\s+\S+\s+\S+;', 'benzene 0 kmol/h;', s)),
        ):
            rc, out = probe(tmp, edit, rel='0/feed')
            if rc == 0:
                bad.append("(c) a case with %s ran to completion -- if it now "
                           "reaches Kirkbride, this arm must be rewritten to "
                           "exercise the withholding for real" % name)
            elif "Underwood's equation does not change sign" not in out:
                bad.append("(c) a case with %s is no longer refused by "
                           "Underwood; the withholding branch may have become "
                           "reachable and this arm is stale" % name)

    if bad:
        print("FAIL check_shortcut_column_refusals:")
        for b in bad: print("  " + b)
        return 1
    print("OK check_shortcut_column_refusals: the witness still answers; a case "
          "with no declared reflux is refused naming both spellings and the "
          "computed R_min; a feed whose bubble point cannot be found is refused "
          "instead of falling back on the declared temperature; and an "
          "an unformable feed stage is WITHHELD rather than published as 0 -- "
          "but that last branch is LATENT, not live: both routes to it are "
          "refused earlier by Underwood, so arm (c) pins the unreachability "
          "and NOT the withholding itself.  Says nothing about whether FUG's "
          "answer is right, and does not cover the product temperatures "
          "(both still the FEED bubble point).")
    return 0

if __name__ == '__main__':
    sys.exit(main())
