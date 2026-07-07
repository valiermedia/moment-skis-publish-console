/**
 * The UI resolver picks a whole side per conflicting file. The client sends
 * { [filePath]: "ours" | "theirs" } where:
 *   ours   = the target branch's current content ("On staging now" / "On the site now")
 *   theirs = the incoming branch's content ("<person>'s version")
 */
export function parsePicks(input: unknown): Record<string, "ours" | "theirs"> {
  const out: Record<string, "ours" | "theirs"> = {};
  if (input && typeof input === "object") {
    for (const [file, side] of Object.entries(input as Record<string, unknown>)) {
      if (side === "ours" || side === "theirs") out[file] = side;
    }
  }
  return out;
}
