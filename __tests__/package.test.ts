import { spawnSync } from "node:child_process";
import { accessSync, constants, readFileSync } from "node:fs";
import { join } from "node:path";

import { NOTICE, NOTICE_EXIT_CODE } from "../src/notice";

const root = join(__dirname, "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const releaseConfig = JSON.parse(readFileSync(join(root, "release-please-config.json"), "utf8"));

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

  it("has no library entry, so requiring the package never runs the binary", () => {
    expect(manifest.main).toBeUndefined();
    expect(manifest.exports).toBeUndefined();
  });

  it("has one binary that the build produced, executable and with a shebang", () => {
    expect(Object.keys(manifest.bin)).toEqual(["aether-mcp"]);
    const binary = join(root, manifest.bin["aether-mcp"]);
    expect(() => accessSync(binary, constants.X_OK)).not.toThrow();
    expect(readFileSync(binary, "utf8").startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  it("runs the built binary: notice on stderr, nothing on stdout, failing exit", () => {
    const binary = join(root, manifest.bin["aether-mcp"]);
    const result = spawnSync(process.execPath, [binary], { encoding: "utf8" });

    expect(result.status).toBe(NOTICE_EXIT_CODE);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`${NOTICE}\n`);
  });
});
