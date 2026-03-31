import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ error: "Usuario y contraseña requeridos" }, { status: 400 });
  }

  // Validate against KUMA_USER/KUMA_PASS env vars.
  // The main server already authenticates against Kuma on startup via Socket.IO,
  // so we trust these credentials are correct. This avoids opening a second
  // Socket.IO connection per login which times out in Kuma 2.0.
  const validUser = process.env.KUMA_USER || "";
  const validPass = process.env.KUMA_PASS || "";

  if (!validUser || !validPass) {
    console.error("[Auth] KUMA_USER or KUMA_PASS not set in environment");
    return NextResponse.json({ error: "Servidor mal configurado" }, { status: 500 });
  }

  if (username !== validUser || password !== validPass) {
    console.warn(`[Auth] Failed login attempt for user: ${username}`);
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }

  // Generate a simple session token (base64 of username:timestamp)
  const token = Buffer.from(`${username}:${Date.now()}`).toString("base64");

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

