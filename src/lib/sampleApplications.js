/**
 * Sample COLA application records for the single-label flow.
 *
 * This MOCKS a COLA record lookup: in production these fields would be fetched
 * prefilled from the upstream COLA system when an agent opens an application,
 * AND the submitted label artwork would arrive with them. Here the records
 * mirror the test fixtures in test-labels/ (and the rows in
 * test-labels/applications.csv) — every record holds the same filed values for
 * "OLD TOM DISTILLERY"; the referenced label image is what varies, exercising a
 * different verdict path.
 *
 * The artwork is the six SVGs in test-labels/, bundled here via Vite `?url`
 * imports so test-labels/ stays the single source of truth (the files are NOT
 * copied into public/ or src/). Each record is mapped to its asset URL by the
 * `filename` it already carries; SingleVerify fetches that URL and wraps it in
 * a File so the selected application also loads its label image.
 */
import cleanUrl from '../../test-labels/01-clean-pass.svg?url';
import casingUrl from '../../test-labels/02-brand-casing-review.svg?url';
import abvUrl from '../../test-labels/03-wrong-abv-fail.svg?url';
import warningCaseUrl from '../../test-labels/04-titlecase-warning-fail.svg?url';
import missingWarningUrl from '../../test-labels/05-missing-warning-fail.svg?url';
import differentBrandUrl from '../../test-labels/06-different-brand-fail.svg?url';

const ARTWORK_BY_FILENAME = {
  '01-clean-pass.svg': cleanUrl,
  '02-brand-casing-review.svg': casingUrl,
  '03-wrong-abv-fail.svg': abvUrl,
  '04-titlecase-warning-fail.svg': warningCaseUrl,
  '05-missing-warning-fail.svg': missingWarningUrl,
  '06-different-brand-fail.svg': differentBrandUrl,
};

const RECORDS = [
  {
    id: 'TTB-2026-000101',
    label: 'TTB-2026-000101 — Old Tom Distillery (clean)',
    filename: '01-clean-pass.svg',
    brand_name: 'OLD TOM DISTILLERY',
    class_type: 'Kentucky Straight Bourbon Whiskey',
    alcohol_content: '45',
    net_contents: '750 mL',
  },
  {
    id: 'TTB-2026-000102',
    label: 'TTB-2026-000102 — Old Tom Distillery (brand casing → review)',
    filename: '02-brand-casing-review.svg',
    brand_name: 'OLD TOM DISTILLERY',
    class_type: 'Kentucky Straight Bourbon Whiskey',
    alcohol_content: '45',
    net_contents: '750 mL',
  },
  {
    id: 'TTB-2026-000103',
    label: 'TTB-2026-000103 — Old Tom Distillery (wrong ABV → fail)',
    filename: '03-wrong-abv-fail.svg',
    brand_name: 'OLD TOM DISTILLERY',
    class_type: 'Kentucky Straight Bourbon Whiskey',
    alcohol_content: '45',
    net_contents: '750 mL',
  },
  {
    id: 'TTB-2026-000104',
    label: 'TTB-2026-000104 — Old Tom Distillery (title-case warning → fail)',
    filename: '04-titlecase-warning-fail.svg',
    brand_name: 'OLD TOM DISTILLERY',
    class_type: 'Kentucky Straight Bourbon Whiskey',
    alcohol_content: '45',
    net_contents: '750 mL',
  },
  {
    id: 'TTB-2026-000105',
    label: 'TTB-2026-000105 — Old Tom Distillery (missing warning → fail)',
    filename: '05-missing-warning-fail.svg',
    brand_name: 'OLD TOM DISTILLERY',
    class_type: 'Kentucky Straight Bourbon Whiskey',
    alcohol_content: '45',
    net_contents: '750 mL',
  },
  {
    id: 'TTB-2026-000106',
    label: 'TTB-2026-000106 — Old Tom Distillery (different brand → fail)',
    filename: '06-different-brand-fail.svg',
    brand_name: 'OLD TOM DISTILLERY',
    class_type: 'Kentucky Straight Bourbon Whiskey',
    alcohol_content: '45',
    net_contents: '750 mL',
  },
];

export const SAMPLE_APPLICATIONS = RECORDS.map((r) => ({
  ...r,
  assetUrl: ARTWORK_BY_FILENAME[r.filename] ?? null,
}));
