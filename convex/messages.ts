import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    clientUUID: v.string(),
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
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .filter((q) => q.eq(q.field("clientUUID"), args.clientUUID))
      .first();

    if (existing) {
      const updates: {
        content: string;
        model?: string;
        provider?: string;
        previousVersions?: string[];
      } = {
        content: args.content,
        model: args.model,
        provider: args.provider,
      };
      if (args.role === "assistant" && existing.content !== args.content) {
        updates.previousVersions = [
          ...(existing.previousVersions ?? []),
          existing.content,
        ];
      }
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      clientUUID: args.clientUUID,
      role: args.role,
      content: args.content,
      model: args.model,
      provider: args.provider,
      createdAt: Date.now(),
    });

    return messageId;
  },
});

export const getMessagesByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .collect();

    return messages.sort((a, b) => a.createdAt - b.createdAt);
  },
});
