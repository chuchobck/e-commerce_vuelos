import { useId } from 'react';
import { cn } from '@/shared/lib/cn';
import type { RegionId } from './regions';

/**
 * Escena pequeña de cada región, en el mismo estilo geométrico de la panorámica.
 * Decorativa: el nombre de la región va en el texto de la tarjeta.
 */
export function RegionArt({ region, className }: { region: RegionId; className?: string }) {
  const gradientId = `sky-${useId().replace(/:/g, '')}`;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 320 160"
      preserveAspectRatio="xMidYMax slice"
      className={cn('block', className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'rgb(var(--sky-top))' }} />
          <stop offset="1" style={{ stopColor: 'rgb(var(--sky-bottom))' }} />
        </linearGradient>
      </defs>
      <rect width="320" height="160" fill={`url(#${gradientId})`} />
      <circle cx="40" cy="22" r="1.4" className="pano-star" />
      <circle cx="280" cy="30" r="1.6" className="pano-star" />
      <circle cx="140" cy="16" r="1.2" className="pano-star" />
      {SCENES[region]}
    </svg>
  );
}

const SCENES: Record<RegionId, JSX.Element> = {
  galapagos: (
    <>
      <circle cx="250" cy="52" r="26" className="pano-sun" />
      <polygon className="pano-sea" points="0,104 320,104 320,160 0,160" />
      <polygon className="pano-sea-light" points="30,132 90,129 150,132 90,135" />
      <polygon className="pano-sea-light" points="190,146 250,143 310,146 250,149" />
      <polygon className="pano-island" points="40,106 104,58 150,78 196,106" />
      <polygon className="pano-island-dark" points="104,58 150,78 140,106 40,106" />
      {/* Tortuga gigante */}
      <polygon className="pano-mount-dark" points="214,104 228,86 252,82 270,92 276,104" />
      <polygon className="pano-mount" points="228,86 252,82 246,98 230,100" />
      <polygon className="pano-mount-dark" points="274,100 288,92 292,100 280,104" />
    </>
  ),
  costa: (
    <>
      <circle cx="230" cy="92" r="30" className="pano-sun" />
      <polygon className="pano-sea" points="0,100 320,100 320,160 0,160" />
      <polygon className="pano-sea-light" points="170,118 230,115 290,118 230,121" />
      <polygon className="pano-sand" points="0,124 150,116 210,160 0,160" />
      <path className="pano-trunk" d="M70 150 Q76 104 96 66" strokeWidth="7" strokeLinecap="round" />
      <g className="pano-palm">
        <polygon points="96,66 52,58 66,48" />
        <polygon points="96,66 56,84 64,72" />
        <polygon points="96,66 142,54 126,46" />
        <polygon points="96,66 136,86 128,74" />
        <polygon points="96,66 90,32 104,40" />
      </g>
    </>
  ),
  andes: (
    <>
      <circle cx="210" cy="50" r="24" className="pano-sun" />
      <polygon className="pano-mount-far" points="0,128 70,70 120,100 180,60 250,110 320,80 320,160 0,160" />
      <polygon className="pano-mount" points="70,160 170,28 270,160" />
      <polygon className="pano-mount-dark" points="170,28 270,160 170,160" />
      <polygon className="pano-snow" points="148,57 170,28 192,57 181,53 172,63 160,53" />
      <polygon className="pano-jungle-light" points="0,146 320,138 320,160 0,160" />
      <path className="pano-bird" d="M60 50 l14 -9 l14 9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  amazonia: (
    <>
      <circle cx="70" cy="44" r="22" className="pano-sun" />
      <polygon className="pano-jungle-light" points="0,110 80,80 160,96 240,70 320,90 320,160 0,160" />
      <circle cx="30" cy="104" r="30" className="pano-jungle-dark" />
      <circle cx="84" cy="92" r="28" className="pano-jungle" />
      <circle cx="140" cy="102" r="30" className="pano-jungle-dark" />
      <circle cx="200" cy="84" r="32" className="pano-jungle" />
      <circle cx="262" cy="96" r="30" className="pano-jungle-dark" />
      <circle cx="316" cy="84" r="30" className="pano-jungle" />
      <polygon className="pano-jungle-dark" points="0,128 320,120 320,160 0,160" />
      <path className="pano-river" d="M40 160 C100 138 170 152 220 132 S300 120 320 124" strokeWidth="10" />
    </>
  ),
};
