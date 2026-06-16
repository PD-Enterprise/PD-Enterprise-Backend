import { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { users } from "../../../../drizzle/users/schema";
import { eq } from "drizzle-orm";

export async function getUserRole(
  db: NeonHttpDatabase,
  email: string,
): Promise<string> {
  const role: Record<string, any> = await db
    .select({ role: users.membership })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const roleExists = role.length > 0;

  if (!roleExists) {
    // Update user's role
    try {
      const role: Record<string, any> = await db
        .update(users)
        .set({ membership: "tier-1" })
        .where(eq(users.email, email))
      if (!role) {
        throw new Error("Role not updated");
      }
      return "tier-1";
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  return role[0].role;
}
