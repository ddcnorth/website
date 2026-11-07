/**
 * Pure access-timing rules. Every time-related decision about a share lives
 * here so it can be unit tested and reasoned about in one place.
 *
 *   starts_at        - share cannot be opened before this
 *   activate_by      - a NEW countdown cannot start after this (invitation deadline)
 *   expires_at       - hard cutoff for everyone on this share
 *   duration_minutes - countdown that starts at the first successful unlock
 *   session_minutes  - how long one browser stays unlocked before re-entering
 *   max_unlocks      - how many successful unlocks (new browser sessions) are allowed
 *   revoked_at       - manual kill switch
 */

export interface GrantTiming {
  starts_at: number | null;
  activate_by: number | null;
  expires_at: number | null;
  duration_minutes: number | null;
  session_minutes: number;
  max_unlocks: number | null;
  unlock_count: number;
  revoked_at: number | null;
}

export interface ActivationTiming {
  first_unlocked_at: number;
  expires_at: number | null;
}

export type DenyReason =
  | "revoked"
  | "not_started"
  | "expired"
  | "activation_window_closed"
  | "unlock_limit";

export type UnlockDecision =
  | { ok: true; newActivation: boolean; activationExpiresAt: number | null }
  | { ok: false; reason: DenyReason };

const MIN = 60_000;

/** When a countdown that starts now would end (bounded by the hard cutoff). */
export function activationExpiry(grant: GrantTiming, at: number): number | null {
  const byDuration = grant.duration_minutes ? at + grant.duration_minutes * MIN : null;
  return minOrNull(byDuration, grant.expires_at);
}

/** Can this share be (re)unlocked right now by a visitor? */
export function canUnlock(grant: GrantTiming, activation: ActivationTiming | null, at: number): UnlockDecision {
  if (grant.revoked_at && grant.revoked_at <= at) return { ok: false, reason: "revoked" };
  if (grant.starts_at && at < grant.starts_at) return { ok: false, reason: "not_started" };
  if (grant.expires_at && at >= grant.expires_at) return { ok: false, reason: "expired" };
  if (grant.max_unlocks != null && grant.unlock_count >= grant.max_unlocks) return { ok: false, reason: "unlock_limit" };
  if (activation) {
    if (activation.expires_at && at >= activation.expires_at) return { ok: false, reason: "expired" };
    return { ok: true, newActivation: false, activationExpiresAt: activation.expires_at };
  }
  if (grant.activate_by && at >= grant.activate_by) return { ok: false, reason: "activation_window_closed" };
  return { ok: true, newActivation: true, activationExpiresAt: activationExpiry(grant, at) };
}

/** Is an already-unlocked share still valid for content requests? (No unlock limit check.) */
export function isActive(grant: GrantTiming, activation: ActivationTiming | null, at: number): DenyReason | null {
  if (grant.revoked_at && grant.revoked_at <= at) return "revoked";
  if (grant.starts_at && at < grant.starts_at) return "not_started";
  if (grant.expires_at && at >= grant.expires_at) return "expired";
  if (!activation) return "expired";
  if (activation.expires_at && at >= activation.expires_at) return "expired";
  return null;
}

/** How long one browser stays unlocked: session length, never past the countdown or cutoff. */
export function sessionExpiry(grant: GrantTiming, activationExpiresAt: number | null, at: number): number {
  return minOrNull(at + grant.session_minutes * MIN, activationExpiresAt, grant.expires_at)!;
}

export type GrantStatus = "revoked" | "scheduled" | "not_opened" | "active" | "expired";

/** Status shown in the admin list. */
export function grantStatus(grant: GrantTiming & { timer_scope?: string }, activations: ActivationTiming[], at: number): GrantStatus {
  if (grant.revoked_at && grant.revoked_at <= at) return "revoked";
  if (grant.expires_at && at >= grant.expires_at) return "expired";
  if (grant.starts_at && at < grant.starts_at) return "scheduled";
  const live = activations.some((a) => !a.expires_at || at < a.expires_at);
  if (live) return "active";
  if (activations.length === 0) {
    if (grant.activate_by && at >= grant.activate_by) return "expired";
    if (grant.max_unlocks != null && grant.unlock_count >= grant.max_unlocks) return "expired";
    return "not_opened";
  }
  // Recipient-scoped shares can still start new countdowns for other recipients.
  if (grant.timer_scope === "recipient" && (!grant.activate_by || at < grant.activate_by)) return "active";
  return "expired";
}

function minOrNull(...values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number");
  return v.length ? Math.min(...v) : null;
}
