import { useEffect, useRef, useState } from 'react';
import { Barcode, Camera, Check, Search, Square, X } from 'lucide-react';

type DetectedCode = { rawValue?: string };
type Detector = { detect: (source: HTMLVideoElement) => Promise<DetectedCode[]> };
type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;
type BarcodeWindow = Window & { BarcodeDetector?: DetectorConstructor };

export function BarcodeCapture({ onCode, label = 'Scan a barcode', compact = false, autoResolve = false }: {
  onCode: (code: string) => void | Promise<void>;
  label?: string;
  compact?: boolean;
  autoResolve?: boolean;
}) {
  const [code, setCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [status, setStatus] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastCodeRef = useRef('');

  function stopCamera() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    busyRef.current = false;
    setCameraActive(false);
  }

  async function submit(value = code) {
    const clean = value.trim();
    if (!clean) { setStatus('Enter or scan a barcode first.'); return; }
    setCode(clean);
    try { await onCode(clean); setStatus(`Code captured: ${clean}`); }
    catch (error) { setStatus(error instanceof Error ? `Could not process ${clean}: ${error.message}` : `Could not process ${clean}. Check the connection and try again.`); }
  }

  async function startCamera() {
    lastCodeRef.current = '';
    const Detector = (window as BarcodeWindow).BarcodeDetector;
    if (!Detector) { setStatus('Live scanning is not supported by this browser. Use a hardware scanner or enter the code manually.'); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) { setStatus('Camera scanning requires a secure HTTPS page and camera permission. You can still enter the code manually.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) { stopCamera(); return; }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      let detector: Detector;
      try { detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] }); }
      catch { detector = new Detector(); }
      setCameraActive(true); setStatus('Camera ready. Centre the barcode in the frame.');
      timerRef.current = window.setInterval(async () => {
        if (busyRef.current || !videoRef.current || videoRef.current.readyState < 2) return;
        busyRef.current = true;
        try {
          const result = await detector.detect(videoRef.current);
          const found = result.find((item) => typeof item.rawValue === 'string' && item.rawValue.trim());
          const next = found?.rawValue?.trim();
          if (next && next !== lastCodeRef.current) {
            lastCodeRef.current = next; stopCamera(); await submit(next);
          }
        } catch { /* Blurry camera frames are expected during continuous scanning. */ }
        finally { busyRef.current = false; }
      }, 240);
    } catch (error) {
      stopCamera(); setStatus(error instanceof Error ? error.message : 'Camera access was denied. Enter the barcode manually.');
    }
  }

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  return <section className={`barcode-capture ${compact ? 'barcode-capture-compact' : ''}`} aria-label={label}>
    <div className="barcode-capture-controls"><label className="barcode-capture-input"><Barcode size={17} /><input value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void submit(); } }} placeholder="Scan or type barcode / SKU" aria-label="Barcode, SKU or product code" autoComplete="off" /><button type="button" className="barcode-capture-submit" onClick={() => void submit()}><Search size={15} /><span>{autoResolve ? 'Find' : 'Use code'}</span></button></label><button type="button" className="button button-secondary button-small" disabled={cameraActive} onClick={() => void startCamera()}><Camera size={15} /> Camera</button>{cameraActive && <button type="button" className="button button-secondary button-small" onClick={stopCamera}><Square size={13} /> Stop</button>}</div>
    <div className={`barcode-camera-frame ${cameraActive ? 'barcode-camera-frame-active' : 'barcode-camera-frame-idle'}`} aria-hidden={!cameraActive}><video ref={videoRef} muted playsInline aria-label="Live barcode camera preview" />{cameraActive && <span className="barcode-camera-reticle" />}</div>
    {status && <div className="barcode-capture-status" role="status"><Check size={14} />{status}{cameraActive && <button type="button" aria-label="Close camera" onClick={stopCamera}><X size={14} /></button>}</div>}
  </section>;
}
