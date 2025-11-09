/**
 * OpenApp Executor - TRULY SIMPLE
 * Let Windows do ALL the work
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface OpenAppStep {
  op: "OpenApp";
  app: string;
  args?: string;
}

/**
 * Execute OpenApp - Windows finds it, we just launch
 * Enhanced with smart app detection and fallbacks
 */
export async function executeOpenApp(step: OpenAppStep): Promise<string> {
  const appName = step.app.trim().toLowerCase();
  
  console.log(`[OpenApp] "${appName}"`);
  
  // URLs - just open
  if (appName.startsWith("http") || appName.includes("://") || appName.startsWith("www.")) {
    await execAsync(`start "" "${step.app.trim()}"`, { shell: 'cmd.exe', windowsHide: true, timeout: 5000 });
    return `Opened ${step.app.trim()}`;
  }
  
  // Special handling for common apps
  const appMap: Record<string, string[]> = {
    "spotify": ["spotify", "Spotify.exe", "spotify://"],
    "youtube": ["chrome", "msedge", "firefox", "brave"],
    "chrome": ["chrome", "google chrome", "chrome.exe"],
    "edge": ["msedge", "microsoft edge", "msedge.exe"],
    "firefox": ["firefox", "firefox.exe"],
    "notepad": ["notepad", "notepad.exe"],
    "calculator": ["calc", "calculator", "calc.exe"],
    "settings": ["ms-settings:", "settings"],
    "explorer": ["explorer", "explorer.exe"],
    "slack": ["slack", "slack.exe", "slack://"],
    "discord": ["discord", "discord.exe"],
    "vscode": ["code", "code.exe", "visual studio code"],
    "word": ["winword", "word.exe", "microsoft word"],
    "excel": ["excel", "excel.exe", "microsoft excel"],
  };
  
  // Check if we have a mapping for this app
  const mappedApp = appMap[appName];
  if (mappedApp) {
    for (const appToTry of mappedApp) {
      try {
        if (appName === "youtube" && appToTry !== "youtube") {
          // For YouTube, open browser and navigate to YouTube
          const browser = appToTry;
          await execAsync(`start "" "${browser}"`, {
            shell: 'cmd.exe',
            windowsHide: true,
            timeout: 5000
          });
          // Wait a bit for browser to open
          await new Promise(resolve => setTimeout(resolve, 2000));
          // Type YouTube URL in address bar
          const ps = `(New-Object -ComObject WScript.Shell).SendKeys("^l"); Start-Sleep -Milliseconds 300; (New-Object -ComObject WScript.Shell).SendKeys("youtube.com{ENTER}")`;
          await execAsync(`powershell -Command "${ps}"`, {
            windowsHide: true,
            timeout: 5000
          });
          return `Opened YouTube in ${browser}`;
        } else if (appToTry.includes("://")) {
          // URI scheme (like spotify://, slack://, ms-settings:)
          await execAsync(`start "" "${appToTry}"`, {
            shell: 'cmd.exe',
            windowsHide: true,
            timeout: 5000
          });
          return `Opened ${appName}`;
        } else {
          // Regular app
          await execAsync(`start "" "${appToTry}"`, {
            shell: 'cmd.exe',
            windowsHide: true,
            timeout: 5000
          });
          console.log(`[OpenApp] ✓ ${appName} (via ${appToTry})`);
          return `Opened ${appName}`;
        }
      } catch (err) {
        // Try next option
        continue;
      }
    }
  }
  
  // Generic app opening - try multiple methods
  const originalAppName = step.app.trim();
  
  try {
    // Method 1: Just use start with the app name
    await execAsync(`start "" "${originalAppName}"`, {
      shell: 'cmd.exe',
      windowsHide: true,
      timeout: 5000
    });
    
    console.log(`[OpenApp] ✓ ${originalAppName}`);
    return `Opened ${originalAppName}`;
    
  } catch (error1) {
    // Method 2: Try without quotes
    try {
      await execAsync(`start ${originalAppName}`, {
        shell: 'cmd.exe',
        windowsHide: true,
        timeout: 5000
      });
      
      console.log(`[OpenApp] ✓ ${originalAppName}`);
      return `Opened ${originalAppName}`;
      
    } catch (error2) {
      // Method 3: Use PowerShell's Start-Process (searches PATH and Apps)
      try {
        const escaped = originalAppName.replace(/'/g, "''");
        await execAsync(`powershell -Command "Start-Process '${escaped}'"`, {
          windowsHide: true,
          timeout: 5000
        });
        
        console.log(`[OpenApp] ✓ ${originalAppName}`);
        return `Opened ${originalAppName}`;
        
      } catch (error3) {
        console.error(`[OpenApp] ✗ All methods failed for: ${originalAppName}`);
        throw new Error(`Could not find "${originalAppName}"`);
      }
    }
  }
}

export async function executeOpenUrl(url: string, timestamp?: string): Promise<string> {
  const fullUrl = timestamp ? `${url}?t=${timestamp}` : url;
  await execAsync(`start "" "${fullUrl}"`, { shell: 'cmd.exe', windowsHide: true });
  return `Opened ${url}`;
}
