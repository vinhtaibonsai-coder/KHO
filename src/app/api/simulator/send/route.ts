import { NextResponse } from "next/server";
import { signWebhookBody } from "@/lib/webhook-signature";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload?.groupId || !payload?.message) {
    return NextResponse.json({ error: "Thiếu groupId hoặc message" }, { status: 400 });
  }
  const secret = process.env.ZALO_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook chưa được cấu hình" }, { status: 503 });
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const response = await fetch(new URL("/api/webhook/zalo", request.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-zalo-timestamp": timestamp,
      "x-zalo-signature": signWebhookBody(rawBody, timestamp, secret),
    },
    body: rawBody,
    cache: "no-store",
  });
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
  });
}
