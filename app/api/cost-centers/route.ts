import { hierRoutes } from '@/lib/crud'
export const { GET, POST, PATCH, DELETE } = hierRoutes('cost_centers', 'company_id', 'companies')
