import { PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, FileUp, ImagePlus, Link, LoaderCircle, Minus, Plus, ScanText, Trash2, X } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import { api } from '../api';
import { recognizeChinese, terminateOcr } from '../ocr';
import { ImportQuestionPreview } from './ImportQuestionPreview';
import { PaperSourceFields } from './PaperSourceFields';
import { insertSymbolAtCursor, SymbolToolbar } from './SymbolToolbar';
import { Paper } from '../types';
import { nextQuestionNumbers, QuestionNumberFields } from './QuestionNumberFields';
import { insertImageReferenceAtCursor, removeImageReferences } from '../image-reference';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
type Rect = { x: number; y: number; width: number; height: number };
type PdfDoc = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;

const QUESTION_TYPES = ['选择题', '填空题', '判断题', '计算题', '解答题', '证明题', '应用题', '阅读理解', '完形填空', '作文', '实验探究', '其他'];

export function PdfImport({ onClose, onSaved, papers, scope, onPaperCreated }: { onClose: () => void; onSaved: () => void; papers: Paper[]; scope: 'PERSONAL' | 'CLASSROOM'; onPaperCreated: (paper: Paper) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [subject, setSubject] = useState('数学');
  const [questionType, setQuestionType] = useState('');
  const [grade, setGrade] = useState('');
  const [paperTitle, setPaperTitle] = useState('');
  const [paperId, setPaperId] = useState('');
  const [majorNumber, setMajorNumber] = useState('');
  const [minorNumber, setMinorNumber] = useState('');
  const [content, setContent] = useState('');
  const [answer, setAnswer] = useState('');
  const [explanation, setExplanation] = useState('');
  const [tags, setTags] = useState('');
  const [mode, setMode] = useState<'question' | 'image'>('question');
  const [selection, setSelection] = useState<Rect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [previewImages, setPreviewImages] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const previewImageUrls = useMemo(() => previewImages.map((image) => URL.createObjectURL(image)), [previewImages]);
  useEffect(() => () => previewImageUrls.forEach((url) => URL.revokeObjectURL(url)), [previewImageUrls]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftTextRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const explanationRef = useRef<HTMLTextAreaElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<any>(null);
  const viewportRef = useRef<any>(null);
  useEffect(() => () => { void terminateOcr(); }, []);

  useEffect(() => {
    let cancelled = false;
    async function renderPage() {
      if (!doc || !canvasRef.current) return;
      setLoading(true);
      try {
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const outputScale = Math.max(1, window.devicePixelRatio || 1);
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        viewportRef.current = viewport;
        pageRef.current = page;
        await page.render({ canvas, canvasContext: context, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] }).promise;
        if (!cancelled) setSelection(null);
      } catch (e) { if (!cancelled) setError((e as Error).message); }
      finally { if (!cancelled) setLoading(false); }
    }
    renderPage();
    return () => { cancelled = true; };
  }, [doc, pageNumber, scale]);

  const loadFile = async (next: File) => {
    setError(''); setLoading(true); setFile(next); if (!paperId) setPaperTitle(next.name.replace(/\.pdf$/i, ''));
    try {
      const bytes = new Uint8Array(await next.arrayBuffer());
      const loaded = await pdfjs.getDocument({ data: bytes }).promise;
    setDoc(loaded); setPageNumber(1); setContent(''); setMajorNumber(''); setMinorNumber(''); setPreviewImages([]);
    } catch (e) { setError(`无法读取 PDF：${(e as Error).message}`); setDoc(null); }
    finally { setLoading(false); }
  };

  const relativePoint = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = pageWrapRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return { x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)), y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)) };
  };

  const insertDraftImage = (index: number) => insertImageReferenceAtCursor(draftTextRef.current, content, index, setContent);

  const startSelection = (event: PointerEvent<HTMLDivElement>) => {
    if (!doc) return;
    event.preventDefault();
    const point = relativePoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
    setDragStart(point);
  };

  const moveSelection = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const point = relativePoint(event);
    if (!point) return;
    setSelection({ x: Math.min(point.x, dragStart.x), y: Math.min(point.y, dragStart.y), width: Math.abs(point.x - dragStart.x), height: Math.abs(point.y - dragStart.y) });
  };

  const stopSelection = () => setDragStart(null);

  const extractText = async () => {
    if (!selection || !pageRef.current || !viewportRef.current) { setError('先在页面上框选一道题的范围'); return; }
    setError('');
    const textContent = await pageRef.current.getTextContent();
    const items = (textContent.items as any[]).filter((item) => typeof item.str === 'string' && item.str.trim()).map((item) => {
      const [x, y] = viewportRef.current.convertToViewportPoint(item.transform[4], item.transform[5]);
      const height = Math.max(item.height * scale, 8);
      const box = { x, y: y - height, width: item.width * scale, height };
      const overlap = box.x < selection.x + selection.width && box.x + box.width > selection.x && box.y < selection.y + selection.height && box.y + box.height > selection.y;
      return { ...item, box, overlap };
    }).filter((item: any) => item.overlap).sort((a: any, b: any) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
    const lines: { y: number; bits: any[] }[] = [];
    for (const item of items) {
      const midY = item.box.y + item.box.height / 2;
      let line = lines.find((candidate) => Math.abs(candidate.y - midY) < Math.max(5, item.box.height * 0.4));
      if (!line) { line = { y: midY, bits: [] }; lines.push(line); }
      line.bits.push(item);
    }
    const extracted = lines.sort((a, b) => a.y - b.y).map((line) => {
      line.bits.sort((a, b) => a.box.x - b.box.x);
      return line.bits.reduce((result, item) => {
        if (!result) return item.str;
        const last = result.slice(-1);
        const first = item.str.slice(0, 1);
        const needsSpace = /[A-Za-z0-9]$/.test(last) && /^[A-Za-z0-9]/.test(first);
        return result + (needsSpace ? ' ' : '') + item.str;
      }, '');
    }).filter(Boolean).join('\n');
    setMode('question');
    if (extracted) {
      setContent(extracted); setNotice('文字已提取到编辑区，请检查公式、空格和换行后再保存。'); return;
    }
    setOcrBusy(true); setOcrProgress(''); setNotice('没有找到文字层，正在对选区尝试 OCR…');
    try {
      const recognized = await recognizeChinese(makeSelectionCanvas(), setOcrProgress);
      setContent(recognized);
      setNotice(recognized ? 'OCR 结果已放入编辑区，请核对公式、符号和换行。' : '没有识别出文字。可手动录入，或将选区作为题图保存。');
    } catch (e) { setError(`OCR 未能完成：${(e as Error).message}。可以手动录入题干。`); }
    finally { setOcrBusy(false); setOcrProgress(''); }
  };

  const makeSelectionCanvas = () => {
    if (!selection || !canvasRef.current) throw new Error('先在页面上框选图片范围');
    const canvas = canvasRef.current;
    const ratio = canvas.width / (Number(canvas.style.width.replace('px', '')) || canvas.clientWidth);
    const sx = Math.max(0, Math.round(selection.x * ratio));
    const sy = Math.max(0, Math.round(selection.y * ratio));
    const sw = Math.max(1, Math.min(canvas.width - sx, Math.round(selection.width * ratio)));
    const sh = Math.max(1, Math.min(canvas.height - sy, Math.round(selection.height * ratio)));
    const output = document.createElement('canvas'); output.width = sw; output.height = sh;
    const context = output.getContext('2d');
    if (!context) throw new Error('无法读取页面图像');
    context.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return output;
  };

  const cropSelection = async () => {
    if (!selection || !canvasRef.current) { setError('先在页面上框选图片范围'); return; }
    const output = makeSelectionCanvas();
    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'));
    if (!blob) { setError('无法生成题图'); return; }
    setPreviewImages((images) => [...images, new File([blob], `题图-第${pageNumber}页-${images.length + 1}.png`, { type: 'image/png' })]);
    setMode('image'); setNotice('题图已裁下。可以继续框选其他插图，也可以直接保存题目。');
  };

  const saveQuestion = async () => {
    if (!file || !doc) { setError('请先选择一份 PDF'); return; }
    if (!content.trim() && previewImages.length === 0) { setError('请提取或录入题目文字，或先添加题图'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      let savedPaperId = paperId;
      if (!savedPaperId) {
        if (!paperTitle.trim()) throw new Error('请填写试卷名称');
        const paper = await api<Paper>('/papers', { method: 'POST', body: JSON.stringify({ subject, grade, title: paperTitle, scope }) });
        savedPaperId = paper.id; setPaperId(paper.id); onPaperCreated(paper);
      }
      const question = await api<{ id: string }>('/questions', { method: 'POST', body: JSON.stringify({
        subject, questionType: questionType || null, grade, content, answer, explanation,
        tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
        paperId: savedPaperId, pageNumber, majorNumber: majorNumber ? Number(majorNumber) : null, minorNumber: minorNumber ? Number(minorNumber) : null, sourceTitle: paperTitle,
        allowImageOnly: !content.trim(),
      }) });
      for (const image of previewImages) {
        const form = new FormData(); form.append('file', image);
        await api(`/questions/${question.id}/images`, { method: 'POST', body: form });
      }
      setNotice('题目已保存。可以继续在当前试卷中选下一题。');
      const nextNumbers = nextQuestionNumbers(majorNumber, minorNumber);
      setContent(''); setAnswer(''); setExplanation(''); setTags(''); setMajorNumber(nextNumbers.majorNumber); setMinorNumber(nextNumbers.minorNumber); setPreviewImages([]); setSelection(null);
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  return <div className="import-page">
    <header className="page-topbar"><button className="back-button" onClick={onClose}><ArrowLeft size={18} />返回题库</button><div><span className="eyebrow">PDF WORKSPACE</span><h1>从试卷拆题</h1></div><div className="topbar-spacer" /></header>
    {!file ? <div className="import-empty">
      <div className="import-intro"><div className="import-icon"><FileUp size={26} /></div><span className="eyebrow">PAPER IMPORT</span><h2>导入一份试卷 PDF</h2><p>框选题目区域后提取文字；遇到几何图或插图，再单独框选裁下。</p></div>
      <label className="dropzone"><input type="file" accept="application/pdf,.pdf" onChange={(event) => event.target.files?.[0] && loadFile(event.target.files[0])} hidden />{loading ? <LoaderCircle className="spin" /> : <FileUp size={30} />}<strong>选择 PDF 文件</strong><span>最大 60 MB · 原卷只在本机浏览器处理，不上传到服务器</span></label>
      {error && <div className="form-error">{error}</div>}
    </div> : <>
      <div className="import-meta-bar">
        <PaperSourceFields papers={papers} paperId={paperId} setPaperId={setPaperId} title={paperTitle} setTitle={setPaperTitle} subject={subject} setSubject={setSubject} grade={grade} setGrade={setGrade} />
        <label><span>题型（本题）</span><select value={questionType} onChange={(e) => setQuestionType(e.target.value)}><option value="">未分类</option>{QUESTION_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
        <button className="button button-outline button-small" onClick={() => { setFile(null); setDoc(null); setContent(''); setPreviewImages([]); }}><X size={15} />换一份 PDF</button>
      </div>
      <div className="import-workspace">
        <section className="pdf-panel">
          <div className="pdf-toolbar">
            <div className="page-controls"><button className="icon-button" disabled={pageNumber <= 1} onClick={() => setPageNumber((n) => Math.max(1, n - 1))}><ArrowLeft size={17} /></button><span>{pageNumber}<i>/</i>{doc?.numPages ?? '—'}</span><button className="icon-button" disabled={!doc || pageNumber >= doc.numPages} onClick={() => setPageNumber((n) => Math.min(doc?.numPages ?? n, n + 1))}><ArrowRight size={17} /></button></div>
            <div className="zoom-controls"><button className="icon-button" onClick={() => setScale((n) => Math.max(.65, +(n - .1).toFixed(2)))}><Minus size={16} /></button><span>{Math.round(scale * 100)}%</span><button className="icon-button" onClick={() => setScale((n) => Math.min(2, +(n + .1).toFixed(2)))}><Plus size={16} /></button></div>
          </div>
          <div className="pdf-canvas-scroll"><div className="pdf-page-wrap" ref={pageWrapRef} style={{ width: canvasRef.current?.style.width, height: canvasRef.current?.style.height }} onPointerDown={startSelection} onPointerMove={moveSelection} onPointerUp={stopSelection} onPointerCancel={stopSelection}>
            <canvas ref={canvasRef} />
            {selection && <div className={`selection-rect ${mode === 'image' ? 'image-selection' : ''}`} style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }} />}
            {loading && <div className="canvas-loading"><LoaderCircle className="spin" />正在渲染页面…</div>}
          </div></div>
          <div className="selection-instructions"><span className={`mode-dot ${mode}`} />{mode === 'question' ? '拖动框选题目文字区域' : '拖动框选图表或插图区域'}</div>
          <div className="pdf-selection-actions"><button className={`button ${mode === 'question' ? 'button-primary' : 'button-outline'}`} onClick={() => { setMode('question'); setSelection(null); }}><ScanText size={16} />框选题目</button><button className={`button ${mode === 'image' ? 'button-primary' : 'button-outline'}`} onClick={() => { setMode('image'); setSelection(null); }}><ImagePlus size={16} />框选题图</button>{mode === 'question' ? <button className="button button-accent" onClick={extractText} disabled={ocrBusy}><ScanText size={16} />{ocrBusy ? ocrProgress || '正在识别…' : '提取文字 / OCR'}</button> : <button className="button button-accent" onClick={cropSelection}><ImagePlus size={16} />加入题图</button>}</div>
        </section>
        <section className="question-draft-panel">
          <div className="draft-heading"><div><span className="eyebrow">NEW QUESTION</span><h2>题目草稿</h2></div><span className="draft-page">第 {pageNumber} 页</span></div>
          <QuestionNumberFields majorNumber={majorNumber} minorNumber={minorNumber} onMajorNumberChange={setMajorNumber} onMinorNumberChange={setMinorNumber} />
          <label className="field-label">题干文字</label><SymbolToolbar subject={subject} onInsert={(source, cursor) => insertSymbolAtCursor(draftTextRef.current, content, setContent, source, cursor)} /><textarea ref={draftTextRef} className="draft-textarea" value={content} onChange={(e) => setContent(e.target.value)} placeholder="框选题目后点“提取文字”，也可以在这里直接补录和修改。" rows={9} />
          <label className="field-label">知识点标签<input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="逗号分隔，例如：二次函数，图像" /></label>
          <label className="field-label">答案</label><SymbolToolbar subject={subject} onInsert={(source, cursor) => insertSymbolAtCursor(answerRef.current, answer, setAnswer, source, cursor)} /><textarea ref={answerRef} className="draft-textarea" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="练习时默认隐藏" rows={3} />
          <label className="field-label">解析</label><SymbolToolbar subject={subject} onInsert={(source, cursor) => insertSymbolAtCursor(explanationRef.current, explanation, setExplanation, source, cursor)} /><textarea ref={explanationRef} className="draft-textarea" value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="可选" rows={4} />
          <div className="draft-images"><div className="section-heading"><h3>题图</h3><span>{previewImages.length} 张</span></div>
            {!previewImages.length ? <p className="muted small-muted">纯文字题可不添加图片。可多次框选题图，并在题干光标处插入引用。</p> : <div className="draft-image-strip">{previewImages.map((image, index) => <div className="draft-image-thumb" key={index}><img src={previewImageUrls[index]} alt={image.name} /><button title="删除题图" onClick={() => { setPreviewImages((items) => items.filter((_, i) => i !== index)); setContent((current) => removeImageReferences(current, index + 1)); }}><Trash2 size={14} /></button><button className="insert-image-reference" onClick={() => insertDraftImage(index + 1)}><Link size={13} />插入到题干</button><span>{image.name}</span></div>)}</div>}
          </div>
          <div className="import-preview-section"><div className="section-heading"><div><span className="eyebrow">LIVE PREVIEW</span><h3>排版效果</h3></div></div><ImportQuestionPreview subject={subject} questionType={questionType} content={content} answer={answer} explanation={explanation} tags={tags} images={previewImageUrls.map((src, index) => ({ src, alt: previewImages[index]?.name }))} /></div>
          {notice && <div className="notice-message">{notice}</div>}
          {error && <div className="form-error">{error}</div>}
          <button className="button button-primary save-draft-button" disabled={saving} onClick={saveQuestion}>{saving ? <LoaderCircle className="spin" /> : <FileUp size={17} />}{saving ? '保存中…' : '保存这道题'}</button>
          <p className="draft-footnote">保存后可继续在当前 PDF 中选下一题；服务器只保存题目和题图，不保存原卷。</p>
        </section>
      </div>
    </>}
  </div>;
}
