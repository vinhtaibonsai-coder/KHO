import { NextResponse } from "next/server";
import { verifyPin, getActivePinHash, getStaffPinHash } from "@/lib/auth-pin";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE, getActiveSessionSecret, type SessionRole } from "@/lib/auth-session";
import { checkPinLock, recordPinFailure, resetPinFailures } from "@/lib/auth-rate-limit";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { pin?: unknown } | null;

  const lock = await checkPinLock();
  if (lock.locked) {
    return NextResponse.json(
      { error: `Sai PIN ${5} lần, khóa ${5} phút. Thử lại sau`, retryAfterSec: lock.retryAfterSec },
      { status: 429 }
    );
  }

  const secret = getActiveSessionSecret();
  const pin = typeof body?.pin === "string" ? body.pin : "";

  let role: SessionRole | null = null;
  if (pin) {
    const activeHash = await getActivePinHash();
    if (await verifyPin(pin, activeHash)) {
      role = "admin";
    } else {
      const staffHash = await getStaffPinHash();
      if (staffHash && (await verifyPin(pin, staffHash))) {
        role = "staff";
      }
    }
  }

  if (!role) {
    const failState = await recordPinFailure();
    if (failState.locked) {
      return NextResponse.json(
        { error: `Sai PIN 5 lần, khóa 5 phút. Thử lại sau ${Math.ceil(failState.retryAfterSec / 60)} phút`, retryAfterSec: failState.retryAfterSec },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: "Mã PIN không đúng" }, { status: 401 });
  }

  await resetPinFailures();

  const response = NextResponse.json({ ok: true, role });
  const isHttps =
    request.headers.get("x-forwarded-proto") === "https" ||
    request.url.startsWith("https:");

  response.cookies.set(SESSION_COOKIE, await createSessionToken(secret, role), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
