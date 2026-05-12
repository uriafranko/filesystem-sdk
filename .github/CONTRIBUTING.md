# Contributing to fs-sdk

Thanks for taking the time to contribute. This package provides a POSIX-like filesystem overlay for `files-sdk`-compatible object storage, with optional `just-bash` integration.

## Getting Started

1. Fork and clone the repository.
2. Install dependencies with `npm install`.
3. Create a branch for your change.
4. Make the smallest focused change that solves the issue.
5. Run the local checks before opening a pull request.

## Repository Layout

- `packages/fs-sdk/src` contains the library source.
- `packages/fs-sdk/src/files-sdk` contains the `files-sdk` adapter integration.
- `packages/fs-sdk/src/just-bash` contains the optional `just-bash` integration.
- `packages/fs-sdk/test` contains Vitest coverage.
- `packages/fs-sdk/examples` contains usage examples.

## Local Checks

Run these from the repository root:

```bash
npm run typecheck
npm test
npm run build
```

The pre-commit hook runs the same checks.

## Pull Requests

- Keep PRs focused on one feature or fix.
- Include tests for behavior changes.
- Update examples or README content when public usage changes.
- Describe user-visible behavior clearly in the PR body.
