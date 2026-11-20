import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crop, ImagePlus, Link, LoaderCircle, Plus, RotateCcw, RotateCw, Trash2, Upload, X } from 'lucide-react';
import { api, imageUrl } from '../api';
import { Paper, Question, QuestionImage } from '../types';
import { Markdown } from './Markdown';
import { ImageCropDialog } from './ImageCropDialog';
import { QuestionNumberFields } from './QuestionNumberFields';
import { insertSymbolAtCursor, SymbolToolbar } from './SymbolToolbar';
import { insertImageReferenceAtCursor, removeImageReferences, unreferencedImageIndexes } from '../image-reference';

const SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '道德与法治', '其他'];
const QUESTION_TYPES = ['选择题', '填空题', '判断题', '计算题', '解答题', '证明题', '应用题', '阅读理解', '完形填空', '作文', '实验探究', '其他'];

export function QuestionEditor({ question, initial, papers, scope, canCreatePaper, onPaperCreated, onClose, onSaved }: {
  question?: Question | null;
  initial?: Partial<Question>;
  papers: Paper[];
  scope: 'PERSONAL' | 'CLASSROOM';
  canCreatePaper: boolean;
  onPaperCreated: (paper: Paper) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subject, setSubject] = useState(question?.subject ?? initial?.subject ?? '数学');
  const [questionType, setQuestionType] = useState(question?.questionType ?? initial?.questionType ?? '');
  const [grade, setGrade] = useState(question?.grade ?? initial?.grade ?? '');
  const [content, setContent] = useState(question?.content ?? initial?.content ?? '');
  const [answer, setAnswer] = useState(question?.answer ?? initial?.answer ?? '');
  const [explanation, setExplanation] = useState(question?.explanation ?? initial?.explanation ?? '');
  const [tags, setTags] = useState((question?.tags ?? initial?.tags ?? []).join(', '));
  const [pageNumber, setPageNumber] = useState(question?.pageNumber ?? initial?.pageNumber ?? '');
  const [majorNumber, setMajorNumber] = useState(question?.majorNumber == null ? '' : String(question.majorNumber));
  const [minorNumber, setMinorNumber] = useState(question?.minorNumber == null ? '' : String(question.minorNumber));
  const [paperId, setPaperId] = useState(question?.paperId ?? initial?.paperId ?? '');
  const [newPaperOpen, setNewPaperOpen] = useState(false);
  const [newPaperTitle, setNewPaperTitle] = useState('');
  const [newPaperSubject, setNewPaperSubject] = useState(subject);
  const [newPaperGrade, setNewPaperGrade] = useState(grade ?? '');
  const [paperBusy, setPaperBusy] = useState(false);
  const [images, setImages] = useState<QuestionImage[]>(question?.images ?? []);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [previewTab, setPreviewTab] = useState<'question' | 'answer' | 'explanation'>('question');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cropTarget, setCropTarget] = useState<QuestionImage | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const explanationRef = useRef<HTMLTextAreaElement>(null);
  const newImageUrls = useMemo(() => newImages.map((file) => URL.createObjectURL(file)), [newImages]);
  const subjectPapers = useMemo(() => papers.filter((paper) => paper.subject === subject), [papers, subject]);
  useEffect(() => () => newImageUrls.forEach((url) => URL.revokeObjectURL(url)), [newImageUrls]);
  useEffect(() => {
    if (paperId && !subjectPapers.some((paper) => paper.id === paperId)) setPaperId('');
  }, [paperId, subjectPapers]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    if (!paperId) { setError('请选择试卷来源'); return; }
    if (!content.trim() && images.length + newImages.length === 0 && question?.content.trim()) { setError('请填写题目内容或添加题图'); return; }
    setBusy(true); setError('');
    try {
      const payload = {
        subject, questionType: questionType || null, grade, content, answer, explanation,
        tags: tags.split(/[,，]/).map((value) => value.trim()).filter(Boolean),
        pageNumber: pageNumber || null, majorNumber: majorNumber ? Number(majorNumber) : null, minorNumber: minorNumber ? Number(minorNumber) : null, paperId,
        allowImageOnly: !content.trim(),
        allowBlank: !content.trim() && images.length + newImages.length === 0 && !question?.content.trim(),
      };
      const saved: Question = question
        ? await api(`/questions/${question.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await api('/questions', { method: 'POST', body: JSON.stringify(payload) });
      for (const file of newImages) {
        const form = new FormData(); form.append('file', file);
        await api(`/questions/${saved.id}/images`, { method: 'POST', body: form });
      }
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const createPaper = async () => {
    if (!newPaperTitle.trim()) { setError('请填写试卷名称'); return; }
    const duplicate = papers.find((paper) => paper.title.trim().toLocaleLowerCase() === newPaperTitle.trim().toLocaleLowerCase());
    if (duplicate) {
      setSubject(duplicate.subject); setGrade(duplicate.grade ?? ''); setPaperId(duplicate.id);
      setNewPaperTitle(''); setNewPaperOpen(false); setError('');
      return;
    }
    setPaperBusy(true); setError('');
    try {
      const paper = await api<Paper>('/papers', { method: 'POST', body: JSON.stringify({ title: newPaperTitle, subject: newPaperSubject, grade: newPaperGrade, scope }) });
      onPaperCreated({ ...paper, questionCount: 0 });
      setPaperId(paper.id); setNewPaperTitle(''); setNewPaperOpen(false);
    } catch (e) { setError((e as Error).message); }
    finally { setPaperBusy(false); }
  };

  const insertImageReference = (index: number) => insertImageReferenceAtCursor(contentRef.current, content, index, setContent);


  const imageAction = async (id: string, action: 'rotate' | 'scale' | 'delete', value?: number) => {
    setError('');
    try {
      if (action === 'delete') {
        await api(`/questions/images/${id}`, { method: 'DELETE' });
        const index = images.findIndex((image) => image.id === id) + 1;
        setImages((current) => current.filter((image) => image.id !== id));
        if (index > 0) setContent((current) => removeImageReferences(current, index));
      } else {
        const image = images.find((item) => item.id === id);
        if (!image) return;
        const data = action === 'rotate' ? { rotation: (image.rotation + (value ?? 90) + 360) % 360 } : { displayScale: value };
        const updated = await api<QuestionImage>(`/questions/images/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
        setImages((current) => current.map((item) => item.id === id ? updated : item));
      }
    } catch (e) { setError((e as Error).message); }
  };

  const saveImageScale = async (imageId: string, displayScale: number) => {
    try {
      const updated = await api<QuestionImage>(`/questions/images/${imageId}`, { method: 'PATCH', body: JSON.stringify({ displayScale }) });
      setImages((current) => current.map((item) => item.id === imageId ? updated : item));
    } catch (e) { setError((e as Error).message); }
  };

  const replaceImage = async (id: string, file?: File) => {
    if (!file) return;
    const form = new FormData(); form.append('file', file);
    try {
      const updated = await api<QuestionImage>(`/questions/images/${id}/replace`, { method: 'POST', body: form });
      setImages((current) => current.map((item) => item.id === id ? updated : item));
    } catch (e) { setError((e as Error).message); }
  };

  const applyCrop = async (image: QuestionImage, file: File) => {
    const form = new FormData(); form.append('file', file);
    const updated = await api<QuestionImage>(`/questions/images/${image.id}/replace`, { method: 'POST', body: form });
    setImages((current) => current.map((item) => item.id === image.id ? updated : item));
  };

  const imageSection = <section className="editor-section">
    <div className="section-heading"><div><span className="eyebrow">FIGURES</span><h3>题目图片</h3></div>
      <label className="button button-small button-outline upload-button"><ImagePlus size={16} />添加图片<input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(event) => setNewImages((items) => [...items, ...Array.from(event.target.files ?? [])])} /></label>
    </div>
    {!images.length && !newImages.length ? <p className="muted">纯文字题可以不添加图片。几何图可以从 PDF 裁剪后加入。</p> : <div className="image-edit-grid">
      {images.map((image) => <div className="image-edit-card" key={image.id}>
        <div className="image-stage"><img src={imageUrl(image.fileName)} alt={image.originalName} style={{ transform: `rotate(${image.rotation}deg) scale(${image.displayScale})` }} /></div>
        <div className="image-toolbar">
          <button className="icon-button" title="向左旋转" onClick={() => imageAction(image.id, 'rotate', -90)}><RotateCcw size={17} /></button>
          <button className="icon-button" title="向右旋转" onClick={() => imageAction(image.id, 'rotate', 90)}><RotateCw size={17} /></button>
          <button className="icon-button" title="裁剪并替换" onClick={() => setCropTarget(image)}><Crop size={17} /></button>
          <label className="icon-button replace-control" title="替换为清晰图片"><Upload size={17} /><input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => replaceImage(image.id, event.target.files?.[0])} /></label>
        <button className="icon-button danger-icon" title="删除图片并移除题干引用" onClick={() => imageAction(image.id, 'delete')}><Trash2 size={17} /></button>
        </div>
        <button className="insert-image-reference" onClick={() => insertImageReference(images.findIndex((item) => item.id === image.id) + 1)}><Link size={13} />插入到题干</button>
        <label className="scale-control"><span>显示大小</span><input type="range" min="0.5" max="1.5" step="0.05" value={image.displayScale} onChange={(event) => { const value = Number(event.target.value); setImages((current) => current.map((item) => item.id === image.id ? { ...item, displayScale: value } : item)); }} onPointerUp={(event) => saveImageScale(image.id, Number(event.currentTarget.value))} onKeyUp={(event) => saveImageScale(image.id, Number(event.currentTarget.value))} onBlur={(event) => saveImageScale(image.id, Number(event.currentTarget.value))} /></label>
        <div className="image-filename" title={image.originalName}>{image.originalName}</div>
      </div>)}
      {newImages.map((file, index) => <div className="image-edit-card new-image-card" key={`${file.name}-${index}`}>
        <div className="image-stage"><img src={newImageUrls[index]} alt={file.name} /></div>
        <button className="remove-new-image" onClick={() => { const number = images.length + index + 1; setNewImages((items) => items.filter((_, i) => i !== index)); setContent((current) => removeImageReferences(current, number)); }}><X size={14} />移除</button>
        <button className="insert-image-reference" onClick={() => insertImageReference(images.length + index + 1)}><Link size={13} />插入到题干</button>
        <div className="image-filename">保存时上传</div>
      </div>)}
    </div>}
  </section>;

  return <>
  <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="editor-dialog" role="dialog" aria-modal="true" aria-label={question ? '编辑题目' : '新建题目'}>
      <header className="editor-header"><div><span className="eyebrow">QUESTION EDITOR</span><h2>{question ? '编辑题目' : '新建题目'}</h2></div><button className="icon-button" onClick={onClose}><X /></button></header>
      <div className="editor-body">
        <div className="editor-form">
          <section className="editor-section metadata-grid">
            <label>科目<select value={subject} onChange={(e) => setSubject(e.target.value)}>{SUBJECTS.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>题型<select value={questionType} onChange={(e) => setQuestionType(e.target.value)}><option value="">未分类</option>{QUESTION_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>年级<input value={grade ?? ''} onChange={(e) => setGrade(e.target.value)} placeholder="例如：初二" /></label>
            <label className="span-2">知识点标签<input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="用逗号分隔，例如：二次函数，图像性质" /></label>
          </section>
          <section className="editor-section source-grid">
            <div className="source-picker"><label>所属试卷<select value={paperId} onChange={(e) => setPaperId(e.target.value)}><option value="">{subjectPapers.length ? '请选择所属试卷' : '该科目暂无试卷'}</option>{subjectPapers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title}</option>)}</select></label>{canCreatePaper && <button className="button button-outline button-small" type="button" onClick={() => { setNewPaperSubject(subject); setNewPaperGrade(grade ?? ''); setNewPaperOpen((open) => !open); }}><Plus size={14} />新建试卷</button>}</div>
            <label>页码<input type="number" min="1" value={pageNumber ?? ''} onChange={(e) => setPageNumber(e.target.value)} placeholder="可选" /></label>
            <QuestionNumberFields majorNumber={majorNumber} minorNumber={minorNumber} onMajorNumberChange={setMajorNumber} onMinorNumberChange={setMinorNumber} />
            {canCreatePaper && newPaperOpen && <div className="new-paper-inline"><label>试卷名称<input value={newPaperTitle} onChange={(e) => setNewPaperTitle(e.target.value)} placeholder="例如：七年级期中考试卷" /></label><label>科目<select value={newPaperSubject} onChange={(e) => setNewPaperSubject(e.target.value)}>{SUBJECTS.map((item) => <option key={item}>{item}</option>)}</select></label><label>年级<input value={newPaperGrade ?? ''} onChange={(e) => setNewPaperGrade(e.target.value)} placeholder="例如：初二" /></label><button className="button button-outline button-small" type="button" onClick={() => void createPaper()} disabled={paperBusy}>{paperBusy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}保存来源</button></div>}
          </section>
          <section className="editor-section">
            <div className="section-heading"><div><span className="eyebrow">QUESTION</span><h3>题目内容</h3></div><span className="hint-pill">Markdown + LaTeX</span></div>
            <SymbolToolbar subject={subject} onInsert={(source, cursor) => insertSymbolAtCursor(contentRef.current, content, setContent, source, cursor)} />
            <textarea ref={contentRef} className="markdown-input" value={content} onChange={(e) => setContent(e.target.value)} placeholder={'在此输入题目。公式可以使用 $...$，例如 $x^2+2x+1=0$。'} rows={8} />
          </section>
          {imageSection}
          <section className="editor-section"><div className="section-heading"><div><span className="eyebrow">ANSWER</span><h3>答案</h3></div></div><SymbolToolbar subject={subject} onInsert={(source, cursor) => insertSymbolAtCursor(answerRef.current, answer, setAnswer, source, cursor)} /><textarea ref={answerRef} className="markdown-input compact-input" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="答案在练习中默认隐藏" rows={4} /></section>
          <section className="editor-section"><div className="section-heading"><div><span className="eyebrow">EXPLANATION</span><h3>解析</h3></div></div><SymbolToolbar subject={subject} onInsert={(source, cursor) => insertSymbolAtCursor(explanationRef.current, explanation, setExplanation, source, cursor)} /><textarea ref={explanationRef} className="markdown-input compact-input" value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="可选：录入推导步骤或讲解" rows={5} /></section>
        </div>
        <aside className="preview-pane"><div className="section-heading"><div><span className="eyebrow">LIVE PREVIEW</span><h3>预览</h3></div></div>
          <div className="preview-tabs">{(['question', 'answer', 'explanation'] as const).map((key) => <button key={key} className={previewTab === key ? 'active' : ''} onClick={() => setPreviewTab(key)}>{key === 'question' ? '题目' : key === 'answer' ? '答案' : '解析'}</button>)}</div>
          <Markdown images={[...images.map((image) => ({ src: imageUrl(image.fileName), alt: image.originalName, rotation: image.rotation, displayScale: image.displayScale })), ...newImageUrls.map((src, index) => ({ src, alt: newImages[index].name }))]}>{previewTab === 'question' ? content : previewTab === 'answer' ? answer : explanation}</Markdown>
          {previewTab === 'question' && unreferencedImageIndexes(content, images.length + newImages.length).length > 0 && <div className="preview-image-list">{unreferencedImageIndexes(content, images.length + newImages.length).map((number) => <img key={number} src={number <= images.length ? imageUrl(images[number - 1].fileName) : newImageUrls[number - images.length - 1]} style={number <= images.length ? { transform: `rotate(${images[number - 1].rotation}deg) scale(${images[number - 1].displayScale})` } : undefined} alt={`题目图片 ${number}`} />)}</div>}
        </aside>
      </div>
      {error && <div className="form-error">{error}</div>}
      <footer className="editor-footer"><button className="button button-outline" onClick={onClose}>取消</button><button className="button button-primary" disabled={busy} onClick={save}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{busy ? '保存中…' : '保存题目'}</button></footer>
    </div>
  </div>
  {cropTarget && <ImageCropDialog src={imageUrl(cropTarget.fileName)} name={cropTarget.originalName} onClose={() => setCropTarget(null)} onSave={(file) => applyCrop(cropTarget, file)} />}
  </>;
}
