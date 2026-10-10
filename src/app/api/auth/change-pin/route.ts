import { NextResponse } from "next/server";
import { verifyPin, getActivePinHash, updatePinInDatabase, setStaffPinHash } from "@/lib/auth-pin";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    currentPin?: unknown;
    newPin?: unknown;
    newStaffPin?: unknown;
  } | null;

  if (typeof body?.currentPin !== "string") {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const hasAdminChange = typeof body.newPin === "string";
  const hasStaffChange = typeof body.newStaffPin === "string";

  if (!hasAdminChange && !hasStaffChange) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  if (hasAdminChange && !/^\d{4}$/.test(body.newPin as string)) {
    return NextResponse.json({ error: "Mã PIN mới phải gồm đúng 4 chữ số" }, { status: 400 });
  }
  if (hasStaffChange && !/^\d{4}$/.test(body.newStaffPin as string)) {
    return NextResponse.json({ error: "Mã PIN Nhân viên phải gồm đúng 4 chữ số" }, { status: 400 });
  }

  // Cả 2 nhánh đều verify bằng Admin PIN hiện tại
  const activeHash = await getActivePinHash();
  const isValidCurrent = await verifyPin(body.currentPin, activeHash);
  if (!isValidCurrent) {
    return NextResponse.json({ error: "Mã PIN Admin hiện tại không chính xác" }, { status: 401 });
  }

  if (hasStaffChange) {
    await setStaffPinHash(body.newStaffPin as string);
    return NextResponse.json({ ok: true, message: "Đã cập nhật mã PIN Nhân viên" });
  }

  await updatePinInDatabase(body.newPin as string);
  return NextResponse.json({ ok: true, message: "Đổi mã PIN thành công" });
}
