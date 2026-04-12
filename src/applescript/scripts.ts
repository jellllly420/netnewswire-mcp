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
   */
  readArticle: (articleId: string) => `
tell application "NetNewsWire"
  repeat with acct in every account
    repeat with nthFeed in allFeeds of acct
      repeat with a in every article of nthFeed
        if id of a is "${escapeForAppleScript(articleId)}" then
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
      end repeat
    end repeat
  end repeat
  return "ERROR:Article not found"
end tell`,

  /**
   * Mark articles as read/unread or starred/unstarred.
   */
  markArticles: (
    articleIds: string[],
    action: "read" | "unread" | "starred" | "unstarred"
  ) => {
    const property = action === "read" || action === "unread" ? "read" : "starred";
    const value = action === "read" || action === "starred" ? "true" : "false";
    const idChecks = articleIds
      .map((id) => `id of a is "${escapeForAppleScript(id)}"`)
      .join(" or ");
    return `
tell application "NetNewsWire"
  set matchCount to 0
  repeat with acct in every account
    repeat with nthFeed in allFeeds of acct
      repeat with a in every article of nthFeed
        if ${idChecks} then
          set ${property} of a to ${value}
          set matchCount to matchCount + 1
        end if
      end repeat
    end repeat
  end repeat
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
   * Search articles by keyword in title and contents.
   */
  searchArticles: (query: string, limit?: number) => {
    const maxResults = limit ?? 20;
    return `
tell application "NetNewsWire"
  set output to ""
  set matchCount to 0
  set maxResults to ${maxResults}
  set searchTerm to "${escapeForAppleScript(query)}"
  repeat with acct in every account
    if matchCount ≥ maxResults then exit repeat
    repeat with nthFeed in allFeeds of acct
      if matchCount ≥ maxResults then exit repeat
      repeat with a in every article of nthFeed
        if matchCount ≥ maxResults then exit repeat
        set aTitle to ""
        try
          set aTitle to title of a
        end try
        set aText to ""
        try
          set aText to contents of a
        end try
        if aTitle contains searchTerm or aText contains searchTerm then
          set aId to id of a
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
        end if
      end repeat
    end repeat
  end repeat
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
