/**
 * Keyboard Executors
 * Handles Type and Shortcut operations
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Try to load robotjs (optional dependency)
let robot: any = null;
try {
  robot = require("robotjs");
} catch (err) {
  console.warn("[executor-keyboard] robotjs not available, using PowerShell fallback");
}

export interface TypeStep {
  op: "Type";
  text: string;
}

export interface ShortcutStep {
  op: "Shortcut";
  keys: string[];
}

/**
 * Execute Type command (send keystrokes)
 */
export async function executeType(step: TypeStep): Promise<string> {
  console.log(`[EXECUTOR:Type] Typing: ${step.text}`);
  
  try {
    // Use PowerShell SendKeys as primary method
    const escapedText = step.text.replace(/"/g, '""').replace(/\$/g, '`$');
    const ps = `
      $wshell = New-Object -ComObject wscript.shell
      Start-Sleep -Milliseconds 100
      $wshell.SendKeys("${escapedText}")
    `;
    
    await execAsync(`powershell -Command "${ps.replace(/\n/g, " ")}"`);
    
    console.log(`[EXECUTOR:Type] Success`);
    return `Typed: ${step.text}`;
  } catch (error: any) {
    // Fallback: Try robotjs if available
    if (robot) {
      try {
        robot.typeString(step.text);
        return `Typed: ${step.text}`;
      } catch (robotError) {
        console.error(`[EXECUTOR:Type] robotjs error:`, robotError);
      }
    }
    console.error(`[EXECUTOR:Type] Error:`, error.message);
    throw new Error(`Failed to type text: ${error.message}`);
  }
}

/**
 * Execute Shortcut command (keyboard shortcuts)
 */
export async function executeShortcut(step: ShortcutStep): Promise<string> {
  const keysString = step.keys.join("+");
  console.log(`[EXECUTOR:Shortcut] Pressing: ${keysString}`);
  
  try {
    // Convert to PowerShell SendKeys format
    const sendKeysFormat = convertToSendKeys(step.keys);
    
    const ps = `
      $wshell = New-Object -ComObject wscript.shell
      Start-Sleep -Milliseconds 100
      $wshell.SendKeys("${sendKeysFormat}")
    `;
    
    await execAsync(`powershell -Command "${ps.replace(/\n/g, " ")}"`);
    
    console.log(`[EXECUTOR:Shortcut] Success`);
    return `Pressed: ${keysString}`;
  } catch (error: any) {
    // Fallback: Try robotjs if available
    if (robot) {
      try {
        pressKeysRobot(step.keys);
        return `Pressed: ${keysString}`;
      } catch (robotError) {
        console.error(`[EXECUTOR:Shortcut] robotjs error:`, robotError);
      }
    }
    console.error(`[EXECUTOR:Shortcut] Error:`, error.message);
    throw new Error(`Failed to press shortcut: ${error.message}`);
  }
}

/**
 * Convert key names to PowerShell SendKeys format
 */
function convertToSendKeys(keys: string[]): string {
  const sendKeysMap: Record<string, string> = {
    "Ctrl": "^",
    "Control": "^",
    "Alt": "%",
    "Shift": "+",
    "Win": "^{ESC}", // Windows key approximation
    "Windows": "^{ESC}",
    "Enter": "{ENTER}",
    "Return": "{ENTER}",
    "Tab": "{TAB}",
    "Escape": "{ESC}",
    "Esc": "{ESC}",
    "Backspace": "{BS}",
    "Delete": "{DEL}",
    "Home": "{HOME}",
    "End": "{END}",
    "PageUp": "{PGUP}",
    "PageDown": "{PGDN}",
    "Up": "{UP}",
    "Down": "{DOWN}",
    "Left": "{LEFT}",
    "Right": "{RIGHT}",
    "F1": "{F1}", "F2": "{F2}", "F3": "{F3}", "F4": "{F4}",
    "F5": "{F5}", "F6": "{F6}", "F7": "{F7}", "F8": "{F8}",
    "F9": "{F9}", "F10": "{F10}", "F11": "{F11}", "F12": "{F12}",
  };
  
  let result = "";
  let lastKey = "";
  
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const mapped = sendKeysMap[key];
    
    if (mapped) {
      // Modifier keys or special keys
      if (i === keys.length - 1) {
        // Last key
        result += mapped;
      } else {
        // Modifier + other key
        result += mapped;
      }
    } else {
      // Regular character
      result += key.toLowerCase();
    }
    
    lastKey = key;
  }
  
  return result;
}

/**
 * Press keys using robotjs (fallback)
 */
function pressKeysRobot(keys: string[]): void {
  if (!robot) {
    throw new Error("robotjs not available");
  }
  
  const modifiers: string[] = [];
  let mainKey = "";
  
  // Separate modifiers from main key
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (["ctrl", "control", "alt", "shift", "command", "win", "windows"].includes(lower)) {
      modifiers.push(lower === "ctrl" || lower === "control" ? "control" : lower);
    } else {
      mainKey = lower;
    }
  }
  
  // Press modifier keys
  modifiers.forEach(mod => robot.keyToggle(mod, "down"));
  
  // Press main key
  if (mainKey) {
    robot.keyTap(mainKey);
  }
  
  // Release modifiers
  modifiers.forEach(mod => robot.keyToggle(mod, "up"));
}

