import { mkdir } from "node:fs/promises";
import sharp from "sharp";

await mkdir("public/icons", { recursive: true });
const icon = sharp("public/icon-source.svg").trim({ background: "#ffffff", threshold: 12 });
await Promise.all([
  icon.clone().resize(192, 192, { fit: "cover" }).png().toFile("public/icons/icon-192.png"),
  icon.clone().resize(512, 512, { fit: "cover" }).png().toFile("public/icons/icon-512.png"),
  icon.clone().resize(180, 180, { fit: "cover" }).png().toFile("public/icons/apple-touch-icon.png"),
  icon.clone().resize(410, 410, { fit: "contain", background: "#ffffff" }).extend({ top: 51, bottom: 51, left: 51, right: 51, background: "#ffffff" }).png().toFile("public/icons/icon-maskable-512.png"),
]);
