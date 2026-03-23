import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { createRateLimiter } from "../src/rate-limiter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(ip: string, apiKey?: string): Request {
  return {
    ip,
    headers: apiKey ? { "x-api-key": apiKey } : {},
  } as unknown as Request;
}

function makeRes(): {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  _statusCode: number;
} {
  const res = {
    _statusCode: 200,
    status(c: number) {
      this._statusCode = c;
      return this;
    },
    json: vi.fn(),
  };
  res.status = vi.fn(res.status.bind(res));
  return res as unknown as typeof res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createRateLimiter", () => {
  it("allows requests below the limit", () => {
    const limiter = createRateLimiter(3, 60_000);

    for (let i = 0; i < 3; i++) {
      const req = makeReq("10.0.0.1");
      const res = makeRes();
      const next = vi.fn() as NextFunction;
      limiter(req, res as unknown as Response, next);
      expect(next).toHaveBeenCalledOnce();
    }
  });

  it("returns 429 when limit is exceeded", () => {
    const limiter = createRateLimiter(2, 60_000);
    const ip = "10.0.0.2";

    // First two succeed
    for (let i = 0; i < 2; i++) {
      const req = makeReq(ip);
      const res = makeRes();
      limiter(req, res as unknown as Response, vi.fn() as NextFunction);
    }

    // Third request should be rate-limited
    const req = makeReq(ip);
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    limiter(req, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(429);
  });

  it("uses X-API-Key header as identifier when present", () => {
    const limiter = createRateLimiter(1, 60_000);
    const apiKey = "my-api-key-123";

    // First request with API key — should pass
    {
      const req = makeReq("192.168.1.1", apiKey);
      const res = makeRes();
      const next = vi.fn() as NextFunction;
      limiter(req, res as unknown as Response, next);
      expect(next).toHaveBeenCalledOnce();
    }

    // Second request with same API key — should be limited
    {
      const req = makeReq("192.168.1.2", apiKey); // different IP, same key
      const res = makeRes();
      const next = vi.fn() as NextFunction;
      limiter(req, res as unknown as Response, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._statusCode).toBe(429);
    }
  });

  it("treats different IPs as separate identifiers", () => {
    const limiter = createRateLimiter(1, 60_000);

    const ipA = "172.16.0.1";
    const ipB = "172.16.0.2";

    // Exhaust quota for ipA
    limiter(makeReq(ipA), makeRes() as unknown as Response, vi.fn() as NextFunction);

    // ipB should still be allowed
    const reqB = makeReq(ipB);
    const resB = makeRes();
    const nextB = vi.fn() as NextFunction;
    limiter(reqB, resB as unknown as Response, nextB);
    expect(nextB).toHaveBeenCalledOnce();
  });

  it("sliding window allows requests after window expires", async () => {
    // Short window: 50ms
    const limiter = createRateLimiter(1, 50);
    const ip = "10.0.0.3";

    // Use one slot
    limiter(makeReq(ip), makeRes() as unknown as Response, vi.fn() as NextFunction);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Should be allowed again
    const req = makeReq(ip);
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    limiter(req, res as unknown as Response, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 429 with retryAfterMs field", () => {
    const limiter = createRateLimiter(1, 60_000);
    const ip = "10.0.0.4";

    limiter(makeReq(ip), makeRes() as unknown as Response, vi.fn() as NextFunction);

    const res = makeRes();
    limiter(makeReq(ip), res as unknown as Response, vi.fn() as NextFunction);

    expect(res._statusCode).toBe(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ retryAfterMs: expect.any(Number) }),
    );
  });
});
