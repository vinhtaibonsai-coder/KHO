import { NextResponse } from "next/server";
import { verifyPin, getActivePinHash } from "@/lib/auth-pin";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth-session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { pin?: unknown } | null;
  const secret = process.env.SESSION_SECRET;
  const activeHash = await getActivePinHash();

  if (!secret || secret.length < 32 || !activeHash) {
    return NextResponse.json({ error: "Hệ thống đăng nhập chưa được cấu hình" }, { status: 503 });
  }
  if (typeof body?.pin !== "string" || !(await verifyPin(body.pin, activeHash))) {
    return NextResponse.json({ error: "Mã PIN không đúng" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  const isHttps =
    request.headers.get("x-forwarded-proto") === "https" ||
    request.url.startsWith("https:");

  response.cookies.set(SESSION_COOKIE, await createSessionToken(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
