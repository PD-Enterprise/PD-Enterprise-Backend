import { drizzle } from 'drizzle-orm/neon-http';

export const notesdb = drizzle("postgresql://Notes_owner:ciPWTfCz0G3w@ep-bold-sunset-a191jth3-pooler.ap-southeast-1.aws.neon.tech/Notes?sslmode=require");