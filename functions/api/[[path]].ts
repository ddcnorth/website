import { handleApi } from "../../server/api";
import type { Env } from "../../server/env";

// All /api/* requests: client access endpoints and the admin API.
export const onRequest: PagesFunction<Env> = (ctx) => handleApi(ctx.request, ctx.env, (p) => ctx.waitUntil(p));
