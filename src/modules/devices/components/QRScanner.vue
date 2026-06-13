<template>
  <div class="qr-scanner-container">
    <!-- Camera preview -->
    <div v-if="cameraActive" class="camera-wrapper">
      <video ref="videoRef" autoplay playsinline class="camera-video" />
      <canvas ref="canvasRef" class="camera-canvas" />
      <div class="scan-overlay">
        <div class="scan-frame" />
      </div>
      <q-btn flat round icon="close" color="white" class="close-btn" @click="stopCamera" />
    </div>

    <!-- Controls -->
    <div v-else class="scan-controls">
      <q-btn color="primary" icon="qr_code_scanner" label="Scan QR Code" @click="startCamera" :loading="starting" />
      <div class="text-caption text-grey q-mt-sm">or enter code manually below</div>
      <q-input v-model="manualCode" label="Manual QR / Barcode" outlined dense class="q-mt-sm" @keyup.enter="submitManual">
        <template #append>
          <q-btn flat round icon="check" @click="submitManual" />
        </template>
      </q-input>
    </div>

    <!-- Last scan result -->
    <div v-if="lastResult" class="q-mt-sm q-pa-sm bg-positive text-white rounded-borders">
      <q-icon name="check_circle" class="q-mr-xs" />
      Scanned: {{ lastResult.substring(0, 50) }}{{ lastResult.length > 50 ? '...' : '' }}
    </div>
    <div v-if="error" class="q-mt-sm q-pa-sm bg-negative text-white rounded-borders">
      <q-icon name="error" class="q-mr-xs" />
      {{ error }}
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'

const props = defineProps({
  continuous: { type: Boolean, default: false },
})

const emit = defineEmits(['scan', 'error'])

const videoRef = ref(null)
const canvasRef = ref(null)
const cameraActive = ref(false)
const starting = ref(false)
const manualCode = ref('')
const lastResult = ref(null)
const error = ref(null)

let stream = null
let animationId = null

async function startCamera() {
  starting.value = true
  error.value = null

  try {
    // Prefer back camera on tablets
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    })

    cameraActive.value = true

    // Wait for next tick so refs are available
    await new Promise(r => setTimeout(r, 100))

    if (videoRef.value) {
      videoRef.value.srcObject = stream
      videoRef.value.onloadedmetadata = () => {
        scanLoop()
      }
    }
  } catch (err) {
    error.value = 'Camera access denied or not available'
    emit('error', err.message)
  } finally {
    starting.value = false
  }
}

function scanLoop() {
  if (!cameraActive.value || !videoRef.value || !canvasRef.value) return

  const video = videoRef.value
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')

  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  ctx.drawImage(video, 0, 0)

  // Use BarcodeDetector API if available (Chrome 83+, Android)
  if ('BarcodeDetector' in window) {
    const detector = new BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39'] })
    detector.detect(canvas).then((barcodes) => {
      if (barcodes.length > 0) {
        handleScanResult(barcodes[0].rawValue)
        if (!props.continuous) {
          stopCamera()
          return
        }
      }
    }).catch(() => {})
  }

  animationId = requestAnimationFrame(scanLoop)
}

function handleScanResult(value) {
  if (!value) return
  if (value === lastResult.value) return // Duplicate prevention

  lastResult.value = value
  error.value = null
  emit('scan', value)
}

function stopCamera() {
  cameraActive.value = false
  if (stream) {
    stream.getTracks().forEach(t => t.stop())
    stream = null
  }
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
}

function submitManual() {
  if (manualCode.value.trim()) {
    handleScanResult(manualCode.value.trim())
    manualCode.value = ''
  }
}

onUnmounted(stopCamera)
</script>

<style scoped>
.qr-scanner-container { position: relative; }
.camera-wrapper {
  position: relative;
  width: 100%;
  max-width: 500px;
  border-radius: 12px;
  overflow: hidden;
}
.camera-video {
  width: 100%;
  display: block;
  border-radius: 12px;
}
.camera-canvas { display: none; }
.scan-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.scan-frame {
  width: 200px;
  height: 200px;
  border: 3px solid rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.05); opacity: 1; }
}
.close-btn {
  position: absolute;
  top: 8px;
  right: 8px;
}
</style>
