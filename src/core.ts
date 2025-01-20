// For more information, see https://crawlee.dev/
import { Configuration, PlaywrightCrawler, downloadListOfUrls } from "crawlee";
import { readFile, writeFile, mkdir } from "fs/promises";
import { glob } from "glob";
import { Config, configSchema } from "./config.js";
import { Page } from "playwright";
import { isWithinTokenLimit } from "gpt-tokenizer";
import { PathLike } from "fs";
import { existsSync } from "fs";
import path from "path";

// Utility function for throttling
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let pageCounter = 0;
let crawler: PlaywrightCrawler;

export function getPageHtml(page: Page, selector = "body") {
  return page.evaluate((selector) => {
    // Check if the selector is an XPath
    if (selector.startsWith("/")) {
      const elements = document.evaluate(
        selector,
        document,
        null,
        XPathResult.ANY_TYPE,
        null,
      );
      let result = elements.iterateNext();
      return result ? result.textContent || "" : "";
    } else {
      // Handle as a CSS selector
      const el = document.querySelector(selector) as HTMLElement | null;
      return el?.innerText || "";
    }
  }, selector);
}

export async function waitForXPath(page: Page, xpath: string, timeout: number) {
  await page.waitForFunction(
    (xpath) => {
      const elements = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ANY_TYPE,
        null,
      );
      return elements.iterateNext() !== null;
    },
    xpath,
    { timeout },
  );
}

async function ensurePagesDirectory(config: Config) {
  const pagesDir = path.join(process.cwd(), "pages");
  if (!existsSync(pagesDir)) {
    await mkdir(pagesDir);
  }

  // Create subfolder based on outputFileName (without extension)
  const subfolderName = config.outputFileName.replace(/\.[^/.]+$/, "");
  const subfolderPath = path.join(pagesDir, subfolderName);
  if (!existsSync(subfolderPath)) {
    await mkdir(subfolderPath);
  }

  return subfolderPath;
}

