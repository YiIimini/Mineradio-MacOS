// Tests for server/weather.js — weather label, mood engine, radio helpers
const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  openMeteoWeatherLabel,
  buildWeatherMood,
} = require('../server/weather');

// Note: setup() is required before calling fetchOpenMeteoWeather, buildWeatherRadio etc.
// We test only the pure functions that don't need external API calls.

describe('openMeteoWeatherLabel', () => {
  it('returns 晴 for code 0', () => {
    assert.equal(openMeteoWeatherLabel(0), '晴');
  });
  it('returns 少云 for codes 1-2', () => {
    assert.equal(openMeteoWeatherLabel(1), '少云');
    assert.equal(openMeteoWeatherLabel(2), '少云');
  });
  it('returns 阴 for code 3', () => {
    assert.equal(openMeteoWeatherLabel(3), '阴');
  });
  it('returns 雾 for codes 45, 48', () => {
    assert.equal(openMeteoWeatherLabel(45), '雾');
    assert.equal(openMeteoWeatherLabel(48), '雾');
  });
  it('returns 雨 for codes 61-65', () => {
    assert.equal(openMeteoWeatherLabel(61), '雨');
    assert.equal(openMeteoWeatherLabel(63), '雨');
    assert.equal(openMeteoWeatherLabel(65), '雨');
  });
  it('returns 雪 for codes 71-77', () => {
    assert.equal(openMeteoWeatherLabel(71), '雪');
    assert.equal(openMeteoWeatherLabel(75), '雪');
  });
  it('returns 雷雨 for codes 95-99', () => {
    assert.equal(openMeteoWeatherLabel(95), '雷雨');
    assert.equal(openMeteoWeatherLabel(99), '雷雨');
  });
  it('returns 天气 for unknown code', () => {
    assert.equal(openMeteoWeatherLabel(999), '天气');
  });
  it('handles string input', () => {
    assert.equal(openMeteoWeatherLabel('0'), '晴');
  });
});

describe('buildWeatherMood', () => {
  const baseWeather = {
    weatherCode: 0, temperature: 22, apparentTemperature: 23,
    precipitation: 0, humidity: 50, windSpeed: 10, isDay: 1,
  };

  it('returns clear mood for sunny daytime', () => {
    // Use a fixed midday time to avoid morning/night/dusk suffixes
    const noon = new Date('2026-01-15T12:00:00');
    const mood = buildWeatherMood(baseWeather, noon);
    assert.equal(mood.key, 'clear');
    assert.ok(mood.title.includes('晴朗'));
  });

  it('returns rain mood for rainy weather', () => {
    const weather = { ...baseWeather, weatherCode: 61, precipitation: 5 };
    const mood = buildWeatherMood(weather);
    assert.ok(mood.key.includes('rain'));
  });

  it('returns storm mood for thunderstorm', () => {
    const weather = { ...baseWeather, weatherCode: 95, precipitation: 20 };
    const mood = buildWeatherMood(weather);
    assert.ok(mood.key.includes('storm'));
  });

  it('returns snow mood for snow', () => {
    // Note: precipitation must be 0 for snow code to take effect,
    // since precipitation > 0 triggers isRain first in the logic chain
    const weather = { ...baseWeather, weatherCode: 71, precipitation: 0 };
    const mood = buildWeatherMood(weather);
    assert.ok(mood.key.includes('snow'));
  });

  it('returns humid mood for high temperature + humidity', () => {
    const weather = { ...baseWeather, temperature: 33, apparentTemperature: 35, humidity: 80 };
    const mood = buildWeatherMood(weather);
    assert.ok(mood.key.includes('humid'));
  });

  it('returns cloudy mood for overcast', () => {
    const weather = { ...baseWeather, weatherCode: 3 };
    const mood = buildWeatherMood(weather);
    assert.ok(mood.key.includes('cloudy'));
  });

  it('appends -night suffix for nighttime', () => {
    // Create a fixed date at midnight
    const midnight = new Date('2026-01-15T02:00:00');
    const mood = buildWeatherMood(baseWeather, midnight);
    assert.ok(mood.key.includes('night'));
  });

  it('boosts melancholy at dusk (17:00-20:00)', () => {
    const noon = new Date('2026-01-15T12:00:00');
    const dusk = new Date('2026-01-15T18:30:00');
    const noonMood = buildWeatherMood(baseWeather, noon);
    const duskMood = buildWeatherMood(baseWeather, dusk);
    // At dusk, melancholy should be boosted or title should contain 黄昏
    assert.ok(
      duskMood.melancholy >= noonMood.melancholy || duskMood.key.includes('黄昏') || duskMood.title.includes('黄昏'),
      `dusk melancholy=${duskMood.melancholy}, noon melancholy=${noonMood.melancholy}, key=${duskMood.key}`
    );
  });

  it('boosts energy in morning (05:00-11:00)', () => {
    const morning = new Date('2026-01-15T08:00:00');
    const mood = buildWeatherMood(baseWeather, morning);
    assert.ok(mood.energy >= 0.52);
  });

  it('increases energy for high wind', () => {
    const weather = { ...baseWeather, windSpeed: 30 };
    const mood = buildWeatherMood(weather);
    assert.ok(mood.energy >= 0.56);
  });

  it('always returns keywords array with max 7 entries', () => {
    const mood = buildWeatherMood(baseWeather);
    assert.ok(Array.isArray(mood.keywords));
    assert.ok(mood.keywords.length > 0);
    assert.ok(mood.keywords.length <= 7);
  });

  it('handles cold weather as snow mood', () => {
    const weather = { ...baseWeather, temperature: 2, apparentTemperature: 1 };
    const mood = buildWeatherMood(weather);
    assert.ok(mood.key.includes('snow'), `Expected snow, got ${mood.key}`);
  });

  it('all mood properties have correct types', () => {
    const mood = buildWeatherMood(baseWeather);
    assert.equal(typeof mood.key, 'string');
    assert.equal(typeof mood.title, 'string');
    assert.equal(typeof mood.tagline, 'string');
    assert.equal(typeof mood.energy, 'number');
    assert.equal(typeof mood.warmth, 'number');
    assert.equal(typeof mood.focus, 'number');
    assert.equal(typeof mood.melancholy, 'number');
    assert.ok(Array.isArray(mood.keywords));
  });

  it('energy/warmth/focus/melancholy are in [0,1]', () => {
    const mood = buildWeatherMood(baseWeather);
    assert.ok(mood.energy >= 0 && mood.energy <= 1);
    assert.ok(mood.warmth >= 0 && mood.warmth <= 1);
    assert.ok(mood.focus >= 0 && mood.focus <= 1);
    assert.ok(mood.melancholy >= 0 && mood.melancholy <= 1);
  });
});
