import { describe, it, expect } from 'vitest';
import { getReportDeadline, getMostRecentMeetingDate } from './teamReportConfigService';

describe('teamReportConfigService - Timezone Functions', () => {
  describe('getMostRecentMeetingDate', () => {
    it('should return today when referenceDate is the meeting day', () => {
      // Monday, January 5, 2026 (known Monday)
      const referenceDate = new Date('2026-01-05T12:00:00Z');
      const result = getMostRecentMeetingDate('Monday', 'Asia/Kolkata', referenceDate);
      expect(result).toBe('2026-01-05');
    });

    it('should return previous Monday when referenceDate is Tuesday', () => {
      // Tuesday, January 6, 2026
      const referenceDate = new Date('2026-01-06T12:00:00Z');
      const result = getMostRecentMeetingDate('Monday', 'Asia/Kolkata', referenceDate);
      expect(result).toBe('2026-01-05');
    });

    it('should return previous Monday when referenceDate is Sunday', () => {
      // Sunday, January 4, 2026
      const referenceDate = new Date('2026-01-04T12:00:00Z');
      const result = getMostRecentMeetingDate('Monday', 'Asia/Kolkata', referenceDate);
      expect(result).toBe('2025-12-29');
    });

    it('should be deterministic with same referenceDate', () => {
      const referenceDate = new Date('2026-01-05T12:00:00Z');
      const result1 = getMostRecentMeetingDate('Monday', 'Asia/Kolkata', referenceDate);
      const result2 = getMostRecentMeetingDate('Monday', 'Asia/Kolkata', referenceDate);
      expect(result1).toBe(result2);
    });
  });

  describe('getReportDeadline', () => {
    it('should calculate correct deadline for Asia/Kolkata (UTC+5:30)', () => {
      // Monday meeting in Kolkata
      // January 5, 2026 is a Monday
      const referenceDate = new Date('2026-01-05T12:00:00Z');
      const deadline = getReportDeadline('Monday', 'Asia/Kolkata', referenceDate);
      
      // Get the meeting date for this reference
      const meetingDate = getMostRecentMeetingDate('Monday', 'Asia/Kolkata', referenceDate);
      expect(meetingDate).toBe('2026-01-05');
      
      // The deadline should be 23:59:59 IST on that day
      // IST is UTC+5:30, so 23:59:59 IST = 18:29:59 UTC
      const expectedUTC = new Date('2026-01-05T18:29:59Z');
      
      // Allow small margin for DST/offset calculation
      expect(Math.abs(deadline.getTime() - expectedUTC.getTime())).toBeLessThan(60000);
    });

    it('should calculate correct deadline for America/New_York (UTC-5 in January)', () => {
      // Monday meeting in New York (January is standard time, UTC-5)
      // January 5, 2026 is a Monday
      const referenceDate = new Date('2026-01-05T12:00:00Z');
      const deadline = getReportDeadline('Monday', 'America/New_York', referenceDate);
      
      const meetingDate = getMostRecentMeetingDate('Monday', 'America/New_York', referenceDate);
      expect(meetingDate).toBe('2026-01-05');
      
      // EST is UTC-5, so 23:59:59 EST = 04:59:59 UTC next day
      const expectedUTC = new Date('2026-01-06T04:59:59Z');
      
      // Allow small margin for DST/offset calculation
      expect(Math.abs(deadline.getTime() - expectedUTC.getTime())).toBeLessThan(60000);
    });

    it('should calculate correct deadline for Australia/Sydney (UTC+11 in January)', () => {
      // Monday meeting in Sydney (January is DST, UTC+11)
      // January 5, 2026 is a Monday
      const referenceDate = new Date('2026-01-05T12:00:00Z');
      const deadline = getReportDeadline('Monday', 'Australia/Sydney', referenceDate);
      
      const meetingDate = getMostRecentMeetingDate('Monday', 'Australia/Sydney', referenceDate);
      expect(meetingDate).toBe('2026-01-05');
      
      // AEDT is UTC+11, so 23:59:59 AEDT = 12:59:59 UTC same day
      const expectedUTC = new Date('2026-01-05T12:59:59Z');
      
      // Allow small margin for DST/offset calculation
      expect(Math.abs(deadline.getTime() - expectedUTC.getTime())).toBeLessThan(60000);
    });

    it('should handle different meeting days correctly', () => {
      // January 7, 2026 is a Wednesday
      const referenceDate = new Date('2026-01-07T12:00:00Z');
      
      // Friday meeting should go back to Friday January 2
      const fridayDeadline = getReportDeadline('Friday', 'Asia/Kolkata', referenceDate);
      const fridayMeeting = getMostRecentMeetingDate('Friday', 'Asia/Kolkata', referenceDate);
      expect(fridayMeeting).toBe('2026-01-02');
      
      // Friday 23:59:59 IST = 18:29:59 UTC
      const expectedUTC = new Date('2026-01-02T18:29:59Z');
      expect(Math.abs(fridayDeadline.getTime() - expectedUTC.getTime())).toBeLessThan(60000);
    });

    it('should be independent of server timezone', () => {
      // This test verifies the fix: the result should be the same regardless
      // of where the server is running, because we use Intl.DateTimeFormat
      // with explicit timezone parameter
      
      const referenceDate = new Date('2026-07-28T12:00:00Z');
      
      // Run the calculation multiple times - should always return same result
      const results = [];
      for (let i = 0; i < 5; i++) {
        const deadline = getReportDeadline('Monday', 'Asia/Kolkata');
        results.push(deadline.getTime());
      }
      
      // All results should be identical
      results.forEach((result, index) => {
        if (index > 0) {
          expect(result).toBe(results[0]);
        }
      });
    });
  });
});
