'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { collection, getDocs } from 'firebase/firestore';

import { submitGameCreateProposal } from '@/lib/callables';
import { db } from '@/lib/firebaseClient';

interface MemberOption {
  id: string;
  displayNameCache?: string;
}

const schema = z.object({
  participants: z.array(z.string()).length(4, 'Select exactly 4 participants'),
  scores: z.record(z.coerce.number())
});

type FormValues = z.infer<typeof schema>;

interface CompetitionGameProposalFormProps {
  clubId: string;
  competitionId: string;
  expectedScoreSum: number;
  onSubmitted?: () => Promise<void> | void;
}

export function CompetitionGameProposalForm({
  clubId,
  competitionId,
  expectedScoreSum,
  onSubmitted
}: CompetitionGameProposalFormProps) {
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const {
    handleSubmit,
    watch,
    setValue,
    register,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      participants: [],
      scores: {}
    }
  });

  const selectedParticipants = watch('participants');
  const participantsSet = useMemo(() => new Set(selectedParticipants), [selectedParticipants]);

  useEffect(() => {
    getDocs(collection(db, `clubs/${clubId}/members`))
      .then((snapshot) =>
        setMembers(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            displayNameCache: docSnap.data().displayNameCache
          }))
        )
      )
      .catch((error) => setMessage((error as { message?: string }).message ?? 'Failed to load club members.'));
  }, [clubId]);

  const toggleParticipant = (userId: string) => {
    const next = new Set(selectedParticipants);
    if (next.has(userId)) {
      next.delete(userId);
    } else if (next.size < 4) {
      next.add(userId);
    }

    setValue('participants', Array.from(next));
  };

  const onSubmit = async (values: FormValues) => {
    setMessage(null);

    const finalScores: Record<string, number> = {};
    for (const participant of values.participants) {
      finalScores[participant] = Number(values.scores[participant]);
    }

    const scoreSum = Object.values(finalScores).reduce((sum, score) => sum + score, 0);
    if (scoreSum !== expectedScoreSum) {
      setMessage(`Score sum must be exactly ${expectedScoreSum}.`);
      return;
    }

    try {
      const result = (await submitGameCreateProposal({
        clubId,
        participants: values.participants,
        finalScores,
        competitionIds: [competitionId]
      })) as { status?: string };

      setMessage(
        result.status === 'validated'
          ? 'Game recorded immediately.'
          : 'Game proposal submitted for unanimous validation.'
      );
      reset({ participants: [], scores: {} });
      if (onSubmitted) {
        await onSubmitted();
      }
    } catch (error) {
      const errorMessage = (error as { message?: string }).message ?? 'Failed to submit game proposal.';
      setMessage(errorMessage);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div>
        <h3 className="text-sm font-semibold">Participants</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {members.map((member) => (
            <label key={member.id} className="flex items-center gap-2 rounded border border-slate-200 p-2 text-sm">
              <input
                type="checkbox"
                checked={participantsSet.has(member.id)}
                onChange={() => toggleParticipant(member.id)}
              />
              {member.displayNameCache ?? member.id}
            </label>
          ))}
        </div>
        {errors.participants ? <p className="mt-1 text-xs text-rose-700">{errors.participants.message}</p> : null}
      </div>

      <div>
        <h3 className="text-sm font-semibold">Final scores</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {selectedParticipants.map((participant) => (
            <label key={participant} className="text-sm">
              <span className="mb-1 block">{participant}</span>
              <input
                className="w-full rounded border border-slate-300 p-2"
                type="number"
                {...register(`scores.${participant}`)}
                required
              />
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        className="rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-70"
        disabled={isSubmitting}
      >
        Submit game proposal
      </button>

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
    </form>
  );
}
