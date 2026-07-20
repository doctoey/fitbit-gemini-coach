// src/discord.ts
// ส่งผลลัพธ์เข้า Discord Webhook พร้อม Embed สวยงาม
//
// โครงสร้าง Discord Embed:
//   description  → Stats สั้นๆ + เส้นแบ่ง + บทวิเคราะห์จาก Gemini (เป็นผืนเดียวกัน สวยงาม ไม่ขัดตา)
//
// Discord limits:
//   description  ≤ 4096 chars (ครอบคลุมทั้งหมด สบายๆ เพราะเราจำกัด maxOutputTokens ของ Gemini)

import axios from "axios";
import { DiscordPayload, HealthData } from "./types";

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLOR = {
  EXCELLENT: 0x2ecc71, // เขียว
  GOOD: 0x3498db, // ฟ้า
  AVERAGE: 0xf39c12, // เหลือง
  POOR: 0xe74c3c, // แดง
};

function pickColor(health: HealthData): number {
  const score =
    (health.stepGoalPercent >= 100 ? 2 : health.stepGoalPercent >= 50 ? 1 : 0) +
    (health.sleepDurationMinutes >= 420
      ? 2
      : health.sleepDurationMinutes >= 300
        ? 1
        : 0) +
    (health.heartRateAvg >= 60 && health.heartRateAvg <= 100 ? 2 : 1) +
    (health.activeZoneMinutesTotal >= 30
      ? 2
      : health.activeZoneMinutesTotal >= 15
        ? 1
        : 0);

  if (score >= 6) return COLOR.EXCELLENT;
  if (score >= 4) return COLOR.GOOD;
  if (score >= 2) return COLOR.AVERAGE;
  return COLOR.POOR;
}

// ─── Stats Section ────────────────────────────────────────────────────────────

function progressBar(percent: number, total = 10): string {
  const filled = Math.min(Math.round((percent / 100) * total), total);
  return "█".repeat(filled) + "░".repeat(total - filled) + ` ${percent}%`;
}

export function buildStatsSection(health: HealthData): string {
  const stepBar = progressBar(Math.min(health.stepGoalPercent, 100));
  const rhrStr =
    health.restingHeartRate > 0
      ? `**${health.restingHeartRate}** bpm`
      : "ไม่มีข้อมูล";

  const stages = health.sleepStages;
  const hasStages =
    stages &&
    (stages.deep > 0 ||
      stages.rem > 0 ||
      stages.light > 0 ||
      stages.restless > 0 ||
      stages.awake > 0);

  const sleepLines = [
    `▪ **SLEEP**`,
    `└─ **${health.sleepDurationFormatted}**`,
  ];
  if (hasStages) {
    const stagesList: { label: string; value: number }[] = [];
    if (stages.deep > 0) stagesList.push({ label: "Deep Sleep", value: stages.deep });
    if (stages.rem > 0) stagesList.push({ label: "REM Sleep", value: stages.rem });
    if (stages.light > 0) stagesList.push({ label: "Light Sleep", value: stages.light });
    if (stages.restless > 0) stagesList.push({ label: "Restlessness", value: stages.restless });
    if (stages.awake > 0) stagesList.push({ label: "Awake", value: stages.awake });

    stagesList.forEach((stage, idx) => {
      const isLast = idx === stagesList.length - 1;
      const prefix = isLast ? "   └─" : "   ├─";
      sleepLines.push(`${prefix} ${stage.label}: **${stage.value}** นาที`);
    });
  }

  return [
    `◆ **DAILY HEALTH REPORT • ${health.date}**`,
    `────────────────────────────────────────`,
    ``,
    `▪ **ACTIVITY**`,
    `\`${stepBar}\``,
    `└─ **${health.steps.toLocaleString()}** / 10,000 ก้าว`,
    ``,
    ...sleepLines,
    ``,
    `▪ **HEART RATE**`,
    `├─ เฉลี่ย **${health.heartRateAvg}** bpm (ช่วง: ${health.heartRateMin} - ${health.heartRateMax} bpm)`,
    `└─ ชีพจรขณะพัก (RHR): ${rhrStr}`,
    ``,
    `▪ **ACTIVE ZONE**`,
    `└─ รวม **${health.activeZoneMinutesTotal}** นาที (Fat Burn: ${health.activeZoneMinutesDetails.fatBurn} | Cardio: ${health.activeZoneMinutesDetails.cardio} | Peak: ${health.activeZoneMinutesDetails.peak})`,
    ``,
    `▪ **CALORIES**`,
    `└─ **${health.totalCalories.toLocaleString()}** kcal`,
    ``,
    `────────────────────────────────────────`,
    ``,
    `◆ **AI COACH ANALYSIS**`,
    ``,
  ].join("\n");
}

// ─── Safe String Truncate ─────────────────────────────────────────────────────

/** ตัดคำแบบปลอดภัย ไม่ให้ markdown พังกรณีเกิน limit 4096 */
export function safeTruncate(text: string, maxLen = 4096): string {
  if (text.length <= maxLen) return text;

  // ตัดลงมาให้ปลอดภัย เผื่อพื้นที่ใส่คำว่า ...
  let truncated = text.slice(0, maxLen - 100);

  // ตรวจสอบพวก code block หรือ markdown tags ที่อาจจะเปิดค้างไว้
  const codeBlockCount = (truncated.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    truncated += "\n```"; // ปิด code block ที่ค้างไว้
  }

  return truncated + "\n\n*(เนื้อหาบางส่วนถูกละไว้เนื่องจากยาวเกินกำหนด)*";
}

