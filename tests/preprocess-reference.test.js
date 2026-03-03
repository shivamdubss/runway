import { describe, it, expect } from 'vitest';
import { PREPROCESSING_PROMPT } from '../api/preprocess-reference.js';

describe('preprocessing prompt', () => {
  it('instructs background removal', () => {
    expect(PREPROCESSING_PROMPT).toContain('Remove the background entirely');
  });

  it('specifies studio backdrop color', () => {
    expect(PREPROCESSING_PROMPT).toContain('#F0F0F0');
  });

  it('instructs pixel-identical subject preservation', () => {
    expect(PREPROCESSING_PROMPT).toContain('pixel-identical');
  });

  it('instructs full body visibility', () => {
    expect(PREPROCESSING_PROMPT).toContain('Full body visible head to toe');
  });

  it('instructs studio lighting', () => {
    expect(PREPROCESSING_PROMPT).toContain('Studio-quality even lighting');
  });

  it('explicitly forbids altering the subject', () => {
    expect(PREPROCESSING_PROMPT).toContain('Do not alter the subject in any way');
  });
});
