interface Props {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
  showDot?: boolean;
  label?: string;
}

export function Sparkline({
  values,
  width = 120,
  height = 36,
  stroke = "var(--accent)",
  fill = "var(--accent-glow)",
  className,
  showDot = true,
  label,
}: Props) {
  if (values.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        aria-hidden="true"
      >
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--border-subtle)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
      </svg>
    );
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const padY = 2;

  const points = values.map((v, i) => {
    const x = i * step;
    const y = padY + (1 - (v - min) / range) * (height - padY * 2);
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(" ");

  const fillPath = `${linePath} L ${points[points.length - 1][0]} ${height} L 0 ${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      preserveAspectRatio="none"
    >
      <path d={fillPath} fill={fill} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDot && (
        <>
          <circle cx={last[0]} cy={last[1]} r="3" fill="var(--bg)" />
          <circle cx={last[0]} cy={last[1]} r="2" fill={stroke} />
        </>
      )}
    </svg>
  );
}
