import 'server-only';
import { db } from './db';
import type { User } from './auth';
import { currentClassYear, currentGrade } from './workflow';
import { csvCell as q } from './csv';

export const canExportSeniors = (me: User) => me.role === 'admin' && (me.admin_level === 'super' || me.is_college_counselor === 1);

const PLANS = { yes: 'Yes', no: 'No', unsure: 'Not sure yet' } as const;

/** This school year's 12th graders who answered "Do you plan to attend Shasta College after high school?". */
export function seniorsWithPlans() {
  const year = currentClassYear();
  const rows = db().prepare(`SELECT u.id, u.first_name, u.last_name, u.email, u.grade, u.grad_year, u.grade_confirmed_year, u.student_number, u.date_of_birth, u.phone,
      u.address_line, u.city, u.state, u.zip, u.plans_shasta, u.plans_year, u.plans_at, s.name AS school_name FROM users u LEFT JOIN schools s ON s.id = u.school_id
    WHERE u.role = 'student' AND u.disabled = 0 AND u.plans_year = ? ORDER BY u.last_name, u.first_name`).all(year) as (User & { school_name: string | null; plans_at: string | null })[];
  return rows.filter((u) => currentGrade(u) === 12);
}

export function seniorsCsv(): string {
  const head = ['Last name', 'First name', 'Plans to attend Shasta College', 'Answered', 'High school', 'Class of', 'Shasta College ID', 'Email', 'Phone', 'Street', 'City', 'State', 'ZIP', 'Date of birth'];
  const lines = seniorsWithPlans().map((u) => [u.last_name, u.first_name, u.plans_shasta ? PLANS[u.plans_shasta] : '', (u.plans_at ?? '').slice(0, 10), u.school_name, u.grad_year,
    u.student_number, u.email, u.phone, u.address_line, u.city, u.state, u.zip, u.date_of_birth].map(q).join(','));
  return '﻿' + [head.map(q).join(','), ...lines].join('\r\n') + '\r\n';
}
