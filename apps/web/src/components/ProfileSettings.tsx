import { FormEvent, useState } from 'react';
import { Check, LoaderCircle, Save, UserRound, X } from 'lucide-react';
import { api } from '../api';

type Profile = { displayName: string; username: string };

export function ProfileSettings({ profile, onClose, onSaved }: {
  profile: Profile;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setNotice('');
    if (newPassword && newPassword !== confirmPassword) { setError('两次输入的新密码不一致'); return; }
    if (newPassword && !currentPassword) { setError('修改密码前请先输入当前密码'); return; }
    setBusy(true);
    try {
      await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ displayName, ...(newPassword ? { currentPassword, newPassword } : {}) }) });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      await onSaved(); setNotice('账号资料已保存');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="profile-dialog" onSubmit={submit}>
      <header className="editor-header"><div><span className="eyebrow">ACCOUNT SETTINGS</span><h2>个人账号</h2></div><button className="icon-button" type="button" aria-label="关闭" onClick={onClose}><X size={18} /></button></header>
      <div className="profile-dialog-body">
        <div className="profile-identity"><span className="profile-identity-avatar"><UserRound size={18} /></span><div><strong>{profile.username}</strong><small>登录账号</small></div></div>
        <label>姓名<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} required /></label>
        <div className="profile-password-section"><div><strong>修改密码</strong><small>留空表示不修改密码</small></div><label>当前密码<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></label><label>新密码<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={import.meta.env.PROD ? 8 : 1} maxLength={128} /></label><label>确认新密码<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label></div>
        {error && <div className="form-error">{error}</div>}{notice && <div className="inline-notice"><Check size={14} />{notice}</div>}
      </div>
      <footer className="editor-footer profile-dialog-footer"><span /><button className="button button-outline" type="button" onClick={onClose}>取消</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}保存</button></footer>
    </form>
  </div>;
}
