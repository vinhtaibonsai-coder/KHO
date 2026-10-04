import { NextResponse } from "next/server";
import { verifyPin, getActivePinHash, updatePinInDatabase } from "@/lib/auth-pin";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    currentPin?: unknown;
    newPin?: unknown;
  } | null;

  if (typeof body?.currentPin !== "string" || typeof body?.newPin !== "string") {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  if (!/^\d{4}$/.test(body.newPin)) {
    return NextResponse.json({ error: "Mã PIN mới phải gồm đúng 4 chữ số" }, { status: 400 });
  }

  const activeHash = await getActivePinHash();
  const isValidCurrent = await verifyPin(body.currentPin, activeHash);
  if (!isValidCurrent) {
    return NextResponse.json({ error: "Mã PIN hiện tại không chính xác" }, { status: 401 });
  }

  await updatePinInDatabase(body.newPin);
  return NextResponse.json({ ok: true, message: "Đổi mã PIN thành công" });
}
