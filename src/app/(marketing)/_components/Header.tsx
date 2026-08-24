import { RUTAS } from "@/lib/constants";
import { LinkButton } from "./LinkButton";

/**
 * Barra superior de la landing. RSC: no tiene estado.
 *
 * REC-6 pedía un menú hamburguesa. No lleva: en mobile los enlaces de sección se
 * ocultan (`.mkt-nav-links`) y quedan la marca y "Ingresar", que son los dos
 * destinos que importan. Un menú desplegable exigiría `"use client"` en el header
 * —y con él, hidratación— para esconder tres anclas que la persona alcanza igual
 * scrolleando. La página es corta: el menú resolvería un problema que no tiene.
 */
export function Header() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "rgba(248,246,241,0.88)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        className="mkt-shell"
        style={{
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <a
          href="#top"
          style={{
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
          }}
        >
          Amparo
        </a>

        <nav style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="mkt-nav-links" style={{ gap: 4 }}>
            {[
              { href: "#como-funciona", label: "Cómo funciona" },
              { href: "#reclamos", label: "Qué reclamos" },
              { href: "#preguntas", label: "Preguntas" },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="mkt-navlink"
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--text-body-sm-size)",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                }}
              >
                {l.label}
              </a>
            ))}
          </span>
          <LinkButton href={RUTAS.login} variant="secondary" size="md">
            Ingresar
          </LinkButton>
        </nav>
      </div>
    </header>
  );
}
