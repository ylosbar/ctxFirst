import path from "node:path";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared")
    }
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["electron/main/wf/domain/**/*.ts", "electron/main/wf/application/**/*.ts", "src/application/**/*.ts", "src/domain/**/*.ts"]
    },
    projects: [{
      extends: true,
      test: {
        name: "node",
        environment: "node",
        include: ["electron/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx", "shared/**/*.test.ts", "plugins-builtin/**/*.test.js"]
      }
    }, {
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
});