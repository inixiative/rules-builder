# Changelog

## 0.13.0 — bind value-source, json-rules 2.12 option adoption, hooks tested

- **Bind value-source in the rule builder** + reference renderers: a rule value can bind to context (the `{ bind }` value source), surfaced by the copy-paste reference renderers.
- **Adopt json-rules 2.12's labeled option sets.** `runSources` emits `SourceValues.options` (`{ value, label? }[]`) instead of `values: string[]`, and `describeModelFields` reads a field's selectable set from `entry.options` (folded via json-rules), so sourced fields carry human labels in the picker. The example's narrowing editor handles the `Condition | SourceSpec` union. Requires `@inixiative/json-rules@^2.12.1`.
- **Fix:** calling `remove()` on a bare array-root node no longer throws (`removeNode: cannot remove the root`) — it clears to the empty group, mirroring the leaf-root behavior. Also fixes the junk `"undefined"` node id at the array root.
- **Tests:** lifecycle coverage for all five hooks (`useRuleBuilder`, `useActionRuleBuilder`, `usePermissionBuilder`, `useTransitionBuilder`, `useLensValuePicker`) — seed-once/controlled semantics, `onChange` suppression, descriptor-tree actions, and memo stability (+42 tests, 176 total).
