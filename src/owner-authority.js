const encoder = new TextEncoder();
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const normal = email => String(email || '').trim().toLowerCase();

export async function ownerConfigHash({issuer, audience, subject, email}) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify([issuer, audience, subject, normal(email)])))));
}

export async function isOwner(claims, env, control) {
  const sub = env.OWNER_ACCESS_SUB, email = normal(env.OWNER_ACCESS_EMAIL);
  if (!sub || !email || !control || control.authority_epoch == null || !control.owner_config_hash || !claims) return false;
  const allowlist = (env.ADMIN_EMAILS || '').split(',').map(normal);
  if (claims.iss !== env.ACCESS_ISSUER || !Array.isArray(claims.aud) || !claims.aud.includes(env.ACCESS_AUD)) return false;
  if (claims.sub !== sub || normal(claims.email) !== email || !allowlist.includes(email)) return false;
  return await ownerConfigHash({issuer: env.ACCESS_ISSUER, audience: env.ACCESS_AUD, subject: sub, email}) === control.owner_config_hash;
}
