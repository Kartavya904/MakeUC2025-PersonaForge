/**
 * Main Executor - WITH AGENT SYSTEM
 * Parallel execution where possible
 */

// Accept TaskPlan from either security.ts or nlp-gemini.ts (they're compatible)
import type { TaskPlan as SecurityTaskPlan, TaskStep as SecurityTaskStep } from "../security.js";
import type { TaskPlan as GeminiTaskPlan, TaskStep as GeminiTaskStep } from "../nlp-gemini.js";
type TaskPlan = SecurityTaskPlan | GeminiTaskPlan;
type TaskStep = SecurityTaskStep | GeminiTaskStep;

import { executeOpenApp, OpenAppStep } from "./executor-openapp.js";
import { executeSystemSetting, SystemSettingStep } from "./executor-system.js";
import { executeType, executeShortcut, TypeStep, ShortcutStep } from "./executor-keyboard.js";
import { executeMessage, MessageStep } from "./executor-message.js";
import { checkTaskSafety, validateStep } from "./executor-safety.js";
import { createExecutionPlan, executeWithAgents } from "./executor-agent.js";

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
    
    case "Shortcut": {
      const shortcutStep = step as ShortcutStep;
      // Check if it's a media control shortcut
      if (shortcutStep.keys && shortcutStep.keys.length === 1) {
        const key = shortcutStep.keys[0].toLowerCase();
        if (["play", "pause", "playpause", "next", "previous", "stop"].includes(key)) {
          const { executeMediaControl } = await import("./executor-keyboard.js");
          return await executeMediaControl(key as any);
        }
      }
      return await executeShortcut(shortcutStep);
    }
    
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
