import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.heritageofpakistan.app',
  appName: 'Heritage of Pakistan',
  webDir: 'out',

  server: {
    // During development: point to your local Next.js dev server.
    // Replace the IP below with your machine's local network IP so real
    // devices on the same WiFi can connect.
    // Run `ipconfig` (Windows) to find your IP (e.g. 192.168.1.x)
    //
    // Comment this block out entirely for production (app will use bundled build).
    url: 'http://localhost:3000',
    cleartext: true, // allow HTTP on local network (dev only)
  },

  ios: {
    contentInset: 'always', // respect safe areas (notch, home indicator)
  },

  android: {
    allowMixedContent: true, // allow HTTP in dev (cleartext)
  },
};

export default config;
