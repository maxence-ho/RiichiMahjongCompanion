"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminUpsertClubMember = exports.submitTournamentTableResultProposal = exports.createTournamentRoundPairings = exports.rejectProposal = exports.approveProposal = exports.submitGameEditProposal = exports.submitGameCreateProposal = void 0;
const app_1 = require("firebase-admin/app");
const https_1 = require("firebase-functions/v2/https");
const options_1 = require("firebase-functions/v2/options");
const submitGameCreateProposal_js_1 = require("./callable/submitGameCreateProposal.js");
const submitGameEditProposal_js_1 = require("./callable/submitGameEditProposal.js");
const approveProposal_js_1 = require("./callable/approveProposal.js");
const rejectProposal_js_1 = require("./callable/rejectProposal.js");
const createTournamentRoundPairings_js_1 = require("./callable/createTournamentRoundPairings.js");
const submitTournamentTableResultProposal_js_1 = require("./callable/submitTournamentTableResultProposal.js");
const adminUpsertClubMember_js_1 = require("./callable/adminUpsertClubMember.js");
(0, app_1.initializeApp)();
(0, options_1.setGlobalOptions)({
    region: 'us-central1',
    maxInstances: 10
});
exports.submitGameCreateProposal = (0, https_1.onCall)(async (request) => (0, submitGameCreateProposal_js_1.submitGameCreateProposalHandler)(request.data, request.auth?.uid));
exports.submitGameEditProposal = (0, https_1.onCall)(async (request) => (0, submitGameEditProposal_js_1.submitGameEditProposalHandler)(request.data, request.auth?.uid));
exports.approveProposal = (0, https_1.onCall)(async (request) => (0, approveProposal_js_1.approveProposalHandler)(request.data, request.auth?.uid));
exports.rejectProposal = (0, https_1.onCall)(async (request) => (0, rejectProposal_js_1.rejectProposalHandler)(request.data, request.auth?.uid));
exports.createTournamentRoundPairings = (0, https_1.onCall)(async (request) => (0, createTournamentRoundPairings_js_1.createTournamentRoundPairingsHandler)(request.data, request.auth?.uid));
exports.submitTournamentTableResultProposal = (0, https_1.onCall)(async (request) => (0, submitTournamentTableResultProposal_js_1.submitTournamentTableResultProposalHandler)(request.data, request.auth?.uid));
exports.adminUpsertClubMember = (0, https_1.onCall)(async (request) => (0, adminUpsertClubMember_js_1.adminUpsertClubMemberHandler)(request.data, request.auth?.uid));
