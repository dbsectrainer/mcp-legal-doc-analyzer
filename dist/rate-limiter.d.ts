import type { RequestHandler } from "express";
/**
 * Sliding window in-memory rate limiter.
 *
 * @param maxRequests  Maximum number of requests allowed per window (default 60)
 * @param windowMs     Window duration in milliseconds (default 60000)
 */
export declare function createRateLimiter(
  maxRequests?: number,
  windowMs?: number,
): RequestHandler;
