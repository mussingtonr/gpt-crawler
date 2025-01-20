import { Config } from "./src/config";

export const defaultConfig: Config = {
  url: "https://motion.dev/docs",
  match: "https://motion.dev/docs/**",
  maxPagesToCrawl: 100, // Reduced to improve stability
  outputFileName: "motion-animation-2025-1-10.json",
  maxTokens: 2000000,
  savePerPage: true,
  throttle: true,
  requestDelay: 8000, // Increased delay to prevent browser context issues
};
