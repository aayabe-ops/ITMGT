import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

export const LOCALES = ['pt', 'es', 'en'] as const
export const DEFAULT_LOCALE = 'pt'

export default getRequestConfig(async () => {
  const cookieLocale = cookies().get('LOCALE')?.value
  const locale = (LOCALES as readonly string[]).includes(cookieLocale || '') ? (cookieLocale as string) : DEFAULT_LOCALE
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
