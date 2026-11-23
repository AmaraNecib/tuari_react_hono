## "Move the policy into the module" includes the allocation AFTER the validation (🟡 Minor / Greptile P2)

On #214, moving the invoice-attachment limits from the transport route into
`InventoryService` removed the duplicated constants, but the route still
converted every submitted `File` into a `Uint8Array` (`file.arrayBuffer()`) for
ALL files BEFORE calling the service, so over-limit uploads still allocated
byte copies up to the 30 MB multipart cap on the rejected path. The old route
had rejected count/total BEFORE that conversion. Greptile (4/5 → 5/5 after the
fix) flagged it as P2. The fix made `InventoryUploadFile.bytes` a **lazy
loader** that the service invokes only after its count/total/per-file/MIME
validation passes for a file that will be stored; the route hands over
metadata + a `() => file.arrayBuffer().then(...)`. Focused tests pin that the
bytes loader is never invoked on the rejected path.

**Always**: when consolidating a policy into its owning module, check whether
the transport was doing expensive work (buffering/allocation/IO) BEFORE the
module's validation. The module should own the ordering too. Pass lazy
loaders so the module validates first and only then does the expensive part.

