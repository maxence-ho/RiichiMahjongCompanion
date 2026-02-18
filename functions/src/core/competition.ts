export function isCompetitionValidationEnabled(competitionData: unknown): boolean {
  if (!competitionData || typeof competitionData !== 'object') {
    return true;
  }

  return (competitionData as { validationEnabled?: unknown }).validationEnabled !== false;
}
