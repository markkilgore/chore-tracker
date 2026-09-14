import fs from "node:fs";
import path from "node:path";

export interface SpeciesPhoto {
  dataUrl: string;
  credit: string;
  license: string;
  licenseUrl: string;
  pageUrl: string;
}
interface PhotoAsset extends Omit<SpeciesPhoto, "dataUrl"> {
  id: string;
  filename: string;
  mimeType: string;
}

// Public assets are copied into this location by the standalone Docker build.
// Also support Next's apps/web working directory and root-level CLI/tests.
export function speciesPhoto(speciesId: string): SpeciesPhoto {
  const directory = [path.join(process.cwd(), "apps/web/public/species"), path.join(process.cwd(), "public/species")]
    .find((candidate) => fs.existsSync(path.join(candidate, "credits.json")));
  if (!directory) throw new Error("Weekly species photos are missing from this installation");
  const assets = JSON.parse(fs.readFileSync(path.join(directory, "credits.json"), "utf8")) as PhotoAsset[];
  const asset = assets.find((item) => item.id === speciesId);
  if (!asset) throw new Error(`Missing photo for species: ${speciesId}`);
  const bytes = fs.readFileSync(path.join(directory, asset.filename));
  return { dataUrl: `data:${asset.mimeType};base64,${bytes.toString("base64")}`,
    credit: asset.credit || "Wikimedia Commons", license: asset.license,
    licenseUrl: asset.licenseUrl, pageUrl: asset.pageUrl };
}
