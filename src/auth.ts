// src/auth.ts
// Google OAuth 2.0 — แลก refresh_token เป็น access_token ใบใหม่

import axios from "axios";
import { GoogleTokenResponse } from "./types";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * แลก refresh_token เป็น access_token ใหม่
 * access_token มีอายุ 1 ชั่วโมง เหมาะสำหรับ script รันครั้งเดียวต่อวัน
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
  });

  const response = await axios.post<GoogleTokenResponse>(
    GOOGLE_TOKEN_URL,
    params.toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  );

  const { access_token, expires_in } = response.data;
  console.log(`✅ ได้ access_token แล้ว (หมดอายุใน ${expires_in / 60} นาที)`);

  return access_token;
}
