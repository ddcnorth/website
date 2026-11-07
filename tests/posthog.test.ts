import { describe, expect, it } from "vitest";
import { buildCapture, posthogPersonUrl, posthogSnippet, resolvePosthog } from "../server/posthog";
import type { PosthogSettings } from "../server/settings";

const settings: PosthogSettings = { enabled: true, key: "phc_test", host: "", ui_host: "", project_id: "123", track_new_shares: true };
const c = resolvePosthog(settings)!;

describe("posthog", () => {
  it("is off unless enabled with a key", () => {
    expect(resolvePosthog({ ...settings, enabled: false })).toBeNull();
    expect(resolvePosthog({ ...settings, key: " " })).toBeNull();
  });
  it("identifies verified emails and keeps link visitors anonymous", () => {
    const known = buildCapture(c, { event: "portal_unlock_ok", email: "jane@unbc.ca", session_id: "ses_1", ip: "1.2.3.4" }, "anon_x");
    expect(known).toMatchObject({ api_key: "phc_test", distinct_id: "jane@unbc.ca", properties: { $ip: "1.2.3.4", $set: { email: "jane@unbc.ca" } } });
    const link = buildCapture(c, { event: "portal_view", session_id: "ses_1" }, "anon_x");
    expect(link).toMatchObject({ distinct_id: "ses_1", properties: { $process_person_profile: false } });
    expect(buildCapture(c, { event: "portal_link_opened" }, "anon_x").distinct_id).toBe("anon_x");
  });
  it("derives the app host and person links", () => {
    expect(c.host).toBe("https://us.i.posthog.com");
    expect(c.appUrl).toBe("https://us.posthog.com");
    expect(resolvePosthog({ ...settings, host: "https://eu.i.posthog.com/" })!.appUrl).toBe("https://eu.posthog.com");
    expect(posthogPersonUrl(c, "jane@unbc.ca")).toBe("https://us.posthog.com/project/123/person/jane%40unbc.ca");
    expect(posthogPersonUrl(resolvePosthog({ ...settings, project_id: "" }), "x")).toBeNull();
  });
  it("cannot be broken out of the script tag", () => {
    const html = posthogSnippet(c, { distinctId: "</script><b>", identified: false, email: null, slug: "s", shareId: "g", replay: false });
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });
});
