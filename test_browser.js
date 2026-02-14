
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(async () => {
    console.log('Launching browser...');
    try {
        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        console.log('Navigating to localhost:3000...');
        try {
            await page.goto('http://localhost:3000', {
                waitUntil: 'networkidle0',
                timeout: 30000
            });

            const title = await page.title();
            console.log('Page Title:', title);

            // Get visible text content of body
            const bodyText = await page.evaluate(() => document.body.innerText);
            console.log('Body Text Preview:', bodyText.substring(0, 200).replace(/\n/g, ' '));

            const screenshotPath = join(__dirname, 'localhost_test.png');
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`Screenshot saved to: ${screenshotPath}`);

        } catch (navError) {
            console.error('Navigation error:', navError.message);
        } finally {
            await browser.close();
        }
    } catch (launchError) {
        console.error('Browser launch failed:', launchError);
    }
})();
