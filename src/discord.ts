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
  GOOD:      0x3498db, // ฟ้า
  AVERAGE:   0xf39c12, // เหลือง
  POOR:      0xe74c3c, // แดง
};

function pickColor(health: HealthData): number {
  const score =
    (health.stepGoalPercent >= 100 ? 2 : health.stepGoalPercent >= 50 ? 1 : 0) +
    (health.sleepDurationMinutes >= 420 ? 2 : health.sleepDurationMinutes >= 300 ? 1 : 0) +
    (health.heartRateAvg >= 60 && health.heartRateAvg <= 100 ? 2 : 1);

  if (score >= 5) return COLOR.EXCELLENT;
  if (score >= 3) return COLOR.GOOD;
  if (score >= 2) return COLOR.AVERAGE;
  return COLOR.POOR;
}

// ─── Stats Section ────────────────────────────────────────────────────────────

function progressBar(percent: number, total = 10): string {
  const filled = Math.min(Math.round((percent / 100) * total), total);
  return "█".repeat(filled) + "░".repeat(total - filled) + ` ${percent}%`;
}

/** สร้าง stats header สั้นๆ สำหรับ embed description */
function buildStatsSection(health: HealthData): string {
  const stepBar = progressBar(Math.min(health.stepGoalPercent, 100));
  const sleepHr = (health.sleepDurationMinutes / 60).toFixed(1);

  return [
    `📅 **รายงานสุขภาพประจำวัน: ${health.date}**`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `**👟 การขยับร่างกาย (ก้าวเดิน)**`,
    `\`${stepBar}\``,
    `└─ **${health.steps.toLocaleString()}** / 10,000 ก้าว`,
    ``,
    `**😴 การนอนหลับพักผ่อน**`,
    `└─ **${health.sleepDurationFormatted}** (${sleepHr} ชม.)`,
    ``,
    `**❤️ อัตราการเต้นของหัวใจ**`,
    `└─ เฉลี่ย **${health.heartRateAvg}** bpm (ช่วง: ${health.heartRateMin} - ${health.heartRateMax} bpm)`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🤖 **บทวิเคราะห์และแนะนำโดย AI Coach**`,
    ``
  ].join("\n");
}

// ─── Safe String Truncate ─────────────────────────────────────────────────────

/** ตัดคำแบบปลอดภัย ไม่ให้ markdown พังกรณีเกิน limit 4096 */
function safeTruncate(text: string, maxLen = 4096): string {
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

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * ส่งรายงานสุขภาพพร้อม Gemini analysis เข้า Discord Webhook
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
  const description = safeTruncate(fullDescription, 4096);

  // หาวันที่และเวลาปัจจุบันของไทยเพื่อแสดงใน footer
  const bangkokTimeStr = new Date().toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }) + " น.";

  const payload: DiscordPayload = {
    username: "🏃 AI Health Coach",
    embeds: [
      {
        title: "🌅 Daily Health Summary",
        description,
        color: pickColor(health),
        footer: {
          text: `วิเคราะห์โดย Gemini AI • ข้อมูลจาก Google Fit • อัปเดตเมื่อ ${bangkokTimeStr}`,
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
