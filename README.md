# @aetherpush/mcp

Model Context Protocol server for [Aether](https://aetherpush.com), over-the-air updates for React Native apps.

## Status

This package does not ship the server yet. Its binary prints where the server lives today and exits with a failing status.

Until the first release that carries it, the server ships with the Aether CLI:

```sh
npx -y @aetherpush/cli mcp
```

See the [CLI README](https://github.com/Monoradioactivo/aether-cli#mcp-server-beta) for the tools it exposes and how to connect a client.

## Development

Node 22 or newer.

```sh
npm ci
npm run lint
npm run typecheck
npm test
```

`npm test` builds first, because one suite runs the built binary.

Repository settings and the release process are in [docs/MAINTENANCE.md](docs/MAINTENANCE.md).

## License

MIT
