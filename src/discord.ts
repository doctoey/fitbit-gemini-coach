// src/discord.ts
// ส่งผลลัพธ์เข้า Discord Webhook พร้อม Embed สวยงาม
//
// โครงสร้าง Discord Embed:
//   description  → Stats สั้นๆ (ก้าว / นอน / หัวใจ) ~150 chars เสมอ
//   fields[]     → Gemini analysis แบ่งเป็น chunk ≤ 1024 chars โดยไม่พัง Markdown
//
// Discord limits:
//   description  ≤ 4096 chars
//   field.value  ≤ 1024 chars
//   fields[]     ≤ 25 items per embed
//   total embed  ≤ 6000 chars

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

/** สร้าง stats header สั้นๆ สำหรับ embed description (~150 chars เสมอ) */
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
  ].join("\n");
}

// ─── Text Chunker ─────────────────────────────────────────────────────────────

/**
 * แบ่ง text ยาวเป็น chunk ≤ maxLen chars
 * พยายามตัดที่ขอบ paragraph (\n\n) ก่อน ถ้าไม่ได้ก็ตัดที่ \n แล้วค่อยตัดดื้อๆ
 */
function splitIntoChunks(text: string, maxLen = 1024): string[] {
  if (text.length <= maxLen) return [text.trim()];

  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    const window = remaining.slice(0, maxLen);

    // ลองตัดที่ \n\n (paragraph break) ก่อน
    const paraBreak = window.lastIndexOf("\n\n");
    if (paraBreak > maxLen * 0.5) {
      chunks.push(remaining.slice(0, paraBreak).trim());
      remaining = remaining.slice(paraBreak).trim();
      continue;
    }

    // ลองตัดที่ \n (line break)
    const lineBreak = window.lastIndexOf("\n");
    if (lineBreak > maxLen * 0.5) {
      chunks.push(remaining.slice(0, lineBreak).trim());
      remaining = remaining.slice(lineBreak).trim();
      continue;
    }

    // ตัดดื้อๆ
    chunks.push(window.trim());
    remaining = remaining.slice(maxLen).trim();
  }

  return chunks.filter((c) => c.length > 0);
}

// ─── Discord Embed Fields ─────────────────────────────────────────────────────

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

/**
 * แปลง Gemini analysis text เป็น embed fields
 * ใช้ zero-width space (\u200b) เป็นชื่อ field continuation
 */
function buildAnalysisFields(geminiAnalysis: string): EmbedField[] {
  const chunks = splitIntoChunks(geminiAnalysis, 1024);
  return chunks.map((chunk, i) => ({
    name: i === 0 ? "🤖 วิเคราะห์โดย Gemini" : "\u200b",
    value: chunk,
    inline: false,
  }));
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * ส่งรายงานสุขภาพพร้อม Gemini analysis เข้า Discord Webhook
 *
 * โครงสร้าง:
 *   embed.description = stats summary (สั้น, ปลอดภัยจาก limit เสมอ)
 *   embed.fields[]    = Gemini analysis (แบ่ง chunk อัตโนมัติ ≤ 1024 chars/field)
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

  const description = buildStatsSection(health);
  const fields = buildAnalysisFields(geminiAnalysis);

  const payload: DiscordPayload = {
    username: "🏃 AI Health Coach",
    embeds: [
      {
        title: "🌅 รายงานสุขภาพประจำวัน",
        description,
        color: pickColor(health),
        fields,
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
  if (!webhookUrl) return;

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
