import { describe, expect, it } from "vitest";
import { activationExpiry, canUnlock, grantStatus, isActive, sessionExpiry, type GrantTiming } from "../server/policy";

const H = 3_600_000;
const T0 = Date.UTC(2026, 10, 2, 9); // Monday 09:00 UTC
const grant = (g: Partial<GrantTiming> = {}): GrantTiming => ({
  starts_at: null, activate_by: null, expires_at: null, duration_minutes: null,
  session_minutes: 720, max_unlocks: null, unlock_count: 0, revoked_at: null, ...g,
});

describe("canUnlock", () => {
  it("starts a countdown on first unlock", () => {
    expect(canUnlock(grant({ duration_minutes: 48 * 60 }), null, T0)).toEqual({ ok: true, newActivation: true, activationExpiresAt: T0 + 48 * H });
  });

  it("caps the countdown at the hard end date", () => {
    // 48 h after first open, but never past Friday 17:00.
    const fri = T0 + 4 * 24 * H + 8 * H;
    const g = grant({ duration_minutes: 48 * 60, expires_at: fri });
    expect(activationExpiry(g, T0 + 24 * H)).toBe(T0 + 72 * H); // Tuesday open -> Thursday
    expect(activationExpiry(g, fri - 3 * H)).toBe(fri); // Friday morning -> Friday afternoon
  });

  it("re-unlocking keeps the original countdown", () => {
    const act = { first_unlocked_at: T0, expires_at: T0 + 2 * H };
    expect(canUnlock(grant({ duration_minutes: 120 }), act, T0 + H)).toEqual({ ok: true, newActivation: false, activationExpiresAt: T0 + 2 * H });
    expect(canUnlock(grant({ duration_minutes: 120 }), act, T0 + 2 * H)).toEqual({ ok: false, reason: "expired" });
  });

  it("enforces the invitation deadline only for new countdowns", () => {
    const g = grant({ activate_by: T0 + H, duration_minutes: 600 });
    expect(canUnlock(g, null, T0 + 2 * H)).toEqual({ ok: false, reason: "activation_window_closed" });
    expect(canUnlock(g, { first_unlocked_at: T0, expires_at: T0 + 10 * H }, T0 + 2 * H).ok).toBe(true);
  });

  it("refuses before start, after revoke and past the unlock limit", () => {
    expect(canUnlock(grant({ starts_at: T0 + H }), null, T0)).toEqual({ ok: false, reason: "not_started" });
    expect(canUnlock(grant({ revoked_at: T0 - 1 }), null, T0)).toEqual({ ok: false, reason: "revoked" });
    expect(canUnlock(grant({ max_unlocks: 1, unlock_count: 1 }), null, T0)).toEqual({ ok: false, reason: "unlock_limit" });
  });
});

describe("isActive / sessionExpiry", () => {
  it("content requests need an activation that has not ended", () => {
    const g = grant({ duration_minutes: 60 });
    expect(isActive(g, null, T0)).toBe("expired");
    expect(isActive(g, { first_unlocked_at: T0, expires_at: T0 + H }, T0 + 30 * 60_000)).toBeNull();
    expect(isActive(g, { first_unlocked_at: T0, expires_at: T0 + H }, T0 + H)).toBe("expired");
    // The unlock limit does not kick out people already inside.
    expect(isActive(grant({ max_unlocks: 1, unlock_count: 1 }), { first_unlocked_at: T0, expires_at: null }, T0 + H)).toBeNull();
  });

  it("a browser session never outlives the countdown", () => {
    expect(sessionExpiry(grant({ session_minutes: 720 }), T0 + H, T0)).toBe(T0 + H);
    expect(sessionExpiry(grant({ session_minutes: 60 }), null, T0)).toBe(T0 + H);
  });
});

describe("grantStatus", () => {
  it("reports the lifecycle", () => {
    expect(grantStatus(grant(), [], T0)).toBe("not_opened");
    expect(grantStatus(grant({ starts_at: T0 + H }), [], T0)).toBe("scheduled");
    expect(grantStatus(grant(), [{ first_unlocked_at: T0, expires_at: T0 + H }], T0)).toBe("active");
    expect(grantStatus(grant(), [{ first_unlocked_at: T0, expires_at: T0 + H }], T0 + 2 * H)).toBe("expired");
    expect(grantStatus({ ...grant(), timer_scope: "recipient" }, [{ first_unlocked_at: T0, expires_at: T0 + H }], T0 + 2 * H)).toBe("active");
    expect(grantStatus(grant({ revoked_at: T0 }), [], T0)).toBe("revoked");
  });
});
