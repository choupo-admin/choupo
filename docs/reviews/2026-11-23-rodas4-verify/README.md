# Rodas4 verification against Hairer & Wanner's rodas.f (2026-11-23, C245 open item)

Reference: `rodas.f` as distributed with *Solving ODEs II*, read from the
luchr/ODEInterface.jl mirror (kept outside the repo; not copied here).
Choupo: `src/solver/ODE/Rosenbrock23.cpp`, `Rodas4Coeffs`, `rodas4Stages`,
and the controller in `Rosenbrock23::integrate`.  Nothing in the engine was
changed.  Script: `rodas4_verify.py [rodas.f]`; its output: `verify_output.txt`.

## Verdict

No (a) item.  All 32 constants (c2-c4, d1-d4, a21..a54, c21..c65) equal
rodas.f's `ROCOE` set METH=1 (the book's RODAS4, p. 452) to the last printed
digit (max |diff| 0; sets 2 and 3 differ by 89 and 286).  The stage
structure, the df/dt use, the error estimate and its norm equal rodas.f.  The
differences are controller and efficiency only.

## Order conditions (computed, `verify_output.txt`)

u-form converted to classical Rosenbrock form: Gamma = (I/gamma - C)^-1,
alpha = A Gamma, b^T = m^T Gamma, m = (a51..a54, 1, 1); embedded weights
m^ = m with the last entry 0.

* Main weights, all 8 conditions of order 1-4 (H&W II Table IV.7.1):
  residuals <= 1.6e-15.
* Embedded weights, order 1-3 conditions: residuals <= 2e-15; the order-4
  condition 4a is violated by 0.10, so the pair is exactly 4(3).
* d_i equal the row sums of Gamma to 4e-16; declared c2..c4 equal the row
  sums of alpha (0.386, 0.21, 0.63); stiff accuracy (alpha+Gamma)_6j = b_j to
  4e-16, b_6 = gamma = 1/4.
* L-stability: R(-1e3) = 8.7e-3, R(-1e6) = 8.8e-6, R(-1e9) = 8.8e-9 (R -> 0
  like 1/z); R(z) - exp(z) = -7e-4 z^5.
* `bin/curate/check_rodas4_order.py`: OK, observed order 4.27, 4.16 at
  h = 3/40, 3/80; stiff probe within 3.7e-7 of cos t.

## Differences, core loop

| # | rodas.f | Choupo | class |
|---|---|---|---|
| 1 | coefficient set METH=1 (default) | identical, all digits | none |
| 2 | stage equations (I/(h g) - J) u = f + sum c_ij/h u_j + h d_i f_t | same, as W u = h g r, W = I - h g J; stages 5, 6 carry no f_t; stage-5 point reused for stage 6 (+u5); y1 = y6 + u6 | none |
| 3 | ERR = sqrt(mean((u6/sk)^2)), sk = atol + rtol max(abs y0, abs y1) | same; atol floor 1e-12 when none given | (d) |
| 4 | accepted: FAC = max(1/6, min(5, ERR^0.25/0.9)), growth cap 6 | same exponent and safety; shrink floor 0.2 same; growth cap `maxGrowth` default 4; ERR floored at 1e-10 | (b) minor |
| 5 | DEFAULT is the Gustafsson predictive controller (IWORK(3)=1): from the 2nd accepted step FAC = max(FAC, (Hacc/H)(ERR^2/ERRacc)^0.25/0.9), ERRacc = max(1e-2, ERR) | classical controller only | (b) |
| 6 | after a rejection the next accepted step may not grow (HNEW = min(HNEW, H)) | no such rule | (b) |
| 7 | rejection factor >= 0.2 | floor 0.1 | (b) minor |
| 8 | on rejection Jacobian, f_t, f(y) are KEPT (`GOTO 2`): only W is refactored | f0, J, Td, W recomputed at the top of every attempt, rejected ones included | (b) one extra Jacobian per rejection |
| 9 | first step: user H (default 1e-6) | Hairer-style 0.01 ||y||/||f|| scaled | (c) |
| 10 | lands on XEND when X+1.0001H passes it | shortened to t1; hWanted/hNext bookkeeping | (c) |
| 11 | no positivity handling | positivity mask, round-off clip, reject on a negative row, non-finite reject, named hMin/maxSteps failure | (c) |
| 12 | df/dt by FD or user DFX | `fdDfDt`, zero if autonomous | (c) |
| 13 | singular W: H/2, 5 tries | h/2 until hMin | (c) |
| 14 | FD Jacobian, sqrt(uround max(1e-5,|y|)) | analytic / sparse / coloured FD, audited | (c) |

## Classification and recommendations

(a) none; nothing to fix, the constants are verified.

(b) Controller differences.  None changes order or stability; they change step
counts.  Effects NOT measured (the brief measures (a) items only); expected,
from the published design:
* #8 Jacobian reuse on rejection: saves one Jacobian and one f_t per reject;
  results byte-identical (only W changes for the new h); only Jacobian/
  evaluation counters move.  Safest; recommended first.  The analytic-Jacobian
  audit counters (C468, another session) count Jacobian calls: land it after.
* #5 Gustafsson + #6 no growth after reject: smoother step sequences, fewer
  rejections (typically 5-15 % on smooth problems); step sequences change, so
  Rodas4 cases (nox03, ignition, stiff kinetics, PFR witnesses) move at rtol
  level and their step-count rows more.  One controller slice, moved rows
  listed.
* #4 and #7: leave (maxGrowth is a dict knob, 4 a stated choice).

## Addendum: the dense-output coefficients (branch dense-output, 279a23f6e)

Compared `Rodas4DenseCoeffs` (D2[5], D3[5]) and `Rodas4Dense::eval` with
rodas.f ROCOE METH=1 (D21..D25, D31..D35) and `CONTRO`.

* All ten coefficients equal rodas.f digit by digit (D2 = 10.12623508344586,
  -7.487995877610167, -34.80091861555747, -7.992771707568823,
  1.025137723295662; D3 = -0.6762803392801253, 6.087714651680015,
  16.43084320892478, 24.76722511418386, -6.594389125716872).
* Combination: rodas.f stores c2 = sum D2j u_j, c3 = sum D3j u_j over the five
  stage increments AK1..AK5 (the same u_j of the step), and CONTRO evaluates
  y0 (1-s) + s ( y1 + (1-s) ( c2 + s c3 ) ), s = (x - xold)/h.  Choupo's `eval`
  is the same expression with the same stages.
* No difference, so no measurement on nox03's write grid was needed.
