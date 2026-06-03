export function authorizeSharedSecret({
  auth,
  configuredSecret,
  header,
}: {
  auth: string | null;
  configuredSecret: string | undefined;
  header: string | null;
}): { ok: true } | { ok: false; error: string } {
  const secret = normalizeSecret(configuredSecret);
  if (!secret) return { ok: false, error: 'SWAG_STORE_RESET_SECRET is not set' };

  const bearer = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
  const candidate = normalizeSecret(header) ?? normalizeSecret(bearer);

  if (candidate === secret) return { ok: true };
  return { ok: false, error: 'unauthorized' };
}

function normalizeSecret(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value
    .trim()
    .replace(/^(?:\\[nrt])+|(?:\\[nrt])+$/g, '');
  if (!trimmed) return null;

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return normalizeSecret(parsed);
    } catch {
      return trimmed.slice(1, -1).trim() || null;
    }
  }

  return trimmed;
}
