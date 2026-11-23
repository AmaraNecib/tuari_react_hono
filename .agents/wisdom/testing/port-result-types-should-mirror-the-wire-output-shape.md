## Port result types should mirror the wire output shape (💡 Design Principle)

When extracting a port that backs a wire handler (issue #198: `DatabaseKeyManager`
for `changeDbEncryptionKey`), model the port's result on the wire output schema:
`{ success: true } | { success: false; error: string }`, not a bare boolean. A
boolean forces the handler to fabricate ONE failure message, which is wrong for at
least one failure mode (rekey I/O failure vs wrong current key) and lets rekey
exceptions escape as 500s. The discriminated result maps 1:1 onto the handler
return, keeps messages honest, and never throws.

