# Weekly species lessons

New charts using **Cats**, **Sharks**, or **Sharks & Dinos** automatically include a species photo, a short lesson, and a question to explore together. Use the normal personal or family print buttons; the print panel shows the selected week's species. Theme selection lives in the family member's profile. No extra setup, cron, background worker, image API, or runtime internet connection is needed.

The initial collection contains eight shark species and eight wild cat species, each with three lessons: **24 weeks per theme**. Each week visits a different species. After eight weeks, a species returns with another lesson; the full collection repeats after 24 weeks. The anchor week is September 13, 2026 (whale shark and sand cat). Selection follows the chart's week date, including when printing ahead or reprinting a previous week, rather than today's date or a child's name.

Lessons are original child-friendly summaries linked to the Florida Museum, Smithsonian's National Zoo, San Diego Zoo Wildlife Alliance, and NOAA. The images are real photographs, including some taken in aquariums or zoos. Photo credits and license links appear on the charts. Full photo provenance is in `apps/web/public/species/credits.json`; individual files retain their listed Creative Commons or public-domain terms. Wikimedia thumbnails are displayed without additional cropping. Credits link to the original file pages, which include titles, authors, and licensing details.

New charts use portrait layout v3 with up to 12 chore rows per Letter page. Routines follow their configured daily order (Morning, After school, Evening, Weekly), with untimed chores last and clear separators between routines. Short pages use larger chore text and checkboxes; the species photo and lesson expand into the remaining space directly below the chores. More chores continue onto another page with the same lesson. QR identifiers and occurrence-linked checkboxes are preserved. Existing saved v1 and v2 charts retain their original layout and content; generate a new chart to include the lesson.

## Maintaining the collection

- Lesson content and deterministic rotation: `packages/domain/src/species/index.ts`.
- Reviewed, versioned photos and attribution: `apps/web/public/species/`.
- `node ops/content/fetch-species-photos.mjs` imports missing species photographs from Wikimedia and leaves existing catalog entries alone. This is a development helper, never part of deployment or printing. Manually review new images for correct species, attribution, suitability, and license before shipping. Do not assume a Wikipedia article's lead image is always suitable.
- Keep the v1 species order stable. For a new collection, introduce an explicit date/version transition so the rotation remains predictable. Use a new photo filename when replacing an image, and keep its attribution together with it.
- Each chart snapshot stores its lesson, photo bytes, and attribution, covered by the chart checksum. Archived charts therefore do not depend on later catalog edits or internet availability. This adds roughly 0.1–2.7 MB per themed chart to SQLite and its backups, depending on the species photo.
- `npm test` covers weekly rotation, archived snapshots, photo availability, and pagination manifests.
- `node --import tsx ops/content/verify-species-charts.mts` uses Playwright to verify all 48 lessons offline for image decoding, text fit, page boundaries, and unchanged first-checkbox placement. It writes sample PDFs and PNGs to `/tmp/tidy-{cats,shark-dino}-species.*`.

The adaptive layout uses shared inch measurements in `packages/domain/src/chart-layout.ts` for rendering and checkbox manifests. Run `node --import tsx ops/content/verify-adaptive-charts.mts` to check all lessons on short and crowded charts, 0–25-row page boundaries, and actual browser checkbox coordinates.
