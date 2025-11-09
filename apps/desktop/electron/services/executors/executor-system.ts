/**
 * SystemSetting Executor - SIMPLIFIED VERSION
 * Direct methods with simple fallbacks
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

export interface SystemSettingStep {
  op: "SystemSetting";
  target: string;
  value: string;
}

/**
 * Execute SystemSetting command
 */
export async function executeSystemSetting(step: SystemSettingStep): Promise<string> {
  const { target, value } = step;
  
  console.log(`[EXECUTOR:System] ${target} → ${value}`);
  
  const [category, setting] = target.toLowerCase().split(".");
  
  if (!category || !setting) {
    throw new Error(`Invalid format. Use "audio.volume" or "display.brightness"`);
  }
  
  switch (category) {
    case "audio":
      return await handleAudio(setting, value);
    
    case "display":
      return await handleDisplay(setting, value);
    
    case "system":
      return await handleSystem(setting, value);
    
    default:
      throw new Error(`Unknown category: ${category}`);
  }
}

/**
 * Handle audio settings - SIMPLE APPROACH
 */
async function handleAudio(setting: string, value: string): Promise<string> {
  switch (setting) {
    case "volume": {
      const volume = parseInt(value);
      if (isNaN(volume) || volume < 0 || volume > 100) {
        throw new Error("Volume must be 0-100");
      }
      
      console.log(`[EXECUTOR:System] Setting volume to ${volume}%`);
      
      // Simple VBScript approach - most reliable
      const vbsPath = path.join(os.tmpdir(), 'vol.vbs');
      const vbScript = `
Set oShell = CreateObject("WScript.Shell")
oShell.SendKeys(Chr(&HAD))
WScript.Sleep 100
For i = 1 To 50
  oShell.SendKeys(Chr(&HAE))
Next
For i = 1 To ${Math.round(volume / 2)}
  oShell.SendKeys(Chr(&HAF))
  WScript.Sleep 20
Next
`.trim();
      
      try {
        fs.writeFileSync(vbsPath, vbScript, 'utf8');
        await execAsync(`cscript //nologo "${vbsPath}"`, {
          timeout: 8000,
          windowsHide: true
        });
        fs.unlinkSync(vbsPath);
        return `Volume set to ${volume}%`;
      } catch (error) {
        try { fs.unlinkSync(vbsPath); } catch {}
        // Fallback: open volume mixer
        await execAsync(`cmd /c start sndvol.exe`, { windowsHide: true });
        return `Opened volume mixer (set to ${volume}% manually)`;
      }
    }
    
    case "mute":
    case "unmute": {
      console.log(`[EXECUTOR:System] Toggling mute`);
      
      // Simple VBScript mute toggle
      const vbsPath = path.join(os.tmpdir(), 'mute.vbs');
      const vbScript = `CreateObject("WScript.Shell").SendKeys(Chr(&HAD))`;
      
      try {
        fs.writeFileSync(vbsPath, vbScript, 'utf8');
        await execAsync(`cscript //nologo "${vbsPath}"`, {
          timeout: 2000,
          windowsHide: true
        });
        fs.unlinkSync(vbsPath);
        return `Toggled mute`;
      } catch (error) {
        try { fs.unlinkSync(vbsPath); } catch {}
        throw new Error(`Mute failed: ${(error as Error).message}`);
      }
    }
    
    default:
      throw new Error(`Unknown audio setting: ${setting}`);
  }
}

/**
 * Handle display settings - SIMPLE APPROACH
 */
async function handleDisplay(setting: string, value: string): Promise<string> {
  switch (setting) {
    case "brightness": {
      const brightness = parseInt(value);
      if (isNaN(brightness) || brightness < 0 || brightness > 100) {
        throw new Error("Brightness must be 0-100");
      }
      
      console.log(`[EXECUTOR:System] Setting brightness to ${brightness}%`);
      
      // Try WMI method (works on most laptops)
      try {
        const ps = `(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, ${brightness})`;
        await execAsync(`powershell -Command "${ps}"`, {
          timeout: 5000,
          windowsHide: true
        });
        return `Brightness set to ${brightness}%`;
      } catch (error) {
        // Fallback: open display settings
        await execAsync(`cmd /c start ms-settings:display`, { windowsHide: true });
        return `Opened display settings (set brightness to ${brightness}% manually)`;
      }
    }
    
    default:
      throw new Error(`Unknown display setting: ${setting}`);
  }
}

/**
 * Handle system settings - SIMPLE APPROACH
 */
async function handleSystem(setting: string, value: string): Promise<string> {
  // For most system settings, just open the relevant settings page
  const settingsMap: Record<string, string> = {
    "nightlight": "ms-settings:nightlight",
    "wifi": "ms-settings:network-wifi",
    "network": "ms-settings:network",
    "bluetooth": "ms-settings:bluetooth",
    "notifications": "ms-settings:notifications",
    "focusassist": "ms-settings:quiethours",
    "power": "ms-settings:powersleep",
    "battery": "ms-settings:batterysaver"
  };
  
  const settingsUrl = settingsMap[setting];
  if (settingsUrl) {
    await execAsync(`cmd /c start ${settingsUrl}`, { windowsHide: true });
    return `Opened ${setting} settings`;
  }
  
  throw new Error(`Unknown system setting: ${setting}`);
}
