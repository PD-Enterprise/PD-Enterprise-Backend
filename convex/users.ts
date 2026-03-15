import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const insertNewUser = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    avatarUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (existingUser) {
      return existingUser._id;
    }

    const userId = ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      avatarUrl: args.avatarUrl,
      createdAt: Date.now(),
    });
    return userId;
  },
});
