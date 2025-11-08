/**
 * OpenApp Executor
 * Launches applications on Windows - ROBUST & DYNAMIC VERSION
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";

const execAsync = promisify(exec);

export interface OpenAppStep {
  op: "OpenApp";
  app: string;
  args?: string;
}

// Common app aliases mapped to Windows commands
const APP_ALIASES: Record<string, string> = {
  // Browsers
  "chrome": "chrome",
  "google chrome": "chrome",
  "firefox": "firefox",
  "edge": "msedge",
  "microsoft edge": "msedge",
  "brave": "brave",
  "opera": "opera",
  
  // Communication
  "slack": "slack",
  "teams": "msteams",
  "microsoft teams": "msteams",
  "discord": "discord",
  "zoom": "zoom",
  "skype": "skype",
  "outlook": "outlook",
  
  // Media
  "spotify": "spotify",
  "vlc": "vlc",
  "media player": "wmplayer",
  "windows media player": "wmplayer",
  "itunes": "itunes",
  "apple music": "AppleMusic",
  
  // Productivity
  "notepad": "notepad",
  "calculator": "calc",
  "calc": "calc",
  "paint": "mspaint",
  "explorer": "explorer",
  "file explorer": "explorer",
  "files": "explorer",
  "cmd": "cmd",
  "command prompt": "cmd",
  "powershell": "powershell",
  "terminal": "wt",
  "windows terminal": "wt",
  
  // Settings
  "settings": "ms-settings:",
  "control panel": "control",
  "task manager": "taskmgr",
  "device manager": "devmgmt.msc",
  "services": "services.msc",
  "registry": "regedit",
  "registry editor": "regedit",
  
  // Office (if installed)
  "word": "winword",
  "microsoft word": "winword",
  "excel": "excel",
  "microsoft excel": "excel",
  "powerpoint": "powerpnt",
  "microsoft powerpoint": "powerpnt",
  "onenote": "onenote",
  "microsoft onenote": "onenote",
  "microsoft outlook": "outlook",
  
  // Dev tools
  "vscode": "code",
  "visual studio code": "code",
  "vs code": "code",
  "code": "code",
  "visual studio": "devenv",
  "git": "git",
  "github": "github",
  "github desktop": "GitHubDesktop",
  
  // Other common apps
  "steam": "steam",
  "nvidia": "nvidia-smi",
  "adobe": "adobe",
  "photoshop": "photoshop",
  "illustrator": "illustrator",
  "premiere": "premiere",
  "winrar": "winrar",
  "7zip": "7zFM",
  "7-zip": "7zFM",
};

// Windows Store app protocols
const STORE_APP_PROTOCOLS: Record<string, string> = {
  "photos": "ms-photos:",
  "mail": "ms-mail:",
  "calendar": "ms-calendar:",
  "clock": "ms-clock:",
  "calculator": "calculator:",
  "camera": "microsoft.windows.camera:",
  "maps": "bingmaps:",
  "store": "ms-windows-store:",
  "xbox": "xbox:",
  "weather": "bingweather:",
  "news": "bingnews:",
  "settings": "ms-settings:",
};

/**
 * Execute OpenApp command
 */
export async function executeOpenApp(step: OpenAppStep): Promise<string> {
  let appName = step.app.toLowerCase().trim();
  const args = step.args || "";
  
  console.log(`[EXECUTOR:OpenApp] Launching: ${appName}${args ? ` with args: ${args}` : ''}`);
  
  try {
    // 1. Check if it's a URL
    if (isURL(appName)) {
      return await openURL(step.app, args);
    }
    
    // 2. Check if it's a file path
    if (isFilePath(appName)) {
      return await openFilePath(step.app);
    }
    
    // 3. Check if it's a Windows Store app protocol
    const storeProtocol = STORE_APP_PROTOCOLS[appName];
    if (storeProtocol) {
      await execAsync(`cmd /c start "" "${storeProtocol}${args}"`, {
        windowsHide: true,
        timeout: 5000
      });
      console.log(`[EXECUTOR:OpenApp] Opened via store protocol: ${storeProtocol}`);
      return `Opened ${appName}`;
    }
    
    // 4. Check known aliases
    const alias = APP_ALIASES[appName];
    if (alias) {
      return await launchApp(alias, args, appName);
    }
    
    // 5. Try direct app name (user might know exact executable name)
    return await launchApp(appName, args, appName);
    
  } catch (error: any) {
    console.error(`[EXECUTOR:OpenApp] Error:`, error.message);
    throw new Error(`Failed to open "${step.app}": ${error.message}`);
  }
}

/**
 * Launch an application with multiple fallback methods
 */
