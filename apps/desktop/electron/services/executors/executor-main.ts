/**
 * Main Executor Service
 * Coordinates all executors and executes task plans
 */

import { TaskPlan, TaskStep } from "../nlp-gemini";
import { executeOpenApp, executeOpenUrl, OpenAppStep } from "./executor-openapp";
import { executeSystemSetting, SystemSettingStep } from "./executor-system";
import { executeType, executeShortcut, TypeStep, ShortcutStep } from "./executor-keyboard";
import { executeMessage, MessageStep } from "./executor-message";

export interface ExecutionResult {
  success: boolean;
  completedSteps: number;
  totalSteps: number;
  results: string[];
  error?: string;
}

/**
 * Execute a complete task plan
 */
export async function executePlan(plan: TaskPlan): Promise<ExecutionResult> {
  console.log(`[EXECUTOR] Starting execution of: ${plan.task}`);
  console.log(`[EXECUTOR] Risk level: ${plan.risk}`);
  console.log(`[EXECUTOR] Steps: ${plan.steps.length}`);
  
  const results: string[] = [];
  let completedSteps = 0;
  
  try {
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      console.log(`[EXECUTOR] Step ${i + 1}/${plan.steps.length}: ${step.op}`);
      
      try {
        const result = await executeStep(step);
        results.push(`✓ ${result}`);
        completedSteps++;
        console.log(`[EXECUTOR] Step ${i + 1} complete: ${result}`);
      } catch (error: any) {
        const errorMsg = `✗ Step ${i + 1} failed: ${error.message}`;
        results.push(errorMsg);
        console.error(`[EXECUTOR] Step ${i + 1} error:`, error.message);
        
        // Continue with remaining steps (don't abort entire plan)
        // unless it's a critical error
        if (error.message.includes("critical")) {
          throw error;
        }
      }
    }
    
    console.log(`[EXECUTOR] Plan execution complete: ${completedSteps}/${plan.steps.length} steps`);
    
    return {
      success: completedSteps === plan.steps.length,
      completedSteps,
      totalSteps: plan.steps.length,
      results,
    };
  } catch (error: any) {
    console.error(`[EXECUTOR] Plan execution failed:`, error.message);
    
    return {
      success: false,
      completedSteps,
      totalSteps: plan.steps.length,
      results,
      error: error.message,
    };
  }
}

/**
 * Execute a single step
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
      await new Promise(resolve => setTimeout(resolve, ms));
      return `Waited ${ms}ms`;
    }
    
    case "Confirm": {
      // Just log confirmation message
      const text = (step as any).text || "Confirm action";
      console.log(`[EXECUTOR:Confirm] ${text}`);
      return text;
    }
    
    case "Navigate":
    case "Click":
      // TODO: Implement UI automation for these
      console.warn(`[EXECUTOR] ${step.op} not yet implemented`);
      return `${step.op} - not yet implemented`;
    
    default:
      throw new Error(`Unknown operation: ${(step as any).op}`);
  }
}

