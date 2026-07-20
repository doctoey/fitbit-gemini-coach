import { describe, test, expect, vi, beforeEach } from "vitest";
import { getAccessToken } from "./auth";
import axios from "axios";

vi.mock("axios");

describe("Auth Helper Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REFRESH_TOKEN;
  });

  test("throws error if environment variables are missing", async () => {
    await expect(getAccessToken()).rejects.toThrow("ขาด environment variables");
  });

  test("returns access token when variables are set and API returns 200", async () => {
    process.env.GOOGLE_CLIENT_ID = "mock-id";
    process.env.GOOGLE_CLIENT_SECRET = "mock-secret";
    process.env.GOOGLE_REFRESH_TOKEN = "mock-refresh";

    const mockTokenResponse = {
      data: {
        access_token: "mock-access-token",
        expires_in: 3600,
        scope: "mock-scope",
      },
    };
    vi.mocked(axios.post).mockResolvedValueOnce(mockTokenResponse);

    const token = await getAccessToken();
    expect(token).toBe("mock-access-token");
    expect(axios.post).toHaveBeenCalledTimes(1);
  });
});
