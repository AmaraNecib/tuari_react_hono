## toMatchObject on ARRAYS requires equal length: use arrayContaining for content pins (🟠 Major)

On #278 the wire-gate error-shape pin failed with a confusing diff: expected
`data.issues: [{path:["name"],...}]` (1 element), received 3 issues. All fields
matched per-element, but vitest's `toMatchObject` matches arrays by LENGTH as
well. A 1-element expected array never matches a 3-element received array,
even though every element is a partial match. The fix is
`data: { issues: expect.arrayContaining([expect.objectContaining({ path: ["name"], message: expect.any(String) })]) }`, tolerant of extra issues AND zod-internal fields (code/minimum/origin/...).
`expect.any(String)` works fine inside toMatchObject for scalar values; it's
arrays where the length trap lives.

**Always**: when a `toMatchObject` pin targets an array field whose contents
can vary in length, wrap the array in `expect.arrayContaining([...])`. A
bare array literal silently requires exact length and produces a misleading
structural diff.

