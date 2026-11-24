import { NOTICE, NOTICE_EXIT_CODE, writeNotice } from "../src/notice";

describe("writeNotice", () => {
  it("writes the notice with a trailing newline and returns the exit code", () => {
    const written: string[] = [];
    const exitCode = writeNotice({
      write: (chunk: string | Uint8Array) => {
        written.push(String(chunk));
        return true;
      },
    });

    expect(written).toEqual([`${NOTICE}\n`]);
    expect(exitCode).toBe(NOTICE_EXIT_CODE);
    expect(NOTICE_EXIT_CODE).not.toBe(0);
  });

  it("names the command that runs the server today", () => {
    expect(NOTICE).toContain("npx -y @aetherpush/cli mcp");
  });
});

describe("the command-line entry", () => {
  it("writes the notice to stderr and sets a failing exit code", () => {
    const previousExitCode = process.exitCode;
    const stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdout = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      jest.isolateModules(() => {
        require("../src/cli");
      });
      const stderrChunks = stderr.mock.calls.map(([chunk]) => String(chunk));
      const stdoutCalls = stdout.mock.calls.length;
      const observedExitCode = process.exitCode;
      stderr.mockRestore();
      stdout.mockRestore();

      expect(stderrChunks).toEqual([`${NOTICE}\n`]);
      expect(stdoutCalls).toBe(0);
      expect(observedExitCode).toBe(NOTICE_EXIT_CODE);
    } finally {
      stderr.mockRestore();
      stdout.mockRestore();
      process.exitCode = previousExitCode;
    }
  });
});
