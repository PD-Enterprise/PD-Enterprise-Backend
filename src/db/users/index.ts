import { drizzle } from 'drizzle-orm/neon-http';

export const db = drizzle("postgresql://neondb_owner:6HBpU3GFrvwN@ep-broad-surf-a1mc50uh.ap-southeast-1.aws.neon.tech/neondb?sslmode=require");