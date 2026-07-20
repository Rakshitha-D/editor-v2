import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initTelemetry,
  telemetryStart,
  telemetryEnd,
  telemetryImpression,
  telemetryError,
  setTelemetryPageId,
  flushTelemetry,
} from './telemetry';
import type { IContext } from '../types/editor';

const ctx: IContext = {
  sid: 'sid-1',
  did: 'did-1',
  channel: 'channel-1',
  pdata: { id: 'test', ver: '1.0' },
  host: 'https://example.com',
} as IContext;

describe('telemetry dispatch / window.EkTelemetry handoff', () => {
  beforeEach(() => {
    initTelemetry(ctx, 'do_123');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve()));
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hands the event to window.EkTelemetry when present', () => {
    const start = vi.fn();
    (window as { EkTelemetry?: unknown }).EkTelemetry = { start };
    telemetryStart();
    expect(start).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to the internal batcher when window.EkTelemetry throws', () => {
    (window as { EkTelemetry?: unknown }).EkTelemetry = {
      start: () => { throw new TypeError("Cannot read properties of undefined (reading 'duration')"); },
    };
    expect(() => telemetryStart()).not.toThrow();
    flushTelemetry();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('uses the internal batcher when window.EkTelemetry is absent', () => {
    telemetryStart();
    flushTelemetry();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('telemetry — uri/duration/pageid/stacktrace fidelity (old editor parity)', () => {
  beforeEach(() => {
    initTelemetry(ctx, 'do_123');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve()));
    vi.stubGlobal('window', { location: { href: 'https://example.com/edit/do_123' } });
    vi.stubGlobal('navigator', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('IMPRESSION carries the real page uri and a numeric duration', () => {
    const impression = vi.fn();
    (window as { EkTelemetry?: unknown }).EkTelemetry = { impression };
    telemetryImpression();
    const edata = impression.mock.calls[0][0].edata;
    expect(edata.uri).toBe('https://example.com/edit/do_123');
    expect(typeof edata.duration).toBe('number');
  });

  it('END carries a numeric duration', () => {
    const end = vi.fn();
    (window as { EkTelemetry?: unknown }).EkTelemetry = { end };
    telemetryEnd();
    expect(typeof end.mock.calls[0][0].edata.duration).toBe('number');
  });

  it('ERROR carries pageid and an empty stacktrace when no detail is given', () => {
    setTelemetryPageId('question_editor');
    const error = vi.fn();
    (window as { EkTelemetry?: unknown }).EkTelemetry = { error };
    telemetryError('Failed to save.');
    const edata = error.mock.calls[0][0].edata;
    expect(edata.pageid).toBe('question_editor');
    expect(edata.stacktrace).toBe('');
  });

  it('ERROR carries a JSON stacktrace when detail is given', () => {
    const error = vi.fn();
    (window as { EkTelemetry?: unknown }).EkTelemetry = { error };
    telemetryError('Failed to save.', undefined, { status: 500, url: '/api/question/update' });
    const edata = error.mock.calls[0][0].edata;
    expect(JSON.parse(edata.stacktrace)).toEqual({ status: 500, url: '/api/question/update' });
  });
});
