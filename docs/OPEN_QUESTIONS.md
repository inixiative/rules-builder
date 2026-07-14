# Open questions

Design considerations captured but not yet resolved. Not commitments — parking lots.

## Splitting one physical source into logical sub-sources by a `where`

**The scenario.** A single physical table is really N logical sources stitched
together, split by a column. The canonical case is a shared EAV / enrichment
table — `customFields` (or `enrichments`) — that holds data from several
integrations, distinguished by a `source` / `integrationId` column: "here are the
custom fields for integration A, and here are the custom fields for integration
B." Very common wherever a CDP or enrichment layer exists.

**What already works.** This is the same `where`-slice the collection facets use,
lifted one level. A collection facet slices `customFields where key=nps` down to
one field ("NPS"); a source-split slices `customFields where source=A` into a
scope, and a field-slice `key=nps` names a field inside it. The emitted rule is
just `customFields any (source=A AND key=nps AND value…)` — a shared leading
`where` (the split) plus the facet's own `where` (the field), which is exactly the
leading-prefix composition `matchFacet` already handles. So it is fully
**expressible today, by hand**: author each facet with the combined
`where: {all:[source=A, key=nps]}`. Two facets, two `source` values, done.

**Demonstrated (manual form).** The hand-authored split works today, no new
primitive — see `test/sourceSplit.test.ts`. Each integration is a facet whose
fixed `where` leads with the system slug: `where: {all:[slug=salesforce, key=nps]}`
vs `slug=gong`. The two are collision-free (distinct leading blocks), each seeds
`customFields any (slug=… AND key=nps AND value…)`, evaluates only on its own
source's rows, and rehydrates back to its own name. So the answer to "just define
both sources" is: yes, author two facets, done.

**Demonstrated (N tagged sources + adjoin).** `test/multiSourceAdjoin.test.ts`
extends this to three sources (System A/B/C by a `system` slug), each with its own
tag (`label` + `icon`), and shows the deeper point: because each source is a
`where`-slice of the *same* relation, the relation can be **adjoined N times in one
rule** — `all:[customFields any (system=a …), customFields any (system=b …),
customFields any (system=c …)]`. Each slice is traversed independently, evaluates
only on its own system's rows, and the whole adjunction fails if any one system
lacks a qualifying row. The sources compose for free — no primitive was added to
make them compose; it falls out of "a facet is a slice."

**What's missing (the small part).** Only ergonomics: declaring `slug=salesforce`
once instead of repeating it in every facet, and grouping the picker into
"Salesforce / Gong" sections. A `scope` concept in the decoration — a shared
leading `where` + group label that facets attach to — would cover it, and it reuses
the existing where-machinery with almost no new mechanism. Deferred pending a real
need; the hand-authored form above is available now.

**Sources *do* carry filters** (confirmed by reading `LensNarrowing.sources`): a
`sources` entry is `fieldName → { where: Condition, label? }` — an eligibility
`where` plus an optional label column, so a sourced `key`/`slug` field can be
filtered to enumerate only one integration's values. Two caveats: it's keyed by
*field* (one filtered source per field per narrowing node, not naturally "two
sources on the same field"), and it supplies option *values* only — the
presentation split into named sources is still the decoration's job.

**What's *not* possible: auto-discovery.** You cannot enumerate the logical sources
from the data automatically. The lens knows *types*, and sourced-fields
(`SourceValues`) surface the *distinct values* of a column — but a `SourceValues`
is only `{ path, mapName, model, field, options: {value, label?}[] }`. The options
are a flat value/label list with **no provenance**: nothing says `source='sf_9'`
means "Salesforce" or that it exposes keys `[nps, arr, industry]`. That
semantic mapping (source-value → integration name → its field set) is not in the
lens and cannot be derived from sources. It would have to be authored in the
decoration or come from a separate data + naming layer. So: the *split* is
authored-expressible; the *discovery* is a genuinely separate feature that needs a
metadata source the lens doesn't have. Don't conflate the two.

**Boundary.** This is a Decoration (presentation/curation) concern, not a lens
narrowing. The lens's `where` is a *security* scope (which rows are admitted,
filter-first, server-enforced); splitting a *visible* table into named views is
curation. If the split must be tamper-proof (A must not see B's rows), that's a
lens narrowing job with a different guarantee, not a decoration.
