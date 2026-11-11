# Checks run on this public copy

Run on 2026-11-11 with Node 24.20 and npm 11.19 on macOS.

| Check | Command | Result |
|-|-|-|
| Install | `npm ci` | OK |
| Lint | `npm run lint` | **Pass** after `eslint --fix` removed unused imports that were already in the export |
| Production build | `npm run build` | **Pass** |
| Demo logic tests | `node --test demo/policy.test.mjs` | **5/5 pass** (parser, answer-key separation, score clamp, confidence review, assessment cleanup) |
| Type check | `npx tsc -p jsconfig.json` | 729 errors, **the same as the unmodified export** |
| Dependency audit | `npm audit --omit=dev` | 14 advisories (7 moderate, 6 high, 1 critical) in the export's dependency versions; not changed |
| Secret and identifier scan | `grep` for key/token/JWT patterns, emails, school and district names, Drive file IDs, the Base44 app ID, record IDs | No matches outside placeholders |
| Demo network isolation | Browser `fetch()` to an outside site and to the demo's own server | Blocked by `connect-src 'none'` |
| Screenshot review | Viewed every file in `docs/screenshots/` | Fictional samples only |

## Not verified

- The settings-based replacements haven't been run against a Base44 backend or Google Drive.
- No AI model was called while preparing this copy.
