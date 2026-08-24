import { RUTAS } from "@/lib/constants";

/**
 * Pie de la landing (REC-10: "links del footer funcionales").
 *
 * **Todos los links de acá funcionan, y ésa es la razón de que sean pocos.** No
 * hay "Política de privacidad", "Términos" ni "Nosotros": esas páginas no
 * existen, y un footer con cuatro anclas muertas es peor que un footer corto.
 * Tampoco hay dirección, teléfono ni redes: son datos del estudio que todavía no
 * están confirmados, y acá se omite lo que no se puede afirmar.
 *
 * La privacidad se explica donde importa —junto al checkbox del formulario, en
 * el momento en que la persona entrega los datos— y no enterrada en un link.
 * Una política legal de verdad queda como issue aparte: es texto del estudio.
 */
export function Footer() {
  const anio = new Date().getFullYear();

  return (
    <footer style={{ borderTop: "1px solid var(--border)", background: "var(--bg-page)" }}>
      <div className="mkt-shell mkt-footer">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 380 }}>
          <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Amparo</span>
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-body-sm-size)",
              lineHeight: 1.6,
              color: "var(--text-secondary)",
            }}
          >
            Acompañamos a personas damnificadas en su reclamo ante la aseguradora.
          </p>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { href: "#como-funciona", label: "Cómo funciona" },
            { href: "#reclamos", label: "Qué reclamos tomamos" },
            { href: "#preguntas", label: "Preguntas frecuentes" },
            { href: "#consulta", label: "Hacer una consulta" },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="mkt-navlink"
              style={{
                fontSize: "var(--text-body-sm-size)",
                fontWeight: 600,
                color: "var(--text-secondary)",
              }}
            >
              {l.label}
            </a>
          ))}
          <a
            href={RUTAS.login}
            className="mkt-navlink"
            style={{
              fontSize: "var(--text-body-sm-size)",
              fontWeight: 600,
              color: "var(--text-link)",
            }}
          >
            Ingresar a mi caso
          </a>
        </nav>
      </div>

      <div className="mkt-shell" style={{ paddingBottom: 28 }}>
        <p
          style={{
            margin: 0,
            paddingTop: 20,
            borderTop: "1px solid var(--divider)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-tertiary)",
          }}
        >
          © {anio} Amparo · Siniestros AR
        </p>
      </div>
    </footer>
  );
}
