import Link from 'next/link';

import { StatusBadge } from '@/components/StatusBadge';
import { Card } from '@/components/ui/Card';
import type { GameStatus } from '@/domain/models';

interface GameCardProps {
  id: string;
  participants: string[];
  status: GameStatus;
  competitionIds: string[];
}

export function GameCard({ id, participants, status, competitionIds }: GameCardProps) {
  return (
    <Link href={`/games/${id}`} className="block">
      <Card className="shadow-sm transition-shadow hover:shadow">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Game {id.slice(0, 8)}</h3>
          <StatusBadge status={status} />
        </div>
        <p className="mt-2 text-sm text-slate-600">Participants: {participants.join(', ')}</p>
        <p className="mt-1 text-sm text-slate-600">
          Competition: {competitionIds.length ? competitionIds.join(', ') : 'No competition'}
        </p>
      </Card>
    </Link>
  );
}
