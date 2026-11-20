import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Paper } from '../types';

const SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '道德与法治', '其他'];

export function PaperSourceFields({ papers, paperId, setPaperId, title, setTitle, subject, setSubject, grade, setGrade }: {
  papers: Paper[];
  paperId: string;
  setPaperId: (id: string) => void;
  title: string;
  setTitle: (title: string) => void;
  subject: string;
  setSubject: (subject: string) => void;
  grade: string;
  setGrade: (grade: string) => void;
}) {
  const [mode, setMode] = useState<'new' | 'existing'>(paperId ? 'existing' : 'new');
  useEffect(() => { if (paperId) setMode('existing'); }, [paperId]);
  useEffect(() => {
    if (mode !== 'new' || !title.trim()) return;
    const duplicate = papers.find((paper) => paper.title.trim().toLocaleLowerCase() === title.trim().toLocaleLowerCase());
    if (duplicate) {
      setPaperId(duplicate.id); setTitle(duplicate.title); setSubject(duplicate.subject); setGrade(duplicate.grade ?? '');
      setMode('existing');
    }
  }, [mode, papers, title, setPaperId, setTitle, setSubject, setGrade]);

  const selectPaper = (id: string) => {
    setPaperId(id);
    const paper = papers.find((item) => item.id === id);
    if (paper) { setTitle(paper.title); setSubject(paper.subject); setGrade(paper.grade ?? ''); }
  };
  const changeTitle = (value: string) => {
    setTitle(value);
    const duplicate = value.trim() && papers.find((paper) => paper.title.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase());
    if (duplicate) {
      selectPaper(duplicate.id);
      setMode('existing');
    } else setPaperId('');
  };

  return <div className="paper-source-fields">
    <div className="paper-source-heading"><strong>所属试卷</strong><span>同一份试卷的多张图片或多次导入，请关联到同一份试卷</span></div>
    <div className="paper-source-modes">
      <button type="button" className={`paper-source-mode ${mode === 'new' ? 'active' : ''}`} onClick={() => { setMode('new'); setPaperId(''); setTitle(''); }}><Plus size={14} />新建试卷</button>
      <button type="button" className={`paper-source-mode ${mode === 'existing' ? 'active' : ''}`} onClick={() => setMode('existing')} disabled={!papers.length}>选择已有试卷</button>
    </div>
    {mode === 'existing' ? <>
      <label className="paper-source-select"><span>选择来源</span><select value={paperId} onChange={(event) => selectPaper(event.target.value)}><option value="">请选择一份试卷</option>{papers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title} · {paper.subject}{paper.grade ? ` · ${paper.grade}` : ''}</option>)}</select></label>
      {paperId && <div className="paper-source-selected">当前题目将关联到「{title}」</div>}
    </> : <div className="paper-source-new-grid">
      <label><span>试卷名称</span><input value={title} onChange={(event) => changeTitle(event.target.value)} placeholder="例如：练习卷 11、期中考试卷" /></label>
      <label><span>科目</span><select value={subject} onChange={(event) => setSubject(event.target.value)}>{SUBJECTS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>年级</span><input value={grade} onChange={(event) => setGrade(event.target.value)} placeholder="例如：初二" /></label>
    </div>}
  </div>;
}
