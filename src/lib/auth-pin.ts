import "server-only";
import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export async function verifyPin(pin: string, encodedHash: string | undefined): Promise<boolean> {
  if (!encodedHash || !pin) return false;
  const separator = encodedHash.includes(":") ? ":" : "$";
  const [algorithm, saltHex, hashHex, extra] = encodedHash.split(separator);
  if (algorithm !== "scrypt" || !saltHex || !hashHex || extra) return false;
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]{128}$/i.test(hashHex)) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = (await scryptAsync(pin, Buffer.from(saltHex, "hex"), expected.length)) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
