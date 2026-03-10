/**
 * Trigger Evaluation Service - Phase 2 P1.4
 * 
 * Evaluates proactive trigger conditions against session state and intent scores.
 * Manages cooldown periods to prevent message spam.
 * Handles message template variable substitution.
 * 
 * Pipeline:
 * 1. Load all active ProactiveTriggers for shop
 * 2. For each trigger, evaluate conditions against session state + intent scores
 * 3. Check cooldown (was this trigger fired recently for this session?)
 * 4. Substitute template variables (product names, cart value, etc.)
 * 5. Return recommendation: SEND, WAIT_COOLDOWN, CONDITION_NOT_MET, SKIP
 */

import prisma from "../db.server";
import { EventTrackingService } from "./event-tracking.server";
import { IntentDetectionEngine } from "./intent-detection.server";

export interface ProactiveTriggerConfig {
  id: string;
  shopId: string;
  name: string;
  description: string;
  enabled: boolean;
  triggerType: string; // EXIT_INTENT, DWELL_TIME, CART_ABANDONMENT, PRICE_SENSITIVITY
  conditions: Record<string, any>; // JSON conditions
  messageTemplate: string;
  priority: number;
  cooldownMs: number;
  targetLocale?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TriggerEvaluationResult {
  triggerId: string;
  triggerName: string;
  decision: "SEND" | "WAIT_COOLDOWN" | "CONDITION_NOT_MET" | "SKIP";
  reason: string;
  message?: string; // Rendered message if SEND
  score?: number; // Confidence score for ranking
  metadata?: Record<string, any>;
}

export interface EvaluationContext {
  shopId: string;
  sessionId: string;
  visitorId?: string;
  intents?: any; // IntentScore
  stats?: any; // SessionStats
  patterns?: any; // SessionPatterns
  lastEvaluation?: Date;
}

interface CooldownRecord {
  triggerId: string;
  sessionId: string;
  lastFiredAt: Date;
  messageId?: string;
}

export class TriggerEvaluationService {
  private static cooldowns = new Map<string, CooldownRecord>();

  /**
   * Evaluate all active triggers for a session
   * Returns recommendations ranked by priority
   */
  static async evaluateSessionTriggers(
    shopId: string,
    sessionId: string,
    visitorId?: string
  ): Promise<TriggerEvaluationResult[]> {
    // Load all active triggers for this shop
    const triggers = await this.getActiveTriggers(shopId);
    if (triggers.length === 0) return [];

    // Get session context
    const stats = await EventTrackingService.getSessionStats(sessionId);
    const patterns = await EventTrackingService.detectSessionPatterns(sessionId);
    const { analysis } = await IntentDetectionEngine.analyzeAndRecord(
      shopId,
      sessionId,
      visitorId
    );

    const context: EvaluationContext = {
      shopId,
      sessionId,
      visitorId,
      intents: analysis.scores,
      stats,
      patterns,
    };

    // Evaluate each trigger
    const results: TriggerEvaluationResult[] = [];
    for (const trigger of triggers) {
      try {
        const result = await this.evaluateTrigger(trigger, context);
        results.push(result);
      } catch (error) {
        console.error(`[Trigger Eval] Failed to evaluate trigger ${trigger.id}:`, error);
      }
    }

    // Sort by priority (higher = more important) and decision
    results.sort((a, b) => {
      // SEND results first
      if (a.decision === "SEND" && b.decision !== "SEND") return -1;
      if (b.decision === "SEND" && a.decision !== "SEND") return 1;

      // Then by priority within same decision
      const triggerA = triggers.find((t) => t.id === a.triggerId);
      const triggerB = triggers.find((t) => t.id === b.triggerId);
      if (triggerA && triggerB) {
        return (triggerB.priority || 0) - (triggerA.priority || 0);
      }

      return 0;
    });

    return results;
  }

