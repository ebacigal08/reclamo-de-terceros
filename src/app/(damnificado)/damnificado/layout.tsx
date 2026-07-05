/**
 * Shell del Damnificado — registro cálido, mobile-first (design system Amparo).
 * Contenedor centrado con ancho de mobile; en desktop queda como una columna
 * cómoda. TODO: agregar el Header móvil (marca + notificaciones) cuando se
 * construya "Mi caso" (REC-61/REC-27).
 */
export default function DamnificadoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <div
        style={{
          maxWidth: 480,
          margin: "0 auto",
          minHeight: "100vh",
          background: "var(--bg-page)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
