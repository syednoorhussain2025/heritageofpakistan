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
    contentInset: 'automatic',
    backgroundColor: '#f5f2ef',
    allowsLinkPreview: false,
  },

  android: {
    allowMixedContent: true,
    backgroundColor: '#ffffff',
  },

  plugins: {
    Keyboard: {
      resize: "None" as any,
      style: "dark" as any,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#00c9a7',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_INSIDE',
      splashFullScreen: true,
      splashImmersive: true,
      showSpinner: false,
      fadeInDuration: 300,
      fadeOutDuration: 400,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#00c9a7',
      overlaysWebView: true,
    },
  },
};

export default config;
