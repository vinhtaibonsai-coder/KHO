import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, getSessionRole } from "@/lib/auth-session";

export async function GET(request: NextRequest) {
  const role = await getSessionRole(request.cookies.get(SESSION_COOKIE)?.value);
  const authenticated = role !== null;
  return NextResponse.json({ authenticated, role }, { status: authenticated ? 200 : 401 });
}
