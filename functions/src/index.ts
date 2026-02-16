import { initializeApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';

import { submitGameCreateProposalHandler } from './callable/submitGameCreateProposal.js';
import { submitGameEditProposalHandler } from './callable/submitGameEditProposal.js';
import { approveProposalHandler } from './callable/approveProposal.js';
import { rejectProposalHandler } from './callable/rejectProposal.js';
import { createTournamentRoundPairingsHandler } from './callable/createTournamentRoundPairings.js';
import { submitTournamentTableResultProposalHandler } from './callable/submitTournamentTableResultProposal.js';
import { adminUpsertClubMemberHandler } from './callable/adminUpsertClubMember.js';

initializeApp();
setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10
});

export const submitGameCreateProposal = onCall(async (request) =>
  submitGameCreateProposalHandler(request.data, request.auth?.uid)
);

export const submitGameEditProposal = onCall(async (request) =>
  submitGameEditProposalHandler(request.data, request.auth?.uid)
);

export const approveProposal = onCall(async (request) => approveProposalHandler(request.data, request.auth?.uid));

export const rejectProposal = onCall(async (request) => rejectProposalHandler(request.data, request.auth?.uid));

export const createTournamentRoundPairings = onCall(async (request) =>
  createTournamentRoundPairingsHandler(request.data, request.auth?.uid)
);

export const submitTournamentTableResultProposal = onCall(async (request) =>
  submitTournamentTableResultProposalHandler(request.data, request.auth?.uid)
);

export const adminUpsertClubMember = onCall(async (request) =>
  adminUpsertClubMemberHandler(request.data, request.auth?.uid)
);
