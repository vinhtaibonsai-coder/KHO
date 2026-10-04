import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const pin = process.argv[2];
if (!pin) {
  console.error("Cách dùng: node scripts/generate-pin-hash.mjs <PIN>");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = await promisify(scrypt)(pin, salt, 64);
console.log(`scrypt$${salt.toString("hex")}$${hash.toString("hex")}`);
