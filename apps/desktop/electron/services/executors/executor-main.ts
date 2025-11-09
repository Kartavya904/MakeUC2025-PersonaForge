/**
 * Main Executor - WITH AGENT SYSTEM
 * Parallel execution where possible
 */

import { TaskPlan, TaskStep } from "../nlp-gemini";
import { executeOpenApp, OpenAppStep } from "./executor-openapp";
import { executeSystemSetting, SystemSettingStep } from "./executor-system";
import { executeType, executeShortcut, TypeStep, ShortcutStep } from "./executor-keyboard";
import { executeMessage, MessageStep } from "./executor-message";
import { checkTaskSafety, validateStep } from "./executor-safety";
import { createExecutionPlan, executeWithAgents } from "./executor-agent";

export interface ExecutionResult {
  success: boolean;
  completedSteps: number;
  totalSteps: number;
  results: string[];
  warnings?: string[];
  error?: string;
}

/**
 * Execute plan with smart agents
 */
export async function executePlan(plan: TaskPlan): Promise<ExecutionResult> {
  console.log(`[EXECUTOR] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[EXECUTOR] Task: ${plan.task}`);
  console.log(`[EXECUTOR] Steps: ${plan.steps.length}`);
  
  try {
    // Safety check
    const safety = checkTaskSafety(plan);
    if (safety.warnings.length > 0) {
      console.warn(`[EXECUTOR] Warnings:`, safety.warnings);
    }
    
    // Validate steps
    for (const step of plan.steps) {
      const valid = validateStep(step);
      if (!valid.valid) throw new Error(valid.error);
    }
    
    // Create execution plan
    const tasks = createExecutionPlan(plan.steps);
    const parallel = tasks.filter(t => t.canRunInParallel).length;
    
    if (parallel > 1) {
      console.log(`[EXECUTOR] ⚡ ${parallel} tasks can run in parallel`);
    }
    
    console.log(`[EXECUTOR] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    // Execute with agents
    const agentResults = await executeWithAgents(tasks, executeStep);
    
    // Build results
    const results: string[] = [];
    let completedSteps = 0;
    
    for (const r of agentResults) {
      if (r.success) {
        results.push(`✓ ${r.result}`);
        completedSteps++;
      } else {
        results.push(`✗ ${r.error}`);
      }
    }
    
    console.log(`[EXECUTOR] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[EXECUTOR] ✅ Done: ${completedSteps}/${plan.steps.length}`);
    console.log(`[EXECUTOR] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    return {
      success: completedSteps === plan.steps.length,
      completedSteps,
      totalSteps: plan.steps.length,
      results,
      warnings: safety.warnings
    };
    
  } catch (error: any) {
    console.error(`[EXECUTOR] ❌ Failed:`, error.message);
    
    return {
      success: false,
      completedSteps: 0,
      totalSteps: plan.steps.length,
      results: [`✗ ${error.message}`],
      error: error.message
    };
  }
}

/**
 * Execute single step - router
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
      const text = (step as any).text || "Confirmed";
      return text;
    }
    
    case "Navigate":
    case "Click":
      return `${step.op} - not yet implemented`;
    
    default:
      throw new Error(`Unknown operation: ${(step as any).op}`);
  }
}
