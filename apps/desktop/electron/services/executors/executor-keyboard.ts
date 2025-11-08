/**
 * Keyboard Executors - SIMPLIFIED VERSION
 * Type and Shortcut operations
 */

import { exec } from "child_process";
import { promisify } from "util";

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
 */
export async function executeType(step: TypeStep): Promise<string> {
  console.log(`[EXECUTOR:Type] "${step.text}"`);
  
  try {
    // PowerShell SendKeys - simple and reliable
    const escapedText = step.text.replace(/"/g, '""');
    const ps = `(New-Object -ComObject WScript.Shell).SendKeys("${escapedText}")`;
    
    await execAsync(`powershell -Command "${ps}"`, {
      timeout: 5000,
      windowsHide: true
    });
    
    return `Typed: ${step.text.substring(0, 50)}${step.text.length > 50 ? '...' : ''}`;
  } catch (error: any) {
    throw new Error(`Failed to type: ${error.message}`);
  }
}

/**
 * Execute Shortcut command - SIMPLE
 */
export async function executeShortcut(step: ShortcutStep): Promise<string> {
  const keysString = step.keys.join("+");
  console.log(`[EXECUTOR:Shortcut] ${keysString}`);
  
  try {
    // Convert to SendKeys format
    const sendKeysFormat = convertToSendKeys(step.keys);
    const ps = `(New-Object -ComObject WScript.Shell).SendKeys("${sendKeysFormat}")`;
    
    await execAsync(`powershell -Command "${ps}"`, {
      timeout: 3000,
      windowsHide: true
    });
    
    return `Pressed: ${keysString}`;
  } catch (error: any) {
    throw new Error(`Failed to press ${keysString}: ${error.message}`);
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
