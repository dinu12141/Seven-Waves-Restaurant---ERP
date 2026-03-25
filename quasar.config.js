// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from '#q-app/wrappers'
import { fileURLToPath } from 'node:url'

export default defineConfig((ctx) => {
  return {
    // https://v2.quasar.dev/quasar-cli-vite/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://v2.quasar.dev/quasar-cli-vite/boot-files
    boot: ['i18n', 'axios', 'supabase', 'auth', 'error-handler'],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#css
    css: ['app.scss'],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
      // Inter is loaded via erp-theme.scss from Google Fonts
      'material-icons', // material icons from Quasar extras
    ],

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#build
    build: {
      target: {
        browser: ['es2022', 'firefox115', 'chrome115', 'safari14'],
        node: 'node20',
      },

      vueRouterMode: 'history', // 'history' for clean URLs — required for QR code /c/TOKEN links
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

      // ── Force CJS output for the electron main process ──────────
      // Electron crashes (0xC0000005 Access Violation) when loading
      // an ESM main process from inside an ASAR package. Compiling
      // to CJS (.cjs) avoids this bug.
      extendElectronMainConf(esbuildConf) {
        esbuildConf.format = 'cjs'
        // 'node' platform tells esbuild not to mangle __dirname / __filename
        // and to treat Node built-ins as external — required for CJS output.
        esbuildConf.platform = 'node'
        esbuildConf.outfile = esbuildConf.outfile.replace(/\.js$/, '.cjs')
      },

      // ── Fix package.json main entry & strip "type":"module" ─────
      // Quasar hardcodes main: './electron-main.js'. We override it
      // to the .cjs file compiled above and remove "type":"module"
      // so Node does not treat CJS files as ESM.
      extendPackageJson(pkg) {
        pkg.main = './electron-main.cjs'
        delete pkg.type
      },

      builder: {
        appId: 'com.sevenwaves.erp',
        productName: 'Seven Waves ERP',
        copyright: 'Copyright © 2026 Cosmo Solutions',
        forceCodeSigning: false,

        // Only include the files the production app actually needs.
        // node_modules are NOT needed — Vite already bundled
        // everything into assets/.
        files: ['**/*', '!node_modules/**'],

        // ASAR disabled — Electron 41 crashes (0xC0000005 Access Violation)
        // when loading a CJS main process from inside an ASAR archive on Windows.
        // The UnPackaged app works perfectly; packaging without ASAR fixes it.
        asar: false,

        win: {
          target: [{ target: 'nsis', arch: ['x64'] }],
          icon: 'src-electron/icons/icon.ico',
          // Prevent pe-library from modifying the .exe binary.
          // On some Windows builds the modification corrupts the
          // PE headers causing 0xC0000005 Access Violation.
          signAndEditExecutable: false,
        },

        nsis: {
          oneClick: false,
          allowToChangeInstallationDirectory: true,
          createDesktopShortcut: true,
          createStartMenuShortcut: true,
          artifactName: 'Seven_Waves_ERP_Setup.exe',
        },
      },
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-browser-extensions/configuring-bex
    bex: {
      extraScripts: [],
    },
  }
})
