import { Config } from "./src/config";

export const defaultConfig: Config = {
  /**
   * Basic Crawler Configuration
   * --------------------------
   * These settings define the core crawling behavior:
   * - url: The entry point for crawling, can be a regular URL or sitemap
   * - match: Pattern(s) to determine which links to follow
   * - maxPagesToCrawl: Upper limit on number of pages to process
   * - outputFileName: Where to save the crawled data
   * - maxTokens: Prevents output files from getting too large
   * - savePerPage: Enables saving individual page data separately
   */
  url: "https://motion.dev/docs",
  match: "https://motion.dev/docs/**",
  maxPagesToCrawl: 100,
  outputFileName: "motion-animation-2025-1-10.json",
  maxTokens: 2000000,
  savePerPage: true,

  /**
   * Performance & Resource Management
   * -------------------------------
   * Controls how the crawler interacts with target sites:
   * - throttle: Enables controlled request pacing
   * - requestDelay: Time to wait between requests (ms)
   * - resourceExclusions: File types to skip downloading
   *   Excluding these improves performance and reduces
   *   unnecessary network traffic
   */
  throttle: true,
  requestDelay: 12000,
  resourceExclusions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'css', 'woff', 'woff2'],

  /**
   * Browser & Concurrency Management
   * ------------------------------
   * Settings for browser instance handling:
   * - maxConcurrency: Simultaneous page crawls (1-2 recommended)
   * - maxOpenPagesPerBrowser: Pages per browser (keep at 1)
   * - retireInstanceAfterRequestCount: Pages before browser restart
   * 
   * Lower values provide more stability but slower crawling.
   * Higher values risk memory issues and browser crashes.
   */
  maxConcurrency: 1,
  maxOpenPagesPerBrowser: 1,
  retireInstanceAfterRequestCount: 5,

  /**
   * Error Handling & Timeouts
   * -----------------------
   * Controls retry behavior and timing limits:
   * - maxRequestRetries: Failed requests auto-retry count
   * - requestHandlerTimeoutSecs: Total operation timeout
   * - navigationTimeoutSecs: Initial page load timeout
   * 
   * Navigation timeout should be less than handler timeout.
   * Failed requests return to queue for retry attempts.
   */
  maxRequestRetries: 3,
  requestHandlerTimeoutSecs: 180,
  navigationTimeoutSecs: 120
};
