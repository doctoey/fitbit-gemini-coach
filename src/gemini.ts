// src/gemini.ts
// ส่งข้อมูลสุขภาพให้ Gemini AI วิเคราะห์และสรุปแบบ AI Coach ภาษาไทย

import axios from "axios";
import { GeminiRequest, GeminiResponse, HealthData } from "./types";

// โมเดลล่าสุดของ Gemini — อัปเดตจาก models list (July 2026)
// Ref: GET https://generativelanguage.googleapis.com/v1beta/models?key=...
const GEMINI_MODEL = "gemini-3.5-flash"; // Newest Flash (May 2026), supports generateContent
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** แปลง UTC ISO string เป็นเวลาไทย (Bangkok GMT+7) รูปแบบ HH:MM น. */
function toThaiTime(utcStr: string): string {
  return (
    new Date(utcStr).toLocaleTimeString("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " น."
  );
}

/** สรุป sleep sessions เป็น text ที่ Gemini อ่านได้ถูกต้อง (เวลาไทยแล้ว) */
function formatSleepForPrompt(
  data: import("./types").SleepReconcileResponse,
): string {
  const points = data.dataPoints ?? [];
  if (points.length === 0) return "ไม่มีข้อมูลการนอนหลับ";

  return points
    .map((point) => {
      const p = point as Record<string, unknown>;
      const sleepObj = p["sleep"] as Record<string, unknown> | undefined;
      const interval = sleepObj?.["interval"] as
        | Record<string, unknown>
        | undefined;
      const summary = sleepObj?.["summary"] as
        | Record<string, unknown>
        | undefined;

      const startUtc = interval?.["startTime"] as string | undefined;
      const endUtc = interval?.["endTime"] as string | undefined;
      const minutesAsleep = summary?.["minutesAsleep"] ?? "?";

      const startThai = startUtc ? toThaiTime(startUtc) : "?";
      const endThai = endUtc ? toThaiTime(endUtc) : "?";

      let durationText = "";
      if (minutesAsleep !== "?") {
        const m = parseInt(String(minutesAsleep), 10);
        const h = Math.floor(m / 60);
        const mins = m % 60;
        durationText = h > 0 ? `${h} ชั่วโมง ${mins} นาที` : `${mins} นาที`;
      } else {
        durationText = "ไม่มีข้อมูล";
      }

      return `เข้านอน ${startThai} → ตื่น ${endThai} (รวมเวลานอนหลับ: ${durationText})`;
    })
    .join("\n");
}

/**
 * สร้าง prompt ที่ละเอียดและมีบริบทสำหรับ Gemini
 * รวมทั้งข้อมูล summary + raw JSON เพื่อให้ AI วิเคราะห์ได้ลึก
 */
function buildPrompt(health: HealthData): string {
  const rawJson = JSON.stringify(
    {
      steps: health.rawData.steps,
      heartRate: health.rawData.heartRate,
      sleep: health.rawData.sleep,
    },
    null,
    2,
  );

  const sleepFormatted = formatSleepForPrompt(health.rawData.sleep);

  return `คุณคือ AI Health Coach ส่วนตัวที่พูดภาษาไทยเป็นกันเองและให้กำลังใจ

ต่อไปนี้คือข้อมูลสุขภาพของผู้ใช้เมื่อวาน (${health.date}):

## ข้อมูลสรุป
- 👟 จำนวนก้าว: ${health.steps.toLocaleString()} ก้าว (${health.stepGoalPercent}% ของเป้าหมาย 10,000 ก้าว)
- 😴 เวลานอน: ${health.sleepDurationFormatted}
- ❤️  อัตราการเต้นหัวใจเฉลี่ย: ${health.heartRateAvg} bpm (ต่ำสุด ${health.heartRateMin} | สูงสุด ${health.heartRateMax})

## ช่วงเวลานอนหลับ (เวลาประเทศไทย GMT+7 แล้ว — ใช้ข้อมูลชุดนี้ในการวิเคราะห์)
${sleepFormatted}

## ข้อมูล JSON ดิบจาก Google Fit
⚠️ หมายเหตุ: เวลาทั้งหมดใน JSON นี้เป็น UTC — ต้องบวก 7 ชั่วโมงเพื่อแปลงเป็นเวลาไทย
\`\`\`json
${rawJson}
\`\`\`

## งานของคุณ
กรุณาวิเคราะห์ข้อมูลสุขภาพข้างต้นและเขียนรายงานสรุปสไตล์ AI Coach ที่:

1. **ชมเชย** สิ่งที่ทำได้ดีในวันนั้น (ถ้ามี)
2. **วิเคราะห์** แต่ละตัวชี้วัดสุขภาพ (ก้าว, การนอน, หัวใจ) อย่างกระชับ
3. **แนะนำ** สิ่งที่ควรปรับปรุงพร้อมเทคนิคที่ทำได้จริง
4. **กำลังใจ** ปิดท้ายด้วยคำให้กำลังใจสั้นๆ สำหรับวันนี้

**รูปแบบการตอบ:**
- ใช้ภาษาไทยเป็นกันเอง ไม่เป็นทางการ เหมือนพี่โค้ชคุยกัน
- **สำคัญ: ใช้ "ช่วงเวลานอนหลับ" ที่แปลงเป็นเวลาไทยแล้วในการวิเคราะห์** ห้ามอ้างอิงเวลา UTC จาก JSON โดยตรง
- ใช้อิโมจิประดับให้ดูสนุก
- ความยาวรวม ประมาณ 200-300 คำ
- **สำคัญ**: ตอบเฉพาะเนื้อหาวิเคราะห์ ห้ามใส่ header หรือ markdown ที่ไม่จำเป็น (เพราะจะถูกส่งต่อไป Discord โดยตรง)
- ใช้ **bold** และ bullet points ได้ตามปกติ`;
}

/**
 * ส่งข้อมูลสุขภาพให้ Gemini วิเคราะห์
 * คืน string ที่พร้อมส่งไป Discord
 */
export async function analyzeWithGemini(health: HealthData): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("❌ ขาด environment variable: GEMINI_API_KEY");
  }

  console.log(`🤖 กำลังส่งข้อมูลให้ Gemini (${GEMINI_MODEL}) วิเคราะห์...`);

  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const requestBody: GeminiRequest = {
    contents: [
      {
        role: "user",
        parts: [{ text: buildPrompt(health) }],
      },
    ],
    generationConfig: {
      temperature: 0.8, // ให้ตอบสร้างสรรค์และไม่ซ้ำซาก
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1024,
      // Disable thinking เพื่อลด latency และค่าใช้จ่าย
      // Health coaching ไม่จำเป็นต้องใช้ thinking mode
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  // log URL เพื่อให้ debug ได้ถ้า 404 (ไม่ log apiKey จริง เพื่อ security)
  const urlForLog = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=***`;
  console.log(`   URL: ${urlForLog}`);

  let response;
  try {
    response = await axios.post<GeminiResponse>(url, requestBody, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      console.error(`❌ Gemini Error ${err.response.status}:`);
      console.error("   Detail:", JSON.stringify(err.response.data, null, 2));
    }
    throw err;
  }

  const candidate = response.data.candidates?.[0];
  if (!candidate) {
    throw new Error("❌ Gemini ไม่ส่งผลลัพธ์กลับมา");
  }

  const text = candidate.content.parts?.[0]?.text ?? "";
  if (!text) {
    throw new Error("❌ Gemini ส่งผลลัพธ์กลับมาแต่ไม่มีข้อความ");
  }

  const usage = response.data.usageMetadata;
  console.log(
    `✅ Gemini วิเคราะห์เสร็จ (${usage?.totalTokenCount ?? "?"} tokens)`,
  );

  return text.trim();
}
