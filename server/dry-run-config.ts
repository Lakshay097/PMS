import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';

interface TeamConfig {
  teamId: string;
  teamName: string;
  reminderDay: string;
  meetingDay: string;
  entityType: 'team' | 'subteam';
  parentTeamId?: string;
}

// User-provided mapping data with explicit team IDs
const USER_DATA = [
  { stakeholder: 'aatif', team: 'sst', teamId: 'T-499', teamName: 'Ecom - SST', reminderDay: 'monday', meetingDay: 'Tuesday' },
  { stakeholder: 'sourabh', team: 'business Excellence', teamId: 'T-7', teamName: 'Business Excellence', reminderDay: 'Friday', meetingDay: 'Monday' },
  { stakeholder: 'Sudhir', team: 'It/infra', teamId: 'T-706', teamName: 'Infra Office/Corparate', reminderDay: 'Friday', meetingDay: 'Saturday' },
  { stakeholder: 'aman/askhay', team: 'expansion', teamId: 'T-263', teamName: 'Expansion', reminderDay: 'Friday', meetingDay: 'Saturday', includeSubTeams: true },
  { stakeholder: 'Varun', team: 'SCM', teamId: 'T-267', teamName: 'SCM', reminderDay: 'Friday', meetingDay: 'Saturday' },
  { stakeholder: 'Utsav', team: 'Expansion - School', teamId: 'T-3', teamName: 'Expansion-School', reminderDay: 'Friday', meetingDay: 'Saturday' },
  { stakeholder: 'sourabh', team: 'travel', teamId: 'T-5', teamName: 'Travel Desk', reminderDay: 'Friday', meetingDay: 'Saturday' },
  { stakeholder: 'bharat', team: 'ERP and tools', teamId: 'T-210', teamName: 'Ecom - ERP & Tools', reminderDay: 'Friday', meetingDay: 'Monday' },
  { stakeholder: 'varun, kartik', team: 'planning', teamId: 'T-551', teamName: 'Ecom - Planning', reminderDay: 'monday', meetingDay: 'Tuesday' },
  { stakeholder: 'rajan,ravi', team: 'printing', teamId: 'T-771', teamName: 'Ecom - Printing', reminderDay: 'Tuesday', meetingDay: 'Wednesday' },
  { stakeholder: 'nishant,abhishek,varun', team: 'purchase', teamId: 'T-476', teamName: 'Ecom - Purchase', reminderDay: 'Tuesday', meetingDay: 'Wednesday' },
  { stakeholder: 'varun,Narayan', team: 'Billing', teamId: 'T-613', teamName: 'Ecom - Billing', reminderDay: 'Tuesday', meetingDay: 'Wednesday' },
  { stakeholder: 'nikhil ranjan', team: 'warehouse', teamId: 'T-293', teamName: 'Warehouse', reminderDay: 'Friday', meetingDay: 'Monday' },
  { stakeholder: 'Arun,Varun', team: 'DFT', teamId: 'T-593', teamName: 'Ecom - KAM', reminderDay: 'Wednesday', meetingDay: 'Thursday' },
  { stakeholder: 'nikhil ranjan, arpit', team: 'ATL/BTL', teamId: 'T-739', teamName: 'ATL/BTL Marketing', reminderDay: 'Wednesday', meetingDay: 'Thursday' },
];

// Teams to skip (no scheduled reports)
const SKIP_TEAMS = ['T-230', 'T-125', 'T-ALL'];

