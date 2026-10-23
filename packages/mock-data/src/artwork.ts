import type { Artwork } from './types.ts';

/** Deterministic SVG "artwork" so the demo needs no image hosting. */
export function artworkSvg(a: Artwork, size = 240): string {
  const [c0 = '#222', c1 = '#888', c2 = '#ccc', c3 = '#fff'] = a.palette;
  const s = size;
  let body = '';
  switch (a.motif) {
    case 'mountain':
      body = `<rect width="${s}" height="${s}" fill="${c3}"/>
        <circle cx="${s * 0.7}" cy="${s * 0.32}" r="${s * 0.12}" fill="${c2}"/>
        <polygon points="0,${s} ${s * 0.38},${s * 0.35} ${s * 0.7},${s} " fill="${c0}"/>
        <polygon points="${s * 0.3},${s} ${s * 0.65},${s * 0.45} ${s},${s}" fill="${c1}"/>
        <polygon points="${s * 0.33},${s * 0.42} ${s * 0.38},${s * 0.35} ${s * 0.43},${s * 0.42}" fill="${c3}"/>`;
      break;
    case 'sun':
      body = `<rect width="${s}" height="${s}" fill="${c2}"/>
        ${Array.from({ length: 12 }, (_, i) => {
          const ang = (i / 12) * Math.PI * 2;
          const x = s / 2 + Math.cos(ang) * s * 0.42;
          const y = s / 2 + Math.sin(ang) * s * 0.42;
          return `<line x1="${s / 2}" y1="${s / 2}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${c1}" stroke-width="${s * 0.03}"/>`;
        }).join('')}
        <circle cx="${s / 2}" cy="${s / 2}" r="${s * 0.22}" fill="${c0}"/>`;
      break;
    case 'waves':
      body = `<rect width="${s}" height="${s}" fill="${c3}"/>
        ${[0, 1, 2, 3].map((i) => `<path d="M0 ${s * (0.3 + i * 0.18)} Q ${s * 0.25} ${s * (0.2 + i * 0.18)} ${s * 0.5} ${s * (0.3 + i * 0.18)} T ${s} ${s * (0.3 + i * 0.18)} V ${s} H 0 Z" fill="${[c2, c1, c0, c0][i]}" opacity="${0.55 + i * 0.15}"/>`).join('')}`;
      break;
    case 'grid':
      body = `<rect width="${s}" height="${s}" fill="${c3 ?? '#fff'}"/>
        ${Array.from({ length: 16 }, (_, i) => {
          const x = (i % 4) * (s / 4);
          const y = Math.floor(i / 4) * (s / 4);
          const col = [c0, c1, c2, c3][(i * 7) % 4];
          return i % 3 === 0
            ? `<circle cx="${x + s / 8}" cy="${y + s / 8}" r="${s / 10}" fill="${col}"/>`
            : `<rect x="${x + 4}" y="${y + 4}" width="${s / 4 - 8}" height="${s / 4 - 8}" rx="6" fill="${col}"/>`;
        }).join('')}`;
      break;
    case 'leaf':
      body = `<rect width="${s}" height="${s}" fill="${c3}"/>
        <path d="M${s * 0.2} ${s * 0.8} C ${s * 0.2} ${s * 0.3}, ${s * 0.5} ${s * 0.15}, ${s * 0.82} ${s * 0.18} C ${s * 0.85} ${s * 0.5}, ${s * 0.7} ${s * 0.8}, ${s * 0.2} ${s * 0.8} Z" fill="${c1}"/>
        <path d="M${s * 0.2} ${s * 0.8} L ${s * 0.75} ${s * 0.25}" stroke="${c0}" stroke-width="${s * 0.025}"/>
        <circle cx="${s * 0.78}" cy="${s * 0.78}" r="${s * 0.08}" fill="${c2}"/>`;
      break;
    case 'stars':
      body = `<rect width="${s}" height="${s}" fill="${c0}"/>
        ${Array.from({ length: 28 }, (_, i) => {
          const x = ((i * 73) % 97) / 97;
          const y = ((i * 41) % 89) / 89;
          return `<circle cx="${(x * s).toFixed(1)}" cy="${(y * s * 0.7).toFixed(1)}" r="${1 + (i % 3)}" fill="${c3}"/>`;
        }).join('')}
        <polygon points="0,${s} ${s * 0.45},${s * 0.6} ${s},${s}" fill="${c1}"/>
        <polygon points="${s * 0.4},${s} ${s * 0.75},${s * 0.68} ${s},${s * 0.85} ${s},${s}" fill="${c2}"/>`;
      break;
  }
  const blur = a.dpi < 150 ? `<filter id="lowres"><feGaussianBlur stdDeviation="2.2"/></filter>` : '';
  const g = a.dpi < 150 ? `<g filter="url(#lowres)">${body}</g>` : body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">${blur}${g}</svg>`;
}

export function artworkDataUri(a: Artwork, size = 240): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(artworkSvg(a, size))}`;
}
