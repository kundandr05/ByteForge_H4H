import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn utility', () => {
  it('combines class names correctly', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2');
  });

  it('handles conditional class names and overrides with tailwind-merge', () => {
    expect(cn('p-4', false && 'hidden', 'p-2')).toBe('p-2');
  });
});
