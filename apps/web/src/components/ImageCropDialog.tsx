import { useCallback, useState } from 'react';
import Cropper, { Area, Point } from 'react-easy-crop';
import { Check, LoaderCircle, RotateCcw, RotateCw, X } from 'lucide-react';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function cropImage(src: string, area: Area, rotation: number, name: string) {
  const image = await loadImage(src);
  const radians = (rotation * Math.PI) / 180;
  const rotated = document.createElement('canvas');
  const bounding = {
    width: Math.abs(image.width * Math.cos(radians)) + Math.abs(image.height * Math.sin(radians)),
    height: Math.abs(image.width * Math.sin(radians)) + Math.abs(image.height * Math.cos(radians)),
  };
  rotated.width = Math.round(bounding.width); rotated.height = Math.round(bounding.height);
  const context = rotated.getContext('2d');
  if (!context) throw new Error('无法处理图片');
  context.translate(rotated.width / 2, rotated.height / 2);
  context.rotate(radians);
  context.drawImage(image, -image.width / 2, -image.height / 2);
  const result = document.createElement('canvas'); result.width = area.width; result.height = area.height;
  const resultContext = result.getContext('2d');
  if (!resultContext) throw new Error('无法裁剪图片');
  resultContext.drawImage(rotated, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
  const blob = await new Promise<Blob | null>((resolve) => result.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('裁剪图片失败');
  return new File([blob], name.replace(/\.[^.]+$/, '') + '-裁剪.png', { type: 'image/png' });
}

export function ImageCropDialog({ src, name, onClose, onSave }: { src: string; name: string; onClose: () => void; onSave: (file: File) => Promise<void> }) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => setArea(croppedAreaPixels), []);
  const save = async () => {
    if (!area) return;
    setBusy(true); setError('');
    try { await onSave(await cropImage(src, area, rotation, name)); onClose(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop crop-backdrop"><div className="crop-dialog">
    <header className="editor-header"><div><span className="eyebrow">IMAGE EDITOR</span><h2>裁剪与调整图片</h2></div><button className="icon-button" onClick={onClose}><X /></button></header>
    <div className="crop-stage"><Cropper image={src} crop={crop} zoom={zoom} rotation={rotation} aspect={undefined} onCropChange={setCrop} onZoomChange={setZoom} onRotationChange={setRotation} onCropComplete={onCropComplete} /></div>
    <div className="crop-controls"><button className="icon-button" aria-label="向左旋转" onClick={() => setRotation((n) => n - 90)}><RotateCcw size={18} /></button><button className="icon-button" aria-label="向右旋转" onClick={() => setRotation((n) => n + 90)}><RotateCw size={18} /></button><label>缩放<input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label></div>
    {error && <div className="form-error crop-error">{error}</div>}
    <footer className="editor-footer"><button className="button button-outline" onClick={onClose}>取消</button><button className="button button-primary" onClick={save} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{busy ? '处理中…' : '应用裁剪并替换图片'}</button></footer>
  </div></div>;
}
