'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';

import { RequireRole } from '@/components/RequireRole';
import { useAuthContext } from '@/features/auth/AuthProvider';
import { adminUpsertClubMember, createTournamentRoundPairings, ensureTestAdminAccess } from '@/lib/callables';
import { registerPushToken } from '@/lib/firebaseMessaging';
import { db } from '@/lib/firebaseClient';

interface CompetitionAdmin {
  id: string;
  name: string;
  type: 'tournament' | 'championship';
  status: 'draft' | 'active' | 'archived';
  validationEnabled?: boolean;
}

interface MemberItem {
  id: string;
  role: 'admin' | 'member';
  displayNameCache?: string;
}

const defaultRuleValues = {
  startingPoints: 25000,
  returnPoints: 30000,
  scoreSum: 100000,
  uma1: 20,
  uma2: 10,
  uma3: -10,
  uma4: -20,
  oka: 0,
  rounding: 'nearest_100' as 'nearest_100' | 'none',
  allowOpenTanyao: true,
  useRedFives: true,
  redMan: 1,
  redPin: 1,
  redSou: 1,
  useIppatsu: true,
  useUraDora: true,
  useKanDora: true,
  useKanUraDora: true,
  headBump: false,
  agariYame: true,
  tobiEnd: true,
  honbaPoints: 300,
  notenPaymentTotal: 3000,
  riichiBetPoints: 1000
};

