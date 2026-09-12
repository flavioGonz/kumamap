"use client";

/**
 * Último recurso cuando algo revienta arriba de todo.
 *
 * Reemplaza al layout entero, así que tiene que traer su propio <html>. Lo que
 * importa acá es que quede a la vista el `digest`: es lo único que permite
 * encontrar la traza en el log del servidor, donde sí está el error completo.
 */
export default function ErrorGlobal({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, background: "#0b0f17", color: "#e6edf6", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "40px 20px", textAlign: "center" }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: "rgba(220,38,38,.15)", border: "1px solid rgba(220,38,38,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round">
              <path d="M12 8v5" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="9" />
            </svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Algo se rompió en el controlador</h1>
          <p style={{ color: "#8493a8", fontSize: 13.5, lineHeight: 1.6, maxWidth: "54ch", margin: 0 }}>
            El monitoreo sigue corriendo por detrás: esto es la pantalla, no los sensores.
            Probá de nuevo y, si vuelve a pasar, pasá este código para buscarlo en el registro.
          </p>
          {error.digest && (
            <code style={{ fontSize: 12, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 6, padding: "4px 9px" }}>
              {error.digest}
            </code>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button onClick={() => reset()} style={{ background: "#1b5fd9", border: "none", color: "#fff", font: "inherit", fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 9, cursor: "pointer" }}>
              Reintentar
            </button>
            <a href="/" style={{ background: "transparent", border: "1px solid rgba(255,255,255,.18)", color: "#e6edf6", textDecoration: "none", fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 9 }}>
              Ir a los mapas
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
