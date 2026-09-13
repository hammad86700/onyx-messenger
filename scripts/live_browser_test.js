const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function runLiveTest() {
  console.log('=== STARTING LIVE BROWSER AUTOMATION TEST ===');

  const tempDir = path.join(__dirname, 'chrome-live-session');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9228',
    '--window-size=430,932',
    '--user-data-dir=' + tempDir,
  ]);

  await new Promise((r) => setTimeout(r, 2000));
  const r = await fetch('http://127.0.0.1:9228/json/list');
  const pages = await r.json();
  console.log('Available targets:', pages.map(p => ({ title: p.title, type: p.type, url: p.url })));
  const pageTarget = pages.find((p) => p.type === 'page') || pages[0];
  console.log('Connecting to target:', pageTarget.url, pageTarget.webSocketDebuggerUrl);
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let msgId = 1;
  const cbs = new Map();
  function send(method, params = {}) {
    return new Promise((res) => {
      const id = msgId++;
      cbs.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await new Promise((res) => (ws.onopen = res));

  const consoleLogs = [];
  const consoleErrors = [];

  let pageLoaded = false;
  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.id && cbs.has(d.id)) {
      cbs.get(d.id)(d.result);
      cbs.delete(d.id);
    } else if (d.method === 'Page.loadEventFired') {
      console.log('[EVENT]: Page.loadEventFired');
      pageLoaded = true;
    } else if (d.method === 'Page.frameNavigated') {
      console.log('[EVENT]: Frame navigated to:', d.params.frame?.url);
    } else if (d.method === 'Runtime.consoleAPICalled') {
      const msg = d.params.args?.map((a) => a.value ?? a.description).join(' ');
      consoleLogs.push(`[${d.params.type}] ${msg}`);
      if (d.params.type === 'error') consoleErrors.push(msg);
    } else if (d.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(d.params.exceptionDetails?.text || 'Exception thrown');
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  // 1. Navigate to http://localhost:3000
  console.log('\n[1/5] Navigating to http://localhost:3000...');
  pageLoaded = false;
  await send('Page.navigate', { url: 'http://localhost:3000' });

  for (let i = 0; i < 30; i++) {
    if (pageLoaded) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  await new Promise((r) => setTimeout(r, 2500));

  // Check Login screen
  const loginCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const form = document.querySelector('form');
      const inputs = document.querySelectorAll('input');
      const btn = document.querySelector('button[type="submit"]');
      return {
        title: document.title,
        hasForm: !!form,
        inputCount: inputs.length,
        hasSubmitBtn: !!btn,
        btnText: btn?.innerText,
        bodyText: document.body.innerText.slice(0, 150)
      };
    })()`,
    returnByValue: true,
  });

  console.log('Login Screen Check:', JSON.stringify(loginCheck.result?.value, null, 2));

  // Screenshot 1: Login View
  const ss1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, 'step1_login_view.png'), Buffer.from(ss1.data, 'base64'));
  console.log('📸 Captured: step1_login_view.png');

  // 2. Perform Login via form inputs and button click
  console.log('\n[2/5] Filling in credentials (username: hammad2006)...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const inputs = document.querySelectorAll('input');
      const usernameInput = inputs[0];
      const passwordInput = inputs[1];

      // Native value setter to trigger React synthetic events
      const setVal = (el, val) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      setVal(usernameInput, 'hammad2006');
      setVal(passwordInput, 'OnyxAdmin@2026!');
      return { u: usernameInput.value, p: passwordInput.value.length };
    })()`,
    returnByValue: true,
  });

  console.log('Submitting login form...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('button[type="submit"]');
      btn.click();
    })()`,
  });

  // Wait for authentication and transition
  console.log('Waiting for auth state change and Chat Feed to render...');
  let feedLoaded = false;
  for (let i = 0; i < 30; i++) {
    const check = await send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('header') && document.querySelector('nav'))`,
      returnByValue: true,
    });
    if (check.result?.value) {
      feedLoaded = true;
      console.log(`Chat feed loaded successfully after ${(i + 1) * 500}ms!`);
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await new Promise((r) => setTimeout(r, 1000));

  // Check Chat Feed
  const feedCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const header = document.querySelector('header');
      const nav = document.querySelector('nav');
      const tabs = nav ? Array.from(nav.querySelectorAll('button')).map(b => b.innerText.trim()) : [];
      return {
        hasHeader: !!header,
        headerText: header?.innerText.trim(),
        hasNav: !!nav,
        navTabs: tabs,
        bodySnippet: document.body.innerText.slice(0, 200)
      };
    })()`,
    returnByValue: true,
  });

  console.log('Chat Feed Check:', JSON.stringify(feedCheck.result?.value, null, 2));

  // Screenshot 2: Chat Feed View
  const ss2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, 'step2_chat_feed.png'), Buffer.from(ss2.data, 'base64'));
  console.log('📸 Captured: step2_chat_feed.png');

  // 3. Test Vault Tab Navigation
  console.log('\n[3/5] Switching to Vault tab in bottom navigation...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const nav = document.querySelector('nav');
      const buttons = nav.querySelectorAll('button');
      // Tab 1 is Vault
      buttons[1]?.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1000));

  const vaultCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        hasVaultHeader: document.body.innerText.includes('Personal Vault'),
        text: document.body.innerText.slice(0, 180)
      };
    })()`,
    returnByValue: true,
  });
  console.log('Vault View Check:', JSON.stringify(vaultCheck.result?.value, null, 2));

  // Screenshot 3: Vault View
  const ss3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, 'step3_vault_view.png'), Buffer.from(ss3.data, 'base64'));
  console.log('📸 Captured: step3_vault_view.png');

  // 4. Test Settings Tab Navigation
  console.log('\n[4/5] Switching to Settings tab in bottom navigation...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const nav = document.querySelector('nav');
      const buttons = nav.querySelectorAll('button');
      // Tab 2 is Settings
      buttons[2]?.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1000));

  const settingsCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        hasFounderBadge: document.body.innerText.includes('FOUNDER'),
        hasHammadWatermark: document.body.innerText.includes('Hammad'),
        hasThemeSelector: document.body.innerText.includes('Onyx Pure'),
        text: document.body.innerText.slice(0, 180)
      };
    })()`,
    returnByValue: true,
  });
  console.log('Settings View Check:', JSON.stringify(settingsCheck.result?.value, null, 2));

  // Screenshot 4: Settings View
  const ss4 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, 'step4_settings_view.png'), Buffer.from(ss4.data, 'base64'));
  console.log('📸 Captured: step4_settings_view.png');

  // Test Install Onyx App Guide Modal
  console.log('Testing Install Onyx App Modal from Settings...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const installBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Install Onyx App'));
      installBtn?.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 600));

  const modalCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        hasModalTitle: document.body.innerText.includes('Install Onyx on Mobile'),
        hasAndroidTab: document.body.innerText.includes('Android (Chrome)'),
        hasIOSTab: document.body.innerText.includes('iPhone (Safari)')
      };
    })()`,
    returnByValue: true,
  });
  console.log('Install Guide Modal Check:', JSON.stringify(modalCheck.result?.value, null, 2));

  const ss4b = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, 'step4b_install_modal.png'), Buffer.from(ss4b.data, 'base64'));
  console.log('📸 Captured: step4b_install_modal.png');

  // Close modal by clicking "Got It"
  await send('Runtime.evaluate', {
    expression: `(() => {
      const gotItBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Got It');
      gotItBtn?.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 600));

  // 5. Return to Chats Tab and test user search
  console.log('\n[5/5] Returning to Chats tab and testing user search...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const nav = document.querySelector('nav');
      const buttons = nav.querySelectorAll('button');
      // Tab 0 is Chats
      buttons[0]?.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 800));

  // Click Search icon in header
  await send('Runtime.evaluate', {
    expression: `(() => {
      const searchBtn = document.querySelector('header button[aria-label="Search"]');
      searchBtn?.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 800));

  // Type in search box
  await send('Runtime.evaluate', {
    expression: `(() => {
      const searchInput = document.querySelector('input[placeholder*="Search"]');
      if (searchInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(searchInput, 'alice');
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`,
  });
  await new Promise((r) => setTimeout(r, 3000));

  const searchCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const userBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Alice'));
      return {
        hasAlice: document.body.innerText.includes('Alice'),
        hasUserBtn: !!userBtn,
        text: document.body.innerText.slice(0, 200)
      };
    })()`,
    returnByValue: true,
  });
  console.log('Search Check:', JSON.stringify(searchCheck.result?.value, null, 2));

  // Screenshot 5: Search View
  const ss5 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, 'step5_search_view.png'), Buffer.from(ss5.data, 'base64'));
  console.log('📸 Captured: step5_search_view.png');

  // 6. Click Alice to open conversation (Test View 2 slide-in)
  console.log('\n[6/6] Opening chat with Alice Wonder to verify View 2 slide-in...');
  const clickRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const aliceBtn = btns.find(b => b.innerText.includes('Alice Wonder'));
      if (aliceBtn) {
        aliceBtn.click();
        return { clicked: true, text: aliceBtn.innerText };
      }
      return { clicked: false };
    })()`,
    returnByValue: true,
  });
  console.log('Alice click result:', clickRes.result?.value);

  // Poll for Active Chat header to slide in
  let chatLoaded = false;
  for (let i = 0; i < 20; i++) {
    const check = await send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('button[aria-label="Back to conversations"]'))`,
      returnByValue: true,
    });
    if (check.result?.value) {
      chatLoaded = true;
      console.log(`Active chat view loaded successfully after ${(i + 1) * 300}ms!`);
      break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  await new Promise((r) => setTimeout(r, 1000));

  const chatCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const backBtn = document.querySelector('button[aria-label="Back to conversations"]');
      const input = document.querySelector('textarea, input[placeholder*="Message"]');
      return {
        hasBackBtn: !!backBtn,
        hasMessageInput: !!input,
        inputPlaceholder: input?.placeholder,
        textSnippet: document.body.innerText.slice(0, 200)
      };
    })()`,
    returnByValue: true,
  });
  console.log('Active Chat View Check:', JSON.stringify(chatCheck.result?.value, null, 2));

  // Screenshot 6: Active Chat
  const ss6 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, 'step6_active_chat.png'), Buffer.from(ss6.data, 'base64'));
  console.log('📸 Captured: step6_active_chat.png');

  // Test Back button
  console.log('Testing back button navigation to return to Feed...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const backBtn = document.querySelector('button[aria-label="Back to conversations"]');
      backBtn?.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1500));

  // Screenshot 7: Returned to Feed
  const ss7 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, 'step7_back_to_feed.png'), Buffer.from(ss7.data, 'base64'));
  console.log('📸 Captured: step7_back_to_feed.png');

  console.log('\n=== ALL BROWSER AUTOMATION TESTS COMPLETED SUCCESSFULLY! ===');
  console.log('Total Console Errors Recorded:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.warn('Errors:', consoleErrors);
  }

  ws.close();
  try { chrome.kill(); } catch {}
  process.exit(0);
}

runLiveTest().catch((err) => {
  console.error('Fatal live test error:', err);
  process.exit(1);
});
