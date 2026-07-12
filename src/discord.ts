// src/discord.ts
// ส่งผลลัพธ์เข้า Discord Webhook พร้อม Markdown + Embed สวยงาม

import axios from "axios";
import { DiscordPayload, HealthData } from "./types";

// สี Embed ตามเงื่อนไขสุขภาพ (decimal color)
const COLOR = {
  EXCELLENT: 0x2ecc71, // เขียว
  GOOD: 0x3498db,      // ฟ้า
  AVERAGE: 0xf39c12,   // เหลือง
  POOR: 0xe74c3c,      // แดง
};

/** เลือกสีตามภาพรวมสุขภาพ */
function pickColor(health: HealthData): number {
  const score =
    (health.stepGoalPercent >= 100 ? 2 : health.stepGoalPercent >= 50 ? 1 : 0) +
    (health.sleepDurationMinutes >= 420
      ? 2
      : health.sleepDurationMinutes >= 300
      ? 1
      : 0) +
    (health.heartRateAvg >= 60 && health.heartRateAvg <= 100 ? 2 : 1);

  if (score >= 5) return COLOR.EXCELLENT;
  if (score >= 3) return COLOR.GOOD;
  if (score >= 2) return COLOR.AVERAGE;
  return COLOR.POOR;
}

/** สร้าง stats bar แบบ text progress bar */
function progressBar(percent: number, total: number = 10): string {
  const filled = Math.min(Math.round((percent / 100) * total), total);
  const empty = total - filled;
  return "█".repeat(filled) + "░".repeat(empty) + ` ${percent}%`;
}

/** สรุปข้อมูล stats เป็น text สั้นๆ สำหรับ Embed description header */
function buildStatsSection(health: HealthData): string {
  const stepBar = progressBar(Math.min(health.stepGoalPercent, 100));
  const sleepHr = (health.sleepDurationMinutes / 60).toFixed(1);

  return [
    `📅 **รายงานสุขภาพ: ${health.date}**`,
    ``,
    `**👟 ก้าวเดิน**`,
    `\`${stepBar}\``,
    `${health.steps.toLocaleString()} / 10,000 ก้าว`,
    ``,
    `**😴 การนอนหลับ**`,
    `${health.sleepDurationFormatted} (${sleepHr} ชม.)`,
    ``,
    `**❤️ อัตราการเต้นหัวใจ**`,
    `เฉลี่ย **${health.heartRateAvg}** bpm | ต่ำสุด ${health.heartRateMin} | สูงสุด ${health.heartRateMax}`,
    ``,
    `---`,
    ``,
  ].join("\n");
}

/**
 * ส่งรายงานสุขภาพพร้อม AI analysis เข้า Discord Webhook
 */
export async function sendToDiscord(
  health: HealthData,
  geminiAnalysis: string
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("❌ ขาด environment variable: DISCORD_WEBHOOK_URL");
  }

  console.log("📨 กำลังส่งรายงานเข้า Discord...");

  const statsSection = buildStatsSection(health);
  const fullDescription = statsSection + geminiAnalysis;

  // Discord embed description มีขีดจำกัด 4096 ตัวอักษร
  const description =
    fullDescription.length > 4096
      ? fullDescription.slice(0, 4090) + "\n..."
      : fullDescription;

  const payload: DiscordPayload = {
    username: "🏃 AI Health Coach",
    embeds: [
      {
        title: "🌅 รายงานสุขภาพประจำวัน",
        description,
        color: pickColor(health),
        footer: {
          text: `วิเคราะห์โดย Gemini AI • ข้อมูลจาก Google Fit`,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  await axios.post(webhookUrl, payload, {
    headers: { "Content-Type": "application/json" },
  });

  console.log("✅ ส่ง Discord สำเร็จ! 🎉");
}

/**
 * ส่ง error notification เข้า Discord (กรณีมีข้อผิดพลาด)
 */
export async function sendErrorToDiscord(error: Error): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return; // ถ้าไม่มี webhook ก็ไม่ส่ง

  try {
    const payload: DiscordPayload = {
      username: "🏃 AI Health Coach",
      embeds: [
        {
          title: "⚠️ เกิดข้อผิดพลาด",
          description: [
            `วันนี้รายงานสุขภาพส่งไม่ได้ เนื่องจากข้อผิดพลาดดังนี้:`,
            `\`\`\``,
            error.message,
            `\`\`\``,
            `กรุณาตรวจสอบ log และ environment variables`,
          ].join("\n"),
          color: 0xe74c3c, // แดง
          timestamp: new Date().toISOString(),
        },
      ],
    };

    await axios.post(webhookUrl, payload, {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // Suppress error ใน error handler
    console.error("⚠️ ส่ง error notification เข้า Discord ไม่สำเร็จ");
  }
}
