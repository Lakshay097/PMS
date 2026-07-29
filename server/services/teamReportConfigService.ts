import { logger } from '../utils/logger';

export interface TeamReportConfig {
  teamId: string;
  teamName: string;
  reminderDay: string; // e.g., "Monday", "Tuesday", etc.
  meetingDay: string; // e.g., "Monday", "Tuesday", etc.
  timezone: string; // e.g., "Asia/Kolkata", "America/New_York"
  reminderTime: string; // e.g., "09:30" in 24-hour format
  active: boolean;
  updatedAt: string;
  entityType?: 'team' | 'subteam';
  parentTeamId?: string;
}

/**
 * Get all team report configurations from Firestore
 */
export async function getTeamReportConfigs(): Promise<TeamReportConfig[]> {
  try {
    const { firestoreAdmin } = await import('./firebaseAdmin');
    const snapshot = await firestoreAdmin.collection('team_report_config').get();
    
    if (snapshot.empty) return [];

    const configs: TeamReportConfig[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.active !== false) {
        configs.push({
          teamId: data.teamId,
          teamName: data.teamName || '',
          reminderDay: data.reminderDay,
          meetingDay: data.meetingDay,
          timezone: data.timezone || 'Asia/Kolkata', // Default to IST for backward compatibility
          reminderTime: data.reminderTime || '09:30', // Default to 9:30 AM
          active: data.active !== false,
          updatedAt: data.updatedAt || new Date().toISOString(),
          entityType: data.entityType || 'team',
          parentTeamId: data.parentTeamId || undefined,
        });
      }
    });

    return configs;
  } catch (err) {
    logger.error('Error getting team report configs:', err);
    return [];
  }
}

/**
 * Get a specific team's report configuration
 */
export async function getTeamReportConfig(teamId: string): Promise<TeamReportConfig | null> {
  const configs = await getTeamReportConfigs();
  return configs.find(c => c.teamId === teamId) || null;
}

/**
 * Save or update a team report configuration to Firestore
 */
export async function saveTeamReportConfig(config: TeamReportConfig): Promise<boolean> {
  try {
    const { firestoreAdmin } = await import('./firebaseAdmin');
    const now = new Date().toISOString();

    await firestoreAdmin.collection('team_report_config').doc(config.teamId).set({
      teamId: config.teamId,
      teamName: config.teamName,
      reminderDay: config.reminderDay,
      meetingDay: config.meetingDay,
      timezone: config.timezone || 'Asia/Kolkata',
      reminderTime: config.reminderTime || '09:30',
      active: config.active,
      updatedAt: now,
      entityType: config.entityType || 'team',
      parentTeamId: config.parentTeamId || null,
    }, { merge: true });

    logger.info(`Saved team report config for ${config.teamName} (${config.teamId}) to Firestore`);
    return true;
  } catch (err) {
    logger.error('Error saving team report config to Firestore:', err);
    return false;
  }
}

/**
 * Delete a team report configuration from Firestore
 */
export async function deleteTeamReportConfig(teamId: string): Promise<boolean> {
  try {
    const { firestoreAdmin } = await import('./firebaseAdmin');

    await firestoreAdmin.collection('team_report_config').doc(teamId).delete();
    logger.info(`Deleted team report config for team ID: ${teamId} from Firestore`);
    return true;
  } catch (err) {
    logger.error('Error deleting team report config from Firestore:', err);
    return false;
  }
}

/**
 * Get the most recent occurrence of a weekday in a specific timezone
 * Walks backward from referenceDate to find the most recent date matching meetingDay
 * Returns date as YYYY-MM-DD in the specified timezone
 * Fully deterministic given its inputs - suitable for testing and backfills
 */
export function getMostRecentMeetingDate(
  meetingDay: string,
  timezone: string,
  referenceDate: Date = new Date()
): string {
  const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const targetDayIndex = DAYS_OF_WEEK.indexOf(meetingDay);
  
  if (targetDayIndex === -1) {
    throw new Error(`Invalid meeting day: ${meetingDay}`);
  }

  // Get the current day of week in the target timezone
  const options: Intl.DateTimeFormatOptions = { timeZone: timezone, weekday: 'long' };
  const currentDayName = new Intl.DateTimeFormat('en-US', options).format(referenceDate);
  const currentDayIndex = DAYS_OF_WEEK.indexOf(currentDayName);

  // Calculate days to subtract using modulo (0 = today is the meeting day = valid, use today)
  const daysToSubtract = (currentDayIndex - targetDayIndex + 7) % 7;

  // Subtract days from reference date (in UTC to avoid DST issues)
  const resultDate = new Date(referenceDate.getTime());
  resultDate.setUTCDate(resultDate.getUTCDate() - daysToSubtract);

  // Format as YYYY-MM-DD in the target timezone
  const dateOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  };
  const formatter = new Intl.DateTimeFormat('en-US', dateOptions);
  const parts = formatter.formatToParts(resultDate);
  
  const year = parts.find(p => p.type === 'year')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';

  return `${year}-${month}-${day}`;
}

/**
 * Returns the timezone's UTC offset in minutes at a given instant.
 * Positive = ahead of UTC (e.g. Asia/Kolkata = +330), negative = behind (e.g. America/New_York in winter = -300).
 */
function getTimezoneOffsetMinutes(timezone: string, atInstant: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(atInstant);
  const map: Record<string, string> = {};
  parts.forEach(p => { map[p.type] = p.value; });

  // Intl sometimes gives hour "24" for midnight — normalize to 0
  const hour = map.hour === '24' ? 0 : parseInt(map.hour, 10);

  // What UTC timestamp would this same wall-clock reading be, if it *were* UTC?
  const asIfUTC = Date.UTC(
    parseInt(map.year, 10),
    parseInt(map.month, 10) - 1,
    parseInt(map.day, 10),
    hour,
    parseInt(map.minute, 10),
    parseInt(map.second, 10),
  );

  // Difference between that and the real instant IS the offset.
  return (asIfUTC - atInstant.getTime()) / 60000;
}

/**
 * Converts a wall-clock date/time string (e.g. "2026-07-28T23:59:59"),
 * meant as local time IN `timezone`, into the correct UTC Date instant.
 */
function zonedTimeToUtcInstant(dateTimeStr: string, timezone: string): Date {
  const [datePart, timePart] = dateTimeStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);

  // Step 1: guess the UTC instant by treating the wall-clock numbers as if they were UTC.
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);

  // Step 2: find the timezone's real offset AT that guessed instant.
  const offsetMinutes = getTimezoneOffsetMinutes(timezone, new Date(utcGuess));

  // Step 3: the true UTC instant is the guess minus the offset.
  return new Date(utcGuess - offsetMinutes * 60000);
}

/**
 * Get the report deadline (EOD of the most recent meeting day) in UTC
 * Returns a Date object representing 23:59:59 in the team's timezone, converted to UTC
 */
export function getReportDeadline(meetingDay: string, timezone: string, referenceDate?: Date): Date {
  const meetingDateISO = getMostRecentMeetingDate(meetingDay, timezone, referenceDate);
  return zonedTimeToUtcInstant(`${meetingDateISO}T23:59:59`, timezone);
}
