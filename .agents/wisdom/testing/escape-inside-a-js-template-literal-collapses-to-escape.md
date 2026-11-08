## `ESCAPE '\'` inside a JS template literal collapses to `ESCAPE ''` (🟠 Major)

In a `sql`\`…` template, the source text `'\'` is processed by JS as an escape sequence → the SQL sees `''` (empty escape char) and SQLite throws `ESCAPE expression must be a single character`. The source must contain TWO backslashes (`'\\'` in the file) so the template emits one. **Always**: after adding an `ESCAPE` clause via a tagged template, run the query. An empty escape throws immediately.

