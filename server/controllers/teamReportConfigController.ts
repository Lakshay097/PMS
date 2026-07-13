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

    if (!reminderDay || !meetingDay) {
      return res.status(400).json({ 
        success: false, 
        message: 'reminderDay and meetingDay are required' 
      });
    }

    // Get the team name from the config or teams collection
    const { firestoreAdmin } = await import('../services/firebaseAdmin');
    const teamDoc = await firestoreAdmin.collection('teams').doc(teamId).get();
    
    if (!teamDoc.exists) {
      return res.status(404).json({ 
        success: false, 
        message: 'Team not found' 
      });
    }

    const teamData = teamDoc.data();
    const teamName = teamData?.TeamName || 'Unknown';

    const success = await saveTeamReportConfig({
      teamId,
      teamName,
      reminderDay,
      meetingDay,
      active: true,
      updatedAt: new Date().toISOString(),
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
