// Chunking-based preparation (reliable + avoids object size limits):
// 1) Decode
// 2) Downsample to mono @ 16k
// 3) Split PCM into multiple small WAV chunks (each < ~10MB)

const DEFAULT_SAMPLE_RATE = 16000;
const DEFAULT_TARGET_BYTES = 6 * 1024 * 1024; // 6MB to stay under limits after Base64 encoding (~8MB)

export type PreparedAudio =
  | { kind: 'single'; file: File; sampleRate: number }
  | { kind: 'chunked'; chunks: File[]; sampleRate: number; chunkSeconds: number };

export async function prepareAudio(
  file: File,
  onProgress?: (progress: number) => void,
  options?: {
    targetBytes?: number;
    sampleRate?: number;
    minChunkSeconds?: number;
    maxChunkSeconds?: number;
  }
): Promise<PreparedAudio> {
  const targetBytes = options?.targetBytes ?? DEFAULT_TARGET_BYTES;
  const sampleRate = options?.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const minChunkSeconds = options?.minChunkSeconds ?? 60;
  const maxChunkSeconds = options?.maxChunkSeconds ?? 300;

  onProgress?.(5);

  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(15);

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.error('Failed to decode audio:', error);
      throw new Error('Unable to decode audio file. Please try a different format.');
    }
    onProgress?.(35);

    const offlineContext = new OfflineAudioContext(
      1,
      Math.ceil(audioBuffer.duration * sampleRate),
      sampleRate
    );

    const offlineSource = offlineContext.createBufferSource();
    offlineSource.buffer = audioBuffer;
    offlineSource.connect(offlineContext.destination);
    offlineSource.start(0);

    onProgress?.(45);

    const rendered = await offlineContext.startRendering();
    onProgress?.(65);

    const samples = rendered.getChannelData(0);

    // For mono 16-bit PCM, bytes/sec = sampleRate * 2
    const bytesPerSecond = sampleRate * 2;
    const maxSecondsByTarget = Math.floor((targetBytes - 44) / bytesPerSecond);
    const chunkSeconds = clamp(maxSecondsByTarget, minChunkSeconds, maxChunkSeconds);

    const chunkSamples = chunkSeconds * sampleRate;
    const totalChunks = Math.ceil(samples.length / chunkSamples);

    // If it fits in one chunk, return a single file
    if (totalChunks <= 1) {
      const blob = encodeWavMono16(samples, sampleRate);
      onProgress?.(100);
      return {
        kind: 'single',
        file: new File([blob], `audio-${Date.now()}.wav`, { type: 'audio/wav' }),
        sampleRate,
      };
    }

    const chunks: File[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSamples;
      const end = Math.min(start + chunkSamples, samples.length);
      const slice = samples.subarray(start, end);

      const blob = encodeWavMono16(slice, sampleRate);
      const fileName = `chunk-${String(i + 1).padStart(3, '0')}.wav`;
      chunks.push(new File([blob], fileName, { type: 'audio/wav' }));

      // 65 -> 95 range reserved for chunk generation
      const pct = 65 + Math.round(((i + 1) / totalChunks) * 30);
      onProgress?.(pct);
    }

    onProgress?.(100);
    return { kind: 'chunked', chunks, sampleRate, chunkSeconds };
  } finally {
    try {
      await audioContext.close();
    } catch {
      // ignore
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function encodeWavMono16(samples: Float32Array, sampleRate: number): Blob {
  const format = 1; // PCM
  const numChannels = 1;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;

  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
