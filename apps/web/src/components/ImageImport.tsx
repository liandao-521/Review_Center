import { PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FileUp, ImagePlus, Link, LoaderCircle, ScanText, X } from 'lucide-react';
import { api } from '../api';
import { recognizeChinese, terminateOcr } from '../ocr';
import { ImportQuestionPreview } from './ImportQuestionPreview';
import { insertImageReferenceAtCursor, removeImageReferences } from '../image-reference';
import { PaperSourceFields } from './PaperSourceFields';
import { insertSymbolAtCursor, SymbolToolbar } from './SymbolToolbar';
import { Paper } from '../types';
import { nextQuestionNumbers, QuestionNumberFields } from './QuestionNumberFields';

type Rect = { x: number; y: number; width: number; height: number };
const QUESTION_TYPES = ['选择题', '填空题', '判断题', '计算题', '解答题', '证明题', '应用题', '阅读理解', '完形填空', '作文', '实验探究', '其他'];

async function normalizeImage(file: File) {
  if (!/\.(heic|heif)$/i.test(file.name) && !['image/heic', 'image/heif'].includes(file.type)) return file;
  const convert = (await import('heic2any')).default;
  const result = await convert({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  const blob = Array.isArray(result) ? result[0] : result;
  return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
}

export function ImageImport({ onClose, onSaved, papers, scope, onPaperCreated }: { onClose: () => void; onSaved: () => void; papers: Paper[]; scope: 'PERSONAL' | 'CLASSROOM'; onPaperCreated: (paper: Paper) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [subject, setSubject] = useState('数学');
  const [questionType, setQuestionType] = useState('');
  const [grade, setGrade] = useState('');
  const [title, setTitle] = useState('');
  const [paperId, setPaperId] = useState('');
  const [majorNumber, setMajorNumber] = useState('');
  const [minorNumber, setMinorNumber] = useState('');
  const [content, setContent] = useState('');
  const [answer, setAnswer] = useState('');
  const [explanation, setExplanation] = useState('');
  const [tags, setTags] = useState('');
  const [selection, setSelection] = useState<Rect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [previewImages, setPreviewImages] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftTextRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const explanationRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const previewUrls = useMemo(() => previewImages.map((item) => URL.createObjectURL(item)), [previewImages]);
  useEffect(() => () => previewUrls.forEach(URL.revokeObjectURL), [previewUrls]);
  useEffect(() => () => { void terminateOcr(); }, []);
  const insertDraftImage = (index: number) => insertImageReferenceAtCursor(draftTextRef.current, content, index, setContent);

  const load = async (picked?: File) => {
    if (!picked) return;
    setError(''); setNotice(''); setBusy(true); setImageReady(false);
    try {
      const normalized = await normalizeImage(picked);
      setFile(normalized); if (!paperId) setTitle(normalized.name.replace(/\.[^.]+$/, ''));
      setContent(''); setAnswer(''); setExplanation(''); setTags(''); setMajorNumber(''); setMinorNumber(''); setPreviewImages([]); setSelection(null);
    } catch (e) { setError(`无法读取此图片：${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!file || !canvasRef.current) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled || !canvasRef.current) return;
      const maxSide = 1800;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const displayScale = Math.min(1, 760 / image.naturalWidth);
      const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const canvas = canvasRef.current;
      canvas.width = Math.round(image.naturalWidth * scale * ratio);
      canvas.height = Math.round(image.naturalHeight * scale * ratio);
      canvas.style.width = `${image.naturalWidth * displayScale}px`;
      canvas.style.height = `${image.naturalHeight * displayScale}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.drawImage(image, 0, 0, canvas.width, canvas.height); setImageReady(true); }
    };
    image.onerror = () => setError('浏览器无法解码此图片，请另存为 JPG 或 PNG 后重试。');
    image.src = URL.createObjectURL(file);
    return () => { cancelled = true; URL.revokeObjectURL(image.src); };
  }, [file]);

  const point = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = wrapRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return { x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)), y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)) };
  };
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault(); const p = point(event); if (!p) return;
    event.currentTarget.setPointerCapture(event.pointerId); setSelection({ x: p.x, y: p.y, width: 0, height: 0 }); setDragStart(p);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return; const p = point(event); if (!p) return;
    setSelection({ x: Math.min(p.x, dragStart.x), y: Math.min(p.y, dragStart.y), width: Math.abs(p.x - dragStart.x), height: Math.abs(p.y - dragStart.y) });
  };
  const cropCanvas = () => {
    if (!selection || !canvasRef.current) throw new Error('请先框选区域');
    const canvas = canvasRef.current;
    const sxRatio = canvas.width / (Number.parseFloat(canvas.style.width) || canvas.clientWidth);
    const syRatio = canvas.height / (Number.parseFloat(canvas.style.height) || canvas.clientHeight);
    const sx = Math.max(0, Math.round(selection.x * sxRatio));
    const sy = Math.max(0, Math.round(selection.y * syRatio));
    const sw = Math.min(canvas.width - sx, Math.max(1, Math.round(selection.width * sxRatio)));
    const sh = Math.min(canvas.height - sy, Math.max(1, Math.round(selection.height * syRatio)));
    const crop = document.createElement('canvas'); crop.width = sw; crop.height = sh;
    const ctx = crop.getContext('2d'); if (!ctx) throw new Error('无法读取图片区域');
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return crop;
  };
  const recognize = async () => {
    setError(''); setNotice(''); setOcrBusy(true); setOcrProgress('正在启动中文 OCR…');
    try {
      const crop = cropCanvas();
      const recognized = await recognizeChinese(crop, setOcrProgress);
      if (recognized) { setContent((old) => old ? `${old}\n${recognized}` : recognized); setNotice('OCR 结果已放入题干，请核对公式、选项和换行。'); }
      else setNotice('这块区域没有识别出文字。可以手动录入，或调整选区后重试。');
    } catch (e) { setError(`OCR 失败：${(e as Error).message}。可直接在题干框手动录入。`); }
    finally { setOcrBusy(false); setOcrProgress(''); }
  };
  const addCrop = async () => {
    setError('');
    try {
      const crop = cropCanvas();
      const blob = await new Promise<Blob | null>((resolve) => crop.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('无法生成题图');
      setPreviewImages((items) => [...items, new File([blob], `题图-${items.length + 1}.png`, { type: 'image/png' })]);
      setNotice('已裁下题图，可继续框选其他区域。');
    } catch (e) { setError((e as Error).message); }
  };
  const save = async () => {
    if (!file || !content.trim() && previewImages.length === 0) { setError('请填写题干或添加题图'); return; }
    setSaving(true); setError('');
    try {
      let savedPaperId = paperId;
      if (!savedPaperId) {
        if (!title.trim()) throw new Error('请填写试卷名称');
        const paper = await api<Paper>('/papers', { method: 'POST', body: JSON.stringify({ subject, grade, title, scope }) }); savedPaperId = paper.id; setPaperId(paper.id); onPaperCreated(paper);
      }
      const question = await api<{ id: string }>('/questions', { method: 'POST', body: JSON.stringify({
        subject, questionType: questionType || null, grade, content, answer, explanation,
        tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean), paperId: savedPaperId,
        pageNumber: 1, majorNumber: majorNumber ? Number(majorNumber) : null, minorNumber: minorNumber ? Number(minorNumber) : null, sourceTitle: title, allowImageOnly: !content.trim(),
      }) });
      for (const image of previewImages) { const form = new FormData(); form.append('file', image); await api(`/questions/${question.id}/images`, { method: 'POST', body: form }); }
      const nextNumbers = nextQuestionNumbers(majorNumber, minorNumber);
      setContent(''); setAnswer(''); setExplanation(''); setTags(''); setMajorNumber(nextNumbers.majorNumber); setMinorNumber(nextNumbers.minorNumber); setPreviewImages([]); setSelection(null); setNotice('题目已保存，可继续从这张图片拆下一题。'); onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  return <div className="import-page">
    <header className="page-topbar"><button className="back-button" onClick={onClose}><ArrowLeft size={18} />返回题库</button><div><span className="eyebrow">IMAGE WORKSPACE</span><h1>从图片拆题</h1></div><div className="topbar-spacer" /></header>
    {!file ? <div className="import-empty"><div className="import-intro"><div className="import-icon"><ImagePlus size={26} /></div><span className="eyebrow">IMAGE IMPORT</span><h2>导入整页扫描或拍照</h2><p>框选题目区域后进行中文 OCR，也可以单独裁出几何图或插图。</p></div><label className="dropzone"><input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" onChange={(event) => void load(event.target.files?.[0])} hidden />{busy ? <LoaderCircle className="spin" /> : <FileUp size={30} />}<strong>选择图片</strong><span>支持 PNG、JPG、WebP 和 iPhone HEIC</span></label>{error && <div className="form-error">{error}</div>}</div> : <>
      <div className="import-meta-bar"><PaperSourceFields papers={papers} paperId={paperId} setPaperId={setPaperId} title={title} setTitle={setTitle} subject={subject} setSubject={setSubject} grade={grade} setGrade={setGrade} /><label><span>本题题型</span><select value={questionType} onChange={(e) => setQuestionType(e.target.value)}><option value="">未分类</option>{QUESTION_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label><button className="button button-outline button-small" onClick={() => { setFile(null); setContent(''); setPreviewImages([]); }}><X size={15} />换一张图片</button></div>
      <div className="import-workspace"><section className="pdf-panel"><div className="pdf-toolbar"><span className="small-muted">整页图片 · 拖动框选题目区域</span><button className="button button-outline button-small" onClick={() => { const input = document.getElementById('replace-import-image') as HTMLInputElement | null; input?.click(); }}>更换文件<input id="replace-import-image" type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => void load(e.target.files?.[0])} /></button></div><div className="pdf-canvas-scroll"><div className="pdf-page-wrap" ref={wrapRef} style={{ width: canvasRef.current?.style.width, height: canvasRef.current?.style.height }} onPointerDown={begin} onPointerMove={move} onPointerUp={() => setDragStart(null)} onPointerCancel={() => setDragStart(null)}><canvas ref={canvasRef} />{selection && <div className="selection-rect" style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }} />}{!imageReady && <div className="canvas-loading"><LoaderCircle className="spin" />正在加载图片…</div>}</div></div><div className="selection-instructions"><span className="mode-dot" />框选一题的文字区域，OCR 后可手动修订</div><div className="pdf-selection-actions"><button className="button button-accent" onClick={() => void recognize()} disabled={ocrBusy || !imageReady || !selection}>{ocrBusy ? <LoaderCircle className="spin" /> : <ScanText size={16} />}{ocrBusy ? ocrProgress || '正在识别…' : '识别选中文字'}</button><button className="button button-outline" onClick={() => void addCrop()} disabled={!imageReady || !selection}><ImagePlus size={16} />把选区加入题图</button></div></section>
      <section className="question-draft-panel"><div className="draft-heading"><div><span className="eyebrow">NEW QUESTION</span><h2>题目草稿</h2></div><span className="draft-page">图片来源</span></div><QuestionNumberFields majorNumber={majorNumber} minorNumber={minorNumber} onMajorNumberChange={setMajorNumber} onMinorNumberChange={setMinorNumber} /><label className="field-label">题干文字</label><SymbolToolbar subject={subject} onInsert={(source, cursor) => insertSymbolAtCursor(draftTextRef.current, content, setContent, source, cursor)} /><textarea ref={draftTextRef} className="draft-textarea" value={content} onChange={(e) => setContent(e.target.value)} placeholder="框选题干后进行 OCR；也可以在此手动补录和修改。" rows={8} /><label className="field-label">知识点标签<input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="逗号分隔，例如：二次函数，图像" /></label><label className="field-label">答案</label><SymbolToolbar subject={subject} onInsert={(source, cursor) => insertSymbolAtCursor(answerRef.current, answer, setAnswer, source, cursor)} /><textarea ref={answerRef} className="draft-textarea" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="练习时默认隐藏" rows={3} /><label className="field-label">解析</label><SymbolToolbar subject={subject} onInsert={(source, cursor) => insertSymbolAtCursor(explanationRef.current, explanation, setExplanation, source, cursor)} /><textarea ref={explanationRef} className="draft-textarea" value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="可选" rows={3} /><div className="draft-images"><div className="section-heading"><h3>题目插图</h3><span>{previewImages.length} 张</span></div><div className="draft-image-strip">{previewImages.map((image, i) => <div className="draft-image-thumb" key={`${image.name}-${i}`}><img src={previewUrls[i]} alt={image.name} /><button onClick={() => { setPreviewImages((items) => items.filter((_, index) => index !== i)); setContent((current) => removeImageReferences(current, i + 1)); }}><X size={13} /></button><button className="insert-image-reference" onClick={() => insertDraftImage(i + 1)}><Link size={13} />插入到题干</button></div>)}</div></div><div className="import-preview-section"><div className="section-heading"><div><span className="eyebrow">LIVE PREVIEW</span><h3>排版效果</h3></div></div><ImportQuestionPreview subject={subject} questionType={questionType} content={content} answer={answer} explanation={explanation} tags={tags} images={previewUrls.map((src, index) => ({ src, alt: previewImages[index]?.name }))} /></div>{error && <div className="form-error">{error}</div>}{notice && <div className="form-notice">{notice}</div>}<button className="button button-primary save-draft-button" onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <FileUp size={16} />}{saving ? '正在保存…' : '保存题目'}</button><p className="draft-footnote">识别过程在当前浏览器中完成。首次使用需要下载 OCR 识别数据；请核对文字、公式及选项后保存。</p></section></div>
    </>}
  </div>;
}
