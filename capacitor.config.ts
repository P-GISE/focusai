import type { CapacitorConfig } from '@capacitor/cli'

const hostedUrl = process.env.CAPACITOR_SERVER_URL?.trim()
const androidApiBaseUrl =
  process.env.VITE_ANDROID_API_BASE_URL?.trim() || process.env.VITE_API_BASE_URL?.trim() || ''
const usesCleartextAndroidApi = androidApiBaseUrl.startsWith('http://')

const config: CapacitorConfig = {
  appId: 'kr.ibetter.focusai',
  appName: 'FocusAI',
  webDir: 'dist',
  ...(hostedUrl
    ? {
        server: {
          url: hostedUrl,
          cleartext: false,
        },
      }
    : {
        server: {
          hostname: 'localhost',
          androidScheme: 'https',
        },
      }),
  android: {
    allowMixedContent: usesCleartextAndroidApi,
  },
  plugins: {
    CapacitorCookies: {
      enabled: true,
    },
  },
}

export default config
