## A widened input rule must not lock users out of the operation that replaces the old value (🟠 Major / Greptile P2)

On #334, key inputs were tightened to reject blank/invisible codepoints anywhere (Cf, Mn, Zs, braille blank, invisible Cc). That is right for `newKey` and for
recovery keys (we generate them). It was wrong for `currentKey` in
`changeDbKeyInputSchema`: a database key created BEFORE the rule can contain an
internal space, NBSP, or combining mark. It still opens the database at startup
(the loader only enforces the new-key length; the service only requires
non-empty and then PROVES the key by re-opening the DB), so the wire-level
rejection left exactly those users with no way to rotate their key — a fix that
broke the escape hatch. Greptile flagged it P2 on the duplicate PR for the same
change.

**Always**: when you widen validation on an INPUT that names existing state,
check every consumer. Rules for the value we are about to PERSIST may be strict;
rules for the value that IDENTIFIES what already exists must stay permissive
enough to accept what earlier versions produced, and let verification (hash
compare, DB re-open, signature check) be the gate. Ask: "if a user's existing
data violates my new rule, can they still migrate off it?"

