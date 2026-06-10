import { describe, it, expect } from 'vitest';
import {
  STATUS,
  OFFICIAL_WARNING,
  compareText,
  compareAbv,
  compareNetContents,
  compareWarning,
  verify,
} from './compare.js';

describe('compareText (brand name / class-type)', () => {
  it('exact match passes', () => {
    expect(compareText('OLD TOM DISTILLERY', 'OLD TOM DISTILLERY').status).toBe(
      STATUS.MATCH,
    );
  });

  it("casing difference is flagged for human review, not failed (Dave's STONE'S THROW case)", () => {
    const r = compareText("Stone's Throw", "STONE'S THROW");
    expect(r.status).toBe(STATUS.REVIEW);
  });

  it('genuinely different names fail', () => {
    expect(compareText('OLD TOM DISTILLERY', 'NEW TOM DISTILLERY').status).toBe(
      STATUS.MISMATCH,
    );
  });

  it('missing field is reported as not found', () => {
    expect(compareText('OLD TOM', '').status).toBe(STATUS.NOT_FOUND);
    expect(compareText('OLD TOM', null).status).toBe(STATUS.NOT_FOUND);
  });
});

describe('compareAbv', () => {
  it('matches across formatting differences', () => {
    expect(compareAbv('45', '45% Alc./Vol. (90 Proof)').status).toBe(STATUS.MATCH);
    expect(compareAbv('45% ABV', '45% Alc/Vol').status).toBe(STATUS.MATCH);
  });

  it('detects a wrong number', () => {
    expect(compareAbv('40', '45% Alc./Vol.').status).toBe(STATUS.MISMATCH);
  });
});

describe('compareNetContents', () => {
  it('normalizes unit spellings', () => {
    expect(compareNetContents('750 mL', '750ML').status).toBe(STATUS.MATCH);
    expect(compareNetContents('750 mL', '75 cl').status).toBe(STATUS.MATCH);
  });

  it('detects different volumes', () => {
    expect(compareNetContents('750 mL', '700 mL').status).toBe(STATUS.MISMATCH);
  });
});

describe('compareWarning — strict by design', () => {
  it('accepts the exact official statement', () => {
    expect(compareWarning(OFFICIAL_WARNING, true).status).toBe(STATUS.MATCH);
  });

  it('tolerates line-wrap whitespace but never case', () => {
    const wrapped = OFFICIAL_WARNING.replace('Surgeon General,', 'Surgeon\nGeneral,');
    expect(compareWarning(wrapped, true).status).toBe(STATUS.MATCH);
  });

  it("rejects title-case prefix (Jenny's 'Government Warning' rejection)", () => {
    const titleCase = OFFICIAL_WARNING.replace(
      'GOVERNMENT WARNING:',
      'Government Warning:',
    );
    const r = compareWarning(titleCase, true);
    expect(r.status).toBe(STATUS.MISMATCH);
    expect(r.detail).toMatch(/capital letters/i);
  });

  it('rejects reworded statements', () => {
    expect(
      compareWarning('GOVERNMENT WARNING: Drinking may cause health problems.', true)
        .status,
    ).toBe(STATUS.MISMATCH);
  });

  it('missing statement fails the application', () => {
    expect(compareWarning('', true).status).toBe(STATUS.NOT_FOUND);
  });

  it('flags non-bold prefix for review even when text is exact', () => {
    expect(compareWarning(OFFICIAL_WARNING, false).status).toBe(STATUS.REVIEW);
  });
});

describe('verify — overall verdict', () => {
  const application = {
    brand_name: 'OLD TOM DISTILLERY',
    class_type: 'Kentucky Straight Bourbon Whiskey',
    alcohol_content: '45',
    net_contents: '750 mL',
  };
  const cleanExtraction = {
    brand_name: 'OLD TOM DISTILLERY',
    class_type: 'Kentucky Straight Bourbon Whiskey',
    alcohol_content: '45% Alc./Vol. (90 Proof)',
    net_contents: '750 mL',
    government_warning: { text: OFFICIAL_WARNING, appears_bold: true },
    legibility: 'good',
  };

  it('all-clear label passes', () => {
    expect(verify(application, cleanExtraction).overall).toBe('PASS');
  });

  it('one review-level field downgrades to REVIEW', () => {
    const e = { ...cleanExtraction, brand_name: 'Old Tom Distillery' };
    expect(verify(application, e).overall).toBe('REVIEW');
  });

  it('any mismatch fails the whole application', () => {
    const e = { ...cleanExtraction, alcohol_content: '40% Alc./Vol.' };
    expect(verify(application, e).overall).toBe('FAIL');
  });
});
