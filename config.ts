import { Config } from "./src/config";

export const defaultConfig: Config = {
  url: "https://ui3.nuxt.dev/",
  match: "https://ui3.nuxt.dev/**",
  maxPagesToCrawl: 2000,
  outputFileName: "ui3.nuxt.dev-2024-10-24.json",
  maxTokens: 2000000,
  savePerPage: true, // New option to save each page separately
};
