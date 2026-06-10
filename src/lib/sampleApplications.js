/**
 * Sample COLA application records for the single-label flow.
 *
 * This MOCKS a COLA record lookup: in production these fields would be fetched
 * prefilled from the upstream COLA system when an agent opens an application.
 * Here they mirror the test fixtures in test-labels/ (and the rows in
 * test-labels/applications.csv) — every record holds the same filed values for
 * "OLD TOM DISTILLERY"; the referenced label image is what varies, exercising a
 * different verdict path. `filename` is for reference only (which fixture to
 * pair the record with when testing).
 */
export const SAMPLE_APPLICATIONS = [
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
