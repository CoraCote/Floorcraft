/**
 * Shared filename builder for raster/PDF floor-plan exports.
 *
 * Both `pdfExport.buildFileName` and `pngExport.exportFloorAsPng` delegate
 * here so the naming convention (`<project>-<floor>-<yyyy-mm-dd>.<ext>`)
 * stays in one place. Lifted out of `pdfExport.ts` when the PNG export
 * landed rather than copying the slug/date logic across modules.
 */

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function isoDate(d: Date): string {
  // Use UTC to avoid timezone drift in filenames — two managers in
  // different TZs printing within the same minute should get the same name.
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * `<project-slug>-<floor-name>-<yyyy-mm-dd>.<ext>`. Both name components
 * are slugified. If both slugify to empty we fall back to `"floorplan"`
 * so the download still has a sensible name.
 */
export function buildExportFilename(
  projectName: string,
  floorName: string,
  ext: 'pdf' | 'png',
  now: Date = new Date(),
): string {
  const parts = [slugify(projectName), slugify(floorName)].filter((p) => p.length > 0)
  const base = parts.length > 0 ? parts.join('-') : 'floorplan'
  return `${base}-${isoDate(now)}.${ext}`
}
