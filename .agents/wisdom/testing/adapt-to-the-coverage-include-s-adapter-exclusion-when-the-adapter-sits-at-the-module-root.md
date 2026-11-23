## Adapt to the coverage include's adapter exclusion when the adapter sits at the module root (🟡 Minor)

The `**/adapters/**` coverage exclusion only applies if the adapter FILE actually
lives under `adapters/`. The company module's 844-line `sqlite-company.repository.ts`
sat at the module root (every sibling was under `adapters/`), forcing 84 lines of
sqlite-driver coverage work. `git mv` + relative-import rewrites (careful: `../../`
depth changes) aligned it with the repo convention (#209) and the parent policy.
**Always**: before adding a module to the coverage include, check every storage
adapter's location. Root-level adapters either need coverage or a layout move.

