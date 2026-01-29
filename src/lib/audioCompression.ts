import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export async function loadFFmpeg(onProgress?: (progress: number) => void): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) {
    return ffmpeg;
  }

  ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  ffmpeg.on('progress', ({ progress }) => {
    if (onProgress) {
      onProgress(Math.round(progress * 100));
    }
  });

  // Load FFmpeg with CORS-enabled URLs
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
}

export async function compressAudio(
  file: File,
  onProgress?: (progress: number) => void
): Promise<File> {
  const ffmpegInstance = await loadFFmpeg(onProgress);

  const inputName = 'input' + getExtension(file.name);
  const outputName = 'output.mp3';

  // Write input file to FFmpeg virtual filesystem
  await ffmpegInstance.writeFile(inputName, await fetchFile(file));

  // Compress to MP3 with reasonable quality settings
  // -ac 1: mono (reduces size by ~50%)
  // -ar 22050: lower sample rate (good enough for speech)
  // -b:a 64k: 64kbps bitrate (good for speech)
  await ffmpegInstance.exec([
    '-i', inputName,
    '-ac', '1',
    '-ar', '22050',
    '-b:a', '64k',
    '-y',
    outputName
  ]);

  // Read the compressed file
  const data = await ffmpegInstance.readFile(outputName);
  
  // Clean up
  await ffmpegInstance.deleteFile(inputName);
  await ffmpegInstance.deleteFile(outputName);

  // Create a new File object - copy data to a new ArrayBuffer to avoid SharedArrayBuffer issues
  const uint8Array = data as Uint8Array;
  const newBuffer = new ArrayBuffer(uint8Array.byteLength);
  new Uint8Array(newBuffer).set(uint8Array);
  
  const compressedBlob = new Blob([newBuffer], { type: 'audio/mpeg' });
  const compressedFile = new File(
    [compressedBlob],
    file.name.replace(/\.[^/.]+$/, '.mp3'),
    { type: 'audio/mpeg' }
  );

  return compressedFile;
}

function getExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? `.${ext}` : '.mp3';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
