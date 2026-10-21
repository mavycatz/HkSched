/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  globalSetup: "<rootDir>/tests/globalSetup.ts",
  globalTeardown: "<rootDir>/tests/globalTeardown.ts",
  testMatch: ["**/*.test.ts"],
  verbose: true,
};
