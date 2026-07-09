import { api } from './client';

export interface TeamReminderThreadResponse {
  threadId: string | null;
  messageId: string | null;
  teamName: string | null;
  subTeamId: string | null;
  subTeamName: string | null;
}

export interface SendProofEmailRequest {
  teamId: string;
  subTeamId?: string;
  teamName: string;
  subTeamName?: string;
  leaderEmails: string[];
  attachmentLinks: string;
  note?: string;
  submittedBy: string;
}

export interface SendProofEmailResponse {
  success: boolean;
  sentToCount: number;
  fallbackCount: number;
  totalRecipients: number;
  usedFallback: boolean;
  threadId: string | null;
}

export interface UnsubmittedTeam {
  teamId: string;
  teamName: string;
}

export interface UnsubmittedTeamsResponse {
  unsubmittedTeams: UnsubmittedTeam[];
}

export interface EmailDeliveryFailure {
  teamId: string;
  subTeamId: string | null;
  type: 'thursday_reminder' | 'proof_email';
  intendedRecipient: string;
  weekOf: string;
  timestamp: string;
  reason: string;
}

export interface EmailDeliveryFailuresResponse {
  failures: EmailDeliveryFailure[];
  weekOf: string;
}

export async function getTeamReminderThread(teamId: string, weekOf: string): Promise<TeamReminderThreadResponse> {
  return api.get<TeamReminderThreadResponse>(`/team-reminder-thread/${teamId}/${weekOf}`);
}

export async function sendProofEmail(data: SendProofEmailRequest): Promise<SendProofEmailResponse> {
  return api.post<SendProofEmailResponse>('/send-proof-email', data);
}

export async function getUnsubmittedTeams(): Promise<UnsubmittedTeamsResponse> {
  return api.get<UnsubmittedTeamsResponse>('/unsubmitted-teams');
}

export async function getEmailDeliveryFailures(): Promise<EmailDeliveryFailuresResponse> {
  return api.get<EmailDeliveryFailuresResponse>('/email-delivery-failures');
}
