<template>
  <q-page class="q-pa-lg qr-page-root">
    <!-- Header -->
    <ERPToolbar
      moduleName="website"
      title="Menu Book QR Standee"
      breadcrumbs="Website / Menu Book QR"
    />

    <div class="max-w-5xl q-mx-auto q-mt-md">
      <!-- Status Banner -->
      <div class="q-mb-md row items-center justify-between q-pa-sm q-px-md rounded-borders bg-dark text-white border-amber">
        <div class="row items-center q-gutter-sm">
          <q-badge color="amber-9" text-color="black" label="2026 EDITION" class="text-weight-bold" />
          <span class="text-body2 text-weight-medium">Official Menu Book (21 Pages) Synced & Active</span>
        </div>
        <div class="row items-center q-gutter-xs">
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            color="amber-4"
            icon="open_in_new"
            label="Open Live Menu"
            :href="menuBookUrl"
            target="_blank"
          />
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            color="grey-4"
            icon="download"
            label="Download PDF"
            href="/menu-book.pdf"
            download="SevenWaves-Menu-Book-2026.pdf"
          />
        </div>
      </div>

      <div class="row q-col-gutter-lg">
        <!-- Configuration & Controls -->
        <div class="col-12 col-md-6">
          <q-card flat bordered class="qr-config-card">
            <q-card-section>
              <div class="text-subtitle1 text-weight-bold row items-center q-mb-xs">
                <q-icon name="tune" color="primary" class="q-mr-sm" size="20px" />
                Standee Configuration
              </div>
              <p class="text-caption text-grey-6">
                This QR code points to your live digital menu book. Print this table standee and place it on your dining tables. Guests scan with any smartphone camera to scroll through all 21 pages.
              </p>

              <!-- Target URL Input -->
              <div class="q-mt-md">
                <div class="text-caption text-weight-bold q-mb-xs">Target Menu Book URL</div>
                <q-input
                  v-model="menuBookUrl"
                  outlined
                  dense
                  placeholder="https://sevenwaves.lk/menu-book"
                  @update:model-value="generateQr"
                >
                  <template #append>
                    <q-btn flat round dense icon="content_copy" @click="copyQrUrl">
                      <q-tooltip>Copy Link</q-tooltip>
                    </q-btn>
                  </template>
                </q-input>
              </div>

              <!-- Action Buttons -->
              <div class="q-mt-lg column q-gutter-sm">
                <q-btn
                  color="amber-9"
                  unelevated
                  no-caps
                  icon="print"
                  label="Print Table Standee"
                  class="full-width text-weight-bold"
                  size="md"
                  @click="printStandee"
                />

                <q-btn
                  color="primary"
                  unelevated
                  no-caps
                  icon="download"
                  label="Download QR (PNG)"
                  class="full-width"
                  @click="downloadQrPng"
                />

                <q-btn
                  flat
                  no-caps
                  color="grey-7"
                  icon="open_in_new"
                  label="Test Open Menu Book"
                  :href="menuBookUrl"
                  target="_blank"
                  class="full-width q-mt-xs"
                />
              </div>

              <!-- Quick details info -->
              <div class="q-mt-md q-pa-sm bg-grey-1 rounded-borders text-caption text-grey-7">
                <div class="text-weight-bold q-mb-xs">📌 Information:</div>
                <div>• Source: SevenWaves New Menu Book A4 2026.pdf</div>
                <div>• Total Pages: 21 Pages (Cover to Back Cover)</div>
                <div>• Viewing Mode: Continuous vertical scroll for mobile & desktop</div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Standee Live Preview -->
        <div class="col-12 col-md-6 flex justify-center items-start">
          <div class="standee-preview-wrap shadow-5">
            <div class="standee-badge">LIVE TABLE STANDEE PREVIEW</div>

            <div class="standee-inner">
              <div class="standee-brand">SEVEN WAVES</div>
              <div class="standee-sub">Restaurant & Lounge</div>

              <div class="standee-chip">
                📱 DINE-IN DIGITAL MENU
              </div>

              <!-- Live QR Canvas -->
              <div class="standee-qr-box">
                <canvas ref="qrCanvasRef" style="display: block; max-width: 100%;"></canvas>
              </div>

              <div class="standee-prompt">Scan with Camera to View Menu Book</div>
              <div class="standee-url">{{ menuBookUrl }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Live Menu Book Inspection Panel for Managers -->
      <div class="q-mt-xl">
        <q-card flat bordered class="qr-config-card">
          <q-card-section class="row items-center justify-between">
            <div class="text-subtitle1 text-weight-bold row items-center">
              <q-icon name="menu_book" color="amber-9" class="q-mr-sm" size="22px" />
              Live Menu Book Preview (All 21 Pages)
            </div>
            <q-btn
              flat
              dense
              no-caps
              :icon="showPages ? 'expand_less' : 'expand_more'"
              :label="showPages ? 'Hide Pages' : 'Inspect Pages'"
              @click="showPages = !showPages"
            />
          </q-card-section>

          <q-slide-transition>
            <div v-show="showPages">
              <q-separator />
              <q-card-section class="q-pa-md">
                <div class="row q-col-gutter-md justify-center">
                  <div
                    v-for="pg in 21"
                    :key="pg"
                    class="col-12 col-sm-6 col-md-4 col-lg-3 text-center"
                  >
                    <q-card flat bordered class="q-pa-xs bg-grey-2">
                      <div class="text-caption text-weight-bold q-py-xs text-grey-8">
                        Page {{ pg }} of 21
                      </div>
                      <img
                        :src="`/menu-book-pages/page-${pg}.webp`"
                        :alt="`Menu Book Page ${pg}`"
                        style="width: 100%; height: auto; border-radius: 8px; display: block;"
                        loading="lazy"
                      />
                    </q-card>
                  </div>
                </div>
              </q-card-section>
            </div>
          </q-slide-transition>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useQuasar } from 'quasar'
