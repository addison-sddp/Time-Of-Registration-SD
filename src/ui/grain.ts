// Procedural texture: SVG feTurbulence rendered as inline data URIs. Nothing is fetched.

function dataUri(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// Fine paper/desk grain, applied over the stage at low opacity.
export function grainUrl(): string {
  return dataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.1 -0.2"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg>`,
  );
}

// Toner speckle for photocopies: sparse dark specks over a light flat field.
export function speckleUrl(): string {
  return dataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="s"><feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="1" seed="21"/><feColorMatrix values="0 0 0 0 0.1  0 0 0 0 0.1  0 0 0 0 0.1  0 0 0 9 -5.4"/></filter><rect width="100%" height="100%" filter="url(#s)"/></svg>`,
  );
}
