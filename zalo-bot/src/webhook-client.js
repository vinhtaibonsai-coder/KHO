import { createHmac } from "node:crypto";

export async function sendSignedWebhook(url, payload) {
  const secret = process.env.ZALO_WEBHOOK_SECRET;
  if (!secret) throw new Error("Thiếu ZALO_WEBHOOK_SECRET trong zalo-bot/.env");
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-zalo-timestamp": timestamp,
      "x-zalo-signature": signature,
    },
    body: rawBody,
  });
}
