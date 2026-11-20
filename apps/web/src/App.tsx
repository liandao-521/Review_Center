import { FormEvent, useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Download, FilePlus2, FileText, Filter, GraduationCap, Image as ImageIcon, Library, ListChecks, LoaderCircle, LogOut, Pencil, Plus, Printer, Search, Settings2, ShieldCheck, Sparkles, Tag, Trash2, Upload, Users, X } from 'lucide-react';
import { api, imageUrl } from './api';
import { Question, Paper } from './types';
import { Markdown } from './components/Markdown';
import { QuestionEditor } from './components/QuestionEditor';
import { PaperManagement } from './components/PaperManagement';
import { QuestionPackageImport } from './components/QuestionPackageImport';
import { PdfImport } from './components/PdfImport';
import { ImageImport } from './components/ImageImport';
import { WordImport } from './components/WordImport';
import { ImportChooser, ImportMode } from './components/ImportChooser';
import { unreferencedImageIndexes } from './image-reference';
import { AdminManagement } from './components/AdminManagement';
import { ClassroomMembers } from './components/ClassroomMembers';
import { useConfirmDialog } from './components/ConfirmDialog';
import { ProfileSettings } from './components/ProfileSettings';

type AuthStatus = { authenticated: boolean; role?: 'admin' | 'student'; expired?: boolean; account?: { id: string; studentId: string; username: string; displayName: string; classroomId: string; classroomName: string; expiresAt: string | null; isClassAdmin: boolean } };
type Tab = 'library' | 'practice' | 'papers' | 'members';
const SUBJECTS = ['全部科目', '数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '道德与法治', '其他'];
const QUESTION_TYPES = ['选择题', '填空题', '判断题', '计算题', '解答题', '证明题', '应用题', '阅读理解', '完形填空', '作文', '实验探究', '其他'];

function groupQuestionsByPaper(questions: Question[]) {
  const groups = new Map<string, { title: string; questions: Question[] }>();
  for (const question of questions) {
    const title = question.paper?.title || question.sourceTitle || '未命名试卷';
    const group = groups.get(question.paperId) ?? { title, questions: [] };
    group.questions.push(question); groups.set(question.paperId, group);
  }
  const compareNumber = (a?: number | null, b?: number | null) => a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b;
  return [...groups.entries()].sort((a, b) => a[1].title.localeCompare(b[1].title, 'zh-CN')).map(([paperId, group]) => ({ paperId, ...group, questions: group.questions.sort((a, b) =>
    compareNumber(a.majorNumber, b.majorNumber) || compareNumber(a.minorNumber, b.minorNumber) || compareNumber(a.pageNumber, b.pageNumber) || b.updatedAt.localeCompare(a.updatedAt),
  ) }));
}

function BankScopeSwitch({ scope, onChange }: { scope: 'PERSONAL' | 'CLASSROOM'; onChange: (scope: 'PERSONAL' | 'CLASSROOM') => void }) {
  return <div className="bank-scope-switch" role="group" aria-label="题库范围">
    <button className={scope === 'CLASSROOM' ? 'active' : ''} onClick={() => onChange('CLASSROOM')}>班级共享</button>
    <button className={scope === 'PERSONAL' ? 'active' : ''} onClick={() => onChange('PERSONAL')}>我的题库</button>
  </div>;
}

function AuthScreen({ onAuthed, expired }: { onAuthed: () => void; expired?: boolean }) {
  const [admin, setAdmin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: admin ? 'admin' : username, password }) });
      onAuthed();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <main className="auth-page"><div className="auth-card">
    <div className="brand-mark large-mark"><BookOpen size={28} /></div><span className="eyebrow">REVIEW CENTER · 学生题库</span>
    <h1>{admin ? '管理员登录' : '学生账号登录'}</h1><p>{expired ? '此学生账号已到期，请联系管理员。' : admin ? '登录后管理班级和学生账号。' : '输入管理员分配的学生账号和密码。'}</p>
    <form onSubmit={submit} className="auth-form">{!admin && <label>学生账号<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="请输入学生账号" required /></label>}<label>{admin ? '管理员密码' : '学生密码'}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="请输入密码" required /></label>
      {error && <div className="form-error">{error}</div>}
      <button className="button button-primary auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Check size={18} />}{admin ? '进入管理界面' : '登录题库'}</button>
    </form><div className="auth-foot"><button className="link-button" type="button" onClick={() => { setAdmin((value) => !value); setPassword(''); setError(''); }}>{admin ? '返回学生登录' : '管理员登录'}</button><span className="secure-dot" />班级共享题目，个人练习记录独立保存</div>
  </div><div className="auth-decoration auth-decoration-one"/><div className="auth-decoration auth-decoration-two"/></main>;
}

