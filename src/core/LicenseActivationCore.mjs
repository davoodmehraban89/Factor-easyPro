import { validateEntitlementPayload, verifyEntitlement } from './EntitlementVerifier.mjs';
import { OFFLINE_LEASE_DAYS } from './LicensePolicy.mjs';

export function loadProductionLicensePublicKey(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) return null;
  try {
    const jwk = JSON.parse(rawValue);
    if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' ||
        typeof jwk.x !== 'string' || typeof jwk.y !== 'string' ||
        !jwk.x || !jwk.y || 'd' in jwk ||
        (jwk.key_ops && JSON.stringify(jwk.key_ops) !== '["verify"]')) {
      return null;
    }
    return jwk;
  } catch { return null; }
}

/**
 * Verify a signed, installation-bound offline lease.
 * NEVER pass a public key from the token itself; the trusted key is only
 * supplied by the application build configuration.
 */
export async function validateOfflineActivation(token, publicJwk, installationId, nowMs = Date.now()) {
  if (!publicJwk || !token || typeof token !== 'object' ||
      !validateEntitlementPayload(token.payload, installationId, nowMs)) return false;
  const lease = token.payload.lastOnlineCheckAt;
  if (typeof lease !== 'string' || !lease.trim()) return false;
  const checkedAtMs = Date.parse(lease);
  if (!Number.isFinite(checkedAtMs) ||
      checkedAtMs > nowMs + 5 * 60 * 1000 ||
      nowMs - checkedAtMs > OFFLINE_LEASE_DAYS * 86400000) return false;
  // Prevent using a token ostensibly signed after its offline lease timestamp.
  const issuedAt = token.payload.issuedAt;
  if (typeof issuedAt !== 'string' || !Number.isFinite(Date.parse(issuedAt)) ||
      Date.parse(issuedAt) > checkedAtMs ||
      Date.parse(issuedAt) > nowMs + 5 * 60 * 1000) return false;
  return verifyEntitlement(token, publicJwk);
}
