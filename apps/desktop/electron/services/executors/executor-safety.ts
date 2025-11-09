/**
 * Safety Layer for Executor System
 * Validates and assesses risk of operations before execution
 */

// Accept TaskPlan/TaskStep from either security.ts or nlp-gemini.ts (they're compatible)
import type { TaskPlan as SecurityTaskPlan, TaskStep as SecurityTaskStep } from "../security.js";
import type { TaskPlan as GeminiTaskPlan, TaskStep as GeminiTaskStep } from "../nlp-gemini.js";
type TaskPlan = SecurityTaskPlan | GeminiTaskPlan;
type TaskStep = SecurityTaskStep | GeminiTaskStep;

export interface SafetyCheckResult {
  safe: boolean;
  risk: "low" | "medium" | "high";
  warnings: string[];
  requiresConfirmation: boolean;
}

/**
 * Check if a task plan is safe to execute
 */
export function checkTaskSafety(plan: TaskPlan): SafetyCheckResult {
  const warnings: string[] = [];
  let highestRisk: "low" | "medium" | "high" = "low";
  let requiresConfirmation = false;
  
  // Check each step
  for (const step of plan.steps) {
    const stepCheck = checkStepSafety(step);
    
    if (stepCheck.risk === "high") {
      highestRisk = "high";
      requiresConfirmation = true;
    } else if (stepCheck.risk === "medium" && highestRisk === "low") {
      highestRisk = "medium";
    }
    
    warnings.push(...stepCheck.warnings);
  }
  
  // Override risk if plan itself is marked high
  if (plan.risk === "high") {
    highestRisk = "high";
    requiresConfirmation = true;
  }
  
  return {
    safe: highestRisk !== "high" || requiresConfirmation,
    risk: highestRisk,
    warnings,
    requiresConfirmation
  };
}

/**
 * Check safety of individual step
 */
function checkStepSafety(step: TaskStep): SafetyCheckResult {
  const warnings: string[] = [];
  let risk: "low" | "medium" | "high" = "low";
  
  switch (step.op) {
    case "OpenApp":
      // Check for suspicious apps or URLs
      const app = (step.app || "").toLowerCase();
      
      if (app.includes("regedit") || app.includes("registry")) {
        warnings.push("⚠️ Opening Registry Editor can be dangerous");
        risk = "high";
      } else if (app.includes("cmd") || app.includes("powershell") || app.includes("terminal")) {
        warnings.push("⚠️ Opening command-line tools");
        risk = "medium";
      } else if (app.includes("taskmgr") || app.includes("services")) {
        warnings.push("⚠️ Opening system management tools");
        risk = "medium";
      } else if (isURL(app)) {
        // Check for suspicious URLs
        if (!app.includes("http://localhost") && !isTrustedDomain(app)) {
          warnings.push(`ℹ️ Opening external URL: ${app}`);
          risk = "low";
        }
      }
      break;
    
    case "SystemSetting":
      warnings.push(`ℹ️ Changing system setting: ${step.target}`);
      risk = "medium";
      break;
    
    case "Type":
      const text = step.text || "";
      if (text.length > 500) {
        warnings.push("⚠️ Typing long text (>500 chars)");
        risk = "medium";
      }
      break;
    
    case "Shortcut":
      const keys = step.keys || [];
      // Check for dangerous shortcuts
      if (keys.some(k => k.toLowerCase() === "delete" || k.toLowerCase() === "del")) {
        warnings.push("⚠️ Using Delete key shortcut");
        risk = "medium";
      }
      if (keys.includes("Alt") && keys.includes("F4")) {
        warnings.push("ℹ️ Alt+F4 will close active window");
        risk = "low";
      }
      break;
    
    case "Message":
      warnings.push(`⚠️ Sending message to: ${step.target}`);
      risk = "high"; // Always require confirmation for messages
      break;
    
    case "Navigate":
    case "Click":
      warnings.push("ℹ️ UI automation (Navigate/Click) is experimental");
      risk = "medium";
      break;
    
    case "Wait":
    case "Confirm":
      // These are always safe
      risk = "low";
      break;
    
    default:
      warnings.push(`⚠️ Unknown operation: ${(step as any).op}`);
      risk = "high";
  }
  
  return {
    safe: risk !== "high",
    risk,
    warnings,
    requiresConfirmation: risk === "high"
  };
}

/**
 * Check if string is a URL
 */
function isURL(str: string): boolean {
  return str.startsWith("http://") || 
         str.startsWith("https://") || 
         str.includes("://") ||
         str.includes("www.");
}

/**
 * Check if URL is from a trusted domain
 */
function isTrustedDomain(url: string): boolean {
  const trustedDomains = [
    "google.com",
    "youtube.com",
    "microsoft.com",
    "github.com",
    "stackoverflow.com",
    "wikipedia.org",
    "reddit.com",
    "twitter.com",
    "linkedin.com",
    "amazon.com"
  ];
  
  return trustedDomains.some(domain => url.includes(domain));
}

/**
 * Sanitize user input to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
  // Remove potentially dangerous characters for command execution
  return input
    .replace(/[;&|<>$`\\]/g, '') // Remove shell metacharacters
    .replace(/\.\./g, '') // Remove directory traversal
    .trim();
}

/**
 * Validate step parameters
 */
export function validateStep(step: TaskStep): { valid: boolean; error?: string } {
  switch (step.op) {
    case "OpenApp":
      if (!step.app || step.app.trim() === "") {
        return { valid: false, error: "OpenApp requires 'app' parameter" };
      }
      break;
    
    case "SystemSetting":
      if (!step.target || !step.value) {
        return { valid: false, error: "SystemSetting requires 'target' and 'value' parameters" };
      }
      // Validate format
      if (!step.target.includes(".")) {
        return { valid: false, error: "SystemSetting target must be in format 'category.setting'" };
      }
      break;
    
    case "Type":
      if (!step.text) {
        return { valid: false, error: "Type requires 'text' parameter" };
      }
      break;
    
    case "Shortcut":
      if (!step.keys || !Array.isArray(step.keys) || step.keys.length === 0) {
        return { valid: false, error: "Shortcut requires 'keys' array parameter" };
      }
      break;
    
    case "Message":
      if (!step.target || !step.text) {
        return { valid: false, error: "Message requires 'target' and 'text' parameters" };
      }
      break;
    
    case "Wait":
      if (step.value) {
        const ms = parseInt(step.value);
        if (isNaN(ms) || ms < 0 || ms > 30000) {
          return { valid: false, error: "Wait value must be between 0 and 30000ms" };
        }
      }
      break;
  }
  
  return { valid: true };
}

