"use client";

import { useState } from "react";
import {
  X,
  RotateCcw,
  ClipboardCopy,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ParticleRingConfig } from "./ParticleRing";

interface Props {
  config: ParticleRingConfig;
  defaults: ParticleRingConfig;
  onChange: (c: ParticleRingConfig) => void;
}

export function ParticleRingDebug({ config, defaults, onChange }: Props) {
  const [open, setOpen] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof ParticleRingConfig>(
    key: K,
    value: ParticleRingConfig[K]
  ) => {
    onChange({ ...config, [key]: value });
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed top-16 right-16 hairline-subtle bg-[var(--surface)] px-12 py-6 hover:border-[var(--border-hover)] transition-colors"
        style={{ zIndex: 100 }}
        aria-label="Show particle debug panel"
      >
        <span className="label-text">Debug</span>
      </button>
    );
  }

  return (
    <aside
      className="fixed top-16 right-16 w-[300px] hairline bg-[var(--surface)] flex flex-col"
      style={{ zIndex: 100, maxHeight: "calc(100vh - 32px)" }}
      aria-label="Particle ring debug controls"
    >
      <header className="px-12 py-10 hairline-b flex items-center justify-between shrink-0">
        <span className="label-text">Particle ring · debug</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Hide debug panel"
          className="text-text-muted hover:text-text"
        >
          <X size={12} strokeWidth={1.5} />
        </button>
      </header>

      <div className="flex flex-col overflow-y-auto px-10 py-10 gap-14">
        <Group title="Particles">
          <Slider
            label="Count"
            value={config.count}
            min={20}
            max={1200}
            step={10}
            onChange={(v) => set("count", v)}
          />
          <Slider
            label="Size"
            value={config.particleSize}
            min={0.2}
            max={6}
            step={0.05}
            onChange={(v) => set("particleSize", v)}
          />
          <Slider
            label="Size variance"
            value={config.particleSizeVariance}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => set("particleSizeVariance", v)}
          />
          <Slider
            label="Glow alpha"
            value={config.glowIntensity}
            min={0}
            max={3}
            step={0.05}
            onChange={(v) => set("glowIntensity", v)}
          />
          <Slider
            label="Glow spread"
            value={config.glowSpread}
            min={1}
            max={32}
            step={0.5}
            onChange={(v) => set("glowSpread", v)}
          />
          <Slider
            label="Twinkle speed"
            value={config.twinkleSpeed}
            min={0}
            max={8}
            step={0.1}
            onChange={(v) => set("twinkleSpeed", v)}
          />
        </Group>

        <Group title="Ring shape">
          <Slider
            label="Radius"
            value={config.radius}
            min={40}
            max={800}
            step={2}
            onChange={(v) => set("radius", v)}
          />
          <Slider
            label="Thickness"
            value={config.thickness}
            min={0}
            max={200}
            step={2}
            onChange={(v) => set("thickness", v)}
          />
          <Slider
            label="Scatter Y"
            value={config.scatterY}
            min={0}
            max={400}
            step={2}
            onChange={(v) => set("scatterY", v)}
          />
        </Group>

        <Group title="Position">
          <Slider
            label="X"
            value={config.positionX}
            min={-1000}
            max={1000}
            step={4}
            onChange={(v) => set("positionX", v)}
          />
          <Slider
            label="Y"
            value={config.positionY}
            min={-800}
            max={800}
            step={4}
            onChange={(v) => set("positionY", v)}
          />
          <Slider
            label="Z (depth)"
            value={config.positionZ}
            min={-800}
            max={800}
            step={4}
            onChange={(v) => set("positionZ", v)}
          />
        </Group>

        <Group title="Depth of field">
          <Slider
            label="Focus distance"
            value={config.focusDistance}
            min={-800}
            max={800}
            step={4}
            onChange={(v) => set("focusDistance", v)}
          />
          <Slider
            label="Focus range"
            value={config.focusRange}
            min={0}
            max={500}
            step={2}
            onChange={(v) => set("focusRange", v)}
          />
          <Slider
            label="Blur · front"
            value={config.blurFront}
            min={0}
            max={6}
            step={0.05}
            onChange={(v) => set("blurFront", v)}
          />
          <Slider
            label="Blur · back"
            value={config.blurBack}
            min={0}
            max={6}
            step={0.05}
            onChange={(v) => set("blurBack", v)}
          />
        </Group>

        <Group title="Camera">
          <Slider
            label="Focal length"
            value={config.focalLength}
            min={200}
            max={2000}
            step={10}
            onChange={(v) => set("focalLength", v)}
          />
          <Slider
            label="Atmospheric blur"
            value={config.blur}
            min={0}
            max={10}
            step={0.1}
            onChange={(v) => set("blur", v)}
          />
        </Group>

        <Group title="Color">
          <ColorPicker color={config.color} onChange={(v) => set("color", v)} />
        </Group>

        <div className="flex flex-col gap-8">
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex items-center justify-between px-2 py-4 text-text-muted hover:text-text transition-colors"
            aria-expanded={showAdvanced}
          >
            <span className="label-text">Advanced</span>
            {showAdvanced ? (
              <ChevronUp size={12} strokeWidth={1.5} />
            ) : (
              <ChevronDown size={12} strokeWidth={1.5} />
            )}
          </button>
          {showAdvanced && (
            <div className="flex flex-col gap-14">
              <Group title="Rotation">
                <Slider
                  label="X (tilt)"
                  value={config.rotationX}
                  min={-180}
                  max={180}
                  step={1}
                  onChange={(v) => set("rotationX", v)}
                />
                <Slider
                  label="Y (yaw)"
                  value={config.rotationY}
                  min={-180}
                  max={180}
                  step={1}
                  onChange={(v) => set("rotationY", v)}
                />
                <Slider
                  label="Z (roll)"
                  value={config.rotationZ}
                  min={-180}
                  max={180}
                  step={1}
                  onChange={(v) => set("rotationZ", v)}
                />
              </Group>
              <Group title="Auto-rotate · deg/sec">
                <Slider
                  label="X"
                  value={config.autoRotateX}
                  min={-60}
                  max={60}
                  step={0.5}
                  onChange={(v) => set("autoRotateX", v)}
                />
                <Slider
                  label="Y"
                  value={config.autoRotateY}
                  min={-60}
                  max={60}
                  step={0.5}
                  onChange={(v) => set("autoRotateY", v)}
                />
                <Slider
                  label="Z"
                  value={config.autoRotateZ}
                  min={-60}
                  max={60}
                  step={0.5}
                  onChange={(v) => set("autoRotateZ", v)}
                />
              </Group>
            </div>
          )}
        </div>
      </div>

      <footer className="hairline-t p-10 flex items-center gap-8 shrink-0">
        <button
          type="button"
          onClick={() => onChange(defaults)}
          className="flex-1 hairline-subtle py-6 hover:border-[var(--border-hover)] transition-colors inline-flex items-center justify-center gap-6"
          aria-label="Reset to defaults"
        >
          <RotateCcw size={10} strokeWidth={1.5} />
          <span className="label-text">Reset</span>
        </button>
        <button
          type="button"
          onClick={copyJson}
          className="flex-1 hairline-subtle py-6 hover:border-[var(--border-hover)] transition-colors inline-flex items-center justify-center gap-6"
          aria-label="Copy config as JSON"
        >
          <ClipboardCopy size={10} strokeWidth={1.5} />
          <span className="label-text">{copied ? "Copied" : "Copy JSON"}</span>
        </button>
      </footer>
    </aside>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-8 pb-10 hairline-b">
      <p className="label-text text-text-muted">{title}</p>
      <div className="flex flex-col gap-8">{children}</div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-8">
        <span className="label-text">{label}</span>
        <span
          className="mono-sm text-text-secondary tnum"
          style={{ fontSize: 10 }}
        >
          {Number.isInteger(value) ? value : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="debug-slider"
      />
    </div>
  );
}

function ColorPicker({
  color,
  onChange,
}: {
  color: string;
  onChange: (c: string) => void;
}) {
  const parts = color.split(",").map((s) => Number(s.trim()));
  const r = parts[0] ?? 0;
  const g = parts[1] ?? 0;
  const b = parts[2] ?? 0;
  const hex = `#${[r, g, b]
    .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0"))
    .join("")}`;
  return (
    <div className="flex items-center gap-10">
      <input
        type="color"
        value={hex}
        onChange={(e) => {
          const h = e.target.value;
          const r2 = parseInt(h.slice(1, 3), 16);
          const g2 = parseInt(h.slice(3, 5), 16);
          const b2 = parseInt(h.slice(5, 7), 16);
          onChange(`${r2}, ${g2}, ${b2}`);
        }}
        style={{
          width: 24,
          height: 16,
          padding: 0,
          background: "transparent",
          border: 0,
          cursor: "pointer",
        }}
        aria-label="Particle color"
      />
      <span className="mono-sm text-text-secondary" style={{ fontSize: 10 }}>
        rgb({color})
      </span>
    </div>
  );
}
