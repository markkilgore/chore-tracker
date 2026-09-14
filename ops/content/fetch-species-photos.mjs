// Development-time asset importer. Production printing never calls Wikimedia.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const destination = path.join(root, "apps/web/public/species");
const subjects = [
  ["whale-shark", "Whale shark"], ["nurse-shark", "Nurse shark"], ["bonnethead", "Bonnethead"], ["zebra-shark", "Zebra shark"],
  ["basking-shark", "Basking shark"], ["epaulette-shark", "Epaulette shark"], ["blacktip-reef-shark", "Blacktip reef shark"], ["greenland-shark", "Greenland shark"],
  ["sand-cat", "Sand cat"], ["fishing-cat", "Fishing cat"], ["cheetah", "Cheetah"], ["snow-leopard", "Snow leopard"],
  ["clouded-leopard", "Clouded leopard"], ["tiger", "Tiger"], ["lion", "Lion"], ["serval", "Serval"]
];
const curl = (url) => execFileSync("curl", ["--fail", "--silent", "--show-error", "--location", "--retry", "3", "--max-time", "60", "--user-agent", "TidyWeekSpeciesLessons/1.0 (educational family charts)", url], { maxBuffer: 15 * 1024 * 1024 });
const query = (params) => JSON.parse(curl(`https://en.wikipedia.org/w/api.php?${new URLSearchParams({ action: "query", format: "json", ...params })}`));
const clean = (value = "") => value.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
fs.mkdirSync(destination, { recursive: true });
const catalogPath = path.join(destination, "credits.json");
const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, "utf8")) : [];
for (const [id, title] of subjects) {
  // Preserve reviewed, versioned assets. New species require a manual photo review.
  if (catalog.some((photo) => photo.id === id)) continue;
  const page = Object.values(query({ titles: title, prop: "pageimages", piprop: "name|original" }).query.pages)[0];
  if (!page.pageimage) throw new Error(`No photo for ${title}`);
  const infoPage = Object.values(query({ titles: `File:${page.pageimage}`, prop: "imageinfo", iiprop: "url|extmetadata|mime", iiurlwidth: "720" }).query.pages)[0];
  const info = infoPage.imageinfo?.[0];
  if (!info) throw new Error(`No image metadata for ${title}`);
  const meta = info.extmetadata;
  const license = clean(meta.LicenseShortName?.value);
  if (!/^(CC BY|CC0|Public domain)/i.test(license)) throw new Error(`Review license for ${title}: ${license}`);
  const sourceUrl = info.thumburl ?? info.url;
  const bytes = curl(sourceUrl);
  const mimeType = bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : null;
  if (!mimeType) throw new Error(`Unexpected image type for ${title}`);
  const filename = `${id}-v1.${mimeType === "image/jpeg" ? "jpg" : "png"}`;
  fs.writeFileSync(path.join(destination, filename), bytes);
  catalog.push({ id, title, filename, mimeType, credit: clean(meta.Artist?.value), license,
    licenseUrl: (meta.LicenseUrl?.value ?? "https://creativecommons.org/publicdomain/mark/1.0/").replace(/^\/\//, "https://"),
    pageUrl: info.descriptionurl, sourceUrl, description: clean(meta.ImageDescription?.value), changes: "Wikimedia thumbnail; displayed without cropping", retrievedOn: new Date().toISOString().slice(0, 10) });
  console.log(`${id}: ${license}, ${bytes.length} bytes`);
}
fs.writeFileSync(path.join(destination, "credits.json"), JSON.stringify(catalog, null, 2) + "\n");
