"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Text, Billboard, Grid } from "@react-three/drei";
import * as THREE from "three";
import type { ViewerSection, ViewerElement } from "./ViewerCanvas";
import type { ElementKind } from "@/app/(app)/facilities/[id]/builder/types";

/**
 * 3D facility viewer.
 *
 * Read-only orbital view of the same data the 2D ViewerCanvas renders.
 * Sections become extruded rack volumes (height = total_levels * LEVEL_HEIGHT)
 * with translucent shelf planes per level and a base-edge occupancy bar.
 * Layout elements render per-kind: walkways as floor decals, staging as low
 * platforms, obstacles as solid mid-height boxes, doors as tall thin slabs,
 * notes as floating labels.
 *
 * Coordinate mapping from 2D:
 *   - floor_x → world X
 *   - floor_y → world Z   (top-down to 3D: y-down becomes z-forward)
 *   - rotation (SVG-positive-CW degrees) → negated Y-axis radians
 *
 * Camera starts at an isometric-ish angle framing the whole facility; users
 * orbit with left-drag, pan with right-drag, zoom with scroll.
 */

const LEVEL_HEIGHT = 30; // floor units per rack level — tune later via section.level_height_m
const ACCENT = "#D4A853";

/** SVG-positive-CW degrees → Three.js Y-axis radians (right-hand-rule). */
const ry = (deg: number) => -((deg || 0) * Math.PI) / 180;

interface Props {
  canvasWidth: number;
  canvasHeight: number;
  floorUnit: string;
  sections: ViewerSection[];
  elements: ViewerElement[];
  onSectionClick: (id: string) => void;
}

export function FacilityViewer3D({
  canvasWidth,
  canvasHeight,
  floorUnit,
  sections,
  elements,
  onSectionClick,
}: Props) {
  // Frame the camera around the canvas center. Distance is derived from the
  // canvas diagonal so small facilities don't get a wide-shot vibe.
  const center: [number, number, number] = useMemo(
    () => [canvasWidth / 2, 0, canvasHeight / 2],
    [canvasWidth, canvasHeight]
  );
  const diag = useMemo(
    () => Math.hypot(canvasWidth, canvasHeight),
    [canvasWidth, canvasHeight]
  );
  // Iso-ish: pulled back diagonally, raised by ~70% of half-diagonal.
  const cameraPosition: [number, number, number] = useMemo(
    () => [center[0] + diag * 0.65, diag * 0.55, center[2] + diag * 0.65],
    [center, diag]
  );

  return (
    <div
      className="relative flex-1 min-h-0 bg-[var(--bg)] hairline overflow-hidden"
      data-testid="facility-3d"
    >
      <Canvas
        shadows
        gl={{ antialias: true, alpha: false }}
        camera={{ position: cameraPosition, fov: 42, near: 1, far: diag * 8 }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color("#0a0a0a"));
        }}
      >
        {/* Lights — warm key from above-right, cool fill, ambient lift. */}
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[diag, diag * 1.2, diag * 0.5]}
          intensity={1.1}
          color="#fff5e0"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <directionalLight
          position={[-diag * 0.6, diag * 0.8, -diag * 0.4]}
          intensity={0.35}
          color="#9ec5ff"
        />

        {/* Floor slab — gives shadows something to land on and grounds the scene. */}
        <mesh
          position={[canvasWidth / 2, -0.05, canvasHeight / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[canvasWidth, canvasHeight]} />
          <meshStandardMaterial color="#0e0e0e" roughness={1} metalness={0} />
        </mesh>

        {/* Grid overlay — major every 200, minor every 50 (matches the 2D builder's feel). */}
        <Grid
          position={[canvasWidth / 2, 0, canvasHeight / 2]}
          args={[canvasWidth, canvasHeight]}
          cellSize={50}
          cellThickness={0.5}
          cellColor="#1a1a1a"
          sectionSize={200}
          sectionThickness={1}
          sectionColor="#262626"
          fadeDistance={diag * 1.8}
          fadeStrength={1.4}
          infiniteGrid={false}
          followCamera={false}
        />

        {/* Facility footprint outline */}
        <FootprintOutline width={canvasWidth} height={canvasHeight} />

        {/* Background elements (walkway / staging / obstacle) — drawn before sections. */}
        {elements
          .filter((e) => BG_KINDS.has(e.kind))
          .map((e) => (
            <ElementMesh key={e.id} element={e} />
          ))}

        {/* Sections */}
        {sections.map((s) => (
          <SectionMesh key={s.id} s={s} onClick={() => onSectionClick(s.id)} />
        ))}

        {/* Foreground elements (door / note) — drawn over sections. */}
        {elements
          .filter((e) => !BG_KINDS.has(e.kind))
          .map((e) => (
            <ElementMesh key={e.id} element={e} />
          ))}

        <OrbitControls
          target={center}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={diag * 0.15}
          maxDistance={diag * 3}
        />

        <ResetCameraOnMount position={cameraPosition} target={center} />
      </Canvas>

      {/* Floating scale chip — tells the user what units they're flying through. */}
      <div className="absolute bottom-14 left-14 hairline-subtle bg-[var(--surface)] px-10 py-6 mono-sm text-text-dim pointer-events-none">
        <span
          style={{
            fontSize: 10,
            letterSpacing: "1px",
            textTransform: "uppercase",
          }}
        >
          {Math.round(canvasWidth)} × {Math.round(canvasHeight)} {floorUnit}
        </span>
      </div>

      {/* Hint chip — orbit controls are non-obvious for first-time visitors. */}
      <div className="absolute bottom-14 right-14 hairline-subtle bg-[var(--surface)] px-10 py-6 mono-sm text-text-dim pointer-events-none">
        <span
          style={{
            fontSize: 10,
            letterSpacing: "1px",
            textTransform: "uppercase",
          }}
        >
          Drag · Orbit · Right-drag · Pan · Scroll · Zoom
        </span>
      </div>
    </div>
  );
}

