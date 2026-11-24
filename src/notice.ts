export const NOTICE = [
  "@aetherpush/mcp does not ship the Aether MCP server yet.",
  "Until its first release, run the server from the Aether CLI: npx -y @aetherpush/cli mcp",
].join("\n");

export const NOTICE_EXIT_CODE = 1;

export function writeNotice(stream: Pick<NodeJS.WritableStream, "write">): number {
  stream.write(`${NOTICE}\n`);
  return NOTICE_EXIT_CODE;
}
