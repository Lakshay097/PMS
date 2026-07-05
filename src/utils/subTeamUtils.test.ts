import { describe, it, expect } from 'vitest';
import { getVisibleSubTeamIds } from './subTeamUtils';
import { User, SubTeam } from '../types';

describe('getVisibleSubTeamIds', () => {
  it('returns union of sub-teams where user is leader and sub-teams they are a member of', () => {
    const user: User = {
      UserID: 'USR-001',
      FullName: 'Test Leader',
      Email: 'leader@test.com',
      Role: 'Sub-stakeholder',
      ManagerEmail: '',
      SubTeamIDs: ['ST-001', 'ST-003'], // Member of ST-001 and ST-003
      TeamIDs: ['T-001'],
      TeamNames: ['Team A'],
      Active: true,
      CanCreateFollowUp: true,
      CanCloseTask: true,
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString(),
    };

    const subTeams: SubTeam[] = [
      {
        SubTeamID: 'ST-001',
        TeamID: 'T-001',
        SubTeamName: 'SubTeam Alpha',
        Description: 'First sub-team',
        Active: true,
        SubTeamLeaderEmails: ['leader@test.com'], // User leads ST-001
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
      {
        SubTeamID: 'ST-002',
        TeamID: 'T-001',
        SubTeamName: 'SubTeam Beta',
        Description: 'Second sub-team',
        Active: true,
        SubTeamLeaderEmails: ['leader@test.com'], // User also leads ST-002
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
      {
        SubTeamID: 'ST-003',
        TeamID: 'T-001',
        SubTeamName: 'SubTeam Gamma',
        Description: 'Third sub-team',
        Active: true,
        SubTeamLeaderEmails: ['other@test.com'], // User is member but not leader
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
      {
        SubTeamID: 'ST-004',
        TeamID: 'T-001',
        SubTeamName: 'SubTeam Delta',
        Description: 'Fourth sub-team',
        Active: false, // Inactive sub-team should not be included
        SubTeamLeaderEmails: ['leader@test.com'],
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
    ];

    const result = getVisibleSubTeamIds(user, subTeams);

    // Should include ST-001 (leader + member), ST-002 (leader only), ST-003 (member only)
    // Should NOT include ST-004 (inactive)
    expect(result).toEqual(['ST-001', 'ST-002', 'ST-003']);
    expect(result).toHaveLength(3);
  });

  it('returns only own sub-team memberships for regular non-leader members', () => {
    const user: User = {
      UserID: 'USR-002',
      FullName: 'Test Member',
      Email: 'member@test.com',
      Role: 'Sub-stakeholder',
      ManagerEmail: '',
      SubTeamIDs: ['ST-001', 'ST-003'], // Member of two sub-teams
      TeamIDs: ['T-001'],
      TeamNames: ['Team A'],
      Active: true,
      CanCreateFollowUp: true,
      CanCloseTask: true,
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString(),
    };

    const subTeams: SubTeam[] = [
      {
        SubTeamID: 'ST-001',
        TeamID: 'T-001',
        SubTeamName: 'SubTeam Alpha',
        Description: 'First sub-team',
        Active: true,
        SubTeamLeaderEmails: ['leader@test.com'], // User is not a leader
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
      {
        SubTeamID: 'ST-002',
        TeamID: 'T-001',
        SubTeamName: 'SubTeam Beta',
        Description: 'Second sub-team',
        Active: true,
        SubTeamLeaderEmails: ['leader@test.com'], // User is not a member or leader
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
      {
        SubTeamID: 'ST-003',
        TeamID: 'T-001',
        SubTeamName: 'SubTeam Gamma',
        Description: 'Third sub-team',
        Active: true,
        SubTeamLeaderEmails: ['other@test.com'], // User is member but not leader
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
    ];

    const result = getVisibleSubTeamIds(user, subTeams);

    // Should only include ST-001 and ST-003 (user's memberships)
    // Should NOT include ST-002 (user is neither leader nor member)
    expect(result).toEqual(['ST-001', 'ST-003']);
    expect(result).toHaveLength(2);
  });

  it('handles user with no sub-team memberships or leadership', () => {
    const user: User = {
      UserID: 'USR-003',
      FullName: 'Test User',
      Email: 'user@test.com',
      Role: 'Sub-stakeholder',
      ManagerEmail: '',
      SubTeamIDs: [], // No sub-team memberships
      TeamIDs: ['T-001'],
      TeamNames: ['Team A'],
      Active: true,
      CanCreateFollowUp: true,
      CanCloseTask: true,
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString(),
    };

    const subTeams: SubTeam[] = [
      {
        SubTeamID: 'ST-001',
        TeamID: 'T-001',
        SubTeamName: 'SubTeam Alpha',
        Description: 'First sub-team',
        Active: true,
        SubTeamLeaderEmails: ['leader@test.com'],
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
    ];

    const result = getVisibleSubTeamIds(user, subTeams);

    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  it('handles case-insensitive email matching for leadership', () => {
    const user: User = {
      UserID: 'USR-004',
      FullName: 'Test Leader',
      Email: 'Leader@TEST.COM', // Uppercase email
      Role: 'Sub-stakeholder',
      ManagerEmail: '',
      SubTeamIDs: [],
      TeamIDs: ['T-001'],
      TeamNames: ['Team A'],
      Active: true,
      CanCreateFollowUp: true,
      CanCloseTask: true,
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString(),
    };

    const subTeams: SubTeam[] = [
      {
        SubTeamID: 'ST-001',
        TeamID: 'T-001',
        SubTeamName: 'SubTeam Alpha',
        Description: 'First sub-team',
        Active: true,
        SubTeamLeaderEmails: ['leader@test.com'], // Lowercase in sub-team data
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
    ];

    const result = getVisibleSubTeamIds(user, subTeams);

    expect(result).toEqual(['ST-001']);
  });

  it('handles undefined SubTeamIDs gracefully', () => {
    const user: User = {
      UserID: 'USR-005',
      FullName: 'Test User',
      Email: 'user@test.com',
      Role: 'Sub-stakeholder',
      ManagerEmail: '',
      SubTeamIDs: undefined, // Undefined instead of empty array
      TeamIDs: ['T-001'],
      TeamNames: ['Team A'],
      Active: true,
      CanCreateFollowUp: true,
      CanCloseTask: true,
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString(),
    };

    const subTeams: SubTeam[] = [];

    const result = getVisibleSubTeamIds(user, subTeams);

    expect(result).toEqual([]);
  });

  it('removes duplicate sub-team IDs from result', () => {
    const user: User = {
      UserID: 'USR-006',
      FullName: 'Test Leader',
      Email: 'leader@test.com',
      Role: 'Sub-stakeholder',
      ManagerEmail: '',
      SubTeamIDs: ['ST-001', 'ST-001'], // Duplicate in membership
      TeamIDs: ['T-001'],
      TeamNames: ['Team A'],
      Active: true,
      CanCreateFollowUp: true,
      CanCloseTask: true,
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString(),
    };

    const subTeams: SubTeam[] = [
      {
        SubTeamID: 'ST-001',
        TeamID: 'T-001',
        SubTeamName: 'SubTeam Alpha',
        Description: 'First sub-team',
        Active: true,
        SubTeamLeaderEmails: ['leader@test.com'], // Also leader
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      },
    ];

    const result = getVisibleSubTeamIds(user, subTeams);

    // Should only appear once despite being both leader and member (with duplicate in array)
    expect(result).toEqual(['ST-001']);
    expect(result).toHaveLength(1);
  });
});
