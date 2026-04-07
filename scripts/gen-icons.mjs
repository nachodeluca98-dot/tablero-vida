import sharp from "sharp";
import { writeFileSync } from "fs";

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0a0a0b"/>
  <rect x="56" y="56" width="400" height="400" rx="64" fill="none" stroke="#f59e0b" stroke-width="16"/>
  <text x="256" y="340" font-family="Arial, sans-serif" font-size="280" font-weight="900" text-anchor="middle" fill="#f59e0b">T</text>
  <circle cx="140" cy="140" r="18" fill="#eab308"/>
  <circle cx="200" cy="140" r="18" fill="#ef4444"/>
  <circle cx="260" cy="140" r="18" fill="#22c55e"/>
  <circle cx="320" cy="140" r="18" fill="#3b82f6"/>
  <circle cx="380" cy="140" r="18" fill="#8b5cf6"/>
</svg>
`;

async function gen(size, filename) {
  await sharp(Buffer.from(svg(size)))
    .resize(size, size)
    .png()
    .toFile(`public/${filename}`);
  console.log(`✓ ${filename}`);
}

await gen(192, "icon-192.png");
await gen(512, "icon-512.png");
await gen(180, "apple-touch-icon.png");

writeFileSync("public/icon.svg", svg(512));
console.log("✓ icon.svg");
