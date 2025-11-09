/**
 * Keyboard Executors - SIMPLIFIED VERSION
 * Type and Shortcut operations
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);

export interface TypeStep {
  op: "Type";
  text: string;
}

export interface ShortcutStep {
  op: "Shortcut";
  keys: string[];
}

/**
 * Execute Type command - SIMPLE
 * Uses VBScript for more reliable text input
 */
export async function executeType(step: TypeStep): Promise<string> {
  console.log(`[EXECUTOR:Type] "${step.text}"`);
  
  try {
    // Use VBScript for more reliable text input (handles quotes and special chars better)
    const vbsPath = path.join(os.tmpdir(), 'type.vbs');
    
    // Escape text for VBScript SendKeys
    // In VBScript SendKeys, we need to escape special characters: + ^ % ~ ( ) [ ] { }
    // But we need to do this BEFORE escaping quotes for the VBScript string
    let sendKeysText = step.text
      .replace(/\{/g, '{{}')  // Escape { first (before other replacements)
      .replace(/\}/g, '{}}')  // Escape }
      .replace(/\+/g, '{+}')
      .replace(/\^/g, '{^}')
      .replace(/%/g, '{%}')
      .replace(/~/g, '{~}')
      .replace(/\(/g, '{(}')
      .replace(/\)/g, '{)}')
      .replace(/\[/g, '{[}')
      .replace(/\]/g, '{]}');
    
    // Now escape quotes for VBScript string (double them)
    const escapedForVBScript = sendKeysText.replace(/"/g, '""');
    
    const vbScript = `
Set oShell = CreateObject("WScript.Shell")
oShell.SendKeys "${escapedForVBScript}"
`.trim();
    
    fs.writeFileSync(vbsPath, vbScript, 'utf8');
    
    await execAsync(`cscript //nologo "${vbsPath}"`, {
      timeout: 5000,
      windowsHide: true
    });
    
    try {
      fs.unlinkSync(vbsPath);
    } catch {
      // Ignore cleanup errors
    }
    
    return `Typed: ${step.text.substring(0, 50)}${step.text.length > 50 ? '...' : ''}`;
  } catch (error: any) {
    // Fallback to PowerShell with better escaping
    try {
      // Use single quotes in PowerShell to avoid quote issues
      const escapedForPowerShell = step.text
        .replace(/'/g, "''")  // Escape single quotes for PowerShell
        .replace(/"/g, '`"');  // Escape double quotes for PowerShell
      
      const ps = `(New-Object -ComObject WScript.Shell).SendKeys('${escapedForPowerShell}')`;
      
      await execAsync(`powershell -Command "${ps.replace(/"/g, '\\"')}"`, {
        timeout: 5000,
        windowsHide: true
      });
      
      return `Typed: ${step.text.substring(0, 50)}${step.text.length > 50 ? '...' : ''} (fallback)`;
    } catch (fallbackError: any) {
      throw new Error(`Failed to type: ${fallbackError.message}`);
    }
  }
}

/**
 * Execute Shortcut command - SIMPLE
 * Uses VBScript for more reliable key sending
 */
export async function executeShortcut(step: ShortcutStep): Promise<string> {
  const keysString = step.keys.join("+");
  console.log(`[EXECUTOR:Shortcut] ${keysString}`);
  
  try {
    // Use VBScript for more reliable key sending
    const vbsPath = path.join(os.tmpdir(), 'shortcut.vbs');
    
    // Convert to SendKeys format
    const sendKeysFormat = convertToSendKeys(step.keys);
    
    // Escape for VBScript
    const escapedKeys = sendKeysFormat.replace(/"/g, '""');
    
    const vbScript = `
Set oShell = CreateObject("WScript.Shell")
oShell.SendKeys "${escapedKeys}"
`.trim();
    
    fs.writeFileSync(vbsPath, vbScript, 'utf8');
    
    await execAsync(`cscript //nologo "${vbsPath}"`, {
      timeout: 3000,
      windowsHide: true
    });
    
    try {
      fs.unlinkSync(vbsPath);
    } catch {
      // Ignore cleanup errors
    }
    
    return `Pressed: ${keysString}`;
  } catch (error: any) {
    // Fallback to PowerShell
    try {
      const sendKeysFormat = convertToSendKeys(step.keys);
      const escapedForPowerShell = sendKeysFormat.replace(/'/g, "''");
      const ps = `(New-Object -ComObject WScript.Shell).SendKeys('${escapedForPowerShell}')`;
      
      await execAsync(`powershell -Command "${ps.replace(/"/g, '\\"')}"`, {
        timeout: 3000,
        windowsHide: true
      });
      
      return `Pressed: ${keysString} (fallback)`;
    } catch (fallbackError: any) {
      throw new Error(`Failed to press ${keysString}: ${fallbackError.message}`);
    }
  }
}

/**
 * Convert key names to PowerShell SendKeys format
 */
function convertToSendKeys(keys: string[]): string {
  const map: Record<string, string> = {
    // Modifiers
    "ctrl": "^",
    "control": "^",
    "alt": "%",
    "shift": "+",
    "win": "^{ESC}",
    "windows": "^{ESC}",
    
    // Special keys
    "enter": "{ENTER}",
    "return": "{ENTER}",
    "tab": "{TAB}",
    "escape": "{ESC}",
    "esc": "{ESC}",
    "backspace": "{BS}",
    "delete": "{DEL}",
    "del": "{DEL}",
    "home": "{HOME}",
    "end": "{END}",
    "pageup": "{PGUP}",
    "pagedown": "{PGDN}",
    "up": "{UP}",
    "down": "{DOWN}",
    "left": "{LEFT}",
    "right": "{RIGHT}",
    "space": " ",
    
    // Media keys (using VK codes)
    "playpause": "{MEDIAPLAYPAUSE}",
    "play": "{MEDIAPLAYPAUSE}",
    "pause": "{MEDIAPLAYPAUSE}",
    "next": "{MEDIANEXT}",
    "previous": "{MEDIAPREV}",
    "stop": "{MEDIASTOP}",
    "volumemute": "{VOLUMEMUTE}",
    "volumeup": "{VOLUMEUP}",
    "volumedown": "{VOLUMEDOWN}",
    
    // Function keys
    "f1": "{F1}", "f2": "{F2}", "f3": "{F3}", "f4": "{F4}",
    "f5": "{F5}", "f6": "{F6}", "f7": "{F7}", "f8": "{F8}",
    "f9": "{F9}", "f10": "{F10}", "f11": "{F11}", "f12": "{F12}"
  };
  
  let result = "";
  
  for (const key of keys) {
    const lower = key.toLowerCase();
    const mapped = map[lower];
    
    if (mapped) {
      result += mapped;
    } else {
      // Regular character
      result += key;
    }
  }
  
  return result;
}

/**
 * Execute media control (play/pause/next/previous) - uses Windows media keys
 */
export async function executeMediaControl(action: "play" | "pause" | "playpause" | "next" | "previous" | "stop"): Promise<string> {
  console.log(`[EXECUTOR:Media] ${action}`);
  
  try {
    // Use VBScript to send media keys (more reliable than SendKeys for media)
    const vbsPath = path.join(os.tmpdir(), 'media.vbs');
    
    const mediaKeyMap: Record<string, string> = {
      "play": "&HB3",      // VK_MEDIA_PLAY_PAUSE
      "pause": "&HB3",    // VK_MEDIA_PLAY_PAUSE
      "playpause": "&HB3", // VK_MEDIA_PLAY_PAUSE
      "next": "&HB0",      // VK_MEDIA_NEXT_TRACK
      "previous": "&HB1", // VK_MEDIA_PREV_TRACK
      "stop": "&HB2"      // VK_MEDIA_STOP
    };
    
    const vkCode = mediaKeyMap[action.toLowerCase()] || mediaKeyMap["playpause"];
    
    const vbScript = `
Set oShell = CreateObject("WScript.Shell")
oShell.SendKeys(Chr(${vkCode}))
`.trim();
    
    fs.writeFileSync(vbsPath, vbScript, 'utf8');
    
    await execAsync(`cscript //nologo "${vbsPath}"`, {
      timeout: 2000,
      windowsHide: true
    });
    
    try {
      fs.unlinkSync(vbsPath);
    } catch {
      // Ignore cleanup errors
    }
    
    return `Media ${action} executed`;
  } catch (error: any) {
    // Fallback: try using SendKeys
    try {
      const sendKeysFormat = convertToSendKeys([action]);
      const ps = `(New-Object -ComObject WScript.Shell).SendKeys("${sendKeysFormat}")`;
      await execAsync(`powershell -Command "${ps}"`, {
        timeout: 3000,
        windowsHide: true
      });
      return `Media ${action} executed (fallback)`;
    } catch (fallbackError: any) {
      throw new Error(`Failed to execute media ${action}: ${fallbackError.message}`);
    }
  }
}
