import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alignPlainLyrics,
  detectAlignmentProtocol,
  mergeTimestamps,
  parseAlignmentResponse,
  requestAlignment,
  resolveAlignmentUrl,
  toKaraokeLyricsData,
  type AlignmentCue,
} from './karaokeAlignService';
import { KaraokeAIConfig } from './karaokeAIConfigStore';
import { Song } from '../types/lyrics';

const CONFIG: KaraokeAIConfig = {
  endpointUrl: 'https://api.example.com/v1',
  model: 'whisper-1',
  apiKey: 'sk-test',
};

const SONG: Song = {
  id: 'song-1',
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  albumArt: '',
  durationMs: 120_000,
};

function jsonOk(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

describe('detectAlignmentProtocol / resolveAlignmentUrl', () => {
  it('treats a Hugging Face /models/ URL as raw-bytes huggingface', () => {
    const url = 'https://api-inference.huggingface.co/models/openai/whisper-large-v3';
    expect(detectAlignmentProtocol(url)).toBe('huggingface');
    expect(resolveAlignmentUrl(url)).toBe(url);
  });

  it('treats other URLs as OpenAI and appends the transcriptions path', () => {
    expect(detectAlignmentProtocol('https://api.openai.com/v1')).toBe('openai');
    expect(resolveAlignmentUrl('https://api.openai.com/v1/')).toBe(
      'https://api.openai.com/v1/audio/transcriptions'
    );
  });

  it('does not double-append the OpenAI path', () => {
    const url = 'https://api.openai.com/v1/audio/transcriptions';
    expect(resolveAlignmentUrl(url)).toBe(url);
  });
});

describe('parseAlignmentResponse', () => {
  it('parses OpenAI verbose_json segments (seconds to ms)', () => {
    const cues = parseAlignmentResponse({
      segments: [
        { start: 0, end: 1.5, text: 'Hello' },
        { start: 1.5, end: 3, text: 'World' },
      ],
    });
    expect(cues).toEqual([
      { startMs: 0, endMs: 1500, text: 'Hello' },
      { startMs: 1500, endMs: 3000, text: 'World' },
    ]);
  });

  it('parses Hugging Face chunks with timestamp pairs', () => {
    const cues = parseAlignmentResponse({
      text: 'Hello World',
      chunks: [
        { timestamp: [0, 1.5], text: 'Hello' },
        { timestamp: [1.5, 3], text: 'World' },
      ],
    });
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ startMs: 0, endMs: 1500, text: 'Hello' });
  });

  it('prefers segments when both are present and sorts ascending', () => {
    const cues = parseAlignmentResponse({
      segments: [
        { start: 2, end: 3, text: 'B' },
        { start: 1, end: 2, text: 'A' },
      ],
      chunks: [{ timestamp: [5, 6], text: 'ignored' }],
    });
    expect(cues.map((c) => c.text)).toEqual(['A', 'B']);
  });

  it('returns an empty array for non-matching payloads', () => {
    expect(parseAlignmentResponse(null)).toEqual([]);
    expect(parseAlignmentResponse({})).toEqual([]);
    expect(parseAlignmentResponse({ segments: [{ text: 'no times' }] })).toEqual([]);
    expect(parseAlignmentResponse({ segments: [{ start: 0, text: '' }] })).toEqual([]);
    expect(parseAlignmentResponse({ segments: [{ start: 0, text: '   ' }] })).toEqual([]);
    expect(parseAlignmentResponse({ segments: [{ start: 0 }] })).toEqual([]);
    expect(parseAlignmentResponse({ segments: [{}] })).toEqual([]);
    expect(parseAlignmentResponse({ segments: [null] })).toEqual([]);
  });
});

