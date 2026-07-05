# Amparo — Design System v1.0

**Producto:** CRM Siniestros AR — ayuda a personas damnificadas a llevar su reclamo ante la aseguradora.
**Dirección:** Cálido + claro. Blend de la **calidez de Starbucks** (lienzo templado, geometría amable, sombras susurradas) con la **claridad de Apple** (aire generoso, cromo que se retira, un solo acento disciplinado). Acento **azul confianza**, tipografía **Inter**.
**Fuentes de inspiración:** `Inspiracion/DESIGN-apple.md`, `DESIGN-starbucks.md`, `DESIGN-tesla.md` + PRD `crm - prd 2`.

> Proyecto **nuevo e independiente**. No reemplaza a "Siniestros AR Design System"; es una dirección alternativa, más cálida y humana.

---

## Concepto: *Amparo* (protección / refugio)

Alguien que sufrió un siniestro llega estresado y sin saber por dónde empezar. El sistema tiene que **nivelar la cancha**: contener al damnificado y dar control al agente. De ahí los **dos registros**.

| Registro | Usuario | Dispositivo | Sensación |
|---|---|---|---|
| **Damnificado** | Persona afectada | Mobile-first (375px) | Cálido, cómodo, tranquilizador |
| **Agente** | Gestor de siniestros | Desktop (1280px+) | Denso, eficiente, con control |

**Un solo set de tokens**, dos formas de aplicarlo (densidad, tamaño de tipo, radios, superficies). No son dos sistemas: es el mismo, calibrado.

---

## Fundamentos visuales

### Color
La **calidez vive en los neutros**, no en el acento. El lienzo es un papel cálido (`--neutral-50 #F8F6F1`) — referencia material, humana — y el texto es un negro cálido (`--neutral-900 #211D18`). Sobre eso, un **azul confianza** disciplinado (`--primary-600 #2551C8` para CTAs) aporta seriedad institucional. Las cards blancas reposan sobre el papel: ese contraste sutil es el gesto "producto sobre superficie" (Apple).

- **`primary-900 #182F63`** — sidebar del agente / hero de bienvenida del damnificado (autoridad + contención)
- **`primary-600 #2551C8`** — CTAs, links, foco
- **`neutral-50 #F8F6F1`** — lienzo papel
- **`neutral-900 #211D18`** — texto principal (negro cálido)

Sin gradientes ni texturas. Fondos planos. Sombras **cálidas** (tinte `rgba(45,38,30,…)`), nunca frías/azuladas.

### Tipografía
**Inter** para toda la UI (claridad y legibilidad en datos) y **JetBrains Mono** para IDs de expediente, DNI, fechas y montos. La calidez la aporta el ritmo y el lienzo, no una fuente decorativa: Inter se mantiene disciplinada. Escala de `display` (44/800) a `label` (11/700).

### Geometría y elevación
Radios algo más redondeados que un CRM frío típico (`md 10`, `lg 14`, `xl 20`) — la geometría amable es parte de la calidez. El damnificado usa botones `pill` y la sombra firma `--shadow-lift` (producto levantado sobre superficie). El agente usa `md` y sombras `sm`.

### Movimiento
Transiciones cortas y sobrias (120–180 ms, `ease-standard`). Sin bounces ni springs: un damnificado estresado necesita calma, no espectáculo. Respeta `prefers-reduced-motion`. Los keyframes de entrada (Modal/Drawer/Toast), shimmer (Skeleton) y progreso indeterminado viven en `styles.css`.

### Breakpoints
Mobile-first: `--bp-mobile 375` (piso Damnificado), `--bp-tablet 768`, `--bp-desktop 1280` (piso Agente), `--bp-wide 1536`. Definidos en `tokens/breakpoints.css`. En `@media` usá el px literal (CSS no interpola vars en media queries).

---

## Archivos del sistema

### Tokens (`tokens/`)
`colors.css` · `typography.css` · `spacing.css` · `radii.css` · `elevation.css` · `motion.css` · `breakpoints.css` · `semantic.css`
Entry point: **`styles.css`** (importá solo este; incluye los keyframes de animación).

