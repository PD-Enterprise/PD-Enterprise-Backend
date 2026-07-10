import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const createConversation = mutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    clientUUID: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const conversationId = await ctx.db.insert("conversations", {
      userId: args.userId,
      title: args.title,
      clientUUID: args.clientUUID,
      createdAt: now,
      updatedAt: now,
    });

    return conversationId;
  },
});
