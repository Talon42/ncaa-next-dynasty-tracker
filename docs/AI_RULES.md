# AI Rules for This Repository

## General
- The app already works; avoid unnecessary or risky refactors
- Preserve existing behavior unless a change is explicitly intended
- Full-file rewrites are allowed when they simplify or improve consistency
- If behavior changes, explain what changed and why

## Code Changes
- Briefly explain or summarize code changes with reasoning before asking to apply changes.
- Prefer centralized helpers when the same logic appears in 2+ places (parsing URL params, persistence, formatting, validation, etc.).
- Standardize existing patterns instead of introducing parallel ones
- Do not delete code unless it is clearly unused or confirmed safe
- Ask before making large structural or architectural changes
- For non-trivial tasks, briefly outline the planned approach before making code changes

## Shared helpers / DRY
- Prefer centralized helpers when the same logic appears in 2+ places (parsing URL params, persistence, formatting, validation, etc.).
- Before adding new per-page logic, search for an existing helper in `src/` and reuse it if it fits.
- If you create a helper, keep it:
  - Small and focused (single responsibility)
  - Pure where possible (separate read/write side effects from selection logic)
  - Named and placed consistently (e.g., `src/seasonFilter.js` for season filter behavior)
- When updating behavior, refactor existing callers to use the helper (don’t leave mixed patterns).
- Avoid helpers that hide important side effects; document any storage/URL mutations in the helper’s header comment.

## UI & Styling
- Preserve existing UI, layout, and CSS unless explicitly asked
- Do not introduce visual changes as side effects of refactors

## Workflow & Git (IMPORTANT)
- Assume the `main` branch is deployed and must remain stable
- Use a feature branch for any non-trivial or multi-file changes
- After completing a task, ALWAYS provide Git instructions in chat:
  - Whether to create a new branch or use an existing one (and why)
  - Exact `git checkout`, `git add`, and `git commit` commands
  - A clear, descriptive commit message
- When applicable, also help with releases/versioning in chat:
  - Whether to bump a version number (and where, e.g. `package.json`)
  - Exact `git tag` commands for a release (annotated tags preferred)
  - Brief release notes summary (what changed, who it’s for)
- Do NOT suggest or perform `git push`; pushing is handled manually

## Verification
- Run the dev server after significant changes
- Assume no automated tests exist; rely on runtime verification
- kill the dev server proccess connection so it can be used by the user
- Clearly state how to verify the change is correct (what pages/actions to check)
- List all files changed and the reason for each
