# ignition01_h2o2_jac — the same ignition on the analytic Jacobian

The same H₂/O₂ ignition as `ignition01_h2o2` (closed rigid vessel, 1100 K,
5 bar, O Conaire 2004 mechanism, Rosenbrock23), with one added key in the
vessel's solver block:

```
solver { integrator Rosenbrock23; verbosity 3; jacobian analytic; }
```

Run it:

```
runCase tutorials/batch/combustion/ignition01_h2o2_jac
```

## What the key changes

A Rosenbrock method solves, at every step, a linear system with the matrix
W = I − h·d·J, where J = ∂f/∂y is the Jacobian of the right-hand side over the
state y = (n₁ … n₉, T).  By default the integrator builds J by **finite
differences**: it perturbs each of the ten state entries in turn and evaluates
the whole right-hand side again — eleven evaluations per Jacobian, every one
of them recomputing 21 rate constants and 21 equilibrium constants.

With `jacobian analytic;` the reactor builds J from the rate laws themselves:

- **species columns**: ∂(dnᵢ/dt)/∂n_k = Σⱼ νᵢⱼ ∂rⱼ/∂c_k, from the derivative of
  each mass-action leg (the product of the other factors — never rⱼ/c_k, which
  would divide by a zero radical), the third-body term k₀·eff_k of R5–R9 and
  R15, the fall-off blend of R9 and R15 (Troe, differentiated in [M] alone),
  and the reverse leg k/K_c with K_c computed once per reaction;
- **the energy row** by the chain rule on those columns
  (dT/dt = −Σ uᵢ ṅᵢ / Σ nᵢ C_v,i);
- **the T column** by one difference of the whole right-hand side.

## The audit, and why it is there

Rosenbrock23 is **not** a W-method: its order conditions assume the *true*
Jacobian.  A Jacobian with a missing term does not crash anything — the steps
still pass the error test, just smaller, or less accurate — so nobody would
see it.  The run therefore **measures its claim**: at analytic Jacobians 1, 2,
4, 8, … it also builds the finite-difference one at the same state, and prints

```
[jacobian] batchReactor 'bomb': analytic Jacobian #1 AUDITED at t = ... s (T = 1100 K):
           worst column d(...)/d(...) ... of the column's scale from the finite difference
```

A column that differs by more than 1e-4 of its own scale **refuses the run by
name** (row, column, both numbers).

## What to compare

`ignition01_h2o2` and this case give the same burned state within the golden's
tolerance (1e-4 relative).  They are not byte-identical — a different J means
different W, different stage values and a slightly different step sequence —
and that is the point of the audit: the two Jacobians agree, so the two
trajectories agree to the integrator's own tolerance.

The speed is not the lesson here: with ten state entries the finite difference
is cheap.  What the analytic Jacobian buys grows with the mechanism — the
difference costs n + 1 right-hand sides per Jacobian and the analytic one a
fixed two, so a 50-species mechanism pays 51 evaluations where this pays 2.

Provenance (mechanism, thermo) is that of `ignition01_h2o2` — read its README
before you quote a number.
