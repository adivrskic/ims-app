type Status = "live" | "online" | "offline" | "alert";

interface Props {
  status: Status;
  label?: string;
  className?: string;
}

const LABELS: Record<Status, string> = {
  live: "Live",
  online: "Online",
  offline: "Offline",
  alert: "Alert",
};

export function StatusDot({ status, label, className }: Props) {
  return (
    <span className={`inline-flex items-center gap-8 ${className ?? ""}`}>
      <span className={`dot dot-${status}`} aria-hidden="true" />
      <span className="label-text">{label ?? LABELS[status]}</span>
    </span>
  );
}
