import { chmod, mkdtemp, readdir, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type ConvertWebmToOggInput,
  WhatsAppVoiceConversionService,
} from './whatsapp-voice-conversion.service';

type ProcessResult = Awaited<ReturnType<WhatsAppVoiceConversionService['runProcess']>>;

function processResult(overrides: Partial<ProcessResult> = {}): ProcessResult {
  return {
    code: 0,
    signal: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    ...overrides,
  };
}

class FakeVoiceConversionService extends WhatsAppVoiceConversionService {
  ffmpegExitCode = 0;
  ffmpegTimedOut = false;
  inputDuration = 3;
  outputDuration = 3;
  outputSize = 8;
  outputCodec = 'opus';
  outputContainer = 'ogg';
  skipOutput = false;
  activeConversions = 0;
  maxActiveConversions = 0;
  conversionDelayMs = 0;
  capabilityOutputStream: 'stdout' | 'stderr' = 'stdout';
  omitCapability: 'libopus' | 'opusDecoder' | 'webmDemuxer' | 'oggMuxer' | null = null;
  decoderCapabilityOutput: string | null = null;
  calls: Array<{ command: string; args: string[] }> = [];

  protected override async runProcess(
    command: string,
    args: string[],
    timeout: number,
  ): Promise<ProcessResult> {
    void timeout;
    this.calls.push({ command, args });

    if (args.includes('-encoders')) {
      return this.capabilityResult(
        this.omitCapability === 'libopus'
          ? ' A..... aac AAC'
          : ' A..... libopus libopus Opus (codec opus)',
      );
    }
    if (args.includes('-decoders')) {
      return this.capabilityResult(
        this.decoderCapabilityOutput ??
          (this.omitCapability === 'opusDecoder'
            ? ' A....D aac AAC'
            : [' A....D opus Opus', ' A....D libopus libopus Opus (codec opus)'].join('\n')),
      );
    }
    if (args.includes('-demuxers')) {
      return this.capabilityResult(
        this.omitCapability === 'webmDemuxer'
          ? ' D mov,mp4,m4a,3gp,3g2,mj2 QuickTime / MOV'
          : ' D matroska,webm Matroska / WebM',
      );
    }
    if (args.includes('-muxers')) {
      return this.capabilityResult(
        this.omitCapability === 'oggMuxer'
          ? ' E mp4 MP4'
          : [' E ogg Ogg', ' E opus Ogg Opus'].join('\n'),
      );
    }

    if (path.basename(command) === 'ffprobe') {
      const target = args.at(-1) ?? '';
      const isOutput = target.endsWith('output.ogg');
      return processResult({
        stdout: JSON.stringify({
          format: {
            format_name: isOutput ? this.outputContainer : 'matroska,webm',
            duration: String(isOutput ? this.outputDuration : this.inputDuration),
          },
          streams: [
            {
              codec_type: 'audio',
              codec_name: isOutput ? this.outputCodec : 'opus',
              duration: String(isOutput ? this.outputDuration : this.inputDuration),
            },
          ],
        }),
      });
    }

    this.activeConversions += 1;
    this.maxActiveConversions = Math.max(this.maxActiveConversions, this.activeConversions);
    try {
      if (this.conversionDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, this.conversionDelayMs));
      }

      if (this.ffmpegTimedOut) return processResult({ timedOut: true, signal: 'SIGKILL' });
      if (this.ffmpegExitCode !== 0) return processResult({ code: this.ffmpegExitCode });

      if (!this.skipOutput) {
        await writeFile(args.at(-1) as string, Buffer.alloc(this.outputSize, 'o'), {
          mode: 0o600,
        });
      }

      return processResult();
    } finally {
      this.activeConversions -= 1;
    }
  }

  private capabilityResult(output: string) {
    return this.capabilityOutputStream === 'stdout'
      ? processResult({ stdout: output })
      : processResult({ stderr: output });
  }
}

async function executablePair(root: string) {
  const ffmpegPath = path.join(root, 'ffmpeg');
  const ffprobePath = path.join(root, 'ffprobe');
  await writeFile(ffmpegPath, '');
  await writeFile(ffprobePath, '');
  await chmod(ffmpegPath, 0o700);
  await chmod(ffprobePath, 0o700);
  return { ffmpegPath, ffprobePath };
}

function config(values: Record<string, string | undefined>) {
  return {
    get: (name: string) => values[name],
  };
}

