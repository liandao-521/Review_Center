import { useState } from 'react';
import { Archive, ArrowLeft, Check, FileText, LoaderCircle, Upload, X } from 'lucide-react';
import { api } from '../api';

type Preview = {
  token: string;
  paper: { title: string; subject: string; grade?: string | null; alreadyImported: boolean };
  titleConflict: string | null;
  questions: { id: string; subject: string; contentPreview: string; imageCount: number; duplicate: boolean }[];
  newCount: number;
  duplicateCount: number;
};

export function QuestionPackageImport({ onClose, onImported }: { onClose: () => void; onImported: (result: { imported: number; skipped: number; paperTitle: string }) => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [error, setError] = useState('');

  const loadPreview = async (file?: File) => {
    if (!file) return;
    setPreviewBusy(true); setPreview(null); setError('');
    try { const form = new FormData(); form.append('file', file); setPreview(await api<Preview>('/question-packages/preview', { method: 'POST', body: form })); }
    catch (e) { setError((e as Error).message); }
    finally { setPreviewBusy(false); }
  };

  const close = async () => {
    if (preview?.token) await api(`/question-packages/preview/${preview.token}/discard`, { method: 'POST' }).catch(() => undefined);
    onClose();
  };

  const importPackage = async () => {
    if (!preview) return;
    setImportBusy(true); setError('');
    try {
      const result = await api<{ imported: number; skipped: number; paperTitle: string }>('/question-packages/import', { method: 'POST', body: JSON.stringify({ token: preview.token }) });
      onImported(result);
    } catch (e) { setError((e as Error).message); }
    finally { setImportBusy(false); }
  };

  return <main className="import-page package-import-page">
    <header className="page-topbar"><button className="back-button" onClick={() => void close()}><ArrowLeft size={18} />返回题库</button><div><span className="eyebrow">PAPER TRANSFER</span><h1>导入共享整卷</h1></div><div className="topbar-spacer" /></header>
    <section className="package-import-content">
      {!preview && <div className="package-upload-card"><div className="import-icon package-choice"><Archive size={26} /></div><span className="eyebrow">PERSONAL TO CLASSROOM</span><h2>导入学生提交的个人试卷</h2><p>预览整份试卷及题图后，确认导入为班级共享试卷。学生的练习记录、掌握度和错题集不会导入。</p><label className={`button button-primary ${previewBusy ? 'button-disabled' : ''}`}><input type="file" accept=".zip,application/zip" hidden disabled={previewBusy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void loadPreview(file); }} />{previewBusy ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />}{previewBusy ? '正在检查整卷包…' : '选择整卷包'}</label></div>}
      {preview && <>
        <div className="package-summary"><div><span>试卷</span><strong className="package-summary-title">{preview.paper.title}</strong><small>{preview.paper.subject}{preview.paper.grade ? ` · ${preview.paper.grade}` : ''}</small></div><div><span>将导入</span><strong>{preview.newCount}</strong><small>道题</small></div><div><span>重复跳过</span><strong>{preview.duplicateCount}</strong><small>道题</small></div></div>
        {preview.titleConflict && <div className="form-error">班级已有同名试卷「{preview.titleConflict}」，请先重命名后再导入。</div>}
        {preview.paper.alreadyImported && <div className="package-import-note"><strong>这份试卷之前已导入。</strong><span>再次导入只会补入尚未导入的题目。</span></div>}
        <div className="package-question-list">{preview.questions.map((question) => <article className={`package-question-row ${question.duplicate ? 'duplicate' : ''}`} key={question.id}><span className="package-question-status">{question.duplicate ? '已存在 · 跳过' : '将导入'}</span><div className="package-question-info"><div className="question-badges"><span className="subject-badge">{question.subject}</span><span className="grade-badge"><FileText size={12} />{preview.paper.title}</span></div><p>{question.contentPreview || '（题目以题图为主）'}</p><small>{question.imageCount} 张题图</small></div></article>)}</div>
        <div className="package-import-note"><strong>整卷导入为班级共享。</strong><span>包含试卷信息、题目和题图；不含原始试卷文件或任何学生练习记录。</span></div>
        <footer className="package-import-footer"><button className="button button-outline" onClick={() => void close()}>取消</button><button className="button button-primary" onClick={() => void importPackage()} disabled={importBusy || Boolean(preview.titleConflict) || preview.paper.alreadyImported && preview.newCount === 0}>{importBusy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{importBusy ? '正在导入…' : `导入整卷及 ${preview.newCount} 道题`}</button></footer>
      </>}
      {error && <div className="form-error package-import-error">{error}<button className="icon-button" onClick={() => setError('')}><X size={15} /></button></div>}
    </section>
  </main>;
}
