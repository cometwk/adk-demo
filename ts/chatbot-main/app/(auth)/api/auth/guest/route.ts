import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawRedirect = searchParams.get("redirectUrl") || "/";
  const redirectUrl =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/";

  // 直接重定向到目标页面，不再检查 token
  return NextResponse.redirect(new URL(redirectUrl, request.url));
}