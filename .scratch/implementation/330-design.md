# Local diagnostics pipeline

Base fa29d60368ba566227ebb47a83f6f5cf6983a5be. Issue #330 only, not dashboard #331 or producer/error UI. Assigned tree D:/worktrees/tuari_react_hono/t3-1779debe-5a135c0b143ecfba. Mode focused-local / CI-final-enforced, ruleset 26837184 supplied by parent. High-assurance review: untrusted archive input can write files or exhaust resources.

A normalized event preserves its offset timestamp, level, signature, operation, numeric error ID, duration, source and count. Missing metadata remains null, never guessed. Product display prefix has one constant. Numeric IDs do not depend on a product prefix.

The parseInput interface hides bounded archive decoding and folder parsing. ZIP entries are allowlisted and checked against central records, CRC and size before writing into a fresh temporary tree. Stored and deflated files are accepted; encrypted, ZIP64, link and descriptor variants fail closed. Folder chunks and manifest have byte limits; lines and events have separate limits. Malformed complete records fail; incomplete trailing JSON produces a warning. Folder inputs must be stable while read; this CLI does not provide the producer's platform-specific directory-handle pinning against hostile concurrent directory swaps.

emitReport writes an inert escaped copy of data plus a reusable script and JSON sidecar. There is no dashboard, server or network access. The inert copy is deliberate duplication to support file:// without fetch or executable bundle data. The deletion test puts archive/path/normalization complexity back into CLI callers, so the module earns its depth.

Focused Node tests exercise folder/ZIP parity, offset normalization, chunk parsing, truncation, malformed JSONL, path rejection and report escaping. Full repo gates remain CI-final. No packages or native builds required. Actual producer bundle proof and three independent lenses must be supplied before parent publication.
