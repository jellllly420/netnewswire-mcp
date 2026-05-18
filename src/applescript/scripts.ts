/**
 * AppleScript templates for communicating with NetNewsWire.
 *
 * Property names match NNW's sdef (scripting dictionary):
 * - Application: current article, selected articles, accounts, feeds
 * - Account: name, id, active, allFeeds, folders, opml representation
 * - Feed: url, name, homepage url, icon url, favicon url, articles, authors
 * - Folder: name, id, feeds, articles
 * - Article: id, title, url, external url, contents, html, summary,
 *            published date, arrived date, read (r/w), starred (r/w), feed
 * - Author: name, url, avatar url, email address
 */

export const scripts = {
  /**
   * List all accounts with their feeds and folders.
   * Uses `every feed of acct` for top-level feeds (not in any folder).
   */
  listFeeds: (accountName?: string) => {
    const accountFilter = accountName
      ? `whose name is "${escapeForAppleScript(accountName)}"`
      : "";
    return `
tell application "NetNewsWire"
  set output to ""
  repeat with acct in every account ${accountFilter}
    set acctName to name of acct
    set acctActive to active of acct
    set output to output & "ACCOUNT:" & acctName & "|" & acctActive & linefeed

    -- Top-level feeds (not in folders)
    repeat with f in every feed of acct
      set fName to name of f
      set fUrl to url of f
      set fHome to ""
      try
        set fHome to homepage url of f
      end try
      set output to output & "FEED:" & fName & "|" & fUrl & "|" & fHome & linefeed
    end repeat

    -- Folders and their feeds
    repeat with fld in every folder of acct
      set fldName to name of fld
      set output to output & "FOLDER:" & fldName & linefeed
      repeat with f in every feed of fld
        set fName to name of f
        set fUrl to url of f
        set fHome to ""
        try
          set fHome to homepage url of f
        end try
        set output to output & "FEED:" & fName & "|" & fUrl & "|" & fHome & linefeed
      end repeat
    end repeat
  end repeat
  return output
end tell`;
  },

  /**
   * Get articles filtered by various criteria.
   * Uses AppleScript `where` clause for efficient filtering when possible.
   */
  getArticles: (opts: {
    feedUrl?: string;
    folderName?: string;
    unreadOnly?: boolean;
    starredOnly?: boolean;
    limit?: number;
  }) => {
    const limit = opts.limit ?? 50;

    // Build article filter clause
    const whereClause = opts.unreadOnly
      ? " where read is false"
      : opts.starredOnly
        ? " where starred is true"
        : "";

    // Build the inner loop body (shared across all paths)
    const articleBlock = `
        set matchedArticles to (get every article of nthFeed${whereClause})
        repeat with a in matchedArticles
          if articleCount ≥ maxArticles then exit repeat
          set aId to id of a
          set aTitle to ""
          try
            set aTitle to title of a
          end try
          set aUrl to ""
          try
            set aUrl to url of a
          end try
          set aSummary to ""
          try
            set aSummary to summary of a
          end try
          set aDate to ""
          try
            set aDate to published date of a as string
          end try
          set aFeed to name of feed of a
          set isRead to read of a
          set isStarred to starred of a
          set output to output & "ARTICLE:" & aId & "|" & aTitle & "|" & aUrl & "|" & isRead & "|" & isStarred & "|" & aDate & "|" & aFeed & "|" & aSummary & linefeed
          set articleCount to articleCount + 1
        end repeat`;

    // Build the feed iteration depending on filters
    let feedIteration: string;
    if (opts.feedUrl) {
      feedIteration = `
  repeat with acct in every account
    repeat with nthFeed in allFeeds of acct
      if articleCount ≥ maxArticles then exit repeat
      if url of nthFeed is "${escapeForAppleScript(opts.feedUrl)}" then
${articleBlock}
      end if
    end repeat
  end repeat`;
    } else if (opts.folderName) {
      feedIteration = `
  repeat with acct in every account
    repeat with fld in every folder of acct
      if articleCount ≥ maxArticles then exit repeat
      if name of fld is "${escapeForAppleScript(opts.folderName)}" then
        repeat with nthFeed in every feed of fld
          if articleCount ≥ maxArticles then exit repeat
${articleBlock}
        end repeat
      end if
    end repeat
  end repeat`;
    } else {
      feedIteration = `
  repeat with acct in every account
    if articleCount ≥ maxArticles then exit repeat
    repeat with nthFeed in allFeeds of acct
      if articleCount ≥ maxArticles then exit repeat
${articleBlock}
    end repeat
  end repeat`;
    }

    return `
tell application "NetNewsWire"
  set output to ""
  set articleCount to 0
  set maxArticles to ${limit}
${feedIteration}
  return output
end tell`;
  },

  /**
   * Read the full content of a specific article by ID.
   *
   * Performance notes (pre-emptive fix, same shape as markArticles #2/#4):
   * - Uses a `whose` clause so NetNewsWire performs the ID filter natively,
   *   instead of issuing one Apple Event per article across the IPC boundary.
   *   The pre-fix shape walked `every article of nthFeed` and compared IDs
   *   one-by-one, which on a large library with a cold cache could blow
   *   past Node's 60s subprocess timeout and Apple's -1712 default.
   * - Returns from inside the feed loop the moment a match comes back,
   *   so we don't keep scanning remaining feeds after we've found it.
   * - Wraps in `with timeout of 300 seconds` so individual Apple Events
   *   don't fail with -1712 on large libraries.
   *
   * Error handling mirrors markArticles: per-feed `try` so a transient
   * glitch on one feed doesn't abort the whole lookup, but the five
   * systemic codes are re-raised so the caller sees actionable failures
   * instead of a misleading "Article not found".
   */
  readArticle: (articleId: string) => `
tell application "NetNewsWire"
  with timeout of 300 seconds
    repeat with acct in every account
      repeat with nthFeed in allFeeds of acct
        try
          set matched to (every article of nthFeed whose (id is "${escapeForAppleScript(articleId)}"))
          if (count of matched) > 0 then
            set a to item 1 of matched
            set aTitle to ""
            try
              set aTitle to title of a
            end try
            set aUrl to ""
            try
              set aUrl to url of a
            end try
            set aHtml to ""
            try
              set aHtml to html of a
            end try
            set aText to ""
            try
              set aText to contents of a
            end try
            set aSummary to ""
            try
              set aSummary to summary of a
            end try
            set aDate to ""
            try
              set aDate to published date of a as string
            end try
            set aRead to read of a
            set aStarred to starred of a
            set aFeed to name of feed of a
            set aAuthors to ""
            try
              repeat with auth in every author of a
                set aAuthors to aAuthors & name of auth & ", "
              end repeat
            end try
            return "TITLE:" & aTitle & linefeed & "URL:" & aUrl & linefeed & "FEED:" & aFeed & linefeed & "DATE:" & aDate & linefeed & "READ:" & aRead & linefeed & "STARRED:" & aStarred & linefeed & "AUTHORS:" & aAuthors & linefeed & "SUMMARY:" & aSummary & linefeed & "HTML:" & aHtml & linefeed & "TEXT:" & aText
          end if
        on error errMsg number errNum
          -- Re-raise systemic errors so the caller sees them instead of
          -- a misleading "Article not found". Per-feed transient errors
          -- are still swallowed so one bad feed doesn't kill an
          -- otherwise-working lookup. Codes:
          --   -128  user cancelled
          --   -600  application not running
          --   -609  connection invalid
          --   -1712 Apple Event timed out (despite the outer 300s wrapper)
          --   -1743 not authorized (automation permission denied)
          if errNum is -128 or errNum is -600 or errNum is -609 or errNum is -1712 or errNum is -1743 then
            error errMsg number errNum
          end if
        end try
      end repeat
    end repeat
  end timeout
  return "ERROR:Article not found"
end tell`,

  /**
   * Mark articles as read/unread or starred/unstarred.
   *
   * Performance notes (fixes #2, #4):
   * - Uses a `whose` clause so NetNewsWire performs the ID filter natively,
   *   instead of issuing one Apple Event per article across the IPC boundary.
   * - Early-exits as soon as every requested ID has been matched, so we
   *   don't keep scanning feeds we no longer need to look at.
   * - Wraps in `with timeout` so individual Apple Events don't fail with
   *   a -1712 default-timeout error on large libraries.
   *
   * The `whose ... or ...` chain is preferred over `whose id is in {...}`
   * because NetNewsWire's scripting layer does not implement the `is in`
   * membership operator for `id` and silently returns no matches.
   *
   * Error handling: the per-feed try block exists so a transient glitch on
   * one feed (e.g. unexpected NNW internal state) doesn't abort an entire
   * batch. Systemic errors that the user actually needs to act on —
   * automation permission denied, app quit mid-script, user cancelled,
   * outer-timeout exceeded — are explicitly re-raised so callers see an
   * actionable failure instead of a misleading `MARKED:0`.
   */
  markArticles: (
    articleIds: string[],
    action: "read" | "unread" | "starred" | "unstarred"
  ) => {
    const property = action === "read" || action === "unread" ? "read" : "starred";
    const value = action === "read" || action === "starred" ? "true" : "false";
    // Build a single predicate evaluated by NetNewsWire (one IPC per feed).
    const whereClause = articleIds
      .map((id) => `id is "${escapeForAppleScript(id)}"`)
      .join(" or ");
    return `
tell application "NetNewsWire"
  set totalIds to ${articleIds.length}
  set matchCount to 0
  with timeout of 300 seconds
    repeat with acct in every account
      if matchCount ≥ totalIds then exit repeat
      repeat with nthFeed in allFeeds of acct
        if matchCount ≥ totalIds then exit repeat
        try
          set matched to (every article of nthFeed whose (${whereClause}))
          repeat with a in matched
            set ${property} of a to ${value}
            set matchCount to matchCount + 1
          end repeat
        on error errMsg number errNum
          -- Re-raise systemic errors so the caller sees them instead of
          -- a misleading MARKED:0. Per-feed transient errors are still
          -- swallowed so one bad feed doesn't kill an otherwise-working
          -- batch. Codes:
          --   -128  user cancelled
          --   -600  application not running
          --   -609  connection invalid
          --   -1712 Apple Event timed out (despite the outer 300s wrapper)
          --   -1743 not authorized (automation permission denied)
          if errNum is -128 or errNum is -600 or errNum is -609 or errNum is -1712 or errNum is -1743 then
            error errMsg number errNum
          end if
        end try
      end repeat
    end repeat
  end timeout
  return "MARKED:" & matchCount
end tell`;
  },

  /**
   * Subscribe to a new feed.
   */
  subscribe: (feedUrl: string, folderName?: string) => {
    if (folderName) {
      return `
tell application "NetNewsWire"
  repeat with acct in every account
    repeat with fld in every folder of acct
      if name of fld is "${escapeForAppleScript(folderName)}" then
        make new feed at fld with properties {url:"${escapeForAppleScript(feedUrl)}"}
        return "OK"
      end if
    end repeat
  end repeat
  return "ERROR:Folder not found"
end tell`;
    }
    return `
tell application "NetNewsWire"
  make new feed at first account with properties {url:"${escapeForAppleScript(feedUrl)}"}
  return "OK"
end tell`;
  },

  /**
   * Search articles by keyword in title and body content.
   *
   * Performance notes (fixes #6):
   * - Uses a `whose` clause so NetNewsWire performs the substring match natively,
   *   instead of materialising every article across the Apple Event IPC boundary
   *   just to compare two strings in AppleScript. Pre-fix shape was an unfiltered
   *   `repeat with a in every article of nthFeed` that fetched `contents of a`
   *   for every article in the library — which exceeded the bridge's 60 s
   *   subprocess cap for any non-trivial library and surfaced as the misleading
   *   "Command failed: osascript -e <script>" error in #6.
   * - Wraps in `with timeout of 300 seconds` so individual Apple Events don't
   *   fail with -1712 on large libraries before our outer cap kicks in.
   * - Early-exits at every loop level (account, feed, match) as soon as the
   *   limit is reached, so once we have N results we don't keep scanning.
   * - Per-feed try/on-error mirrors `markArticles`: per-feed transient glitches
   *   are swallowed so one bad feed doesn't kill an otherwise-working search,
   *   but the five systemic Apple Event errors (-128, -600, -609, -1712, -1743)
   *   are re-raised so the caller gets an actionable failure instead of an
   *   empty result.
   *
   * Why we OR four predicates (title / html / contents / summary):
   *
   * NetNewsWire exposes four `text read-only` properties on `article` that
   * can carry body content, and which ones are populated depends on the feed
   * format. The iteration-3 caveat ("body matching is opportunistic, often
   * doesn't work") was wrong; the iteration-4 fix was sourced from a walk
   * of the NetNewsWire codebase at commit
   *   c9d54214e346fc6cfa33724fdbfea3f96ac4e8d5
   * and confirmed empirically against the same five feeds that had returned
   * 0 body-matches in iteration-3 diagnostics.
   *
   * Property → backing field mapping (from
   * Mac/Scripting/Article+Scriptability.swift):
   *   title    → article.title
   *   html     → article.contentHTML  ?? ""
   *   contents → article.contentText  ?? ""
   *   summary  → article.summary      ?? ""
   *
   * Which fields get populated, by feed format:
   *   RSS  : Modules/RSParser/Sources/RSParser/Feeds/XML/RSSItem.swift
   *          hardcodes ParsedItem(contentText: nil, contentHTML: <body>, ...).
   *          So contentText is ALWAYS nil for RSS — `contents` is empty.
   *          The body bytes land in contentHTML, exposed via `html`.
   *   Atom : The Atom parser may populate contentText and/or summary in
   *          addition to contentHTML, depending on what the feed includes.
   *
   * NetNewsWire's own GUI search uses an FTS4 virtual table over
   * `contentHTML || contentText || summary` (priority order, first non-empty
   * wins; see Modules/ArticlesDatabase/Sources/ArticlesDatabase/SearchTable.swift).
   * We mirror that union here via the whose-clause OR — though we don't
   * apply NNW's priority order because the whose-clause already short-circuits
   * once any predicate matches, which is equivalent for "did this article
   * match" semantics.
   *
   * Empirical evidence (jellllly420's library, 2026-05-19):
   *   matklad         : contents=0, summary=0, html=8280
   *   Inside Rust Blog: contents=0, summary=0, html=19096
   *   Brendan Gregg   : contents=0, summary=0, html=8555
   *   This Week in Rust: contents=0, summary=0, html=39667
   *   Rust Blog       : contents=0, summary=0, html=197711
   *
   * Why keep `contents` and `summary` in the OR even though they were empty
   * for the sampled RSS feeds: Atom-format feeds populate them independently,
   * and dropping them would be a behavioural regression for any Atom feed
   * in a NNW library. All four predicates are evaluated natively by NNW
   * (single Apple Event per feed regardless of predicate count).
   */
  searchArticles: (query: string, limit?: number) => {
    const maxResults = limit ?? 20;
    return `
tell application "NetNewsWire"
  set output to ""
  set matchCount to 0
  set maxResults to ${maxResults}
  set searchTerm to "${escapeForAppleScript(query)}"
  with timeout of 300 seconds
    repeat with acct in every account
      if matchCount ≥ maxResults then exit repeat
      repeat with nthFeed in allFeeds of acct
        if matchCount ≥ maxResults then exit repeat
        try
          set matched to (every article of nthFeed whose (title contains searchTerm or html contains searchTerm or contents contains searchTerm or summary contains searchTerm))
          repeat with a in matched
            if matchCount ≥ maxResults then exit repeat
            set aId to id of a
            set aTitle to ""
            try
              set aTitle to title of a
            end try
            set aUrl to ""
            try
              set aUrl to url of a
            end try
            set aDate to ""
            try
              set aDate to published date of a as string
            end try
            set aFeed to name of feed of a
            set isRead to read of a
            set isStarred to starred of a
            set output to output & "ARTICLE:" & aId & "|" & aTitle & "|" & aUrl & "|" & isRead & "|" & isStarred & "|" & aDate & "|" & aFeed & linefeed
            set matchCount to matchCount + 1
          end repeat
        on error errMsg number errNum
          -- Re-raise systemic errors so the caller sees them instead of an
          -- empty result. Per-feed transient errors are still swallowed so
          -- one bad feed doesn't kill an otherwise-working search. Codes:
          --   -128  user cancelled
          --   -600  application not running
          --   -609  connection invalid
          --   -1712 Apple Event timed out (despite the outer 300s wrapper)
          --   -1743 not authorized (automation permission denied)
          if errNum is -128 or errNum is -600 or errNum is -609 or errNum is -1712 or errNum is -1743 then
            error errMsg number errNum
          end if
        end try
      end repeat
    end repeat
  end timeout
  return output
end tell`;
  },

  /**
   * Get the currently selected article in NetNewsWire.
   */
  getCurrentArticle: () => `
tell application "NetNewsWire"
  set a to current article
  if a is missing value then
    return "ERROR:No article selected"
  end if
  set aTitle to ""
  try
    set aTitle to title of a
  end try
  set aUrl to ""
  try
    set aUrl to url of a
  end try
  set aHtml to ""
  try
    set aHtml to html of a
  end try
  set aText to ""
  try
    set aText to contents of a
  end try
  set aSummary to ""
  try
    set aSummary to summary of a
  end try
  set aDate to ""
  try
    set aDate to published date of a as string
  end try
  set aRead to read of a
  set aStarred to starred of a
  set aFeed to name of feed of a
  return "TITLE:" & aTitle & linefeed & "URL:" & aUrl & linefeed & "FEED:" & aFeed & linefeed & "DATE:" & aDate & linefeed & "READ:" & aRead & linefeed & "STARRED:" & aStarred & linefeed & "SUMMARY:" & aSummary & linefeed & "HTML:" & aHtml & linefeed & "TEXT:" & aText
end tell`,
} as const;

function escapeForAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
