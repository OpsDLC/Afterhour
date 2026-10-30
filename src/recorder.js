// Client-side video export of the canvas (H4N-10). Nothing is uploaded.
// The original audio is NOT included unless the user explicitly opts in.

const VIDEO_TYPES = [
  // MP4/H.264 first: it plays on the most platforms (Safari, Chrome ≥ 126, social apps).
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

const WITH_AUDIO = {
  'video/mp4;codecs=avc1.42E01E': 'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1': 'video/mp4;codecs=avc1,mp4a.40.2',
  'video/webm;codecs=vp9': 'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8': 'video/webm;codecs=vp8,opus',
};

export function canRecord(canvas) {
  return typeof MediaRecorder !== 'undefined' && typeof canvas.captureStream === 'function';
}

// Keep H.264 video when audio is added: try AAC, then Opus, before giving up on H.264.
const AUDIO_FALLBACKS = {
  'video/mp4;codecs=avc1.42E01E': ['video/mp4;codecs=avc1.42E01E,opus'],
  'video/mp4;codecs=avc1': ['video/mp4;codecs=avc1,opus'],
};

export function pickMimeType(withAudio) {
  for (const t of VIDEO_TYPES) {
    const candidates = withAudio ? [WITH_AUDIO[t] || t, ...(AUDIO_FALLBACKS[t] || [])] : [t];
    for (const full of candidates) if (MediaRecorder.isTypeSupported(full)) return full;
  }
  return '';
}

/**
 * Record `seconds` of `canvas`. `audioTrack` is only added when not null (opt-in).
 * Resolves to { blob, mimeType, ext }.
 */
export function recordCanvas(canvas, { seconds = 8, fps = 30, audioTrack = null, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const stream = canvas.captureStream(fps);
    if (audioTrack) stream.addTrack(audioTrack.clone());
    const mimeType = pickMimeType(!!audioTrack);
    let rec;
    try {
      rec = new MediaRecorder(stream, { mimeType: mimeType || undefined, videoBitsPerSecond: 8_000_000 });
    } catch (err) {
      reject(err);
      return;
    }
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onerror = (e) => reject(e.error || new Error('Recording failed'));
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = rec.mimeType || mimeType || 'video/webm';
      resolve({ blob: new Blob(chunks, { type }), mimeType: type, ext: type.includes('mp4') ? 'mp4' : 'webm' });
    };
    const started = performance.now();
    const tick = setInterval(() => {
      const k = Math.min(1, (performance.now() - started) / (seconds * 1000));
      if (onProgress) onProgress(k);
      if (k >= 1) {
        clearInterval(tick);
        if (rec.state !== 'inactive') rec.stop();
      }
    }, 100);
    rec.start(250);
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
