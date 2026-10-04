const SESSION_TTL_SECONDS = 12 * 60 * 60;

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function createSessionToken(secret: string, now = Date.now()): Promise<string> {
  if (secret.length < 32) throw new Error("SESSION_SECRET phải có ít nhất 32 ký tự");
  const payload = bytesToBase64Url(
    encoder.encode(JSON.stringify({ iat: now, exp: now + SESSION_TTL_SECONDS * 1000 }))
  );
  const signature = bytesToBase64Url(await hmac(secret, payload));
  return `${payload}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
  now = Date.now()
): Promise<boolean> {
  if (!token || !secret || secret.length < 32) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  try {
    const actual = base64UrlToBytes(signature);
    const expected = await hmac(secret, payload);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= actual[i] ^ expected[i];
    if (difference !== 0) return false;
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as {
      iat?: number;
      exp?: number;
    };
    return Number.isFinite(parsed.iat) && Number.isFinite(parsed.exp) && parsed.iat! <= now && parsed.exp! > now;
  } catch {
    return false;
  }
}

export const SESSION_COOKIE = "app_session";
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;
