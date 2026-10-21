import { hashPassword, verifyPassword } from "../src/lib/password";

describe("password hashing (argon2id)", () => {
  test("hashes with argon2id and never contains the plaintext", async () => {
    const plain = "S3cure!Passw0rd";
    const hash = await hashPassword(plain);
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain(plain);
    expect(hash).not.toEqual(plain);
  });

  test("verifies the correct password and rejects the wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword(hash, "correct horse battery staple")).resolves.toBe(true);
    await expect(verifyPassword(hash, "wrong password")).resolves.toBe(false);
  });

  test("salts hashes so the same password hashes differently", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toEqual(b);
    await expect(verifyPassword(a, "same-password")).resolves.toBe(true);
    await expect(verifyPassword(b, "same-password")).resolves.toBe(true);
  });

  test("rejects verification against a malformed hash without throwing", async () => {
    await expect(verifyPassword("not-a-hash", "anything")).resolves.toBe(false);
  });
});
