// Tests for server/utils.js — pure utility functions
const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  MIME, serveStatic, sendJSON,
  normalizeVersion, compareVersions,
  sha256Hex, sha512Base64, sha512Hex,
  normalizeDigest, clampNumber,
  cleanReleaseLine, extractReleaseNotes,
  buildMirrorUrl,
  collectCookiePair, collectCookieInput, normalizeCookieHeader, rawCookieFallback,
  parseCookieString, serializeCookieObject,
  readRequestBody,
  parseJSONText,
  getPlatformUA,
} = require('../server/utils');

describe('MIME', () => {
  it('maps common extensions', () => {
    assert.equal(MIME['.html'], 'text/html; charset=utf-8');
    assert.equal(MIME['.js'], 'application/javascript');
    assert.equal(MIME['.css'], 'text/css');
    assert.equal(MIME['.json'], 'application/json');
    assert.equal(MIME['.svg'], 'image/svg+xml');
  });
});

describe('normalizeVersion', () => {
  it('strips leading v', () => {
    assert.equal(normalizeVersion('v1.2.0'), '1.2.0');
  });
  it('strips build metadata', () => {
    assert.equal(normalizeVersion('1.2.0+build.123'), '1.2.0');
  });
  it('strips pre-release suffix', () => {
    assert.equal(normalizeVersion('1.2.0-beta.1'), '1.2.0');
  });
  it('handles empty input', () => {
    assert.equal(normalizeVersion(''), '');
  });
  it('handles null/undefined', () => {
    assert.equal(normalizeVersion(null), '');
    assert.equal(normalizeVersion(undefined), '');
  });
});

describe('compareVersions', () => {
  it('returns 0 for equal', () => {
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  });
  it('returns 1 when a > b', () => {
    assert.equal(compareVersions('2.0.0', '1.9.9'), 1);
  });
  it('returns -1 when a < b', () => {
    assert.equal(compareVersions('0.9.0', '1.0.0'), -1);
  });
  it('handles different segment counts', () => {
    assert.equal(compareVersions('1.2', '1.2.0'), 0);
    assert.equal(compareVersions('1.2.0', '1.2'), 0);
  });
  it('handles v-prefixed versions', () => {
    assert.equal(compareVersions('v1.2.0', 'v1.3.0'), -1);
  });
});

describe('clampNumber', () => {
  it('returns value within range', () => {
    assert.equal(clampNumber(5, 1, 10, 0), 5);
  });
  it('clamps below minimum', () => {
    assert.equal(clampNumber(-5, 1, 10, 0), 1);
  });
  it('clamps above maximum', () => {
    assert.equal(clampNumber(15, 1, 10, 0), 10);
  });
  it('returns fallback for null/undefined/empty', () => {
    assert.equal(clampNumber(null, 1, 10, 0), 0);
    assert.equal(clampNumber(undefined, 1, 10, 99), 99);
    assert.equal(clampNumber('', 1, 10, 42), 42);
  });
  it('returns fallback for NaN', () => {
    assert.equal(clampNumber('abc', 1, 10, 0), 0);
  });
});

