import { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 12,
        padding: "40px 24px",
        maxWidth: 420,
      }}
    >
      {icon && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 56,
            height: 56,
            borderRadius: "var(--radius-full)",
            background: "var(--bg-subtle)",
            color: "var(--text-tertiary)",
          }}
        >
          {icon}
        </div>
      )}
      <h3
        style={{
          margin: 0,
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-h4-size)",
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-body-size)",
            color: "var(--text-secondary)",
            lineHeight: 1.55,
          }}
        >
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}
