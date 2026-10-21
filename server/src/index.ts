import { createApp } from "./app";

const port = process.env.PORT || 3000;
const app = createApp();

app.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`hkduty server listening on port ${port}`);
});
