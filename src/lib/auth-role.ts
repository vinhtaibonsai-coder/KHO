import "server-only";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, getSessionRole, type SessionRole } from "./auth-session";

/**
 * Trích role từ cookie session trong request. null nếu chưa đăng nhập/token sai.
 */
export async function getSessionRoleFromRequest(req: Request): Promise<SessionRole | null> {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  const token = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  return getSessionRole(token);
}

/**
 * Trả về Response 403 nếu không phải admin, null nếu đạt quyền admin.
 * GATE BẮT BUỘC ở mọi route handler thực hiện hành động ghi.
 */
export async function requireAdmin(req: Request): Promise<Response | null> {
  const role = await getSessionRoleFromRequest(req);
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Chỉ Admin mới thực hiện được thao tác này" },
      { status: 403 }
    );
  }
  return null;
}
