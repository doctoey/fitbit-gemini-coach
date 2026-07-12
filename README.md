# 🏃 AI Health Coach

ระบบ **AI Health Coach** ส่วนตัวที่รันอัตโนมัติทุกเช้า  
ดึงข้อมูลจาก **Google Fit** → วิเคราะห์ด้วย **Gemini AI** → ส่งรายงานเข้า **Discord**

---

## 📁 โครงสร้างโปรเจกต์

```
fitbit-gemini-coach/
├── src/
│   ├── index.ts       # 🎯 Entry point — Orchestrator หลัก
│   ├── auth.ts        # 🔑 Google OAuth token refresh
│   ├── googleFit.ts   # 📊 Google Fit REST API (steps, sleep, heart rate)
│   ├── gemini.ts      # 🤖 Gemini AI Analysis
│   ├── discord.ts     # 📨 Discord Webhook sender
│   └── types.ts       # 📐 TypeScript interfaces
├── .env               # 🔒 ค่าลับ (ห้าม commit!)
├── .env.example       # 📋 ตัวอย่าง .env
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🚀 วิธีติดตั้งและรัน

### 1. ติดตั้ง Dependencies

```bash
npm install
```

### 2. ตั้งค่า Environment Variables

```bash
# คัดลอก template
cp .env.example .env
```

จากนั้นเปิดไฟล์ `.env` และใส่ค่าทั้งหมด:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
GEMINI_API_KEY=your-gemini-api-key
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN
TIMEZONE=Asia/Bangkok
```

### 3. รันทดสอบ

```bash
npm run dev
```

### 4. Build Production

```bash
npm run build
node dist/index.js
```

---

## ⏰ ตั้งค่า Cron Job (รันอัตโนมัติทุกเช้า)

### macOS / Linux

เปิด crontab:
```bash
crontab -e
```

เพิ่มบรรทัดนี้ (รันทุกวัน เวลา 07:00 น.):
```cron
0 7 * * * cd /Users/YOUR_USERNAME/Documents/code/fitbit-gemini-coach && node dist/index.js >> logs/health-coach.log 2>&1
```

สร้างโฟลเดอร์ logs:
```bash
mkdir -p logs
```

### ทางเลือก: ใช้ launchd บน macOS (แนะนำกว่า cron)

สร้างไฟล์ `~/Library/LaunchAgents/com.healthcoach.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.healthcoach</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/YOUR_USERNAME/Documents/code/fitbit-gemini-coach/dist/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USERNAME/Documents/code/fitbit-gemini-coach</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>7</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/YOUR_USERNAME/Documents/code/fitbit-gemini-coach/logs/health-coach.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USERNAME/Documents/code/fitbit-gemini-coach/logs/health-coach-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
```

โหลด launchd:
```bash
launchctl load ~/Library/LaunchAgents/com.healthcoach.plist
```

---

## 🔒 ความปลอดภัย

| สิ่งที่ทำ | เหตุผล |
|-----------|--------|
| เก็บ secrets ใน `.env` | ไม่อยู่ใน source code |
| `.env` อยู่ใน `.gitignore` | ไม่ถูก commit เข้า Git |
| ใช้ `refresh_token` ไม่ใช่ `access_token` | `access_token` หมดอายุใน 1 ชม. |
| แลก token ใหม่ทุกครั้งที่รัน | ได้ token สดใหม่เสมอ |

---

## 🔧 Google Fit Scopes ที่ต้องการ

| Scope | ข้อมูลที่เข้าถึง |
|-------|----------------|
| `fitness.activity.read` | ก้าวเดิน, แคลอรี่ |
| `fitness.sleep.read` | การนอนหลับ |
| `fitness.heart_rate.read` | อัตราการเต้นหัวใจ |
| `fitness.body.read` | น้ำหนัก, BMI |

---

## 📊 ตัวอย่างรายงานที่ส่งใน Discord

```
🌅 รายงานสุขภาพประจำวัน

📅 รายงานสุขภาพ: 2024-07-11

👟 ก้าวเดิน
█████████░ 92%
9,200 / 10,000 ก้าว

😴 การนอนหลับ
7 ชั่วโมง 30 นาที (7.5 ชม.)

❤️ อัตราการเต้นหัวใจ
เฉลี่ย 72 bpm | ต่ำสุด 58 | สูงสุด 95

---

[วิเคราะห์โดย Gemini AI ...]
```
