import { SignJWT, jwtVerify } from "jose";

// Kept free of Node-only imports so middleware (edge runtime) can use it.
export const SESSION_COOKIE = "session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type SessionPayload = { userId: string; companyId: string };

// Uses SESSION_SECRET when set; otherwise derives a key from DATABASE_URL, which is
// just as private, so a fresh deploy works without extra configuration.
async function secret() {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 32) return new TextEncoder().encode(value);
  const fallback = process.env.DATABASE_URL;
  if (!fallback) throw new Error("Set SESSION_SECRET (32+ characters) or DATABASE_URL");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`fluxo-session:${fallback}`));
  return new Uint8Array(digest);
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(await secret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await secret());
    if (typeof payload.userId !== "string" || typeof payload.companyId !== "string") return null;
    return { userId: payload.userId, companyId: payload.companyId };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
