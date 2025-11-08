/**
 * OpenApp Executor
 * Launches applications on Windows
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface OpenAppStep {
  op: "OpenApp";
  app: string;
}

// Common app aliases mapped to Windows commands
const APP_ALIASES: Record<string, string> = {
  // Browsers
  chrome: "start chrome",
  firefox: "start firefox",
  edge: "start msedge",
  brave: "start brave",
  
  // Communication
  slack: "start slack",
  teams: "start msteams",
  discord: "start discord",
  zoom: "start zoom",
  outlook: "start outlook",
  
  // Media
  spotify: "start spotify",
  vlc: "start vlc",
  
  // Productivity
  notepad: "notepad",
  calculator: "calc",
  paint: "mspaint",
  explorer: "explorer",
  
  // Settings
  "ms-settings:": "start ms-settings:",
  settings: "start ms-settings:",
  
  // Office (if installed)
  word: "start winword",
  excel: "start excel",
  powerpoint: "start powerpnt",
  onenote: "start onenote",
  
  // Dev tools
  vscode: "code",
  "visual studio code": "code",
};

/**
 * Execute OpenApp command
 */
export async function executeOpenApp(step: OpenAppStep): Promise<string> {
  const appName = step.app.toLowerCase();
  
  console.log(`[EXECUTOR:OpenApp] Launching: ${appName}`);
  
  try {
    // Special handling for URLs (YouTube, websites, etc.)
    if (appName.startsWith("http://") || appName.startsWith("https://") || 
        appName.includes("youtube.com") || appName.includes("youtu.be")) {
      // Use cmd /c start "" to properly handle URLs
      await execAsync(`cmd /c start "" "${step.app}"`, { 
        windowsHide: true,
        timeout: 5000 
      });
      return `Opened ${step.app} in default browser`;
    }
    
    // Check if it's a known alias
    const command = APP_ALIASES[appName];
    
    if (command) {
      // Known app - use its command
      await execAsync(`cmd /c ${command}`, { 
        windowsHide: true,
        timeout: 5000 
      });
      console.log(`[EXECUTOR:OpenApp] Success: ${appName}`);
      return `Launched ${appName}`;
    } else {
      // Unknown app - try generic start command
      await execAsync(`cmd /c start "" "${step.app}"`, { 
        windowsHide: true,
        timeout: 5000 
      });
      console.log(`[EXECUTOR:OpenApp] Success: ${step.app}`);
      return `Launched ${step.app}`;
    }
  } catch (error: any) {
    console.error(`[EXECUTOR:OpenApp] Error:`, error.message);
    throw new Error(`Failed to open ${step.app}: ${error.message}`);
  }
}

/**
 * Open a URL (YouTube, websites, etc.)
 */
export async function executeOpenUrl(url: string, timestamp?: string): Promise<string> {
  console.log(`[EXECUTOR:OpenApp] Opening URL: ${url}${timestamp ? ` at ${timestamp}` : ''}`);
  
  try {
    // Add timestamp to YouTube URLs
    if (timestamp && (url.includes("youtube.com") || url.includes("youtu.be"))) {
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}t=${timestamp}`;
    }
    
    await execAsync(`cmd /c start "" "${url}"`, { windowsHide: true, timeout: 5000 });
    return `Opened ${url}`;
  } catch (error: any) {
    throw new Error(`Failed to open URL: ${error.message}`);
  }
}

