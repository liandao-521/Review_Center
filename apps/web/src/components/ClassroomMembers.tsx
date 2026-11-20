import { useEffect, useState } from 'react';
import { Check, LoaderCircle, ShieldCheck, Users } from 'lucide-react';
import { api } from '../api';
import { useConfirmDialog } from './ConfirmDialog';

type Member = { id: string; username: string; displayName: string; active: boolean; expiresAt: string | null; isClassAdmin: boolean; createdAt: string };

export function ClassroomMembers({ currentAccountId, onTransferred }: { currentAccountId: string; onTransferred: () => void }) {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = async () => setMembers(await api<Member[]>('/classroom/members'));
  useEffect(() => { void refresh().catch((e) => setError((e as Error).message)); }, []);

  const transfer = async (member: Member) => {
    if (!await confirm({ title: '转交班级管理员身份？', message: `将班级管理员身份转交给「${member.displayName}」？转交后你将失去班级管理权限。`, confirmLabel: '确认转交', danger: true })) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/classroom/transfer-admin', { method: 'POST', body: JSON.stringify({ accountId: member.id }) });
      setNotice(`管理员身份已转交给 ${member.displayName}`);
      await refresh();
      onTransferred();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const isExpired = (member: Member) => Boolean(member.expiresAt && new Date(member.expiresAt) < new Date());
  return <section className="class-members-page">
    <section className="page-heading"><div><span className="eyebrow">CLASSROOM MEMBERS</span><h1>班级成员</h1><p>查看本班学生账号和班级管理员。可将你的管理员身份转交给一位有效的同班成员。</p></div><div className="member-count"><Users size={17} />{members.length} 个成员</div></section>
    {notice && <div className="inline-notice"><Check size={15} />{notice}</div>}{error && <div className="form-error inline-error">{error}</div>}
    <div className="class-member-list">{members.map((member) => <article className={`class-member-row ${!member.active || isExpired(member) ? 'inactive' : ''}`} key={member.id}>
      <div className="class-member-avatar">{member.displayName.slice(0, 1)}{member.isClassAdmin && <span className="class-admin-icon" title="班级管理员"><ShieldCheck size={14} /></span>}</div>
      <div className="class-member-info"><strong>{member.displayName}{member.id === currentAccountId ? '（我）' : ''}</strong><span>账号 {member.username}</span></div>
      <span className={`member-role ${member.isClassAdmin ? 'admin' : ''}`}>{member.isClassAdmin && <ShieldCheck size={14} />}{member.isClassAdmin ? '班级管理员' : '班级成员'}</span>
      <span className="member-account-state">{!member.active ? '已停用' : isExpired(member) ? '已到期' : '有效'}</span>
      {member.isClassAdmin && member.id !== currentAccountId && <span className="member-admin-note">管理员</span>}
      {!member.isClassAdmin && member.id !== currentAccountId && <button className="button button-outline button-small" disabled={busy || !member.active || isExpired(member)} onClick={() => void transfer(member)}>{busy ? <LoaderCircle className="spin" size={14} /> : <ShieldCheck size={14} />}转交管理员身份</button>}
    </article>)}</div>
    <p className="member-management-note">系统管理员也可以在平台管理界面为班级指定管理员；每班最多 3 位。转交操作会把你当前的管理员名额交给所选成员。</p>
    {confirmDialog}
  </section>;
}
