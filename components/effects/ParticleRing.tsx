"use client";

import { useEffect, useRef } from "react";

export interface ParticleRingConfig {
  count: number;
  radius: number;
  thickness: number;
  scatterY: number;
  positionX: number;
  positionY: number;
  positionZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  autoRotateX: number;
  autoRotateY: number;
  autoRotateZ: number;
  focalLength: number;
  particleSize: number;
  particleSizeVariance: number;
  glowIntensity: number;
  glowSpread: number;
  color: string;
  blur: number;
  twinkleSpeed: number;
  // Depth of field
  focusDistance: number;
  focusRange: number;
  blurFront: number;
  blurBack: number;
}

export const DEFAULT_RING_CONFIG: ParticleRingConfig = {
  count: 460,
  radius: 420,
  thickness: 200,
  scatterY: 400,
  positionX: 76,
  positionY: 24,
  positionZ: -76,
  rotationX: -87,
  rotationY: 40,
  rotationZ: -144,
  autoRotateX: 0,
  autoRotateY: 1,
  autoRotateZ: 0,
  focalLength: 2000,
  particleSize: 0.35,
  particleSizeVariance: 2,
  glowIntensity: 2.95,
  glowSpread: 19,
  color: "212, 168, 83",
  blur: 10,
  twinkleSpeed: 1.6,
  focusDistance: -800,
  focusRange: 500,
  blurFront: 0,
  blurBack: 6,
};

interface Particle {
  baseX: number;
  baseY: number;
  baseZ: number;
  sizeMultiplier: number;
  brightness: number;
  phase: number;
}

export function ParticleRing({ config }: { config: ParticleRingConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const configRef = useRef(config);
  const particlesRef = useRef<Particle[]>([]);
  const spriteRef = useRef<HTMLCanvasElement | null>(null);

  configRef.current = config;

  // Regenerate particles when ring shape changes
  useEffect(() => {
    const c = config;
    const particles: Particle[] = [];
    for (let i = 0; i < c.count; i++) {
      const theta = (i / c.count) * Math.PI * 2 + (Math.random() - 0.5) * 0.04;
      const radiusJitter = (Math.random() - 0.5) * c.thickness;
      const yJitter = (Math.random() - 0.5) * c.scatterY;
      const r = c.radius + radiusJitter;
      particles.push({
        baseX: Math.cos(theta) * r,
        baseY: yJitter,
        baseZ: Math.sin(theta) * r,
        sizeMultiplier: 1 + (Math.random() - 0.5) * c.particleSizeVariance,
        brightness: 0.55 + Math.random() * 0.45,
        phase: Math.random() * Math.PI * 2,
      });
    }
    particlesRef.current = particles;
  }, [
    config.count,
    config.radius,
    config.thickness,
    config.scatterY,
    config.particleSizeVariance,
  ]);

  // Regenerate sprite when color changes
  useEffect(() => {
    const sprite = document.createElement("canvas");
    sprite.width = 128;
    sprite.height = 128;
    const sctx = sprite.getContext("2d");
    if (!sctx) return;
    const grad = sctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, `rgba(${config.color}, 1)`);
    grad.addColorStop(0.18, `rgba(${config.color}, 0.7)`);
    grad.addColorStop(0.5, `rgba(${config.color}, 0.18)`);
    grad.addColorStop(1, `rgba(${config.color}, 0)`);
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 128, 128);
    spriteRef.current = sprite;
  }, [config.color]);

  // Mount once: canvas setup + rAF loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let cssWidth = 0;
    let cssHeight = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      cssWidth = rect.width;
      cssHeight = rect.height;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let rafId = 0;
    let autoRotX = 0;
    let autoRotY = 0;
    let autoRotZ = 0;
    let lastTime = performance.now();

    const frame = (now: number) => {
      const c = configRef.current;
      const sprite = spriteRef.current;
      const particles = particlesRef.current;

      if (!sprite || particles.length === 0) {
        rafId = requestAnimationFrame(frame);
        return;
      }

      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      if (!reducedMotion) {
        autoRotX += c.autoRotateX * dt;
        autoRotY += c.autoRotateY * dt;
        autoRotZ += c.autoRotateZ * dt;
      }

      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const rx = ((c.rotationX + autoRotX) * Math.PI) / 180;
      const ry = ((c.rotationY + autoRotY) * Math.PI) / 180;
      const rz = ((c.rotationZ + autoRotZ) * Math.PI) / 180;

      const cosX = Math.cos(rx),
        sinX = Math.sin(rx);
      const cosY = Math.cos(ry),
        sinY = Math.sin(ry);
      const cosZ = Math.cos(rz),
        sinZ = Math.sin(rz);

      const cx = cssWidth / 2 + c.positionX;
      const cy = cssHeight / 2 + c.positionY;
      const f = c.focalLength;

      // Project
      const projected: Array<{
        x: number;
        y: number;
        z: number;
        scale: number;
        size: number;
        bright: number;
        phase: number;
      }> = [];

      for (const p of particles) {
        let x = p.baseX,
          y = p.baseY,
          z = p.baseZ;

        const y1 = y * cosX - z * sinX;
        const z1 = y * sinX + z * cosX;
        y = y1;
        z = z1;
        const x2 = x * cosY + z * sinY;
        const z2 = -x * sinY + z * cosY;
        x = x2;
        z = z2;
        const x3 = x * cosZ - y * sinZ;
        const y3 = x * sinZ + y * cosZ;
        x = x3;
        y = y3;

        z += c.positionZ;
        const denom = f + z;
        if (denom <= 1) continue;
        const scale = f / denom;

        projected.push({
          x: cx + x * scale,
          y: cy + y * scale,
          z,
          scale,
          size: p.sizeMultiplier,
          bright: p.brightness,
          phase: p.phase,
        });
      }

      projected.sort((a, b) => b.z - a.z);

      ctx.globalCompositeOperation = "lighter";

      const time = now / 1000;
      const tw = c.twinkleSpeed;
      const focusD = c.focusDistance;
      const focusR = c.focusRange;
      const blurF = c.blurFront;
      const blurB = c.blurBack;

      for (const p of projected) {
        // Depth-of-field: distance from focus plane drives bokeh spread + dim
        const delta = p.z - focusD;
        const outOfFocus = Math.max(0, Math.abs(delta) - focusR);
        const blurStrength = delta < 0 ? blurF : blurB;
        const blurMul = 1 + (outOfFocus / 100) * blurStrength;

        const baseSize = c.particleSize * p.size * p.scale;
        const renderSize = baseSize * c.glowSpread * blurMul;
        if (renderSize < 0.5) continue;

        const twinkle = tw > 0 ? 0.6 + 0.4 * Math.sin(time * tw + p.phase) : 1;
        // Energy conservation — wider bokeh = dimmer per pixel
        const alpha = Math.min(
          1,
          (p.bright * c.glowIntensity * p.scale * twinkle) / Math.sqrt(blurMul)
        );
        ctx.globalAlpha = alpha;
        ctx.drawImage(
          sprite,
          p.x - renderSize / 2,
          p.y - renderSize / 2,
          renderSize,
          renderSize
        );
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        filter: config.blur > 0 ? `blur(${config.blur}px)` : undefined,
        zIndex: 0,
      }}
    />
  );
}
