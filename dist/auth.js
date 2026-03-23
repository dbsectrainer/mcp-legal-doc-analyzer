import { createHmac } from "crypto";
/**
 * Decode a base64url string to a Buffer.
 */
function base64urlDecode(str) {
    // Replace URL-safe chars and add padding
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return Buffer.from(padded, "base64");
}
/**
 * Verify a simple HMAC-SHA256 JWT (header.payload.signature).
 * Returns the decoded payload object on success, or null on failure.
 */
function verifyJwt(token, secret) {
    const parts = token.split(".");
    if (parts.length !== 3)
        return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSig = createHmac("sha256", secret)
        .update(signingInput)
        .digest("base64url");
    // Constant-time comparison to avoid timing attacks
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    const actualBuf = base64urlDecode(sigB64);
    if (expectedBuf.length !== actualBuf.length)
        return null;
    let diff = 0;
    for (let i = 0; i < expectedBuf.length; i++) {
        diff |= expectedBuf[i] ^ actualBuf[i];
    }
    if (diff !== 0)
        return null;
    try {
        const payload = JSON.parse(base64urlDecode(payloadB64).toString("utf-8"));
        return payload;
    }
    catch {
        return null;
    }
}
/**
 * Express middleware that validates:
 *   1. X-API-Key header against MCP_API_KEY env var (if set)
 *   2. Authorization: Bearer <token> as HMAC-SHA256 JWT using MCP_JWT_SECRET (if set)
 *
 * Pass-through when neither env var is set.
 * Attaches parsed JWT payload as req.jwtPayload when JWT validation succeeds.
 */
export function createAuthMiddleware() {
    return (req, res, next) => {
        const apiKeyEnv = process.env["MCP_API_KEY"];
        const jwtSecretEnv = process.env["MCP_JWT_SECRET"];
        // If neither env var is set, pass through
        if (!apiKeyEnv && !jwtSecretEnv) {
            next();
            return;
        }
        // Check X-API-Key if MCP_API_KEY is set
        if (apiKeyEnv) {
            const providedKey = req.headers["x-api-key"];
            if (typeof providedKey === "string" && providedKey === apiKeyEnv) {
                // Valid API key — attach it for downstream use and continue
                req.apiKey = providedKey;
                next();
                return;
            }
        }
        // Check Authorization: Bearer <JWT> if MCP_JWT_SECRET is set
        if (jwtSecretEnv) {
            const authHeader = req.headers["authorization"];
            if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
                const token = authHeader.slice(7);
                const payload = verifyJwt(token, jwtSecretEnv);
                if (payload !== null) {
                    req.jwtPayload =
                        payload;
                    next();
                    return;
                }
            }
        }
        // Neither check passed
        res.status(401).json({ error: "Unauthorized" });
    };
}
