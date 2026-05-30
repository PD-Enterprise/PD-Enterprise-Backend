import { academicLevel } from "@/drizzle/cnotes/schema";
import { functionReturn } from "@/utils/functionReturn";
import { eq } from "drizzle-orm";
import { NeonHttpDatabase } from "drizzle-orm/neon-http";

export async function existingAcademicLevel(db: NeonHttpDatabase, academic_level: string) {
    try {
        const academicLevelId = await db
            .select({ id: academicLevel.id })
            .from(academicLevel)
            .where(eq(academicLevel.academicLevel, academic_level))
            .limit(1);
        const levelExists = academicLevelId.length > 0;

        return levelExists ? academicLevelId[0].id : new Error("Invalid academic level");
    } catch (error) {
        return new Error("There was an error getting user from database.");
    }
}