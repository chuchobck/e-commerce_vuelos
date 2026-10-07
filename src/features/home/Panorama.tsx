import { cn } from '@/shared/lib/cn';

/** Estrellas fijas (solo visibles de noche, ver --pano-star-opacity). */
const STARS: [number, number, number][] = [
  [60, 40, 1.6], [150, 90, 1.2], [240, 30, 1.8], [330, 70, 1.2], [420, 120, 1.4], [500, 45, 1.2],
  [610, 85, 1.6], [700, 30, 1.2], [960, 50, 1.4], [1040, 110, 1.2], [1110, 35, 1.8], [1200, 95, 1.2],
  [1280, 55, 1.6], [1350, 120, 1.2], [1410, 30, 1.4], [560, 150, 1.2], [1000, 160, 1.2], [180, 150, 1.4],
];

/** Copas de árboles de la Amazonía: [x, y, radio, tono]. */
const CANOPY: [number, number, number, 'pano-jungle' | 'pano-jungle-dark'][] = [
  [1070, 300, 30, 'pano-jungle'], [1110, 282, 34, 'pano-jungle-dark'], [1160, 296, 28, 'pano-jungle'],
  [1205, 272, 36, 'pano-jungle-dark'], [1255, 290, 30, 'pano-jungle'], [1300, 266, 34, 'pano-jungle-dark'],
  [1350, 286, 30, 'pano-jungle'], [1395, 262, 36, 'pano-jungle-dark'], [1440, 280, 32, 'pano-jungle'],
];

/**
 * Ecuador de oeste a este en estilo geométrico (como el quinde del logo):
 * Galápagos → Costa → Andes → Amazonía. Decorativa (aria-hidden); los colores vienen de los
 * tokens --pano-* y cambian solos a una escena nocturna en modo oscuro.
 */
export function Panorama({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 360"
      preserveAspectRatio="xMidYMax slice"
      className={cn('block', className)}
    >
      {STARS.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} className="pano-star" />
      ))}

      {/* Sol (luna de noche) saliendo detrás del Cotopaxi */}
      <circle cx="870" cy="125" r="64" className="pano-sun" />

      <g className="pano-cloud" opacity="0.85">
        <ellipse cx="250" cy="96" rx="62" ry="15" />
        <ellipse cx="292" cy="84" rx="38" ry="13" />
        <ellipse cx="1170" cy="74" rx="70" ry="16" />
        <ellipse cx="1214" cy="62" rx="40" ry="13" />
      </g>

      {/* Cordillera lejana */}
      <polygon
        className="pano-mount-far"
        points="500,300 590,212 650,240 740,168 800,214 880,150 960,222 1040,186 1120,248 1200,300"
      />

      {/* Galápagos: mar e islas */}
      <polygon className="pano-sea" points="0,250 580,250 560,360 0,360" />
      <g className="pano-sea-light">
        <polygon points="30,292 110,288 190,292 110,295" />
        <polygon points="230,318 320,314 410,318 320,321" />
        <polygon points="90,338 170,335 250,338 170,341" />
      </g>
      <polygon className="pano-island" points="26,254 92,204 134,222 178,196 236,254" />
      <polygon className="pano-island-dark" points="92,204 134,222 120,254 26,254" />
      <polygon className="pano-island-dark" points="178,196 236,254 170,254" />
      <polygon className="pano-island" points="262,254 304,226 348,254" />
      <polygon className="pano-island-dark" points="304,226 348,254 304,254" />

      {/* Costa: playa y palmeras */}
      <polygon className="pano-sand" points="380,262 520,248 690,258 700,360 360,360" />
      <path className="pano-trunk" d="M470 318 Q480 246 506 184" strokeWidth="9" strokeLinecap="round" />
      <g className="pano-palm">
        <polygon points="506,184 448,172 468,160" />
        <polygon points="506,184 452,202 462,186" />
        <polygon points="506,184 566,170 546,160" />
        <polygon points="506,184 558,206 548,190" />
        <polygon points="506,184 498,140 516,150" />
      </g>
      <path className="pano-trunk" d="M598 318 Q604 262 620 228" strokeWidth="7" strokeLinecap="round" />
      <g className="pano-palm">
        <polygon points="620,228 576,220 590,210" />
        <polygon points="620,228 580,244 588,232" />
        <polygon points="620,228 666,218 650,210" />
        <polygon points="620,228 660,248 652,234" />
      </g>

      {/* Andes: páramo y volcanes nevados (Chimborazo, Cotopaxi, Cayambe) */}
      <polygon className="pano-jungle-light" points="640,300 1100,300 1100,360 640,360" />
      <polygon className="pano-mount" points="626,304 706,176 796,304" />
      <polygon className="pano-mount-dark" points="706,176 796,304 706,304" />
      <polygon className="pano-snow" points="688,205 706,176 724,205 713,200 705,210 696,200" />

      <polygon className="pano-mount" points="762,304 884,138 1006,304" />
      <polygon className="pano-mount-dark" points="884,138 1006,304 884,304" />
      <polygon className="pano-snow" points="858,174 884,138 910,174 897,169 886,181 872,169" />

      <polygon className="pano-mount" points="962,304 1034,200 1106,304" />
      <polygon className="pano-mount-dark" points="1034,200 1106,304 1034,304" />
      <polygon className="pano-snow" points="1021,219 1034,200 1047,219 1039,215 1032,223 1027,215" />

      {/* Amazonía: lomas, selva y río */}
      <polygon
        className="pano-jungle-light"
        points="1040,304 1120,252 1200,264 1280,238 1360,254 1440,234 1440,360 1040,360"
      />
      {CANOPY.map(([x, y, r, tone]) => (
        <circle key={x} cx={x} cy={y} r={r} className={tone} />
      ))}
      <polygon className="pano-jungle-dark" points="1040,320 1440,300 1440,360 1040,360" />
      <path className="pano-river" d="M1110 360 C1170 334 1240 350 1296 322 S1396 296 1440 306" strokeWidth="14" />

      {/* Aves (fragatas y cóndores) */}
      <g className="pano-bird" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M330 150 l12 -8 l12 8" />
        <path d="M362 132 l9 -6 l9 6" />
        <path d="M760 100 l16 -10 l16 10" />
      </g>
    </svg>
  );
}