import QRCode from 'qrcode'
import ERPToolbar from 'components/erp/ERPToolbar.vue'

// Seven Waves Restaurant ERP — Menu Book QR Standee Generator
const $q = useQuasar()
const menuBookUrl = ref('https://sevenwaves.lk/menu-book')
const qrCanvasRef = ref(null)
const showPages = ref(false)

const generateQr = async () => {
  await nextTick()
  if (!qrCanvasRef.value) return
  try {
    await QRCode.toCanvas(qrCanvasRef.value, menuBookUrl.value, {
      width: 220,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
  } catch (err) {
    console.error('[MenuBookQR] Error generating QR:', err)
  }
}

const downloadQrPng = () => {
  if (!qrCanvasRef.value) return
  const link = document.createElement('a')
  link.download = 'seven-waves-menu-book-qr.png'
  link.href = qrCanvasRef.value.toDataURL('image/png')
  link.click()
  $q.notify({ type: 'positive', message: 'QR Code PNG downloaded!' })
}

const copyQrUrl = () => {
  navigator.clipboard.writeText(menuBookUrl.value)
  $q.notify({ type: 'positive', message: 'Menu Book URL copied to clipboard!' })
}

const printStandee = () => {
  if (!qrCanvasRef.value) return
  const imgData = qrCanvasRef.value.toDataURL('image/png')
  const win = window.open('', '_blank', 'width=600,height=750')
  if (!win) return

  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Seven Waves - Menu Book Standee</title>
        <style>
          @page { size: auto; margin: 15mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: #fff;
          }
          .standee-card {
            width: 320px;
            padding: 32px 24px;
            text-align: center;
            border: 2px solid #0f172a;
            border-radius: 20px;
            box-sizing: border-box;
          }
          .logo-text {
            font-size: 26px;
            font-weight: 900;
            letter-spacing: 2px;
            color: #0f172a;
            margin-bottom: 2px;
          }
          .sub-text {
            font-size: 13px;
            font-weight: 600;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 3px;
            margin-bottom: 20px;
          }
          .qr-img {
            width: 190px;
            height: 190px;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            padding: 10px;
            margin: 0 auto 20px;
          }
          .scan-badge {
            display: inline-block;
            background: #fef3c7;
            color: #92400e;
            font-weight: 700;
            font-size: 13px;
            padding: 6px 16px;
            border-radius: 999px;
            margin-bottom: 14px;
          }
          .prompt {
            font-size: 15px;
            font-weight: 600;
            color: #0f172a;
            margin-bottom: 6px;
          }
          .url-hint {
            font-size: 11px;
            color: #94a3b8;
            word-break: break-all;
          }
        </style>
      </head>
      <body>
        <div class="standee-card">
          <div class="logo-text">SEVEN WAVES</div>
          <div class="sub-text">Restaurant & Lounge</div>
          <div class="scan-badge">📱 DINE-IN DIGITAL MENU</div>
          <div><img src="${imgData}" class="qr-img" /></div>
          <div class="prompt">Scan with Camera to View Menu Book</div>
          <div class="url-hint">${menuBookUrl.value}</div>
        </div>
      </body>
    </html>
  `)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
  }, 350)
}

onMounted(() => {
  generateQr()
})
</script>

<style scoped lang="scss">
.qr-page-root {
  background: var(--erp-bg-page);
  min-height: 100vh;
}

.border-amber {
  border-left: 4px solid #f59e0b;
}

.max-w-5xl {
  max-width: 1080px;
}

.qr-config-card {
  background: var(--erp-bg-card);
  border-radius: 16px;
  border: 1px solid var(--erp-border);
}

.standee-preview-wrap {
  position: relative;
  background: #ffffff;
  color: #0f172a;
  border-radius: 20px;
  border: 2px solid #0f172a;
  width: 320px;
  padding: 32px 20px;
  text-align: center;
  box-sizing: border-box;
}

.standee-badge {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: #0f172a;
  color: #f8fafc;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
  padding: 3px 12px;
  border-radius: 999px;
  white-space: nowrap;
}

.standee-brand {
  font-size: 24px;
  font-weight: 900;
  letter-spacing: 2px;
  color: #0f172a;
  margin-bottom: 2px;
}

.standee-sub {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 16px;
}

.standee-chip {
  display: inline-block;
  background: #fef3c7;
  color: #92400e;
  font-weight: 800;
  font-size: 11px;
  padding: 5px 14px;
  border-radius: 999px;
  margin-bottom: 16px;
}

.standee-qr-box {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 8px;
  display: inline-block;
  margin-bottom: 16px;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
}

.standee-prompt {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 4px;
}

.standee-url {
  font-size: 10px;
  color: #94a3b8;
  word-break: break-all;
}
</style>
