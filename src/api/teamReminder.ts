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

export interface TeamReportConfig {
  teamId: string;
  teamName: string;
  reminderDay: string;
  meetingDay: string;
  active: boolean;
  updatedAt: string;
  entityType?: 'team' | 'subteam';
  parentTeamId?: string;
}

export interface TeamReportConfigsResponse {
  success: boolean;
  configs: TeamReportConfig[];
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

export async function getTeamReportConfigs(): Promise<TeamReportConfigsResponse> {
  return api.get<TeamReportConfigsResponse>('/report-reminders/config');
}

export async function updateTeamReportConfig(teamId: string, reminderDay: string, meetingDay: string): Promise<{ success: boolean; message: string }> {
  return api.put<{ success: boolean; message: string }>(`/report-reminders/config/${teamId}`, { reminderDay, meetingDay });
}

export interface JobRunTeamProcessed {
  teamId: string;
  teamName: string;
  status: 'sent' | 'failed' | 'skipped';
  reason?: string;
  recipients: string[];
  gmailMessageId?: string;
  error?: string;
}

export interface JobRun {
  jobName: string;
  scheduledTime: string;
  actualRunTime: string;
  teamsProcessed: JobRunTeamProcessed[];
  successCount: number;
  failureCount: number;
  skippedCount: number;
  triggeredBy: 'scheduler' | 'manual';
  triggeredByUser?: string;
  timestamp: string;
}

export interface JobRunsResponse {
  success: boolean;
  jobRuns: JobRun[];
  count: number;
}

export async function getJobRuns(limit?: number, jobName?: string): Promise<JobRunsResponse> {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  if (jobName) params.append('jobName', jobName);
  const queryString = params.toString();
  return api.get<JobRunsResponse>(`/job-runs${queryString ? `?${queryString}` : ''}`);
}

export async function getLatestJobRun(jobName: string): Promise<{ success: boolean; jobRun: JobRun | null }> {
  return api.get<{ success: boolean; jobRun: JobRun | null }>(`/job-runs/latest/${jobName}`);
}

export interface GmailReauthRequired {
  userEmail: string;
  reason: string;
  error?: string;
  timestamp: string;
}

export interface GmailReauthRequiredResponse {
  success: boolean;
  reauthRequired: GmailReauthRequired[];
  count: number;
}

export async function getGmailReauthRequired(): Promise<GmailReauthRequiredResponse> {
  return api.get<GmailReauthRequiredResponse>('/gmail-reauth-required');
}
