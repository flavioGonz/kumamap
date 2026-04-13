import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation";
import {
  createSessionToken,
  checkLoginRateLimit,
  resetLoginRateLimit,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  // Rate limiting by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkLoginRateLimit(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Intente de nuevo en 15 minutos." },
      { status: 429 }
    );
  }

  const body = await req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { username, password } = parsed.data;

  // Validate against KUMA_USER/KUMA_PASS env vars.
  const validUser = process.env.KUMA_USER || "";
  const validPass = process.env.KUMA_PASS || "";

  if (!validUser || !validPass) {
    console.error("[Auth] KUMA_USER or KUMA_PASS not set in environment");
    return NextResponse.json({ error: "Servidor mal configurado" }, { status: 500 });
  }

  if (username !== validUser || password !== validPass) {
    console.warn(`[Auth] Failed login attempt for user: ${username} from ${ip}`);
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }

  // Success — reset rate limit and create secure token
  resetLoginRateLimit(ip);

  const token = createSessionToken(username);
  console.log(`[Auth] Successful login for user: ${username}`);

  const response = NextResponse.json({ success: true, username });
  response.cookies.set("kumamap_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 86400 * 7, // 7 days
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("kumamap_session");
  return response;
}
