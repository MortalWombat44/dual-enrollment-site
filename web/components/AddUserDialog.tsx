'use client';
import Link from 'next/link';
import { useState } from 'react';

type School = { id: number; name: string; designation: string };

export function AddUserDialog({ action, schools, error }: { action: (fd: FormData) => Promise<void>; schools: School[]; error?: string }) {
  const [role, setRole] = useState('counselor');
  const [school, setSchool] = useState<number>(schools[0]?.id ?? 0);
  const [level, setLevel] = useState('college');
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="add-user-title">
      <form action={action} className="modal">
        <div className="modal-head">
          <h2 id="add-user-title">Add user</h2>
          <p>You'll get an invite link to send them so they can set a password. Parents are invited by their student.</p>
        </div>
        <div className="modal-body">
          {error && <div className="flash flash-err" style={{ padding: '10px 14px' }}>{error}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label htmlFor="first">First name</label><input id="first" name="first" className="input" required autoFocus /></div>
            <div className="field"><label htmlFor="last">Last name</label><input id="last" name="last" className="input" required /></div>
          </div>
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" required /></div>
          <div className="field">
            <label>Role</label>
            <div className="seg seg-ink" style={{ display: 'flex' }} role="radiogroup" aria-label="Role">
              {['student', 'counselor', 'admin'].map((r) => (
                <label key={r} className="seg-opt" style={{ flex: 1 }}>
                  <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
                  {r[0].toUpperCase() + r.slice(1)}
                </label>
              ))}
            </div>
          </div>
          {role !== 'admin' ? (
            <div className="field">
              <label htmlFor="school">School</label>
              <select id="school" name="school" className="input" value={school} onChange={(e) => setSchool(Number(e.target.value))}>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.designation === 'CCAP' ? 'CCAP' : 'Non-CCAP'}</option>)}
              </select>
            </div>
          ) : (
            <>
              <div className="field">
                <label>Admin level</label>
                <div className="seg seg-ink" style={{ display: 'flex' }} role="radiogroup" aria-label="Admin level">
                  <label className="seg-opt" style={{ flex: 1 }}><input type="radio" name="admin_level" value="college" checked={level === 'college'} onChange={() => setLevel('college')} />College admin</label>
                  <label className="seg-opt" style={{ flex: 1 }}><input type="radio" name="admin_level" value="super" checked={level === 'super'} onChange={() => setLevel('super')} />Super admin</label>
                </div>
                <div className="ink60" style={{ fontSize: 12, marginTop: 6 }}>
                  {level === 'college' ? 'Works with students at every school: clears units, moves steps, requests classes, changes schools.' : 'Everything a college admin does, plus users, schools, admins and the registration date.'}
                </div>
              </div>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" name="college_counselor" style={{ width: 18, height: 18, accentColor: 'var(--color-accent)' }} />
                College counselor (approves classes with a prerequisite)
              </label>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-primary" style={{ minWidth: 200, justifyContent: 'space-between', padding: '12px 16px' }}>Create invite <span>→</span></button>
          <Link href="/admin/users" className="btn btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
