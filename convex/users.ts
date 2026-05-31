import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isExistingUser } from "./utils/isExistingUser";

export const insertNewUser = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    avatarUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const existingUser = await isExistingUser(ctx, args.email);

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

export const getAcademicLevel = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await isExistingUser(ctx, args.email);
    if (!user) {
      return null;
    }

    if (!user.academicLevel) {
      return null;
    }

    const academicLevelDoc = await ctx.db.get(user.academicLevel);
    return academicLevelDoc;
  },
});

export const updateAcademicLevel = mutation({
  args: { email: v.string(), academicLevel: v.number() },
  handler: async (ctx, args) => {
    const user = await isExistingUser(ctx, args.email);
    if (!user) {
      return new Error("User does not exist");
    }

    const academicLevelId = await ctx.db
      .query("academicLevel")
      .withIndex("by_academic_level_index", (q) =>
        q.eq("academicLevelIndex", args.academicLevel),
      )
      .unique();
    if (!academicLevelId) {
      return new Error("Academic level not found");
    }

    try {
      await ctx.db.patch(user._id, {
        academicLevel: academicLevelId._id,
      });
      return await ctx.db.get(user._id);
    } catch (error) {
      return new Error("Failed to update academic level");
    }
  },
});
