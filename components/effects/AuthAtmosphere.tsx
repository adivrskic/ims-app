"use client";

import { useEffect, useState } from "react";
import {
  ParticleRing,
  DEFAULT_RING_CONFIG,
  type ParticleRingConfig,
} from "./ParticleRing";
import { ParticleRingDebug } from "./ParticleRingDebug";

// v3 — bumped to invalidate stale configs after defaults retuned
const STORAGE_KEY = "Nautilus_particle_ring_config_v3";

function loadConfig(): ParticleRingConfig {
  if (typeof window === "undefined") return DEFAULT_RING_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RING_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_RING_CONFIG, ...parsed };
  } catch {
    return DEFAULT_RING_CONFIG;
  }
}

export function AuthAtmosphere() {
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<ParticleRingConfig>(DEFAULT_RING_CONFIG);

  useEffect(() => {
    setConfig(loadConfig());
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const handleChange = (c: ParticleRingConfig) => {
    setConfig(c);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    } catch {
      // ignore quota / private-mode errors
    }
  };

  return (
    <>
      <ParticleRing config={config} />
      <ParticleRingDebug
        config={config}
        defaults={DEFAULT_RING_CONFIG}
        onChange={handleChange}
      />
    </>
  );
}
