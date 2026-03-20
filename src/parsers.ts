/**
 * Parsers for AppleScript output from NetNewsWire.
 * Each parser converts pipe-delimited text into structured objects.
 */

export interface FeedInfo {
  name: string;
  url: string;
  homePageUrl: string;
}

export interface FolderInfo {
  name: string;
  feeds: FeedInfo[];
}

export interface AccountInfo {
  name: string;
  active: boolean;
  feeds: FeedInfo[];
  folders: FolderInfo[];
}

export function parseListFeeds(raw: string): AccountInfo[] {
  const accounts: AccountInfo[] = [];
  let currentAccount: AccountInfo | null = null;
  let currentFolder: FolderInfo | null = null;

  for (const line of raw.split("\n")) {
    if (line.startsWith("ACCOUNT:")) {
      const parts = line.substring(8).split("|");
      currentAccount = {
        name: parts[0] ?? "",
        active: parts[1] === "true",
        feeds: [],
        folders: [],
      };
      currentFolder = null;
      accounts.push(currentAccount);
    } else if (line.startsWith("FOLDER:") && currentAccount) {
      currentFolder = { name: line.substring(7), feeds: [] };
      currentAccount.folders.push(currentFolder);
    } else if (line.startsWith("FEED:") && currentAccount) {
      const parts = line.substring(5).split("|");
      const feed: FeedInfo = {
        name: parts[0] ?? "",
        url: parts[1] ?? "",
        homePageUrl: parts[2] ?? "",
      };
      if (currentFolder) {
        currentFolder.feeds.push(feed);
      } else {
        currentAccount.feeds.push(feed);
      }
    }
  }
  return accounts;
}

export interface ArticleSummary {
  id: string;
  title: string;
  url: string;
  read: boolean;
  starred: boolean;
  datePublished: string;
  feed: string;
  summary?: string;
}

export function parseArticles(raw: string): ArticleSummary[] {
  const articles: ArticleSummary[] = [];
  for (const line of raw.split("\n")) {
    if (!line.startsWith("ARTICLE:")) continue;
    const parts = line.substring(8).split("|");
    articles.push({
      id: parts[0] ?? "",
      title: parts[1] ?? "",
      url: parts[2] ?? "",
      read: parts[3] === "true",
      starred: parts[4] === "true",
      datePublished: parts[5] ?? "",
      feed: parts[6] ?? "",
      summary: parts[7] || undefined,
    });
  }
  return articles;
}

export interface FullArticle {
  title: string;
  url: string;
  feed: string;
  datePublished: string;
  read: boolean;
  starred: boolean;
  authors: string;
  summary: string;
  html: string;
  text: string;
}

export function parseFullArticle(raw: string): FullArticle {
  const fields: Record<string, string> = {};
  let currentKey = "";
  let currentValue = "";

  for (const line of raw.split("\n")) {
    const match = line.match(/^(TITLE|URL|FEED|DATE|READ|STARRED|AUTHORS|SUMMARY|HTML|TEXT):(.*)/);
    if (match) {
      if (currentKey) {
        fields[currentKey] = currentValue;
      }
      currentKey = match[1]!;
      currentValue = match[2]!;
    } else if (currentKey) {
      currentValue += "\n" + line;
    }
  }
  if (currentKey) {
    fields[currentKey] = currentValue;
  }

  return {
    title: fields["TITLE"] ?? "",
    url: fields["URL"] ?? "",
    feed: fields["FEED"] ?? "",
    datePublished: fields["DATE"] ?? "",
    read: fields["READ"] === "true",
    starred: fields["STARRED"] === "true",
    authors: fields["AUTHORS"] ?? "",
    summary: fields["SUMMARY"] ?? "",
    html: fields["HTML"] ?? "",
    text: fields["TEXT"] ?? "",
  };
}
