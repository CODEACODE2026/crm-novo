import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  RequestTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { constants } from 'fs';
import { access, chmod, mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import path from 'path';

export type VoiceConversionErrorCode =
  | 'VOICE_CONVERSION_UNAVAILABLE'
  | 'VOICE_INPUT_INVALID'
  | 'VOICE_INPUT_TOO_LARGE'
  | 'VOICE_DURATION_TOO_LONG'
  | 'VOICE_CONVERSION_TIMEOUT'
  | 'VOICE_CONVERSION_FAILED'
  | 'VOICE_OUTPUT_TOO_LARGE';

export type ConvertWebmToOggInput = {
  buffer: Buffer;
  mimeType: string;
  durationSeconds?: number | null;
};

export type VoiceConversionResult = {
  buffer: Buffer;
  mimeType: 'audio/ogg; codecs=opus';
  sizeBytes: number;
  durationSeconds: number;
};

export type VoiceConversionCapability = {
  available: boolean;
  ffmpegPath: string | null;
  ffprobePath: string | null;
  libopus: boolean;
  opusDecoder: boolean;
  webmDemuxer: boolean;
  oggMuxer: boolean;
};

type ProcessResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

type FfprobeOutput = {
  format?: {
    duration?: string;
    format_name?: string;
  };
  streams?: Array<{
    codec_name?: string;
    codec_type?: string;
    duration?: string;
  }>;
};

const acceptedInputMimeTypes = new Set(['audio/webm', 'audio/webm;codecs=opus']);
const defaultFfmpegPath = '/usr/bin/ffmpeg';
const defaultTempRoot = '/var/lib/crm-novo/whatsapp-media/tmp/audio4';
const inputMaxBytes = 5 * 1024 * 1024;
const outputMaxBytes = 5 * 1024 * 1024;
const durationMaxSeconds = 60;
const timeoutMs = 15_000;
const processOutputLimit = 4_000;
const capabilityOutputLimit = 64 * 1024;
const outputMimeType = 'audio/ogg; codecs=opus' as const;

@Injectable()
export class WhatsAppVoiceConversionService {
  private readonly logger = new Logger(WhatsAppVoiceConversionService.name);
  private capability: Promise<VoiceConversionCapability> | null = null;
  private capabilityLogged = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly config: ConfigService) {}

  async capabilityCheck() {
    this.capability ??= this.computeCapability();
    return this.capability;
  }

  async convertWebmToOgg(input: ConvertWebmToOggInput): Promise<VoiceConversionResult> {
    const next = this.queue.then(() => this.convertWebmToOggNow(input));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async convertWebmToOggNow(input: ConvertWebmToOggInput): Promise<VoiceConversionResult> {
    this.validateInput(input);

    const capability = await this.capabilityCheck();
    if (!capability.available || !capability.ffmpegPath || !capability.ffprobePath) {
      throw this.error('VOICE_CONVERSION_UNAVAILABLE');
    }

    const tempRoot = await this.ensureTempRoot();
    const jobId = randomUUID();
    const jobDir = this.safeJoin(tempRoot, jobId);
    const inputPath = this.safeJoin(jobDir, 'input.webm');
    const outputPath = this.safeJoin(jobDir, 'output.ogg');

    try {
      await mkdir(jobDir, { recursive: false, mode: 0o700 });
      await chmod(jobDir, 0o700).catch(() => undefined);
      await writeFile(inputPath, input.buffer, { mode: 0o600 });
      await chmod(inputPath, 0o600).catch(() => undefined);

      const inputMetadata = await this.probeMedia(capability.ffprobePath, inputPath);
      this.assertDuration(inputMetadata.durationSeconds);

      await this.runFfmpeg(capability.ffmpegPath, inputPath, outputPath);
      const outputStats = await this.safeStat(outputPath);

      if (!outputStats || outputStats.size <= 0) {
        throw this.error('VOICE_CONVERSION_FAILED');
      }

      if (outputStats.size > outputMaxBytes) {
        throw this.error('VOICE_OUTPUT_TOO_LARGE');
      }

      const outputMetadata = await this.probeMedia(capability.ffprobePath, outputPath);
      if (outputMetadata.container !== 'ogg' || outputMetadata.audioCodec !== 'opus') {
        throw this.error('VOICE_CONVERSION_FAILED');
      }
      this.assertDuration(outputMetadata.durationSeconds);

      const buffer = await readFile(outputPath);
      return {
        buffer,
        mimeType: outputMimeType,
        sizeBytes: buffer.length,
        durationSeconds: outputMetadata.durationSeconds,
      };
    } finally {
      await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private validateInput(input: ConvertWebmToOggInput) {
    if (!Buffer.isBuffer(input.buffer) || input.buffer.length <= 0) {
      throw this.error('VOICE_INPUT_INVALID');
    }

    if (input.buffer.length > inputMaxBytes) {
      throw this.error('VOICE_INPUT_TOO_LARGE');
    }

    if (!acceptedInputMimeTypes.has(this.normalizeMimeType(input.mimeType))) {
      throw this.error('VOICE_INPUT_INVALID');
    }

    if (
      typeof input.durationSeconds === 'number' &&
      Number.isFinite(input.durationSeconds) &&
      input.durationSeconds > durationMaxSeconds
    ) {
      throw this.error('VOICE_DURATION_TOO_LONG');
    }
  }

  private normalizeMimeType(mimeType: string) {
    return mimeType
      .split(';')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
      .join(';');
  }

  private async computeCapability(): Promise<VoiceConversionCapability> {
    const ffmpegPath = this.ffmpegPath();
    const ffprobePath = this.ffprobePath(ffmpegPath);
    const unavailable: VoiceConversionCapability = {
      available: false,
      ffmpegPath,
      ffprobePath,
      libopus: false,
      opusDecoder: false,
      webmDemuxer: false,
      oggMuxer: false,
    };

    try {
      if (!ffprobePath) {
        this.logCapability(unavailable);
        return unavailable;
      }

      await access(ffmpegPath, constants.X_OK);
      await access(ffprobePath, constants.X_OK);

      const [encoders, decoders, demuxers, muxers] = await Promise.all([
        this.runProcess(ffmpegPath, ['-hide_banner', '-encoders'], 5_000, capabilityOutputLimit),
        this.runProcess(ffmpegPath, ['-hide_banner', '-decoders'], 5_000, capabilityOutputLimit),
        this.runProcess(ffmpegPath, ['-hide_banner', '-demuxers'], 5_000, capabilityOutputLimit),
        this.runProcess(ffmpegPath, ['-hide_banner', '-muxers'], 5_000, capabilityOutputLimit),
      ]);

      const encoderOutput = this.processOutput(encoders);
      const decoderOutput = this.processOutput(decoders);
      const demuxerOutput = this.processOutput(demuxers);
      const muxerOutput = this.processOutput(muxers);
      const capability: VoiceConversionCapability = {
        available: false,
        ffmpegPath,
        ffprobePath,
        libopus: this.hasFfmpegEntryToken(encoderOutput, 'libopus'),
        opusDecoder: this.hasFfmpegCodecEntry(decoderOutput, ['opus', 'libopus']),
        webmDemuxer:
          this.hasFfmpegEntryToken(demuxerOutput, 'matroska,webm') ||
          this.hasFfmpegEntryToken(demuxerOutput, 'webm'),
        oggMuxer: this.hasFfmpegEntryToken(muxerOutput, 'ogg'),
      };
      capability.available =
        capability.libopus &&
        capability.opusDecoder &&
        capability.webmDemuxer &&
        capability.oggMuxer &&
        [encoders, decoders, demuxers, muxers].every((result) => result.code === 0);

      this.logCapability(capability);
      return capability;
    } catch {
      this.logCapability(unavailable);
      return unavailable;
    }
  }

  private ffmpegPath() {
    const configured = this.config.get<string>('WHATSAPP_FFMPEG_PATH')?.trim() || defaultFfmpegPath;
    if (!path.isAbsolute(configured)) {
      return configured;
    }
    return path.resolve(configured);
  }

  private ffprobePath(ffmpegPath: string) {
    if (!path.isAbsolute(ffmpegPath)) {
      return null;
    }
    return path.join(path.dirname(ffmpegPath), 'ffprobe');
  }

  private processOutput(result: ProcessResult) {
    return `${result.stdout}\n${result.stderr}`;
  }

  private hasFfmpegEntryToken(output: string, expected: string) {
    const normalizedExpected = expected.toLowerCase();

    return output
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .filter(Boolean)
      .some((line) => {
        const tokens = line.split(/\s+/);
        return tokens.some(
          (token) => token === normalizedExpected || token.split(',').includes(normalizedExpected),
        );
      });
  }

  private hasFfmpegCodecEntry(output: string, expectedCodecs: string[]) {
    const normalizedExpected = new Set(expectedCodecs.map((codec) => codec.toLowerCase()));

    return output
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .filter(Boolean)
      .some((line) => {
        const [, codecToken] = line.split(/\s+/);
        if (!codecToken) {
          return false;
        }

        return codecToken.split(',').some((codec) => normalizedExpected.has(codec));
      });
  }

  private async ensureTempRoot() {
    const configured =
      this.config.get<string>('WHATSAPP_VOICE_TEMP_DIR')?.trim() || defaultTempRoot;

    if (!path.isAbsolute(configured)) {
      throw this.error('VOICE_CONVERSION_UNAVAILABLE');
    }

    const root = path.resolve(configured);
    const created = await mkdir(root, { recursive: true, mode: 0o700 });
    if (created) {
      await chmod(root, 0o700).catch(() => undefined);
    }

    return root;
  }

  private safeJoin(root: string, segment: string) {
    if (!/^[a-zA-Z0-9._-]+$/.test(segment)) {
      throw this.error('VOICE_CONVERSION_FAILED');
    }

    const resolved = path.resolve(root, segment);
    const relative = path.relative(root, resolved);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw this.error('VOICE_CONVERSION_FAILED');
    }

    return resolved;
  }

  private async runFfmpeg(ffmpegPath: string, inputPath: string, outputPath: string) {
    const result = await this.runProcess(
      ffmpegPath,
      [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-i',
        inputPath,
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
        outputPath,
      ],
      timeoutMs,
    );

    if (result.timedOut) {
      throw this.error('VOICE_CONVERSION_TIMEOUT');
    }

    if (result.code !== 0) {
      throw this.error('VOICE_CONVERSION_FAILED');
    }
  }

  private async probeMedia(ffprobePath: string, filePath: string) {
    const result = await this.runProcess(
      ffprobePath,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      5_000,
    );

    if (result.timedOut || result.code !== 0) {
      throw this.error('VOICE_CONVERSION_FAILED');
    }

    try {
      const parsed = JSON.parse(result.stdout) as FfprobeOutput;
      const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio');
      const durationSeconds = this.parseDuration(audio?.duration ?? parsed.format?.duration);
      return {
        audioCodec: audio?.codec_name?.toLowerCase() ?? null,
        container: parsed.format?.format_name?.toLowerCase().includes('ogg') ? 'ogg' : 'other',
        durationSeconds,
      };
    } catch {
      throw this.error('VOICE_CONVERSION_FAILED');
    }
  }

  private parseDuration(rawDuration: string | undefined) {
    const value = Number(rawDuration);
    if (!Number.isFinite(value) || value <= 0) {
      throw this.error('VOICE_CONVERSION_FAILED');
    }
    return value;
  }

  private assertDuration(durationSeconds: number) {
    if (durationSeconds > durationMaxSeconds) {
      throw this.error('VOICE_DURATION_TOO_LONG');
    }
  }

  private async safeStat(filePath: string) {
    try {
      return await stat(filePath);
    } catch {
      return null;
    }
  }

  protected runProcess(
    command: string,
    args: string[],
    timeout: number,
    outputLimit = processOutputLimit,
  ): Promise<ProcessResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timedOut = false;

      const append = (current: string, chunk: Buffer) =>
        (current + chunk.toString('utf8')).slice(-outputLimit);

      const finish = (result: Omit<ProcessResult, 'stdout' | 'stderr' | 'timedOut'>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(killTimer);
        resolve({
          ...result,
          stdout,
          stderr,
          timedOut,
        });
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), 1_000);
      }, timeout);
      let killTimer: NodeJS.Timeout;

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout = append(stdout, chunk);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = append(stderr, chunk);
      });
      child.on('error', () => finish({ code: null, signal: null }));
      child.on('close', (code, signal) => finish({ code, signal }));
    });
  }

  private logCapability(capability: VoiceConversionCapability) {
    if (this.capabilityLogged) return;
    this.capabilityLogged = true;
    this.logger.log(
      `voice conversion available=${capability.available} ffmpeg=${Boolean(
        capability.ffmpegPath,
      )} ffprobe=${Boolean(capability.ffprobePath)} encoderLibopus=${capability.libopus} decoderOpus=${
        capability.opusDecoder
      } demuxWebm=${capability.webmDemuxer} muxOgg=${capability.oggMuxer}`,
    );
  }

  private error(code: VoiceConversionErrorCode) {
    if (code === 'VOICE_CONVERSION_UNAVAILABLE') return new ServiceUnavailableException(code);
    if (code === 'VOICE_INPUT_TOO_LARGE' || code === 'VOICE_OUTPUT_TOO_LARGE') {
      return new PayloadTooLargeException(code);
    }
    if (code === 'VOICE_CONVERSION_TIMEOUT') return new RequestTimeoutException(code);
    return new BadRequestException(code);
  }
}