async function dryRunConfig() {
  try {
    console.log('=== DRY RUN: Team Report Configuration Mapping ===\n');

    // Fetch all teams
    const teamsSnapshot = await firestoreAdmin.collection('teams').get();
    const teamsMap = new Map<string, { id: string; name: string }>();
    teamsSnapshot.forEach(doc => {
      const team = doc.data();
      if (team.Active !== false) {
        teamsMap.set(doc.id, { id: doc.id, name: team.TeamName });
      }
    });

    // Fetch all sub-teams
    const subTeamsSnapshot = await firestoreAdmin.collection('sub_teams').get();
    const subTeamsMap = new Map<string, { id: string; name: string; parentId: string }>();
    subTeamsSnapshot.forEach(doc => {
      const subTeam = doc.data();
      subTeamsMap.set(subTeam.SubTeamName.toLowerCase(), { 
        id: doc.id, 
        name: subTeam.SubTeamName,
        parentId: subTeam.TeamID 
      });
    });

    console.log('=== Current Teams in Firestore ===');
    teamsMap.forEach((value, key) => {
      console.log(`  ${value.name} (${value.id})`);
    });

    console.log('\n=== Current Sub-Teams in Firestore ===');
    subTeamsMap.forEach((value, key) => {
      console.log(`  ${value.name} (${value.id}, Parent: ${value.parentId})`);
    });

    console.log('\n=== Proposed Configuration Mapping ===');
    console.log('Based on user data with explicit team IDs:\n');

    const proposedConfigs: TeamConfig[] = [];
    const unmappedTeams: string[] = [];

    // Process user data using explicit team IDs
    USER_DATA.forEach((entry, index) => {
      const reminderDay = entry.reminderDay.charAt(0).toUpperCase() + entry.reminderDay.slice(1);
      const meetingDay = entry.meetingDay.charAt(0).toUpperCase() + entry.meetingDay.slice(1);

      // Check if team exists in Firestore
      const teamExists = teamsMap.has(entry.teamId);
      
      if (teamExists) {
        proposedConfigs.push({
          teamId: entry.teamId,
          teamName: entry.teamName,
          reminderDay: reminderDay === 'Wednesay' ? 'Wednesday' : reminderDay,
          meetingDay: meetingDay,
          entityType: 'team',
        });
        console.log(`${index + 1}. TEAM: ${entry.teamName} (${entry.teamId}) -> Reminder: ${reminderDay === 'Wednesay' ? 'Wednesday' : reminderDay}, Meeting: ${meetingDay}`);
        
        // If includeSubTeams flag is set, add sub-teams
        if (entry.includeSubTeams) {
          subTeamsSnapshot.forEach(doc => {
            const subTeam = doc.data();
            if (subTeam.TeamID === entry.teamId) {
              proposedConfigs.push({
                teamId: doc.id,
                teamName: subTeam.SubTeamName,
                reminderDay: reminderDay === 'Wednesay' ? 'Wednesday' : reminderDay,
                meetingDay: meetingDay,
                entityType: 'subteam',
                parentTeamId: entry.teamId,
              });
              console.log(`   + SUB-TEAM: ${subTeam.SubTeamName} (${doc.id}) -> Same schedule as parent`);
            }
          });
        }
      } else {
        unmappedTeams.push(entry.teamName);
        console.log(`${index + 1}. NOT FOUND: ${entry.teamName} (${entry.teamId})`);
      }
    });

    console.log('\n=== Summary ===');
    console.log(`Total entries in user data: ${USER_DATA.length}`);
    console.log(`Successfully mapped: ${proposedConfigs.length}`);
    console.log(`Not found in Firestore: ${unmappedTeams.length}`);

    if (unmappedTeams.length > 0) {
      console.log('\n=== Unmapped Teams (need attention) ===');
      unmappedTeams.forEach(team => {
        console.log(`  - ${team}`);
      });
    }

    console.log('\n=== Teams/Sub-teams NOT in user data (will be skipped) ===');
    const allMappedIds = new Set(proposedConfigs.map(c => c.teamId));
    
    teamsMap.forEach((value) => {
      if (!allMappedIds.has(value.id) && !SKIP_TEAMS.includes(value.id)) {
        console.log(`  TEAM: ${value.name} (${value.id})`);
      }
    });
    
    if (SKIP_TEAMS.length > 0) {
      console.log('\n=== Explicitly Skipped Teams (no scheduled reports) ===');
      SKIP_TEAMS.forEach(teamId => {
        const team = teamsMap.get(teamId);
        if (team) {
          console.log(`  TEAM: ${team.name} (${teamId})`);
        }
      });
    }

    console.log('\n=== DRY RUN COMPLETE ===');
    console.log('No changes were made to Firestore.');
    console.log('Review the mapping above and confirm if this looks correct.');

    process.exit(0);
  } catch (error) {
    console.error('Error in dry run:', error);
    process.exit(1);
  }
}

dryRunConfig();
