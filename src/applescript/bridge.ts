import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface RunOptions {
  /** osascript subprocess timeout in ms. Defaults to 60s. */
  timeoutMs?: number;
}

/**
 * Execute an AppleScript string via osascript and return stdout.
 * Throws if NetNewsWire is not running or the script fails.
 */
export async function runAppleScript(
  script: string,
  options: RunOptions = {}
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      maxBuffer: 10 * 1024 * 1024, // 10MB — articles can be large
      // Long default to accommodate large NetNewsWire libraries. Individual
      // scripts that are inherently slow (e.g. write operations across many
      // feeds) should also wrap their work in `with timeout` at the
      // AppleScript layer, which caps individual Apple Events.
      timeout: options.timeoutMs ?? 60_000,
    });
    return stdout.trim();
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : String(error);
    if (msg.includes("not running") || msg.includes("-600")) {
      throw new Error(
        "NetNewsWire is not running. Please launch NetNewsWire and try again."
      );
    }
    throw new Error(`AppleScript error: ${msg}`);
  }
}

/**
 * Check if NetNewsWire is currently running.
 */
export async function isNetNewsWireRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to (name of processes) contains "NetNewsWire"',
    ], { timeout: 5_000 });
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}
