// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from '#q-app/wrappers'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join as pathJoin } from 'node:path'
import { networkInterfaces } from 'node:os'

function getLocalIP() {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return ''
}

export default defineConfig((ctx) => {
  return {
    // https://v2.quasar.dev/quasar-cli-vite/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://v2.quasar.dev/quasar-cli-vite/boot-files
    boot: ['i18n', 'axios', 'supabase', 'sentry', 'auth', 'core', 'realtime', 'directives', 'tauri-auth'],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#css
    css: ['app.scss'],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
      // Inter is loaded via erp-theme.scss from Google Fonts
      'material-icons', // material icons from Quasar extras
    ],

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#build
    build: {
      env: {
        VITE_LOCAL_IP: getLocalIP()
      },
      target: {
        browser: ['es2022', 'firefox115', 'chrome115', 'safari14'],
        node: 'node20',
      },

      vueRouterMode: (ctx.mode.capacitor || ctx.mode.electron || process.env.TAURI) ? 'hash' : 'history', // hash for Capacitor, Electron & Tauri (file:// / tauri:// can't do history routing); history for web/PWA
      // vueRouterBase,
      // vueDevtools,
      // vueOptionsAPI: false,

      // rebuildCache: true, // rebuilds Vite/linter/etc cache on startup

      // publicPath: '/',
      // analyze: true,
      // env: {},
      // rawDefine: {}
      // ignorePublicFolder: true,
      // minify: false,
      // polyfillModulePreload: true,
      // distDir

      // extendViteConf (viteConf) {},
      // viteVuePluginOptions: {},

      // ── Vite 8 Module Runner guard ──────────────────────────────────
      // Vite 8's Module Runner evaluates boot-file dependency chains
      // server-side (Node) even in SPA mode. Some modules access
      // browser globals (window, navigator, localStorage) at module
      // scope. Disable the module runner transform to prevent
      // "ReferenceError: window is not defined" crashes during dev.
      extendViteConf(viteConf) {
        viteConf.server = viteConf.server || {}
        // Disable Vite's module runner transform (server-side module evaluation)
        viteConf.server.preTransformRequests = false

        // ── Step 07: Production Bundle Optimization ──────────────────
        viteConf.build = viteConf.build || {}
        viteConf.build.chunkSizeWarningLimit = 800 // KB
        viteConf.build.rollupOptions = {
          output: {
            manualChunks(id) {
              // Vendor splitting — keep framework separate
              if (id.includes('node_modules')) {
                if (id.includes('@supabase')) return 'vendor-supabase'
                if (id.includes('vue') || id.includes('pinia') || id.includes('vue-router')) return 'vendor-vue'
                if (id.includes('quasar')) return 'vendor-quasar'
                if (id.includes('chart') || id.includes('apexcharts')) return 'vendor-charts'
                if (id.includes('jspdf') || id.includes('pdfmake') || id.includes('html2canvas')) return 'vendor-pdf'
                if (id.includes('xlsx') || id.includes('exceljs')) return 'vendor-excel'
                // @google/generative-ai intentionally omitted here — let Vite bundle it
                // into the AI module's natural lazy chunk (loaded only on AI routes)
                if (id.includes('axios')) return 'vendor-http'
                if (id.includes('lodash')) return 'vendor-utils'
                return 'vendor'
              }
              // Module splitting — lazy load heavy modules
              if (id.includes('/modules/finance/')) return 'mod-finance'
              // /modules/ai/ intentionally omitted — Vite's natural dynamic-import
              // splitting already makes AI pages lazy (router uses () => import(...)).
              // Naming it here forced an eager modulepreload in HTML (173KB gz wasted on init).
              if (id.includes('/modules/devices/')) return 'mod-devices'
              if (id.includes('/core/monitoring/')) return 'mod-monitoring'
            },
          },
        }
      },

      vitePlugins: [
        [
          '@intlify/unplugin-vue-i18n/vite',
          {
            // if you want to use Vue I18n Legacy API, you need to set `compositionOnly: false`
            // compositionOnly: false,

            // if you want to use named tokens in your Vue I18n messages, such as 'Hello {name}',
            // you need to set `runtimeOnly: false`
            // runtimeOnly: false,

            ssr: ctx.modeName === 'ssr',

            // you need to set i18n resource including paths !
            include: [fileURLToPath(new URL('./src/i18n', import.meta.url))],
          },
        ],

        [
          'vite-plugin-checker',
          {
            eslint: {
              lintCommand: 'eslint -c ./eslint.config.js "./src*/**/*.{js,mjs,cjs,vue}"',
              useFlatConfig: true,
            },
          },
          { server: false },
        ],
      ],
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#devserver
    devServer: {
      // https: true,
      host: '0.0.0.0', // Listen on all interfaces for LAN access (phone QR scanning)
      port: 9000, // Fixed port — must match VITE_APP_PUBLIC_URL in .env
      open: true, // opens browser window automatically
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#framework
    framework: {
      config: {
        dark: 'auto', // Theme controlled by UIStore — supports dark/light toggle
        brand: {
          primary: '#2563EB',
          secondary: '#94A3B8',
          accent: '#3B82F6',
          dark: '#0F172A',
          positive: '#16A34A',
          negative: '#DC2626',
          info: '#0EA5E9',
          warning: '#F59E0B',
        },
        notify: {
          position: 'top-right',
          timeout: 3000,
          progress: true,
          actions: [{ icon: 'close', color: 'white', round: true }],
        },
        loading: {
          spinnerColor: 'primary',
        },
      },

      iconSet: 'material-icons',

      // Quasar plugins
      plugins: ['Notify', 'Dialog', 'Loading'],
    },

    // animations: 'all', // --- includes all animations
    // https://v2.quasar.dev/options/animations
    animations: [],

    // https://v2.quasar.dev/quasar-cli-vite/developing-ssr/configuring-ssr
    ssr: {
      prodPort: 3000, // The default port that the production server should use
      // (gets superseded if process.env.PORT is specified at runtime)

      middlewares: [
        'render', // keep this as last one
      ],

      pwa: false,
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-pwa/configuring-pwa
    pwa: {
      workboxMode: 'GenerateSW',
      extendGenerateSWOptions(cfg) {
        cfg.skipWaiting = true
        cfg.clientsClaim = true
        cfg.cleanupOutdatedCaches = true
        // JS/CSS bundles are content-hashed and already precached by GenerateSW —
        // a runtime StaleWhileRevalidate rule would race with the precache and serve
        // stale bundles after a deploy, causing 400 errors from outdated API calls.
        cfg.runtimeCaching = [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-assets',
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          // Supabase REST API: network-first, fall back to cache (offline resilience)
          {
            urlPattern: /https:\/\/.*\.supabase\.co\/rest\//i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
            },
          },
        ]
      },
      extendManifestJson(json) {
        json.name = 'Seven Waves Waiter'
        json.short_name = 'Waiter'
        json.description = 'Seven Waves Restaurant — Waiter Station PWA'
        json.display = 'standalone'
        json.orientation = 'portrait'
        json.background_color = '#090c14'
        json.theme_color = '#f97316'
        json.start_url = '/waiter-app'
        json.scope = '/'
        json.categories = ['food', 'productivity']
        json.icons = [
          { src: 'icons/favicon-128x128.png', sizes: '128x128', type: 'image/png' },
          { src: 'icons/favicon-256x256.png', sizes: '256x256', type: 'image/png' },
          {
            src: 'icons/favicon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ]
      },
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-cordova-apps/configuring-cordova
    cordova: {
      // noIosLegacyBuildFlag: true, // uncomment only if you know what you are doing
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor
    capacitor: {
      hideSplashscreen: true,
      // Capacitor CLI preparation — sync Android platform after build
      capacitorCliPreparationParams: ['sync', 'android'],
    },

    // ═══════════════════════════════════════════════════════════════
    //  ELECTRON — Windows Installer (NSIS via electron-builder)
    // ═══════════════════════════════════════════════════════════════
    electron: {
      preloadScripts: ['electron-preload'],
      inspectPort: 5858,

      // Use electron-builder for NSIS installer
      bundler: 'builder',

      packager: {
        icon: 'src-electron/icons/icon',
        name: 'Seven Waves ERP',
        appCopyright: 'Copyright © 2026 Cosmo Solutions',
      },

      // ── Always CJS ─────────────────────────────────────────────────
      // Electron's built-in 'electron' module is CJS-only and does not
      // expose ESM named exports (Node 22+).  `import { app } from 'electron'`
      // fails at runtime.  Using CJS for both dev and prod avoids this.
      //
      // Dev:  Quasar hardcodes the launch path as "electron-main.js".
      //       The root package.json has "type":"module", so a .js file
      //       would be treated as ESM.  We drop a local package.json
      //       with "type":"commonjs" into the dev output dir to override.
      // Prod: CJS output + .cjs extension bypasses "type":"module".
      extendElectronMainConf(esbuildConf) {
        esbuildConf.platform = 'node'
        esbuildConf.format = 'cjs'

        if (ctx.dev) {
          // Write a local package.json so Node treats .js as CJS in dev output
          const outDir = esbuildConf.outfile
            ? esbuildConf.outfile.replace(/[/\\][^/\\]+$/, '')
            : '.quasar/dev-electron'
          mkdirSync(outDir, { recursive: true })
          writeFileSync(
            pathJoin(outDir, 'package.json'),
            '{"type":"commonjs"}\n',
          )
        } else {
          esbuildConf.outfile = esbuildConf.outfile.replace(/\.js$/, '.cjs')
        }
      },

      // ── Fix package.json main entry & strip "type":"module" ─────
      // Quasar hardcodes main: './electron-main.js'. We override it
      // to the .cjs file compiled above and remove "type":"module"
      // so Node does not treat CJS files as ESM.
      //
      // We also strip `dependencies` — Vite already bundled every
      // runtime import into electron-main.cjs / assets/.  Leaving
      // them would cause Quasar to copy a full node_modules tree
      // (100+ packages) into UnPackaged, bloating the installer and
      // potentially including native addons compiled for the wrong
      // Node ABI (→ 0xc000007b crash on end-user machines).
      extendPackageJson(pkg) {
        if (!ctx.dev) {
          pkg.main = './electron-main.cjs'
          delete pkg.type
          // Everything is bundled — no runtime deps needed
          delete pkg.dependencies
          delete pkg.devDependencies
        }
      },

      builder: {
        appId: 'com.sevenwaves.erp',
        productName: 'Seven Waves ERP',
        copyright: 'Copyright © 2026 Cosmo Solutions',
        forceCodeSigning: false,

        // Only include the files the production app actually needs.
        // node_modules are NOT needed — Vite already bundled
        // everything into assets/.  The explicit "!node_modules"
        // is a safety net in case extendPackageJson didn't fully
        // prevent Quasar from copying them.
        files: [
          '**/*',
          '!node_modules/**',
          '!package-lock.json',
        ],

        asar: true,

        win: {
          target: [
            { target: 'nsis', arch: ['x64'] },
            { target: 'portable', arch: ['x64'] },
          ],
          icon: 'src-electron/icons/icon.ico',
          // Do not sign (no EV cert) — also suppresses SmartScreen re-signing
          // that can corrupt the exe on machines without signtool.
          signAndEditExecutable: false,
        },

        nsis: {
          oneClick: false,
          allowToChangeInstallationDirectory: true,
          createDesktopShortcut: true,
          createStartMenuShortcut: true,
          artifactName: 'Seven_Waves_ERP_Setup.exe',
          // Include VC++ Redistributable check — the #1 cause of 0xc000007b
          include: 'src-electron/nsis-include.nsh',
        },
      },
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-browser-extensions/configuring-bex
    bex: {
      extraScripts: [],
    },
  }
})