// ─── Camera reset helper ──────────────────────────────────────────────────

/**
 * On mount, snap the camera back to the computed framing position. Useful
 * when this component remounts after a 2D→3D toggle — without it the camera
 * state can persist across viewer instances and feel disorienting.
 */
function ResetCameraOnMount({
  position,
  target,
}: {
  position: [number, number, number];
  target: [number, number, number];
}) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(...position);
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
    // intentionally one-shot on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// ─── Footprint outline ────────────────────────────────────────────────────

function FootprintOutline({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pts = new Float32Array([
      0,
      0.02,
      0,
      width,
      0.02,
      0,
      width,
      0.02,
      height,
      0,
      0.02,
      height,
      0,
      0.02,
      0,
    ]);
    g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    return g;
  }, [width, height]);

  return (
    <line>
      {/* @ts-expect-error — drei/r3f primitive: attaching prebuilt geometry */}
      <primitive object={geom} attach="geometry" />
      <lineBasicMaterial color="#3a3a3a" />
    </line>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────

function SectionMesh({
  s,
  onClick,
}: {
  s: ViewerSection;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const height = Math.max(LEVEL_HEIGHT, s.total_levels * LEVEL_HEIGHT);
  const occRatio =
    s.capacity > 0 ? Math.min(1, Math.max(0, s.occupied / s.capacity)) : 0;
  const cx = s.floor_x + s.floor_width / 2;
  const cz = s.floor_y + s.floor_height / 2;

  // Memoize edges geometry so it isn't rebuilt every frame.
  const edges = useMemo(
    () =>
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(s.floor_width, height, s.floor_height)
      ),
    [s.floor_width, height, s.floor_height]
  );

  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHover(true);
    document.body.style.cursor = "pointer";
  };
  const handleOut = () => {
    setHover(false);
    document.body.style.cursor = "";
  };
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClick();
  };

  return (
    <group position={[cx, 0, cz]} rotation={[0, ry(s.rotation), 0]}>
      {/* Volume — translucent rack body */}
      <mesh
        position={[0, height / 2, 0]}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[s.floor_width, height, s.floor_height]} />
        <meshStandardMaterial
          color={s.color}
          transparent
          opacity={hover ? 0.5 : 0.28}
          roughness={0.65}
          metalness={0.08}
        />
      </mesh>

      {/* Edge outline */}
      <lineSegments position={[0, height / 2, 0]}>
        <primitive object={edges} attach="geometry" />
        <lineBasicMaterial color={hover ? ACCENT : s.color} />
      </lineSegments>

      {/* Shelf planes — one for each level boundary (skip the floor) */}
      {Array.from({ length: Math.max(0, s.total_levels - 1) }, (_, i) => (
        <mesh
          key={i}
          position={[0, (i + 1) * LEVEL_HEIGHT, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[s.floor_width * 0.94, s.floor_height * 0.94]} />
          <meshBasicMaterial
            color={s.color}
            transparent
            opacity={0.13}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* Occupancy bar at the base, front edge */}
      {s.capacity > 0 && occRatio > 0 && (
        <mesh
          position={[
            -s.floor_width / 2 + (s.floor_width * occRatio) / 2,
            0.4,
            s.floor_height / 2 - 0.6,
          ]}
        >
          <boxGeometry
            args={[Math.max(0.1, s.floor_width * occRatio - 0.4), 0.6, 1.0]}
          />
          <meshBasicMaterial color={s.color} />
        </mesh>
      )}

      {/* Section code — billboarded above the rack */}
      <Billboard position={[0, height + 16, 0]}>
        <Text
          fontSize={Math.min(22, Math.max(8, s.floor_width / 4))}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.4}
          outlineColor="#000000"
        >
          {s.code}
        </Text>
      </Billboard>

      {/* Section name — smaller, below the code */}
      {s.name && s.floor_width >= 60 && (
        <Billboard position={[0, height + 6, 0]}>
          <Text
            fontSize={Math.min(10, Math.max(5, s.floor_width / 9))}
            color="#a3a3a3"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.25}
            outlineColor="#000000"
          >
            {s.name}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

// ─── Layout elements ─────────────────────────────────────────────────────

const BG_KINDS = new Set<ElementKind>(["walkway", "obstacle", "staging"]);

function ElementMesh({ element: el }: { element: ViewerElement }) {
  const cx = el.floor_x + el.floor_width / 2;
  const cz = el.floor_y + el.floor_height / 2;

  switch (el.kind) {
    case "walkway": {
      // Low translucent slab on the floor with the element color, slightly raised
      // so it doesn't z-fight the floor plane.
      return (
        <group position={[cx, 0.08, cz]} rotation={[0, ry(el.rotation), 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[el.floor_width, el.floor_height]} />
            <meshBasicMaterial
              color={el.color}
              transparent
              opacity={0.18}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      );
    }

    case "staging": {
      // ~2-unit-tall platform; staging zones are flat surfaces things land on.
      const h = 2;
      return (
        <group position={[cx, h / 2, cz]} rotation={[0, ry(el.rotation), 0]}>
          <mesh receiveShadow>
            <boxGeometry args={[el.floor_width, h, el.floor_height]} />
            <meshStandardMaterial
              color={el.color}
              transparent
              opacity={0.38}
              roughness={0.85}
            />
          </mesh>
          {el.label && (
            <Billboard position={[0, h + 4, 0]}>
              <Text
                fontSize={Math.min(10, el.floor_width / 8)}
                color="#d4d4d4"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.2}
                outlineColor="#000"
              >
                {el.label}
              </Text>
            </Billboard>
          )}
        </group>
      );
    }

    case "obstacle": {
      // Solid mid-height block — represents pillars, walls, fixed equipment.
      const h = Math.max(15, Math.min(el.floor_width, el.floor_height) * 0.6);
      return (
        <group position={[cx, h / 2, cz]} rotation={[0, ry(el.rotation), 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[el.floor_width, h, el.floor_height]} />
            <meshStandardMaterial
              color={el.color}
              roughness={0.9}
              metalness={0.05}
            />
          </mesh>
        </group>
      );
    }

    case "door": {
      // Thin tall slab marking a portal — colored, slightly luminous so it pops.
      const h = LEVEL_HEIGHT * 1.5;
      const thickness = Math.min(el.floor_width, el.floor_height);
      const wide = el.floor_width >= el.floor_height;
      return (
        <group position={[cx, h / 2, cz]} rotation={[0, ry(el.rotation), 0]}>
          <mesh>
            <boxGeometry
              args={
                wide
                  ? [el.floor_width, h, thickness]
                  : [thickness, h, el.floor_height]
              }
            />
            <meshStandardMaterial
              color={el.color}
              emissive={el.color}
              emissiveIntensity={0.4}
              transparent
              opacity={0.75}
            />
          </mesh>
          {el.label && (
            <Billboard position={[0, h + 4, 0]}>
              <Text
                fontSize={Math.min(
                  10,
                  Math.max(el.floor_width, el.floor_height) / 6
                )}
                color="#ffffff"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.25}
                outlineColor="#000"
              >
                {el.label}
              </Text>
            </Billboard>
          )}
        </group>
      );
    }

    case "note": {
      // Floating text label — no geometry, just a billboarded string.
      return (
        <Billboard position={[cx, 8, cz]}>
          <Text
            fontSize={Math.min(
              12,
              Math.max(6, Math.max(el.floor_width, el.floor_height) / 6)
            )}
            color={el.color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.3}
            outlineColor="#000"
          >
            {el.label || "Note"}
          </Text>
        </Billboard>
      );
    }

    default:
      return null;
  }
}
