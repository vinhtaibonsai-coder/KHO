import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export function signWebhookBody(rawBody: string, timestamp: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyWebhookSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  secret: string | undefined,
  now = Date.now()
): boolean {
  if (!secret || !timestamp || !signature || !/^\d{13}$/.test(timestamp) || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) return false;
  const expected = Buffer.from(signWebhookBody(rawBody, timestamp, secret), "hex");
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
