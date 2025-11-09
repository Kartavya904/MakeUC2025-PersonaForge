/**
 * Secure Task Executor
 * Executes task plans with security validation and consent
 * Uses the real executor implementations from executor-main.ts
 */

import { SecurityService, TaskPlan } from "./security.js";
import { SecurityConsentService, ConsentResult } from "./security-consent.js";
import { BrowserWindow } from "electron";
import { executePlan as executePlanWithRealExecutors } from "./executors/executor-main.js";

export interface ExecutionResult {
  success: boolean;
  error?: string;
  executedSteps: number;
}

export class SecureTaskExecutor {
  private securityService: SecurityService;
  private consentService: SecurityConsentService;

  constructor(
    securityService: SecurityService,
    consentService: SecurityConsentService
  ) {
    this.securityService = securityService;
    this.consentService = consentService;
  }

  /**
   * Execute a task plan with security checks
   */
  async executePlan(
    plan: TaskPlan,
    userInput: string,
    window?: BrowserWindow
  ): Promise<ExecutionResult> {
    // Step 1: Validate plan
    const validation = this.securityService.validateTaskPlan(plan, userInput);
    if (!validation.allowed) {
      await this.securityService.logAction(
        userInput,
        plan,
        false,
        false,
        validation.reason
      );
      return {
        success: false,
        error: validation.reason || "Plan validation failed",
        executedSteps: 0,
      };
    }

    // Step 2: Request consent if needed
    let consent: ConsentResult = { approved: true };
    if (validation.requiresApproval || validation.requiresPin) {
      consent = await this.consentService.requestConsent(
        plan,
        userInput,
        window
      );

      if (!consent.approved) {
        await this.securityService.logAction(
          userInput,
          plan,
          false,
          false,
          "User denied consent"
        );
        return {
          success: false,
          error: "User denied consent",
          executedSteps: 0,
        };
      }
    }

    // Step 3: Record action for rate limiting
    this.securityService.recordAction(plan.task);

    // Step 4: Execute steps using the real executor system
    try {
      // Use the real executor system from executor-main.ts
      // This has proper implementations for all operations
      const executionResult = await executePlanWithRealExecutors(plan);

      // Log execution
      await this.securityService.logAction(
        userInput,
        plan,
        true,
        executionResult.success,
        executionResult.error
      );

      return {
        success: executionResult.success,
        error: executionResult.error,
        executedSteps: executionResult.completedSteps,
      };
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      await this.securityService.logAction(
        userInput,
        plan,
        true,
        false,
        errorMsg
      );
      return {
        success: false,
        error: errorMsg,
        executedSteps: 0,
      };
    }
  }
}
