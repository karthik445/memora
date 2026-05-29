import { Pool } from 'pg'

export const db = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://memora_user:memora_password@localhost:5432/memora_db',
})