export default function AdminPage() {
  const { user, profile, activeClubRole } = useAuthContext();
  const [items, setItems] = useState<CompetitionAdmin[]>([]);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<'tournament' | 'championship'>('championship');
  const [status, setStatus] = useState<'draft' | 'active' | 'archived'>('active');
  const [validationEnabled, setValidationEnabled] = useState(true);
  const [totalRounds, setTotalRounds] = useState(4);
  const [pairingAlgorithm, setPairingAlgorithm] = useState<'performance_swiss' | 'precomputed_min_repeats'>(
    'performance_swiss'
  );
  const [selectedTournamentPlayers, setSelectedTournamentPlayers] = useState<string[]>([]);
  const [ruleValues, setRuleValues] = useState(defaultRuleValues);
  const [message, setMessage] = useState<string | null>(null);
  const isAdmin = activeClubRole === 'admin';

  const [newMemberId, setNewMemberId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'member'>('member');

  const canCreateTournament = useMemo(
    () => selectedTournamentPlayers.length >= 4 && selectedTournamentPlayers.length % 4 === 0,
    [selectedTournamentPlayers]
  );

  const load = async () => {
    const clubId = profile?.activeClubId;
    if (!clubId || !user || !isAdmin) {
      setItems([]);
      setMembers([]);
      return;
    }

    const [competitionSnapshot, membersSnapshot] = await Promise.all([
      getDocs(collection(db, `clubs/${clubId}/competitions`)),
      getDocs(collection(db, `clubs/${clubId}/members`))
    ]);

    setItems(
      competitionSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<CompetitionAdmin, 'id'>)
      }))
    );

    const allMembers = membersSnapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      role: docSnap.data().role,
      displayNameCache: docSnap.data().displayNameCache
    })) as MemberItem[];
    setMembers(allMembers);

    if (selectedTournamentPlayers.length === 0) {
      setSelectedTournamentPlayers(allMembers.map((member) => member.id));
    }
  };

  useEffect(() => {
    load().catch((error) => setMessage((error as { message?: string }).message ?? 'Failed to load admin data.'));
  }, [isAdmin, profile?.activeClubId, user]);

  const onCreateCompetition = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const clubId = profile?.activeClubId;
    if (!clubId || !user) {
      setMessage('No active club.');
      return;
    }

    if (!isAdmin) {
      setMessage('Only admin can create competitions.');
      return;
    }

    if (type === 'tournament' && !canCreateTournament) {
      setMessage('Tournament participants must be a multiple of 4.');
      return;
    }

    const createCompetitionDoc = () =>
      addDoc(collection(db, `clubs/${clubId}/competitions`), {
        name,
        type,
        status,
        validationEnabled,
        rules: {
          mode: 'override',
          overrideRules: {
            startingPoints: Number(ruleValues.startingPoints),
            returnPoints: Number(ruleValues.returnPoints),
            scoreSum: Number(ruleValues.scoreSum),
            uma: [
              Number(ruleValues.uma1),
              Number(ruleValues.uma2),
              Number(ruleValues.uma3),
              Number(ruleValues.uma4)
            ],
            oka: Number(ruleValues.oka),
            rounding: ruleValues.rounding,
            allowOpenTanyao: ruleValues.allowOpenTanyao,
            useRedFives: ruleValues.useRedFives,
            redFivesCount: {
              man: Number(ruleValues.redMan),
              pin: Number(ruleValues.redPin),
              sou: Number(ruleValues.redSou)
            },
            useIppatsu: ruleValues.useIppatsu,
            useUraDora: ruleValues.useUraDora,
            useKanDora: ruleValues.useKanDora,
            useKanUraDora: ruleValues.useKanUraDora,
            headBump: ruleValues.headBump,
            agariYame: ruleValues.agariYame,
            tobiEnd: ruleValues.tobiEnd,
            honbaPoints: Number(ruleValues.honbaPoints),
            notenPaymentTotal: Number(ruleValues.notenPaymentTotal),
            riichiBetPoints: Number(ruleValues.riichiBetPoints)
          }
        },
        tournamentConfig:
          type === 'tournament'
            ? {
                participantUserIds: selectedTournamentPlayers,
                totalRounds: Number(totalRounds),
                pairingAlgorithm
              }
            : null,
        tournamentState:
          type === 'tournament'
            ? {
                activeRoundNumber: null,
                lastCompletedRound: 0
              }
            : null,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

    const shouldRepairTestAdmin =
      process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true' &&
      user.email?.trim().toLowerCase() === 'admin@mahjong.local';

    let competitionRef: Awaited<ReturnType<typeof createCompetitionDoc>>;
    let repairedAdminAccess = false;
    try {
      competitionRef = await createCompetitionDoc();
    } catch (error) {
      const code = (error as { code?: string }).code ?? '';
      const message = (error as { message?: string }).message ?? '';
      const permissionDenied = code.includes('permission-denied') || message.includes('Missing or insufficient permissions');

      if (!shouldRepairTestAdmin || !permissionDenied) {
        setMessage(message || 'Failed to create competition.');
        return;
      }

      try {
        await ensureTestAdminAccess({ clubId });
        repairedAdminAccess = true;
        competitionRef = await createCompetitionDoc();
      } catch (retryError) {
        setMessage((retryError as { message?: string }).message ?? 'Failed to create competition.');
        return;
      }
    }

    if (type === 'tournament' && status === 'active' && pairingAlgorithm === 'precomputed_min_repeats') {
      await createTournamentRoundPairings({
        clubId,
        competitionId: competitionRef.id
      });
    }

    setName('');
    setType('championship');
    setStatus('active');
    setValidationEnabled(true);
    setPairingAlgorithm('performance_swiss');
    setMessage(
      repairedAdminAccess
        ? 'Competition created after refreshing admin access.'
        : type === 'tournament' && status === 'active' && pairingAlgorithm === 'precomputed_min_repeats'
        ? 'Tournament created and full schedule precomputed (round 1 is active).'
        : 'Competition created.'
    );
    await load();
  };

  const onEnablePush = async () => {
    if (!user) {
      return;
    }

    const token = await registerPushToken(user.uid);
    setMessage(
      token
        ? 'Push notifications enabled.'
        : 'Push notifications unavailable (missing config, denied permission, or unsupported browser).'
    );
  };

  const onAddMember = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const clubId = profile?.activeClubId;
    if (!clubId || !isAdmin || !newMemberId.trim()) {
      return;
    }

    await adminUpsertClubMember({
      clubId,
      targetUserId: newMemberId.trim(),
      role: newMemberRole
    });

    setMessage('Member added/updated.');
    setNewMemberId('');
    setNewMemberRole('member');
    await load();
  };

  const toggleTournamentPlayer = (userId: string) => {
    setSelectedTournamentPlayers((current) => {
      if (current.includes(userId)) {
        return current.filter((entry) => entry !== userId);
      }

      return [...current, userId];
    });
  };

  return (
    <RequireRole role="admin" fallbackHref="/club">
      <section className="space-y-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Admin</h2>
          <p className="mt-1 text-sm text-slate-600">Manage competitions, rules, members and notifications.</p>
          {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
          <button className="mt-3 rounded border border-slate-300 px-3 py-2 text-sm" onClick={onEnablePush}>
            Enable push notifications
          </button>
        </div>

        {isAdmin ? (
          <>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold">Create competition</h3>
              <form className="mt-3 space-y-4" onSubmit={onCreateCompetition}>
                <div className="grid gap-2 sm:grid-cols-3">
                  <input
                    className="rounded border border-slate-300 p-2 text-sm"
                    placeholder="Competition name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                  <select
                    className="rounded border border-slate-300 p-2 text-sm"
                    value={type}
                    onChange={(event) => setType(event.target.value as 'tournament' | 'championship')}
                  >
                    <option value="championship">Championship</option>
                    <option value="tournament">Tournament</option>
                  </select>
                  <select
                    className="rounded border border-slate-300 p-2 text-sm"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as 'draft' | 'active' | 'archived')}
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={validationEnabled}
                    onChange={(event) => setValidationEnabled(event.target.checked)}
                  />
                  Require game validation
                </label>

                <div className="space-y-3 rounded border border-slate-200 p-3">
                  <h4 className="text-sm font-semibold">Rules configuration</h4>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Base scoring</p>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600">Starting points</span>
                        <input
                          className="w-full rounded border border-slate-300 p-2 text-sm"
                          type="number"
                          value={ruleValues.startingPoints}
                          onChange={(event) =>
                            setRuleValues((current) => ({
                              ...current,
                              startingPoints: Number(event.target.value)
                            }))
                          }
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600">Return points</span>
                        <input
                          className="w-full rounded border border-slate-300 p-2 text-sm"
                          type="number"
                          value={ruleValues.returnPoints}
                          onChange={(event) =>
                            setRuleValues((current) => ({
                              ...current,
                              returnPoints: Number(event.target.value)
                            }))
                          }
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600">Score sum</span>
                        <input
                          className="w-full rounded border border-slate-300 p-2 text-sm"
                          type="number"
                          value={ruleValues.scoreSum}
                          onChange={(event) =>
                            setRuleValues((current) => ({
                              ...current,
                              scoreSum: Number(event.target.value)
                            }))
                          }
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600">Rounding</span>
                        <select
                          className="w-full rounded border border-slate-300 p-2 text-sm"
                          value={ruleValues.rounding}
                          onChange={(event) =>
                            setRuleValues((current) => ({
                              ...current,
                              rounding: event.target.value as 'nearest_100' | 'none'
                            }))
                          }
                        >
                          <option value="nearest_100">nearest_100</option>
                          <option value="none">none</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">UMA</p>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600">1st place UMA</span>
                        <input
                          className="w-full rounded border border-slate-300 p-2 text-sm"
                          type="number"
                          value={ruleValues.uma1}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, uma1: Number(event.target.value) }))
                          }
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600">2nd place UMA</span>
                        <input
                          className="w-full rounded border border-slate-300 p-2 text-sm"
                          type="number"
                          value={ruleValues.uma2}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, uma2: Number(event.target.value) }))
                          }
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600">3rd place UMA</span>
                        <input
                          className="w-full rounded border border-slate-300 p-2 text-sm"
                          type="number"
                          value={ruleValues.uma3}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, uma3: Number(event.target.value) }))
                          }
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600">4th place UMA</span>
                        <input
                          className="w-full rounded border border-slate-300 p-2 text-sm"
                          type="number"
                          value={ruleValues.uma4}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, uma4: Number(event.target.value) }))
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Payments and counters
                    </p>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600">OKA</span>
                        <input
                          className="w-full rounded border border-slate-300 p-2 text-sm"
                          type="number"
                          value={ruleValues.oka}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, oka: Number(event.target.value) }))
                          }
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600">Honba points</span>
                        <input
                          className="w-full rounded border border-slate-300 p-2 text-sm"
                          type="number"
                          value={ruleValues.honbaPoints}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, honbaPoints: Number(event.target.value) }))
                          }
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600">Noten payment total</span>
                        <input
                          className="w-full rounded border border-slate-300 p-2 text-sm"
                          type="number"
                          value={ruleValues.notenPaymentTotal}
                          onChange={(event) =>
                            setRuleValues((current) => ({
                              ...current,
                              notenPaymentTotal: Number(event.target.value)
                            }))
                          }
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600">Riichi stick points</span>
                        <input
                          className="w-full rounded border border-slate-300 p-2 text-sm"
                          type="number"
                          value={ruleValues.riichiBetPoints}
                          onChange={(event) =>
                            setRuleValues((current) => ({
                              ...current,
                              riichiBetPoints: Number(event.target.value)
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Red fives</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600">Red 5 man count</span>
                        <input
                          className="w-full rounded border border-slate-300 p-2 text-sm"
                          type="number"
                          value={ruleValues.redMan}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, redMan: Number(event.target.value) }))
                          }
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600">Red 5 pin count</span>
                        <input
                          className="w-full rounded border border-slate-300 p-2 text-sm"
                          type="number"
                          value={ruleValues.redPin}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, redPin: Number(event.target.value) }))
                          }
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600">Red 5 sou count</span>
                        <input
                          className="w-full rounded border border-slate-300 p-2 text-sm"
                          type="number"
                          value={ruleValues.redSou}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, redSou: Number(event.target.value) }))
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Rule toggles</p>
                    <div className="grid gap-2 sm:grid-cols-3 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={ruleValues.allowOpenTanyao}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, allowOpenTanyao: event.target.checked }))
                          }
                        />
                        Open tanyao
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={ruleValues.useRedFives}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, useRedFives: event.target.checked }))
                          }
                        />
                        Aka dora
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={ruleValues.useIppatsu}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, useIppatsu: event.target.checked }))
                          }
                        />
                        Ippatsu
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={ruleValues.useUraDora}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, useUraDora: event.target.checked }))
                          }
                        />
                        Ura dora
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={ruleValues.useKanDora}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, useKanDora: event.target.checked }))
                          }
                        />
                        Kan dora
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={ruleValues.useKanUraDora}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, useKanUraDora: event.target.checked }))
                          }
                        />
                        Kan ura dora
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={ruleValues.headBump}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, headBump: event.target.checked }))
                          }
                        />
                        Head bump
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={ruleValues.agariYame}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, agariYame: event.target.checked }))
                          }
                        />
                        Agari yame
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={ruleValues.tobiEnd}
                          onChange={(event) =>
                            setRuleValues((current) => ({ ...current, tobiEnd: event.target.checked }))
                          }
                        />
                        Tobi end
                      </label>
                    </div>
                  </div>
                </div>

                {type === 'tournament' ? (
                  <div className="space-y-2 rounded border border-slate-200 p-3">
                    <h4 className="text-sm font-semibold">Tournament settings</h4>
                    <label className="text-sm">
                      <span className="mb-1 block">Pairing algorithm</span>
                      <select
                        className="w-full rounded border border-slate-300 p-2 text-sm"
                        value={pairingAlgorithm}
                        onChange={(event) =>
                          setPairingAlgorithm(event.target.value as 'performance_swiss' | 'precomputed_min_repeats')
                        }
                      >
                        <option value="performance_swiss">Between rounds (performance-based)</option>
                        <option value="precomputed_min_repeats">Precompute all rounds (min repeat encounters)</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block">Total hanchan rounds</span>
                      <input
                        className="w-full rounded border border-slate-300 p-2 text-sm"
                        type="number"
                        min={1}
                        value={totalRounds}
                        onChange={(event) => setTotalRounds(Number(event.target.value))}
                      />
                    </label>
                    <p className="text-xs text-slate-600">Select participants (must be multiple of 4)</p>
                    <p className="text-xs text-slate-600">
                      {pairingAlgorithm === 'precomputed_min_repeats'
                        ? 'All tables for all rounds are computed upfront to reduce repeated encounters.'
                        : 'Tables are generated one round at a time based on current standings and repeat penalties.'}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {members.map((member) => (
                        <label key={member.id} className="flex items-center gap-2 rounded border border-slate-100 p-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedTournamentPlayers.includes(member.id)}
                            onChange={() => toggleTournamentPlayer(member.id)}
                          />
                          {member.displayNameCache ?? member.id}
                        </label>
                      ))}
                    </div>
                    {!canCreateTournament ? (
                      <p className="text-xs text-rose-700">Participants must be 4, 8, 12, ...</p>
                    ) : null}
                  </div>
                ) : null}

                <button className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white" type="submit">
                  Create competition
                </button>
              </form>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold">Manage members</h3>
              <form className="mt-3 grid gap-2 sm:grid-cols-3" onSubmit={onAddMember}>
                <input
                  className="rounded border border-slate-300 p-2 text-sm"
                  placeholder="User ID"
                  value={newMemberId}
                  onChange={(event) => setNewMemberId(event.target.value)}
                  required
                />
                <select
                  className="rounded border border-slate-300 p-2 text-sm"
                  value={newMemberRole}
                  onChange={(event) => setNewMemberRole(event.target.value as 'admin' | 'member')}
                >
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
                <button className="rounded border border-slate-300 px-3 py-2 text-sm" type="submit">
                  Add / update member
                </button>
              </form>

              <ul className="mt-3 space-y-1 text-sm">
                {members.map((member) => (
                  <li key={member.id} className="rounded border border-slate-100 p-2">
                    {member.displayNameCache ?? member.id} ({member.id}) | {member.role}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}

        {isAdmin ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold">Competition list</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {items.length === 0 ? <li className="text-slate-600">No competitions found.</li> : null}
              {items.map((item) => (
                <li key={item.id} className="rounded border border-slate-100 p-2">
                  {item.name} | {item.type} | {item.status} | validation:{' '}
                  {item.validationEnabled === false ? 'disabled' : 'enabled'}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </RequireRole>
  );
}