describe('mergeTimestamps', () => {
  it('assigns matched cue times and interpolates between them', () => {
    const cues: AlignmentCue[] = [
      { startMs: 1000, endMs: 2000, text: 'first line' },
      { startMs: 5000, endMs: 6000, text: 'third line' },
    ];
    const lines = mergeTimestamps('First line\nmiddle line\nThird line', cues);
    expect(lines).toHaveLength(3);
    expect(lines[0].startTimeMs).toBe(1000);
    expect(lines[2].startTimeMs).toBe(5000);
    // middle interpolated between 1000 and 5000
    expect(lines[1].startTimeMs).toBeGreaterThan(1000);
    expect(lines[1].startTimeMs).toBeLessThan(5000);
    // endTime of a line equals the next line's start when advancing
    expect(lines[0].endTimeMs).toBe(lines[1].startTimeMs);
  });

  it('lays out lines on a fixed interval when nothing matches', () => {
    const lines = mergeTimestamps('a\nb\nc', []);
    expect(lines.map((l) => l.startTimeMs)).toEqual([0, 4000, 8000]);
    expect(lines[0].id).toBe('ai-sync-0');
  });

  it('returns an empty array for empty/blank plain lyrics', () => {
    expect(mergeTimestamps('', [])).toEqual([]);
    expect(mergeTimestamps('   \n  \n', [])).toEqual([]);
  });

  it('fills leading lines before the first matched cue', () => {
    const cues: AlignmentCue[] = [{ startMs: 8000, endMs: 9000, text: 'chorus hit' }];
    const lines = mergeTimestamps('intro line\nchorus hit', cues);
    expect(lines[0].startTimeMs).toBeLessThan(8000);
    expect(lines[0].startTimeMs).toBeGreaterThanOrEqual(0);
    expect(lines[1].startTimeMs).toBe(8000);
  });

  it('fills trailing lines after the last matched cue', () => {
    const cues: AlignmentCue[] = [{ startMs: 1000, endMs: 2000, text: 'first line' }];
    const lines = mergeTimestamps('first line\nsecond line\nthird line', cues);
    expect(lines[0].startTimeMs).toBe(1000);
    expect(lines[1].startTimeMs).toBeGreaterThan(1000);
    expect(lines[2].startTimeMs).toBeGreaterThan(lines[1].startTimeMs);
  });
});

describe('requestAlignment', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects when the pipeline is not configured', async () => {
    await expect(
      requestAlignment(new Blob(['x']), { ...CONFIG, apiKey: '' })
    ).rejects.toThrow(/not configured/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts multipart to an OpenAI endpoint and parses segments', async () => {
    fetchMock.mockResolvedValue(jsonOk({ segments: [{ start: 0, end: 1, text: 'Hi' }] }));
    const cues = await requestAlignment(new Blob(['x']), CONFIG);
    expect(cues).toEqual([{ startMs: 0, endMs: 1000, text: 'Hi' }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/audio/transcriptions');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers.Authorization).toBe('Bearer sk-test');
  });

  it('posts raw bytes to a Hugging Face endpoint and parses chunks', async () => {
    const hfConfig: KaraokeAIConfig = {
      ...CONFIG,
      endpointUrl: 'https://api-inference.huggingface.co/models/openai/whisper-large-v3',
    };
    fetchMock.mockResolvedValue(jsonOk({ chunks: [{ timestamp: [0, 2], text: 'Yo' }] }));
    const cues = await requestAlignment(new Blob(['x']), hfConfig);
    expect(cues).toEqual([{ startMs: 0, endMs: 2000, text: 'Yo' }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api-inference.huggingface.co/models/openai/whisper-large-v3');
    expect(init.headers['Content-Type']).toBe('audio/wav');
    expect(init.body).toBeInstanceOf(Blob);
  });

  it('throws on a non-ok alignment response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(requestAlignment(new Blob(['x']), CONFIG)).rejects.toThrow(/failed \(500\)/);
  });
});

describe('alignPlainLyrics / toKaraokeLyricsData', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('captures cues and merges them with the plain lines', async () => {
    fetchMock.mockResolvedValue(
      jsonOk({
        segments: [
          { start: 1, end: 2, text: 'line one' },
          { start: 3, end: 4, text: 'line two' },
        ],
      })
    );
    const lines = await alignPlainLyrics(new Blob(['x']), CONFIG, 'line one\nline two');
    expect(lines.map((l) => l.startTimeMs)).toEqual([1000, 3000]);
  });

  it('wraps merged lines as AI Sync data with a disclosed provider', () => {
    const data = toKaraokeLyricsData(SONG, [
      { id: 'ai-sync-0', startTimeMs: 0, endTimeMs: 1000, text: 'only line' },
    ]);
    expect(data.provider).toBe('AI Sync');
    expect(data.plainLyrics).toBe('only line');
    expect(data.trivia.join(' ')).toMatch(/audio/i);
  });
});
