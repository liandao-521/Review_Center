import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, FileText, FileUp, ImagePlus, Link, LoaderCircle, ScanText, X } from 'lucide-react';
import mammoth from 'mammoth';
import DOMPurify from 'dompurify';
import { api } from '../api';
import { ImportQuestionPreview } from './ImportQuestionPreview';
import { insertImageReferenceAtCursor, removeImageReferences } from '../image-reference';
import { PaperSourceFields } from './PaperSourceFields';
import { insertSymbolAtCursor, SymbolToolbar } from './SymbolToolbar';
import { Paper } from '../types';
import { nextQuestionNumbers, QuestionNumberFields } from './QuestionNumberFields';

const QUESTION_TYPES = ['选择题', '填空题', '判断题', '计算题', '解答题', '证明题', '应用题', '阅读理解', '完形填空', '作文', '实验探究', '其他'];
type DraftImage = { file: File };

export function WordImport({ onClose, onSaved, papers, scope, onPaperCreated }: { onClose: () => void; onSaved: () => void; papers: Paper[]; scope: 'PERSONAL' | 'CLASSROOM'; onPaperCreated: (paper: Paper) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [html, setHtml] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [subject, setSubject] = useState('语文');
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
  const [images, setImages] = useState<DraftImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const explanationRef = useRef<HTMLTextAreaElement>(null);
  const imageUrls = useMemo(() => images.map((item) => URL.createObjectURL(item.file)), [images]);
  useEffect(() => () => imageUrls.forEach(URL.revokeObjectURL), [imageUrls]);
  const safeHtml = useMemo(() => DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, ADD_ATTR: ['class', 'style'] }), [html]);
  const selectionChanged = () => setSelectedText(window.getSelection()?.toString().trim() ?? '');
  const insertDraftImage = (index: number) => insertImageReferenceAtCursor(contentRef.current, content, index, setContent);

  const load = async (picked?: File) => {
    if (!picked) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      if (!picked.name.toLowerCase().endsWith('.docx')) throw new Error('目前支持 .docx 文件；旧版 .doc 请先用 Word 另存为 .docx。');
      const arrayBuffer = await picked.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      setFile(picked); setHtml(result.value); if (!paperId) setTitle(picked.name.replace(/\.docx$/i, ''));
      setWarnings(result.messages.filter((message) => message.type === 'warning').map((message) => message.message));
      setContent(''); setMajorNumber(''); setMinorNumber(''); setImages([]);
    } catch (e) { setError(`无法读取 Word 文件：${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  const addSelectedText = () => {
    if (!selectedText) { setError('先在左侧预览中拖选一段题目文字'); return; }
    setContent((old) => old ? `${old}\n${selectedText}` : selectedText); setNotice('选中的文字已加入题干编辑区，可继续选择补充。'); setError('');
  };
  const addEmbeddedImage = async (event: MouseEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest('img');
    if (!target?.getAttribute('src')) return;
    try {
      const response = await fetch(target.src); const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d'); if (!context) throw new Error('无法转换插图');
      context.drawImage(bitmap, 0, 0); bitmap.close();
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!png) throw new Error('无法转换插图');
      const imageFile = new File([png], `Word题图-${images.length + 1}.png`, { type: 'image/png' });
      setImages((items) => [...items, { file: imageFile }]);
      setNotice('已添加这张 Word 插图。');
    } catch { setError('无法提取这张图片，请在题目编辑器中单独上传。'); }
  };
  const save = async () => {
    if (!file || !content.trim() && images.length === 0) { setError('请添加题目文字或插图'); return; }
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
        majorNumber: majorNumber ? Number(majorNumber) : null, minorNumber: minorNumber ? Number(minorNumber) : null,
        sourceTitle: title, allowImageOnly: !content.trim(),
      }) });
      for (const item of images) { const form = new FormData(); form.append('file', item.file); await api(`/questions/${question.id}/images`, { method: 'POST', body: form }); }
      const nextNumbers = nextQuestionNumbers(majorNumber, minorNumber);
      setContent(''); setAnswer(''); setExplanation(''); setTags(''); setMajorNumber(nextNumbers.majorNumber); setMinorNumber(nextNumbers.minorNumber); setImages([]); setSelectedText(''); setNotice('题目已保存，可继续从此文档拆下一题。'); onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  return <div className="import-page word-import-page">
    <header className="page-topbar"><button className="back-button" onClick={onClose}><ArrowLeft size={18} />返回题库</button><div><span className="eyebrow">WORD WORKSPACE</span><h1>从 Word 拆题</h1></div><div className="topbar-spacer" /></header>
    {!file ? <div className="import-empty"><div className="import-intro"><div className="import-icon"><FileText size={26} /></div><span className="eyebrow">WORD IMPORT</span><h2>导入 Word 文档</h2><p>预览文档后，逐题选取文字；点击插图即可将它加入题目。</p></div><label className="dropzone"><input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void load(event.target.files?.[0])} hidden />{busy ? <LoaderCircle className="spin" /> : <FileUp size={30} />}<strong>选择 DOCX 文件</strong><span>旧版 DOC 请先另存为 DOCX</span></label>{error && <div className="form-error">{error}</div>}</div> : <>
      <div className="import-meta-bar"><PaperSourceFields papers={papers} paperId={paperId} setPaperId={setPaperId} title={title} setTitle={setTitle} subject={subject} setSubject={setSubject} grade={grade} setGrade={setGrade} /><label><span>本题题型</span><select value={questionType} onChange={(e) => setQuestionType(e.target.value)}><option value="">未分类</option>{QUESTION_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label><button className="button button-outline button-small" onClick={() => { setFile(null); setHtml(''); setContent(''); setImages([]); }}><X size={15} />换一份文档</button></div>
      <div className="word-import-workspace"><section className="word-source-panel"><div className="word-source-toolbar"><div><span className="eyebrow">DOCUMENT PREVIEW</span><strong>{file.name}</strong></div><label className="button button-outline button-small">更换文档<input type="file" accept=".docx" hidden onChange={(event) => void load(event.target.files?.[0])} /></label></div><div className="word-preview-scroll" onMouseUp={selectionChanged} onTouchEnd={selectionChanged} onClick={(event) => void addEmbeddedImage(event)}><div className="word-preview" dangerouslySetInnerHTML={{ __html: safeHtml }} /></div>{warnings.length > 0 && <div className="word-warnings">文档中有 {warnings.length} 项排版内容未能完整转换，建议对照原文件检查。</div>}<div className="word-selection-bar"><span>{selectedText ? `已选中 ${selectedText.length} 个字` : '在文档中拖动选择题目文字，点击文档图片可加入题图'}</span><button className="button button-accent" onClick={addSelectedText} disabled={!selectedText}><ScanText size={16} />加入选中文字</button></div></section>
      <section className="question-draft-panel"><div className="draft-heading"><div><span className="eyebrow">NEW QUESTION</span><h2>题目草稿</h2></div><span className="draft-page">手动拆题</span></div><QuestionNumberFields majorNumber={majorNumber} minorNumber={minorNumber} onMajorNumberChange={setMajorNumber} onMinorNumberChange={setMinorNumber} /><label className="field-label">题干文字</label><SymbolToolbar subject={subject} onInsert={(source, cursor) => insertSymbolAtCursor(contentRef.current, content, setContent, source, cursor)} /><textarea ref={contentRef} className="draft-textarea" value={content} onChange={(e) => setContent(e.target.value)} placeholder="在左侧选择题目文字，再点击“加入选中文字”；可在这里整理格式。" rows={8} /><label className="field-label">知识点标签<input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="逗号分隔，例如：二次函数，图像" /></label><label className="field-label">答案</label><SymbolToolbar subject={subject} onInsert={(source, cursor) => insertSymbolAtCursor(answerRef.current, answer, setAnswer, source, cursor)} /><textarea ref={answerRef} className="draft-textarea" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="练习时默认隐藏" rows={3} /><label className="field-label">解析</label><SymbolToolbar subject={subject} onInsert={(source, cursor) => insertSymbolAtCursor(explanationRef.current, explanation, setExplanation, source, cursor)} /><textarea ref={explanationRef} className="draft-textarea" value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="可选" rows={3} /><div className="draft-images"><div className="section-heading"><h3>已选插图</h3><span>{images.length} 张 · 点击文档插图添加</span></div><div className="draft-image-strip">{images.map((item, index) => <div className="draft-image-thumb" key={`${item.file.name}-${index}`}><img src={imageUrls[index]} alt={item.file.name} /><button onClick={() => { setImages((items) => items.filter((_, i) => i !== index)); setContent((current) => removeImageReferences(current, index + 1)); }}><X size={13} /></button><button className="insert-image-reference" onClick={() => insertDraftImage(index + 1)}><Link size={13} />插入到题干</button></div>)}</div></div><div className="import-preview-section"><div className="section-heading"><div><span className="eyebrow">LIVE PREVIEW</span><h3>排版效果</h3></div></div><ImportQuestionPreview subject={subject} questionType={questionType} content={content} answer={answer} explanation={explanation} tags={tags} images={imageUrls.map((src, index) => ({ src, alt: images[index]?.file.name }))} /></div>{error && <div className="form-error">{error}</div>}{notice && <div className="form-notice">{notice}</div>}<button className="button button-primary save-draft-button" onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Check size={16} />}{saving ? '正在保存…' : '保存题目'}</button><p className="draft-footnote">Word 排版可能与原文件略有差异，请对照原文检查题干和图表。</p></section></div>
    </>}
  </div>;
}
