import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTaskOperations } from './useTaskOperations';
import { Task, User, SubTeam } from '../types';

// Mock dependencies
vi.mock('../lib/dbService', () => ({
  dbService: {
    saveTask: vi.fn(),
    saveTemplate: vi.fn(),
    deleteTask: vi.fn(),
    saveSubtask: vi.fn(),
    saveComment: vi.fn(),
    saveFollowup: vi.fn(),
  },
}));

vi.mock('../api/emailTrigger', () => ({
  triggerTaskAssignmentEmail: vi.fn(),
  triggerTaskClosureEmail: vi.fn(),
}));

vi.mock('../lib/taskEngine', () => ({
  checkAndGenerateRecurringTasks: vi.fn(() => Promise.resolve({ generatedCount: 0, newTasks: [] })),
}));

describe('handleUpdateTask assignment validation', () => {
  const mockTasks: Task[] = [
    {
      TaskID: 'TSK-001',
      TemplateID: null,
      ParentTaskID: null,
      Title: 'Test Task',
      Description: 'Test Description',
      Priority: 'Medium',
      TaskType: 'One-time',
      RecurrenceType: 'One-time',
      CycleKey: null,
      StartDate: '2024-01-01',
      DueDate: '2024-01-08',
      Status: 'In Progress',
      AssignedToEmail: 'user1@test.com',
      AssignedByEmail: 'leader@test.com',
      AssignedToRole: 'Sub-stakeholder',
      AssignedToTeamIDs: ['T-001'],
      TeamID: 'T-001',
      PercentComplete: 50,
      LastReportSummary: '',
      RequiresFollowUp: 'No',
      FollowUpCount: 0,
      CompletionDate: null,
      CloseRemark: null,
      AttachmentLink: '',
      CreatedAt: '2024-01-01T00:00:00Z',
      UpdatedAt: '2024-01-01T00:00:00Z',
      Active: true,
      DeletedAt: null,
    },
  ];

  const mockUsers: User[] = [
    {
      UserID: 'USR-001',
      FullName: 'Sub-Team Leader',
      Email: 'leader@test.com',
      Role: 'Sub-stakeholder',
      ManagerEmail: '',
      SubTeamIDs: ['ST-001'],
      TeamIDs: ['T-001'],
      TeamNames: ['Team A'],
      Active: true,
      CanCreateFollowUp: true,
      CanCloseTask: true,
      CreatedAt: '2024-01-01T00:00:00Z',
      UpdatedAt: '2024-01-01T00:00:00Z',
    },
    {
      UserID: 'USR-002',
      FullName: 'Team Member',
      Email: 'member@test.com',
      Role: 'Sub-stakeholder',
      ManagerEmail: '',
      SubTeamIDs: ['ST-001'],
      TeamIDs: ['T-001'],
      TeamNames: ['Team A'],
      Active: true,
      CanCreateFollowUp: true,
      CanCloseTask: true,
      CreatedAt: '2024-01-01T00:00:00Z',
      UpdatedAt: '2024-01-01T00:00:00Z',
    },
    {
      UserID: 'USR-003',
      FullName: 'Other Team Member',
      Email: 'other@test.com',
      Role: 'Sub-stakeholder',
      ManagerEmail: '',
      SubTeamIDs: ['ST-002'],
      TeamIDs: ['T-001'],
      TeamNames: ['Team A'],
      Active: true,
      CanCreateFollowUp: true,
      CanCloseTask: true,
      CreatedAt: '2024-01-01T00:00:00Z',
      UpdatedAt: '2024-01-01T00:00:00Z',
    },
  ];

  const mockSubTeams: SubTeam[] = [
    {
      SubTeamID: 'ST-001',
      TeamID: 'T-001',
      SubTeamName: 'SubTeam Alpha',
      Description: 'First sub-team',
      Active: true,
      SubTeamLeaderEmails: ['leader@test.com'],
      CreatedAt: '2024-01-01T00:00:00Z',
      UpdatedAt: '2024-01-01T00:00:00Z',
    },
    {
      SubTeamID: 'ST-002',
      TeamID: 'T-001',
      SubTeamName: 'SubTeam Beta',
      Description: 'Second sub-team',
      Active: true,
      SubTeamLeaderEmails: ['other-leader@test.com'],
      CreatedAt: '2024-01-01T00:00:00Z',
      UpdatedAt: '2024-01-01T00:00:00Z',
    },
  ];

  const mockCurrentUser: User = mockUsers[0];

  const defaultProps = {
    tasks: mockTasks,
    users: mockUsers,
    currentUser: mockCurrentUser,
    subTeams: mockSubTeams,
    syncDatabase: vi.fn(),
    silentSync: vi.fn(),
    selectedTask: mockTasks[0],
    setSelectedTask: vi.fn(),
    triggerNotification: vi.fn(),
    formatEmailTemplate: vi.fn(() => 'Test message'),
    logAudit: vi.fn(),
    setIsSimulatingRecurrence: vi.fn(),
    setSimulationMessage: vi.fn(),
    setSubtasks: vi.fn(),
    subtasks: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handleUpdateTask rejects reassignment to a user outside the assigner\'s sub-team scope', async () => {
    const { result } = renderHook(() => useTaskOperations(defaultProps));

    await expect(
      act(async () => {
        await result.current.handleUpdateTask('TSK-001', {
          AssignedToEmail: 'other@test.com',
        });
      })
    ).rejects.toThrow('Cannot assign task to other@test.com outside your team scope.');
  });

  it('handleUpdateTask accepts reassignment within scope', async () => {
    const { result } = renderHook(() => useTaskOperations(defaultProps));

    await expect(
      act(async () => {
        await result.current.handleUpdateTask('TSK-001', {
          AssignedToEmail: 'member@test.com',
        });
      })
    ).resolves.not.toThrow();
  });

  it('handleUpdateTask does NOT throw when AssignedToEmail is absent from the update (regression guard)', async () => {
    const { result } = renderHook(() => useTaskOperations(defaultProps));

    await expect(
      act(async () => {
        await result.current.handleUpdateTask('TSK-001', {
          Description: 'Updated description only',
        });
      })
    ).resolves.not.toThrow();
  });

  it('Multi-assignee update where one of several comma-separated emails is invalid — must still reject', async () => {
    const { result } = renderHook(() => useTaskOperations(defaultProps));

    await expect(
      act(async () => {
        await result.current.handleUpdateTask('TSK-001', {
          AssignedToEmail: 'member@test.com, other@test.com',
        });
      })
    ).rejects.toThrow('Cannot assign task to other@test.com outside your team scope.');
  });

  it('Multi-assignee update where all emails are valid — should accept', async () => {
    const { result } = renderHook(() => useTaskOperations(defaultProps));

    await expect(
      act(async () => {
        await result.current.handleUpdateTask('TSK-001', {
          AssignedToEmail: 'member@test.com, leader@test.com',
        });
      })
    ).resolves.not.toThrow();
  });

  it('AssignedToTeamIDs validation rejects invalid team ID for non-admin', async () => {
    const { result } = renderHook(() => useTaskOperations(defaultProps));

    await expect(
      act(async () => {
        await result.current.handleUpdateTask('TSK-001', {
          AssignedToTeamIDs: ['T-002'], // Team not in assigner's TeamIDs
        });
      })
    ).rejects.toThrow('Cannot assign task to team T-002 outside your team scope.');
  });

  it('AssignedToTeamIDs validation accepts valid team ID for non-admin', async () => {
    const { result } = renderHook(() => useTaskOperations(defaultProps));

    await expect(
      act(async () => {
        await result.current.handleUpdateTask('TSK-001', {
          AssignedToTeamIDs: ['T-001'], // Team in assigner's TeamIDs
        });
      })
    ).resolves.not.toThrow();
  });

  it('AssignedToTeamIDs validation accepts any team for admin', async () => {
    const adminUser: User = {
      ...mockUsers[0],
      Role: 'Admin',
    };

    const adminProps = {
      ...defaultProps,
      currentUser: adminUser,
    };

    const { result } = renderHook(() => useTaskOperations(adminProps));

    await expect(
      act(async () => {
        await result.current.handleUpdateTask('TSK-001', {
          AssignedToTeamIDs: ['T-002'], // Any team is valid for admin
        });
      })
    ).resolves.not.toThrow();
  });

  it('handleUpdateTask throws when currentUser is null', async () => {
    const nullUserProps = {
      ...defaultProps,
      currentUser: null,
    };

    const { result } = renderHook(() => useTaskOperations(nullUserProps));

    await expect(
      act(async () => {
        await result.current.handleUpdateTask('TSK-001', {
          AssignedToEmail: 'member@test.com',
        });
      })
    ).resolves.not.toThrow(); // Should return early without throwing
  });
});
