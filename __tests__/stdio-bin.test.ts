import { spawn } from "child_process";
import { existsSync } from "fs";
import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import { AddressInfo } from "net";
import * as path from "path";

const BIN = path.resolve(__dirname, "../dist/cli.js");
const KEY = "aether_sk_live_binTestKey42";
const META = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} };

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(args: string[], env: NodeJS.ProcessEnv, lines: unknown[] = []): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: { PATH: process.env.PATH, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    for (const line of lines) {
      child.stdin.write(`${typeof line === "string" ? line : JSON.stringify(line)}\n`);
    }
    child.stdin.end();
  });
}

function jsonRpcLines(stdout: string): any[] {
  expect(stdout.endsWith("\n")).toBe(true);
  return stdout
    .slice(0, -1)
    .split("\n")
    .map((line) => {
      const message = JSON.parse(line);
      expect(message.jsonrpc).toBe("2.0");
      return message;
    });
}

describe("the built aether-mcp bin", () => {
  let stub: Server;
  let url: string;
  const hits: string[] = [];

  beforeAll(async () => {
    if (!existsSync(BIN)) {
      throw new Error(`${BIN} is missing. Run npm run build first; npm test runs it as pretest.`);
    }
    stub = createServer((req: IncomingMessage, res: ServerResponse) => {
      hits.push(`${req.method} ${req.url} ${req.headers["user-agent"]}`);
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json", "x-ratelimit-remaining": "50", "x-request-id": "req_bin" });
        res.end(JSON.stringify(body));
      };
      if (req.url === "/v1/apps") return json(200, { apps: [{ name: "Shop", deployments: ["Production"] }] });
      if (req.url === "/v1/apps/Locked/deployments") return json(401, { code: "session_or_key_invalid", error: "SERVER TEXT" });
      return json(404, { code: "not_found" });
    });
    await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => stub.close(() => resolve()));
  });

  test("stdout carries only JSON-RPC for discovery, listing, calls and errors", async () => {
    const result = await run([], { AETHER_MCP_API_KEY: KEY, AETHER_MCP_API_URL: url, NODE_DEBUG: "module" }, [
      { jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: META } },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: META } },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { _meta: META, name: "list_apps", arguments: {} } },
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { _meta: META, name: "get_live_release", arguments: { app: "Locked" } } },
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { _meta: META, name: "no_such_tool", arguments: {} } },
      "{not json",
    ]);
    expect(result.code).toBe(0);
    const messages = jsonRpcLines(result.stdout);
    const byId = new Map(messages.filter((m) => "id" in m).map((m) => [m.id, m]));
    expect([...byId.keys()].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(byId.get(1).result.supportedVersions).toEqual(["2026-07-28"]);
    expect(byId.get(1).result._meta["io.modelcontextprotocol/serverInfo"].version).toMatch(/^\d+\.\d+\.\d+/);
    expect(byId.get(2).result.tools).toHaveLength(5);
    expect(byId.get(3).result.structuredContent.apps).toEqual([{ name: "Shop", deployments: ["Production"] }]);
    expect(byId.get(4).result.isError).toBe(true);
    expect(byId.get(4).result.content[0].text).toMatch(/rejected the API key/);
    expect(byId.get(5).error.code).toBe(-32602);
    expect(messages.filter((m) => !("id" in m)).map((m) => m.error.code)).toEqual([-32700]);
    expect(hits.some((hit) => hit.startsWith("GET /v1/apps aether-mcp/"))).toBe(true);
    expect(result.stderr).toMatch(/Module\._load REQUEST \.\/server /);
    expect(result.stderr.includes(KEY)).toBe(false);
  });

  test("a client that opens with initialize gets the 2025-11-25 session, with every line written at once", async () => {
    const result = await run([], { AETHER_MCP_API_KEY: KEY, AETHER_MCP_API_URL: url }, [
      {
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "c", version: "1" } },
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_apps", arguments: {}, _meta: { progressToken: 1 } } },
      { jsonrpc: "2.0", id: 3, method: "ping" },
    ]);
    expect(result.code).toBe(0);
    const byId = new Map(jsonRpcLines(result.stdout).map((m) => [m.id, m]));
    expect([...byId.keys()].sort()).toEqual([0, 1, 2, 3]);
    expect(byId.get(0).result.protocolVersion).toBe("2025-11-25");
    expect(byId.get(0).result.serverInfo.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(Object.keys(byId.get(1).result)).toEqual(["tools"]);
    expect(byId.get(1).result.tools).toHaveLength(5);
    expect(byId.get(2).result.structuredContent.apps).toEqual([{ name: "Shop", deployments: ["Production"] }]);
    expect("resultType" in byId.get(2).result).toBe(false);
    expect(byId.get(3).result).toEqual({});
  });

  test("a 2026-07-28 probe followed by initialize keeps the refusal a 2026-07-28 client recovers from", async () => {
    const result = await run([], { AETHER_MCP_API_KEY: KEY, AETHER_MCP_API_URL: url }, [
      { jsonrpc: "2.0", id: "server-discover-probe-1", method: "server/discover", params: { _meta: META } },
      {
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "c", version: "1" } },
      },
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: META } },
    ]);
    expect(result.code).toBe(0);
    const byId = new Map(jsonRpcLines(result.stdout).map((m) => [m.id, m]));
    expect(byId.get("server-discover-probe-1").result.resultType).toBe("complete");
    expect(byId.get(0).error).toEqual({
      code: -32022,
      message: "This server implements MCP 2026-07-28 only, which has no initialize handshake.",
      data: { supported: ["2026-07-28"], requested: "2025-11-25" },
    });
    expect(byId.get(1).error.code).toBe(-32602);
    expect(byId.get(2).result.resultType).toBe("complete");
  });

  test("a configuration error keeps stdout clean and fails each call as a tool error", async () => {
    const result = await run([], { AETHER_MCP_API_KEY: "opaque-access-key" }, [
      { jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: META } },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { _meta: META, name: "list_apps", arguments: {} } },
    ]);
    expect(result.code).toBe(0);
    const messages = jsonRpcLines(result.stdout);
    expect(messages.map((m) => m.id)).toEqual([1, 2]);
    expect(messages[1].result.isError).toBe(true);
    expect(result.stderr).toMatch(/must be an API key/);
    expect(result.stderr.includes("opaque-access-key")).toBe(false);
  });

  test("the server logs which origin it serves and warns about the CI URL variable", async () => {
    const result = await run([], { AETHER_MCP_API_KEY: KEY, AETHER_API_URL: "https://staging.example.com" });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/AETHER_API_URL is set but aether mcp reads AETHER_MCP_API_URL only/);
    expect(result.stderr).toMatch(/serving read-only tools for https:\/\/api\.aetherpush\.com/);
  });

  test("--help prints the beta usage to stderr and exits 0", async () => {
    const result = await run(["--help"], {});
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/^Usage: aether mcp/);
    expect(result.stderr).toMatch(/Beta\./);
  });

  test("an unknown argument exits 2 with nothing on stdout", async () => {
    const result = await run(["--verbose"], {});
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/takes no arguments/);
  });
});
