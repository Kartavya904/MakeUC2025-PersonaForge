/**
 * SystemSetting Executor
 * Controls brightness, volume, and other system settings
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
    
    switch (category) {
      case "display":
        return await handleDisplaySetting(setting, value);
      
      case "audio":
        return await handleAudioSetting(setting, value);
      
      case "system":
        return await handleSystemSetting(setting, value);
      
      default:
        throw new Error(`Unknown setting category: ${category}`);
    }
  } catch (error: any) {
    console.error(`[EXECUTOR:System] Error:`, error.message);
    throw new Error(`Failed to change ${target}: ${error.message}`);
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
      
      // PowerShell command to set brightness
      const ps = `
        $brightness = ${brightness}
        (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, $brightness)
      `;
      
      try {
        await execAsync(`powershell -Command "${ps.replace(/\n/g, " ")}"`);
        return `Set brightness to ${brightness}%`;
      } catch (error) {
        // Fallback: Try using NirCmd or other methods
        throw new Error("Brightness control not supported on this device");
      }
    }
    
    default:
      throw new Error(`Unknown display setting: ${setting}`);
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
      
      // PowerShell script to set volume using audio API
      const ps = `
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int NotImpl1(); int NotImpl2();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
}
[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int NotImpl1();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref System.Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
}
public class Audio {
  public static void SetVolume(float level) {
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
      `.trim();
      
      try {
        await execAsync(`powershell -ExecutionPolicy Bypass -Command "${ps.replace(/\n/g, " ").replace(/"/g, '\\"')}"`, {
          timeout: 10000,
          windowsHide: true
        });
        return `Set volume to ${volume}%`;
      } catch (error: any) {
        // Simple fallback: use sound settings shortcut
        console.warn("[executor-system] Advanced volume control failed, using basic method");
        throw new Error(`Volume control not available: ${error.message}`);
      }
    }
    
    case "mute": {
      const shouldMute = value.toLowerCase() === "true" || value === "1";
      
      // Send mute/unmute key via PowerShell
      const ps = `(New-Object -ComObject WScript.Shell).SendKeys([char]173)`;
      
      try {
        await execAsync(`powershell -Command "${ps}"`, { windowsHide: true });
        return shouldMute ? "Toggled mute" : "Toggled mute";
      } catch (error: any) {
        throw new Error(`Failed to toggle mute: ${error.message}`);
      }
    }
    
    default:
      throw new Error(`Unknown audio setting: ${setting}`);
  }
}

/**
 * Handle system settings (power, network, etc.)
 */
async function handleSystemSetting(setting: string, value: string): Promise<string> {
  switch (setting) {
    case "nightlight": {
      const enabled = value.toLowerCase() === "true" || value === "1";
      const ps = `
        $path = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\DefaultAccount\\Current\\default$windows.data.bluelightreduction.bluelightreductionstate\\windows.data.bluelightreduction.bluelightreductionstate"
        Set-ItemProperty -Path $path -Name "Data" -Value ${enabled ? "1" : "0"}
      `;
      
      await execAsync(`powershell -Command "${ps.replace(/\n/g, " ")}"`);
      return enabled ? "Enabled Night Light" : "Disabled Night Light";
    }
    
    default:
      throw new Error(`Unknown system setting: ${setting}`);
  }
}

