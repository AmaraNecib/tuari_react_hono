## Evidence files carry the head SHA, so the evidence commit must be LAST (🟡 Minor)

On #348, review evidence was renamed to the "final" SHA after the review fix
loop, but the rename commit itself advances HEAD, so the evidence SHA no
longer equals HEAD. The guard's staleness check handles this: it inspects
`git diff <evidence-sha> HEAD --name-only` and exempts `.scratch/` changes, so
the evidence stays valid. Still, the cleanest sequence is:

1. Do ALL code fixes (including review-driven ones) first.
2. Write the evidence files with the then-current HEAD SHA.
3. Make the evidence commit (and nothing else) the final commit before push.

If you must rename evidence after a later commit, rename + amend the delta
note in the same commit that would otherwise orphan the old SHA, and remember
the `.scratch/` exemption means a rename-commit is never a staleness problem
on its own.

**Always**: before pushing, run `git rev-parse HEAD`, extract the SHAs from
`.scratch/reviews/<id>/*.md` filenames, and diff `git diff <sha> HEAD
--name-only`. If anything outside `.scratch/`, `.gitignore`, `.gitattributes`,
LICENSE changed, regenerate the evidence.
