// src/auth.ts
// Google OAuth 2.0 — แลก refresh_token เป็น access_token ใบใหม่

import axios from "axios";
import { GoogleTokenResponse } from "./types";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * Scopes ที่ Google Health API v4 ต้องการ — ระบุแบบแคบที่สุดเท่าที่จำเป็น
 *
 * ⚠️  ห้ามใส่ cloud-platform ที่นี่เด็ดขาด
 *    Health API v4 จะ 403 ทันทีถ้า access_token มี cloud_platform อยู่ด้วย
 *
 * Ref: https://health.googleapis.com/$discovery/rest?version=v4
 */
const HEALTH_API_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
].join(" ");

/**
 * แลก refresh_token เป็น access_token ใหม่
 *
 * Key: ระบุ scope ตอน refresh เพื่อจำกัดสิทธิ์ของ access_token ที่ได้มา
 * ถ้าไม่ระบุ scope Google จะคืน token ที่มีสิทธิ์ครบทุกอย่างที่เคย consent ไว้
 * ซึ่งอาจรวม cloud_platform ที่ Health API ไม่ยอมรับ
 */
export async function getAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "❌ ขาด environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, หรือ GOOGLE_REFRESH_TOKEN",
    );
  }

  console.log("🔑 กำลังแลก refresh_token เป็น access_token...");

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    // ✅ จำกัด scope ให้แคบลง — access_token ที่ได้จะมีเฉพาะสิทธิ์เหล่านี้
    scope: HEALTH_API_SCOPES,
  });

  const response = await axios.post<GoogleTokenResponse>(
    GOOGLE_TOKEN_URL,
    params.toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  );

  const { access_token, expires_in, scope } = response.data;

  // แสดง scope จริงที่ได้มาเพื่อ debug
  console.log(
    `✅ ได้ access_token แล้ว (หมดอายุใน ${Math.round(expires_in / 60)} นาที)`,
  );
  console.log(`🔒 Scopes ที่ใช้: ${scope ?? "(ไม่ระบุ)"}`);

  return access_token;
}
