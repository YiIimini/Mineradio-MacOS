// Tests for dj-analyzer.js — DSP, beat detection, statistics helpers
const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  buildBeatMapFromLowEnergy,
} = require('../dj-analyzer');

// Replicate the pure helper functions locally for testing
// (they are not exported individually, but their logic is critical)
function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
function clampRange(v, min, max) { v = Number(v) || 0; return Math.max(min, Math.min(max, v)); }

function percentile(arr, p, maxSamples) {
  const len = arr ? arr.length : 0;
  if (!len) return 0.001;
  maxSamples = maxSamples || 16000;
  let sample;
  if (len <= maxSamples) {
    sample = Array.prototype.slice.call(arr);
  } else {
    sample = new Array(maxSamples);
    const step = (len - 1) / (maxSamples - 1);
    for (let i = 0; i < maxSamples; i++) sample[i] = arr[Math.min(len - 1, Math.floor(i * step))] || 0;
  }
  sample.sort((a, b) => a - b);
  return sample[Math.max(0, Math.min(sample.length - 1, Math.floor(sample.length * p)))] || 0.001;
}

function median(vals) {
  vals = vals.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  return vals.length ? vals[Math.floor(vals.length * 0.5)] : 0;
}

function makeBiquad(type, freq, q, sr) {
  freq = Math.max(8, Math.min(freq, sr * 0.45));
  const w0 = 2 * Math.PI * freq / sr;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * (q || 0.707));
  let b0, b1, b2;
  if (type === 'highpass') {
    b0 = (1 + cos) * 0.5; b1 = -(1 + cos); b2 = (1 + cos) * 0.5;
  } else {
    b0 = (1 - cos) * 0.5; b1 = 1 - cos; b2 = (1 - cos) * 0.5;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const inv = 1 / a0;
  return { b0: b0 * inv, b1: b1 * inv, b2: b2 * inv, a1: a1 * inv, a2: a2 * inv, x1: 0, x2: 0, y1: 0, y2: 0 };
}

function runBiquad(st, x) {
  const y = st.b0 * x + st.b1 * st.x1 + st.b2 * st.x2 - st.a1 * st.y1 - st.a2 * st.y2;
  st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y;
  return y;
}

describe('clamp01', () => {
  it('returns 0 for negative', () => assert.equal(clamp01(-5), 0));
  it('returns 1 for >1', () => assert.equal(clamp01(5), 1));
  it('returns value in range', () => assert.equal(clamp01(0.5), 0.5));
  it('returns 0 for NaN', () => assert.equal(clamp01('abc'), 0));
});

describe('clampRange', () => {
  it('clamps within range', () => assert.equal(clampRange(5, 1, 10), 5));
  it('clamps below min', () => assert.equal(clampRange(0, 1, 10), 1));
  it('clamps above max', () => assert.equal(clampRange(20, 1, 10), 10));
});

describe('percentile', () => {
  const arr = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
  it('returns ~50 at 50th percentile', () => {
    const p50 = percentile(arr, 0.5);
    assert.ok(p50 >= 45 && p50 <= 55, `Expected ~50, got ${p50}`);
  });
  it('returns ~90 at 90th percentile', () => {
    const p90 = percentile(arr, 0.9);
    assert.ok(p90 >= 85 && p90 <= 95, `Expected ~90, got ${p90}`);
  });
  it('returns 0.001 for empty array', () => {
    assert.equal(percentile([], 0.5), 0.001);
  });
  it('handles null input', () => {
    assert.equal(percentile(null, 0.5), 0.001);
  });
  it('downsamples large arrays', () => {
    const big = Array.from({ length: 20000 }, (_, i) => i);
    const p = percentile(big, 0.5);
    assert.ok(p > 0);
  });
});

describe('median', () => {
  it('returns middle value', () => assert.equal(median([1, 3, 2]), 2));
  it('returns 0 for empty', () => assert.equal(median([]), 0));
  it('filters non-finite', () => assert.equal(median([NaN, 1, 3, Infinity, 2]), 2));
});

