import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  listarUsuarios, crearUsuario, editarUsuario, cambiarClave, borrarUsuario,
  usuarioDeEntorno, ROLES, type Rol,
} from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/** GET → la lista de usuarios, más el del entorno para que se vea que existe. */
export async function GET(req: NextRequest) {
  const s = requireAdmin(req);
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json({
      usuarios: listarUsuarios(),
      entorno: usuarioDeEntorno(),
      yo: s.usuario,
      roles: ROLES,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 500 });
  }
}

/**
 * POST → { accion: crear | editar | clave | borrar, ... }
 * Todo pasa por acá para no multiplicar rutas por una tabla de seis columnas.
 */
export async function POST(req: NextRequest) {
  const s = requireAdmin(req);
  if (s instanceof NextResponse) return s;
  try {
    const b = await req.json();
    const accion = String(b?.accion || "");
    const usuario = String(b?.usuario || "").trim().toLowerCase();

    if (accion === "crear") {
      const u = crearUsuario({
        usuario, clave: String(b.clave || ""), nombre: b.nombre,
        rol: b.rol as Rol, creadoPor: s.usuario,
      });
      return NextResponse.json({ ok: true, usuario: u });
    }

    if (accion === "editar") {
      if (usuario === s.usuario && b.rol && b.rol !== "admin") {
        return NextResponse.json({ error: "No podés sacarte a vos mismo el rol de administrador." }, { status: 400 });
      }
      if (usuario === s.usuario && b.activo === false) {
        return NextResponse.json({ error: "No podés desactivar tu propia cuenta." }, { status: 400 });
      }
      return NextResponse.json({ ok: true, usuario: editarUsuario(usuario, { nombre: b.nombre, rol: b.rol as Rol, activo: b.activo }) });
    }

    if (accion === "clave") {
      cambiarClave(usuario, String(b.clave || ""));
      return NextResponse.json({ ok: true });
    }

    if (accion === "borrar") {
      if (usuario === s.usuario) {
        return NextResponse.json({ error: "No podés borrar tu propia cuenta." }, { status: 400 });
      }
      borrarUsuario(usuario);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "error" }, { status: 400 });
  }
}
