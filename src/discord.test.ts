import { describe, test, expect } from "vitest";
import {
  safeTruncate,
  getFormattedFooterText,
  buildStatsSection,
  pickColor,
} from "./discord";
import { parseSleepStagesForDate } from "./googleFit";
import { HealthData, SleepReconcileResponse } from "./types";

describe("Discord Helper Functions", () => {
  // ─── Tests for safeTruncate ───────────────────────────────────────────────
  describe("safeTruncate", () => {
    test("does not truncate text if within max length", () => {
      const text = "Hello, world!";
      expect(safeTruncate(text, 100)).toBe(text);
    });

    test("truncates text and appends message if exceeding limit", () => {
      const text = "A".repeat(150);
      const result = safeTruncate(text, 100);
      expect(result).toContain(
        "*(เนื้อหาบางส่วนถูกละไว้เนื่องจากยาวเกินกำหนด)*",
      );
      expect(result.length).toBeLessThan(150);
    });

    test("closes unclosed markdown code blocks on truncation", () => {
      const text =
        "Some text\n```typescript\n" + "A".repeat(100) + "\nconst a = 1;";
      const result = safeTruncate(text, 120);
      expect(result).toContain("```");
      expect(result.split("```").length % 2).toBe(1); // Odd number of parts means even number of code blocks (all closed)
    });
  });

  // ─── Tests for getFormattedFooterText ──────────────────────────────────────
  describe("getFormattedFooterText", () => {
    test("returns formatted footer with base text and BKK datetime", () => {
      const baseText = "Test Footer";
      const result = getFormattedFooterText(baseText);
      expect(result).toContain(baseText);
      expect(result).toMatch(/• \d{1,2} [ก-๙.]+\s\d{2} • \d{2}:\d{2} น\./);
    });
  });

  // ─── Tests for pickColor ──────────────────────────────────────────────────
  describe("pickColor", () => {
    const COLOR = {
      EXCELLENT: 0x2ecc71,
      GOOD: 0x3498db,
      AVERAGE: 0xf39c12,
      POOR: 0xe74c3c,
    };

    const mockHealthBase = {
      stepGoalPercent: 0,
      sleepDurationMinutes: 0,
      heartRateAvg: 0,
      activeZoneMinutesTotal: 0,
    } as unknown as HealthData;

    test("returns EXCELLENT when score is >= 6", () => {
      const health = {
        ...mockHealthBase,
        stepGoalPercent: 100, // +2
        sleepDurationMinutes: 420, // +2
        heartRateAvg: 70, // +2 (between 60 and 100)
        activeZoneMinutesTotal: 30, // +2
      };
      expect(pickColor(health)).toBe(COLOR.EXCELLENT); // score = 8
    });

    test("returns GOOD when score is >= 4 and < 6", () => {
      const health = {
        ...mockHealthBase,
        stepGoalPercent: 50, // +1
        sleepDurationMinutes: 300, // +1
        heartRateAvg: 70, // +2
        activeZoneMinutesTotal: 10, // +0
      };
      expect(pickColor(health)).toBe(COLOR.GOOD); // score = 4
    });

    test("returns AVERAGE when score is >= 2 and < 4", () => {
      const health = {
        ...mockHealthBase,
        stepGoalPercent: 0, // +0
        sleepDurationMinutes: 300, // +1
        heartRateAvg: 120, // +1 (not between 60 and 100)
        activeZoneMinutesTotal: 0, // +0
      };
      expect(pickColor(health)).toBe(COLOR.AVERAGE); // score = 2
    });

    test("returns POOR when score is < 2", () => {
      const health = {
        ...mockHealthBase,
        stepGoalPercent: 0, // +0
        sleepDurationMinutes: 0, // +0
        heartRateAvg: 120, // +1
        activeZoneMinutesTotal: 0, // +0
      };
      expect(pickColor(health)).toBe(COLOR.POOR); // score = 1
    });
  });

  // ─── Tests for parseSleepStagesForDate ────────────────────────────────────
  describe("parseSleepStagesForDate", () => {
    const mockHealthBase = {
      date: "2026-07-12",
      steps: 8000,
      stepGoalPercent: 80,
      sleepDurationMinutes: 480,
      sleepDurationFormatted: "8 ชั่วโมง 0 นาที",
      heartRateAvg: 70,
      heartRateMin: 50,
      heartRateMax: 100,
      totalCalories: 2000,
      activeZoneMinutesTotal: 30,
      activeZoneMinutesDetails: { fatBurn: 20, cardio: 10, peak: 0 },
      restingHeartRate: 60,
      rawData: {
        steps: { rollupDataPoints: [] },
        heartRate: { rollupDataPoints: [] },
        sleep: { dataPoints: [] },
        totalCalories: { rollupDataPoints: [] },
        activeZoneMinutes: { rollupDataPoints: [] },
        restingHeartRate: { dataPoints: [] },
      },
    } as unknown as HealthData;

    test("parses and sums sleep stages correctly from raw sleep data", () => {
      const mockSleep: SleepReconcileResponse = {
        dataPoints: [
          {
            sleep: {
              interval: {
                startTime: "2026-07-12T23:00:00+07:00",
                endTime: "2026-07-13T06:30:00+07:00",
              },
              stages: [
                {
                  startTime: "2026-07-12T23:00:00+07:00",
                  endTime: "2026-07-12T23:30:00+07:00",
                  type: "AWAKE",
                },
                {
                  startTime: "2026-07-12T23:30:00+07:00",
                  endTime: "2026-07-13T00:30:00+07:00",
                  type: "DEEP",
                },
                {
                  startTime: "2026-07-13T00:30:00+07:00",
                  endTime: "2026-07-13T01:30:00+07:00",
                  type: "REM",
                },
                {
                  startTime: "2026-07-13T01:30:00+07:00",
                  endTime: "2026-07-13T03:00:00+07:00",
                  type: "LIGHT",
                },
                {
                  startTime: "2026-07-13T03:00:00+07:00",
                  endTime: "2026-07-13T03:15:00+07:00",
                  type: "RESTLESS",
                },
              ],
            },
          },
        ],
      };

      const health = {
        ...mockHealthBase,
        rawData: {
          ...mockHealthBase.rawData,
          sleep: mockSleep,
        },
      } as unknown as HealthData;

      const stages = parseSleepStagesForDate(health.rawData.sleep.dataPoints, health.date);
      expect(stages.awake).toBe(30);
      expect(stages.deep).toBe(60);
      expect(stages.rem).toBe(60);
      expect(stages.light).toBe(90);
      expect(stages.restless).toBe(15);
    });

    test("returns all zeros when no sleep data points are present", () => {
      const health = {
        ...mockHealthBase,
        rawData: {
          ...mockHealthBase.rawData,
          sleep: { dataPoints: [] },
        },
      } as unknown as HealthData;

      const stages = parseSleepStagesForDate(health.rawData.sleep.dataPoints, health.date);
      expect(stages.deep).toBe(0);
      expect(stages.rem).toBe(0);
      expect(stages.light).toBe(0);
      expect(stages.restless).toBe(0);
      expect(stages.awake).toBe(0);
    });
  });

  // ─── Tests for buildStatsSection ─────────────────────────────────────────
  describe("buildStatsSection", () => {
    test("generates stats string in Modern Minimalist style with English UPPERCASE headers", () => {
      const mockSleep: SleepReconcileResponse = {
        dataPoints: [
          {
            sleep: {
              interval: {
                startTime: "2026-07-12T23:00:00+07:00",
                endTime: "2026-07-13T06:30:00+07:00",
              },
              stages: [
                {
                  startTime: "2026-07-12T23:30:00+07:00",
                  endTime: "2026-07-13T00:30:00+07:00",
                  type: "DEEP",
                },
                {
                  startTime: "2026-07-13T00:30:00+07:00",
                  endTime: "2026-07-13T01:30:00+07:00",
                  type: "REM",
                },
              ],
            },
          },
        ],
      };

      const health = {
        date: "2026-07-12",
        steps: 8000,
        stepGoalPercent: 80,
        sleepDurationMinutes: 480,
        sleepDurationFormatted: "8 ชั่วโมง 0 นาที",
        sleepStages: { deep: 60, rem: 60, light: 0, restless: 0, awake: 0 },
        heartRateAvg: 70,
        heartRateMin: 50,
        heartRateMax: 100,
        totalCalories: 2000,
        activeZoneMinutesTotal: 30,
        activeZoneMinutesDetails: { fatBurn: 20, cardio: 10, peak: 0 },
        restingHeartRate: 60,
        rawData: { sleep: mockSleep },
      } as unknown as HealthData;

      const result = buildStatsSection(health);

      // Check for clean indicators and UPPERCASE headers
      expect(result).toContain("◆ **DAILY HEALTH REPORT • 2026-07-12**");
      expect(result).toContain("▪ **ACTIVITY**");
      expect(result).toContain("▪ **SLEEP**");
      expect(result).toContain("▪ **HEART RATE**");
      expect(result).toContain("▪ **ACTIVE ZONE**");
      expect(result).toContain("▪ **CALORIES**");
      expect(result).toContain("◆ **AI COACH ANALYSIS**");

      // Check for dynamic tree rendering
      expect(result).toContain("├─ Deep Sleep:");
      expect(result).toContain("└─ REM Sleep:");
      expect(result).not.toContain("Light Sleep"); // Not in stages list
    });
  });
});
