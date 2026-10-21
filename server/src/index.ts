import { createApp } from "./app";
import { port } from "./config/env";

const portNumber = port();
const app = createApp();

app.listen(portNumber, "0.0.0.0", () => {
  console.log(`hkduty server listening on port ${portNumber}`);
});
