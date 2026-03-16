import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.heritageofpakistan.app',
  appName: 'Heritage of Pakistan',
  webDir: 'out',

  server: {
    url: 'https://heritageofpakistan.vercel.app',
    cleartext: false,
  },

  ios: {
    contentInset: 'never',
  },

  android: {
    allowMixedContent: true, // allow HTTP in dev (cleartext)
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 5000,
      launchAutoHide: true,
      backgroundColor: '#00b050',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;
