interface ProposalDiffProps {
  before: {
    participants: string[];
    finalScores: Record<string, number>;
    competitionIds: string[];
  };
  after: {
    participants: string[];
    finalScores: Record<string, number>;
    competitionIds: string[];
  };
}

export function ProposalDiff({ before, after }: ProposalDiffProps) {
  const allUsers = Array.from(new Set([...before.participants, ...after.participants]));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h4 className="text-sm font-semibold">Proposed Changes</h4>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="text-xs uppercase text-slate-500">Before</p>
          <p className="text-sm text-slate-700">Players: {before.participants.join(', ')}</p>
          <p className="text-sm text-slate-700">
            Competition: {before.competitionIds.length ? before.competitionIds.join(', ') : 'None'}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">After</p>
          <p className="text-sm text-slate-700">Players: {after.participants.join(', ')}</p>
          <p className="text-sm text-slate-700">
            Competition: {after.competitionIds.length ? after.competitionIds.join(', ') : 'None'}
          </p>
        </div>
      </div>
      <div className="mt-3 overflow-hidden rounded border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-1 text-left">User</th>
              <th className="px-2 py-1 text-left">Before</th>
              <th className="px-2 py-1 text-left">After</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.map((userId) => (
              <tr key={userId} className="border-t border-slate-100">
                <td className="px-2 py-1 font-medium">{userId}</td>
                <td className="px-2 py-1">{before.finalScores[userId] ?? '-'}</td>
                <td className="px-2 py-1">{after.finalScores[userId] ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
