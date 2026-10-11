import { lookupRoutes } from '@/lib/crud'
export const { GET, POST, PATCH, DELETE } = lookupRoutes('categories', true, ['cost_class', 'grupo_id'])
