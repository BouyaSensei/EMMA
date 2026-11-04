import { describe, expect, it } from 'vitest';

import { skillPublisherLabel } from '../publisherLabel';

describe('skillPublisherLabel', () => {
  it('shows both the member publisher and organization owner', () => {
    expect(skillPublisherLabel({
      publisherName: 'Emma Publisher',
      authorName: 'Acme',
    })).toBe('Emma Publisher · Acme');
  });

  it('does not duplicate a personal owner fallback', () => {
    expect(skillPublisherLabel({
      publisherName: 'Emma Publisher',
      authorName: 'Emma Publisher',
    })).toBe('Emma Publisher');
  });
});
