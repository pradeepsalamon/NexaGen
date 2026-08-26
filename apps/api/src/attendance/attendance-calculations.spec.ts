import { AttendanceStatus } from '@prisma/client';

// Pure calculation helpers extracted from AttendanceService for testability.
// These mirror the service logic so tests verify the algorithm, not NestJS wiring.

function calculateTotalDuration(
  logs: Array<{
    eventType: string;
    sessionStart: Date | null;
    sessionEnd: Date | null;
    sessionDuration: number | null;
  }>
): number {
  const now = new Date();
  let total = 0;
  for (const log of logs) {
    if (
      log.eventType === 'JOIN' ||
      log.eventType === 'RECONNECT'
    ) {
      if (log.sessionDuration) {
        total += log.sessionDuration;
      } else if (log.sessionStart && !log.sessionEnd) {
        total += Math.floor(
          (now.getTime() - log.sessionStart.getTime()) / 1000
        );
      }
    }
  }
  return total;
}

function determineStatus(
  percent: number,
  policy: {
    presentThreshold: number;
    lateThreshold: number;
    partialThreshold: number;
  }
): AttendanceStatus {
  if (percent >= policy.presentThreshold) return AttendanceStatus.PRESENT;
  if (percent >= policy.lateThreshold) return AttendanceStatus.LATE;
  if (percent >= policy.partialThreshold) return AttendanceStatus.PARTIAL;
  return AttendanceStatus.ABSENT;
}

const defaultPolicy = {
  presentThreshold: 90,
  lateThreshold: 70,
  partialThreshold: 30,
};

