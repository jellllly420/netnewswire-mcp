#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Keep the process alive even if stdin closes prematurely.
  // Some runtimes (e.g. Claude Desktop's built-in Node.js) may close
  // stdin before the transport has finished its work.
  const keepAlive = setInterval(() => {}, 60_000);
  transport.onclose = () => {
    clearInterval(keepAlive);
  };
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
