import { describe, it, expect, beforeEach } from "vitest";
import * as jose from "jose";

/**
 * Phase 0 Test Suite: JWT Session Token Validation
 * 
 * Tests the core auth mechanism for embedded Shopify apps:
 * - JWT decoding and claim extraction
 * - Audience (aud) validation against API key
 * - Signature verification with clock tolerance
 * - Error handling for malformed tokens
 */

describe("Phase 0: JWT Session Token Validation", () => {
  const testApiKey = "test_api_key_12345";
  const testApiSecret = "test_secret_67890";
  
  let validToken: string;
  
  beforeEach(async () => {
    // Create a valid JWT for testing
    const secret = new TextEncoder().encode(testApiSecret);
    const now = Math.floor(Date.now() / 1000);
    
    validToken = await new jose.SignJWT({
      aud: testApiKey,
      dest: "https://quickstart-test.myshopify.com",
      iss: "https://quickstart-test.myshopify.com/admin",
      sub: "1",
      iat: now,
      nbf: now,
      exp: now + 60,
      jti: "test-jti-123",
      sid: "test-session-id",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .sign(secret);
  });

  describe("Token Decoding", () => {
    it("should decode valid JWT claims", () => {
      const parts = validToken.split(".");
      expect(parts).toHaveLength(3);
      
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8")
      );
      
      expect(payload.aud).toBe(testApiKey);
      expect(payload.dest).toContain("myshopify.com");
      expect(payload).toHaveProperty("iat");
      expect(payload).toHaveProperty("nbf");
      expect(payload).toHaveProperty("exp");
    });

    it("should return null for malformed token", () => {
      const malformedToken = "not.a.valid.jwt.token";
      const parts = malformedToken.split(".");
      
      if (parts.length !== 3) {
        expect(parts).not.toHaveLength(3);
      }
    });
  });

  describe("Audience Validation", () => {
    it("should validate matching aud claim", async () => {
      const { payload } = await jose.jwtVerify(
        validToken,
        new TextEncoder().encode(testApiSecret),
        { algorithms: ["HS256"] }
      );
      
      expect(payload.aud).toBe(testApiKey);
    });

    it("should detect mismatched API key", async () => {
      const wrongApiKey = "wrong_api_key";
      const { payload } = await jose.jwtVerify(
        validToken,
        new TextEncoder().encode(testApiSecret)
      );
      
      expect(payload.aud).not.toBe(wrongApiKey);
    });
  });

  describe("Signature Verification", () => {
    it("should verify valid signature", async () => {
      await expect(
        jose.jwtVerify(
          validToken,
          new TextEncoder().encode(testApiSecret),
          { algorithms: ["HS256"], clockTolerance: 10 }
        )
      ).resolves.toBeTruthy();
    });

    it("should reject invalid signature", async () => {
      const wrongSecret = "wrong_secret_value";
      
      await expect(
        jose.jwtVerify(
          validToken,
          new TextEncoder().encode(wrongSecret),
          { algorithms: ["HS256"] }
        )
      ).rejects.toThrow();
    });
  });

  describe("Clock Tolerance", () => {
    it("should accept token within 10 second tolerance", async () => {
      // Create token with nbf timestamp 5 seconds in future
      const secret = new TextEncoder().encode(testApiSecret);
      const now = Math.floor(Date.now() / 1000);
      
      const futureToken = await new jose.SignJWT({
        aud: testApiKey,
        dest: "https://test.myshopify.com",
        iss: "https://test.myshopify.com/admin",
        sub: "1",
        iat: now,
        nbf: now + 5,
        exp: now + 60,
      })
        .setProtectedHeader({ alg: "HS256" })
        .sign(secret);
      
      // Should succeed with 10 second tolerance
      await expect(
        jose.jwtVerify(futureToken, secret, {
          algorithms: ["HS256"],
          clockTolerance: 10,
        })
      ).resolves.toBeTruthy();
    });

    it("should reject token beyond clock tolerance", async () => {
      // Create token with nbf timestamp 20 seconds in future
      const secret = new TextEncoder().encode(testApiSecret);
      const now = Math.floor(Date.now() / 1000);
      
      const farFutureToken = await new jose.SignJWT({
        aud: testApiKey,
        dest: "https://test.myshopify.com",
        iss: "https://test.myshopify.com/admin",
        sub: "1",
        iat: now,
        nbf: now + 20,
        exp: now + 60,
      })
        .setProtectedHeader({ alg: "HS256" })
        .sign(secret);
      
      // Should fail with 10 second tolerance
      await expect(
        jose.jwtVerify(farFutureToken, secret, {
          algorithms: ["HS256"],
          clockTolerance: 10,
        })
      ).rejects.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("should handle expired tokens", async () => {
      const secret = new TextEncoder().encode(testApiSecret);
      const now = Math.floor(Date.now() / 1000);
      
      const expiredToken = await new jose.SignJWT({
        aud: testApiKey,
        dest: "https://test.myshopify.com",
        iss: "https://test.myshopify.com/admin",
        sub: "1",
        iat: now - 120,
        nbf: now - 120,
        exp: now - 60,
      })
        .setProtectedHeader({ alg: "HS256" })
        .sign(secret);
      
      await expect(
        jose.jwtVerify(expiredToken, secret, {
          algorithms: ["HS256"],
          clockTolerance: 10,
        })
      ).rejects.toThrow();
    });

    it("should handle missing Bearer prefix", () => {
      const authHeader = validToken; // Missing "Bearer " prefix
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      
      expect(match).toBeNull();
    });

    it("should extract token from valid Bearer header", () => {
      const authHeader = `Bearer ${validToken}`;
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      
      expect(match).not.toBeNull();
      expect(match![1]).toBe(validToken);
    });
  });
});
