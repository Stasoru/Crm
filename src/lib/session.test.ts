import { afterEach, describe, expect, it, vi } from "vitest";
import { signSession, verifySession } from "./session";

afterEach(() => vi.unstubAllEnvs());

describe("session", () => {
  it("round-trips with SESSION_SECRET", async () => {
    vi.stubEnv("SESSION_SECRET", "x".repeat(32));
    const token = await signSession({ userId: "u", companyId: "c" });
    expect(await verifySession(token)).toEqual({ userId: "u", companyId: "c" });
  });

  it("falls back to a key derived from DATABASE_URL", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("DATABASE_URL", "postgresql://a:b@h/db");
    const token = await signSession({ userId: "u", companyId: "c" });
    expect(await verifySession(token)).toEqual({ userId: "u", companyId: "c" });
    vi.stubEnv("DATABASE_URL", "postgresql://other");
    expect(await verifySession(token)).toBeNull();
  });
});
