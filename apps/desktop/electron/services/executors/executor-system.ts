/**
 * SystemSetting Executor
 * Controls brightness, volume, and other system settings
 * ROBUST VERSION with multiple fallback methods
 */

import { exec } from "child_process";
import { promisify } from "util";

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
  
  console.log(`[EXECUTOR:System] Setting ${target} to ${value}`);
  
  try {
    // Parse the target (e.g., "display.brightness", "audio.volume")
    const [category, setting] = target.split(".");
    
    if (!category || !setting) {
      throw new Error(`Invalid target format. Use "category.setting" (e.g., "audio.volume")`);
    }
    
    switch (category.toLowerCase()) {
      case "display":
        return await handleDisplaySetting(setting.toLowerCase(), value);
      
      case "audio":
        return await handleAudioSetting(setting.toLowerCase(), value);
      
      case "system":
        return await handleSystemSetting(setting.toLowerCase(), value);
      
      default:
        throw new Error(`Unknown setting category: ${category}. Supported: display, audio, system`);
    }
  } catch (error: any) {
    console.error(`[EXECUTOR:System] Error:`, error.message);
    throw error;
  }
}

/**
 * Handle display settings (brightness, etc.)
 */
async function handleDisplaySetting(setting: string, value: string): Promise<string> {
  switch (setting) {
    case "brightness": {
      const brightness = parseInt(value);
      if (isNaN(brightness) || brightness < 0 || brightness > 100) {
        throw new Error("Brightness must be between 0 and 100");
      }
      
      console.log(`[EXECUTOR:System] Attempting to set brightness to ${brightness}%`);
      
      // Method 1: Try WMI (works on most laptops)
      try {
        const ps1 = `(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, ${brightness})`;
        await execAsync(`powershell -ExecutionPolicy Bypass -Command "${ps1}"`, {
          timeout: 5000,
          windowsHide: true
        });
        console.log(`[EXECUTOR:System] Brightness set via WMI`);
        return `Set brightness to ${brightness}%`;
      } catch (error1) {
        console.warn(`[EXECUTOR:System] WMI method failed:`, (error1 as Error).message);
      }
      
      // Method 2: Try CIM (newer Windows API)
      try {
        const ps2 = `$brightness = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness; (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods).WmiSetBrightness(1, ${brightness})`;
        await execAsync(`powershell -ExecutionPolicy Bypass -Command "${ps2}"`, {
          timeout: 5000,
          windowsHide: true
        });
        console.log(`[EXECUTOR:System] Brightness set via CIM`);
        return `Set brightness to ${brightness}%`;
      } catch (error2) {
        console.warn(`[EXECUTOR:System] CIM method failed:`, (error2 as Error).message);
      }
      
      // Method 3: Open brightness settings as fallback
      try {
        await execAsync(`cmd /c start ms-settings:display`, { windowsHide: true, timeout: 3000 });
        return `Opened brightness settings (automatic control not supported on this device)`;
      } catch (error3) {
        throw new Error(`Brightness control not supported: ${(error3 as Error).message}`);
      }
    }
    
    default:
      throw new Error(`Unknown display setting: ${setting}. Supported: brightness`);
  }
}

/**
 * Handle audio settings (volume, mute, etc.)
 */