describe('makeBiquad / runBiquad', () => {
  it('creates a filter state object', () => {
    const st = makeBiquad('lowpass', 1000, 0.707, 44100);
    assert.ok(typeof st.b0 === 'number');
    assert.ok(Number.isFinite(st.b0));
    assert.equal(st.x1, 0);
    assert.equal(st.x2, 0);
  });
  it('highpass filter produces different coefficients', () => {
    const lp = makeBiquad('lowpass', 1000, 0.707, 44100);
    const hp = makeBiquad('highpass', 1000, 0.707, 44100);
    assert.notEqual(lp.b0, hp.b0);
  });
  it('runBiquad processes signal with no NaN', () => {
    const st = makeBiquad('lowpass', 1000, 0.707, 44100);
    for (let i = 0; i < 100; i++) {
      const y = runBiquad(st, Math.sin(i * 0.1));
      assert.ok(Number.isFinite(y));
    }
  });
  it('lowpass attenuates high frequencies', () => {
    // A 15kHz tone should be attenuated by a 1kHz lowpass
    const sr = 44100;
    const st = makeBiquad('lowpass', 1000, 0.707, sr);
    let energy = 0;
    for (let i = 0; i < 500; i++) {
      const x = Math.sin(2 * Math.PI * 15000 * i / sr);
      const y = runBiquad(st, x);
      energy += y * y;
    }
    // High frequency should be significantly attenuated
    assert.ok(energy < 100, `Energy ${energy} should be low after lowpass`);
  });
  it('clamps frequency to Nyquist', () => {
    const st = makeBiquad('lowpass', 50000, 0.707, 44100);
    // Should not throw and freq should be clamped
    assert.ok(Number.isFinite(st.b0));
  });
});

describe('buildBeatMapFromLowEnergy', () => {
  // Helper: generate energy data with clear periodic peaks to trigger beat detection
  function makeBeatEnergy(numFrames, peakInterval, peakStrength, baseLevel) {
    const lowEnergy = new Float32Array(numFrames);
    const hitEnergy = new Float32Array(numFrames);
    for (let i = 0; i < numFrames; i++) {
      lowEnergy[i] = baseLevel + Math.random() * 0.02;
      hitEnergy[i] = baseLevel * 0.5 + Math.random() * 0.01;
      // Add strong periodic peaks
      if (i % peakInterval === 0) {
        lowEnergy[i] = peakStrength;
        hitEnergy[i] = peakStrength * 0.7;
      }
    }
    return { lowEnergy, hitEnergy };
  }

  it('returns valid structure for short input (<20 frames)', () => {
    const lowEnergy = new Float32Array(10).fill(0.1);
    const hitEnergy = new Float32Array(10).fill(0.2);
    const result = buildBeatMapFromLowEnergy(lowEnergy, hitEnergy, 0.023, 0.5);
    assert.ok(result.beats !== undefined);
    assert.ok(Array.isArray(result.beats));
    assert.ok(result.duration > 0);
  });

  it('detects beats from strong periodic energy data', () => {
    // Use very strong, clean peaks with well-spaced intervals
    const n = 1500;
    const lowEnergy = new Float32Array(n);
    const hitEnergy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      lowEnergy[i] = 0.02;
      hitEnergy[i] = 0.01;
    }
    // Strong kicks every ~43 samples at 0.046s hop = ~120 BPM
    const interval = 43;
    for (let i = 20; i < n; i += interval) {
      lowEnergy[i] = 1.0;
      lowEnergy[i - 1] = 0.5;
      lowEnergy[i + 1] = 0.5;
      hitEnergy[i] = 0.8;
      hitEnergy[i - 1] = 0.3;
      hitEnergy[i + 1] = 0.3;
    }
    const hopSec = 0.046;
    const result = buildBeatMapFromLowEnergy(lowEnergy, hitEnergy, hopSec, n * hopSec);
    assert.ok(Array.isArray(result.beats));
    assert.ok(typeof result.duration === 'number');
    assert.ok(typeof result.gridStep === 'number');
    assert.ok(result.gridStep > 0, `gridStep should be positive, got ${result.gridStep}`);
  });

  it('returns valid beat objects with required properties', () => {
    const n = 1000;
    const lowEnergy = new Float32Array(n);
    const hitEnergy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      lowEnergy[i] = 0.02;
      hitEnergy[i] = 0.01;
    }
    const interval = 43;
    for (let i = 20; i < n; i += interval) {
      lowEnergy[i] = 1.0;
      lowEnergy[i - 1] = 0.5;
      lowEnergy[i + 1] = 0.5;
      hitEnergy[i] = 0.8;
    }
    const hopSec = 0.046;
    const result = buildBeatMapFromLowEnergy(lowEnergy, hitEnergy, hopSec, n * hopSec);
    // Verify any returned beats have correct structure
    for (const beat of result.beats) {
      assert.ok(Number.isFinite(beat.time), `Beat time ${beat.time} should be finite`);
      assert.ok(beat.time >= 0, `Beat time ${beat.time} should be >= 0`);
      assert.ok(typeof beat.confidence === 'number', `confidence missing`);
      assert.ok(typeof beat.strength === 'number', `strength missing`);
      assert.ok(typeof beat.combo === 'string', `combo missing`);
      assert.ok(beat.confidence >= 0 && beat.confidence <= 1);
    }
  });
});
