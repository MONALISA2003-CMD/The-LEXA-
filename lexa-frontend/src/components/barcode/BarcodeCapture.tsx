import { useEffect, useRef, useState } from 'react';
import { Barcode, Camera, Check, Search, Square, ImageUp } from '../LexaIcon';
import type { IScannerControls } from '@zxing/browser';

export function BarcodeCapture({ onCode, label = 'Scan a barcode', compact = false, autoResolve = false }: {
  onCode: (code: string) => void | Promise<void>;
  label?: string; compact?: boolean; autoResolve?: boolean;
}) {
  const [code, setCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [loadingCamera, setLoadingCamera] = useState(false);
  const [status, setStatus] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const requestRef = useRef(0);
  const resultRef = useRef(false);
  const mountedRef = useRef(true);
  function stopCamera() {
    requestRef.current++;
    controlsRef.current?.stop();
    controlsRef.current = null;
    if (typeof MediaStream !== 'undefined' && videoRef.current?.srcObject instanceof MediaStream) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    if (mountedRef.current) { setCameraActive(false); setLoadingCamera(false); }
  }
  async function submit(value = code) {
    const clean = value.trim();
    if (!clean) { setStatus('Enter or scan a barcode first.'); return; }
    setCode(clean);
    try { await onCode(clean); setStatus('Barcode captured.'); }
    catch (error) { setStatus(error instanceof Error ? 'Could not use this code: ' + error.message : 'Could not use this code. Please try again.'); }
  }
  function cameraMessage(error: unknown) {
    const name = error instanceof Error ? error.name : '';
    if (['NotAllowedError','PermissionDeniedError','SecurityError'].includes(name)) return 'Camera access is blocked. Allow Camera for this website in browser settings, then try again. You can also type or photograph a barcode.';
    if (['NotFoundError','DevicesNotFoundError'].includes(name)) return 'No camera was found. Type the barcode or use a photo.';
    if (['NotReadableError','TrackStartError'].includes(name)) return 'Another app may be using your camera. Close it and try again.';
    if (name === 'OverconstrainedError') return 'Your preferred camera is unavailable. Try again or use a photo.';
    return 'Could not start the camera. Try again or enter the barcode manually.';
  }
  async function startCamera() {
    if (loadingCamera || cameraActive) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('Open LEXA directly in an HTTPS browser to use the camera. Manual and photo entry are also available.'); return;
    }
    const request = ++requestRef.current;
    resultRef.current = false; setLoadingCamera(true);
    setStatus('Opening the camera… Allow access if your phone asks.');
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      const element = videoRef.current;
      if (!element || request !== requestRef.current) return;
      const onResult = (result: { getText: () => string } | undefined) => {
        const value = result?.getText()?.trim();
        if (!value || resultRef.current || request !== requestRef.current) return;
        resultRef.current = true; stopCamera(); void submit(value);
      };
      let controls: IScannerControls;
      try {
        controls = await reader.decodeFromConstraints({ audio:false, video:{ facingMode:{ideal:'environment'} } }, element, onResult);
      } catch (error) {
        if (error instanceof Error && ['OverconstrainedError','NotFoundError'].includes(error.name)) {
          controls = await reader.decodeFromConstraints({ audio:false, video:true }, element, onResult);
        } else throw error;
      }
      if (request !== requestRef.current || !mountedRef.current || resultRef.current) { controls.stop(); return; }
      controlsRef.current = controls; setCameraActive(true);
      setStatus('Camera ready. Hold the barcode inside the frame.');
    } catch (error) {
      if (request === requestRef.current) { stopCamera(); setStatus(cameraMessage(error)); }
    } finally { if (request === requestRef.current && mountedRef.current) setLoadingCamera(false); }
  }
  async function scanPhoto(file: File | undefined) {
    if (!file) return;
    setStatus('Reading the barcode from your photo…');
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const url = URL.createObjectURL(file);
      try { const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url); await submit(result.getText()); }
      finally { URL.revokeObjectURL(url); }
    } catch { setStatus('No clear barcode found. Try a sharp photo with good lighting or type the code.'); }
  }
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false; requestRef.current++; controlsRef.current?.stop();
      const video = videoRef.current;
      if (typeof MediaStream !== 'undefined' && video?.srcObject instanceof MediaStream) video.srcObject.getTracks().forEach(track => track.stop());
    };
  }, []);
  return <section className={'barcode-capture' + (compact ? ' barcode-capture-compact' : '')} aria-label={label}>
    <div className="barcode-capture-controls">
      <label className="barcode-capture-input">
        <Barcode size={17}/>
        <input value={code} onChange={event => setCode(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void submit(); } }}
          placeholder="Scan or type barcode / SKU" aria-label="Barcode, SKU or product code" autoComplete="off"/>
        <button type="button" className="barcode-capture-submit" onClick={() => void submit()}><Search size={15}/><span>{autoResolve ? 'Find' : 'Use code'}</span></button>
      </label>
      <button type="button" className="button button-secondary button-small" disabled={cameraActive||loadingCamera} onClick={() => void startCamera()}>
        <Camera size={15}/>{loadingCamera ? 'Opening…' : 'Camera'}
      </button>
      {cameraActive&&<button type="button" className="button button-secondary button-small" onClick={stopCamera}><Square size={13}/> Stop</button>}
      <label className="button button-secondary button-small" style={{cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6}}>
        <ImageUp size={15}/> Photo
        <input type="file" accept="image/*" capture="environment" style={{position:'absolute',width:1,height:1,opacity:0}} aria-label="Take or choose a barcode photo"
          onChange={event=>{void scanPhoto(event.target.files?.[0]);event.target.value='';}}/>
      </label>
    </div>
    <div className={'barcode-camera-frame '+(cameraActive||loadingCamera?'barcode-camera-frame-active':'barcode-camera-frame-idle')} aria-hidden={!cameraActive}>
      <video ref={videoRef} muted playsInline autoPlay aria-label="Live barcode camera preview"/>
      {cameraActive&&<span className="barcode-camera-reticle"/>}
    </div>
    {status&&<div className="barcode-capture-status" role="status"><Check size={14}/>{status}</div>}
  </section>;
}

