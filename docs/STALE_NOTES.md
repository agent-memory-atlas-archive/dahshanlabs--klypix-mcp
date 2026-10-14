# Checking temporary file reservations

Included in klypix-mcp 1.102.0. Release receipts and publication status are tracked
by the tagged release and its publication workflow.

An agent can leave “hands off this file” in project instructions after its work
has ended. KLYPIX surfaces local work evidence beside that note so the next
session can distinguish a temporary reservation from ongoing work. It does not
decide whether a human instruction remains binding.

## Evidence and authority

| Result | Meaning |
|---|---|
| IN USE | Another observed session lists this exact file. Coordinate before overlapping edits. |
| WORK IN PROGRESS | A local branch, registered worktree, or recorded stopped-session commit has relevant work. Preserve it; coordinate or isolate changes. |
| NO WORK FOUND | The completed local check found no such work. A temporary reservation may be stale. |
| UNKNOWN | A Git probe failed, a revision is unavailable, or a search/time limit was reached. Do not infer staleness. |

These results are evidence, not permission. A generated-file policy, security
rule, permanent restriction or explicit human instruction still applies even
when the worktree is clean. For a user-authorized task and an expired temporary
reservation, the agent can continue and report the stale note. The checker
never edits or deletes the note. It does not lock files.

Structured results use `workFound: true | false | null` and
`canOverrideInstructions: false`; unknown is not represented as a negative result.

## Scope and limits

- Sources: root `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `CONVENTIONS.md`, and
  `.github/copilot-instructions.md`. Nested rules and arbitrary notes are not
  recursively scanned. A missing result is not clearance.
- Detection: reservation wording plus a file path; when files are declared or
  named by a stopped session, matching lines are also surfaced without requiring
  a reservation keyword. The agent still interprets their purpose.
- Fenced examples and KLYPIX managed blocks are skipped. Each source is limited
  to 64 KiB; at most six selected notes are assessed per hook/sync. Paths must be
  project-relative. Instruction sources resolving outside the project are skipped.
- Evidence: observed local sessions, up to 30 local branches, up to 20 registered
  worktrees (including detached and dirty worktrees), and recorded commits.
  Connected-but-idle sessions use the same activity window as the handoff list;
  heartbeats do not renew a work claim, but their unfinished commits still count.
  Squash/cherry-picked work is recognised when this file matches the target.
  Subsequent changes can make that conservative comparison report work again.
- Git reads share one cached 2.5-second budget per hook/sync; individual commands
  are capped at 750 ms. Failed or truncated evidence cannot produce NO WORK FOUND.
  Git uses literal pathspecs and optional index locking is disabled.
- It cannot see other machines, unfetched remote branches, unregistered
  worktrees, or changes made after its observation. It is not a global lock or a
  security boundary.
- Delivery: Claude/Codex SessionStart hooks and `brain_sync` start or relevant
  checkpoints. MCP-only clients must call `brain_sync`. Completion and
  `include_context:false` do not run this check.

## Validation and claims

`node test/lock-notes.mjs` uses real Git repositories and worktrees, injected Git
failures, and actual Claude/Codex hooks plus an MCP worker. It covers authority
limits, sibling and detached worktrees, unknown revisions, bounded searches,
literal filenames, self-session exclusion and context opt-out.

The inherited experiment is retained separately on `feat/bench-heldout`, under
`bench/coordination/results/stale-note-check-2026-10-13/`. It compares agent runs
with and without KLYPIX on small synthetic scenarios, not competing products.
Several scenarios informed implementation changes; only the final scenario pair
was unseen by the final inherited build. MCP-only Claude was less reliable than
hook delivery. One installed run still obeyed a dead note despite the evidence.

That experiment predates the authority and incomplete-evidence fixes described
here. It does not measure this revised version or establish “best in class.”
Before a public effectiveness claim, run a fresh held-out evaluation of this
version, include standing-rule and real-work harm cases, publish failures and
uncertainty, and follow the claims-matrix review process.
