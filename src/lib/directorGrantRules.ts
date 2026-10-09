/**
 * Director grant rules — pure gate for autonomous action.
 *
 * Fixed scope set (code-enumerated — adding a scope is a deliberate product
 * decision, never a string typed at runtime). checkGrant is what any
 * future autonomous loop must call before acting solo. No imports: safe
 * for edge, tests, and UI alike.
 */

export type GrantScope = "build_helpers" | "fix_small" | "connect" | "content" | "bookkeeping";

export const GRANT_SCOPES: Array<{ scope: GrantScope; title: string; impact: string }> = [
  { scope: "build_helpers", title: "Build helper operators", impact: "New internal helpers appear as drafted versions, never live, until you approve." },
  { scope: "fix_small", title: "Apply small fixes", impact: "Typos, copy tweaks, and page-visibility corrections go live with a version recorded." },
  { scope: "connect", title: "Complete connector setups", impact: "Finishes OAuth and credential flows you started; never starts new paid connections." },
  { scope: "content", title: "Draft content", impact: "Ideas and captions pile up as drafts for your review. Publishing stays manual." },
  { scope: "bookkeeping", title: "Internal bookkeeping", impact: "Adjusts stock and tasks only where live rows prove the numbers. Never invents quantities." },
];

/** Pure gate: granted scope + known scope, or nothing moves solo. */
export function checkGrant(grants: Array<{ scope: string; allowed: boolean }>, scope: string): boolean {
  return grants.some((g) => g.scope === scope && g.allowed === true);
}
