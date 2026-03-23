import type { RequestHandler, Request, Response, NextFunction } from "express";

interface WindowEntry {
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();

/**
 * Get the identifier for rate-limiting: prefer X-API-Key header, fall back to req.ip.
 */
function getIdentifier(req: Request): string {
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey) return `key:${apiKey}`;
  return `ip:${req.ip ?? "unknown"}`;
}

/**
 * Sliding window in-memory rate limiter.
 *
 * @param maxRequests  Maximum number of requests allowed per window (default 60)
 * @param windowMs     Window duration in milliseconds (default 60000)
 */
export function createRateLimiter(maxRequests = 60, windowMs = 60_000): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = getIdentifier(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    let entry = store.get(id);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(id, entry);
    }

    // Drop timestamps outside the sliding window
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    if (entry.timestamps.length >= maxRequests) {
      res.status(429).json({
        error: "Too Many Requests",
        retryAfterMs:
          entry.timestamps[0] != null ? entry.timestamps[0] - windowStart : windowMs,
      });
      return;
    }

    entry.timestamps.push(now);
    next();
  };
}
