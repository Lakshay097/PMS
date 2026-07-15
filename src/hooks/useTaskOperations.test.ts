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
      ClosedInSubTeamIDs: null,
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
    gmailConnected: true,
    connectGmail: vi.fn(() => Promise.resolve()),
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

describe('handleCloseTask approval-with-Team logic', () => {
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
      AssignedToEmail: 'owner@test.com',
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
      ClosedInSubTeamIDs: null,
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
      FullName: 'Task Owner',
      Email: 'owner@test.com',
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
      FullName: 'Closer (different sub-team)',
      Email: 'closer@test.com',
      Role: 'Stakeholder',
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
    {
      UserID: 'USR-003',
      FullName: 'User with no sub-teams',
      Email: 'nosubteam@test.com',
      Role: 'Sub-stakeholder',
      ManagerEmail: '',
      SubTeamIDs: [],
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
      SubTeamLeaderEmails: ['closer@test.com'],
      CreatedAt: '2024-01-01T00:00:00Z',
      UpdatedAt: '2024-01-01T00:00:00Z',
    },
  ];

  const mockTaskOwner: User = mockUsers[0];
  const mockCloser: User = mockUsers[1];

  const defaultProps = {
    tasks: mockTasks,
    users: mockUsers,
    currentUser: mockTaskOwner,
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
    gmailConnected: true,
    connectGmail: vi.fn(() => Promise.resolve()),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Self-close by task owner records task-owner\'s sub-team correctly', async () => {
    const { result } = renderHook(() => useTaskOperations(defaultProps));

    await expect(
      act(async () => {
        await result.current.handleCloseTask('TSK-001', 'Task completed');
      })
    ).resolves.not.toThrow();

    // Verify dbService.saveTask was called with ClosedInSubTeamIDs set to owner's sub-team
    const { dbService } = await import('../lib/dbService');
    expect(dbService.saveTask).toHaveBeenCalledWith(
      expect.objectContaining({
        ClosedInSubTeamIDs: ['ST-001'], // Owner's sub-team
      })
    );
  });

  it('Close by different user (closer) still records task-owner\'s sub-team, not closer\'s', async () => {
    const closerProps = {
      ...defaultProps,
      currentUser: mockCloser, // Closer is in ST-002
    };

    const { result } = renderHook(() => useTaskOperations(closerProps));

    await expect(
      act(async () => {
        await result.current.handleCloseTask('TSK-001', 'Overriding closure');
      })
    ).resolves.not.toThrow();

    // Verify dbService.saveTask was called with ClosedInSubTeamIDs set to owner's sub-team
    const { dbService } = await import('../lib/dbService');
    expect(dbService.saveTask).toHaveBeenCalledWith(
      expect.objectContaining({
        ClosedInSubTeamIDs: ['ST-001'], // Owner's sub-team, NOT closer's ST-002
      })
    );
  });

  it('Reopen clears ClosedInSubTeamIDs field', async () => {
    const { result } = renderHook(() => useTaskOperations(defaultProps));

    await expect(
      act(async () => {
        await result.current.handleCreateFollowUp('TSK-001', 'Reopen reason');
      })
    ).resolves.not.toThrow();

    // Verify dbService.saveTask was called with ClosedInSubTeamIDs cleared
    const { dbService } = await import('../lib/dbService');
    expect(dbService.saveTask).toHaveBeenCalledWith(
      expect.objectContaining({
        ClosedInSubTeamIDs: null, // Cleared on reopen
      })
    );
  });

  it('Task owner with no SubTeamIDs records null (no error)', async () => {
    const taskWithNoSubTeamOwner: Task = {
      ...mockTasks[0],
      AssignedToEmail: 'nosubteam@test.com',
    };

    const noSubTeamProps = {
      ...defaultProps,
      tasks: [taskWithNoSubTeamOwner],
      selectedTask: taskWithNoSubTeamOwner,
    };

    const { result } = renderHook(() => useTaskOperations(noSubTeamProps));

    await expect(
      act(async () => {
        await result.current.handleCloseTask('TSK-001', 'Task completed');
      })
    ).resolves.not.toThrow();

    // Verify dbService.saveTask was called with ClosedInSubTeamIDs set to empty array (no sub-teams)
    const { dbService } = await import('../lib/dbService');
    expect(dbService.saveTask).toHaveBeenCalledWith(
      expect.objectContaining({
        ClosedInSubTeamIDs: [], // Empty array when owner has no sub-teams
      })
    );
  });

  it('Multi-assignee task records all assignees\' sub-teams', async () => {
    const multiAssigneeTask: Task = {
      ...mockTasks[0],
      AssignedToEmail: 'owner@test.com, closer@test.com',
    };

    const multiAssigneeProps = {
      ...defaultProps,
      tasks: [multiAssigneeTask],
      selectedTask: multiAssigneeTask,
    };

    const { result } = renderHook(() => useTaskOperations(multiAssigneeProps));

    await expect(
      act(async () => {
        await result.current.handleCloseTask('TSK-001', 'Task completed');
      })
    ).resolves.not.toThrow();

    // Verify dbService.saveTask was called with both assignees' sub-teams
    const { dbService } = await import('../lib/dbService');
    expect(dbService.saveTask).toHaveBeenCalledWith(
      expect.objectContaining({
        ClosedInSubTeamIDs: ['ST-001', 'ST-002'], // Both assignees' sub-teams
      })
    );
  });
});
