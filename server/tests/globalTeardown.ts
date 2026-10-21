import { closePool } from "../src/db/pool";

export default async function globalTeardown(): Promise<void> {
  await closePool();
}
