import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Cross-layer regression tests for the server.ts ↔ scripts.ts seam.
 *
 * Background: the bridge in src/applescript/bridge.ts has a 60s
 * subprocess timeout by default. When a `scripts.X(...)` template
 * wraps its work in `with timeout of 300 seconds` (so individual
 * Apple Events can survive long sweeps on large libraries), the
 * corresponding `runAppleScript(...)` callsite in server.ts MUST
 * also pass `{ timeoutMs: 300_000 }` — otherwise Node kills the
 * osascript subprocess at the 60s default, well before the
 * AppleScript-side timeout can take effect. That defeats the
 * cold-cache fix on exactly the libraries it targets.
 *
 * Copilot caught this regression on PR #7 iteration 2 (searchArticles)
 * and again on PR #8 iteration 1 (readArticle). Locking it down here
 * so the same class of mistake can't recur silently on the next tool.
 *
 * These tests do source-level pattern matching rather than mocking the
 * server, which is brittle to indentation but matches the philosophy of
 * the existing scripts.test.ts (string-shape checks).
 */
describe("server.ts ↔ scripts.ts timeout alignment", () => {
  const serverSrc = readFileSync(
    fileURLToPath(new URL("./server.ts", import.meta.url)),
    "utf8"
  );

  /** Slice from `"toolName"` through the next `\n  );` (closes server.tool). */
  function callsiteFor(toolName: string): string {
    const idx = serverSrc.indexOf(`"${toolName}"`);
    if (idx < 0) throw new Error(`tool ${toolName} not found in server.ts`);
    const end = serverSrc.indexOf("\n  );", idx);
    return serverSrc.slice(idx, end > 0 ? end : undefined);
  }

  it("read_article calls runAppleScript with timeoutMs: 300_000", () => {
    // scripts.readArticle wraps in `with timeout of 300 seconds`, so
    // the callsite must override the bridge's 60s subprocess default
    // to match. Without this override, large-library miss-path
    // lookups (cold cache, deleted-since-listing) get killed at 60s
    // before the AppleScript-side timeout / -1712 re-raise kicks in.
    const block = callsiteFor("read_article");
    expect(block).toContain("scripts.readArticle(");
    expect(block).toContain("timeoutMs: 300_000");
  });

  it("mark_articles calls runAppleScript with timeoutMs: 300_000", () => {
    // Positive control: this one's been correctly aligned since the
    // markArticles fix (834f662). If this assertion ever fails, the
    // markArticles callsite has regressed.
    const block = callsiteFor("mark_articles");
    expect(block).toContain("scripts.markArticles(");
    expect(block).toContain("timeoutMs: 300_000");
  });
});
