# aether-mcp maintenance

Repository settings, procedures and conventions that live outside the code. Update this file when one of them changes.

The repository was set up from `aether-cli`. Its release auto-merge gate and provenance workflows are the same text as that repository's, and `aether-workflow` compares those copies every hour (`gate-copies`), so a change to one of them is made in `aether-cli` first and carried here in the same run. `release-please.yml` is not one of the compared copies: its `registry` and `release-alert` jobs exist only here, so do not re-sync it from `aether-cli`.

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
| `DISCORD_OPS_WEBHOOK_URL` | secret | repository | Where the behind bot reports a pull request it cannot update, and where `release-alert` reports a failed release |
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
- Allowed actions: `npm publish` on, `npm dist-tag` off. The publish job runs `npm publish` directly and never manages dist-tags.

If the workflow file is renamed or the publish job changes its environment, this configuration changes with it. Otherwise publishing fails with HTTP 404 from npm.

`repository.url` in `package.json` has to name this repository. npm rejects a provenance statement whose source repository differs from it, and a test in `__tests__/package.test.ts` pins the value.

## Bootstrap publish (one time, manual)

Trusted publishing needs the package to exist on npm first. The first publish is manual, from a scratch directory that holds only a minimal `package.json`, so this repository's `package.json` never carries the bootstrap version:

```sh
npm login
npm publish --access public --tag bootstrap
```

The bootstrap version is a prerelease below `0.1.0`, published under the `bootstrap` dist-tag. Once the first release is out, the version is deprecated and the dist-tag removed. It gets no git tag. The registry also holds `0.0.0-stage`, a placeholder for staged publishing published a few minutes before the bootstrap version; it is deprecated along with it.

## Release process

Releases come from release-please. Nobody pushes version tags by hand.

1. Every push to `main` runs `release-please.yml`. When `feat` or `fix` commits have landed since the last release, it opens or updates a release pull request with the version bump and the changelog. `chore`, `docs`, `test` and `refactor` commits cut no release. The first release is `0.1.0` (`initial-version` in `release-please-config.json`).
2. `auto-merge-release.yml` evaluates the release pull request on pull request events, on a schedule and on manual dispatch. It arms squash auto-merge only when every commit since the previous release is vouched for, by a `Brief-Verified:` trailer, by the `brief-verified` label on its pull request, or by being release-please's own commit, and the release is not a major bump. Otherwise the release pull request waits for a maintainer.
3. Merging the release pull request creates the tag and the GitHub release. The build job then runs the tests, builds, checks that the tag matches `package.json` and packs the tarball, and the publish job publishes it with provenance.
4. The `registry` job lists the release in the MCP Registry (next section). When any job of the run fails or is cancelled, a job timeout included, `release-alert` posts the repository, the tag and the run to the ops Discord channel through `DISCORD_OPS_WEBHOOK_URL`. When the `release-please` job failed before reporting a release, the post says so instead of naming a tag.

The gate cannot vouch for a first release, because there is no previous tag to measure from. The `0.1.0` release pull request is held by design and a maintainer merges it.

`0.1.0` is a placeholder that prints a notice and exits; `0.2.0` is the first release that carries the server. Every release after it is checked by the gate like any other, and `__tests__/package.test.ts` fails a release pull request that would cut anything between them.

The tag and the GitHub release exist before the build, publish and registry jobs run. When one of them fails, finish that same version: `gh run rerun <run id> --failed -R Monoradioactivo/aether-mcp`. The publish step skips a version npm already has and the registry job skips a version the Registry already lists, so a re-run repeats neither. A full re-run finds no new release, skips every job and ends green with nothing published, and so can a re-run of a failed `release-please` job, so check `npm view @aetherpush/mcp@<version> version` before calling it done; skipping to the next version hides the failed version's changelog from the Renovate pull request that bumps the Aether CLI. A re-run executes the workflow file of the original commit, so a fix merged afterwards does not reach it. Once a newer version is listed, re-running an older release's `registry` job publishes that version and then fails its read-back, which expects the re-run version to be the latest; that failure is expected. A release is done when `npx -y @aetherpush/mcp@<version>` from an empty folder answers `server/discover` with that version and `https://registry.modelcontextprotocol.io/v0.1/servers/io.github.Monoradioactivo%2Faether-mcp/versions/latest` answers that version, active.

## MCP Registry

