import { PROJECT_FLAIR } from '../worker/src/source-policy.mjs';
import { sourceUrl } from '../worker/src/validation.mjs';

// Operator-reviewed current Reddit evidence can supersede a stale archive
// snapshot. This never fetches, infers approval, or changes source attribution.
export function applyCurrentSourceEvidence(rows, checks = [], reviewedAt) {
  const lookup = new Map(rows.map(post => [post.id, post]));
  const seen = new Set();
  for (const check of checks) {
    const post = lookup.get(check.id);
    if (!post || seen.has(check.id) || check.url !== sourceUrl(check.id)
      || check.author !== post.author || check.title !== post.title
      || check.flair !== PROJECT_FLAIR || check.availability !== 'public'
      || typeof check.reason !== 'string' || check.reason.trim().length < 20
      || !Number.isFinite(Date.parse(check.checkedAt)) || Date.parse(check.checkedAt) > Date.parse(reviewedAt)
      || Date.parse(check.checkedAt) < post.created_utc * 1000) throw new Error(`Invalid current-source evidence: ${check.id}`);
    seen.add(check.id);
    if (post.removed_by || post.banned_by || post.removed === true) throw new Error(`Unreviewed removal flags: ${check.id}`);
    const alreadyCurrent = post.link_flair_text === check.flair && !post.removed_by_category;
    if (!alreadyCurrent && (post.link_flair_text !== check.archived?.flair
      || (post.removed_by_category ?? null) !== check.archived?.removedByCategory)) {
      throw new Error(`Archive evidence changed; review again: ${check.id}`);
    }
    lookup.set(check.id, { ...post, link_flair_text: check.flair, removed_by_category: null });
  }
  return rows.map(post => lookup.get(post.id));
}
