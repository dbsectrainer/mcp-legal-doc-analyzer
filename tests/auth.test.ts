import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { createAuthMiddleware } from "../src/auth.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeB64Url(s: string): string {
  return Buffer.from(s).toString("base64url");
}

function makeJwt(secret: string, payload: Record<string, unknown>): string {
  const header = makeB64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = makeB64Url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

function makeReq(headers: Record<string, string>): Request {
  return { headers } as unknown as Request;
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

describe("createAuthMiddleware — pass-through when no env vars", () => {
  beforeEach(() => {
    delete process.env["MCP_API_KEY"];
    delete process.env["MCP_JWT_SECRET"];
  });

  it("calls next() when neither env var is set", () => {
    const mw = createAuthMiddleware();
    const req = makeReq({});
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    mw(req, res as unknown as Response, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("createAuthMiddleware — API key validation", () => {
  beforeEach(() => {
    process.env["MCP_API_KEY"] = "secret-key-123";
    delete process.env["MCP_JWT_SECRET"];
  });

  afterEach(() => {
    delete process.env["MCP_API_KEY"];
  });

  it("allows request with correct X-API-Key", () => {
    const mw = createAuthMiddleware();
    const req = makeReq({ "x-api-key": "secret-key-123" });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    mw(req, res as unknown as Response, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects request with wrong X-API-Key (401)", () => {
    const mw = createAuthMiddleware();
    const req = makeReq({ "x-api-key": "wrong-key" });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    mw(req, res as unknown as Response, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(401);
  });

  it("rejects request with missing X-API-Key (401)", () => {
    const mw = createAuthMiddleware();
    const req = makeReq({});
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    mw(req, res as unknown as Response, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(401);
  });
});

describe("createAuthMiddleware — JWT validation", () => {
  const SECRET = "my-jwt-secret";

  beforeEach(() => {
    delete process.env["MCP_API_KEY"];
    process.env["MCP_JWT_SECRET"] = SECRET;
  });

  afterEach(() => {
    delete process.env["MCP_JWT_SECRET"];
  });

  it("allows request with valid JWT", () => {
    const mw = createAuthMiddleware();
    const token = makeJwt(SECRET, { sub: "agent-x", iat: Date.now() });
    const req = makeReq({ authorization: `Bearer ${token}` });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    mw(req, res as unknown as Response, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects request with invalid JWT signature (401)", () => {
    const mw = createAuthMiddleware();
    const token = makeJwt("wrong-secret", { sub: "agent-x" });
    const req = makeReq({ authorization: `Bearer ${token}` });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    mw(req, res as unknown as Response, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(401);
  });

  it("rejects malformed JWT (not 3 parts)", () => {
    const mw = createAuthMiddleware();
    const req = makeReq({ authorization: "Bearer not.a.jwt.token.extra" });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    mw(req, res as unknown as Response, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(401);
  });

  it("rejects missing Authorization header (401)", () => {
    const mw = createAuthMiddleware();
    const req = makeReq({});
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    mw(req, res as unknown as Response, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(401);
  });

  it("rejects non-Bearer authorization scheme (401)", () => {
    const mw = createAuthMiddleware();
    const req = makeReq({ authorization: "Basic dXNlcjpwYXNz" });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    mw(req, res as unknown as Response, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(401);
  });
});

describe("createAuthMiddleware — both env vars set", () => {
  const SECRET = "combined-secret";
  const API_KEY = "combined-api-key";

  beforeEach(() => {
    process.env["MCP_API_KEY"] = API_KEY;
    process.env["MCP_JWT_SECRET"] = SECRET;
  });

  afterEach(() => {
    delete process.env["MCP_API_KEY"];
    delete process.env["MCP_JWT_SECRET"];
  });

  it("passes with correct API key", () => {
    const mw = createAuthMiddleware();
    const req = makeReq({ "x-api-key": API_KEY });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    mw(req, res as unknown as Response, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("passes with valid JWT when API key is wrong", () => {
    const mw = createAuthMiddleware();
    const token = makeJwt(SECRET, { sub: "agent-y" });
    const req = makeReq({ "x-api-key": "wrong", authorization: `Bearer ${token}` });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    mw(req, res as unknown as Response, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects when both API key and JWT are wrong (401)", () => {
    const mw = createAuthMiddleware();
    const req = makeReq({ "x-api-key": "bad", authorization: "Bearer bad.token.here" });
    const res = makeRes();
    const next = vi.fn() as NextFunction;
    mw(req, res as unknown as Response, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(401);
  });
});
