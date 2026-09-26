// src/lib/authToken.js
// Server-only signed login tokens (HS256 JWT) using Node's built-in crypto —
// no extra dependency. Never import this from browser code.
import crypto from "crypto";

const SECRET = process.env.MDAEIP_JWT_SECRET;
const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days — close to today's "stay logged in"

const b64url = (str) => Buffer.from(str).toString("base64url");
const sign = (data) =>
	crypto.createHmac("sha256", SECRET).update(data).digest("base64url");

export function createToken(userId) {
	if (!SECRET) throw new Error("MDAEIP_JWT_SECRET is not set");
	const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const now = Math.floor(Date.now() / 1000);
	const payload = b64url(
		JSON.stringify({ sub: String(userId), iat: now, exp: now + TTL_SECONDS }),
	);
	return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

// Returns the payload ({ sub, iat, exp }) or null if missing/invalid/expired
export function verifyToken(token) {
	if (!SECRET || !token) return null;
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
	const given = Buffer.from(parts[2]);
	if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given))
		return null;
	try {
		const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
		if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
		return payload;
	} catch {
		return null;
	}
}

// Convenience for API routes: the verified user id from "Authorization: Bearer …"
export function getTokenUserId(request) {
	const h = request.headers.get("authorization") || "";
	const payload = verifyToken(h.startsWith("Bearer ") ? h.slice(7) : null);
	return payload?.sub ?? null;
}