function QuestionCard({ question, selected, canManageWrongSet, onSelect, onEdit, onDelete, onAssign, onToggleWrongSet, onMasteryChange, onImageError }: { question: Question; selected: boolean; canManageWrongSet: boolean; onSelect: (selected: boolean) => void; onEdit: () => void; onDelete: () => void; onAssign: () => void; onToggleWrongSet: () => void; onMasteryChange: (score: number | null) => void; onImageError: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  return <article className="question-card">
    <div className="question-card-top"><div className="question-badges"><label className="question-select" title="选择题目"><input type="checkbox" aria-label={`选择题目：${question.content.slice(0, 40)}`} checked={selected} onChange={(event) => onSelect(event.target.checked)} /></label><span className="subject-badge">{question.subject}</span>{(question.majorNumber != null || question.minorNumber != null) && <span className="question-number-badge">{question.majorNumber != null ? `${question.majorNumber}、` : ''}{question.minorNumber != null ? `(${question.minorNumber})` : ''}</span>}{question.questionType && <span className="grade-badge">{question.questionType}</span>}{question.grade && <span className="grade-badge">{question.grade}</span>}{question.wrongCount > 0 && <span className="wrong-badge">错 {question.wrongCount} 次</span>}</div>
      <div className="card-actions">{canManageWrongSet && <button className={question.inWrongSet ? 'wrong-set-toggle active' : 'wrong-set-toggle'} title={question.inWrongSet ? '从当前学生的错题集中移除' : '加入当前学生的错题集'} onClick={onToggleWrongSet}>{question.inWrongSet ? <Check size={14} /> : <Plus size={14} />}{question.inWrongSet ? '已加入' : '加入错题集'}</button>}{question.canAssign && <button className="icon-button" title="分配编辑成员" onClick={onAssign}><Users size={16} /></button>}{question.canEdit && <button className="icon-button" title="编辑" onClick={onEdit}><Pencil size={16} /></button>}{question.canDelete && <button className="icon-button danger-icon" title="删除" onClick={onDelete}><Trash2 size={16} /></button>}</div></div>
    <div className="question-content"><Markdown onImageError={onImageError} images={question.images.map((image) => ({ src: imageUrl(image.fileName), alt: image.originalName, rotation: image.rotation, displayScale: image.displayScale }))}>{question.content}</Markdown></div>
    {unreferencedImageIndexes(question.content, question.images.length).length > 0 && <div className="question-figures">{unreferencedImageIndexes(question.content, question.images.length).map((index) => { const image = question.images[index - 1]; return <img key={image.id} src={imageUrl(image.fileName)} alt={`题图 ${index}`} onError={onImageError} style={{ transform: `rotate(${image.rotation}deg) scale(${image.displayScale})` }} />; })}</div>}
    <div className="question-card-bottom"><div className="tag-list">{question.tags.map((tag) => <span className="tag-chip" key={tag}><Tag size={12} />{tag}</span>)}</div><span className="source-meta">{question.paper?.title || question.sourceTitle}{question.pageNumber ? ` · 第 ${question.pageNumber} 页` : ''}{question.editorNames?.length ? ` · 编辑：${question.editorNames.join('、')}` : ''}</span></div>
    <div className="mastery-control"><span>掌握程度</span>{[1, 2, 3, 4, 5].map((score) => <button key={score} className={question.masteryScore === score ? 'mastery-score active' : 'mastery-score'} title={`${score} 分：${['还不会', '掌握较少', '一般', '基本掌握', '完全掌握'][score - 1]}`} onClick={() => onMasteryChange(score)}>{score}</button>)}<small>{question.masteryScore ? ['还不会', '掌握较少', '一般', '基本掌握', '完全掌握'][question.masteryScore - 1] : '未评定'}</small>{question.masteryScore === 5 && question.masteryUpdatedAt && <small>掌握于 {new Date(question.masteryUpdatedAt).toLocaleDateString('zh-CN')}</small>}{question.masteryScore && <button className="mastery-clear" onClick={() => onMasteryChange(null)}>清除</button>}</div>
    {(question.answer || question.explanation) && <div className="answer-area"><button className="answer-toggle" onClick={() => setRevealed((v) => !v)}><span>{revealed ? '收起答案' : '显示答案'}</span><ChevronDown size={16} className={revealed ? 'rotate-chevron' : ''} /></button>
      {revealed && <div className="revealed-answer"><div className="answer-block"><span className="answer-label">答案</span><Markdown>{question.answer}</Markdown></div>{question.explanation && <><button className="explanation-toggle" onClick={() => setShowExplanation((v) => !v)}>{showExplanation ? '收起解析' : '展开解析'}<ChevronDown size={15} /></button>{showExplanation && <div className="answer-block explanation-block"><span className="answer-label">解析</span><Markdown>{question.explanation}</Markdown></div>}</>}</div>}
    </div>}
  </article>;
}

function ExportDialog({ questions, onClose }: { questions: Question[]; onClose: () => void }) {
  const [items, setItems] = useState(questions);
  const [message, setMessage] = useState('');
  const move = (index: number, offset: number) => setItems((list) => {
    const target = index + offset; if (target < 0 || target >= list.length) return list;
    const next = [...list]; [next[index], next[target]] = [next[target], next[index]]; return next;
  });
  const print = (answers: boolean) => {
    if (!items.length) { setMessage('至少保留一道题'); return; }
    document.body.dataset.printAnswers = answers ? 'yes' : 'no';
    document.body.dataset.printQuestionIds = items.map((item) => item.id).join(',');
    const event = new CustomEvent('print-review', { detail: { items, answers } });
    window.dispatchEvent(event);
    setMessage(answers ? '正在打开答案解析打印视图…' : '正在打开练习卷打印视图…');
  };
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="export-dialog">
    <header className="editor-header"><div><span className="eyebrow">BUILD A PAPER</span><h2>整理导出题目</h2></div><button className="icon-button" onClick={onClose}><X /></button></header>
    <p className="muted">预览筛选结果，移除不需要的题目并调整顺序，再分别打印练习卷和答案解析。</p>
    <div className="export-list">{items.map((question, index) => <div className="export-item" key={question.id}><span className="export-number">{String(index + 1).padStart(2, '0')}</span><div className="export-item-content"><div className="question-badges"><span className="subject-badge">{question.subject}</span>{question.questionType && <span className="grade-badge">{question.questionType}</span>}{question.tags.slice(0, 2).map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}</div><div className="export-item-text">{question.content.replace(/[#*$`]/g, '').slice(0, 110)}</div></div><div className="export-item-actions"><button className="icon-button" title="上移" onClick={() => move(index, -1)} disabled={index === 0}><ChevronLeft className="up-chevron" size={17} /></button><button className="icon-button" title="下移" onClick={() => move(index, 1)} disabled={index === items.length - 1}><ChevronRight className="down-chevron" size={17} /></button><button className="icon-button danger-icon" title="移除" onClick={() => setItems((list) => list.filter((item) => item.id !== question.id))}><X size={17} /></button></div></div>)}</div>
    {message && <div className="notice-message">{message} · 在打印窗口中选择“存储为 PDF”即可保存。</div>}
    <footer className="editor-footer"><span className="muted">{items.length} 道题</span><div className="footer-actions"><button className="button button-outline" onClick={() => print(true)}><FileText size={16} />打印答案解析</button><button className="button button-primary" onClick={() => print(false)}><Printer size={16} />打印练习卷</button></div></footer>
  </div></div>;
}

function EditorAssignmentDialog({ question, onClose, onSaved }: { question: Question; onClose: () => void; onSaved: () => void }) {
  const [members, setMembers] = useState<{ id: string; username: string; displayName: string; isClassAdmin: boolean; active: boolean }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ members: typeof members; editors: string[] }>(`/questions/editors?questionId=${encodeURIComponent(question.id)}`)
      .then((data) => { setMembers(data.members); setSelected(new Set(data.editors)); })
      .catch((e) => setError((e as Error).message));
  }, [question.id]);
  const save = async () => {
    setBusy(true); setError('');
    try { await api(`/questions/${question.id}/editors`, { method: 'PUT', body: JSON.stringify({ accountIds: [...selected] }) }); onSaved(); onClose(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="export-dialog">
    <header className="editor-header"><div><span className="eyebrow">EDIT ACCESS</span><h2>分配题目编辑成员</h2></div><button className="icon-button" onClick={onClose}><X /></button></header>
    <p className="muted">{question.paper?.title || question.sourceTitle} · 取消勾选即可撤销编辑权限。</p>
    <div className="admin-account-list">{members.map((member) => <label className="admin-account-row" key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}><input type="checkbox" checked={selected.has(member.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); event.target.checked ? next.add(member.id) : next.delete(member.id); return next; })} /><span><strong>{member.displayName}</strong><small>{member.username}{member.isClassAdmin ? ' · 班级管理员' : ''}{!member.active ? ' · 已停用' : ''}</small></span></label>)}</div>
    {error && <div className="form-error">{error}</div>}
    <footer className="editor-footer"><span className="muted">已选 {selected.size} 人</span><div className="footer-actions"><button className="button button-outline" onClick={onClose}>取消</button><button className="button button-primary" onClick={() => void save()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}保存分配</button></div></footer>
  </div></div>;
}

function PracticeView({ questions, onAttempt, onEdit, onRemoveWrongSet }: { questions: Question[]; onAttempt: (question: Question, correct: boolean, note: string) => Promise<void>; onEdit: (question: Question) => void; onRemoveWrongSet: (question: Question) => void }) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const current = questions[index];
  const next = () => { setIndex((i) => i + 1); setRevealed(false); setExplanationOpen(false); setNote(''); };
  const mark = async (correct: boolean) => {
    if (!current) return;
    setBusy(true); await onAttempt(current, correct, note); setBusy(false);
    if (index + 1 < questions.length) next(); else setActive(false);
  };
  if (active && current) return <section className="practice-session">
    <div className="practice-session-top"><button className="back-button" onClick={() => setActive(false)}><X size={17} />结束练习</button><div className="session-progress"><span>本组练习</span><strong>{index + 1}<i>/</i>{questions.length}</strong></div><span className="subject-badge">{current.subject}{current.questionType ? ` · ${current.questionType}` : ''}</span></div>
    <div className="practice-question-card"><div className="question-badges"><span className="grade-badge">{current.grade || '未分年级'}</span>{current.tags.map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}</div><div className="practice-content"><Markdown images={current.images.map((image) => ({ src: imageUrl(image.fileName), alt: image.originalName, rotation: image.rotation, displayScale: image.displayScale }))}>{current.content}</Markdown>{unreferencedImageIndexes(current.content, current.images.length).map((index) => { const image = current.images[index - 1]; return <img className="practice-figure" key={image.id} src={imageUrl(image.fileName)} alt={image.originalName || `题图 ${index}`} />; })}</div>
      {!revealed ? <button className="button button-outline reveal-answer-button" onClick={() => setRevealed(true)}>完成作答，查看答案</button> : <div className="practice-answer"><div className="answer-label">参考答案</div><Markdown>{current.answer || '暂未录入答案'}</Markdown>{current.explanation && <><button className="explanation-toggle" onClick={() => setExplanationOpen((v) => !v)}>{explanationOpen ? '收起解析' : '查看解析'}<ChevronDown size={15} /></button>{explanationOpen && <div className="practice-explanation"><Markdown>{current.explanation}</Markdown></div>}</>}</div>}
      {revealed && <div className="record-result"><label>做题备注（可选）<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="记录卡住的步骤或易错点" /></label><div className="result-buttons"><button className="button button-correct" disabled={busy} onClick={() => mark(true)}><Check size={18} />答对了</button><button className="button button-wrong" disabled={busy} onClick={() => mark(false)}><X size={18} />答错了</button></div></div>}
    </div>
    <div className="practice-next-tip"><span>答对或答错都会记录本次练习</span>{index > 0 && <button onClick={() => { setIndex((i) => i - 1); setRevealed(false); }}>上一题</button>}</div>
  </section>;
  return <section className="practice-overview"><div className="practice-hero"><div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/><div className="practice-hero-copy"><span className="eyebrow">FOCUS PRACTICE</span><h2>把错题再做一遍</h2><p>按科目、知识点和答错次数筛选，答案在作答后才会显示。</p></div><div className="practice-hero-icon"><ListChecks size={32} /></div></div>
    <div className="practice-summary"><div className="summary-stat"><span>待练习</span><strong>{questions.length}</strong><small>道题符合筛选条件</small></div><div className="summary-stat"><span>可见范围</span><strong>全部</strong><small>依筛选条件排列</small></div><div className="summary-stat"><span>记录方式</span><strong>对 / 错</strong><small>可附做题备注</small></div></div>
    {questions.length ? <div className="practice-queue">{questions.slice(0, 5).map((q, i) => <div className="queue-row" key={q.id}><button className="queue-open" onClick={() => { setIndex(i); setActive(true); }}><span className="queue-index">{String(i + 1).padStart(2, '0')}</span><span className="queue-text">{q.content.replace(/[#*$`]/g, '').slice(0, 86)}</span><span className="wrong-badge">错 {q.wrongCount} 次</span><ChevronRight size={17} /></button>{q.inWrongSet && <button className="queue-remove" title="移出错题集" aria-label={`将题目移出错题集：${q.content.slice(0, 40)}`} onClick={() => onRemoveWrongSet(q)}><X size={15} /><span>移出错题集</span></button>}</div>)}{questions.length > 5 && <span className="queue-more">还有 {questions.length - 5} 道符合条件</span>}<button className="button button-primary start-practice" onClick={() => { setIndex(0); setActive(true); }}><Sparkles size={17} />开始这一组练习</button></div> : <div className="empty-state small-empty"><CircleHelp size={25} /><h3>当前学生的错题集还是空的</h3><p>可在题目库中将题目加入错题集；练习答错的题目也会自动加入。</p></div>}
  </section>;
}

export default function App() {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [tab, setTab] = useState<Tab>('library');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [questionType, setQuestionType] = useState('');
  const [tag, setTag] = useState('');
  const [paperFilterId, setPaperFilterId] = useState('');
  const [bankScope, setBankScope] = useState<'PERSONAL' | 'CLASSROOM'>('CLASSROOM');
  const [masteryFilter, setMasteryFilter] = useState('any');
  const [wrongCount, setWrongCount] = useState('any');
  const [wrongMode, setWrongMode] = useState<'exact' | 'atLeast'>('exact');
  const [editor, setEditor] = useState<{ question?: Question; initial?: Partial<Question> } | null>(null);
  const [assignmentQuestion, setAssignmentQuestion] = useState<Question | null>(null);
  const [showImport, setShowImport] = useState<ImportMode | 'choose' | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [printData, setPrintData] = useState<{ items: Question[]; answers: boolean } | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(() => new Set());
  const [practiceQueueOverride, setPracticeQueueOverride] = useState<Question[] | null>(null);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [packageExportBusy, setPackageExportBusy] = useState(false);

  const refreshAuth = async () => {
    try { const status = await api<AuthStatus>('/auth/status'); setAuth(status); }
    catch { setAuth({ authenticated: false }); }
  };
  const refreshQuestions = async () => {
    if (!auth?.authenticated) return;
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim()); if (subject) params.set('subject', subject); if (questionType) params.set('questionType', questionType); if (tag) params.set('tag', tag);
    if (paperFilterId) params.set('paperId', paperFilterId);
    params.set('scope', tab === 'practice' ? 'ALL' : bankScope);
    if (masteryFilter !== 'any') params.set('masteryScore', masteryFilter);
    if (wrongCount !== 'any') { params.set('wrongCount', wrongCount); params.set('wrongMode', wrongMode); }
    try { setQuestions(await api<Question[]>(`/questions?${params.toString()}`)); setError(''); }
    catch (e) { setError((e as Error).message); }
  };
  const refreshPapers = async () => { try { setPapers(await api<Paper[]>(`/papers?scope=${bankScope}`)); } catch { /* auth status handles the session */ } };
  const refreshTags = async () => { try { setTags(await api(`/questions/tags?scope=${tab === 'practice' ? 'ALL' : bankScope}`)); } catch { /* no-op */ } };

  useEffect(() => { refreshAuth().finally(() => setLoading(false)); }, []);
  useEffect(() => { if (showImport === 'package' && !auth?.account?.isClassAdmin) setShowImport(null); }, [showImport, auth?.account?.isClassAdmin]);
  useEffect(() => { refreshQuestions(); }, [auth?.authenticated, query, subject, questionType, tag, paperFilterId, wrongCount, wrongMode, masteryFilter, bankScope, tab]);
  useEffect(() => { setSelectedQuestionIds(new Set()); }, [query, subject, questionType, tag, paperFilterId, wrongCount, wrongMode, masteryFilter, bankScope]);
  useEffect(() => { if (auth?.authenticated) refreshPapers(); }, [auth?.authenticated, bankScope]);
  useEffect(() => { if (auth?.authenticated) refreshTags(); }, [auth?.authenticated, bankScope, tab]);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setPrintData(detail);
      window.setTimeout(() => window.print(), 250);
    };
    const afterPrint = () => { setPrintData(null); delete document.body.dataset.printAnswers; delete document.body.dataset.printQuestionIds; };
    window.addEventListener('print-review', handler); window.addEventListener('afterprint', afterPrint);
    return () => { window.removeEventListener('print-review', handler); window.removeEventListener('afterprint', afterPrint); };
  }, []);

  const stats = useMemo(() => ({
    total: questions.length,
    wrong: questions.filter((question) => question.wrongCount > 0).length,
    subjects: new Set(questions.map((question) => question.subject)).size,
  }), [questions]);
  const questionGroups = useMemo(() => groupQuestionsByPaper(questions), [questions]);
  const deletableSelectedCount = questions.filter((question) => selectedQuestionIds.has(question.id) && question.canDelete).length;

  const logout = async () => { await api('/auth/logout', { method: 'POST' }); setAuth({ authenticated: false }); };
  const editQuestion = (question: Question) => setEditor({ question });
  const removeQuestion = async (question: Question) => {
    if (!await confirm({ title: '永久删除题目？', message: '这道题及其练习记录和题图会被永久删除，且无法恢复。', confirmLabel: '永久删除', danger: true })) return;
    try { await api(`/questions/${question.id}`, { method: 'DELETE' }); setQuestions((items) => items.filter((item) => item.id !== question.id)); setSelectedQuestionIds((ids) => { const next = new Set(ids); next.delete(question.id); return next; }); setNotice('题目已删除'); await refreshTags(); }
    catch (e) { setError((e as Error).message); }
  };
  const toggleQuestionSelection = (id: string, selected: boolean) => setSelectedQuestionIds((ids) => {
    const next = new Set(ids);
    if (selected) next.add(id); else next.delete(id);
    return next;
  });
  const selectAllVisibleQuestions = () => setSelectedQuestionIds(new Set(questions.map((question) => question.id)));
  const clearQuestionSelection = () => setSelectedQuestionIds(new Set());
  const onPaperCreated = (paper: Paper) => setPapers((items) => [paper, ...items.filter((item) => item.id !== paper.id)]);
  const changeMastery = async (question: Question, score: number | null) => {
    try {
      let masteryUpdatedAt: string | null = null;
      if (score === null) await api<{ cleared: boolean }>(`/questions/${question.id}/mastery`, { method: 'DELETE' });
      else masteryUpdatedAt = (await api<{ updatedAt: string }>(`/questions/${question.id}/mastery`, { method: 'PUT', body: JSON.stringify({ score }) })).updatedAt;
      setQuestions((items) => items.map((item) => item.id === question.id ? { ...item, masteryScore: score, masteryUpdatedAt } : item));
    } catch (e) { setError((e as Error).message); }
  };
  const toggleWrongSet = async (question: Question) => {
    const inWrongSet = Boolean(question.inWrongSet);
    try {
      await api(`/questions/${question.id}/wrong-set`, {
        method: inWrongSet ? 'DELETE' : 'PUT',
      });
      setQuestions((items) => items.map((item) => item.id === question.id ? { ...item, inWrongSet: !inWrongSet } : item));
      setNotice(inWrongSet ? '已从当前学生的错题集中移除' : '已加入当前学生的错题集');
    } catch (e) { setError((e as Error).message); }
  };
  const removeSelectedQuestions = async () => {
    const ids = [...selectedQuestionIds].filter((id) => questions.some((question) => question.id === id && question.canDelete));
    if (!ids.length || !await confirm({ title: `永久删除选中的 ${ids.length} 道题？`, message: '所选题目的练习记录和题图也会被永久删除，且无法恢复。', confirmLabel: '永久删除', danger: true })) return;
    setBulkDeleteBusy(true);
    try {
      const result = await api<{ deleted: number }>('/questions', { method: 'DELETE', body: JSON.stringify({ ids }) });
      setQuestions((items) => items.filter((item) => !ids.includes(item.id)));
      setSelectedQuestionIds(new Set());
      setNotice(`已删除 ${result.deleted} 道题目`);
      await Promise.all([refreshQuestions(), refreshTags()]);
    } catch (e) { setError((e as Error).message); }
    finally { setBulkDeleteBusy(false); }
  };
  const saveAttempt = async (question: Question, correct: boolean, note: string) => {
    await api(`/questions/${question.id}/attempts`, { method: 'POST', body: JSON.stringify({ isCorrect: correct, note }) });
    setNotice(correct ? '已记录：答对' : '已记录：答错'); await refreshQuestions();
  };
  const practiceQuestions = questions.filter((question) => question.inWrongSet && (masteryFilter !== 'any' || question.masteryScore !== 5));
  const startSelectedPractice = () => {
    const selected = questions.filter((question) => selectedQuestionIds.has(question.id));
    if (!selected.length) { setError('请先勾选要练习的题目'); return; }
    setPracticeQueueOverride(selected);
    setTab('practice');
  };
  const downloadBackup = async () => {
    if (!selectedQuestionIds.size) {
      setError('请先选择题目再备份');
      return;
    }
    try {
      const response = await fetch('/api/backup', { credentials: 'include' });
      if (!response.ok) throw new Error('备份下载失败');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `review-center-backup-${new Date().toISOString().slice(0, 10)}.zip`; link.click();
      URL.revokeObjectURL(url); setNotice('题库备份已下载');
    } catch (e) { setError((e as Error).message); }
  };
  if (loading || !auth) return <div className="boot-screen"><div className="brand-mark"><BookOpen /></div><LoaderCircle className="spin" />正在打开题库…</div>;
  if (!auth.authenticated) return <AuthScreen expired={auth.expired} onAuthed={refreshAuth} />;
  if (auth.role === 'admin') return <AdminManagement onLogout={logout} />;
  const closeImport = () => setShowImport(null);
  const onImported = () => { refreshQuestions(); refreshPapers(); refreshTags(); };
  if (showImport === 'pdf') return <PdfImport onClose={closeImport} onSaved={onImported} papers={papers} scope={bankScope} onPaperCreated={onPaperCreated} />;
  if (showImport === 'image') return <ImageImport onClose={closeImport} onSaved={onImported} papers={papers} scope={bankScope} onPaperCreated={onPaperCreated} />;
  if (showImport === 'word') return <WordImport onClose={closeImport} onSaved={onImported} papers={papers} scope={bankScope} onPaperCreated={onPaperCreated} />;
  if (showImport === 'package') return <QuestionPackageImport onClose={closeImport} onImported={(result) => { setShowImport(null); void refreshQuestions(); void refreshPapers(); void refreshTags(); setNotice(`整卷导入完成：新增 ${result.imported} 道题，跳过 ${result.skipped} 道重复题`); }} />;
  if (showImport === 'choose') return <ImportChooser onBack={closeImport} scope={bankScope} canImportShared={Boolean(auth.account?.isClassAdmin)} onSelect={(mode) => setShowImport(mode)} />;

  return <>
    <div className={`app-shell ${printData ? 'printing' : ''}`}>
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark"><BookOpen size={20} /></div><div><strong>题集</strong><span>REVIEW CENTER</span></div></div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="main-nav">
          <button className={tab === 'library' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('library')}><Library size={18} /><span>题目库</span><span className="nav-count">{questions.length}</span></button>
          <button className={tab === 'practice' ? 'nav-item active' : 'nav-item'} onClick={() => { setPracticeQueueOverride(null); setTab('practice'); }}><ListChecks size={18} /><span>错题练习</span><span className="nav-count">{questions.filter((q) => q.inWrongSet).length}</span></button>
          <button className={tab === 'papers' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('papers')}><FileText size={18} /><span>试卷</span></button>
          {auth.account?.isClassAdmin && <button className={tab === 'members' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('members')}><Users size={18} /><span>班级成员</span></button>}
        </nav>
        <div className="sidebar-separator" />
        <div className="sidebar-label">SUBJECTS</div>
        <div className="subject-list">{SUBJECTS.slice(1).map((item, index) => <button key={item} className={subject === item ? 'subject-nav selected' : 'subject-nav'} onClick={() => { setSubject(subject === item ? '' : item); setTab('library'); }}><span className={`subject-dot dot-${index}`} />{item}<span>{questions.filter((q) => q.subject === item).length}</span></button>)}</div>
        <div className="sidebar-bottom"><div className="storage-card"><div className="storage-card-icon"><GraduationCap size={17} /></div><div><strong>{auth.account?.classroomName || '班级题库'}</strong><span>班级共享题目</span></div><span className="online-indicator" /></div><div className="sidebar-account-row"><button className="account-button" onClick={() => setProfileOpen(true)} title="个人账号设置"><span className="account-avatar">{auth.account?.displayName?.slice(0, 1) || '学'}{auth.account?.isClassAdmin && <span className="account-avatar-admin" title="班级管理员"><ShieldCheck size={14} /></span>}</span><span className="account-info"><strong>{auth.account?.displayName || '学生'}</strong><small>{auth.account?.isClassAdmin ? <><ShieldCheck size={12} className="inline-admin-icon" />班级管理员</> : '学生账号'}</small></span><Settings2 size={16} /></button><button className="account-logout" onClick={() => void logout()} aria-label="退出登录"><LogOut size={16} /><span>退出登录</span></button></div></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="breadcrumb"><span>学习空间</span><ChevronRight size={14} /><strong>{tab === 'library' ? '题目库' : tab === 'practice' ? '错题练习' : tab === 'papers' ? '试卷' : '班级成员'}</strong></div><div className="topbar-right"><span className="local-status"><span />服务器已连接</span><button className="button button-outline top-import" onClick={downloadBackup} disabled={!selectedQuestionIds.size} title={!selectedQuestionIds.size ? '请先选择题目再备份' : undefined}><Download size={15} />备份</button>{(bankScope === 'PERSONAL' || auth.account?.isClassAdmin) && <button className="button button-outline top-import" onClick={() => setShowImport('choose')}><Upload size={16} />导入题目</button>}</div></header>
        <div className="main-content">
          {tab === 'library' && <>
            <section className="welcome-row"><div><span className="eyebrow">YOUR STUDY LIBRARY</span><h1>{bankScope === 'PERSONAL' ? '我的个人题库' : '班级共享题库'}<span className="title-dot">.</span></h1><p>试卷决定题目的归属；个人练习记录只对当前学生可见。</p></div><div className="welcome-actions"><BankScopeSwitch scope={bankScope} onChange={(scope) => { setBankScope(scope); setPaperFilterId(''); }} />{(bankScope === 'PERSONAL' || auth.account?.isClassAdmin) && <button className="button button-primary add-question-button" onClick={() => setEditor({})}><Plus size={18} />创建空白题目</button>}</div></section>
            <section className="stat-row"><div className="stat-card"><span className="stat-icon stat-icon-green"><BookOpen size={17} /></span><span className="stat-label">当前题目</span><strong>{stats.total}<small>道</small></strong><span className="stat-caption">当前筛选结果</span></div><div className="stat-card"><span className="stat-icon stat-icon-coral"><CircleHelp size={17} /></span><span className="stat-label">待复习错题</span><strong>{stats.wrong}<small>道</small></strong><span className="stat-caption">至少有一次做错记录</span></div><div className="stat-card"><span className="stat-icon stat-icon-blue"><GraduationCap size={17} /></span><span className="stat-label">涉及科目</span><strong>{stats.subjects}<small>门</small></strong><span className="stat-caption">按科目持续整理</span></div><div className="stat-card stat-card-note"><span className="note-sparkle">✳</span><span className="note-title">小小建议</span><p>每次做错后写一句错因，下次复习会更有方向。</p></div></section>
            <section className="library-toolbar"><div className="section-title"><div><span className="eyebrow">COLLECTION</span><h2>全部题目 <span>{questions.length}</span></h2></div></div><div className="filter-controls"><label className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索题目、答案…" /><kbd>⌘ K</kbd></label><label className="filter-select"><Filter size={15} /><select value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">全部科目</option>{SUBJECTS.slice(1).map((s) => <option key={s}>{s}</option>)}</select></label><label className="filter-select"><Filter size={15} /><select value={questionType} onChange={(e) => setQuestionType(e.target.value)}><option value="">全部题型</option>{QUESTION_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><label className="filter-select"><FileText size={15} /><select value={paperFilterId} onChange={(e) => setPaperFilterId(e.target.value)}><option value="">全部来源</option>{papers.map((paper) => <option value={paper.id} key={paper.id}>{paper.title}</option>)}</select></label><label className="filter-select"><Tag size={15} /><select value={tag} onChange={(e) => setTag(e.target.value)}><option value="">所有知识点</option>{tags.map((t) => <option key={t.name}>{t.name}</option>)}</select></label></div></section>
            <section className="error-count-row"><div className="wrong-filter"><span>答错次数</span><select value={wrongCount} onChange={(e) => setWrongCount(e.target.value)}><option value="any">不限</option>{[1, 2, 3, 4, 5].map((n) => <option value={n} key={n}>{n} 次</option>)}</select><select value={wrongMode} onChange={(e) => setWrongMode(e.target.value as 'exact' | 'atLeast')} disabled={wrongCount === 'any'}><option value="exact">恰好</option><option value="atLeast">至少</option></select><label className="mastery-filter"><span>掌握程度</span><select value={masteryFilter} onChange={(e) => setMasteryFilter(e.target.value)}><option value="any">全部</option><option value="unrated">未评定</option><option value="1">1 · 还不会</option><option value="2">2 · 掌握较少</option><option value="3">3 · 一般</option><option value="4">4 · 基本掌握</option><option value="5">5 · 完全掌握</option></select></label></div><div className="toolbar-actions"><span className="results-label">{questions.length} 道题目</span><button className="button button-outline selection-control" onClick={selectAllVisibleQuestions} disabled={!questions.length || selectedQuestionIds.size === questions.length}><Check size={15} />全选当前结果</button><button className="button button-outline selection-control" onClick={clearQuestionSelection} disabled={!selectedQuestionIds.size}>清空选择</button>{selectedQuestionIds.size > 0 && deletableSelectedCount > 0 && <button className="button button-danger" onClick={removeSelectedQuestions} disabled={bulkDeleteBusy}>{bulkDeleteBusy ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}{bulkDeleteBusy ? '正在删除…' : `删除已选 ${deletableSelectedCount} 道`}</button>}{selectedQuestionIds.size > 0 && <button className="button button-accent" onClick={startSelectedPractice} title="只练习当前勾选的题目"><ListChecks size={16} />练习已选 {selectedQuestionIds.size} 题</button>}<button className="button button-outline" onClick={() => setExportOpen(true)} disabled={!questions.length}><Download size={16} />生成练习卷</button></div></section>
            {notice && <div className="inline-notice"><Check size={15} />{notice}<button onClick={() => setNotice('')}><X size={14} /></button></div>}{error && <div className="form-error inline-error">{error}<button onClick={() => setError('')}><X size={14} /></button></div>}
            {questions.length ? <div className="paper-question-groups">{questionGroups.map((group) => <section className="paper-question-group" key={group.paperId}><div className="paper-question-group-heading"><FileText size={16} /><h3>{group.title}</h3><span>{group.questions.length} 道题</span></div><div className="question-grid">{group.questions.map((question) => <QuestionCard key={question.id} question={question} selected={selectedQuestionIds.has(question.id)} canManageWrongSet onSelect={(selected) => toggleQuestionSelection(question.id, selected)} onEdit={() => editQuestion(question)} onDelete={() => removeQuestion(question)} onAssign={() => setAssignmentQuestion(question)} onToggleWrongSet={() => void toggleWrongSet(question)} onMasteryChange={(score) => void changeMastery(question, score)} onImageError={() => { void refreshAuth(); }} />)}</div></section>)}</div> : <div className="empty-state"><div className="empty-illustration"><BookOpen size={28} /><span>＋</span></div><span className="eyebrow">A FRESH START</span><h2>{bankScope === 'PERSONAL' ? '个人题库还很整洁' : '班级题库还没有题目'}</h2><p>{bankScope === 'PERSONAL' ? '创建个人试卷，或导入 PDF、图片和 Word 材料开始整理。' : '班级管理员可以创建试卷和空白题目，再分配给成员录入。'}</p>{(bankScope === 'PERSONAL' || auth.account?.isClassAdmin) && <div className="empty-actions"><button className="button button-primary" onClick={() => setShowImport('choose')}><Upload size={17} />导入题目</button><button className="button button-outline" onClick={() => setEditor({})}><Plus size={17} />创建空白题目</button></div>}</div>}
          </>}
          {tab === 'practice' && <>
            <section className="page-heading"><div><span className="eyebrow">PRACTICE ROOM</span><h1>错题练习</h1><p>个人题库和班级共享题库中的错题都会显示；练习记录只属于当前学生账号。</p></div><div className="practice-filter-inline"><label>科目<select value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">全部</option>{SUBJECTS.slice(1).map((s) => <option key={s}>{s}</option>)}</select></label><label>题型<select value={questionType} onChange={(e) => setQuestionType(e.target.value)}><option value="">全部</option>{QUESTION_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><label>知识点<select value={tag} onChange={(e) => setTag(e.target.value)}><option value="">全部</option>{tags.map((t) => <option key={t.name}>{t.name}</option>)}</select></label><label>答错<select value={wrongCount} onChange={(e) => setWrongCount(e.target.value)}><option value="any">不限</option>{[1, 2, 3, 4, 5].map((n) => <option value={n} key={n}>{n} 次</option>)}</select></label><label>掌握程度<select value={masteryFilter} onChange={(e) => setMasteryFilter(e.target.value)}><option value="any">未掌握筛选</option><option value="unrated">未评定</option><option value="1">1 · 还不会</option><option value="2">2 · 掌握较少</option><option value="3">3 · 一般</option><option value="4">4 · 基本掌握</option><option value="5">5 · 完全掌握</option></select></label></div></section><PracticeView questions={practiceQueueOverride ?? practiceQuestions} onAttempt={saveAttempt} onEdit={editQuestion} onRemoveWrongSet={(question) => void toggleWrongSet(question)} />
          </>}
          {tab === 'papers' && <>
            <section className="page-heading"><div><span className="eyebrow">PAPERS</span><h1>{bankScope === 'PERSONAL' ? '我的试卷' : '班级共享试卷'}</h1><p>{bankScope === 'PERSONAL' ? '个人试卷及题目只对当前学生可见，可导出整卷交给班级管理员导入。' : '班级内学生共用试卷和题目；每名学生的练习记录独立保存。'}</p></div><div className="page-heading-actions"><BankScopeSwitch scope={bankScope} onChange={(scope) => { setBankScope(scope); setPaperFilterId(''); }} />{(bankScope === 'PERSONAL' || auth.account?.isClassAdmin) && <button className="button button-primary" onClick={() => setShowImport('choose')}><Upload size={17} />导入题目</button>}</div></section>
            <PaperManagement papers={papers} scope={bankScope} canManage={bankScope === 'PERSONAL' || Boolean(auth.account?.isClassAdmin)} exportBusy={packageExportBusy} onChanged={() => { void refreshPapers(); void refreshQuestions(); void refreshTags(); }} onCreated={onPaperCreated} onExportPaper={async (paper) => {
              setPackageExportBusy(true); setError('');
              try {
                const response = await fetch('/api/question-packages/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ paperId: paper.id }) });
                if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload?.message || '整卷导出失败'); }
                const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${paper.title}.zip`; link.click(); URL.revokeObjectURL(url); setNotice(`已导出整卷「${paper.title}」`);
              } catch (e) { setError((e as Error).message); }
              finally { setPackageExportBusy(false); }
            }} onOpenQuestions={(paper) => { setPaperFilterId(paper.id); setTab('library'); }} />
          </>}
          {tab === 'members' && auth.account?.isClassAdmin && <ClassroomMembers currentAccountId={auth.account.id} onTransferred={() => { void refreshAuth(); setTab('library'); }} />}
          <footer className="page-footer"><span>题集 · REVIEW CENTER</span><span>一步一步，整理出自己的知识地图</span></footer>
        </div>
      </main>
      {editor && <QuestionEditor question={editor.question} initial={editor.initial} papers={papers} scope={bankScope} canCreatePaper={bankScope === 'PERSONAL' || Boolean(auth.account?.isClassAdmin)} onPaperCreated={onPaperCreated} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); refreshQuestions(); refreshTags(); refreshPapers(); setNotice('题目已保存'); }} />}
      {assignmentQuestion && <EditorAssignmentDialog question={assignmentQuestion} onClose={() => setAssignmentQuestion(null)} onSaved={() => { refreshQuestions(); setNotice('编辑成员已更新'); }} />}
      {exportOpen && <ExportDialog questions={questions} onClose={() => setExportOpen(false)} />}
      {profileOpen && auth.account && <ProfileSettings profile={{ displayName: auth.account.displayName, username: auth.account.username }} onClose={() => setProfileOpen(false)} onSaved={async () => { await refreshAuth(); }} />}
    </div>
    {confirmDialog}
    {printData && <div className="print-document"><header><h1>{printData.answers ? '答案与解析' : '练习卷'}</h1><p>姓名：________________　日期：________________　得分：________</p></header>{printData.items.map((question, index) => <article key={question.id} className="print-question"><h2>{index + 1}. <span>{question.subject}{question.questionType ? ` · ${question.questionType}` : ''}</span></h2><Markdown images={question.images.map((image) => ({ src: imageUrl(image.fileName), alt: image.originalName, rotation: image.rotation, displayScale: image.displayScale }))}>{question.content}</Markdown>{unreferencedImageIndexes(question.content, question.images.length).map((number) => <img key={question.images[number - 1].id} src={imageUrl(question.images[number - 1].fileName)} alt={question.images[number - 1].originalName || `题图 ${number}`} />)}{printData.answers && <div className="print-answer"><strong>答案</strong><Markdown>{question.answer || '（未录入）'}</Markdown>{question.explanation && <><strong>解析</strong><Markdown>{question.explanation}</Markdown></>}</div>}</article>)}</div>}
  </>;
}
