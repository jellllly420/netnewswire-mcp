#!/usr/bin/env npx tsx
/**
 * End-to-end test for the NetNewsWire MCP server.
 * Spawns the server as a subprocess and communicates via JSON-RPC over stdio.
 *
 * Prerequisites:
 *   - macOS with NetNewsWire running
 *   - npm run build (or run this with npx tsx directly)
 *
 * Usage:
 *   npx tsx scripts/e2e-test.ts
 */

import { spawn, ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(__dirname, "../dist/index.js");

let server: ChildProcess;
let messageId = 0;

// Pending response resolvers keyed by request id
const pending = new Map<number, { resolve: (v: JsonRpcResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();

interface JsonRpcResponse {
  jsonrpc: string;
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

function startServer(): void {
  server = spawn("node", [SERVER_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  server.stderr!.on("data", (chunk: Buffer) => {
    const msg = chunk.toString().trim();
    if (msg) console.log(`  [stderr] ${msg}`);
  });

  server.on("error", (err) => {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  });

  // Read newline-delimited JSON responses
  const rl = createInterface({ input: server.stdout! });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    try {
      const msg: JsonRpcResponse = JSON.parse(line);
      // Skip notifications (no id)
      if (msg.id != null && pending.has(msg.id)) {
        const p = pending.get(msg.id)!;
        clearTimeout(p.timer);
        pending.delete(msg.id);
        p.resolve(msg);
      }
    } catch {
      // Ignore unparseable lines
    }
  });
}

function sendRequest(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
  const id = ++messageId;
  const request = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout waiting for response to ${method}`));
    }, 15000);

    pending.set(id, { resolve, reject, timer });
    server.stdin!.write(request);
  });
}

function sendNotification(method: string, params?: Record<string, unknown>): void {
  const notification = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
  server.stdin!.write(notification);
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function run() {
  console.log("Starting MCP server...\n");
  startServer();

  // Give server a moment to start
  await new Promise((r) => setTimeout(r, 500));

  // ── Test 1: Initialize ──────────────────────────────────────────
  console.log("Test 1: Initialize handshake");
  const initResult = await sendRequest("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "e2e-test", version: "1.0.0" },
  });

  assert(!initResult.error, "Initialize succeeds");
  const initData = initResult.result as Record<string, unknown>;
  assert(initData?.serverInfo != null, "Server info present");

  const serverInfo = initData?.serverInfo as Record<string, string>;
  assert(serverInfo?.name === "NetNewsWire", `Server name is "NetNewsWire" (got "${serverInfo?.name}")`);
  assert(serverInfo?.version === "0.1.1", `Server version is "0.1.1" (got "${serverInfo?.version}")`);

  // Send initialized notification
  sendNotification("notifications/initialized");

  // ── Test 2: List tools ──────────────────────────────────────────
  console.log("\nTest 2: List tools");
  const toolsResult = await sendRequest("tools/list");
  assert(!toolsResult.error, "tools/list succeeds");

  const tools = (toolsResult.result as Record<string, unknown>)?.tools as Array<Record<string, string>>;
  const toolNames = tools?.map((t) => t.name) ?? [];
  const expectedTools = ["list_feeds", "get_articles", "read_article", "mark_articles", "subscribe", "search_articles"];
  for (const name of expectedTools) {
    assert(toolNames.includes(name), `Tool "${name}" is registered`);
  }

  // ── Test 3: Call list_feeds ─────────────────────────────────────
  console.log("\nTest 3: Call list_feeds");
  const feedsResult = await sendRequest("tools/call", {
    name: "list_feeds",
    arguments: {},
  });

  if (feedsResult.error) {
    const isNotRunning = feedsResult.error.message?.includes("not running");
    if (isNotRunning) {
      console.log("  ⚠️  NetNewsWire is not running — skipping live tool tests");
      console.log("     Start NetNewsWire and re-run for full coverage.\n");
    } else {
      assert(false, "list_feeds call", feedsResult.error.message);
    }
  } else {
    assert(!feedsResult.error, "list_feeds succeeds");
    const content = (feedsResult.result as Record<string, unknown>)?.content as Array<Record<string, string>>;
    assert(Array.isArray(content) && content.length > 0, "Response has content");
    assert(content[0]?.type === "text", "Content type is text");

    let parsed: unknown;
    try {
      parsed = JSON.parse(content[0].text);
      assert(Array.isArray(parsed), "Parsed result is an array of accounts");
      if (Array.isArray(parsed) && parsed.length > 0) {
        assert(typeof parsed[0].name === "string", `First account has name: "${parsed[0].name}"`);
      }
    } catch {
      // Response is plain text (e.g. no feeds configured)
      assert(typeof content[0].text === "string", `Response is plain text: "${content[0].text.slice(0, 60)}"`);
    }

    // ── Test 4: Call get_articles ──────────────────────────────────
    console.log("\nTest 4: Call get_articles (limit 3)");
    const articlesResult = await sendRequest("tools/call", {
      name: "get_articles",
      arguments: { limit: 3 },
    });
    assert(!articlesResult.error, "get_articles succeeds");
    const articlesContent = (articlesResult.result as Record<string, unknown>)?.content as Array<Record<string, string>>;
    assert(Array.isArray(articlesContent) && articlesContent.length > 0, "Response has content");

    // ── Test 5: Call search_articles ───────────────────────────────
    console.log("\nTest 5: Call search_articles");
    const searchResult = await sendRequest("tools/call", {
      name: "search_articles",
      arguments: { query: "test", limit: 5 },
    });
    assert(!searchResult.error, "search_articles succeeds");
  }

  // ── Summary ─────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${"─".repeat(50)}\n`);

  server.kill();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("E2E test crashed:", err);
  server?.kill();
  process.exit(1);
});
