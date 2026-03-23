import type { RequestHandler } from "express";
/**
 * Express middleware that validates:
 *   1. X-API-Key header against MCP_API_KEY env var (if set)
 *   2. Authorization: Bearer <token> as HMAC-SHA256 JWT using MCP_JWT_SECRET (if set)
 *
 * Pass-through when neither env var is set.
 * Attaches parsed JWT payload as req.jwtPayload when JWT validation succeeds.
 */
export declare function createAuthMiddleware(): RequestHandler;
