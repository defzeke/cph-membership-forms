# Rules for agents and contributors

Read this before you read code. It is short on purpose.

## 1. Don't touch Git

- Never run `git commit`, `git push`, or `git pull`.
- Leave every change uncommitted in the working tree for a human to review.
- Read-only inspection (`git status`, `git diff`, `git log`) is fine.
- Never force-push, rewrite history, or switch branches.

## 2. Fewer comments, and write them like a human

Comments cost attention. Pay that cost only when the code can't explain itself.

- Default to no comment. Add one only for the *why*: a gotcha, a trade-off, a workaround, a constraint.
- Don't narrate what the next line already says.
- Skip AI-flavoured filler ("This function is responsible for…", "Note that…", "Here we…").
- One line if possible. Never a paragraph.
- Match the voice already in the file: plain, direct, lowercase-ish, no marketing.
- No section banners, no commented-out code, no decorative separators.
- Changing code means fixing or deleting any comment it just made false.
- Document public contracts and non-obvious decisions, not every function.

## 3. Then read the docs

After this file, open `docs/README.md`, then the doc for the area you're about to touch.

| Area | Doc |
| ---- | --- |
| Setup, env vars, migrations | `docs/02-getting-started.md` |
| Rendering, proxy, boundaries | `docs/03-architecture.md` |
| Registration flow, error messages | `docs/04-user-flow.md` |
| Where a file or route lives | `docs/05-routes-and-files.md` |
| SQL, tables, roles, questions | `docs/06-data-model.md` |
| The submit path and data access | `docs/07-backend.md` |
| Validation, cookies, limits | `docs/08-validation-and-security.md` |
| Styling, theme, banners | `docs/09-ui-and-branding.md` |
| Deploying and maintaining | `docs/10-operations.md` |

If code and docs disagree, say so instead of silently following one. Update both in the same change.
