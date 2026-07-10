import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const createMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
    ),
    content: v.string(),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      model: args.model,
      provider: args.provider,
      createdAt: Date.now(),
    });

    return messageId;
  },
});
