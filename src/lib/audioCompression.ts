// Web Audio API-based compression (works in all browsers without special headers)

export async function compressAudio(
  file: File,
  onProgress?: (progress: number) => void
): Promise<File> {
  onProgress?.(10);
  
  // Read the file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(20);
  
  // Create audio context
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  // Decode the audio
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } catch (error) {
    console.error('Failed to decode audio:', error);
    throw new Error('Unable to decode audio file. Please try a different format.');
  }
  onProgress?.(40);
  
  // Downsample to mono 22050Hz for speech
  const targetSampleRate = 22050;
  const offlineContext = new OfflineAudioContext(
    1, // mono
    Math.ceil(audioBuffer.duration * targetSampleRate),
    targetSampleRate
  );
  
  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineContext.destination);
  source.start(0);
  
  onProgress?.(50);
  
  const renderedBuffer = await offlineContext.startRendering();
  onProgress?.(70);
  
  // Encode as WAV (widely supported, reasonable size for speech)
  const wavBlob = encodeWAV(renderedBuffer);
  onProgress?.(90);
  
  const compressedFile = new File(
    [wavBlob],
    file.name.replace(/\.[^/.]+$/, '.wav'),
    { type: 'audio/wav' }
  );
  
  onProgress?.(100);
  
  // Close the audio context
  await audioContext.close();
  
  return compressedFile;
}

function encodeWAV(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const samples = audioBuffer.getChannelData(0);
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  
  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  
  // Write audio data
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
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
