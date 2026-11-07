import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { getAdmin, verifyHostedAdminToken } from "../server/auth";
import type { Env } from "../server/env";

let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: { keys: unknown[] };
let nextIssuer = 0;
beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  jwks = { keys: [{ ...await exportJWK(keys.publicKey), kid: "test", alg: "RS256" }] };
});
afterEach(() => vi.unstubAllGlobals());

async function fixture(claims: Record<string, unknown> = {}, options: { issuer?: string; audience?: string; expired?: boolean; omitExpiry?: boolean } = {}) {
  const issuer = `https://auth-test-${nextIssuer++}.convex.site`;
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    expect(String(url)).toBe(`${issuer}/api/auth/convex/jwks`);
    return Response.json(jwks);
  }));
  const env = { ADMIN_AUTH_SITE_URL: issuer, ADMIN_EMAIL_DOMAINS: "ddcnorth.com" } as Env;
  const signed = new SignJWT({ email: "admin@ddcnorth.com", emailVerified: true, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test" }).setSubject("user-1")
    .setIssuer(options.issuer ?? issuer).setAudience(options.audience ?? "convex").setIssuedAt();
  if (!options.omitExpiry) signed.setExpirationTime(options.expired ? Math.floor(Date.now() / 1000) - 60 : "5m");
  return { env, token: await signed.sign(keys.privateKey) };
}

describe("hosted administrator authentication", () => {
  it("accepts a signed, verified administrator from the configured broker", async () => {
    const { env, token } = await fixture();
    expect(await verifyHostedAdminToken(token, env)).toMatchObject({ userId: "user-1", email: "admin@ddcnorth.com" });
  });
  it.each([
    [{ emailVerified: false }, {}],
    [{ emailVerified: "true" }, {}],
    [{ email: "admin@ddcnorth.com.evil.example" }, {}],
    [{}, { issuer: "https://foreign.convex.site" }],
    [{}, { audience: "another-app" }],
    [{}, { expired: true }],
    [{}, { omitExpiry: true }],
  ])("refuses untrusted or incomplete identities (%j, %j)", async (claims, options) => {
    const { env, token } = await fixture(claims, options);
    expect(await verifyHostedAdminToken(token, env)).toBeNull();
  });
  it("rejects a forged signature", async () => {
    const { env, token } = await fixture();
    const parts = token.split(".");
    parts[2] = (parts[2][0] === "a" ? "b" : "a") + parts[2].slice(1);
    expect(await verifyHostedAdminToken(parts.join("."), env)).toBeNull();
  });
  it("never accepts the local developer shortcut on a deployed host", async () => {
    const env = { PORTAL_DEV: "1", PORTAL_DEV_ADMIN_TOKEN: "local-only" } as Env;
    const headers = { authorization: "Bearer local-only" };
    expect(await getAdmin(new Request("https://ddcnorth.com/api/admin/me", { headers }), env)).toBeNull();
    expect(await getAdmin(new Request("http://localhost/api/admin/me", { headers }), env)).toMatchObject({ userId: "dev-admin" });
  });
});
