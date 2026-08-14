# Contributing

Thanks for helping improve Agent Bridge for Tab Management in Firefox.

## Development setup

Use Node.js 20 or newer. Fork and clone the repository, create a focused branch, then install the locked dependencies and run the complete check:

```bash
npm ci
npm run check
```

The check performs TypeScript validation, the automated tests, the production build, and Firefox extension linting. Build output is written to `dist/` and must not be committed. To create or repair the local pairing for a development session, run `npm run setup`; the token is managed automatically and must never be printed, logged, or committed.

## Pull requests

- Keep each pull request focused and explain the user-visible behavior.
- Add or update tests for behavior changes and safety boundaries.
- Run `npm run check` before submitting.
- Do not commit bridge tokens, browser data, `.env` files, packaged ZIP/XPI files, or generated `dist/` files.
- Preserve local-only networking, explicit URL validation, exact matching, and post-write verification unless the security implications are documented and reviewed.
- Update the English and Chinese documentation when user-facing setup or behavior changes.

By submitting a contribution, you agree that it is licensed under the Mozilla Public License 2.0.

## Security reports

Do not open a public issue for a suspected vulnerability. Follow [SECURITY.md](SECURITY.md).
