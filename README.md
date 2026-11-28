# @aetherpush/mcp

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server for [Aether](https://aetherpush.com), over-the-air updates for React Native apps. It runs on stdin and stdout, so an AI agent can look up your apps and releases. None of its tools changes anything.

The server is in beta. It speaks protocol revision 2026-07-28, and revision 2025-11-25 for clients that open with the `initialize` handshake, such as Claude Desktop and Cursor. Within one server process, once a client has sent a 2026-07-28 request, the server refuses `initialize` with the revision it supports, so a client that probes for 2026-07-28 and then falls back to `initialize` in that process stays on 2026-07-28.

## Setup

You need Node.js 22 or later and an Aether API key. Create the key in the dashboard under API Keys and leave only the `read` scope ticked.

Add the server to your client's user-level configuration, never to a project file that gets committed. With Claude Code:

<!-- x-release-please-start-version -->

```sh
claude mcp add --scope user aether -e AETHER_MCP_API_KEY=aether_sk_live_… -- npx -y @aetherpush/mcp@0.3.0
```

That command leaves the key in your shell history. Other clients take the same command in their `mcpServers` configuration file, which keeps it out of the history:

```json
{
  "mcpServers": {
    "aether": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@aetherpush/mcp@0.3.0"],
      "env": { "AETHER_MCP_API_KEY": "aether_sk_live_…" }
    }
  }
}
```

<!-- x-release-please-end -->

Pin an exact version, as above. npx then runs that version even when another copy of the package is installed globally or in the project, and an upgrade reaches your agent only when you change the number. `npm view @aetherpush/mcp version` prints the newest. Do not use a range such as `@0` or leave the version out: npx runs any installed copy that satisfies the range, and that copy may be older than the one you meant.

The Aether CLI runs the same server as `aether mcp`, at the version of this package it pins. A client set up with `npx -y @aetherpush/cli@<version> mcp` keeps working; new setups should use this package, which installs nothing else.

## Versions

This package follows semantic versioning, and it is on 0.x while the server is in beta.

- Only a new major version removes, renames or changes an existing tool name, input, output field, one of the two environment variables below, or one of the two protocol revisions. For an output field, a change includes a new type, becoming nullable, and a new value in a field whose `outputSchema` lists its values (`outcome`, and `kind` in a metric).
- New tools, new optional inputs and new output fields can arrive in a 0.y minor release.
- `releaseMethod` and a halt's `kind` pass on text the Aether server decides. When the server adds a value, every version of this package passes it on.
- `refusal.code` and `warnings` in `preview_rollback` come from this package's copy of the server's rollback rules. They can gain values in any release, so an older version does not know a refusal the server added after it.
- The first version that carries the server is 0.2.0. Version 0.1.0 was a placeholder that only printed a notice; do not use it.

Every tool in this version is read-only. The README of each version lists the tools that version offers.

## Tools

Each tool returns its answer twice: as `structuredContent`, matching the tool's `outputSchema`, and as the same JSON in a text block. Every answer carries a `notice` field that marks which fields hold text written by people (see Security notes).

| Tool | Inputs | Answers |
|---|---|---|
| `list_apps` | none | The apps the key can read and their deployment names |
| `get_live_release` | `app`, optional `deployment` | The live release on each deployment, or on the one named |
| `list_release_history` | `app`, `deployment`, optional `limit` | Recent releases of one deployment, newest first |
| `get_release_health` | `app`, `deployment` | Install counts per release and per store binary, plus recent automatic halts and warnings |
| `preview_rollback` | `app`, `deployment`, optional `targetRelease` | What a rollback would do. It never runs one |

`app` and `deployment` are names, 1 to 255 characters.

A release, wherever a tool returns one, has `label`, `appVersion`, `description`, `uploadedAt`, `rolloutPercent`, `isMandatory`, `isDisabled`, `isAutoHalted` (`null` when the server does not say) and `releaseMethod` (`Upload`, `Promote` or `Rollback`, as the server writes them).

### list_apps

Returns `apps` (each with `name` and `deployments`), `totalApps`, `truncated` and `sharedAppsOmitted`. It lists at most 50 apps with at most 20 deployments each, and keeps the answer under 4,096 bytes, setting `truncated` when it had to leave apps out. An app shared with you whose name clashes with one of your own is listed by the server under its owner's address; this tool leaves those out and counts them in `sharedAppsOmitted`.

### get_live_release

Returns `app`, `deployments` (each with `name` and `liveRelease`, which is `null` when nothing is released), `totalDeployments` and `truncated`. Without `deployment` it covers at most 20 deployments within 4,096 bytes, with release descriptions cut to 120 characters. With `deployment` it returns that one, with the description up to 200 characters.

### list_release_history

Returns `app`, `deployment`, `totalReleases`, `releases` and `truncated`. `limit` is 1 to 20 and defaults to 10. The answer stays under 8,192 bytes, with descriptions cut to 120 characters; `truncated` says whether releases were dropped to fit. Deployments with more than 500 releases are refused with a tool error that points at the dashboard or `aether deployment history`.

### get_release_health

Returns `app`, `deployment`, `metrics`, `metricsTruncated` and `halts`. Each metric has `label`, `kind` (`release` for an over-the-air release, `binary` for devices still on a store binary, labelled by app version), `active`, `downloaded`, `installed` and `failed`. It keeps at most 20 labels, the five newest app versions among them, newest first. `halts` holds up to 10 recent automatic halts and warnings, each with `kind`, `label`, `occurredAt`, `servedDevices`, `failedDevices` and `isActive`.

### preview_rollback

Returns `app`, `deployment`, `executed` (always `false`), `outcome` (`would_roll_back` or `would_be_refused`), `refusal` (a `code` and a `reason` when refused), `currentRelease`, `targetRelease`, `newRelease`, `warnings`, `notChecked` and `rulesSource`. Without `targetRelease` it previews a rollback to the release before the current one. The rules are a copy of the server's, so the server stays authoritative: `notChecked` lists what the preview cannot know, and a real rollback can still be refused. Run the rollback itself from the dashboard or the CLI.

## Environment

- `AETHER_MCP_API_KEY` (required) must be an API key, `aether_sk_live_…`. Access keys and CLI sessions are refused, because they carry every scope.
- `AETHER_MCP_API_URL` (optional) defaults to `https://api.aetherpush.com`. It must be the server's https root URL with no path, query or credentials; plain http is accepted only on `127.0.0.1` or `[::1]`. The CI variable `AETHER_API_URL` is not read; when it is set and this one is not, the server says so on stderr.

stdout carries MCP messages only. Diagnostics go to stderr, prefixed `[aether mcp]`, which is the server's name in every message it writes. `--help` prints the variables on stderr.

## Security notes

- The tools only read. A `read` key cannot change anything, but the REST API still shows it deployment keys when its issuer's role can read them, so issue the key from an account whose role on each app is the lowest that answers your questions.
- The `aether login` session in `~/.aether/credentials.json` has every scope. An agent that also has shell access on that machine can read it, so give the client only the Aether tools when you can.
- Release descriptions, labels, app versions and app and deployment names are written by your collaborators or reported by devices. Treat them as untrusted text: the server strips hidden characters, caps their length and marks them in every answer's `notice`, but it cannot stop a description from containing instructions aimed at the agent.
- Deployment keys, blob URLs, package hashes and collaborator emails never reach the agent.
- The server makes at most 3 API calls per tool call and 20 per minute, and pauses when the tenant's remaining request budget drops to 10, so an agent cannot spend the rate limit your CI shares. Pauses last at most 60 seconds.

Report a vulnerability as [SECURITY.md](SECURITY.md) describes.

## Troubleshooting

- **The key is refused.** The tool call returns an error result, not a broken connection: "The Aether API at api.aetherpush.com rejected the API key: it is unknown, expired or revoked." Create a new `read` key, and check that `AETHER_MCP_API_URL` names the server that issued it. After a refusal the server waits a minute before it tries the key again.
- **A configuration error.** A missing or malformed key, a bad URL or a Node.js older than 22 does not stop the server: it answers discovery and `initialize`, logs the reason on stderr and returns it as the error of every tool call.
- **The client reports a broken stream or a server that exits at once.** Something other than this server wrote to stdout. The usual cause is an unpinned or ranged `npx` that ran an older installed copy, or a bare `aether` command from a CLI older than 0.13.0, which prints its help. Pin an exact version and check what runs with `npx -y @aetherpush/mcp@<version> --help`.
- **A rate-limit message.** The server's own budget or the tenant's was reached; the message says when to retry.
- **The client says the server implements MCP 2026-07-28 only.** The client opened with `initialize` and reached a version of this package from before it answered that handshake, or `aether mcp` from a CLI that pins one. The [changelog](CHANGELOG.md) names the first version that answers it; pin that version or a newer one.

## Development

Node 22 or newer.

```sh
npm ci
npm run lint
npm run typecheck
npm test
```

`npm test` builds first, because the stdio suite runs the built binary and the package suite runs the packed tarball. The tool-selection eval runs the built binary against a local seeded server:

```sh
AETHER_MCP_API_KEY=… AETHER_MCP_API_URL=http://127.0.0.1:3000 node scripts/mcp-tool-selection-eval.mjs results.json
```

Repository settings and the release process are in [docs/MAINTENANCE.md](docs/MAINTENANCE.md).

## License

MIT
