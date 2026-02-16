import clsx from 'clsx';

import type { GameStatus, ProposalStatus } from '@/domain/models';

type Status =
  | GameStatus
  | ProposalStatus
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'draft'
  | 'active'
  | 'archived'
  | 'awaiting_result'
  | 'completed'
  | 'scheduled';

const statusStyles: Record<Status, string> = {
  pending_validation: 'bg-amber-100 text-amber-900',
  validated: 'bg-emerald-100 text-emerald-900',
  disputed: 'bg-rose-100 text-rose-900',
  cancelled: 'bg-slate-200 text-slate-700',
  accepted: 'bg-emerald-100 text-emerald-900',
  expired: 'bg-slate-200 text-slate-700',
  pending: 'bg-amber-100 text-amber-900',
  approved: 'bg-emerald-100 text-emerald-900',
  rejected: 'bg-rose-100 text-rose-900',
  draft: 'bg-slate-200 text-slate-700',
  active: 'bg-sky-100 text-sky-900',
  archived: 'bg-slate-200 text-slate-700',
  awaiting_result: 'bg-indigo-100 text-indigo-900',
  completed: 'bg-emerald-100 text-emerald-900',
  scheduled: 'bg-slate-100 text-slate-700'
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide',
        statusStyles[status]
      )}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}
