import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readTeammateScopeManifest, teammateScopesPath } from '../teammate-scope-store.js';

describe('readTeammateScopeManifest', () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'emma-scopes-'));
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('returns an open manifest when the file is absent', () => {
    const m = readTeammateScopeManifest(home);
    expect(m.skills).toEqual({});
    expect(m.mcpServers).toEqual({});
  });

  it('parses a valid manifest from ~/.agents/teammate-scopes.json', () => {
    fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
    fs.writeFileSync(
      teammateScopesPath(home),
      JSON.stringify({
        schemaVersion: 1,
        skills: { design: ['Bot A'] },
        mcpServers: { notion: 'all' },
      }),
    );
    const m = readTeammateScopeManifest(home);
    expect(m.skills).toEqual({ design: ['Bot A'] });
    expect(m.mcpServers).toEqual({ notion: 'all' });
  });

  it('falls back to open on a corrupt file', () => {
    fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
    fs.writeFileSync(teammateScopesPath(home), '{ not json');
    const m = readTeammateScopeManifest(home);
    expect(m.skills).toEqual({});
  });

  it('falls back to open on a wrong schemaVersion', () => {
    fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
    fs.writeFileSync(
      teammateScopesPath(home),
      JSON.stringify({ schemaVersion: 99, skills: {} }),
    );
    const m = readTeammateScopeManifest(home);
    expect(m.skills).toEqual({});
  });
});
