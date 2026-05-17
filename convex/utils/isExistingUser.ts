export async function isExistingUser(ctx: any, email: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q: any) => q.eq("email", email))
    .unique();

  return user;
}