  /**
   * Evaluate a single trigger against session context
   */
  private static async evaluateTrigger(
    trigger: ProactiveTriggerConfig,
    context: EvaluationContext
  ): Promise<TriggerEvaluationResult> {
    // Check if within cooldown
    const cooldownCheck = this.checkCooldown(trigger.id, context.sessionId, trigger.cooldownMs);
    if (!cooldownCheck.allowed) {
      return {
        triggerId: trigger.id,
        triggerName: trigger.name,
        decision: "WAIT_COOLDOWN",
        reason: `Cooldown active, will retry in ${cooldownCheck.retryInMs}ms`,
      };
    }

    // Evaluate conditions
    const conditionsMet = this.evaluateConditions(
      trigger.conditions,
      context.intents || {},
      context.stats || {},
      context.patterns || {}
    );

    if (!conditionsMet) {
      return {
        triggerId: trigger.id,
        triggerName: trigger.name,
        decision: "CONDITION_NOT_MET",
        reason: "Trigger conditions not met",
      };
    }

    // Calculate confidence score
    const score = this.calculateTriggerScore(trigger, context);
    if (score < 0.3) {
      return {
        triggerId: trigger.id,
        triggerName: trigger.name,
        decision: "SKIP",
        reason: `Low confidence score: ${score.toFixed(2)}`,
        score,
      };
    }

    // Render message with variable substitution
    const message = await this.renderMessage(trigger.messageTemplate, context);

    return {
      triggerId: trigger.id,
      triggerName: trigger.name,
      decision: "SEND",
      reason: "All conditions met, ready to send",
      message,
      score,
      metadata: {
        conditions: trigger.conditions,
        priority: trigger.priority,
        cooldownMs: trigger.cooldownMs,
      },
    };
  }

  /**
   * Evaluate conditions (recursive for AND/OR logic)
   */
  private static evaluateConditions(
    conditions: Record<string, any>,
    intents: any,
    stats: any,
    patterns: any
  ): boolean {
    if (!conditions) return true;

    // Handle compound conditions (AND, OR)
    if (conditions.type === "AND") {
      return (conditions.conditions || []).every((cond: any) =>
        this.evaluateConditions(cond, intents, stats, patterns)
      );
    }

    if (conditions.type === "OR") {
      return (conditions.conditions || []).some((cond: any) =>
        this.evaluateConditions(cond, intents, stats, patterns)
      );
    }

    if (conditions.type === "NOT") {
      return !this.evaluateConditions(conditions.condition, intents, stats, patterns);
    }

    // Handle simple field conditions: { field, operator, value }
    const { field, operator, value } = conditions;

    // Get field value from context
    let fieldValue: any;
    if (field.startsWith("intent.")) {
      fieldValue = intents[field.substring(7)];
    } else if (field.startsWith("stat.")) {
      fieldValue = stats[field.substring(5)];
    } else if (field.startsWith("pattern.")) {
      fieldValue = patterns[field.substring(8)];
    } else {
      fieldValue = (intents || stats || patterns)[field];
    }

    // Evaluate operator
    return this.compareValues(fieldValue, operator, value);
  }

  /**
   * Compare two values with an operator
   */
  private static compareValues(fieldValue: any, operator: string, value: any): boolean {
    switch (operator) {
      case ">":
        return fieldValue > value;
      case ">=":
        return fieldValue >= value;
      case "<":
        return fieldValue < value;
      case "<=":
        return fieldValue <= value;
      case "==":
      case "=":
        return fieldValue === value;
      case "!=":
      case "<>":
        return fieldValue !== value;
      case "in":
        return Array.isArray(value) && value.includes(fieldValue);
      case "not_in":
        return !Array.isArray(value) || !value.includes(fieldValue);
      case "contains":
        return String(fieldValue).includes(String(value));
      case "starts_with":
        return String(fieldValue).startsWith(String(value));
      case "ends_with":
        return String(fieldValue).endsWith(String(value));
      case "is_true":
        return fieldValue === true;
      case "is_false":
        return fieldValue === false;
      default:
        return false;
    }
  }

