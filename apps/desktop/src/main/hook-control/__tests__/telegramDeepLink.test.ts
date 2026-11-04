import { describe, expect, it } from 'vitest';

import {
  parseTelegramConnectUrl,
  telegramAddToGroupUrl,
  telegramBotUrl,
  validateTelegramExternalUrl,
} from '../telegramDeepLink.js';

const TOKEN = 'A'.repeat(43);

describe('Telegram deep-link validation', () => {
  it('accepts only the canonical one-time bind shape', () => {
    expect(parseTelegramConnectUrl(`https://t.me/Emma_TestBot?start=${TOKEN}`)).toEqual({
      url: `https://t.me/Emma_TestBot?start=${TOKEN}`,
      botUsername: 'Emma_TestBot',
      token: TOKEN,
    });
  });

  it.each([
    `http://t.me/EmmaTestBot?start=${TOKEN}`,
    `https://telegram.me/EmmaTestBot?start=${TOKEN}`,
    `https://t.me.evil.test/EmmaTestBot?start=${TOKEN}`,
    `https://user@t.me/EmmaTestBot?start=${TOKEN}`,
    `https://t.me:443/EmmaTestBot?start=${TOKEN}`,
    `https://t.me:444/EmmaTestBot?start=${TOKEN}`,
    `https://t.me/EmmaTestBot?start=${TOKEN}#fragment`,
    `https://t.me/EmmaTestBot?start=${TOKEN}#`,
    `https://t.me/EmmaTestBot/?start=${TOKEN}`,
    `https://t.me/EmmaTestBot?start=${TOKEN}&next=https://evil.test`,
    `https://t.me/EmmaTestBot?start=${TOKEN}&start=${TOKEN}`,
    `https://t.me/EmmaTestBot?%73tart=${TOKEN}`,
    'https://t.me/EmmaTestBot?start=short',
    `https://t.me/not-a-bot?start=${TOKEN}`,
    ` https://t.me/EmmaTestBot?start=${TOKEN}`,
  ])('rejects unsafe or non-canonical input: %s', (url) => {
    expect(() => parseTelegramConnectUrl(url)).toThrow();
  });

  it('builds provider URLs only from validated bot usernames', () => {
    expect(telegramBotUrl('EmmaTestBot')).toBe('https://t.me/EmmaTestBot');
    expect(telegramAddToGroupUrl('EmmaTestBot')).toBe('https://t.me/EmmaTestBot?startgroup=true');
    expect(() => telegramBotUrl('bad/nameBot')).toThrow();
  });

  it('validates open-bot and add-to-group actions without accepting arbitrary queries', () => {
    expect(validateTelegramExternalUrl('https://t.me/EmmaTestBot')).toBe(
      'https://t.me/EmmaTestBot',
    );
    expect(validateTelegramExternalUrl('https://t.me/EmmaTestBot?startgroup=true')).toBe(
      'https://t.me/EmmaTestBot?startgroup=true',
    );
    expect(() => validateTelegramExternalUrl('https://t.me/EmmaTestBot#')).toThrow();
    expect(() => validateTelegramExternalUrl('https://t.me/EmmaTestBot?')).toThrow();
    expect(() => validateTelegramExternalUrl('https://t.me/EmmaTestBot?admin=1')).toThrow();
  });
});
