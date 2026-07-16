import { asyncWrapper } from '../utils/asyncWrapper';
import { getTeamReportConfigs as getTeamReportConfigsService, saveTeamReportConfig } from '../services/teamReportConfigService';
import { logger } from '../utils/logger';

/**
 * Controller for team report configuration operations
 */

/**
 * Get all team report configurations
 */
export const getTeamReportConfigs = asyncWrapper(async (req, res) => {
  try {
    const configs = await getTeamReportConfigsService();
    res.json({ 
      success: true, 
      configs 
    });
  } catch (error) {
    logger.error('Error in getTeamReportConfigs controller:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get team report configurations' 
    });
  }
});

/**
 * Update a team's report configuration
 */
export const updateTeamReportConfig = asyncWrapper(async (req, res) => {
  try {
    const { teamId } = req.params;
    const { reminderDay, meetingDay } = req.body;

    // Allow empty strings to clear configuration, but require both to be set or both empty
    if ((reminderDay && !meetingDay) || (!reminderDay && meetingDay)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Both reminderDay and meetingDay must be set together, or both left empty to clear configuration' 
      });
    }

    // If both are empty, delete the configuration
    if (!reminderDay && !meetingDay) {
      const { deleteTeamReportConfig } = await import('../services/teamReportConfigService');
      const success = await deleteTeamReportConfig(teamId);
      
      if (success) {
        res.json({ 
          success: true, 
          message: 'Team report configuration cleared successfully' 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: 'Failed to clear team report configuration' 
        });
      }
      return;
    }

    // Get the team name from teams or sub_teams collection
    const { firestoreAdmin } = await import('../services/firebaseAdmin');
    
    // Try teams collection first
    let teamDoc = await firestoreAdmin.collection('teams').doc(teamId).get();
    let teamName = 'Unknown';
    let entityType: 'team' | 'subteam' = 'team';
    let parentTeamId: string | undefined = undefined;

    if (teamDoc.exists) {
      const teamData = teamDoc.data();
      teamName = teamData?.TeamName || 'Unknown';
    } else {
      // Try sub_teams collection
      const subTeamDoc = await firestoreAdmin.collection('sub_teams').doc(teamId).get();
      if (subTeamDoc.exists) {
        const subTeamData = subTeamDoc.data();
        teamName = subTeamData?.SubTeamName || 'Unknown';
        entityType = 'subteam';
        parentTeamId = subTeamData?.TeamID;
      } else {
        return res.status(404).json({ 
          success: false, 
          message: 'Team or sub-team not found' 
        });
      }
    }

    const success = await saveTeamReportConfig({
      teamId,
      teamName,
      reminderDay,
      meetingDay,
      active: true,
      updatedAt: new Date().toISOString(),
      entityType,
      parentTeamId,
    });

    if (success) {
      res.json({ 
        success: true, 
        message: 'Team report configuration updated successfully' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to update team report configuration' 
      });
    }
  } catch (error) {
    logger.error('Error in updateTeamReportConfig controller:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update team report configuration' 
    });
  }
});
