import { execFileSync, spawn } from "node:child_process";
import { accessSync, constants, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(__dirname, "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const releaseConfig = JSON.parse(readFileSync(join(root, "release-please-config.json"), "utf8"));
const readme = readFileSync(join(root, "README.md"), "utf8");
const META = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} };
const DISCOVER = `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: META } })}\n`;
const SPAWN_TIMEOUT_MS = 20_000;
const PIN = /@aetherpush\/mcp@(\d+\.\d+\.\d+)/g;
const MARKED_BLOCK = /<!-- x-release-please-start-version -->[\s\S]*?<!-- x-release-please-end -->/g;

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runNode(args: string[], cwd: string, input: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: { PATH: process.env.PATH, AETHER_MCP_API_KEY: "aether_sk_live_packageTest0", AETHER_MCP_API_URL: "http://127.0.0.1:9" },
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
    child.stdin.end(input);
  });
}

function discoverAnswer(result: RunResult): { version: string } {
  expect(result.code).toBe(0);
  const lines = result.stdout.trimEnd().split("\n");
  expect(lines).toHaveLength(1);
  const message = JSON.parse(lines[0]);
  expect(message.jsonrpc).toBe("2.0");
  expect(message.id).toBe(1);
  return message.result._meta["io.modelcontextprotocol/serverInfo"];
}

describe("the published package", () => {
  it("is @aetherpush/mcp and names this repository, which npm provenance checks", () => {
    expect(manifest.name).toBe("@aetherpush/mcp");
    expect(manifest.repository).toEqual({
      type: "git",
      url: "git+https://github.com/Monoradioactivo/aether-mcp.git",
    });
  });

  it("ships only the build output, the README and the license", () => {
    expect(manifest.files).toEqual(["dist/", "README.md", "LICENSE"]);
  });

  it("starts its version line at 0.1.0", () => {
    expect(releaseConfig["initial-version"]).toBe("0.1.0");
  });

  it("ships the server from 0.2.0 on, since 0.1.0 is the placeholder", () => {
    const [major, minor] = manifest.version.split(".").map(Number);
    expect(manifest.version === "0.1.0" || major > 0 || minor >= 2).toBe(true);
  });

  it("has no library entry, so requiring the package never runs the binary", () => {
    expect(manifest.main).toBeUndefined();
    expect(manifest.exports).toBeUndefined();
  });

  it("installs nothing else and runs no install script, because the Aether CLI depends on it", () => {
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.optionalDependencies).toBeUndefined();
    expect(manifest.peerDependencies).toBeUndefined();
    for (const hook of ["preinstall", "install", "postinstall"]) {
      expect(manifest.scripts?.[hook]).toBeUndefined();
    }
    expect(manifest.engines).toEqual({ node: ">=22" });
  });

  it("stays CommonJS, so the Aether CLI can require the binary on every Node 22", () => {
    expect(manifest.type).toBeUndefined();
  });

  it("has one binary that the build produced, executable and with a shebang", () => {
    expect(Object.keys(manifest.bin)).toEqual(["aether-mcp"]);
    const binary = join(root, manifest.bin["aether-mcp"]);
    expect(() => accessSync(binary, constants.X_OK)).not.toThrow();
    expect(readFileSync(binary, "utf8").startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  it("names the current version in every README pin, which release-please keeps current", () => {
    const pins = [...readme.matchAll(PIN)].map((match) => match[1]);
    expect(pins.length).toBeGreaterThan(0);
    expect(new Set(pins)).toEqual(new Set([manifest.version]));
    expect(readme.replace(MARKED_BLOCK, "").match(PIN)).toBeNull();
    const extraFiles = releaseConfig.packages["."]["extra-files"];
    expect(extraFiles).toContainEqual({ type: "generic", path: "README.md" });
  });
});

describe("the packed tarball", () => {
  let workDir: string;
  let unpacked: string;

  beforeAll(() => {
    workDir = realpathSync(mkdtempSync(join(tmpdir(), "aether-mcp-pack-")));
    execFileSync("npm", ["pack", "--ignore-scripts", "--pack-destination", workDir], {
      cwd: root,
      stdio: "ignore",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    const tarballs = readdirSync(workDir).filter((name) => name.endsWith(".tgz"));
    expect(tarballs).toHaveLength(1);
    execFileSync("tar", ["-xzf", join(workDir, tarballs[0]), "-C", workDir]);
    unpacked = join(workDir, "package");
  }, 60_000);

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it(
    "answers server/discover from the unpacked bin, with no node_modules in reach",
    async () => {
      const bin = join(unpacked, manifest.bin["aether-mcp"]);
      const serverInfo = discoverAnswer(await runNode([bin], workDir, DISCOVER));
      expect(serverInfo.version).toBe(manifest.version);
    },
    SPAWN_TIMEOUT_MS
  );

  it(
    "serves when another program requires the bin with its own arguments rewritten, as aether mcp does",
    async () => {
      const script = [
        `const path = require("path");`,
        `const pkg = require(${JSON.stringify(join(unpacked, "package.json"))});`,
        `const bin = path.join(${JSON.stringify(unpacked)}, pkg.bin["aether-mcp"]);`,
        `process.argv = [process.argv[0], bin];`,
        `require(bin);`,
      ].join("\n");
      const serverInfo = discoverAnswer(await runNode(["-e", script, "cli.js", "mcp"], workDir, DISCOVER));
      expect(serverInfo.version).toBe(manifest.version);
    },
    SPAWN_TIMEOUT_MS
  );
});
