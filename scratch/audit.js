const { chromium } = require('playwright');
const fs = require('fs');

async function runAudit() {
  console.log("Starting ATLAS DOM Audit...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const report = {
    timestamp: new Date().toISOString(),
    steps: [],
    errors: [],
    api_checks: []
  };

  // Monitor API calls
  page.on('response', response => {
    if (response.url().includes('/api/')) {
      report.api_checks.push({
        url: response.url(),
        status: response.status(),
        ok: response.ok()
      });
    }
  });

  // Monitor Console Errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      report.errors.push(`Console Error: ${msg.text()}`);
    }
  });

  try {
    // 1. Login
    console.log("Testing Login...");
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', 'dayaomatthew14@gmail.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
    report.steps.push("Login Successful");

    // 2. Dashboard Check
    console.log("Checking Dashboard...");
    await page.waitForSelector('h1:has-text("Master the")');
    await page.waitForTimeout(1000); // Wait for async conflict count
    const hasConflictBadge = await page.isVisible('span:has-text("Conflicts")');
    report.steps.push(`Dashboard Loaded. Conflict Badge Present: ${hasConflictBadge}`);

    // 3. Teachers Page Check
    console.log("Checking Teachers Page...");
    await page.click('a:has-text("Teachers")');
    await page.waitForSelector('h2:has-text("Manage Teachers")');
    const hasLoadBars = await page.isVisible('div.bg-slate-100'); // Corrected selector
    report.steps.push(`Teachers Page Loaded. Load Bars Detected: ${hasLoadBars}`);

    // 4. Schedules Page Check
    console.log("Checking Schedules Page...");
    await page.click('a:has-text("Schedules")');
    await page.waitForSelector('h2:has-text("Manage Schedules")');
    await page.click('button:has-text("Create Manual")');
    await page.waitForSelector('h3:has-text("Create New Schedule")');
    await page.click('button:has-text("Cancel")'); // Close modal to unblock UI
    report.steps.push("Schedules Page & Modal Functional");

    // 5. Sections Page Check
    console.log("Checking Sections Page...");
    await page.click('a:has-text("Sections")');
    await page.waitForSelector('h2:has-text("Manage Sections")');
    report.steps.push("Sections Page Functional");

    // 6. Logs Page Check
    console.log("Checking Logs Page...");
    await page.click('a:has-text("Dashboard")'); // Go back to home to find logs link
    await page.click('a:has-text("System Logs")');
    await page.waitForSelector('h1:has-text("System Logs")');
    report.steps.push("System Logs Page Functional");

  } catch (error) {
    report.errors.push(`Audit Failure: ${error.message}`);
    console.error(error);
  } finally {
    await browser.close();
    fs.writeFileSync('audit_report.json', JSON.stringify(report, null, 2));
    console.log("Audit Complete. Report saved to audit_report.json");
  }
}

runAudit();
