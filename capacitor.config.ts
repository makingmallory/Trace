import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.trace.tracker',
  appName: 'Trace',
  webDir: 'dist',
  android: {
    adjustMarginsForEdgeToEdge: 'force',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchFadeOutDuration: 180,
      backgroundColor: '#fffcfe',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'LIGHT',
      backgroundColor: '#fffcfe',
    },
  },
}

export default config
