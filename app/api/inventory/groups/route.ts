import { lookupRoutes } from '@/lib/crud'

// Grupos / classificação do inventário (taxonomia ITAM). Gestão só admin (via factory);
// leitura liberada a qualquer usuário autenticado para popular os selects do cadastro.
export const { GET, POST, PATCH, DELETE } = lookupRoutes('asset_groups', false, ['kind', 'sort'])