### Componentes (`components/`) — JSX + d.ts + prompt.md

**core**
| Componente | Nota Amparo |
|---|---|
| Button | `rounded="pill"` para el damnificado |
| Badge | 6 etapas + resultado (rechazado/apelación) + prioridad + pedido + vencimiento |
| Input | `size="lg"` cómodo · `mono` para IDs/DNI |
| Card | `padding` y `shadow="lift"` por registro |

**forms**
| Componente | Nota Amparo |
|---|---|
| Select | alta de caso, filtros |
| Checkbox | consentimientos con hint tranquilizador |
| Textarea | **relato del siniestro** con contador |
| RadioGroup | preguntas de respuesta única (¿hubo heridos?), filtros excluyentes |
| FileUpload | carga de documentos y evidencias (drag & drop + lista) |
| DatePicker | fecha del siniestro sobre `<input type="date">` nativo |

**feedback**
| Componente | Nota Amparo |
|---|---|
| Alert | acuse de recibo (success) — baja la ansiedad |
| Modal | confirmaciones y formularios cortos (cerrar caso) |
| Drawer | detalle contextual 480px sin perder la lista (agente) |
| Toast | notificación breve tras una acción |
| EmptyState | listas sin resultados / primera vez |
| Skeleton | carga (text / block / circle) con shimmer cálido |

**navigation**
| Componente | Nota Amparo |
|---|---|
| Tabs | filtros (pill) · secciones (underline) |
| Stepper | wizard (horizontal) · pipeline (vertical) |
| ProgressBar | completitud (determinada) · espera (indeterminada) |
| Breadcrumb | ruta jerárquica (agente) |
| Sidebar | navegación del agente (navy, 240px) |
| Header | barra superior del damnificado (mobile) |

### Bundle de runtime
Los componentes se exponen en `window.AmparoDesignSystem_70b626`:
- **`_ds_bundle.js`** — los 10 base (Button, Badge, Input, Card, Select, Checkbox, Textarea, Alert, Stepper, Tabs).
- **`_ds_bundle_ext.js`** — los 12 del brief (RadioGroup, FileUpload, DatePicker, Modal, Drawer, Toast, EmptyState, Skeleton, ProgressBar, Breadcrumb, Sidebar, Header).

> Cargá **ambos** (primero el base, después el ext) para tener los 22 componentes. Ambos extienden el mismo namespace.

### Guidelines (pestaña Design System)
Colors (Primary · Warm Neutrals · Status & Accents · Semantic) · Type (Headings · Body · Mono) · Spacing (Scale · In Use) · Elevation (Radius · Shadows) · Badges (Case Status) · **Foundations (Dos registros)**.

### Previews de componentes (grupo Components)
Core · Forms · Forms · Inputs · Feedback · Feedback · Overlays · Feedback · States · Navigation · Navigation · Chrome.

---

## Contenido y tono
- **Idioma:** español rioplatense, voseo. Damnificado en 2ª persona ("Contanos qué pasó"); agente impersonal ("Casos activos").
- **Etapas** en badges: MAYÚSCULAS.
- **IDs de expediente:** `SIN-AAAA-NNNNN` en JetBrains Mono. **Fechas:** `DD/MM/AAAA`.
- **Sin emoji** en la interfaz. Íconos: **Lucide** (outline, stroke 1.5), fuera del bundle.

## Pendientes / caveats
- **Logo:** no provisto. Los ejemplos usan placeholder de texto.
- **Íconos:** Lucide vía CDN; no hay sprite propio. Los componentes con ícono lo reciben por props (Sidebar, EmptyState, Toast usan su set interno mínimo).
- **Fuentes:** Google Fonts CDN. Para producción, evaluar self-hosting (privacidad).
- **DatePicker:** usa el calendario nativo del SO (formato según locale); el valor va en ISO y se muestra `DD/MM/AAAA`.
- **Toast / FileUpload:** presentacionales — el stack de toasts y el manejo real de archivos los resuelve la app.
- **Pantallas del MVP:** este entregable es el **design system** (tokens + 22 componentes + guidelines). Las 10 pantallas del PRD son el paso siguiente (Fase 0.1).
