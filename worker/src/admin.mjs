import { authenticate, accountConfigured } from './auth.mjs';
import { exactKeys, invalid, forbidden, unavailable, readBytes, ApiError } from './http.mjs';
import { query } from './store.mjs';
import { hmac, take } from './limits.mjs';

export const adminConfigured = env => accountConfigured(env) && /^sk_(live|test)_[A-Za-z0-9+/=_-]{20,480}$/.test(env.CLERK_SECRET_KEY || '');
const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export async function authorizeAdmin(request, env, deps) {
  if (!adminConfigured(env)) throw unavailable();
  const subject = await authenticate(request, env, deps);
  if (!/^user_[A-Za-z0-9]+$/.test(subject)) throw forbidden();
  const known = await query(env.DB, 'SELECT enabled FROM admins WHERE subject=?', subject).first();
  const now = Math.floor(deps.now() / 1000), hour = Math.floor(now / 3600), expires = (hour + 1) * 3600;
  const key = await hmac(env.RATE_LIMIT_SECRET, `admin-session:${subject}:${hour}`);
  if (!await take(env.DB, key, known?.enabled ? 600 : 12, expires, now)) throw new ApiError('RATE_LIMITED', 'Please wait before trying again.', 429, expires - now);
  // Read the primary email from Clerk's server API. Client profile fields,
  // user-editable metadata, and arbitrary JWT email claims confer no role.
  const response = await deps.fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(subject)}`, {
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, Accept: 'application/json' },
    redirect: 'manual', signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) { await response.body?.cancel(); throw response.status === 404 ? forbidden() : unavailable(); }
  const user = JSON.parse(new TextDecoder().decode(await readBytes(response.body, 65536)));
  const primary = user.email_addresses?.find(item => item.id === user.primary_email_address_id);
  if (user.id !== subject || user.banned || user.locked || primary?.verification?.status !== 'verified' || !validEmail(primary.email_address)) throw forbidden();
  const email = primary.email_address.toLowerCase();
  // Bind each invitation to its first verified Clerk subject. A recreated
  // account with the same email does not inherit an existing administrator.
  const admin = await query(env.DB, `UPDATE admins SET subject=COALESCE(subject,?)
    WHERE email=? AND enabled=1 AND (subject IS NULL OR subject=?) RETURNING email,subject,role`, subject, email, subject).first();
  if (!admin) throw forbidden();
  return admin;
}
export async function members(db, admin, body) {
  if (admin.role !== 'owner') throw forbidden();
  if (body !== undefined) {
    exactKeys(body, ['email', 'enabled']);
    if (!validEmail(body.email) || typeof body.enabled !== 'boolean') throw invalid('Enter a valid email address.');
    const email = body.email.trim().toLowerCase();
    const owner = await query(db, "SELECT email FROM admins WHERE email=? AND role='owner'", email).first();
    if (owner) throw invalid('The default owner cannot be changed here.');
    await query(db, `INSERT INTO admins(email,role,enabled,created_at,updated_by) VALUES(?,'admin',?,?,?)
      ON CONFLICT(email) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by WHERE admins.role<>'owner'`,
    email, Number(body.enabled), new Date().toISOString(), admin.subject).run();
  }
  const rows = await query(db, 'SELECT email,role,enabled,created_at FROM admins ORDER BY role DESC,email').all();
  return { members: rows.results.map(row => ({ email: row.email, role: row.role, enabled: Boolean(row.enabled), createdAt: row.created_at })) };
}
