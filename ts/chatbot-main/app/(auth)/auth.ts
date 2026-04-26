import { type DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

export type UserType = "guest" | "regular";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    email?: string | null;
    type: UserType;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
  }
}

// 模拟 session，屏蔽认证检查
const MOCK_USER_ID = "mock-user-001";

export async function auth() {
  return {
    user: {
      id: MOCK_USER_ID,
      email: "mock@example.com",
      type: "regular" as UserType,
      name: "Mock User",
    },
    expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  } as any;
}

// Mock signIn/signOut - 直接返回成功
export async function signIn(_provider?: string, _options?: any) {
  return { status: "success" };
}

export async function signOut(_options?: any) {
  return { status: "success" };
}

// Mock GET/POST handlers for auth routes
export async function GET(request: Request) {
  return new Response(JSON.stringify({ mock: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

export async function POST(request: Request) {
  return new Response(JSON.stringify({ mock: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}