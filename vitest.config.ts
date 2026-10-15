import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // Server tests run in Node; client tests opt into jsdom with a file comment.
    environment: "node",
  },
});
