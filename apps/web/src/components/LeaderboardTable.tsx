import type { LeaderboardEntry } from '@/domain/models';

export function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  const ordered = [...entries].sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            <th className="px-3 py-2">Rank</th>
            <th className="px-3 py-2">User</th>
            <th className="px-3 py-2">Points</th>
            <th className="px-3 py-2">Games</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((entry, index) => (
            <tr key={entry.userId} className="border-t border-slate-100">
              <td className="px-3 py-2">{index + 1}</td>
              <td className="px-3 py-2 font-medium">{entry.userId}</td>
              <td className="px-3 py-2">{entry.totalPoints.toFixed(1)}</td>
              <td className="px-3 py-2">{entry.gamesPlayed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
