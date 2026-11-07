import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyDeploymentToken } from "../server/deploy";

let keys: Awaited<ReturnType<typeof generateKeyPair>>;
const audience = "https://ddcnorth.com";
const claims = {
  repository: "ahzs645/lovefutboler", repository_id: "1440325946", repository_owner_id: "31978381",
  ref: "refs/heads/main", sha: "a".repeat(40), event_name: "push",
  workflow_ref: "ahzs645/lovefutboler/.github/workflows/deploy-portal.yml@refs/heads/main",
};
beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  const jwks = { keys: [{ ...await exportJWK(keys.publicKey), kid: "deploy", alg: "RS256" }] };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(jwks)));
});
afterAll(() => vi.unstubAllGlobals());
async function token(changes: Record<string, unknown> = {}, aud = audience, sub = "repo:ahzs645@31978381/lovefutboler@1440325946:ref:refs/heads/main") {
  return new SignJWT({ ...claims, ...changes }).setProtectedHeader({ alg: "RS256", kid: "deploy" })
    .setIssuer("https://token.actions.githubusercontent.com").setAudience(aud).setSubject(sub)
    .setIssuedAt().setExpirationTime("5m").sign(keys.privateKey);
}
describe("GitHub project deployment identity", () => {
  it("accepts only the registered main-branch publishing workflow", async () => {
    expect(await verifyDeploymentToken(await token(), "lovefutbol", audience)).toMatchObject({ version: claims.sha });
  });
  it.each([
    { repository_id: "another-repo" },
    { repository_owner_id: "another-owner" },
    { repository: "attacker/lovefutboler" },
    { ref: "refs/heads/unreviewed" },
    { workflow_ref: "ahzs645/lovefutboler/.github/workflows/another.yml@refs/heads/main" },
    { event_name: "pull_request" },
    { sha: "../other-space" },
  ])("rejects unauthorized claims (%j)", async (changes) => {
    await expect(verifyDeploymentToken(await token(changes), "lovefutbol", audience)).rejects.toMatchObject({ status: 403 });
  });
  it("rejects a token issued for another audience or subject", async () => {
    await expect(verifyDeploymentToken(await token({}, "https://elsewhere.example"), "lovefutbol", audience)).rejects.toMatchObject({ status: 403 });
    await expect(verifyDeploymentToken(await token({}, audience, "untrusted"), "lovefutbol", audience)).rejects.toMatchObject({ status: 403 });
  });
  it("does not accept deployments to an unregistered space", async () => {
    await expect(verifyDeploymentToken(await token(), "another-space", audience)).rejects.toMatchObject({ status: 403 });
  });
});
