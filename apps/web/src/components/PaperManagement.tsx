import { FormEvent, useState } from 'react';
import { BookOpen, Download, FileText, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { Paper } from '../types';
import { useConfirmDialog } from './ConfirmDialog';

const SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '道德与法治', '其他'];

function PaperForm({ paper, papers, scope, onClose, onSaved }: { paper?: Paper; papers: Paper[]; scope: 'PERSONAL' | 'CLASSROOM'; onClose: () => void; onSaved: (paper: Paper) => void }) {
  const [title, setTitle] = useState(paper?.title ?? '');
  const [subject, setSubject] = useState(paper?.subject ?? '数学');
  const [grade, setGrade] = useState(paper?.grade ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    const duplicate = papers.find((item) => item.id !== paper?.id && item.title.trim().toLocaleLowerCase() === title.trim().toLocaleLowerCase());
    if (duplicate) {
      if (!paper) onSaved(duplicate);
      else setError(`已有同名试卷「${duplicate.title}」，请编辑现有试卷或使用该来源。`);
      if (!paper) onClose();
      return;
    }
    setBusy(true);
    try {
      const saved = await api<Paper>(paper ? `/papers/${paper.id}` : '/papers', {
        method: paper ? 'PATCH' : 'POST', body: JSON.stringify({ title, subject, grade, scope }),
      });
      onSaved({ ...saved, questionCount: paper?.questionCount ?? 0 });
      onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="paper-form editor-dialog" onSubmit={submit}>
    <header className="editor-header"><div><span className="eyebrow">PAPER SOURCE</span><h2>{paper ? '编辑试卷' : scope === 'PERSONAL' ? '新增个人试卷' : '新增共享试卷'}</h2></div><button className="icon-button" type="button" onClick={onClose}><X /></button></header>
    <div className="paper-form-body"><label>试卷名称<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：练习卷 11、期中考试卷" required /></label><label>科目<select value={subject} onChange={(event) => setSubject(event.target.value)}>{SUBJECTS.map((item) => <option key={item}>{item}</option>)}</select></label><label>年级<input value={grade ?? ''} onChange={(event) => setGrade(event.target.value)} placeholder="例如：初二" /></label><p className="muted">只保存来源信息，不上传或保存原始试卷文件。</p>{error && <div className="form-error">{error}</div>}</div>
    <footer className="editor-footer"><button className="button button-outline" type="button" onClick={onClose}>取消</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{busy ? '保存中…' : '保存试卷来源'}</button></footer>
  </form></div>;
}

export function PaperManagement({ papers, scope, canManage, exportBusy, onChanged, onCreated, onExportPaper, onOpenQuestions }: {
  papers: Paper[];
  scope: 'PERSONAL' | 'CLASSROOM';
  canManage: boolean;
  exportBusy: boolean;
  onChanged: () => void | Promise<void>;
  onCreated: (paper: Paper) => void;
  onExportPaper: (paper: Paper) => void;
  onOpenQuestions: (paper: Paper) => void;
}) {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [editor, setEditor] = useState<Paper | 'new' | null>(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const subjectOptions = [...new Set([...SUBJECTS, ...papers.map((paper) => paper.subject).filter(Boolean)])];
  const filteredPapers = subjectFilter ? papers.filter((paper) => paper.subject === subjectFilter) : papers;
  const remove = async (paper: Paper) => {
    if (scope === 'CLASSROOM' && (paper.questionCount ?? 0) > 0) return;
    const warning = scope === 'PERSONAL'
      ? `删除个人试卷“${paper.title}”及其全部 ${paper.questionCount ?? 0} 道题？关联的题目图片和练习记录也会永久删除。`
      : `删除试卷“${paper.title}”？`;
    if (!await confirm({ title: '删除试卷？', message: warning, confirmLabel: '删除试卷', danger: true })) return;
    setBusyId(paper.id); setError('');
    try { await api(`/papers/${paper.id}`, { method: 'DELETE' }); await onChanged(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusyId(''); }
  };
  return <>
    <div className="paper-management-toolbar"><div><strong>{scope === 'PERSONAL' ? '我的试卷' : '班级共享试卷'}</strong><span>{subjectFilter ? `${filteredPapers.length} / ${papers.length} 份` : `${papers.length} 份`} · 一份试卷及其题目属于同一题库</span></div><div className="paper-management-controls"><label className="paper-subject-filter"><span>科目</span><select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="">全部科目</option>{subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></label>{canManage && <button className="button button-primary button-small" onClick={() => setEditor('new')}><Plus size={15} />新增试卷</button>}</div></div>
    {error && <div className="form-error paper-management-error">{error}<button className="icon-button" onClick={() => setError('')}><X size={15} /></button></div>}
    {filteredPapers.length ? <div className="paper-list">{filteredPapers.map((paper) => <article className="paper-card" key={paper.id}>
      <div className="paper-file-icon"><FileText /></div><div className="paper-info"><strong>{paper.title}</strong><span>{paper.subject}{paper.grade ? ` · ${paper.grade}` : ''} · {paper.questionCount ?? 0} 道题</span>{Boolean(paper.questionCount) && <small className="paper-lock-note">仍有题目关联，调整来源后才能删除</small>}</div>
      <button className="button button-outline button-small" onClick={() => onOpenQuestions(paper)} disabled={!paper.questionCount}><BookOpen size={14} />查看题目</button>
      {scope === 'PERSONAL' && <button className="button button-outline button-small" onClick={() => onExportPaper(paper)} disabled={exportBusy}><Download size={14} />{exportBusy ? '正在导出…' : '导出整卷'}</button>}
      {paper.canManage && <><button className="icon-button" title="编辑试卷" onClick={() => setEditor(paper)}><Pencil size={16} /></button>
      <button className="icon-button danger-icon" title={paper.questionCount && scope === 'CLASSROOM' ? '共享试卷仍有题目，不能删除' : '删除试卷及其题目'} disabled={Boolean(paper.questionCount && scope === 'CLASSROOM') || busyId === paper.id} onClick={() => void remove(paper)}>{busyId === paper.id ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}</button></>}
    </article>)}</div> : papers.length ? <div className="empty-state"><FileText size={32} /><h2>该科目暂无试卷</h2><p>当前科目还没有试卷，可以切换科目查看其他试卷。</p><button className="button button-outline" onClick={() => setSubjectFilter('')}>查看全部科目</button></div> : <div className="empty-state"><FileText size={32} /><h2>还没有试卷</h2><p>{canManage ? '导入材料拆题时会自动创建试卷，也可以先手动添加试卷信息。' : '请联系班级管理员添加共享试卷。'}</p>{canManage && <button className="button button-primary" onClick={() => setEditor('new')}><Plus size={16} />新增试卷</button>}</div>}
    {editor && <PaperForm paper={editor === 'new' ? undefined : editor} papers={papers} scope={scope} onClose={() => setEditor(null)} onSaved={(paper) => { onCreated(paper); void onChanged(); }} />}
    {confirmDialog}
  </>;
}