The server is listed in the official MCP Registry as `io.github.Monoradioactivo/aether-mcp`. The listing is `server.json` at the repository root. The Registry checks that `mcpName` in the published `package.json` equals its `name`, so both live in this repository and `__tests__/package.test.ts` keeps them, the package identifier, the description (at most 100 characters) and the two environment variables in line. The committed `server.json` has no `version` and no `packages[0].version`: the `registry` job writes both from the release tag. release-please cannot move them, because a release commit may change an extra file only on lines that carry an `x-release-please-version` marker (`scripts/commit-provenance.mjs`), and JSON has no comments to carry one. The test fails when either key comes back or `server.json` is listed as an extra file.

The `registry` job in `release-please.yml` runs after `publish` on every release. It fetches `server.json` at the release tag with `curl`, with no checkout and no install, writes the tag's version into it, waits until npm serves `mcpName` for the new version, installs `mcp-publisher` at `MCP_PUBLISHER_VERSION` after `cosign` checks its Sigstore bundle against the Registry's release workflow, logs in with `mcp-publisher login github-oidc`, publishes, and reads `versions/latest` back, failing when the listing and `server.json` differ in any value but `$schema`, in either direction, so a value added on the Registry side fails too. The npm publish step skips a version npm already has only when its integrity equals the tarball this run built. It holds `id-token: write` and runs outside the `npm-publish` environment, so its token cannot satisfy npm's trusted publisher. Renovate bumps `MCP_PUBLISHER_VERSION` as its own `chore` pull request; an old publisher fails with `invalid audience`.

The Registry's GitHub OIDC login checks only the token's `repository_owner`. Any workflow with `id-token: write` in any repository the `Monoradioactivo` account owns can publish under `io.github.Monoradioactivo/*`, so that permission stays out of workflows that run code from pull requests.

To publish by hand when the job cannot: from a checkout at the release tag, write the version in with `jq --arg version <version> '.version = $version | .packages[0].version = $version' server.json > server.stamped.json`, `mcp-publisher login github` as `Monoradioactivo`, then `mcp-publisher publish server.stamped.json`. `mcp-publisher status --status deleted io.github.Monoradioactivo/aether-mcp <version>` withdraws a version. `curl -X POST -H 'Content-Type: application/json' --data-binary @server.stamped.json https://registry.modelcontextprotocol.io/v0/validate` checks a stamped draft without the binary.

The setup commands in `README.md` pin an exact version between `x-release-please-start-version` and `x-release-please-end` markers, and `release-please-config.json` lists `README.md` as a generic extra file, so the release pull request moves those pins to the new version. `__tests__/package.test.ts` fails when a pin differs from `package.json`. Keep other version-shaped strings, such as a client version the README names, outside the markers.

The Aether CLI depends on this package at an exact version and runs its binary in-process for `aether mcp`, requiring the `bin` path from `package.json`. That is why the package stays CommonJS, has no `main`, `exports`, dependencies or install scripts, and why a test runs the packed tarball both directly and through a `require` with `process.argv` rewritten. Renovate bumps the CLI's pin as its own pull request; a major version is never bumped there automatically.

The server sends its own version in the `User-Agent` (`aether-mcp/<version>`) and in `X-Aether-CLI-Version`. aether-server must not gate on that header: it carries this package's version, not the CLI's.

How the gate's runs are kept apart is documented once, in `aether-cli`'s `docs/MAINTENANCE.md`, for every repository that carries the workflow.

## Dependency updates

Renovate (`renovate.json`) is the only dependency updater. Dependabot is not configured.

- Schedule: before 6am on Mondays, `America/Mexico_City`, with a minimum release age of 3 days.
- Minor, patch, pin and digest updates for npm and GitHub Actions are grouped into one `weekly updates` pull request.
- Major updates wait for approval on the Dependency Dashboard issue.
- npm updates use the `chore` commit type, so they never cut a release on their own.
- A `custom.regex` manager tracks `MCP_PUBLISHER_VERSION` in `release-please.yml` against the `modelcontextprotocol/registry` releases, as its own `mcp-publisher` pull request with the `chore` type.

## CI

`.github/workflows/ci.yml` runs on pull requests to `main` and on pushes to `main`.

- `Branch name policy` (pull requests only) enforces the prefixes above.
- `Node 22` and `Node 24` run `npm ci`, lint, typecheck, build, the workflow and release gate script tests, the eval harness tests, and `npm test`.

The job names are a contract: the ruleset requires them by name, and `scripts/release-auto-merge-gate.mjs` reads `Node 22` as the required test check.
