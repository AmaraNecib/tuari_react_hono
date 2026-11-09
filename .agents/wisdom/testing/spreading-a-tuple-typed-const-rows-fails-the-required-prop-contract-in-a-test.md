## Spreading a tuple-typed `const rows = [...]` fails the required-prop contract in a test (🟡 Minor)

In `record-page-frame.test.tsx` I wrote `rows={[{ ...rows[0], detail: null }]}`
where `const rows = [ { id, typeLabel, ... } ]`. TypeScript infers a 1-tuple, so
`{ ...rows[0] }` spreads to `Partial<Row>` (`id?: string`) and the resulting object
no longer satisfies the component's required prop type `{ id: string; ... }`
(TS 2322). Fixing by adding `rows[0]` to a union won't help; annotate the fixture
as an explicit array type (`const rows: HistoryRow[] = [...]`) or inline the full
object literal.

**Always**: when a test fixture is a single-element `const rows = [{...}]` and you
spread an element to override a field, either widen the const to `Foo[]` or inline
the whole override object. Tuple-typed spreads silently strip required props.

