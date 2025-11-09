/**
 * Agent System for Parallel Task Execution
 * Smart agents that can run tasks in parallel when safe
 */

import { TaskStep } from "../nlp-gemini";

export interface ExecutionTask {
  step: TaskStep;
  index: number;
  canRunInParallel: boolean;
  dependencies: number[]; // Indices of steps this depends on
}

export interface AgentResult {
  index: number;
  success: boolean;
  result?: string;
  error?: string;
  duration: number;
}

/**
 * Analyze steps and create smart execution plan
 */
export function createExecutionPlan(steps: TaskStep[]): ExecutionTask[] {
  const tasks: ExecutionTask[] = [];
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const dependencies: number[] = [];
    let canRunInParallel = false;
    
    // Determine if this step can run in parallel
    switch (step.op) {
      case "OpenApp":
        // Opening apps can be done in parallel UNLESS there's a Wait before it
        if (i === 0 || steps[i - 1].op !== "Wait") {
          canRunInParallel = true;
        }
        break;
      
      case "SystemSetting":
        // System settings can run in parallel with each other
        canRunInParallel = true;
        break;
      
      case "Wait":
        // Wait must happen after previous step
        if (i > 0) dependencies.push(i - 1);
        break;
      
      case "Type":
      case "Shortcut":
        // Keyboard actions need previous step to complete (window must be focused)
        if (i > 0) dependencies.push(i - 1);
        break;
      
      case "Message":
        // Messages should run sequentially (one at a time)
        if (i > 0) dependencies.push(i - 1);
        break;
      
      default:
        // Unknown ops run sequentially
        if (i > 0) dependencies.push(i - 1);
    }
    
    tasks.push({
      step,
      index: i,
      canRunInParallel,
      dependencies
    });
  }
  
  return tasks;
}

/**
 * Execute tasks with smart agents
 */
export async function executeWithAgents(
  tasks: ExecutionTask[],
  executeFn: (step: TaskStep) => Promise<string>
): Promise<AgentResult[]> {
  const results: AgentResult[] = new Array(tasks.length);
  const completed = new Set<number>();
  
  console.log(`[Agent] 🤖 Starting ${tasks.length} tasks`);
  
  // Group tasks into batches that can run in parallel
  const batches = groupIntoBatches(tasks);
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    if (batch.length === 1) {
      console.log(`[Agent] 📍 Sequential: ${batch[0].step.op}`);
    } else {
      console.log(`[Agent] ⚡ Parallel batch: ${batch.length} tasks`);
    }
    
    // Execute batch in parallel
    const batchPromises = batch.map(async (task) => {
      const startTime = Date.now();
      
      try {
        const result = await executeFn(task.step);
        const duration = Date.now() - startTime;
        
        results[task.index] = {
          index: task.index,
          success: true,
          result,
          duration
        };
        
        completed.add(task.index);
        console.log(`[Agent] ✓ Task ${task.index + 1} done (${duration}ms)`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        
        results[task.index] = {
          index: task.index,
          success: false,
          error: error.message || String(error),
          duration
        };
        
        console.error(`[Agent] ✗ Task ${task.index + 1} failed: ${error.message}`);
      }
    });
    
    // Wait for all tasks in this batch to complete
    await Promise.all(batchPromises);
  }
  
  return results;
}

/**
 * Group tasks into batches that can run in parallel
 */
function groupIntoBatches(tasks: ExecutionTask[]): ExecutionTask[][] {
  const batches: ExecutionTask[][] = [];
  const completed = new Set<number>();
  
  while (completed.size < tasks.length) {
    const currentBatch: ExecutionTask[] = [];
    
    for (const task of tasks) {
      // Skip if already completed
      if (completed.has(task.index)) continue;
      
      // Check if all dependencies are completed
      const dependenciesMet = task.dependencies.every(dep => completed.has(dep));
      
      if (dependenciesMet) {
        currentBatch.push(task);
        completed.add(task.index);
        
        // If this task can't run in parallel, only add it to batch
        // (next tasks will be in next batch)
        if (!task.canRunInParallel) {
          break;
        }
      }
    }
    
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    } else {
      // Circular dependency or impossible to execute
      break;
    }
  }
  
  return batches;
}

