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
 */
export async function executeOpenApp(step: OpenAppStep): Promise<string> {
  const appName = step.app.trim();
  
  console.log(`[OpenApp] "${appName}"`);
  
  // URLs - just open
  if (appName.startsWith("http") || appName.includes("://") || appName.startsWith("www.")) {
    await execAsync(`start "" "${appName}"`, { shell: 'cmd.exe', windowsHide: true, timeout: 5000 });
    return `Opened ${appName}`;
  }
  
  // Apps - let Windows start command do the searching
  // Windows start command is SMART - it searches:
  // 1. Current directory
  // 2. PATH environment
  // 3. Start Menu
  // 4. App execution aliases
  // 5. Registered applications
  
  try {
    // Method 1: Just use start with the app name
    // Windows will search everywhere for you
    await execAsync(`start "" "${appName}"`, {
      shell: 'cmd.exe',
      windowsHide: true,
      timeout: 5000
    });
    
    console.log(`[OpenApp] ✓ ${appName}`);
    return `Opened ${appName}`;
    
  } catch (error1) {
    // Method 2: Try without quotes
    try {
      await execAsync(`start ${appName}`, {
        shell: 'cmd.exe',
        windowsHide: true,
        timeout: 5000
      });
      
      console.log(`[OpenApp] ✓ ${appName}`);
      return `Opened ${appName}`;
      
    } catch (error2) {
      // Method 3: Try with .exe extension
      try {
        await execAsync(`start "" "${appName}.exe"`, {
          shell: 'cmd.exe',
          windowsHide: true,
          timeout: 5000
        });
        
        console.log(`[OpenApp] ✓ ${appName}`);
        return `Opened ${appName}`;
        
      } catch (error3) {
        // Method 4: Use PowerShell's Start-Process (searches PATH and Apps)
        try {
          await execAsync(`powershell -Command "Start-Process '${appName}'"`, {
            windowsHide: true,
            timeout: 5000
          });
          
          console.log(`[OpenApp] ✓ ${appName}`);
          return `Opened ${appName}`;
          
        } catch (error4) {
          console.error(`[OpenApp] ✗ All methods failed for: ${appName}`);
          throw new Error(`Could not find "${appName}"`);
        }
      }
    }
  }
}

export async function executeOpenUrl(url: string, timestamp?: string): Promise<string> {
  const fullUrl = timestamp ? `${url}?t=${timestamp}` : url;
  await execAsync(`start "" "${fullUrl}"`, { shell: 'cmd.exe', windowsHide: true });
  return `Opened ${url}`;
}
