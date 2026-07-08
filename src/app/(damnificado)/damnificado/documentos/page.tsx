import { DocumentosView } from "./DocumentosView";

// REC-23 · Carga de documentos y evidencias. La vista resuelve la sesión y el
// caso (query `documentos.misDocumentos`) y hace el guard de acceso; la página
// sólo monta el client component.
export default function DocumentosPage() {
  return <DocumentosView />;
}
