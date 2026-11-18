# Temporary picomatch audit exception

On 2026-11-18 the owner approved a narrow exception because no fix is available: "yes for now u can merge it cause there is not fix for it". It expires at **2026-11-25T13:10:25Z**, seven days after the original approval time `2026-11-18T13:10:25Z`. The parent owns publication and any later merge decision; this change grants no bypass.

The CI audit runner may accept only high-severity `GHSA-fc5q-39xc-vjpf` findings for `picomatch` versions `2.3.2`, `4.0.4`, and `4.0.7`, and only before expiry. It still rejects every other high or critical finding, including a different advisory for picomatch. It checks each advisory and finding against pnpm's JSON report and verifies summary counts. Low and moderate findings remain in the audit output under the existing policy.

The advisory concerns a ReDoS condition. The reviewed lockfile paths are development and tooling dependencies; prior source and bundle checks found no production API import. That is limited evidence, not a guarantee that every deployment or future entrypoint is safe. This exception does not claim the code is unexploitable and does not claim an upstream fix exists. See the [upstream picomatch issue #270](https://github.com/micromatch/picomatch/pull/270).

At expiry, any matching finding fails CI, even if it is the only high finding. If the audit is clean, CI passes with a message to remove the obsolete exception. Remove the exception constant, its tests, this document, and its CI-specific policy assertion once the advisory is resolved or the deadline has passed; do not extend the deadline without fresh owner approval.
