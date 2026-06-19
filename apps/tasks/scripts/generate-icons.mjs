// One-off generator for placeholder PWA icons. Renders a dark square with a
// white "T" (kept within the maskable safe zone) to PNG via sharp. Re-run with
// `node scripts/generate-icons.mjs` after editing the artwork.
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const publicDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
);

function svg(size) {
  // Glyph sits in the central ~55% so it survives maskable cropping.
  const fontSize = Math.round(size * 0.5);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#0a0a0a"/>
  <text x="50%" y="50%" dy="0.02em" text-anchor="middle" dominant-baseline="central"
    font-family="Arial, Helvetica, sans-serif" font-weight="700"
    font-size="${fontSize}" fill="#fafafa">T</text>
</svg>`;
}

async function render(size, file) {
  const out = path.join(publicDir, file);
  await sharp(Buffer.from(svg(size))).png().toFile(out);
  console.log(`wrote ${out}`);
}

await render(192, "icon-192.png");
await render(512, "icon-512.png");
await render(180, "apple-touch-icon.png");