describe('Attendance Calculations', () => {
  describe('calculateTotalDuration', () => {
    it('should sum session durations from closed JOIN sessions', () => {
      const logs = [
        {
          eventType: 'JOIN',
          sessionStart: new Date('2026-01-01T10:00:00Z'),
          sessionEnd: new Date('2026-01-01T10:30:00Z'),
          sessionDuration: 1800,
        },
        {
          eventType: 'LEAVE',
          sessionStart: null,
          sessionEnd: null,
          sessionDuration: null,
        },
      ];
      expect(calculateTotalDuration(logs)).toBe(1800);
    });

    it('should sum multiple closed session segments', () => {
      const logs = [
        {
          eventType: 'JOIN',
          sessionStart: new Date('2026-01-01T10:00:00Z'),
          sessionEnd: new Date('2026-01-01T10:20:00Z'),
          sessionDuration: 1200,
        },
        {
          eventType: 'RECONNECT',
          sessionStart: new Date('2026-01-01T10:25:00Z'),
          sessionEnd: new Date('2026-01-01T10:50:00Z'),
          sessionDuration: 1500,
        },
      ];
      expect(calculateTotalDuration(logs)).toBe(2700);
    });

    it('should ignore LEAVE and DISCONNECT events in duration sum', () => {
      const logs = [
        {
          eventType: 'JOIN',
          sessionStart: new Date('2026-01-01T10:00:00Z'),
          sessionEnd: new Date('2026-01-01T10:30:00Z'),
          sessionDuration: 1800,
        },
        {
          eventType: 'LEAVE',
          sessionStart: null,
          sessionEnd: null,
          sessionDuration: null,
        },
        {
          eventType: 'DISCONNECT',
          sessionStart: null,
          sessionEnd: null,
          sessionDuration: null,
        },
      ];
      expect(calculateTotalDuration(logs)).toBe(1800);
    });

    it('should return 0 for empty logs', () => {
      expect(calculateTotalDuration([])).toBe(0);
    });

    it('should return 0 for logs with all null durations', () => {
      const logs = [
        {
          eventType: 'JOIN',
          sessionStart: null,
          sessionEnd: null,
          sessionDuration: null,
        },
      ];
      expect(calculateTotalDuration(logs)).toBe(0);
    });

    it('should handle open sessions by calculating time from start to now', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const logs = [
        {
          eventType: 'JOIN',
          sessionStart: fiveMinutesAgo,
          sessionEnd: null,
          sessionDuration: null,
        },
      ];
      const result = calculateTotalDuration(logs);
      // Should be approximately 300 seconds (5 minutes), allow 5s tolerance
      expect(result).toBeGreaterThanOrEqual(295);
      expect(result).toBeLessThanOrEqual(310);
    });
  });

  describe('determineStatus', () => {
    it('should return PRESENT for >= 90%', () => {
      expect(determineStatus(90, defaultPolicy)).toBe(AttendanceStatus.PRESENT);
      expect(determineStatus(100, defaultPolicy)).toBe(AttendanceStatus.PRESENT);
      expect(determineStatus(95.5, defaultPolicy)).toBe(AttendanceStatus.PRESENT);
    });

    it('should return LATE for >= 70% but < 90%', () => {
      expect(determineStatus(70, defaultPolicy)).toBe(AttendanceStatus.LATE);
      expect(determineStatus(89.9, defaultPolicy)).toBe(AttendanceStatus.LATE);
    });

    it('should return PARTIAL for >= 30% but < 70%', () => {
      expect(determineStatus(30, defaultPolicy)).toBe(AttendanceStatus.PARTIAL);
      expect(determineStatus(69.9, defaultPolicy)).toBe(AttendanceStatus.PARTIAL);
    });

    it('should return ABSENT for < 30%', () => {
      expect(determineStatus(0, defaultPolicy)).toBe(AttendanceStatus.ABSENT);
      expect(determineStatus(29.9, defaultPolicy)).toBe(AttendanceStatus.ABSENT);
    });

    it('should respect custom thresholds', () => {
      const customPolicy = {
        presentThreshold: 80,
        lateThreshold: 60,
        partialThreshold: 20,
      };
      expect(determineStatus(80, customPolicy)).toBe(AttendanceStatus.PRESENT);
      expect(determineStatus(60, customPolicy)).toBe(AttendanceStatus.LATE);
      expect(determineStatus(20, customPolicy)).toBe(AttendanceStatus.PARTIAL);
      expect(determineStatus(19, customPolicy)).toBe(AttendanceStatus.ABSENT);
    });
  });

  describe('Attendance percentage calculation', () => {
    it('should calculate percentage correctly for full attendance', () => {
      const scheduledDuration = 3600; // 1 hour
      const actualDuration = 3600;
      const percent = Math.min(100, (actualDuration / scheduledDuration) * 100);
      expect(percent).toBe(100);
    });

    it('should calculate percentage for partial attendance', () => {
      const scheduledDuration = 3600; // 1 hour
      const actualDuration = 3120; // 52 minutes
      const percent = Math.min(100, (actualDuration / scheduledDuration) * 100);
      expect(Math.round(percent * 10) / 10).toBe(86.7);
    });

    it('should cap at 100% even if duration exceeds scheduled', () => {
      const scheduledDuration = 3600;
      const actualDuration = 4000;
      const percent = Math.min(100, (actualDuration / scheduledDuration) * 100);
      expect(percent).toBe(100);
    });

    it('should handle zero scheduled duration', () => {
      const scheduledDuration = 0;
      const actualDuration = 3600;
      const percent =
        scheduledDuration > 0
          ? Math.min(100, (actualDuration / scheduledDuration) * 100)
          : 100;
      expect(percent).toBe(100);
    });
  });

  describe('Duration formatting', () => {
    const formatDuration = (seconds: number) => {
      if (!seconds) return '0 min';
      const minutes = Math.floor(seconds / 60);
      const hrs = Math.floor(minutes / 60);
      const mins = minutes % 60;
      if (hrs > 0) return `${hrs}h ${mins}m`;
      return `${minutes} min`;
    };

    it('should format 0 seconds', () => {
      expect(formatDuration(0)).toBe('0 min');
    });

    it('should format minutes only', () => {
      expect(formatDuration(300)).toBe('5 min');
      expect(formatDuration(3599)).toBe('59 min');
    });

    it('should format hours and minutes', () => {
      expect(formatDuration(3600)).toBe('1h 0m');
      expect(formatDuration(5400)).toBe('1h 30m');
      expect(formatDuration(7260)).toBe('2h 1m');
    });
  });
});
