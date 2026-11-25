# Security

## Reporting a vulnerability

Do not open a public issue for a vulnerability. Email hello@aetherpush.com with "Security" in the subject and include:

- The package version (the version you pinned, or `serverInfo.version` in a `server/discover` answer) and your Node.js version.
- What an attacker can do, and the steps or a proof of concept that show it.
- Whether the issue needs a malicious collaborator, a malicious device, or a compromised API key.

Fixes ship as a new release of this package; the Aether CLI picks them up through its pinned dependency.

## Supported versions

Only the newest release gets fixes. Version 0.1.0 is a placeholder without the server.

## Scope

In scope: this server's handling of the API key, the text it passes to the agent, the limits it puts on API calls, and anything it writes to stdout or stderr.

Out of scope here, report them the same way: the Aether API itself, the dashboard, and the CLI. What an agent does with the answers is up to the client you run it in.
