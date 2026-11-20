import { FormEvent, useEffect, useState } from 'react';
import { Check, GraduationCap, LoaderCircle, LogOut, Plus, RefreshCw, Search, Shield, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { api } from '../api';
import { useConfirmDialog } from './ConfirmDialog';

type Classroom = { id: string; name: string; _count?: { accounts: number; papers: number } };
type StudentAccount = { id: string; username: string; displayName: string; classroomId: string; expiresAt: string | null; active: boolean; isClassAdmin: boolean; classroom: Classroom };

export function AdminManagement({ onLogout }: { onLogout: () => void }) {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [activePage, setActivePage] = useState<'classes' | 'accounts'>('classes');
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [accounts, setAccounts] = useState<StudentAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(() => new Set());
  const [accountClassFilter, setAccountClassFilter] = useState('');
  const [className, setClassName] = useState('');
  const [classEdits, setClassEdits] = useState<Record<string, string>>({});
  const [newAccount, setNewAccount] = useState({ username: '', displayName: '', password: '', classroomId: '', expiresAt: '' });
  const [edits, setEdits] = useState<Record<string, { displayName: string; classroomId: string; expiresAt: string; password: string }>>({});
  const [classSearch, setClassSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [classItems, accountItems] = await Promise.all([api<Classroom[]>('/admin/classes'), api<StudentAccount[]>('/admin/accounts')]);
    setClasses(classItems); setAccounts(accountItems);
    setClassEdits(Object.fromEntries(classItems.map((room) => [room.id, room.name])));
    setNewAccount((item) => ({ ...item, classroomId: classItems.some((room) => room.id === item.classroomId) ? item.classroomId : classItems[0]?.id || '' }));
    setEdits(Object.fromEntries(accountItems.map((account) => [account.id, {
      displayName: account.displayName,
      classroomId: account.classroomId,
      expiresAt: account.expiresAt ? new Date(account.expiresAt).toISOString().slice(0, 10) : '',
      password: '',
    }])));
  };
  useEffect(() => { void refresh().catch((e) => setError((e as Error).message)); }, []);
  useEffect(() => { setSelectedAccountIds(new Set()); }, [accountClassFilter, studentSearch]);
  useEffect(() => {
    if (accountClassFilter && classes.some((room) => room.id === accountClassFilter)) {
      setNewAccount((item) => ({ ...item, classroomId: accountClassFilter }));
    }
  }, [accountClassFilter, classes]);

  const createClass = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { await api('/admin/classes', { method: 'POST', body: JSON.stringify({ name: className }) }); setClassName(''); await refresh(); setNotice('班级已创建'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const renameClass = async (room: Classroom) => {
    setError(''); setBusy(true);
    try { await api(`/admin/classes/${room.id}`, { method: 'PATCH', body: JSON.stringify({ name: classEdits[room.id] }) }); await refresh(); setNotice('班级名称已更新'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const deleteClass = async (room: Classroom) => {
    if (!await confirm({ title: '删除班级？', message: `确定删除班级「${room.name}」吗？`, confirmLabel: '删除班级', danger: true })) return;
    setError(''); setBusy(true);
    try { await api(`/admin/classes/${room.id}`, { method: 'DELETE' }); await refresh(); setNotice('班级已删除'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const createAccount = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const currentClasses = await api<Classroom[]>('/admin/classes');
      setClasses(currentClasses);
      const selectedClassExists = currentClasses.some((room) => room.id === newAccount.classroomId);
      if (!selectedClassExists) {
        setNewAccount((item) => ({ ...item, classroomId: currentClasses[0]?.id ?? '' }));
        setError(currentClasses.length ? '班级列表刚刚更新，已刷新可选班级；请确认所属班级后重新创建。' : '当前没有可选班级，请先创建班级。');
        return;
      }
      await api('/admin/accounts', { method: 'POST', body: JSON.stringify(newAccount) });
      setNewAccount((item) => ({ ...item, username: '', displayName: '', password: '', expiresAt: '' }));
      await refresh(); setShowCreateAccount(false); setNotice('学生账号已创建');
    } catch (e) {
      const message = (e as Error).message;
      if (message === '所选班级不存在') {
        try { await refresh(); setError('所选班级已不存在，班级列表已刷新；请重新选择后再试。'); }
        catch { setError(message); }
      } else setError(message);
    }
    finally { setBusy(false); }
  };
  const saveAccount = async (account: StudentAccount) => {
    const edit = edits[account.id]; if (!edit) return;
    if (edit.classroomId !== account.classroomId) {
      const nextClass = classes.find((room) => room.id === edit.classroomId)?.name ?? '所选班级';
      const adminNotice = account.isClassAdmin ? '该学生的班级管理员身份也会取消。' : '';
      if (!await confirm({ title: '确认转班？', message: `将「${account.displayName}」从「${account.classroom.name}」转到「${nextClass}」？\n\n该学生错题集中关联原班级共享题目的条目将被清除，原班级题目不会被删除。${adminNotice}`, confirmLabel: '确认转班', danger: true })) return;
    }
    setError(''); setBusy(true);
    try {
      await api(`/admin/accounts/${account.id}`, { method: 'PATCH', body: JSON.stringify({ displayName: edit.displayName, classroomId: edit.classroomId, expiresAt: edit.expiresAt || null, ...(edit.password ? { password: edit.password } : {}) }) });
      await refresh(); setNotice(`已保存学生账号 ${account.username}`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const toggleAccount = async (account: StudentAccount) => {
    setError(''); setBusy(true);
    try { await api(`/admin/accounts/${account.id}`, { method: 'PATCH', body: JSON.stringify({ active: !account.active }) }); await refresh(); setNotice(account.active ? '学生账号已停用' : '学生账号已启用'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const deleteAccount = async (account: StudentAccount) => {
    if (!await confirm({
      title: `删除学生账号「${account.displayName}」？`,
      message: '该账号的个人试卷、题目图片、练习记录、错题集和掌握度都会永久删除。班级共享试卷和题目会保留；如果该学生创建过共享内容，创建者标记会转给同班其他学生。',
      confirmLabel: '永久删除账号',
      danger: true,
    })) return;
    setError(''); setBusy(true);
    try {
      await api(`/admin/accounts/${account.id}`, { method: 'DELETE' });
      await refresh(); setNotice(`学生账号 ${account.username} 已删除`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const deleteSelectedAccounts = async () => {
    const ids = [...selectedAccountIds].filter((id) => visibleAccounts.some((account) => account.id === id));
    if (!ids.length) return;
    if (!await confirm({
      title: `删除选中的 ${ids.length} 个学生账号？`,
      message: '这些账号的个人试卷、题目图片、练习记录、错题集和掌握度都会永久删除。班级共享试卷和题目会保留；创建者标记会转给未选中的同班学生。若某班级所有学生都被选中且仍有他们创建的共享内容，删除会被阻止，不会产生部分删除。',
      confirmLabel: `永久删除 ${ids.length} 个账号`,
      danger: true,
    })) return;
    setError(''); setBusy(true);
    try {
      const result = await api<{ deleted: number }>('/admin/accounts', { method: 'DELETE', body: JSON.stringify({ ids }) });
      setSelectedAccountIds(new Set());
      await refresh(); setNotice(`已删除 ${result.deleted} 个学生账号`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const toggleClassAdmin = async (account: StudentAccount) => {
    setError(''); setBusy(true);
    try { await api(`/admin/accounts/${account.id}`, { method: 'PATCH', body: JSON.stringify({ isClassAdmin: !account.isClassAdmin }) }); await refresh(); setNotice(account.isClassAdmin ? '已取消班级管理员权限' : `已设置 ${account.displayName} 为班级管理员`); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const updateField = (id: string, field: 'displayName' | 'classroomId' | 'expiresAt' | 'password', value: string) => setEdits((items) => ({ ...items, [id]: { ...items[id], [field]: value } }));
  const visibleClasses = classes.filter((room) => room.name.toLocaleLowerCase().includes(classSearch.trim().toLocaleLowerCase()));
  const visibleAccounts = accounts.filter((account) =>
    (!accountClassFilter || account.classroomId === accountClassFilter)
    && `${account.displayName} ${account.username}`.toLocaleLowerCase().includes(studentSearch.trim().toLocaleLowerCase()),
  );

  return <main className="admin-page">
    <header className="admin-topbar"><div className="admin-brand"><span className="brand-mark"><Shield size={20} /></span><div><strong>平台管理</strong><small>班级共享题库 · 学生账号</small></div></div><button className="button button-outline" onClick={onLogout}><LogOut size={16} />退出管理员</button></header>
    <div className="admin-content"><nav className="admin-page-nav" aria-label="平台管理页面"><button className={activePage === 'classes' ? 'active' : ''} onClick={() => setActivePage('classes')}><GraduationCap size={17} />班级管理</button><button className={activePage === 'accounts' ? 'active' : ''} onClick={() => setActivePage('accounts')}><Users size={16} />学生账号</button></nav><section className="admin-heading"><div><span className="eyebrow">ADMINISTRATION</span><h1>{activePage === 'classes' ? '班级管理' : '学生账号管理'}</h1><p>{activePage === 'classes' ? '创建、重命名或删除班级。每班最多设置 3 位班级管理员。' : '管理学生账号、所属班级、有效期和班级管理员权限。'}</p></div><div className="admin-heading-actions">{activePage === 'accounts' && <button className="button button-primary" onClick={() => { setError(''); setShowCreateAccount(true); }}><Plus size={15} />新增学生账号</button>}<button className="button button-outline" onClick={() => void refresh().catch((e) => setError((e as Error).message))}><RefreshCw size={15} />刷新</button></div></section>
      {error && <div className="form-error">{error}</div>}{notice && <div className="inline-notice"><Check size={15} />{notice}</div>}
      {activePage === 'classes' && <section className="admin-card"><div className="admin-section-title"><div><span className="eyebrow">CLASSROOMS</span><h2>班级</h2></div><span>{classes.length} 个班级</span></div>
        <label className="admin-search"><Search size={15} /><input value={classSearch} onChange={(event) => setClassSearch(event.target.value)} placeholder="搜索班级名称" /><span>{visibleClasses.length} / {classes.length}</span></label>
        <div className="admin-class-list">{visibleClasses.map((room) => <article className="admin-class-row" key={room.id}><div><input aria-label={`${room.name}班级名称`} value={classEdits[room.id] ?? room.name} onChange={(event) => setClassEdits((items) => ({ ...items, [room.id]: event.target.value }))} /><small>{room._count?.accounts ?? 0} 名学生 · {room._count?.papers ?? 0} 份共享试卷</small></div><div className="admin-row-actions"><button className="button button-outline button-small" onClick={() => { setAccountClassFilter(room.id); setActivePage('accounts'); }}><Users size={14} />管理成员</button><button className="button button-outline button-small" onClick={() => void renameClass(room)} disabled={busy || classEdits[room.id] === room.name}>保存</button><button className="icon-button danger-icon" title="删除空班级" onClick={() => void deleteClass(room)} disabled={busy || Boolean(room._count?.accounts || room._count?.papers)}><Trash2 size={15} /></button></div></article>)}</div>
        {!visibleClasses.length && <p className="admin-search-empty">没有匹配的班级</p>}
        <form className="admin-inline-form" onSubmit={createClass}><label>新增班级名称<input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="例如：八年级 2 班" required /></label><button className="button button-outline" disabled={busy}><Plus size={15} />创建班级</button></form>
      </section>}
      {activePage === 'accounts' && <section className="admin-card"><div className="admin-section-title"><div><span className="eyebrow">STUDENT ACCOUNTS</span><h2>学生账号</h2></div><div className="admin-account-list-controls"><label>按班级筛选<select value={accountClassFilter} onChange={(event) => setAccountClassFilter(event.target.value)}><option value="">全部班级</option>{classes.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><span><Users size={15} />{visibleAccounts.length}{accountClassFilter ? ` / ${accounts.length}` : ''} 个账号</span></div></div>
        <label className="admin-search"><Search size={15} /><input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="搜索学生姓名或登录账号" /><span>{visibleAccounts.length} / {accounts.length}</span></label>
        <div className="admin-bulk-toolbar"><label><input type="checkbox" checked={visibleAccounts.length > 0 && visibleAccounts.every((account) => selectedAccountIds.has(account.id))} onChange={(event) => setSelectedAccountIds(event.target.checked ? new Set(visibleAccounts.map((account) => account.id)) : new Set())} />全选当前结果</label><span>已选 {selectedAccountIds.size} 人</span><button className="button button-danger button-small" onClick={() => void deleteSelectedAccounts()} disabled={busy || !selectedAccountIds.size}><Trash2 size={14} />删除已选</button></div>
        <div className="admin-account-list">{visibleAccounts.map((account) => { const edit = edits[account.id]; const expired = Boolean(account.expiresAt && new Date(account.expiresAt) < new Date()); return <article className={`admin-account-row ${!account.active || expired ? 'inactive' : ''}`} key={account.id}>
          <div className="admin-account-title"><label className="student-account-check" title="选择学生账号"><input type="checkbox" checked={selectedAccountIds.has(account.id)} onChange={(event) => setSelectedAccountIds((current) => { const next = new Set(current); event.target.checked ? next.add(account.id) : next.delete(account.id); return next; })} /></label><strong>{account.displayName}</strong><span className="admin-account-status">{account.isClassAdmin ? <><ShieldCheck size={13} />班级管理员</> : !account.active ? '已停用' : expired ? '已到期' : '有效'}</span><small>账号 {account.username} · {account.classroom.name}</small><div className="admin-row-actions"><button className="button button-outline button-small" onClick={() => void toggleClassAdmin(account)} disabled={busy || (!account.isClassAdmin && accounts.filter((item) => item.classroomId === account.classroomId && item.isClassAdmin).length >= 3)}> {account.isClassAdmin ? '取消班级管理员' : '设为班级管理员'}</button><button className="button button-danger button-small" onClick={() => void deleteAccount(account)} disabled={busy}><Trash2 size={13} />删除账号</button></div></div>
          {edit && <div className="admin-account-edit"><label>学生姓名<input value={edit.displayName} onChange={(e) => updateField(account.id, 'displayName', e.target.value)} /></label><label>所属班级<select value={edit.classroomId} onChange={(e) => updateField(account.id, 'classroomId', e.target.value)}>{classes.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><label>到期日期<input type="date" value={edit.expiresAt} onChange={(e) => updateField(account.id, 'expiresAt', e.target.value)} /></label><label>重置密码<input type="password" value={edit.password} onChange={(e) => updateField(account.id, 'password', e.target.value)} placeholder="留空则不修改" /></label><div className="admin-row-actions"><button className="button button-outline button-small" onClick={() => void saveAccount(account)} disabled={busy}>保存</button><button className="button button-outline button-small" onClick={() => void toggleAccount(account)} disabled={busy}>{account.active ? '停用' : '启用'}</button></div></div>}
        </article>; })}</div>
        {!visibleAccounts.length && <p className="admin-search-empty">没有匹配的学生账号</p>}
      </section>}
      {showCreateAccount && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowCreateAccount(false)}><form className="admin-create-account-dialog" onSubmit={createAccount}><header><div><span className="eyebrow">NEW STUDENT</span><h2>新增学生账号</h2></div><button className="icon-button" type="button" aria-label="关闭" onClick={() => setShowCreateAccount(false)}><X size={18} /></button></header><div className="admin-account-fields"><label>学生姓名<input value={newAccount.displayName} onChange={(e) => setNewAccount({ ...newAccount, displayName: e.target.value })} placeholder="例如：张同学" required /></label><label>登录账号<input value={newAccount.username} onChange={(e) => setNewAccount({ ...newAccount, username: e.target.value })} placeholder="3 到 32 位英文或数字" required minLength={3} /></label><label>初始密码<input type="password" value={newAccount.password} onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })} placeholder={import.meta.env.PROD ? '至少 8 位' : '测试环境可用简单密码'} required minLength={import.meta.env.PROD ? 8 : 1} /></label><label>所属班级<select value={newAccount.classroomId} onChange={(e) => setNewAccount({ ...newAccount, classroomId: e.target.value })} required>{classes.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><label>到期日期<input type="date" value={newAccount.expiresAt} onChange={(e) => setNewAccount({ ...newAccount, expiresAt: e.target.value })} required /></label></div>{error && <div className="form-error">{error}</div>}<footer><button className="button button-outline" type="button" onClick={() => setShowCreateAccount(false)}>取消</button><button className="button button-primary" disabled={busy || !classes.length}><Plus size={15} />创建学生账号</button></footer></form></div>}
      {activePage === 'accounts' && <p className="admin-footnote">管理员密码由服务器的 <code>ADMIN_PASSWORD</code> 环境变量设置。学生账号到期或停用后，其现有登录会话会立即失效。</p>}
    </div>
    {confirmDialog}
  </main>;
}