async function launchApp(command: string, args: string, displayName: string): Promise<string> {
  // Method 1: Try direct start command
  try {
    const fullCommand = args ? `${command} ${args}` : command;
    await execAsync(`cmd /c start "" ${fullCommand}`, {
      windowsHide: true,
      timeout: 5000
    });
    console.log(`[EXECUTOR:OpenApp] Success via direct start: ${command}`);
    return `Launched ${displayName}`;
  } catch (error1) {
    console.warn(`[EXECUTOR:OpenApp] Direct start failed:`, (error1 as Error).message);
  }
  
  // Method 2: Try with quotes (for paths with spaces)
  try {
    const fullCommand = args ? `"${command}" ${args}` : `"${command}"`;
    await execAsync(`cmd /c start "" ${fullCommand}`, {
      windowsHide: true,
      timeout: 5000
    });
    console.log(`[EXECUTOR:OpenApp] Success via quoted start: ${command}`);
    return `Launched ${displayName}`;
  } catch (error2) {
    console.warn(`[EXECUTOR:OpenApp] Quoted start failed:`, (error2 as Error).message);
  }
  
  // Method 3: Try PowerShell Start-Process
  try {
    const psCommand = args 
      ? `Start-Process -FilePath "${command}" -ArgumentList "${args}"`
      : `Start-Process "${command}"`;
    await execAsync(`powershell -Command "${psCommand}"`, {
      windowsHide: true,
      timeout: 5000
    });
    console.log(`[EXECUTOR:OpenApp] Success via PowerShell: ${command}`);
    return `Launched ${displayName}`;
  } catch (error3) {
    console.warn(`[EXECUTOR:OpenApp] PowerShell failed:`, (error3 as Error).message);
  }
  
  // Method 4: Try searching in common paths
  const commonPaths = [
    `C:\\Program Files\\${command}\\${command}.exe`,
    `C:\\Program Files (x86)\\${command}\\${command}.exe`,
    `C:\\Windows\\System32\\${command}.exe`,
    `C:\\Windows\\${command}.exe`,
  ];
  
  for (const tryPath of commonPaths) {
    try {
      await execAsync(`cmd /c start "" "${tryPath}" ${args}`, {
        windowsHide: true,
        timeout: 5000
      });
      console.log(`[EXECUTOR:OpenApp] Success via path: ${tryPath}`);
      return `Launched ${displayName}`;
    } catch {
      // Continue trying
    }
  }
  
  // Method 5: Try Windows search (slower but comprehensive)
  try {
    // Use Windows search to find the app
    const searchCmd = `powershell -Command "Get-Command ${command} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source"`;
    const { stdout } = await execAsync(searchCmd, { timeout: 3000 });
    const foundPath = stdout.trim();
    
    if (foundPath) {
      await execAsync(`cmd /c start "" "${foundPath}" ${args}`, {
        windowsHide: true,
        timeout: 5000
      });
      console.log(`[EXECUTOR:OpenApp] Success via Windows search: ${foundPath}`);
      return `Launched ${displayName}`;
    }
  } catch (error5) {
    console.warn(`[EXECUTOR:OpenApp] Windows search failed:`, (error5 as Error).message);
  }
  
  throw new Error(`Could not find or launch "${displayName}". Make sure it's installed.`);
}

/**
 * Check if string is a URL
 */
function isURL(str: string): boolean {
  return str.startsWith("http://") || 
         str.startsWith("https://") || 
         str.includes("youtube.com") || 
         str.includes("youtu.be") ||
         str.includes("://") ||
         str.includes("www.");
}

/**
 * Check if string is a file path
 */
function isFilePath(str: string): boolean {
  return str.includes(":\\") || 
         str.startsWith("\\\\") || 
         str.endsWith(".exe") ||
         str.endsWith(".msi") ||
         str.endsWith(".bat") ||
         str.endsWith(".cmd");
}

/**
 * Open a URL in default browser
 */
async function openURL(url: string, args: string): Promise<string> {
  console.log(`[EXECUTOR:OpenApp] Opening URL: ${url}`);
  
  // Add https:// if missing
  if (!url.startsWith("http://") && !url.startsWith("https://") && !url.includes("://")) {
    url = "https://" + url;
  }
  
  // Add timestamp for YouTube if provided in args
  if (args && (url.includes("youtube.com") || url.includes("youtu.be"))) {
    const separator = url.includes("?") ? "&" : "?";
    url = `${url}${separator}t=${args}`;
  }
  
  try {
    await execAsync(`cmd /c start "" "${url}"`, {
      windowsHide: true,
      timeout: 5000
    });
    console.log(`[EXECUTOR:OpenApp] URL opened: ${url}`);
    return `Opened ${url}`;
  } catch (error) {
    throw new Error(`Failed to open URL: ${(error as Error).message}`);
  }
}

/**
 * Open a file path
 */
async function openFilePath(filePath: string): Promise<string> {
  console.log(`[EXECUTOR:OpenApp] Opening file: ${filePath}`);
  
  try {
    await execAsync(`cmd /c start "" "${filePath}"`, {
      windowsHide: true,
      timeout: 5000
    });
    console.log(`[EXECUTOR:OpenApp] File opened: ${filePath}`);
    return `Opened ${filePath}`;
  } catch (error) {
    throw new Error(`Failed to open file: ${(error as Error).message}`);
  }
}

/**
 * Open a URL with optional timestamp (YouTube support)
 */
export async function executeOpenUrl(url: string, timestamp?: string): Promise<string> {
  return await openURL(url, timestamp || "");
}
