# NetNewsWire MCP Server

An MCP server that connects Claude to [NetNewsWire](https://netnewswire.com/) via AppleScript on macOS. Browse feeds, fetch and search articles, mark as read/starred, and subscribe to new feeds.

## Requirements

- **macOS** (uses AppleScript to communicate with NetNewsWire)
- **NetNewsWire** must be running
- **Node.js** >= 18.0.0

## Installation

### Option 1: MCP Bundle (.mcpb)

Download the `.mcpb` file from [Releases](https://github.com/jellllly420/netnewswire-mcp/releases) and double-click to install in Claude Desktop.

### Option 2: Build from Source

```bash
git clone https://github.com/jellllly420/netnewswire-mcp.git
cd netnewswire-mcp
npm install
npm run build
```

Then add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "netnewswire": {
      "command": "node",
      "args": ["/path/to/netnewswire-mcp/dist/index.js"]
    }
  }
}
```

### Option 3: npx

```json
{
  "mcpServers": {
    "netnewswire": {
      "command": "npx",
      "args": ["@jellllly/netnewswire-mcp"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `list_feeds` | List all subscribed feeds and folders, optionally filtered by account |
| `get_articles` | Fetch articles with filters: unread, starred, by feed/folder, with limit |
| `read_article` | Get full article content (HTML, text, metadata) by article ID |
| `mark_articles` | Mark articles as read/unread/starred/unstarred (batch support) |
| `subscribe` | Subscribe to a new RSS/Atom feed by URL |
| `search_articles` | Search articles by keyword across all feeds |

## Example Workflow

**Daily morning summary:**

> "Get all my unread articles from the last day and give me a summary of the most interesting ones. Star the ones I should read in full, and mark the rest as read."

**Topic research:**

> "Search my feeds for articles about 'AI agents' and summarize what's been published recently."

**Feed management:**

> "Subscribe to https://example.com/feed.xml in my Tech folder."

## Development

```bash
npm run dev    # Watch mode — recompiles on changes
npm run build  # Production build
npm start      # Run the server
```

## License

MIT