function extractFilename(url: string, matchPattern: string | string[]) {
  // Convert matchPattern to array if it's a string
  const patterns = Array.isArray(matchPattern) ? matchPattern : [matchPattern];

  // Find the matching pattern
  const pattern = patterns.find((p) => {
    const regexStr = p.replace(/\*\*/g, "(.+)");
    const regex = new RegExp(regexStr);
    return regex.test(url);
  });

  if (!pattern) {
    // Fallback to URL-based name if no pattern matches
    return url.split("/").pop() || "index";
  }

  // Extract the part after /**
  const regexStr = pattern.replace(/\*\*/g, "(.+)");
  const regex = new RegExp(regexStr);
  const match = url.match(regex);

  if (match && match[1]) {
    // Clean up the extracted path
    return match[1]
      .replace(/^\/+|\/+$/g, "") // Remove leading/trailing slashes
      .replace(/\//g, "_") // Replace remaining slashes with underscores
      .toLowerCase();
  }

  // Fallback to URL-based name
  return url.split("/").pop() || "index";
}

async function savePageToFile(data: Record<string, any>, config: Config) {
  if (!config.savePerPage) return;

  const pagesDir = await ensurePagesDirectory(config);
  const filename = extractFilename(data.url, config.match);
  const filePath = path.join(pagesDir, `${filename}.json`);
  await writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function crawl(config: Config) {
  configSchema.parse(config);

  if (process.env.NO_CRAWL !== "true") {
    // PlaywrightCrawler crawls the web using a headless
    // browser controlled by the Playwright library.
    crawler = new PlaywrightCrawler(
      {
        // Configure concurrency based on config settings
        // Use configuration values for crawler behavior
        maxConcurrency: config.maxConcurrency ?? 1,
        maxRequestRetries: config.maxRequestRetries ?? 3,
        requestHandlerTimeoutSecs: config.requestHandlerTimeoutSecs ?? 180,
        navigationTimeoutSecs: config.navigationTimeoutSecs ?? 120,
        browserPoolOptions: {
          maxOpenPagesPerBrowser: config.maxOpenPagesPerBrowser ?? 1,
          useFingerprints: false,
          retireBrowserAfterPageCount:
            config.retireInstanceAfterRequestCount ?? 5,
        },
        // Use the requestHandler to process each of the crawled pages.
        async requestHandler({ request, page, enqueueLinks, log, pushData }) {
          const title = await page.title();
          pageCounter++;
          log.info(
            `Crawling: Page ${pageCounter} / ${config.maxPagesToCrawl} - URL: ${request.loadedUrl}...`,
          );

          // Use custom handling for XPath selector
          if (config.selector) {
            if (config.selector.startsWith("/")) {
              await waitForXPath(
                page,
                config.selector,
                config.waitForSelectorTimeout ?? 1000,
              );
            } else {
              await page.waitForSelector(config.selector, {
                timeout: config.waitForSelectorTimeout ?? 1000,
              });
            }
          }

          const html = await getPageHtml(page, config.selector);
          const pageData = { title, url: request.loadedUrl, html };

          // Save individual page if savePerPage is enabled
          await savePageToFile(pageData, config);

          // Save results as JSON to ./storage/datasets/default
          await pushData(pageData);

          if (config.onVisitPage) {
            await config.onVisitPage({ page, pushData });
          }

          // Apply throttling if enabled
          if (config.throttle && config.requestDelay) {
            await delay(config.requestDelay);
          }

          // Extract links from the current page
          // and add them to the crawling queue.
          await enqueueLinks({
            globs:
              typeof config.match === "string" ? [config.match] : config.match,
            exclude:
              typeof config.exclude === "string"
                ? [config.exclude]
                : config.exclude ?? [],
          });
        },
        // Comment this option to scrape the full website.
        maxRequestsPerCrawl: config.maxPagesToCrawl,
        // Uncomment this option to see the browser window.
        // headless: false,
        preNavigationHooks: [
          // Abort requests for certain resource types
          async ({ request, page, log }) => {
            // Handle cookies first if present
            if (config.cookie) {
              const cookies = (
                Array.isArray(config.cookie) ? config.cookie : [config.cookie]
              ).map((cookie) => {
                return {
                  name: cookie.name,
                  value: cookie.value,
                  url: request.loadedUrl,
                };
              });
              await page.context().addCookies(cookies);
            }

            // Handle resource exclusions if present
            const RESOURCE_EXCLUSIONS = config.resourceExclusions ?? [];
            if (RESOURCE_EXCLUSIONS.length > 0) {
              await page.route(
                `**\/*.{${RESOURCE_EXCLUSIONS.join()}}`,
                (route) => {
                  log.debug(
                    `Aborting request for excluded resource: ${route
                      .request()
                      .url()}`,
                  );
                  route.abort("aborted");
                },
              );
            }
          },
        ],
      },
      new Configuration({
        purgeOnStart: true,
      }),
    );

    const isUrlASitemap = /sitemap.*\.xml$/.test(config.url);

    if (isUrlASitemap) {
      const listOfUrls = await downloadListOfUrls({ url: config.url });

      // Add the initial URL to the crawling queue.
      await crawler.addRequests(listOfUrls);

      // Run the crawler
      await crawler.run();
    } else {
      // Add first URL to the queue and start the crawl.
      await crawler.run([config.url]);
    }
  }
}

export async function write(config: Config) {
  let nextFileNameString: PathLike = "";
  const jsonFiles = await glob("storage/datasets/default/*.json", {
    absolute: true,
  });

  console.log(`Found ${jsonFiles.length} files to combine...`);

  let currentResults: Record<string, any>[] = [];
  let currentSize: number = 0;
  let fileCounter: number = 1;
  const maxBytes: number = config.maxFileSize
    ? config.maxFileSize * 1024 * 1024
    : Infinity;

  const getStringByteSize = (str: string): number =>
    Buffer.byteLength(str, "utf-8");

  const nextFileName = (): string =>
    `${config.outputFileName.replace(/\.json$/, "")}-${fileCounter}.json`;

  const writeBatchToFile = async (): Promise<void> => {
    nextFileNameString = nextFileName();
    await writeFile(
      nextFileNameString,
      JSON.stringify(currentResults, null, 2),
    );
    console.log(
      `Wrote ${currentResults.length} items to ${nextFileNameString}`,
    );
    currentResults = [];
    currentSize = 0;
    fileCounter++;
  };

  let estimatedTokens: number = 0;

  const addContentOrSplit = async (
    data: Record<string, any>,
  ): Promise<void> => {
    const contentString: string = JSON.stringify(data);
    const tokenCount: number | false = isWithinTokenLimit(
      contentString,
      config.maxTokens || Infinity,
    );

    if (typeof tokenCount === "number") {
      if (estimatedTokens + tokenCount > config.maxTokens!) {
        // Only write the batch if it's not empty (something to write)
        if (currentResults.length > 0) {
          await writeBatchToFile();
        }
        // Since the addition of a single item exceeded the token limit, halve it.
        estimatedTokens = Math.floor(tokenCount / 2);
        currentResults.push(data);
      } else {
        currentResults.push(data);
        estimatedTokens += tokenCount;
      }
    }

    currentSize += getStringByteSize(contentString);
    if (currentSize > maxBytes) {
      await writeBatchToFile();
    }
  };

  // Iterate over each JSON file and process its contents.
  for (const file of jsonFiles) {
    const fileContent = await readFile(file, "utf-8");
    const data: Record<string, any> = JSON.parse(fileContent);
    await addContentOrSplit(data);
  }

  // Check if any remaining data needs to be written to a file.
  if (currentResults.length > 0) {
    await writeBatchToFile();
  }

  return nextFileNameString;
}

class GPTCrawlerCore {
  config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async crawl() {
    await crawl(this.config);
  }

  async write(): Promise<PathLike> {
    // we need to wait for the file path as the path can change
    return new Promise((resolve, reject) => {
      write(this.config)
        .then((outputFilePath) => {
          resolve(outputFilePath);
        })
        .catch(reject);
    });
  }
}

export default GPTCrawlerCore;
