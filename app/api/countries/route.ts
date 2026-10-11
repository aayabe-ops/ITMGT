import { hierRoutes } from '@/lib/crud'
export const { GET, POST, PATCH, DELETE } = hierRoutes('countries', 'platform_id', 'platforms')
