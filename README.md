# @inixiative/rules-builder

Headless visual rule builder for [@inixiative/json-rules](https://github.com/inixiative/json-rules).

Compose a json-rules `Condition` against a **lens** — driven by the lens's
exposed surface and the json-rules operator catalog, so the builder always offers
exactly what the engine can run. Bring your own components (slot contracts + an
example set), not bundled UI.

**Live demo:** [www.inixiative.com/rules-builder](https://www.inixiative.com/rules-builder/) — the lifecycle playground (fieldmaps → bridges → lenses → sources → builder → value picker).

## Status

🚧 Headless core done (surface adapter + condition-tree engine, typechecked &
tested); React component layer in progress.

See [PLAN.md](./PLAN.md) for the architecture and what's done vs. next.

## Related

- [@inixiative/json-rules](https://github.com/inixiative/json-rules) - Core rule engine
- [@inixiative/conditional-form](https://github.com/inixiative/conditional-form) - Render forms using rules
