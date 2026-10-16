'use strict';
// Native Windows WebView2 SPA route verification and screenshot evidence.
// Runs only after prior functional matrix has created synthetic accounting data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function inspectNativeRoutes() {
  const ensure = (condition, message) => { if (!condition) throw Error(message); };
  ensure(!document.getElementById('finoraAuthOverlay'), 'Unexpected authentication overlay');
  const routes = [
    'dashboard', 'invoices', 'products', 'contacts', 'treasury',
    'cheques', 'expenses', 'reports', 'accounting', 'settings'
  ];
  const pages = [];
  for (const route of routes) {
    await FINORA.Router.go(route);
    const node = document.getElementById('pageContent');
    const content = (node?.textContent || '').trim();
    ensure(FINORA.Router.current() === route, 'Router did not select ' + route);
    ensure(content.length > 10, 'Blank page: ' + route);
    ensure(!content.includes('خطا در بارگذاری صفحه'), 'Page crashed: ' + route);
    ensure(!document.getElementById('finoraAuthOverlay'), 'Auth overlay returned on ' + route);
    pages.push({ route, renderedCharacters: content.length });
  }
  await FINORA.Router.go('dashboard');
  return { routes: pages, allRoutesRendered: pages.length === routes.length,
    version: FINORA.version, nativeLocation: location.protocol };
}

module.exports = async function verifyNativeRoutes(cdp, expectedVersion, reportPath) {
  const evidence = await cdp.evaluate('(' + inspectNativeRoutes.toString() + ')()', 45000);
  assert.ok(evidence.allRoutesRendered);
  assert.equal(evidence.routes.length, 10);
  assert.equal(evidence.version, expectedVersion);
  let screenshot = 'UNVERIFIED';
  try {
    const img = await cdp.command('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false, fromSurface: true
    }, 25000);
    if (!img?.data) throw Error('Native WebView2 did not return screenshot data');
    const png = Buffer.from(img.data, 'base64');
    if (png.length < 2000 || png.toString('ascii', 1, 4) !== 'PNG') {
      throw Error('Invalid native screenshot PNG');
    }
    if (!reportPath) throw Error('No artifact directory configured');
    const filename = path.join(path.dirname(reportPath), 'fresh-native-dashboard.png');
    fs.writeFileSync(filename, png);
    screenshot = path.basename(filename);
  } catch (error) {
    screenshot = 'UNVERIFIED: ' + error.message;
  }
  console.log('NATIVE WINDOWS ROUTES PASSED: ' + JSON.stringify({
    count: evidence.routes.length, screenshot
  }));
  return { ...evidence, screenshot, physicalPrinter: 'not-covered' };
};
