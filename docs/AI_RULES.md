# AI Rules for This Repository

## General
- The app already works; avoid unnecessary or risky refactors
- Preserve existing behavior unless a change is explicitly intended
- Full-file rewrites are allowed when they simplify or improve consistency
- If behavior changes, explain what changed and why

## Code Changes
- Prefer shared services/components over duplicated logic
- Standardize existing patterns instead of introducing parallel ones
- Do not delete code unless it is clearly unused or confirmed safe
- Ask before making large structural or architectural changes
- For non-trivial tasks, briefly outline the planned approach before making code changes

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
- Do NOT suggest or perform `git push`; pushing is handled manually

## Verification
- Run the dev server after significant changes
- Assume no automated tests exist; rely on runtime verification
- kill the dev server proccess connection so it can be used by the user
- Clearly state how to verify the change is correct (what pages/actions to check)
- List all files changed and the reason for each
