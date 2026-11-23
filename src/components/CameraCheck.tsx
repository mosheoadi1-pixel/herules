import { useEffect, useRef, useState } from 'react';

export type CameraLiveness = { challenge_type: 'head_turn'; challenge_direction: 'left' | 'right'; frames: { frame_base64: string; timestamp: number; phase: string }[]; start_timestamp: 0; end_timestamp: number };
type Prompt = 'left' | 'center' | 'right' | 'selfie';
type Phase = 'idle' | 'turning' | 'selfie' | 'ready';

// Milliseconds from the start of the head turn. Frames are captured at the phase points; the selfie is taken by the user at the end.
const script: { at: number; prompt?: Prompt; phase?: string }[] = [
  { at: 0, prompt: 'left' }, { at: 600, phase: 'turn1_start' }, { at: 1800, phase: 'turn1_peak' },
  { at: 3000, prompt: 'center' }, { at: 3500, phase: 'turn1_return' },
  { at: 4500, prompt: 'right' }, { at: 5100, phase: 'turn_start' }, { at: 6300, phase: 'turn_peak' },
  { at: 7500, prompt: 'center' }, { at: 8000, phase: 'turn_return' },
  { at: 9000, prompt: 'selfie' },
];
const endTimestamp = 9000;
const frameWidth = 480;
const jpegPrefix = 'data:image/jpeg;base64,';
const promptKeys: Record<Prompt, string> = { left: 'camPromptLeft', right: 'camPromptRight', center: 'camPromptCenter', selfie: 'camPromptSelfie' };

function grab(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  if (!video.videoWidth) throw new Error('not ready');
  const scale = Math.min(1, frameWidth / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('not ready');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

export function CameraCheck({ t, busy, front, onSend }: { t: (key: string) => string; busy: boolean; front: string; onSend: (media: string[], liveness: CameraLiveness) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null), canvasRef = useRef<HTMLCanvasElement>(null), streamRef = useRef<MediaStream | null>(null), framesRef = useRef<CameraLiveness['frames']>([]);
  const [phase, setPhase] = useState<Phase>('idle'), [prompt, setPrompt] = useState<Prompt | ''>(''), [error, setError] = useState(''), [selfie, setSelfie] = useState(''), [liveness, setLiveness] = useState<CameraLiveness | null>(null);
  const stop = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };
  useEffect(() => stop, []);
  useEffect(() => {
    if (phase !== 'turning') return;
    const startedAt = performance.now();
    const timers = script.map(step => window.setTimeout(() => {
      if (step.prompt) setPrompt(step.prompt);
      if (step.prompt === 'selfie') setPhase('selfie');
      if (!step.phase) return;
      try {
        const frame = grab(videoRef.current!, canvasRef.current!);
        framesRef.current.push({ frame_base64: frame.slice(jpegPrefix.length), timestamp: Math.round(performance.now() - startedAt), phase: step.phase });
      } catch {
        stop();
        setPhase('idle');
        setError(t('camNotReady'));
      }
    }, step.at));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [phase]);
  const start = async () => {
    setError('');
    setSelfie('');
    setLiveness(null);
    framesRef.current = [];
    if (!navigator.mediaDevices?.getUserMedia) return setError(t('camNoCamera'));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error('not ready');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setPrompt('');
      setPhase('turning');
    } catch (failure) {
      stop();
      const name = (failure as { name?: string })?.name;
      setError(t(name === 'NotAllowedError' || name === 'SecurityError' ? 'camDenied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'camNoCamera' : 'camNotReady'));
    }
  };
  const capture = () => {
    setError('');
    if (framesRef.current.length !== 6 || !videoRef.current || !canvasRef.current) return setError(t('camNotReady'));
    try {
      const image = grab(videoRef.current, canvasRef.current);
      setSelfie(image);
      setLiveness({ challenge_type: 'head_turn', challenge_direction: 'left', frames: framesRef.current, start_timestamp: 0, end_timestamp: endTimestamp });
      stop();
      setPhase('ready');
    } catch {
      setError(t('camNotReady'));
    }
  };
  const retake = () => {
    setPhase('idle');
    setPrompt('');
    setSelfie('');
    setLiveness(null);
    setError('');
  };
  const live = phase === 'turning' || phase === 'selfie';
  return <section>
    {phase === 'idle' && <>
      <p>{t('camIntro')}</p>
      <button type="button" className="primary" disabled={busy} onClick={start}>{t('camStart')}</button>
    </>}
    <video ref={videoRef} hidden={!live} playsInline muted autoPlay aria-hidden="true" style={{ maxWidth: '100%', transform: 'scaleX(-1)' }}/>
    <canvas ref={canvasRef} hidden/>
    {live && prompt && <p role="status" aria-live="polite">{t(promptKeys[prompt])}</p>}
    {phase === 'selfie' && <button type="button" className="primary" onClick={capture}>{t('camTakeSelfie')}</button>}
    {phase === 'ready' && liveness && <>
      <img src={selfie} alt={t('camTakeSelfie')} style={{ maxWidth: '100%' }}/>
      <p role="status">{t('camReady')}</p>
      <button type="button" className="primary" disabled={busy} onClick={() => onSend([front, selfie], liveness)}>{t('verifySubmit')}</button>
      <button type="button" className="quiet" disabled={busy} onClick={retake}>{t('camRetake')}</button>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
