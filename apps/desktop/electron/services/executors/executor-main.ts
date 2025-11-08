/**
 * Main Executor Service
 * Coordinates all executors and executes task plans
 * ROBUST VERSION with safety checks and better error handling
 */

import { TaskPlan, TaskStep } from "../nlp-gemini";
import { executeOpenApp, OpenAppStep } from "./executor-openapp";
import { executeSystemSetting, SystemSettingStep } from "./executor-system";
import { executeType, executeShortcut, TypeStep, ShortcutStep } from "./executor-keyboard";
import { executeMessage, MessageStep } from "./executor-message";
import { checkTaskSafety, validateStep } from "./executor-safety";

export interface ExecutionResult {
  success: boolean;
  completedSteps: number;
  totalSteps: number;
  results: string[];
  warnings?: string[];
  error?: string;
}

/**
 * Execute a complete task plan
 */
export async function executePlan(plan: TaskPlan): Promise<ExecutionResult> {
  console.log(`[EXECUTOR] ═══════════════════════════════════════════`);
  console.log(`[EXECUTOR] Starting execution: ${plan.task}`);
  console.log(`[EXECUTOR] Risk level: ${plan.risk}`);
  console.log(`[EXECUTOR] Total steps: ${plan.steps.length}`);
  console.log(`[EXECUTOR] ═══════════════════════════════════════════`);
  
  const results: string[] = [];
  let completedSteps = 0;
  
  try {
    // 1. Safety check
    const safetyCheck = checkTaskSafety(plan);
    
    if (!safetyCheck.safe) {
      console.error(`[EXECUTOR] Safety check failed!`);
      return {
        success: false,
        completedSteps: 0,
        totalSteps: plan.steps.length,
        results: [`⚠️ Safety check failed`],
        warnings: safetyCheck.warnings,
        error: "Task blocked by safety system"
      };
    }
    
    if (safetyCheck.warnings.length > 0) {
      console.warn(`[EXECUTOR] Safety warnings:`, safetyCheck.warnings);
      results.push(...safetyCheck.warnings.map(w => `⚠️ ${w}`));
    }
    
    // 2. Validate all steps first
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const validation = validateStep(step);
      
      if (!validation.valid) {
        console.error(`[EXECUTOR] Step ${i + 1} validation failed:`, validation.error);
        return {
          success: false,
          completedSteps: 0,
          totalSteps: plan.steps.length,
          results: [`✗ Step ${i + 1} invalid: ${validation.error}`],
          error: validation.error
        };
      }
    }
    
    // 3. Execute steps sequentially
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      
      console.log(`[EXECUTOR] ───────────────────────────────────────`);
      console.log(`[EXECUTOR] Step ${i + 1}/${plan.steps.length}: ${step.op}`);
      console.log(`[EXECUTOR] Details:`, JSON.stringify(step, null, 2));
      
      try {
        const startTime = Date.now();
        const result = await executeStep(step);
        const duration = Date.now() - startTime;
        
        results.push(`✓ Step ${i + 1}: ${result}`);
        completedSteps++;
        
        console.log(`[EXECUTOR] ✓ Step ${i + 1} complete in ${duration}ms: ${result}`);
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        results.push(`✗ Step ${i + 1}: ${errorMsg}`);
        
        console.error(`[EXECUTOR] ✗ Step ${i + 1} FAILED:`, errorMsg);
        console.error(`[EXECUTOR] Error details:`, error);
        
        // Decide whether to continue or abort
        if (shouldAbortOnError(step, error)) {
          console.error(`[EXECUTOR] Aborting execution due to critical error`);
          throw error;
        } else {
          console.warn(`[EXECUTOR] Continuing despite error (non-critical)`);
        }
      }
    }
    
    console.log(`[EXECUTOR] ═══════════════════════════════════════════`);
    console.log(`[EXECUTOR] Execution complete: ${completedSteps}/${plan.steps.length} steps succeeded`);
    console.log(`[EXECUTOR] ═══════════════════════════════════════════`);
    
    return {
      success: completedSteps === plan.steps.length,
      completedSteps,
      totalSteps: plan.steps.length,
      results,
      warnings: safetyCheck.warnings
    };
  } catch (error: any) {
    console.error(`[EXECUTOR] ═══════════════════════════════════════════`);
    console.error(`[EXECUTOR] EXECUTION FAILED:`, error.message);
    console.error(`[EXECUTOR] ═══════════════════════════════════════════`);
    
    return {
      success: false,
      completedSteps,
      totalSteps: plan.steps.length,
      results,
      error: error.message || String(error)
    };
  }
}

/**
 * Execute a single step with robust error handling
 */
async function executeStep(step: TaskStep): Promise<string> {
  switch (step.op) {
    case "OpenApp":
      return await executeOpenApp(step as OpenAppStep);
    
    case "SystemSetting":
      return await executeSystemSetting(step as SystemSettingStep);
    
    case "Type":
      return await executeType(step as TypeStep);
    
    case "Shortcut":
      return await executeShortcut(step as ShortcutStep);
    
    case "Message":
      return await executeMessage(step as MessageStep);
    
    case "Wait": {
      const ms = parseInt((step as any).value || "1000");
      console.log(`[EXECUTOR:Wait] Waiting ${ms}ms...`);
      await new Promise(resolve => setTimeout(resolve, ms));
      return `Waited ${ms}ms`;
    }
    
    case "Confirm": {
      const text = (step as any).text || "Confirm action";
      console.log(`[EXECUTOR:Confirm] ${text}`);
      return text;
    }
    
    case "Navigate":
    case "Click":
      console.warn(`[EXECUTOR] ${step.op} not yet implemented`);
      return `${step.op} - coming soon`;
    
    default:
      throw new Error(`Unknown operation: ${(step as any).op}`);
  }
}

/**
 * Determine if execution should abort on this error
 */
function shouldAbortOnError(step: TaskStep, error: any): boolean {
  const errorMsg = String(error.message || error).toLowerCase();
  
  // Critical errors that should abort
  const criticalKeywords = [
    "critical",
    "fatal",
    "access denied",
    "permission denied",
    "security",
    "blocked"
  ];
  
  if (criticalKeywords.some(keyword => errorMsg.includes(keyword))) {
    return true;
  }
  
  // Message operations should abort on error (don't want to send wrong message)
  if (step.op === "Message") {
    return true;
  }
  
  // Otherwise, continue with remaining steps
  return false;
}
