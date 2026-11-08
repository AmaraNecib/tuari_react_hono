# Review workflow

Use [the engineering workflow](docs/engineering-workflow.md) and
`feature-implement`. They define affected local proof, committed-source reviews,
bounded correction rounds and current-head hosted acceptance.
Greptile is the scored review gate; no separate local confidence score is required.

Review reports remain ignored and local. Do not commit or post them.
A worker never publishes or merges. Publication and merge require parent
authority and the applicable owner acceptance gates.
