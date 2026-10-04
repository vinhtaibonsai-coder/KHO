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

const DEFAULT_SESSION_SECRET =
  "734ffb1066a1cb7b3b77f2f76260e4efe1afd489df8e52ecd6f53b4c38558d99";

export function getActiveSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 32) {
    return envSecret;
  }
  return DEFAULT_SESSION_SECRET;
}

export async function createSessionToken(secret: string = getActiveSessionSecret(), now = Date.now()): Promise<string> {
  const activeSecret = secret?.length >= 32 ? secret : getActiveSessionSecret();
  const payload = bytesToBase64Url(
    encoder.encode(JSON.stringify({ iat: now, exp: now + SESSION_TTL_SECONDS * 1000 }))
  );
  const signature = bytesToBase64Url(await hmac(activeSecret, payload));
  return `${payload}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined = getActiveSessionSecret(),
  now = Date.now()
): Promise<boolean> {
  const activeSecret = secret && secret.length >= 32 ? secret : getActiveSessionSecret();
  if (!token || !activeSecret) return false;
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
