## Entropy gates must be calibrated to finite-sample distributions, not theoretical maxima (🟠 Major)

#273's first secret-strength gate required Shannon entropy ≥ 4.0 bits/char.
Theoretical max for hex is 4.0 bpc, but empirical entropy of FINITE random
hex samples is 3.6–3.9 bpc (finite-sample bias). Simulation showed the gate
would reject the app's own `OsRng`/`openssl rand -hex` secrets: 18.6% of
32-char, 0.9% of 48-char, 0.02% of 64-char samples fall below 4.0 bpc →
intermittent API startup failure. Greptile round 1 caught it. Fixed with a
2.0 bpc floor + ≥8 distinct-character diversity rule: P(fail) = 0 over 500k
hex samples at lengths 20–96, while degenerates (single symbol, repeated
4-symbol groups) and shipped placeholders are still rejected.

**Always**: when gating on entropy, calibrate the threshold against the
actual generation path's distribution by simulation BEFORE shipping. A
gate at the alphabet's theoretical maximum will reject real random output.
Pair entropy with a distinct-character/pattern rule so diverse-but-degenerate
strings (e.g. `password`×4) don't pass.

