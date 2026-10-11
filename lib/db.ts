import { Pool } from 'pg'

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5433'),
  database: process.env.DB_NAME     || 'itcost',
  user:     process.env.DB_USER     || 'itcost_app',
  password: process.env.DB_PASSWORD || 'itcost123',
  max: 10,
  idleTimeoutMillis: 30000,
})

export default pool
