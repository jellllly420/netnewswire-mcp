import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runAppleScript, isNetNewsWireRunning } from "./applescript/bridge.js";
import { scripts } from "./applescript/scripts.js";
import { parseListFeeds, parseArticles, parseFullArticle } from "./parsers.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "NetNewsWire",
    version: "0.1.0",
  });

  registerTools(server);
  return server;
}

function registerTools(server: McpServer): void {
  // ── list_feeds ──────────────────────────────────────────────────
  server.tool(
    "list_feeds",
    "List all subscribed feeds and folders in NetNewsWire, optionally filtered by account name.",
    {
      account: z
        .string()
        .optional()
        .describe("Filter by account name (e.g. 'On My Mac', 'Feedbin')"),
    },
    async ({ account }) => {
      await ensureRunning();
      const raw = await runAppleScript(scripts.listFeeds(account));
      const result = parseListFeeds(raw);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── get_articles ────────────────────────────────────────────────
  server.tool(
    "get_articles",
    "Fetch articles from NetNewsWire. Returns article metadata (title, URL, date, read/starred status). Use read_article to get full content.",
    {
      feedUrl: z
        .string()
        .optional()
        .describe("Filter by feed URL"),
      folderName: z
        .string()
        .optional()
        .describe("Filter by folder name"),
      unreadOnly: z
        .boolean()
        .default(false)
        .describe("Only return unread articles"),
      starredOnly: z
        .boolean()
        .default(false)
        .describe("Only return starred articles"),
      limit: z
        .number()
        .min(1)
        .max(200)
        .default(50)
        .describe("Maximum number of articles to return (default 50)"),
    },
    async ({ feedUrl, folderName, unreadOnly, starredOnly, limit }) => {
      await ensureRunning();
      const raw = await runAppleScript(
        scripts.getArticles({ feedUrl, folderName, unreadOnly, starredOnly, limit })
      );
      const articles = parseArticles(raw);
      return {
        content: [
          {
            type: "text",
            text: articles.length
              ? JSON.stringify(articles, null, 2)
              : "No articles found matching the criteria.",
          },
        ],
      };
    }
  );

  // ── read_article ────────────────────────────────────────────────
  server.tool(
    "read_article",
    "Get the full content of a specific article by its ID. Returns title, HTML content, plain text, summary, and metadata.",
    {
      articleId: z.string().describe("The article ID to read"),
    },
    async ({ articleId }) => {
      await ensureRunning();
      const raw = await runAppleScript(scripts.readArticle(articleId));
      if (raw.startsWith("ERROR:")) {
        return {
          content: [{ type: "text", text: raw.substring(6) }],
          isError: true,
        };
      }
      const article = parseFullArticle(raw);
      return { content: [{ type: "text", text: JSON.stringify(article, null, 2) }] };
    }
  );

  // ── mark_articles ───────────────────────────────────────────────
  server.tool(
    "mark_articles",
    "Mark one or more articles as read, unread, starred, or unstarred.",
    {
      articleIds: z
        .array(z.string())
        .min(1)
        .describe("Array of article IDs to update"),
      action: z
        .enum(["read", "unread", "starred", "unstarred"])
        .describe("Action to perform"),
    },
    async ({ articleIds, action }) => {
      await ensureRunning();
      const raw = await runAppleScript(scripts.markArticles(articleIds, action));
      const count = raw.match(/MARKED:(\d+)/)?.[1] ?? "0";
      return {
        content: [
          {
            type: "text",
            text: `Marked ${count} article(s) as ${action}.`,
          },
        ],
      };
    }
  );

  // ── subscribe ───────────────────────────────────────────────────
  server.tool(
    "subscribe",
    "Subscribe to a new RSS/Atom feed in NetNewsWire.",
    {
      feedUrl: z.string().url().describe("The feed URL to subscribe to"),
      folderName: z
        .string()
        .optional()
        .describe("Folder to add the feed to (optional)"),
    },
    async ({ feedUrl, folderName }) => {
      await ensureRunning();
      await runAppleScript(scripts.subscribe(feedUrl, folderName));
      return {
        content: [
          {
            type: "text",
            text: `Subscribed to ${feedUrl}${folderName ? ` in folder "${folderName}"` : ""}.`,
          },
        ],
      };
    }
  );

  // ── search_articles ─────────────────────────────────────────────
  server.tool(
    "search_articles",
    "Search articles by keyword in titles and content across all feeds.",
    {
      query: z.string().describe("Search keyword or phrase"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum results to return (default 20)"),
    },
    async ({ query, limit }) => {
      await ensureRunning();
      const raw = await runAppleScript(scripts.searchArticles(query, limit));
      const articles = parseArticles(raw);
      return {
        content: [
          {
            type: "text",
            text: articles.length
              ? JSON.stringify(articles, null, 2)
              : `No articles found matching "${query}".`,
          },
        ],
      };
    }
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

async function ensureRunning(): Promise<void> {
  const running = await isNetNewsWireRunning();
  if (!running) {
    throw new Error(
      "NetNewsWire is not running. Please launch NetNewsWire and try again."
    );
  }
}