describe('WhatsAppVoiceConversionService', () => {
  let root: string;
  let tempRoot: string;
  let ffmpegPath: string;
  let subject: FakeVoiceConversionService;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'crm-novo-voice-conversion-'));
    tempRoot = path.join(root, 'voice-tmp');
    ({ ffmpegPath } = await executablePair(root));
    subject = new FakeVoiceConversionService(
      config({
        WHATSAPP_FFMPEG_PATH: ffmpegPath,
        WHATSAPP_VOICE_TEMP_DIR: tempRoot,
      }) as never,
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const validInput = (overrides: Partial<ConvertWebmToOggInput> = {}) => ({
    buffer: Buffer.from('webm-opus'),
    mimeType: 'audio/webm;codecs=opus',
    ...overrides,
  });

  it.each(['audio/webm', 'audio/webm;codecs=opus', 'audio/webm; codecs=opus'])(
    'converts valid %s input to private OGG/Opus output',
    async (mimeType) => {
      const result = await subject.convertWebmToOgg(validInput({ mimeType }));

      expect(result).toEqual({
        buffer: Buffer.alloc(8, 'o'),
        mimeType: 'audio/ogg; codecs=opus',
        sizeBytes: 8,
        durationSeconds: 3,
      });
      await expect(readdir(tempRoot)).resolves.toEqual([]);
    },
  );

  it('rejects invalid MIME without broadening the public audio whitelist', async () => {
    await expect(
      subject.convertWebmToOgg(validInput({ mimeType: 'audio/ogg; codecs=opus' })),
    ).rejects.toMatchObject({ response: { message: 'VOICE_INPUT_INVALID' } });
  });

  it('rejects empty and oversized inputs before conversion', async () => {
    await expect(
      subject.convertWebmToOgg(validInput({ buffer: Buffer.alloc(0) })),
    ).rejects.toMatchObject({
      response: { message: 'VOICE_INPUT_INVALID' },
    });
    await expect(
      subject.convertWebmToOgg(validInput({ buffer: Buffer.alloc(5 * 1024 * 1024 + 1) })),
    ).rejects.toMatchObject({
      response: { message: 'VOICE_INPUT_TOO_LARGE' },
    });
  });

  it('rejects relative ffmpeg paths and relative temp roots as unavailable', async () => {
    const relativeFfmpeg = new FakeVoiceConversionService(
      config({ WHATSAPP_FFMPEG_PATH: 'ffmpeg', WHATSAPP_VOICE_TEMP_DIR: tempRoot }) as never,
    );
    await expect(relativeFfmpeg.convertWebmToOgg(validInput())).rejects.toMatchObject({
      response: { message: 'VOICE_CONVERSION_UNAVAILABLE' },
    });

    const relativeRoot = new FakeVoiceConversionService(
      config({ WHATSAPP_FFMPEG_PATH: ffmpegPath, WHATSAPP_VOICE_TEMP_DIR: 'tmp/audio4' }) as never,
    );
    await expect(relativeRoot.convertWebmToOgg(validInput())).rejects.toMatchObject({
      response: { message: 'VOICE_CONVERSION_UNAVAILABLE' },
    });
  });

  it('uses server-generated paths with private permissions', async () => {
    await subject.convertWebmToOgg(validInput());
    const ffmpegCall = subject.calls.find((call) => call.args.includes('-application'));

    expect(ffmpegCall?.args).not.toContain('request-id');
    expect(ffmpegCall?.args).not.toContain('original.webm');
    expect(ffmpegCall?.args.join(' ')).toContain(tempRoot);
    const tempRootStats = await stat(tempRoot);
    expect(tempRootStats.mode & 0o777).toBe(0o700);
  });

  it('fails safely on timeout, spawn failure and non-zero ffmpeg exit', async () => {
    subject.ffmpegTimedOut = true;
    await expect(subject.convertWebmToOgg(validInput())).rejects.toMatchObject({
      response: { message: 'VOICE_CONVERSION_TIMEOUT' },
    });

    subject.ffmpegTimedOut = false;
    subject.ffmpegExitCode = 1;
    await expect(subject.convertWebmToOgg(validInput())).rejects.toMatchObject({
      response: { message: 'VOICE_CONVERSION_FAILED' },
    });
  });

  it('validates missing, empty, oversized and non-OGG output', async () => {
    subject.skipOutput = true;
    await expect(subject.convertWebmToOgg(validInput())).rejects.toMatchObject({
      response: { message: 'VOICE_CONVERSION_FAILED' },
    });

    subject.skipOutput = false;
    subject.outputSize = 0;
    await expect(subject.convertWebmToOgg(validInput())).rejects.toMatchObject({
      response: { message: 'VOICE_CONVERSION_FAILED' },
    });

    subject.outputSize = 5 * 1024 * 1024 + 1;
    await expect(subject.convertWebmToOgg(validInput())).rejects.toMatchObject({
      response: { message: 'VOICE_OUTPUT_TOO_LARGE' },
    });

    subject.outputSize = 8;
    subject.outputContainer = 'matroska,webm';
    await expect(subject.convertWebmToOgg(validInput())).rejects.toMatchObject({
      response: { message: 'VOICE_CONVERSION_FAILED' },
    });

    subject.outputContainer = 'ogg';
    subject.outputCodec = 'aac';
    await expect(subject.convertWebmToOgg(validInput())).rejects.toMatchObject({
      response: { message: 'VOICE_CONVERSION_FAILED' },
    });
  });

  it('validates frontend and real probed duration limits', async () => {
    await expect(
      subject.convertWebmToOgg(validInput({ durationSeconds: 61 })),
    ).rejects.toMatchObject({
      response: { message: 'VOICE_DURATION_TOO_LONG' },
    });

    subject.inputDuration = 61;
    await expect(subject.convertWebmToOgg(validInput())).rejects.toMatchObject({
      response: { message: 'VOICE_DURATION_TOO_LONG' },
    });

    subject.inputDuration = 3;
    subject.outputDuration = 61;
    await expect(subject.convertWebmToOgg(validInput())).rejects.toMatchObject({
      response: { message: 'VOICE_DURATION_TOO_LONG' },
    });
  });

  it('cleans temporary job directories on success, error and timeout', async () => {
    await subject.convertWebmToOgg(validInput());
    await expect(readdir(tempRoot)).resolves.toEqual([]);

    subject.ffmpegExitCode = 1;
    await subject.convertWebmToOgg(validInput()).catch(() => undefined);
    await expect(readdir(tempRoot)).resolves.toEqual([]);

    subject.ffmpegExitCode = 0;
    subject.ffmpegTimedOut = true;
    await subject.convertWebmToOgg(validInput()).catch(() => undefined);
    await expect(readdir(tempRoot)).resolves.toEqual([]);
  });

  it('serializes conversions with process-local concurrency 1', async () => {
    subject.conversionDelayMs = 25;

    await Promise.all([
      subject.convertWebmToOgg(validInput()),
      subject.convertWebmToOgg(validInput()),
    ]);

    expect(subject.maxActiveConversions).toBe(1);
  });

  it('runs ffmpeg with argument arrays only and no shell-expanded user content', async () => {
    await subject.convertWebmToOgg(validInput());
    const ffmpegCall = subject.calls.find((call) => call.args.includes('-application'));

    expect(ffmpegCall?.command).toBe(ffmpegPath);
    expect(ffmpegCall?.args).toEqual(
      expect.arrayContaining([
        '-hide_banner',
        '-nostdin',
        '-y',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '48000',
        '-c:a',
        'libopus',
        '-b:a',
        '32k',
        '-application',
        'voip',
        '-f',
        'ogg',
      ]),
    );
  });

  it('accepts Ubuntu 20.04 ffmpeg 4.2.7 capability output from stderr', async () => {
    subject.capabilityOutputStream = 'stderr';

    const capability = await subject.capabilityCheck();

    expect(capability).toMatchObject({
      available: true,
      libopus: true,
      opusDecoder: true,
      webmDemuxer: true,
      oggMuxer: true,
    });
  });

  it('detects opus decoder by codec token without matching Canopus descriptions', async () => {
    subject.decoderCapabilityOutput = [
      ' VF...D cllc Canopus Lossless Codec',
      ' V....D hq_hqa Canopus HQ/HQA',
      ' VFS..D hqx Canopus HQX',
      ' A....D opus Opus',
      ' A....D libopus libopus Opus (codec opus)',
    ].join('\n');

    const capability = await subject.capabilityCheck();

    expect(capability.opusDecoder).toBe(true);
    expect(capability.available).toBe(true);
  });

  it('does not detect opus decoder from Canopus-only decoder descriptions', async () => {
    subject.decoderCapabilityOutput = [
      ' VF...D cllc Canopus Lossless Codec',
      ' V....D hq_hqa Canopus HQ/HQA',
      ' VFS..D hqx Canopus HQX',
    ].join('\n');

    const capability = await subject.capabilityCheck();

    expect(capability.opusDecoder).toBe(false);
    expect(capability.available).toBe(false);
  });

  it.each([
    ['libopus' as const],
    ['opusDecoder' as const],
    ['webmDemuxer' as const],
    ['oggMuxer' as const],
  ])('keeps conversion unavailable when %s capability is missing', async (missing) => {
    subject.omitCapability = missing;

    const capability = await subject.capabilityCheck();

    expect(capability.available).toBe(false);
    expect(capability[missing]).toBe(false);
  });
});
