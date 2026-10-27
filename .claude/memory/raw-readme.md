---
name: raw-readme
description: Workflow rules for the memory system
metadata: 
  node_type: memory
  type: reference
  originSessionId: 76cd150f-5460-4657-bf66-63862a33f067
  modified: 2026-09-18T12:58:23.514Z
---

# LLM Wiki

A personal knowledge base maintained by Claude Code. Based on Andrej Karpathy's LLM Wiki pattern.

## Purpose

This wiki is a structured, interlinked knowledge base for the **Rishta** matchmaking project (Flutter frontend + NestJS/PostgreSQL backend).
Claude maintains the wiki. The human curates sources, asks questions, and guides the analysis.

## Folder structure

```
raw/          -- source documents (immutable -- never modify these)
wiki/         -- markdown pages maintained by Claude
wiki/index.md -- table of contents for the entire wiki
wiki/log.md   -- append-only record of all operations
```

## Ingest workflow

When the user adds a new source to `raw/` and asks to ingest it:

1. Read the full source document
2. Discuss key takeaways with the user before writing anything
3. Create a summary page in `wiki/` named after the source
4. Create or update concept pages for each major idea or entity
5. Add wiki-links (`[[page-name]]`) to connect related pages
6. Update `wiki/index.md` with new pages and one-line descriptions
7. Append an entry to `wiki/log.md` with the date, source name, and what changed

A single source may touch 10-15 wiki pages. That is normal.

## Page format

Every wiki page uses:

```markdown
# Page Title

**Summary**: One to two sentences describing this page.

**Sources**: List of raw source files this page draws from.

**Last updated**: Date of most recent update.

---

Main content here. Link to related concepts using [[wiki-links]].

## Related pages

- [[related-concept-1]]
```

## Citation rules

- Every factual claim references its source file: `(source: filename.md)`
- Note contradictions explicitly when two sources disagree
- Mark unsourced claims *needing verification*

## Question answering

1. Read `wiki/index.md` first to find relevant pages
2. Read those pages and synthesize an answer
3. Cite specific wiki pages in the response
4. Say so clearly if the answer is not in the wiki
5. Offer to file valuable answers back into the wiki

## Lint

When asked to lint the wiki: check contradictions, orphan pages, concepts missing pages, outdated claims, and format compliance. Report as a numbered list with fixes.

## Rules

- Never modify anything in `raw/`
- Always update `wiki/index.md` and `wiki/log.md` after changes
- Keep page names lowercase with hyphens (e.g. `quota-design.md`)
- Write in clear, plain language