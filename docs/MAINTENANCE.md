# aether-mcp maintenance

Repository settings, procedures and conventions that live outside the code. Update this file when one of them changes.

The repository was set up from `aether-cli`, and its release and provenance workflows are the same text as that repository's. `aether-workflow` compares the copies every hour (`gate-copies`), so a change to one of them is made in `aether-cli` first and carried here in the same run.

## Setup still open

This file describes the configuration the repository is meant to have. One part of it is not in place yet, and the line below is deleted when that part is live:

- `@aetherpush/mcp` has no bootstrap version on npm and no trusted publisher.

## Repository configuration

**Settings → General → Pull Requests**

- Allow merge commits: disabled
- Allow squash merging: enabled
- Allow rebase merging: disabled
- Allow auto-merge: enabled
- Automatically delete head branches: enabled

**Settings → Actions → General → Workflow permissions**

- Default workflow permissions: read
- Allow GitHub Actions to create and approve pull requests: disabled. `release-please.yml` and `auto-merge-release.yml` open, update and merge pull requests with the release bot App token, not `GITHUB_TOKEN`.

**Settings → Code security**

- Secret scanning and push protection: enabled
- CodeQL: default setup

## Rulesets

`main` is the only long-lived branch, and every change lands through a squash-merged pull request. Protection lives in **Settings → Rules → Rulesets**.

"Main Ruleset", targeting `main`:

- Pull request required, with 0 approving reviews. Stale approvals are dismissed on push, and every review thread must be resolved before merging.
- Required status checks, with the branch up to date with `main`: `Branch name policy`, `Node 22`, `Node 24` and `Release auto-merge gate` from GitHub Actions, and `Commit provenance` from the `aether-provenance` App.
- CodeQL code scanning: an alert of any severity in the pull request's analysis blocks the merge.
- Branch deletion and force pushes: blocked.
- Bypass: the repository admin role, always.

"require-signed-commits", targeting every branch: every pushed commit must carry a verified signature.

"release-tags-creation", targeting `v*` tags: only the release bot App creates them.

"release-tags-immutable", targeting `v*` tags: nobody moves or deletes one.

## Branch naming policy

Branches start with `feat/`, `fix/`, `refactor/`, `chore/`, `docs/` or `test/`. release-please's own branches (`release-please--*`) are exempt: the `Branch name policy` job exits early for them. Renovate branches start with `chore/renovate-`.

## Secrets, variables and environments

| Name | Kind | Where | Purpose |
|---|---|---|---|
| `RELEASE_BOT_APP_ID` | secret | repository | App ID of the release bot, used to mint its token in the release workflows |
| `RELEASE_BOT_PRIVATE_KEY` | secret | repository | Private key of the release bot App |
| `DISCORD_OPS_WEBHOOK_URL` | secret | repository | Where the behind bot reports a pull request it cannot update |
| `RELEASE_AUTO_MERGE_ARM` | variable | repository | `true` lets `auto-merge-release.yml` arm auto-merge on a release pull request that passes the gate |
| `PROVENANCE_APP_ID` | variable | environment `provenance` | App ID of `aether-provenance` |
| `PROVENANCE_APP_PRIVATE_KEY` | secret | environment `provenance` | Private key of `aether-provenance`, which posts the `Commit provenance` check |

Both environments, `provenance` and `npm-publish`, deploy from `main` only. `npm-publish` holds no secret: publishing uses OIDC trusted publishing.

GitHub Apps installed on the repository: the release bot, `aether-provenance`, `aether-release-vouch`, `aether-renovate-dispatch` and Renovate. The workflows in `aether-workflow` mint tokens that name every product repository at once, so removing one of these Apps from this repository breaks those mints for all of them.

## npm trusted publisher

Configured at **npmjs.com → @aetherpush/mcp → Settings → Trusted Publisher**:

- Provider: GitHub Actions
- Organization or user: `Monoradioactivo`
- Repository: `aether-mcp`
- Workflow filename: `release-please.yml`
- Environment: `npm-publish`

If the workflow file is renamed or the publish job changes its environment, this configuration changes with it. Otherwise publishing fails with HTTP 404 from npm.

`repository.url` in `package.json` has to name this repository. npm rejects a provenance statement whose source repository differs from it, and a test in `__tests__/package.test.ts` pins the value.

## Bootstrap publish (one time, manual)

Trusted publishing needs the package to exist on npm first. The first publish is manual, from a scratch directory that holds only a minimal `package.json`, so this repository's `package.json` never carries the bootstrap version:

```sh
npm login
npm publish --access public --tag bootstrap
```

The bootstrap version is a prerelease below `0.1.0`, published under the `bootstrap` dist-tag and deprecated once the first release is out. It gets no git tag.

## Release process

Releases come from release-please. Nobody pushes version tags by hand.

1. Every push to `main` runs `release-please.yml`. When `feat` or `fix` commits have landed since the last release, it opens or updates a release pull request with the version bump and the changelog. `chore`, `docs`, `test` and `refactor` commits cut no release. The first release is `0.1.0` (`initial-version` in `release-please-config.json`).
2. `auto-merge-release.yml` evaluates the release pull request on pull request events, on a schedule and on manual dispatch. It arms squash auto-merge only when every commit since the previous release is vouched for, by a `Brief-Verified:` trailer, by the `brief-verified` label on its pull request, or by being release-please's own commit, and the release is not a major bump. Otherwise the release pull request waits for a maintainer.
3. Merging the release pull request creates the tag and the GitHub release. The publish job then builds, checks that the tag matches `package.json`, and publishes with provenance.

The gate cannot vouch for a first release, because there is no previous tag to measure from. The `0.1.0` release pull request is held by design and a maintainer merges it.

How the gate's runs are kept apart is documented once, in `aether-cli`'s `docs/MAINTENANCE.md`, for every repository that carries the workflow.

## Dependency updates

Renovate (`renovate.json`) is the only dependency updater. Dependabot is not configured.

- Schedule: before 6am on Mondays, `America/Mexico_City`, with a minimum release age of 3 days.
- Minor, patch, pin and digest updates for npm and GitHub Actions are grouped into one `weekly updates` pull request.
- Major updates wait for approval on the Dependency Dashboard issue.
- npm updates use the `chore` commit type, so they never cut a release on their own.

## CI

`.github/workflows/ci.yml` runs on pull requests to `main` and on pushes to `main`.

- `Branch name policy` (pull requests only) enforces the prefixes above.
- `Node 22` and `Node 24` run `npm ci`, lint, typecheck, build, the workflow and release gate script tests, and `npm test`.

The job names are a contract: the ruleset requires them by name, and `scripts/release-auto-merge-gate.mjs` reads `Node 22` as the required test check.
