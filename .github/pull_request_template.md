## What and why

<!-- What does this change, and why? Link issues with "Closes #N". -->

## How it was tested

<!-- New or changed tests; anything checked by hand. -->

## Checklist

- [ ] Targets `dev` (not `main`)
- [ ] Tests added or updated (a bug fix starts with a failing test)
- [ ] Documentation updated
- [ ] Website text is in `messages/en.json` and every other locale; a machine translation is marked as such
- [ ] A change to the API changes the contract (`packages/contract`) first; a breaking one is marked `!`
- [ ] A change to the schema comes with its migration (`pnpm --filter @mondarth/fvtt-package-catalogue db:generate`)
- [ ] Commit messages follow Conventional Commits, with a scope
