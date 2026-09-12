/**
 * Página para una dirección que no existe.
 *
 * Sin esto, Next devuelve su pantalla en blanco de fábrica, que en una consola
 * de monitoreo se lee como "se rompió el sistema" y no como "escribiste mal".
 */
import Link from "next/link";

export default function NoEncontrado() {
  return (
    <div style={envoltura}>
      <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-1px", opacity: .25 }}>404</div>
      <h1 style={titulo}>Esa dirección no existe</h1>
      <p style={texto}>
        El enlace puede estar viejo o mal escrito. Si venías de un mapa que alguien
        te pasó, puede que lo hayan borrado o renombrado.
      </p>
      <Link href="/" style={boton}>Volver a los mapas</Link>
    </div>
  );
}

const envoltura: React.CSSProperties = {
  minHeight: "70vh", display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", gap: 10,
  padding: "40px 20px", textAlign: "center", color: "var(--foreground)",
};
const titulo: React.CSSProperties = { fontSize: 20, fontWeight: 700, margin: 0 };
const texto: React.CSSProperties = {
  color: "var(--muted-foreground)", fontSize: 13.5, lineHeight: 1.6,
  maxWidth: "52ch", margin: "0 0 8px",
};
const boton: React.CSSProperties = {
  background: "#1b5fd9", color: "#fff", textDecoration: "none",
  fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 9,
};