  /**
   * Calculate confidence score for trigger
   * Based on how strongly conditions are met
   */
  private static calculateTriggerScore(
    trigger: ProactiveTriggerConfig,
    context: EvaluationContext
  ): number {
    // Extract key intents
    const {
      purchaseIntent = 0,
      abandonmentRisk = 0,
      needsHelp = 0,
      priceShopperRisk = 0,
    } = context.intents || {};

    let score = 0;

    // Trigger-type-specific scoring
    switch (trigger.triggerType) {
      case "EXIT_INTENT":
        // High score if abandonment risk is high
        score = abandonmentRisk;
        break;

      case "DWELL_TIME":
        // High score with high engagement and purchase intent
        score = (purchaseIntent + (context.patterns?.isEngaged ? 0.3 : 0)) / 1.3;
        break;

      case "CART_ABANDONMENT":
        // High score with abandoned cart + high cart value
        score =
          (context.patterns?.hasAbandonedCart ? 1.0 : 0) *
          Math.min(1.0, (context.stats?.estimatedCartValue || 0) / 100);
        break;

      case "PRICE_SENSITIVITY":
        // High score with price shopper pattern
        score = priceShopperRisk;
        break;

      case "NEEDS_HELP":
        // High score if customer appears stuck
        score = needsHelp;
        break;

      case "HIGH_INTENT":
        // High score with purchase intent
        score = purchaseIntent;
        break;

      default:
        // Default: average of relevant intents
        score = (purchaseIntent + abandonmentRisk + needsHelp + priceShopperRisk) / 4;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Render message template with variable substitution
   * Template syntax: {{variable_name}}
   */
  private static async renderMessage(
    template: string,
    context: EvaluationContext
  ): Promise<string> {
    let message = template;

    // Replace intent variables
    if (context.intents) {
      message = message.replace(/{{intent\.(\w+)}}/g, (match, key) => {
        const value = context.intents[key];
        return typeof value === "number" ? (value * 100).toFixed(0) + "%" : String(value || "");
      });
    }

    // Replace stat variables
    if (context.stats) {
      message = message.replace(/{{stat\.(\w+)}}/g, (match, key) => {
        const value = context.stats[key];
        if (key === "estimatedCartValue" && typeof value === "number") {
          return "$" + value.toFixed(2);
        }
        return String(value || "");
      });
    }

    // Replace pattern variables
    if (context.patterns) {
      message = message.replace(/{{pattern\.(\w+)}}/g, (match, key) => {
        const value = context.patterns[key];
        return value ? "true" : "false";
      });
    }

    // Replace common variables
    message = message.replace(/{{sessionId}}/g, context.sessionId);
    if (context.visitorId) {
      message = message.replace(/{{visitorId}}/g, context.visitorId);
    }

    // Default cleanup: remove unreplaced variables
    message = message.replace(/{{[^}]+}}/g, "");

    return message;
  }

  /**
   * Check if trigger is within cooldown period
   */
  private static checkCooldown(
    triggerId: string,
    sessionId: string,
    cooldownMs: number
  ): { allowed: boolean; retryInMs: number } {
    const key = `${triggerId}:${sessionId}`;
    const record = this.cooldowns.get(key);

    if (!record) {
      // First time firing this trigger for this session
      return { allowed: true, retryInMs: 0 };
    }

    const timeSinceLastFire = Date.now() - record.lastFiredAt.getTime();
    if (timeSinceLastFire >= cooldownMs) {
      // Cooldown expired
      return { allowed: true, retryInMs: 0 };
    }

    // Still in cooldown
    return {
      allowed: false,
      retryInMs: cooldownMs - timeSinceLastFire,
    };
  }

  /**
   * Record that a trigger was fired and started cooldown
   */
  static recordTriggerFire(
    triggerId: string,
    sessionId: string,
    messageId?: string
  ): void {
    const key = `${triggerId}:${sessionId}`;
    this.cooldowns.set(key, {
      triggerId,
      sessionId,
      lastFiredAt: new Date(),
      messageId,
    });

    // For production, also persist to database for cross-process cooldown
    // await prisma.triggerCooldown.upsert(...)
  }

  /**
   * Reset cooldown for a trigger/session pair
   */
  static resetCooldown(triggerId: string, sessionId: string): void {
    const key = `${triggerId}:${sessionId}`;
    this.cooldowns.delete(key);
  }

  /**
   * Get all active triggers for a shop
   */
  private static async getActiveTriggers(shopId: string): Promise<ProactiveTriggerConfig[]> {
    const triggers = await prisma.proactiveTrigger.findMany({
      where: {
        shopId,
        enabled: true,
      },
      orderBy: { priority: "desc" },
    });

    return triggers as ProactiveTriggerConfig[];
  }

  /**
   * Get a specific trigger configuration
   */
  static async getTrigger(triggerId: string): Promise<ProactiveTriggerConfig | null> {
    const trigger = await prisma.proactiveTrigger.findUnique({
      where: { id: triggerId },
    });

    return trigger as ProactiveTriggerConfig | null;
  }

  /**
   * Create a new trigger
   */
  static async createTrigger(
    shopId: string,
    data: {
      name: string;
      description?: string;
      triggerType: string;
      conditions: Record<string, any>;
      messageTemplate: string;
      priority?: number;
      cooldownMs?: number;
      targetLocale?: string;
    }
  ): Promise<ProactiveTriggerConfig> {
    const trigger = await prisma.proactiveTrigger.create({
      data: {
        shopId,
        ...data,
        enabled: true,
        priority: data.priority || 10,
        cooldownMs: data.cooldownMs || 300000, // 5 minutes default
      },
    });

    return trigger as ProactiveTriggerConfig;
  }

  /**
   * Update a trigger
   */
  static async updateTrigger(
    triggerId: string,
    data: Partial<{
      name: string;
      description: string;
      enabled: boolean;
      conditions: Record<string, any>;
      messageTemplate: string;
      priority: number;
      cooldownMs: number;
      targetLocale: string | null;
    }>
  ): Promise<ProactiveTriggerConfig> {
    const trigger = await prisma.proactiveTrigger.update({
      where: { id: triggerId },
      data,
    });

    return trigger as ProactiveTriggerConfig;
  }

  /**
   * Delete a trigger
   */
  static async deleteTrigger(triggerId: string): Promise<void> {
    await prisma.proactiveTrigger.delete({
      where: { id: triggerId },
    });

    // Clean up cooldowns for this trigger (optional)
    for (const key of this.cooldowns.keys()) {
      if (key.startsWith(triggerId + ":")) {
        this.cooldowns.delete(key);
      }
    }
  }

  /**
   * Batch evaluate triggers for multiple sessions
   * Useful for background processing
   */
  static async evaluateMultipleSessions(
    shopId: string,
    sessionIds: string[]
  ): Promise<Map<string, TriggerEvaluationResult[]>> {
    const results = new Map<string, TriggerEvaluationResult[]>();

    for (const sessionId of sessionIds) {
      try {
        const evals = await this.evaluateSessionTriggers(shopId, sessionId);
        results.set(sessionId, evals);
      } catch (error) {
        console.error(`[Trigger Eval] Failed to evaluate session ${sessionId}:`, error);
        results.set(sessionId, []);
      }
    }

    return results;
  }

  /**
   * Test trigger condition evaluation with mock context
   * Useful for trigger configuration validation
   */
  static testConditions(
    conditions: Record<string, any>,
    mockIntents: Record<string, number>,
    mockStats: Record<string, any>,
    mockPatterns: Record<string, boolean>
  ): boolean {
    return this.evaluateConditions(conditions, mockIntents, mockStats, mockPatterns);
  }

  /**
   * Test message rendering with mock context
   */
  static async testMessageRendering(
    template: string,
    mockContext: Partial<EvaluationContext>
  ): Promise<string> {
    const fullContext: EvaluationContext = {
      shopId: mockContext.shopId || "test-shop",
      sessionId: mockContext.sessionId || "test-session",
      visitorId: mockContext.visitorId,
      intents: mockContext.intents || {},
      stats: mockContext.stats || {},
      patterns: mockContext.patterns || {},
    };

    return this.renderMessage(template, fullContext);
  }
}
