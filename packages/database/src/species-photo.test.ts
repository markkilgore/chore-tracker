import { expect, it } from "vitest";
import { SPECIES } from "@chore-tracker/domain";
import { speciesPhoto } from "./species-photo";

it("bundles a credited real photo for every species, including in the web working directory", () => {
  const cwd = process.cwd();
  try {
    for (const directory of [cwd, `${cwd}/apps/web`]) {
      process.chdir(directory);
      for (const species of SPECIES) {
        const photo = speciesPhoto(species.id);
        expect(photo.dataUrl).toMatch(/^data:image\/(jpeg|png);base64,/);
        expect(Buffer.from(photo.dataUrl.split(",")[1], "base64").length).toBeGreaterThan(1000);
        expect(photo.credit).toBeTruthy();
        expect(photo.license).toMatch(/^(CC BY|Public domain|CC0)/);
        expect(photo.pageUrl).toMatch(/^https:\/\//);
      }
    }
  } finally { process.chdir(cwd); }
});
