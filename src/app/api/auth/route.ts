import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation";
import {
  createSessionToken,
  checkLoginRateLimit,
  resetLoginRateLimit,
  leerSesion,
} from "@/lib/auth";
import { verificarCredenciales } from "@/lib/usuarios";

/** GET → quién está adentro. Lo usa la interfaz para saber qué mostrar. */
export async function GET(req: NextRequest) {
  const s = leerSesion(req);
  if (!s) return NextResponse.json({ autenticado: false }, { status: 200 });
  return NextResponse.json({ autenticado: true, usuario: s.usuario, rol: s.rol });
}

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

  // Primero la tabla de usuarios; si no hay coincidencia, el usuario del entorno
  // (KUMA_USER / KUMA_PASS), que es la llave de repuesto para no quedarse afuera.
  let cred = null;
  try {
    cred = verificarCredenciales(username, password);
  } catch (err) {
    console.error("[Auth] Error consultando la tabla de usuarios:", err);
    // Si la tabla falla, el entorno todavía tiene que poder entrar.
    const envU = (process.env.KUMA_USER || "").trim();
    const envP = process.env.KUMA_PASS || "";
    if (envU && envP && username === envU && password === envP) {
      cred = { usuario: envU, rol: "admin" as const, origen: "entorno" as const };
    }
  }

  if (!cred) {
    console.warn(`[Auth] Failed login attempt for user: ${username} from ${ip}`);
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }

  resetLoginRateLimit(ip);

  const token = createSessionToken(cred.usuario, cred.rol);
  console.log(`[Auth] Successful login for user: ${cred.usuario} (${cred.rol}, ${cred.origen})`);

  const response = NextResponse.json({ success: true, username: cred.usuario, rol: cred.rol });
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
