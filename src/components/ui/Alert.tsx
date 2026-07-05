import { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, LucideIcon } from "lucide-react";

type Variant = "error" | "warning" | "success" | "info";

const config: Record<Variant, { bg: string; border: string; text: string; Icon: LucideIcon }> = {
  error: { bg: "var(--danger-50)", border: "var(--danger-200)", text: "var(--danger-700)", Icon: AlertCircle },
  warning: { bg: "var(--warning-50)", border: "var(--warning-200)", text: "var(--warning-700)", Icon: AlertTriangle },
  success: { bg: "var(--success-50)", border: "var(--success-200)", text: "var(--success-700)", Icon: CheckCircle2 },
  info: { bg: "var(--primary-50)", border: "var(--primary-200)", text: "var(--primary-700)", Icon: Info },
};

export function Alert({
  variant = "info",
  title,
  children,
}: {
  variant?: Variant;
  title?: string;
  children?: ReactNode;
}) {
  const { bg, border, text, Icon } = config[variant];
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        gap: 10,
        padding: "12px 14px",
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: "var(--radius-md)",
        color: text,
      }}
    >
      <Icon size={18} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, fontFamily: "var(--font-sans)" }}>
        {title && <span style={{ fontSize: "var(--text-body-sm-size)", fontWeight: 700 }}>{title}</span>}
        {children && (
          <span style={{ fontSize: "var(--text-body-sm-size)", lineHeight: 1.45 }}>{children}</span>
        )}
      </div>
    </div>
  );
}
