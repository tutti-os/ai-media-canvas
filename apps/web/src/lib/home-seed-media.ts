function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createPreviewImage(
  title: string,
  accentA: string,
  accentB: string,
) {
  return svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 800">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${accentA}" />
          <stop offset="100%" stop-color="${accentB}" />
        </linearGradient>
      </defs>
      <rect width="640" height="800" rx="44" fill="url(#bg)" />
      <rect x="44" y="44" width="552" height="712" rx="32" fill="rgba(255,255,255,0.8)" />
      <circle cx="150" cy="170" r="70" fill="${accentA}" fill-opacity="0.65" />
      <rect x="258" y="112" width="236" height="24" rx="12" fill="#0f172a" fill-opacity="0.12" />
      <rect x="258" y="154" width="196" height="18" rx="9" fill="#0f172a" fill-opacity="0.08" />
      <rect x="88" y="284" width="464" height="232" rx="28" fill="${accentB}" fill-opacity="0.38" />
      <rect x="88" y="556" width="320" height="20" rx="10" fill="#0f172a" fill-opacity="0.12" />
      <rect x="88" y="594" width="420" height="16" rx="8" fill="#0f172a" fill-opacity="0.08" />
      <text x="88" y="664" fill="#0f172a" font-family="Arial, sans-serif" font-size="30" font-weight="700">${title}</text>
    </svg>
  `);
}

export function createInputImage(label: string, accent: string) {
  return svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360">
      <rect width="360" height="360" rx="36" fill="${accent}" />
      <rect x="40" y="40" width="280" height="280" rx="26" fill="rgba(255,255,255,0.68)" />
      <text x="180" y="192" text-anchor="middle" fill="#0f172a" font-family="Arial, sans-serif" font-size="34" font-weight="700">${label}</text>
    </svg>
  `);
}

export function createAvatar(label: string, accent: string) {
  const initial = label.slice(0, 1).toUpperCase();
  return svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="60" fill="${accent}" />
      <text x="60" y="72" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="42" font-weight="700">${initial}</text>
    </svg>
  `);
}
