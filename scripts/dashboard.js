/**
 * EDITX COCKPIT & SERVER MANAGEMENT SCREEN LAUNCHER
 * Usage:
 *   node scripts/dashboard.js
 *   or: npm run dashboard
 */

const http = require('http');
const { spawn, exec } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}`;

function checkServerReady(retries = 30, interval = 1000) {
  return new Promise((resolve) => {
    const attempt = (remaining) => {
      const req = http.get(`${URL}/api/status`, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else if (remaining > 0) {
          setTimeout(() => attempt(remaining - 1), interval);
        } else {
          resolve(false);
        }
      });
      req.on('error', () => {
        if (remaining > 0) {
          setTimeout(() => attempt(remaining - 1), interval);
        } else {
          resolve(false);
        }
      });
      req.end();
    };
    attempt(retries);
  });
}

function openAppWindow(targetUrl) {
  // On Windows, opening with --app=URL provides a sleek, borderless native popup window
  const isWindows = process.platform === 'win32';
  if (isWindows) {
    // Try Edge app mode first (installed on all modern Windows systems)
    exec(`start msedge --app=${targetUrl}`, (err) => {
      if (err) {
        // Fallback to Chrome
        exec(`start chrome --app=${targetUrl}`, (err2) => {
          if (err2) {
            // Fallback to default browser
            exec(`start ${targetUrl}`);
          }
        });
      }
    });
  } else {
    // macOS / Linux
    exec(`open "${targetUrl}" || xdg-open "${targetUrl}"`);
  }
}

async function main() {
  console.log('\n=============================================================');
  console.log('🎮 EDITX BOT TAKEOVER COCKPIT & LIVE SERVER DASHBOARD');
  console.log('=============================================================');

  // Check if bot server is already listening
  console.log(`[1/3] Connecting to EditX Server Engine on port ${PORT}...`);
  let isRunning = await checkServerReady(2, 500);

  let botProcess = null;
  if (!isRunning) {
    console.log('[2/3] Bot process not detected. Launching Omni Bot Engine in background...');
    botProcess = spawn('node', ['omni_bot.js'], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      shell: true
    });

    console.log('Waiting for Discord Gateway and Dashboard HTTP server to initialize...');
    const ready = await checkServerReady(30, 1000);
    if (!ready) {
      console.error('❌ Failed to connect to dashboard server after launch.');
      process.exit(1);
    }
  } else {
    console.log('✅ EditX Server Engine is already online and connected!');
  }

  // Open the GUI screen popup
  console.log(`[3/3] Opening Live Cockpit Screen at ${URL}...`);
  openAppWindow(URL);

  console.log('\n✨ DASHBOARD SCREEN OPENED ON YOUR DESKTOP!');
  console.log('-------------------------------------------------------------');
  console.log('• Takeover Mode: Click the Master Switch in the top right to');
  console.log('  control the bot manually. Speak, send embeds, and moderate as EditX Bot!');
  console.log('• Auto-Recharge: When you close the screen window, EditX Bot');
  console.log('  will automatically take charge again immediately.');
  console.log('• Direct URL: ' + URL);
  console.log('-------------------------------------------------------------');
  console.log('Press Ctrl+C in this terminal whenever you want to close the launcher.\n');

  // Handle graceful exit
  process.on('SIGINT', () => {
    console.log('\n[EXIT] Closing cockpit launcher...');
    // Ensure takeover is released
    const req = http.request(`${URL}/api/takeover/release`, { method: 'POST' });
    req.on('error', () => {});
    req.end(() => {
      if (botProcess) {
        botProcess.kill();
      }
      process.exit(0);
    });
  });
}

main().catch(console.error);
