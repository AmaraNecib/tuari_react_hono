
## Post-evidence delta 3 (merge + review-fix round, head c1a6eea)

Merged develop (conflicts with #258 debts/session rewrites resolved by adopting
develop's versions; foundation-smoke updated to the merged password locator).
Greptile inline P1/P2 comments addressed: (P1) Escape/backdrop can no longer
discard the one-time keys — only the confirm button dismisses the dialog;
(P2) generate/revoke handlers now swallow mutateAsync rejections (onError toast
already surfaces them). The third comment (isChangingKey hardcoded) was already
fixed in the earlier Greptile round. Full suite verified: contracts build,
typecheck, lint, api 686/686, web 375/375, e2e 11 pass / 2 skip (employees
deferred, #263).