// ─── Main Exports ────────────────────────────────────────────────────────────

export function getFormattedFooterText(baseText: string): string {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(now);

  const timeStr = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return `${baseText} • ${dateStr} • ${timeStr} น.`;
}

/**
 * ส่งรายงานสุขภาพพร้อม Gemini analysis เข้า Discord Webhook
 */
export async function sendToDiscord(
  health: HealthData,
  geminiAnalysis: string,
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("❌ ขาด environment variable: DISCORD_WEBHOOK_URL");
  }

  console.log("📨 กำลังส่งรายงานเข้า Discord...");

  const statsSection = buildStatsSection(health);
  const fullDescription = statsSection + geminiAnalysis;
  const description = safeTruncate(fullDescription, 4096);

  const payload: DiscordPayload = {
    username: "🏃 AI Health Coach",
    embeds: [
      {
        title: "🌅 Daily Health Summary",
        description,
        color: pickColor(health),
        footer: {
          text: getFormattedFooterText("วิเคราะห์โดย Gemini AI • ข้อมูลจาก Google Fit"),
        },
      },
    ],
  };

  await axios.post(webhookUrl, payload, {
    headers: { "Content-Type": "application/json" },
  });

  console.log("✅ ส่ง Discord สำเร็จ! 🎉");
}

/**
 * ส่งรายงานสรุปสุขภาพประจำสัปดาห์เข้า Discord Webhook
 */
export async function sendWeeklyReportToDiscord(
  weeklyData: HealthData[],
  geminiAnalysis: string,
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("❌ ขาด environment variable: DISCORD_WEBHOOK_URL");
  }

  console.log("📨 กำลังส่งรายงานสรุปรายสัปดาห์เข้า Discord...");

  const dateRangeStr = `${weeklyData[0].date} ถึง ${weeklyData[weeklyData.length - 1].date}`;
  const totalSteps = weeklyData.reduce((sum, d) => sum + d.steps, 0);
  const avgSteps = Math.round(totalSteps / weeklyData.length);
  const totalActiveMins = weeklyData.reduce(
    (sum, d) => sum + d.activeZoneMinutesTotal,
    0,
  );
  const totalCalories = weeklyData.reduce((sum, d) => sum + d.totalCalories, 0);
  const daysWithSleepData = weeklyData.filter((d) => d.sleepDurationMinutes > 0).length;
  const totalSleepMins = weeklyData.reduce((sum, d) => sum + d.sleepDurationMinutes, 0);
  const avgSleepMins = daysWithSleepData > 0 ? Math.round(totalSleepMins / daysWithSleepData) : 0;
  const avgSleepFormatted = `${Math.floor(avgSleepMins / 60)} ชั่วโมง ${avgSleepMins % 60} นาที`;

  let weeklyColor = COLOR.AVERAGE;
  if (avgSteps >= 10000) weeklyColor = COLOR.EXCELLENT;
  else if (avgSteps >= 7000) weeklyColor = COLOR.GOOD;
  else if (avgSteps < 4000) weeklyColor = COLOR.POOR;

  const statsSection = [
    `◆ **WEEKLY HEALTH REPORT • ${weeklyData[0].date} To ${weeklyData[weeklyData.length - 1].date}**`,
    `────────────────────────────────────────`,
    ``,
    `▪ **WEEKLY STATS SUMMARY**`,
    `├─ ก้าวเดินเฉลี่ยต่อวัน: **${avgSteps.toLocaleString()}** ก้าว/วัน`,
    `├─ นอนหลับเฉลี่ยต่อวัน: **${avgSleepFormatted}**`,
    `├─ Active Zone Minutes รวม: **${totalActiveMins}** นาที`,
    `└─ เผาผลาญแคลอรี่รวม: **${totalCalories.toLocaleString()}** kcal`,
    ``,
    `────────────────────────────────────────`,
    ``,
    `◆ **AI COACH ANALYSIS**`,
    ``,
  ].join("\n");

  const fullDescription = statsSection + geminiAnalysis;
  const description = safeTruncate(fullDescription, 4096);

  const payload: DiscordPayload = {
    username: "🏃 AI Health Coach",
    embeds: [
      {
        title: "✨ Weekly Health Summary Report",
        description,
        color: weeklyColor,
        footer: {
          text: getFormattedFooterText("สรุปรายสัปดาห์โดย Gemini AI • ข้อมูลจาก Google Fit"),
        },
      },
    ],
  };

  await axios.post(webhookUrl, payload, {
    headers: { "Content-Type": "application/json" },
  });

  console.log("✅ ส่ง Weekly Report เข้า Discord สำเร็จ! 🎉");
}

/**
 * ส่ง error notification เข้า Discord (กรณีมีข้อผิดพลาด)
 */
export async function sendErrorToDiscord(error: Error): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const payload: DiscordPayload = {
      username: "🏃 AI Health Coach",
      embeds: [
        {
          title: "⚠️ เกิดข้อผิดพลาดในระบบ",
          description: [
            `วันนี้ไม่สามารถสร้างรายงานสุขภาพได้ เนื่องจากระบบขัดข้อง:`,
            `\`\`\``,
            error.message,
            `\`\`\``,
            `กรุณาตรวจสอบระบบหลังบ้านและ Logs บน GitHub Actions`,
          ].join("\n"),
          color: 0xe74c3c,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    await axios.post(webhookUrl, payload, {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    console.error("⚠️ ส่ง error notification เข้า Discord ไม่สำเร็จ");
  }
}
