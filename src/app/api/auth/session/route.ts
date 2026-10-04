import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-session";

export async function GET(request: NextRequest) {
  const authenticated = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
    process.env.SESSION_SECRET
  );
  return NextResponse.json({ authenticated }, { status: authenticated ? 200 : 401 });
}
