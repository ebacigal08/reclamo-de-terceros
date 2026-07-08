import { OnboardingView } from "./OnboardingView";

// REC-26 · Wizard de bienvenida (primera vez). La vista resuelve la sesión con
// `users.me` y hace el guard de acceso; la página sólo monta el client component.
export default function OnboardingPage() {
  return <OnboardingView />;
}
