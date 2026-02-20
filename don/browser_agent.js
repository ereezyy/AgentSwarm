// don/browser_agent.js - THE PUPPETEER (BROWSER AUTOMATION)
// Handles X login/posting and Faucet claiming via real browser instance.
const puppeteer = require('puppeteer-core');
const chalk = require('chalk');
const path = require('path');
require('dotenv').config();

// Switched to Edge for better reliability on this machine
const CHROME_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = path.resolve(__dirname, '../browser_profile_edge'); // Persist login sessions

async function postToX(tweetText) {
    let browser;
    try {
        console.log(chalk.magenta(`[BROWSER]: Launching stealth browser for X post...`));
        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            userDataDir: USER_DATA_DIR,
            headless: false, // Visible for debugging/verification
            defaultViewport: null,
            args: ['--start-maximized', '--disable-infobars', '--no-first-run']
        });

        const page = await browser.newPage();
        // Go to home first to verify login state
        await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });

        // Check if logged in (look for tweet composer)
        const loggedIn = await page.$('[data-testid="SideNav_NewTweet_Button"]');
        if (!loggedIn) {
            console.log(chalk.red.bold(`[BROWSER]: NOT LOGGED IN! Please log in to X now. Waiting 2 minutes...`));

            // Wait for user to login
            try {
                await page.waitForSelector('[data-testid="SideNav_NewTweet_Button"]', { timeout: 120000 });
                console.log(chalk.green(`[BROWSER]: Login detected! Proceeding...`));
            } catch (e) {
                console.log(chalk.red(`[BROWSER]: Login time expired. Aborting post.`));
                return;
            }
        }

        // Go to Compose directly or click button
        await page.goto('https://twitter.com/compose/tweet', { waitUntil: 'networkidle2' });

        // Type and Post
        console.log(chalk.magenta(`[BROWSER]: Typing tweet...`));
        await page.waitForSelector('.public-DraftStyleDefault-block');
        await page.click('.public-DraftStyleDefault-block');
        await page.keyboard.type(tweetText, { delay: 50 }); // Human-like typing

        await page.waitForTimeout(1000);
        await page.click('[data-testid="tweetButton"]');

        console.log(chalk.green(`[BROWSER]: Tweet sent!`));
        await page.waitForTimeout(5000); // Wait for send animation

    } catch (e) {
        console.error(chalk.red(`[BROWSER]: Posting failed: ${e.message}`));
    } finally {
        if (browser) await browser.close();
    }
}

async function claimFaucet(url) {
    let browser;
    try {
        console.log(chalk.green(`[BROWSER]: Navigating to faucet: ${url}`));
        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            userDataDir: USER_DATA_DIR,
            headless: false,
            args: ['--start-maximized', '--no-first-run']
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        console.log(chalk.green(`[BROWSER]: Page loaded. Looking for input fields...`));
        // Generic heuristic for wallet input
        const input = await page.$('input[placeholder*="Address"], input[placeholder*="wallet"], input[type="text"]');
        if (input) {
            await input.type(process.env.SOLANA_WALLET_ADDRESS || '4YVp4tBFdsegdMbcZ7bUP33icpPJ7zYmuwXCMDTS9HFq');
            console.log(chalk.green(`[BROWSER]: Filled wallet address.`));
            // User would need to solve captcha manually or we use a solver service
            console.log(chalk.yellow(`[BROWSER]: Please solve CAPTCHA manually if present. Waiting 60s...`));
            await page.waitForTimeout(60000);
        }

    } catch (e) {
        console.error(chalk.red(`[BROWSER]: Faucet claim failed: ${e.message}`));
    } finally {
        if (browser) await browser.close();
    }
}

// CLI Handler
const action = process.argv[2];
const payload = process.argv[3];

if (action === 'tweet') postToX(payload);
if (action === 'faucet') claimFaucet(payload);
