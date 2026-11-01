# An explicit reverse pair is read, a bed density is applied, a stop is tested

DEV.md 4c C190 items 14, 11, 15 and 12, 2026-11-01 (an external reviewer's list,
each claim confirmed by reading AND running before anything was changed).  Code:
`src/unitOperations/batch/BatchReactor.cpp`,
`src/unitOperations/dynamic/DynamicCSTR.cpp`,
`src/propertyOps/FitParametersMembrane.cpp`,
`src/thermo/equationOfState/PCSAFT.cpp`.  Gate:
`bin/curate/check_audit_remaining.py`.

## 1. Item 14 -- a reverse leg declared and never read

**Confirmed.**  `DynamicCSTR.cpp` routes any reaction carrying `A_rev` to the shared
`RateLaw` (C131); `BatchReactor.cpp` did not: on `type Arrhenius` its own path is the
forward product alone, so `A_rev`/`Ea_rev` were accepted by the parser and ignored.
Probe: A + B -> C + D, kf = 2, kr = 1 (Ea = 0), 1 kmol of each in 1 m3, 20 s: the
vessel converted **0.9756 kmol** (the forward-only second-order law), the declared
equilibrium is sqrt(2)/(1+sqrt(2)) = **0.5858**.  Now the reaction is read by
`RateLaw` (`ReactionRate::New`, the one home of the reverse leg) and converges to
0.5858, equal to an independent RK4 to 1e-6.  Refused by name, because each would
otherwise run irreversible in silence: the pair on `modifiedArrhenius`/`thirdBody`/
`falloff` (RateLaw serves neither), the pair beside a CHEMKIN `units` block (RateLaw
does no cm-mol-s conversion), and `Ea_rev` without `A_rev` (RateLaw keys the leg on
`A_rev`).  `reversible true` (detailed balance) keeps its own path in the batch
vessel, unchanged.

## 2. Item 11 -- a declared bed density that changed nothing

**Confirmed, on BOTH vessels** (the review named the batch path; the dynamic one is
the same).  `catalystLoading` was read, announced ("the pellet is a point, eta = 1")
and multiplied into the rate only on the factory branch (LHHW, `expression`).  On the
own `Arrhenius` path loading 1 and 400 kg/m3 gave identical conversions (batch:
0.0029985 kmol in 10 ms for both).  The steady `cstr`/`pfr` apply it to every law.
Now the own path multiplies the rate constant by the loading (mol/(g s) x kg/m3 =
kmol/(m3 s)); both legs of a detailed-balance law carry it (k_rev = k/Kc).  Measured:
batch 0.0029985 -> 0.989 kmol at 400; dynamic dn_B 5.7e-6 -> 1.98e-3 kmol; both equal
independent RK4 to 1e-4 or better.  The corpus has no own-path case declaring a
loading (batch07 is LHHW), so no golden moves.

## 3. Item 15 -- the absence of a step is not a verdict

**Confirmed.**  `converged = true; "no step lowers chi2 (a minimum at the solver's
resolution)"`.  That is also how a search with a Jacobian too coarse to point
downhill ends.  Reproduced on the shipped membrane24 with `fdStep 0.1`: stopped 0.7 %
from the minimum in the pore radius, published converged, VALIDATED, and wrote a
record.  Now the stop is TESTED: the Jacobian is re-taken at a fine step
(min(fdStep, 1e-4)) and the cosine between the residual and each free column is
compared with 1e-3 (J^T r = 0 at a least-squares minimum); a column at a declared
bound whose descent direction leaves the domain is a KKT point and is not held
against the fit.  On the probe the cosine is 2.1e-2: **stalled**, exit 1, no record.
The word is published as `curation.optimiser` (`converged | stalled | maxIterations
| lawFailed`) and printed under the verdict.  **Interpretation:** the five-word
held-out verdict vocabulary (`check_verdict_parity`) is untouched -- it answers
"did the held-out evidence pass", a different question; `optimiser` answers "did the
search earn the values it ended at".  A reader must read both; the console says so.
A non-converged fit already exited 1 and refused a record (the maxIter case); a
stalled one now joins it.  Threshold 1e-3 is a measured choice on one problem
(shipped membrane24 stops by tolerance and never reaches the test); other problems
may need their own, and the stop reason prints the cosine.

## 4. Item 12 -- two roots closer than the grid

**Confirmed in a metastable window.**  `solveDensity` scans 400 intervals of eta for a
sign change of P(eta) - P.  Two roots in one interval give none.  n-hexane at 298.15 K:
the vapour branch Z(P) = Zs + c sqrt(Ps - P) ended at 5.1475 bar; its fitted fold is
5.14984 bar (the sqrt law, fitted to the engine's own branch, independent of the
scan), 235 Pa (0.05 %) early; beyond it the "vapour root" returned silently was the
liquid one.  Now a sample extremum with one sign on its three samples is located by
golden section and, when it crosses zero, becomes two brackets.  The branch now ends
4 Pa from the fitted fold.  Cost: extra evaluations only at sample extrema.  The
effect is confined to within one grid interval of a spinodal; no corpus point is
there (the PC-SAFT cases are validated by `--scope`).

## 5. Rejected

* A second reverse-leg reader in `BatchReactor` (arity: the reverse leg already has
  one home, `RateLaw`).
* A sixth word `stalled` in the held-out verdict vocabulary: it lives in five homes
  (`check_verdict_parity`) and answers a different question; a separate `optimiser`
  word beside it leaves all five untouched.
* The gradient test on the Jacobian the search itself used: with a coarse `fdStep` that
  Jacobian is exactly what is wrong, so the test would pass on the defect.
* Doubling the PC-SAFT scan to 800 intervals: it moves the blind window, it does not
  close it.

## 6. By-hand sabotages (every arm fired)

* S1 route the pair back to the own path (`ktype == "Arrhenius"` with `ownLaw` true):
  (a) converted 0.9756 vs 0.5858 -- the original defect reproduced to four digits.
* S5 disable the refusal on `thirdBody`: (c) the run dies on an unrelated missing
  sub-dictionary and does not name `IRREVERSIBLE`.
* S2 / S2b drop the loading factor (batch / dynamic): (d) 0.0029985 -> 0.0029985;
  (e) the dynamic change of n_compB equals the loading-1 value against the 400 RK4.
* S3 make the gradient test always pass: (f) fdStep 0.1 reads `converged`, exit 0.
* S4 skip the extremum refinement: (g) the branch ends 229 Pa short of its fold.

A trap met while doing it: restoring a sabotaged source with a timestamp-preserving
copy leaves the object newer than the source, so `make` rebuilds nothing and the
binary stays sabotaged -- the restore must `touch` the file.
