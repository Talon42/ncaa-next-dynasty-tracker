# AI Rules for This Repository
This is the active application under development.

Rules:
- You may modify files in this repo.
- Use Repo 2 as a reference only.
- Show a plan and diffs before applying large changes.

## General
- The app already works; avoid unnecessary or risky refactors
- Preserve existing behavior unless a change is explicitly intended
- Full-file rewrites are allowed when they simplify or improve consistency
- If behavior changes, explain what changed and why

## Code Changes
- Briefly explain or summarize code changes with reasoning before asking to apply changes.
- Standardize existing patterns instead of introducing parallel ones
- For tasks, briefly outline the planned approach before making code changes

## Shared helpers
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
- When adding a tracked field/table, update both CSV import (csvImport.js) and dynasty import (layout generation + regenerate ncaa_next_required_layout.json).
- After completing a task, ALWAYS provide Git instructions in chat:
  - Exact `git checkout`, `git add`, and `git commit` commands
  - A clear, descriptive commit message

## Verification
- Clearly state how to verify the change is correct (what pages/actions to check)
- List all files changed and the reason for each
 - Do not create or run JS test scripts; provide manual/verbal verification steps only (e.g., “Load XYZ file and ensure there are no errors”).
