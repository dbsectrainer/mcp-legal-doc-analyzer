import { homedir } from "os";

/**
 * Expand a leading ~ to the user's home directory.
 */
export function expandHome(filePath: string): string {
  if (filePath.startsWith("~/") || filePath === "~") {
    return filePath.replace(/^~/, homedir());
  }
  return filePath;
}
