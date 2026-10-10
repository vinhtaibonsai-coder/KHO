import { NextResponse } from "next/server";
import { createSnapshot, getSnapshot, listSnapshots, restoreSnapshot } from "@/lib/backup";
import { requireAdmin } from "@/lib/auth-role";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const snap = await getSnapshot(id);
    if (!snap) return NextResponse.json({ error: "Không tìm thấy snapshot" }, { status: 404 });
    return NextResponse.json(snap);
  }

  const backups = await listSnapshots();
  return NextResponse.json({ backups });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    id?: string;
  } | null;

  if (!body?.action) {
    return NextResponse.json({ error: "Thiếu action" }, { status: 400 });
  }

  // Cả create lẫn restore đều là tác vụ quản trị
  const gate = await requireAdmin(request);
  if (gate) return gate;

  if (body.action === "create") {
    const backup = await createSnapshot("manual");
    return NextResponse.json({ ok: true, backup });
  }

  if (body.action === "restore") {
    if (!body.id || typeof body.id !== "string") {
      return NextResponse.json({ error: "Thiếu id snapshot" }, { status: 400 });
    }
    const result = await restoreSnapshot(body.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Phục hồi thất bại" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, itemCount: result.itemCount });
  }

  return NextResponse.json({ error: "Action không hợp lệ" }, { status: 400 });
}
