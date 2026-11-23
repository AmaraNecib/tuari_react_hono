## ORPC wire envelope is { json: input } / { json: output } (🟡 Minor)

The ORPC "standard" protocol wraps procedure input/output: POST {api}/rpc/{procedure}
with body `{"json": <input>}` (input null for no-input procedures); responses come back
as `{"json": <output>}`. Raw input bodies fail with "Input validation failed". Verified
empirically and against @orpc/standard-server-fetch's toFetchBody.

**Always**: when driving ORPC procedures from tests/scripts, send the envelope and
unwrap `.json`.

