import { CSSProperties } from "react";

export function Skeleton({
  width = "100%",
  height = 12,
  radius = "var(--radius-sm)",
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className="animate-pulse"
      style={{
        display: "block",
        width,
        height,
        borderRadius: radius,
        background: "var(--neutral-200)",
        ...style,
      }}
    />
  );
}
