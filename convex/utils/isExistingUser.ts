import { type QueryCtx } from "../_generated/server";

export async function isExistingUser(ctx: QueryCtx, email: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

  return user;
}
