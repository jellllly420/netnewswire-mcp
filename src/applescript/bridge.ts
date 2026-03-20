import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Execute an AppleScript string via osascript and return stdout.
 * Throws if NetNewsWire is not running or the script fails.
 */
export async function runAppleScript(script: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      maxBuffer: 10 * 1024 * 1024, // 10MB — articles can be large
      timeout: 30_000,
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
