"use client";

/**
 * Underwater atmosphere — depth gradient, surface halo, volumetric god rays.
 *
 * All gradient stops are CSS variables (declared in globals-underwater.css)
 * so the palette flips between deep ocean (dark mode) and shallow sunlit
 * water (light mode) via the [data-theme] attribute on <html>.
 */
export function UnderwaterAtmosphere() {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      <svg
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1000 1400"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          {/* Depth — top-of-column lightest, bottom darkest */}
          <linearGradient id="ua-depth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--ua-depth-1)" }} />
            <stop offset="35%" style={{ stopColor: "var(--ua-depth-2)" }} />
            <stop offset="70%" style={{ stopColor: "var(--ua-depth-3)" }} />
            <stop offset="100%" style={{ stopColor: "var(--ua-depth-4)" }} />
          </linearGradient>

          {/* Halo — sun penetration at the surface */}
          <radialGradient id="ua-halo" cx="50%" cy="-10%" r="55%">
            <stop
              offset="0%"
              style={{
                stopColor: "var(--ua-halo-1)",
                stopOpacity: "var(--ua-halo-1-op)",
              }}
            />
            <stop
              offset="30%"
              style={{
                stopColor: "var(--ua-halo-2)",
                stopOpacity: "var(--ua-halo-2-op)",
              }}
            />
            <stop
              offset="65%"
              style={{
                stopColor: "var(--ua-halo-3)",
                stopOpacity: "var(--ua-halo-3-op)",
              }}
            />
            <stop
              offset="100%"
              style={{ stopColor: "var(--ua-halo-4)", stopOpacity: 0 }}
            />
          </radialGradient>

          {/* Wide ambient ray */}
          <linearGradient id="ua-ray-wide" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              style={{ stopColor: "var(--ua-ray-wide-1)", stopOpacity: 0 }}
            />
            <stop
              offset="10%"
              style={{ stopColor: "var(--ua-ray-wide-2)", stopOpacity: 0.2 }}
            />
            <stop
              offset="32%"
              style={{ stopColor: "var(--ua-ray-wide-3)", stopOpacity: 0.09 }}
            />
            <stop
              offset="70%"
              style={{ stopColor: "var(--ua-ray-wide-4)", stopOpacity: 0.012 }}
            />
            <stop
              offset="100%"
              style={{ stopColor: "var(--ua-ray-wide-5)", stopOpacity: 0 }}
            />
          </linearGradient>

          {/* Narrow bright beam */}
          <linearGradient id="ua-ray-beam" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              style={{ stopColor: "var(--ua-ray-beam-1)", stopOpacity: 0 }}
            />
            <stop
              offset="7%"
              style={{ stopColor: "var(--ua-ray-beam-2)", stopOpacity: 0.45 }}
            />
            <stop
              offset="25%"
              style={{ stopColor: "var(--ua-ray-beam-3)", stopOpacity: 0.17 }}
            />
            <stop
              offset="60%"
              style={{ stopColor: "var(--ua-ray-beam-4)", stopOpacity: 0.025 }}
            />
            <stop
              offset="100%"
              style={{ stopColor: "var(--ua-ray-beam-5)", stopOpacity: 0 }}
            />
          </linearGradient>

          <filter
            id="ua-blur-sharp"
            x="-15%"
            y="-15%"
            width="130%"
            height="130%"
          >
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <filter
            id="ua-blur-soft"
            x="-25%"
            y="-25%"
            width="150%"
            height="150%"
          >
            <feGaussianBlur stdDeviation="10" />
          </filter>
          <filter
            id="ua-blur-hazy"
            x="-35%"
            y="-35%"
            width="170%"
            height="170%"
          >
            <feGaussianBlur stdDeviation="22" />
          </filter>
          <filter
            id="ua-blur-halo"
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
          >
            <feGaussianBlur stdDeviation="50" />
          </filter>
        </defs>

        <rect width="1000" height="1400" fill="url(#ua-depth)" />
        <rect
          width="1000"
          height="1400"
          fill="url(#ua-halo)"
          filter="url(#ua-blur-halo)"
        />

        <g style={{ mixBlendMode: "screen" }}>
          {/* WIDE AMBIENT RAYS */}
          <polygon
            points="430,-160 220,1020 400,1020"
            fill="url(#ua-ray-wide)"
            opacity="0.65"
            filter="url(#ua-blur-hazy)"
          >
            <animate
              attributeName="opacity"
              values="0.55;0.72;0.6;0.55"
              keyTimes="0;0.35;0.7;1"
              dur="11s"
              begin="-3.2s"
              repeatCount="indefinite"
            />
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0;-9,0;5,0;0,0"
              keyTimes="0;0.4;0.7;1"
              dur="14s"
              begin="-1.7s"
              repeatCount="indefinite"
            />
          </polygon>

          <polygon
            points="585,-180 620,1080 820,1080"
            fill="url(#ua-ray-wide)"
            opacity="0.55"
            filter="url(#ua-blur-hazy)"
          >
            <animate
              attributeName="opacity"
              values="0.6;0.45;0.58;0.6"
              keyTimes="0;0.4;0.75;1"
              dur="12s"
              begin="-5.2s"
              repeatCount="indefinite"
            />
          </polygon>

          <polygon
            points="475,-260 412,720 426,720"
            fill="url(#ua-ray-beam)"
            opacity="0.55"
            filter="url(#ua-blur-sharp)"
          >
            <animate
              attributeName="opacity"
              values="0.45;0.65;0.5;0.45"
              keyTimes="0;0.4;0.7;1"
              dur="5s"
              begin="-2.1s"
              repeatCount="indefinite"
            />
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0;-5,0;3,0;0,0"
              keyTimes="0;0.4;0.7;1"
              dur="9s"
              begin="-6.7s"
              repeatCount="indefinite"
            />
          </polygon>

          <polygon
            points="525,-220 588,780 604,780"
            fill="url(#ua-ray-beam)"
            opacity="0.5"
            filter="url(#ua-blur-sharp)"
          >
            <animate
              attributeName="opacity"
              values="0.6;0.42;0.55;0.6"
              keyTimes="0;0.35;0.7;1"
              dur="4.5s"
              begin="-1.4s"
              repeatCount="indefinite"
            />
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0;6,0;-4,0;0,0"
              keyTimes="0;0.4;0.7;1"
              dur="10s"
              begin="-7.8s"
              repeatCount="indefinite"
            />
          </polygon>

          <polygon
            points="408,-140 268,820 292,820"
            fill="url(#ua-ray-beam)"
            opacity="0.4"
            filter="url(#ua-blur-soft)"
          >
            <animate
              attributeName="opacity"
              values="0.32;0.48;0.36;0.32"
              keyTimes="0;0.4;0.7;1"
              dur="9s"
              begin="-5.6s"
              repeatCount="indefinite"
            />
          </polygon>
        </g>
      </svg>
    </div>
  );
}
