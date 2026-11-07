'use client';
import Link from 'next/link';
import { useState } from 'react';

type School = { id: number; name: string; designation: string };
type Student = { id: number; name: string; school_id: number };

export function AddUserDialog({ action, schools, students, error }: { action: (fd: FormData) => Promise<void>; schools: School[]; students: Student[]; error?: string }) {
  const [role, setRole] = useState('counselor');
  const [school, setSchool] = useState<number>(schools[0]?.id ?? 0);
  const kids = students.filter((s) => s.school_id === school);
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="add-user-title">
      <form action={action} className="modal">
        <div className="modal-head">
          <h2 id="add-user-title">Add user</h2>
          <p>You'll get an invite link to send them so they can set a password.</p>
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
              {['student', 'parent', 'counselor', 'admin'].map((r) => (
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
            <div className="field"><label>School</label><div className="input" style={{ display: 'flex', alignItems: 'center' }}>Shasta College</div></div>
          )}
          {role === 'parent' && (
            <div className="field">
              <label htmlFor="student">Parent of</label>
              <select id="student" name="student" className="input" defaultValue="">
                <option value="">Link a student later</option>
                {kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
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