describe('sha256Hex', () => {
  it('produces correct hash', () => {
    const result = sha256Hex(Buffer.from('hello'));
    assert.equal(result, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});

describe('sha512Base64', () => {
  it('produces base64 output', () => {
    const result = sha512Base64(Buffer.from('test'));
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
    // Base64 only: no hex chars outside base64 range
    assert.ok(/^[A-Za-z0-9+/=]+$/.test(result));
  });
});

describe('sha512Hex', () => {
  it('produces hex output', () => {
    const result = sha512Hex(Buffer.from('test'));
    assert.ok(typeof result === 'string');
    assert.ok(/^[0-9a-f]+$/.test(result));
  });
});

describe('normalizeDigest', () => {
  it('strips algorithm prefix', () => {
    assert.equal(normalizeDigest('sha256:abc123', 'sha256'), 'abc123');
  });
  it('strips surrounding quotes', () => {
    assert.equal(normalizeDigest("sha256:'abc123'", 'sha256'), 'abc123');
  });
  it('returns empty for empty input', () => {
    assert.equal(normalizeDigest('', 'sha256'), '');
  });
});

describe('cleanReleaseLine', () => {
  it('strips markdown headers', () => {
    assert.equal(cleanReleaseLine('## Fixed bugs'), 'Fixed bugs');
  });
  it('strips list markers', () => {
    assert.equal(cleanReleaseLine('- Added feature'), 'Added feature');
  });
  it('strips bold markers', () => {
    assert.equal(cleanReleaseLine('**Important** fix'), 'Important fix');
  });
  it('strips backticks', () => {
    assert.equal(cleanReleaseLine('`code` example'), 'code example');
  });
  it('trims whitespace', () => {
    assert.equal(cleanReleaseLine('  text  '), 'text');
  });
});

describe('extractReleaseNotes', () => {
  it('extracts clean lines from body', () => {
    const body = '## New Features\n- Added player\n- Fixed lyrics\nhttps://example.com';
    const notes = extractReleaseNotes(body);
    assert.ok(notes.length <= 4);
  });
  it('filters URLs', () => {
    const body = 'https://github.com/repo/releases';
    assert.equal(extractReleaseNotes(body).length, 0);
  });
});

describe('buildMirrorUrl', () => {
  it('replaces {url} placeholder', () => {
    const result = buildMirrorUrl('https://github.com/repo/release.zip', 'https://mirror.example.com/');
    assert.equal(result, 'https://mirror.example.com/https://github.com/repo/release.zip');
  });
  it('replaces {encodedUrl} placeholder', () => {
    const result = buildMirrorUrl('https://example.com/path/file.zip', 'https://proxy.com/?u={encodedUrl}');
    assert.ok(result.includes('https%3A%2F%2Fexample.com'));
  });
  it('returns empty for non-http input', () => {
    assert.equal(buildMirrorUrl('', 'https://mirror.com/'), '');
  });
});

describe('Cookie helpers', () => {
  describe('collectCookiePair', () => {
    it('adds valid cookie pair', () => {
      const picked = new Map();
      collectCookiePair(picked, 'MUSIC_U', 'abc123');
      assert.equal(picked.get('MUSIC_U'), 'abc123');
    });
    it('skips attribute names', () => {
      const picked = new Map();
      collectCookiePair(picked, 'path', '/');
      collectCookiePair(picked, 'expires', '12345');
      assert.equal(picked.size, 0);
    });
    it('skips empty key', () => {
      const picked = new Map();
      collectCookiePair(picked, '', 'value');
      assert.equal(picked.size, 0);
    });
  });

  describe('normalizeCookieHeader', () => {
    it('handles string input', () => {
      const result = normalizeCookieHeader('MUSIC_U=abc; __csrf=xyz');
      assert.ok(result.includes('MUSIC_U=abc'));
      assert.ok(result.includes('__csrf=xyz'));
    });
    it('handles object input', () => {
      const result = normalizeCookieHeader({ MUSIC_U: 'abc', __csrf: 'xyz' });
      assert.ok(result.includes('MUSIC_U=abc'));
    });
    it('filters null/empty values', () => {
      const result = normalizeCookieHeader({ MUSIC_U: 'abc', empty: '' });
      assert.ok(!result.includes('empty'));
    });
  });

  describe('rawCookieFallback', () => {
    it('returns trimmed string', () => {
      assert.equal(rawCookieFallback('  abc=123  '), 'abc=123');
    });
    it('joins string arrays', () => {
      assert.equal(rawCookieFallback(['a=1', 'b=2']), 'a=1; b=2');
    });
    it('returns empty for non-string', () => {
      assert.equal(rawCookieFallback({ a: 1 }), '');
    });
  });

  describe('parseCookieString', () => {
    it('parses semicolon-separated cookies', () => {
      const result = parseCookieString('a=1; b=2; c=3');
      assert.deepEqual(result, { a: '1', b: '2', c: '3' });
    });
    it('handles empty string', () => {
      assert.deepEqual(parseCookieString(''), {});
    });
  });

  describe('serializeCookieObject', () => {
    it('serializes object to cookie string', () => {
      const result = serializeCookieObject({ a: '1', b: '2' });
      assert.equal(result, 'a=1; b=2');
    });
    it('filters null values', () => {
      const result = serializeCookieObject({ a: '1', b: null });
      assert.equal(result, 'a=1');
    });
  });
});

describe('collectCookieInput', () => {
  it('handles array of objects with name/value', () => {
    const picked = new Map();
    collectCookieInput([{ name: 'MUSIC_U', value: 'abc' }, { name: '__csrf', value: 'xyz' }], picked);
    assert.equal(picked.size, 2);
  });
});

describe('parseJSONText', () => {
  it('parses plain JSON', () => {
    assert.deepEqual(parseJSONText('{"a":1}'), { a: 1 });
  });
  it('strips callback wrapper', () => {
    assert.deepEqual(parseJSONText('callback({"a":1})'), { a: 1 });
  });
  it('strips callback with semicolon', () => {
    assert.deepEqual(parseJSONText('callback({"a":1});'), { a: 1 });
  });
  it('throws on invalid JSON', () => {
    assert.throws(() => parseJSONText('not json'));
  });
});

describe('getPlatformUA', () => {
  it('returns a string', () => {
    assert.ok(typeof getPlatformUA() === 'string');
  });
  it('contains Mozilla identifier', () => {
    assert.ok(getPlatformUA().includes('Mozilla/5.0'));
  });
  it('is platform-appropriate', () => {
    const ua = getPlatformUA();
    if (process.platform === 'darwin') {
      assert.ok(ua.includes('Macintosh'));
    } else {
      assert.ok(ua.includes('Windows'));
    }
  });
});

describe('readRequestBody', () => {
  it('resolves with _bodyError on request stream error', async () => {
    // Simulate a minimal request that errors
    const req = new (require('stream').Readable)({
      read() { this.destroy(new Error('test')); }
    });
    const result = await readRequestBody(req);
    assert.ok(result && typeof result._bodyError === 'string');
  });
});
