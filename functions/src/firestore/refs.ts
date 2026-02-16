export function competitionLeaderboardEntryId(clubId: string, competitionId: string, userId: string) {
  return `${clubId}_${competitionId}_${userId}`;
}

export function globalLeaderboardEntryId(clubId: string, userId: string) {
  return `${clubId}_${userId}`;
}

export function validationRequestId(proposalId: string, userId: string) {
  return `${proposalId}_${userId}`;
}