async function handleAudioSetting(setting: string, value: string): Promise<string> {
  switch (setting) {
    case "volume": {
      const volume = parseInt(value);
      if (isNaN(volume) || volume < 0 || volume > 100) {
        throw new Error("Volume must be between 0 and 100");
      }
      
      console.log(`[EXECUTOR:System] Attempting to set volume to ${volume}%`);
      
      // Method 1: Use simple PowerShell audio object (most reliable)
      try {
        // Create a temp PS script file to avoid escaping issues
        const scriptPath = require('path').join(process.env.TEMP || 'C:\\Windows\\Temp', 'setvol.ps1');
        const fs = require('fs');
        
        const script = `
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume
{
    int NotImpl1();
    int NotImpl2();
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
}
[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject { }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator
{
    int NotImpl1();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice
{
    int Activate(ref System.Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
}
public class Audio
{
    public static void SetVolume(float level)
    {
        var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
        IMMDevice dev;
        enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
        IAudioEndpointVolume aev;
        var aevGuid = typeof(IAudioEndpointVolume).GUID;
        dev.Activate(ref aevGuid, 0, 0, out aev);
        aev.SetMasterVolumeLevelScalar(level, System.Guid.Empty);
    }
}
'@
[Audio]::SetVolume(${volume / 100.0})
`;
        
        fs.writeFileSync(scriptPath, script, 'utf8');
        
        await execAsync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, {
          timeout: 10000,
          windowsHide: true
        });
        
        // Clean up
        try { fs.unlinkSync(scriptPath); } catch {}
        
        console.log(`[EXECUTOR:System] Volume set via Audio API`);
        return `Set volume to ${volume}%`;
      } catch (error1) {
        console.warn(`[EXECUTOR:System] Audio API method failed:`, (error1 as Error).message);
      }
      
      // Method 2: Use VBScript (very reliable fallback)
      try {
        const vbsPath = require('path').join(process.env.TEMP || 'C:\\Windows\\Temp', 'setvol.vbs');
        const fs = require('fs');
        
        // VBScript to set volume
        const vbScript = `
Set oShell = CreateObject("WScript.Shell")
' Mute first
oShell.SendKeys(Chr(&HAD))
WScript.Sleep 50
' Set to 0
For i = 1 To 50
    oShell.SendKeys(Chr(&HAE))
WScript.Sleep 10
Next
' Set to target volume
For i = 1 To ${Math.round(volume / 2)}
    oShell.SendKeys(Chr(&HAF))
    WScript.Sleep 10
Next
`;
        
        fs.writeFileSync(vbsPath, vbScript, 'utf8');
        
        await execAsync(`cscript //nologo "${vbsPath}"`, {
          timeout: 5000,
          windowsHide: true
        });
        
        // Clean up
        try { fs.unlinkSync(vbsPath); } catch {}
        
        console.log(`[EXECUTOR:System] Volume set via VBScript`);
        return `Set volume to ${volume}%`;
      } catch (error2) {
        console.warn(`[EXECUTOR:System] VBScript method failed:`, (error2 as Error).message);
      }
      
      // Method 3: Open volume mixer as fallback
      try {
        await execAsync(`cmd /c start sndvol.exe`, { windowsHide: true, timeout: 3000 });
        return `Opened volume mixer (automatic control failed, please adjust manually)`;
      } catch (error3) {
        throw new Error(`Volume control not available: ${(error3 as Error).message}`);
      }
    }
    
    case "mute":
    case "unmute": {
      console.log(`[EXECUTOR:System] Toggling mute`);
      
      // Method 1: PowerShell SendKeys for mute toggle
      try {
        const ps = `(New-Object -ComObject WScript.Shell).SendKeys([char]173)`;
        await execAsync(`powershell -Command "${ps}"`, { 
          windowsHide: true, 
          timeout: 2000 
        });
        console.log(`[EXECUTOR:System] Mute toggled via PowerShell`);
        return `Toggled mute`;
      } catch (error1) {
        console.warn(`[EXECUTOR:System] PowerShell mute failed:`, (error1 as Error).message);
      }
      
      // Method 2: VBScript fallback
      try {
        const vbsPath = require('path').join(process.env.TEMP || 'C:\\Windows\\Temp', 'mute.vbs');
        const fs = require('fs');
        const vbScript = `CreateObject("WScript.Shell").SendKeys(Chr(&HAD))`;
        fs.writeFileSync(vbsPath, vbScript, 'utf8');
        
        await execAsync(`cscript //nologo "${vbsPath}"`, {
          timeout: 2000,
          windowsHide: true
        });
        
        try { fs.unlinkSync(vbsPath); } catch {}
        
        console.log(`[EXECUTOR:System] Mute toggled via VBScript`);
        return `Toggled mute`;
      } catch (error2) {
        throw new Error(`Mute control failed: ${(error2 as Error).message}`);
      }
    }
    
    default:
      throw new Error(`Unknown audio setting: ${setting}. Supported: volume, mute, unmute`);
  }
}

/**
 * Handle system settings (power, network, etc.)
 */
async function handleSystemSetting(setting: string, value: string): Promise<string> {
  switch (setting) {
    case "nightlight": {
      const enabled = value.toLowerCase() === "true" || value === "1" || value.toLowerCase() === "on";
      
      // Just open the settings page - registry method is unreliable
      await execAsync(`cmd /c start ms-settings:nightlight`, { windowsHide: true, timeout: 3000 });
      return `Opened Night Light settings`;
    }
    
    case "wifi":
    case "network": {
      await execAsync(`cmd /c start ms-settings:network`, { windowsHide: true, timeout: 3000 });
      return `Opened network settings`;
    }
    
    case "bluetooth": {
      await execAsync(`cmd /c start ms-settings:bluetooth`, { windowsHide: true, timeout: 3000 });
      return `Opened Bluetooth settings`;
    }
    
    default:
      throw new Error(`Unknown system setting: ${setting}. Supported: nightlight, wifi, network, bluetooth`);
  }
}
