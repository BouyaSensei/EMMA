import { describe, expect, it } from 'vitest';

import {
  emptyTeammateScopeManifest,
  isInTeammateAudience,
  parseTeammateScopeManifest,
} from '../teammateScopes.js';

describe('parseTeammateScopeManifest', () => {
  it('accepts a valid manifest with all/list audiences', () => {
    const errors: string[] = [];
    const m = parseTeammateScopeManifest(
      {
        schemaVersion: 1,
        skills: { 'web-search': 'all', 'design': ['bot-1', 'Emma Lead'] },
        mcpServers: { 'notion-mcp': [] },
      },
      errors,
    );
    expect(errors).toEqual([]);
    expect(m).toMatchObject({
      skills: { 'web-search': 'all', design: ['bot-1', 'Emma Lead'] },
      mcpServers: { 'notion-mcp': [] },
    });
  });

  it('rejects a wrong schemaVersion', () => {
    const errors: string[] = [];
    expect(parseTeammateScopeManifest({ schemaVersion: 2, skills: {} }, errors)).toBeNull();
    expect(errors[0]).toContain('schemaVersion');
  });

  it('rejects non-object input', () => {
    const errors: string[] = [];
    expect(parseTeammateScopeManifest(null, errors)).toBeNull();
    expect(parseTeammateScopeManifest([], errors)).toBeNull();
  });

  it('drops malformed entries but keeps the rest', () => {
    const errors: string[] = [];
    const m = parseTeammateScopeManifest(
      {
        schemaVersion: 1,
        skills: { good: 'all', bad: 42, list: ['a'] },
      },
      errors,
    );
    expect(m?.skills).toEqual({ good: 'all', list: ['a'] });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('skills.bad');
  });

  it('treats empty sections as open', () => {
    const m = parseTeammateScopeManifest({ schemaVersion: 1 }, []);
    expect(m?.skills).toEqual({});
    expect(m?.mcpServers).toEqual({});
  });
});

describe('isInTeammateAudience', () => {
  const bot = { id: 'bot-42', displayName: 'Emma Lead' };

  it('defaults to allowed when the entry is absent', () => {
    expect(isInTeammateAudience(emptyTeammateScopeManifest(), 'skill', 'anything', bot)).toBe(true);
    expect(isInTeammateAudience(null, 'mcp', 'anything', bot)).toBe(true);
  });

  it('allows "all"', () => {
    const m = parseTeammateScopeManifest(
      { schemaVersion: 1, skills: { s: 'all' }, mcpServers: { m: 'all' } },
      [],
    );
    expect(isInTeammateAudience(m, 'skill', 's', bot)).toBe(true);
    expect(isInTeammateAudience(m, 'mcp', 'm', bot)).toBe(true);
  });

  it('matches by bot id', () => {
    const m = parseTeammateScopeManifest(
      { schemaVersion: 1, skills: { s: ['bot-42'] } },
      [],
    );
    expect(isInTeammateAudience(m, 'skill', 's', bot)).toBe(true);
    expect(isInTeammateAudience(m, 'skill', 's', { id: 'other' })).toBe(false);
  });

  it('matches by display name case-insensitively', () => {
    const m = parseTeammateScopeManifest(
      { schemaVersion: 1, skills: { s: ['emma lead'] } },
      [],
    );
    expect(isInTeammateAudience(m, 'skill', 's', bot)).toBe(true);
  });

  it('denies an empty list for everyone', () => {
    const m = parseTeammateScopeManifest(
      { schemaVersion: 1, mcpServers: { m: [] } },
      [],
    );
    expect(isInTeammateAudience(m, 'mcp', 'm', bot)).toBe(false);
  });

  it('scopes skills and mcp servers independently', () => {
    const m = parseTeammateScopeManifest(
      {
        schemaVersion: 1,
        skills: { s: ['nobody'] },
        mcpServers: { m: ['bot-42'] },
      },
      [],
    );
    expect(isInTeammateAudience(m, 'skill', 's', bot)).toBe(false);
    expect(isInTeammateAudience(m, 'mcp', 'm', bot)).toBe(true);
  });
});
