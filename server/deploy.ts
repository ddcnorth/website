import { createRemoteJWKSet, jwtVerify } from "jose";
import projects from "../projects.json";
import { getSpaceBySlug, logEvent } from "./access";
import type { Env } from "./env";
import { HttpError, json } from "./util";

const ISSUER = "https://token.actions.githubusercontent.com";
const keys = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`));

/** Only the registered repository's main-branch publishing workflow may write its space. */
export async function verifyDeploymentToken(token: string, slug: string, audience: string) {
  const project = projects.spaces.find(p => p.slug === slug);
  if (!project?.repo_id || !project.owner_id) throw new HttpError(403, "deployment_not_registered");
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: ISSUER, audience, algorithms: ["RS256"], maxTokenAge: "10m",
      requiredClaims: ["sub", "exp", "iat", "sha", "repository", "repository_id", "repository_owner_id", "ref", "workflow_ref"],
    });
    const ref = `refs/heads/${project.ref}`;
    const [owner, name] = project.repo.split("/");
    const subjects = [
      `repo:${project.repo}:ref:${ref}`,
      `repo:${owner}@${project.owner_id}/${name}@${project.repo_id}:ref:${ref}`,
    ];
    if (payload.repository !== project.repo || payload.repository_id !== project.repo_id
      || payload.repository_owner_id !== project.owner_id || payload.ref !== ref
      || payload.workflow_ref !== `${project.repo}/.github/workflows/deploy-portal.yml@${ref}`
      || !subjects.includes(payload.sub!) || !["push", "workflow_dispatch"].includes(String(payload.event_name))
      || typeof payload.sha !== "string" || !/^[a-f0-9]{40}$/.test(payload.sha)) {
      throw new Error("Deployment identity does not match the registered project.");
    }
    return { project, version: payload.sha };
  } catch {
    throw new HttpError(403, "deployment_not_authorized");
  }
}

async function authorize(request: Request, env: Env, slug: string) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new HttpError(401, "deployment_token_required");
  const deployment = await verifyDeploymentToken(token, slug, env.PORTAL_ORIGIN ?? `https://${env.PORTAL_ROOT_DOMAIN}`);
  const space = await getSpaceBySlug(env, slug);
  if (!space || space.repo !== deployment.project.repo) throw new HttpError(403, "deployment_space_mismatch");
  return { ...deployment, space };
}

export async function uploadDeploymentFile(request: Request, env: Env, slug: string) {
  const { version } = await authorize(request, env, slug);
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!path || path.startsWith("/") || /[\\\0]/.test(path) || path.split("/").some(s => !s || s === "." || s === "..")) {
    throw new HttpError(400, "invalid_deployment_path");
  }
  const size = Number(request.headers.get("content-length"));
  if (!request.headers.has("content-length") || !Number.isSafeInteger(size) || size < 0 || size > 25 * 1024 * 1024) {
    throw new HttpError(413, "deployment_file_too_large");
  }
  await env.SITES.put(`sites/${slug}/${version}/${path}`, request.body ?? new Uint8Array());
  return json({ uploaded: true });
}

export async function activateDeployment(request: Request, env: Env, slug: string) {
  const { version, project, space } = await authorize(request, env, slug);
  if (!await env.SITES.head(`sites/${slug}/${version}/index.html`)) throw new HttpError(409, "deployment_incomplete");
  await env.SITES.put(`sites/${slug}/current.json`, JSON.stringify({
    version, repo: project.repo, ref: project.ref, deployed_at: new Date().toISOString(),
  }), { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
  await logEvent(env, null, "admin_change", { space_id: space.id, detail: { action: "github_deployment", repo: project.repo, version } });
  return json({ deployed: true, version });
}
