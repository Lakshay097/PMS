import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTeamReminderThread, sendProofEmail, getUnsubmittedTeams, getEmailDeliveryFailures } from './teamReminderController';
import { Response } from 'express';
import { firestoreAdmin } from '../services/firebaseAdmin';
import { sendEmailAsUser } from '../services/emailService';
import { generateGoogleSheetsToken, fetchSheetValues } from '../services/googleSheetsService';

// Mock dependencies
vi.mock('../services/firebaseAdmin');
vi.mock('../services/emailService');
vi.mock('../services/googleSheetsService');

// Mock config module
const mockConfig = {
  SYSTEM_SENDER_EMAIL: 'rajeev.1@pw.live'
};
vi.mock('../config/env', () => ({
  config: mockConfig
}));

describe('teamReminderController', () => {
  let mockReq: any;
  let mockRes: Response;

  beforeEach(() => {
    mockReq = {
      params: {},
      body: {},
      user: { email: 'test@example.com' }
    };
    mockRes = {
      json: vi.fn(),
      status: vi.fn(() => mockRes)
    } as any;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTeamReminderThread', () => {
    it('should return thread data when document exists', async () => {
      mockReq.params = { teamId: 'team1', weekOf: '2026-07-07' };
      
      const mockDoc = {
        exists: true,
        data: () => ({
          gmailThreadId: 'thread123',
          gmailMessageId: 'msg123',
          teamName: 'Team 1',
          subTeamId: 'sub1',
          subTeamName: 'Sub Team 1'
        })
      };
      
      vi.mocked(firestoreAdmin.collection).mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue(mockDoc)
        })
      } as any);

      await getTeamReminderThread(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        threadId: 'thread123',
        messageId: 'msg123',
        teamName: 'Team 1',
        subTeamId: 'sub1',
        subTeamName: 'Sub Team 1'
      });
    });

    it('should return null values when document does not exist', async () => {
      mockReq.params = { teamId: 'team1', weekOf: '2026-07-07' };
      
      const mockDoc = {
        exists: false
      };
      
      vi.mocked(firestoreAdmin.collection).mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue(mockDoc)
        })
      } as any);

      await getTeamReminderThread(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        threadId: null,
        messageId: null
      });
    });

    it('should handle errors and return 500', async () => {
      mockReq.params = { teamId: 'team1', weekOf: '2026-07-07' };
      
      vi.mocked(firestoreAdmin.collection).mockImplementation(() => {
        throw new Error('Firestore error');
      });

      await getTeamReminderThread(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to fetch team reminder thread' });
    });
  });

  describe('sendProofEmail', () => {
    it('should send proof email with existing thread', async () => {
      mockReq.body = {
        teamId: 'team1',
        teamName: 'Team 1',
        leaderEmails: ['leader@example.com'],
        attachmentLinks: 'https://example.com/file.pdf',
        submittedBy: 'user@example.com'
      };

      const mockDoc = {
        exists: true,
        data: () => ({
          gmailThreadId: 'thread123',
          gmailMessageId: 'msg123'
        })
      };

      vi.mocked(firestoreAdmin.collection).mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue(mockDoc)
        })
      } as any);

      vi.mocked(sendEmailAsUser).mockResolvedValue({
        success: true,
        usedFallback: false,
        gmailThreadId: 'thread123',
        gmailMessageId: 'msg123'
      });

      // Config is already mocked at module level

      await sendProofEmail(mockReq, mockRes);

      expect(sendEmailAsUser).toHaveBeenCalledWith(
        'rajeev.1@pw.live',
        'leader@example.com',
        'Weekly Report Proof: Team 1',
        expect.stringContaining('Weekly report proof'),
        undefined,
        undefined,
        'thread123',
        'msg123',
        undefined,
        'team1',
        undefined,
        'proof_email',
        expect.any(String),
        undefined,
        'proof_email',
        false
      );

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        sentToCount: 1,
        fallbackCount: 0,
        totalRecipients: 1,
        usedFallback: false,
        threadId: 'thread123'
      });
    });

    it('should send proof email without existing thread', async () => {
      mockReq.body = {
        teamId: 'team1',
        teamName: 'Team 1',
        leaderEmails: ['leader@example.com'],
        attachmentLinks: 'https://example.com/file.pdf',
        submittedBy: 'user@example.com'
      };

      const mockDoc = {
        exists: false
      };

      vi.mocked(firestoreAdmin.collection).mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue(mockDoc)
        })
      } as any);

      vi.mocked(sendEmailAsUser).mockResolvedValue({
        success: true,
        usedFallback: false,
        gmailThreadId: 'newthread',
        gmailMessageId: 'newmsg'
      });

      // Config is already mocked at module level

      await sendProofEmail(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        sentToCount: 1,
        fallbackCount: 0,
        totalRecipients: 1,
        usedFallback: true,
        threadId: null
      });
    });

    it('should handle fallback emails', async () => {
      mockReq.body = {
        teamId: 'team1',
        teamName: 'Team 1',
        leaderEmails: ['leader@example.com'],
        attachmentLinks: 'https://example.com/file.pdf',
        submittedBy: 'user@example.com'
      };

      const mockDoc = {
        exists: true,
        data: () => ({
          gmailThreadId: 'thread123',
          gmailMessageId: 'msg123'
        })
      };

      vi.mocked(firestoreAdmin.collection).mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue(mockDoc)
        })
      } as any);

      vi.mocked(sendEmailAsUser).mockResolvedValue({
        success: true,
        usedFallback: true
      });

      // Config is already mocked at module level

      await sendProofEmail(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        sentToCount: 0,
        fallbackCount: 1,
        totalRecipients: 1,
        usedFallback: false,
        threadId: 'thread123'
      });
    });

    it('should handle sub-teams', async () => {
      mockReq.body = {
        teamId: 'team1',
        subTeamId: 'sub1',
        teamName: 'Team 1',
        subTeamName: 'Sub Team 1',
        leaderEmails: ['leader@example.com'],
        attachmentLinks: 'https://example.com/file.pdf',
        submittedBy: 'user@example.com'
      };

      const mockDoc = {
        exists: true,
        data: () => ({
          gmailThreadId: 'thread123',
          gmailMessageId: 'msg123'
        })
      };

      vi.mocked(firestoreAdmin.collection).mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue(mockDoc)
        })
      } as any);

      vi.mocked(sendEmailAsUser).mockResolvedValue({
        success: true,
        usedFallback: false
      });

      // Config is already mocked at module level

      await sendProofEmail(mockReq, mockRes);

      expect(sendEmailAsUser).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'Weekly Report Proof: Team 1 - Sub Team 1',
        expect.any(String),
        undefined,
        undefined,
        'thread123',
        'msg123',
        undefined,
        'team1',
        'sub1',
        'proof_email',
        expect.any(String),
        undefined,
        'proof_email',
        false
      );
    });

    it('should handle errors and return 500', async () => {
      mockReq.body = {
        teamId: 'team1',
        teamName: 'Team 1',
        leaderEmails: ['leader@example.com'],
        attachmentLinks: 'https://example.com/file.pdf',
        submittedBy: 'user@example.com'
      };

      vi.mocked(firestoreAdmin.collection).mockImplementation(() => {
        throw new Error('Firestore error');
      });

      await sendProofEmail(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to send proof email' });
    });
  });

  describe('getUnsubmittedTeams', () => {
    it('should return unsubmitted teams from settings', async () => {
      vi.mocked(generateGoogleSheetsToken).mockResolvedValue({
        accessToken: 'token123',
        spreadsheetId: 'sheet123',
        expiresIn: 3600,
        serviceAccountActive: true
      });

      vi.mocked(fetchSheetValues)
        .mockResolvedValueOnce([
          ['Key', 'Value'],
          ['unsubmitted_teams_this_week', 'team1,team2,team3'],
          ['other_setting', 'value']
        ])
        .mockResolvedValueOnce([
          ['TeamID', 'TeamName', 'Active', 'LeaderEmail'],
          ['team1', 'Team 1', 'true', 'leader1@example.com'],
          ['team2', 'Team 2', 'true', 'leader2@example.com'],
          ['team3', 'Team 3', 'true', 'leader3@example.com']
        ]);

      await getUnsubmittedTeams(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        unsubmittedTeams: [
          { teamId: 'team1', teamName: 'Team 1' },
          { teamId: 'team2', teamName: 'Team 2' },
          { teamId: 'team3', teamName: 'Team 3' }
        ]
      });
    });

    it('should return empty array when no unsubmitted teams', async () => {
      vi.mocked(generateGoogleSheetsToken).mockResolvedValue({
        accessToken: 'token123',
        spreadsheetId: 'sheet123',
        expiresIn: 3600,
        serviceAccountActive: true
      });

      vi.mocked(fetchSheetValues).mockResolvedValue([
        ['Key', 'Value'],
        ['unsubmitted_teams_this_week', ''],
        ['other_setting', 'value']
      ]);

      await getUnsubmittedTeams(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        unsubmittedTeams: []
      });
    });

    it('should handle missing team names', async () => {
      vi.mocked(generateGoogleSheetsToken).mockResolvedValue({
        accessToken: 'token123',
        spreadsheetId: 'sheet123',
        expiresIn: 3600,
        serviceAccountActive: true
      });

      vi.mocked(fetchSheetValues)
        .mockResolvedValueOnce([
          ['Key', 'Value'],
          ['unsubmitted_teams_this_week', 'team1,team4']
        ])
        .mockResolvedValueOnce([
          ['TeamID', 'TeamName', 'Active', 'LeaderEmail'],
          ['team1', 'Team 1', 'true', 'leader1@example.com']
        ]);

      await getUnsubmittedTeams(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        unsubmittedTeams: [
          { teamId: 'team1', teamName: 'Team 1' },
          { teamId: 'team4', teamName: 'Unknown Team' }
        ]
      });
    });

    it('should handle Google Sheets token generation failure', async () => {
      vi.mocked(generateGoogleSheetsToken).mockResolvedValue(null);

      await getUnsubmittedTeams(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to access Google Sheets' });
    });

    it('should handle errors and return 500', async () => {
      vi.mocked(generateGoogleSheetsToken).mockImplementation(() => {
        throw new Error('Sheets error');
      });

      await getUnsubmittedTeams(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to fetch unsubmitted teams' });
    });
  });

  describe('getEmailDeliveryFailures', () => {
    it('should return email delivery failures for current week', async () => {
      const mockSnapshot = {
        docs: [
          {
            data: () => ({
              teamId: 'team1',
              subTeamId: 'sub1',
              type: 'proof_email',
              intendedRecipient: 'leader@example.com',
              weekOf: '2026-07-07',
              timestamp: '2026-07-09T10:00:00Z',
              reason: 'No Gmail token'
            })
          },
          {
            data: () => ({
              teamId: 'team2',
              subTeamId: null,
              type: 'thursday_reminder',
              intendedRecipient: 'leader2@example.com',
              weekOf: '2026-07-07',
              timestamp: '2026-07-08T10:00:00Z',
              reason: 'Token expired'
            })
          }
        ]
      };

      vi.mocked(firestoreAdmin.collection).mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue(mockSnapshot)
        })
      } as any);

      await getEmailDeliveryFailures(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        failures: [
          {
            teamId: 'team1',
            subTeamId: 'sub1',
            type: 'proof_email',
            intendedRecipient: 'leader@example.com',
            weekOf: '2026-07-07',
            timestamp: '2026-07-09T10:00:00Z',
            reason: 'No Gmail token'
          },
          {
            teamId: 'team2',
            subTeamId: null,
            type: 'thursday_reminder',
            intendedRecipient: 'leader2@example.com',
            weekOf: '2026-07-07',
            timestamp: '2026-07-08T10:00:00Z',
            reason: 'Token expired'
          }
        ],
        weekOf: expect.any(String)
      });
    });

    it('should return empty array when no failures', async () => {
      const mockSnapshot = {
        docs: []
      };

      vi.mocked(firestoreAdmin.collection).mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue(mockSnapshot)
        })
      } as any);

      await getEmailDeliveryFailures(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        failures: [],
        weekOf: expect.any(String)
      });
    });

    it('should handle errors and return 500', async () => {
      vi.mocked(firestoreAdmin.collection).mockImplementation(() => {
        throw new Error('Firestore error');
      });

      await getEmailDeliveryFailures(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to fetch email delivery failures' });
    });
  });
});
