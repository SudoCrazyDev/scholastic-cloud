const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const videoDir = path.resolve(__dirname, 'recordings');
  require('fs').mkdirSync(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: false, slowMo: 400 });
  const context = await browser.newContext({
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  // 1. Login
  await page.goto('http://localhost:5173/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill('philiplouis0717@gmail.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  await page.waitForTimeout(1000);

  // 2. Navigate to Timetable
  await page.goto('http://localhost:5173/timetable');
  await page.waitForTimeout(2000);

  // 3. Select section
  const select = page.getByRole('combobox');
  await select.waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
  // Pick first option that has subjects
  const options = await select.locator('option').allTextContents();
  const sectionOption = options.find(o => o.includes('Section A'));
  if (sectionOption) {
    await select.selectOption({ label: sectionOption });
  }
  await page.waitForTimeout(1500);

  // Helper: open subject modal, set days & times, save
  async function scheduleSubject(name, days, start, end) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await page.waitForTimeout(500);
    for (const day of days) {
      await page.getByRole('button', { name: day, exact: true }).click();
      await page.waitForTimeout(200);
    }
    const timeboxes = page.getByRole('textbox');
    await timeboxes.nth(1).fill(start);
    await timeboxes.nth(2).fill(end);
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Save Schedule' }).click();
    await page.waitForTimeout(1000);
  }

  // 4. Schedule all subjects
  await scheduleSubject('Mathematics', ['Mon', 'Wed', 'Fri'], '07:00', '08:00');
  await scheduleSubject('English', ['Tue', 'Thu'], '08:00', '09:00');
  await scheduleSubject('Science', ['Mon', 'Wed'], '09:00', '10:00');
  await scheduleSubject('Filipino', ['Tue', 'Thu'], '10:00', '11:00');

  // 5. Scroll to show the full grid
  await page.waitForTimeout(1500);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(1500);

  // 6. Done — close context to flush video
  await context.close();
  await browser.close();

  // Find the recorded video file
  const files = require('fs').readdirSync(videoDir);
  const video = files.find(f => f.endsWith('.webm'));
  console.log('Recording saved to:', path.join(videoDir, video));
})();
