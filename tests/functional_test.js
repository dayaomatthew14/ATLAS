const { chromium } = require('playwright');

(async () => {
  console.log("Starting VISUAL functional test... Please watch your screen!");
  let hasErrors = false;
  
  const browser = await chromium.launch({ 
    headless: false, 
    slowMo: 800, // Slow down actions so the user can see them
    channel: 'chrome' // Force it to use the user's downloaded Chrome
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  
  // Capture console messages
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Browser Error]: ${msg.text()}`);
      hasErrors = true;
    }
  });

  // Capture page errors
  page.on('pageerror', error => {
    console.log(`[Page Error]: ${error.message}`);
    hasErrors = true;
  });

  try {
    console.log("Navigating to login page...");
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
    
    console.log("Filling login form...");
    await page.fill('input[type="email"]', 'dayaomatthew14@gmail.com');
    await page.fill('input[type="password"]', 'password123');
    
    console.log("Clicking login button...");
    await page.click('button[type="submit"]');
    
    // Wait for dashboard to load
    console.log("Waiting for dashboard to load...");
    await page.waitForURL('**/dashboard');
    console.log("Successfully logged in!");
    
    // Test Quick Action: Generate PDF
    console.log("Testing PDF Quick Action (Hovering/Clicking)...");
    await page.waitForSelector('text=Generate Official PDF');
    // Note: PDF generation opens a new tab. We will just check if the button exists and is clickable.

    // Navigate to Teachers
    console.log("Navigating to Teachers page...");
    await page.click('a[href="/dashboard/teachers"]');
    await page.waitForSelector('text=Manage Teachers', { timeout: 5000 });
    console.log("Teachers page loaded successfully.");

    // Check load bars
    const loadBars = await page.$$('text=Units');
    console.log(`Found ${loadBars.length} load indicators.`);

    // Navigate to Schedules
    console.log("Navigating to Schedules page...");
    await page.click('a[href="/dashboard/schedules"]');
    await page.waitForSelector('text=Manage Schedules', { timeout: 5000 });
    console.log("Schedules page loaded successfully.");

    // Open Manual Schedule Modal
    console.log("Opening Schedule Modal...");
    await page.click('button:has-text("Create Manual")');
    await page.waitForSelector('text=Save Schedule', { timeout: 5000 });
    console.log("Manual Schedule Modal opened successfully.");
    
    // Test AI Suggestions Button
    console.log("Testing AI Suggestions Button...");
    await page.click('button:has-text("Get AI Suggestions")');
    // It might show an error toast if no subject is selected, which is expected behavior
    await page.waitForTimeout(1500);

    // Close the Modal
    console.log("Closing Schedule Modal...");
    await page.click('button:has-text("Cancel")');
    // Wait for the modal overlay to disappear
    await page.waitForTimeout(1000);

    // Navigate to Sections
    console.log("Navigating to Sections page...");
    await page.click('a[href="/dashboard/sections"]');
    await page.waitForSelector('text=Section Management', { timeout: 5000 });
    console.log("Sections page loaded successfully.");
    
    // Navigate to System Logs
    console.log("Navigating to System Logs page...");
    await page.click('a[href="/dashboard/logs"]');
    await page.waitForSelector('text=System Logs', { timeout: 5000 });
    console.log("System Logs page loaded successfully.");

  } catch (err) {
    console.error("Test failed during execution:");
    console.error(err);
    hasErrors = true;
  } finally {
    console.log("Closing browser...");
    await browser.close();
  }
  
  if (hasErrors) {
    console.log("Functional tests completed with ERRORS.");
    process.exit(1);
  } else {
    console.log("Functional tests completed SUCCESSFULLY. No DOM or console errors found.");
    process.exit(0);
  }
})();
