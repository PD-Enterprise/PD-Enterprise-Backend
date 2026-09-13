import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const DAILY_CHAT_LIMIT = 100;

export const getUsage = query({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("llmUsage")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", args.userId).eq("date", args.date),
      )
      .unique();
    return { count: row?.count ?? 0, limit: DAILY_CHAT_LIMIT };
  },
});

/**
 * Refund one unit of daily quota. Call when a reserved unit produced no LLM
 * response (stream failed before completing, title generation fell back to
 * the heuristic, etc.) so quota is only consumed when a response is
 * actually generated. Never drops below zero; missing row is a no-op.
 */
export const refund = mutation({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("llmUsage")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", args.userId).eq("date", args.date),
      )
      .unique();
    if (!row || row.count <= 0) {
      return { count: row?.count ?? 0, limit: DAILY_CHAT_LIMIT };
    }
    const now = Date.now();
    await ctx.db.patch(row._id, { count: row.count - 1, updatedAt: now });
    return { count: row.count - 1, limit: DAILY_CHAT_LIMIT };
  },
});
/**
 * Atomically check the daily quota and increment. Returns allowed=false
 * (without incrementing) when the user is over quota.
 */
export const checkAndIncrement = mutation({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("llmUsage")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", args.userId).eq("date", args.date),
      )
      .unique();
    if (row && row.count >= DAILY_CHAT_LIMIT) {
      return { allowed: false, count: row.count, limit: DAILY_CHAT_LIMIT };
    }
    const now = Date.now();
    if (row) {
      await ctx.db.patch(row._id, { count: row.count + 1, updatedAt: now });
      return { allowed: true, count: row.count + 1, limit: DAILY_CHAT_LIMIT };
    }
    await ctx.db.insert("llmUsage", {
      userId: args.userId,
      date: args.date,
      count: 1,
      updatedAt: now,
    });
    return { allowed: true, count: 1, limit: DAILY_CHAT_LIMIT };
  },
});
