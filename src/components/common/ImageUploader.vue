<template>
  <div class="erp-image-uploader">
    <!-- Image preview -->
    <div
      v-if="modelValue"
      class="erp-image-uploader__preview"
    >
      <q-img
        :src="modelValue"
        :ratio="aspectRatio || undefined"
        class="erp-image-uploader__img"
        spinner-color="primary"
      >
        <template #loading>
          <div class="erp-image-uploader__skeleton erp-skeleton" />
        </template>
      </q-img>

      <!-- Remove overlay -->
      <q-btn
        round
        dense
        unelevated
        icon="close"
        color="negative"
        size="sm"
        class="erp-image-uploader__remove"
        aria-label="Remove image"
        @click="removeImage"
      />
    </div>

    <!-- Upload area (shown when no image) -->
    <div
      v-else
      class="erp-image-uploader__dropzone"
      :class="{ 'erp-image-uploader__dropzone--dragover': isDragOver }"
      @click="openFilePicker"
      @dragover.prevent="isDragOver = true"
      @dragleave.prevent="isDragOver = false"
      @drop.prevent="onDrop"
    >
      <q-icon name="cloud_upload" size="40px" class="erp-image-uploader__upload-icon" />
      <span class="erp-image-uploader__label">{{ label }}</span>
      <span class="erp-image-uploader__hint">PNG, JPG, WebP — max {{ maxSizeKb }} KB</span>
    </div>

    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      class="erp-image-uploader__input"
      @change="onFileChange"
    />

    <!-- Upload progress -->
    <q-linear-progress
      v-if="uploading"
      indeterminate
      color="primary"
      class="erp-image-uploader__progress"
    />

    <!-- Upload button (when image already set — lets user replace it) -->
    <div v-if="modelValue && !uploading" class="erp-image-uploader__replace-row">
      <q-btn
        flat
        dense
        no-caps
        icon="upload"
        label="Replace"
        size="sm"
        color="primary"
        :loading="uploading"
        @click="openFilePicker"
      />
    </div>

    <!-- Error message -->
    <div v-if="errorMsg" class="erp-image-uploader__error">
      <q-icon name="error_outline" size="14px" class="q-mr-xs" />
      {{ errorMsg }}
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import { validateFileSecurity, IMAGE_UPLOAD_OPTIONS } from 'src/utils/security'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  bucket: {
    type: String,
    default: 'erp-assets',
  },
  folder: {
    type: String,
    default: 'uploads',
  },
  maxSizeKb: {
    type: Number,
    default: 200,
  },
  aspectRatio: {
    type: Number,
    default: null,
  },
  label: {
    type: String,
    default: 'Upload Image',
  },
  placeholder: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue'])

const authStore = useAuthStore()
const fileInputRef = ref(null)
const uploading = ref(false)
const errorMsg = ref('')
const isDragOver = ref(false)

// ─── File picker ────────────────────────────────────────────────────────────

function openFilePicker() {
  errorMsg.value = ''
  fileInputRef.value?.click()
}

function onFileChange(event) {
  const file = event.target.files?.[0]
  if (file) {
    const check = validateFileSecurity(file, IMAGE_UPLOAD_OPTIONS)
    if (!check.valid) {
      errorMsg.value = check.error || 'Invalid image file.'
      event.target.value = ''
      return
    }
    processFile(file)
  }
  // Reset so the same file can be re-selected
  event.target.value = ''
}

function onDrop(event) {
  isDragOver.value = false
  const file = event.dataTransfer.files?.[0]
  if (file) {
    const check = validateFileSecurity(file, IMAGE_UPLOAD_OPTIONS)
    if (!check.valid) {
      errorMsg.value = check.error || 'Please drop a valid image file.'
      return
    }
    processFile(file)
  } else {
    errorMsg.value = 'Please drop an image file.'
  }
}

// ─── Image compression → WebP ───────────────────────────────────────────────

async function compressToWebp(file, quality = 0.82) {
  const bitmap = await createImageBitmap(file)

  const MAX_WIDTH = 800
  let { width, height } = bitmap
  if (width > MAX_WIDTH) {
    height = Math.round((height * MAX_WIDTH) / width)
    width = MAX_WIDTH
  }

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return canvas.convertToBlob({ type: 'image/webp', quality })
}

async function getCompressedBlob(file) {
  // Try progressively lower qualities until within size limit
  const maxBytes = props.maxSizeKb * 1024
  for (const quality of [0.82, 0.65, 0.50]) {
    const blob = await compressToWebp(file, quality)
    if (blob.size <= maxBytes || quality === 0.50) return blob
  }
}

// ─── Upload pipeline ─────────────────────────────────────────────────────────

async function processFile(file) {
  const check = validateFileSecurity(file, IMAGE_UPLOAD_OPTIONS)
  if (!check.valid) {
    errorMsg.value = check.error || 'Invalid file.'
    return
  }

  uploading.value = true
  errorMsg.value = ''

  try {
    const blob = await getCompressedBlob(file)

    const companyId = authStore.currentBranch?.company_id || 'shared'
    const path = `${props.folder}/${companyId}/${Date.now()}.webp`

    const { error: uploadError } = await supabase.storage
      .from(props.bucket)
      .upload(path, blob, { contentType: 'image/webp', upsert: true })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from(props.bucket).getPublicUrl(path)
    emit('update:modelValue', data.publicUrl)
  } catch (err) {
    console.error('[ImageUploader] upload failed:', err)
    errorMsg.value = err?.message || 'Upload failed. Please try again.'
  } finally {
    uploading.value = false
  }
}

// ─── Remove ──────────────────────────────────────────────────────────────────

function removeImage() {
  emit('update:modelValue', '')
  errorMsg.value = ''
}
</script>

<style scoped lang="scss">
.erp-image-uploader {
  display: flex;
  flex-direction: column;
  gap: var(--erp-spacing-md);
  width: 100%;
}

/* ── Preview ─────────────────────────────────────────────── */
.erp-image-uploader__preview {
  position: relative;
  border-radius: var(--erp-radius-lg);
  overflow: hidden;
  border: 1px solid var(--erp-border);
  background: var(--erp-bg-input);
}

.erp-image-uploader__img {
  width: 100%;
  max-height: 240px;
  object-fit: cover;
  display: block;
  border-radius: var(--erp-radius-lg);
}

.erp-image-uploader__remove {
  position: absolute;
  top: 8px;
  right: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

/* ── Dropzone ────────────────────────────────────────────── */
.erp-image-uploader__dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--erp-spacing-md);
  padding: var(--erp-spacing-xl) var(--erp-spacing-lg);
  border: 2px dashed var(--erp-border);
  border-radius: var(--erp-radius-lg);
  background: var(--erp-bg-input);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background 0.2s ease;

  &:hover,
  &--dragover {
    border-color: var(--erp-primary);
    background: var(--erp-primary-subtle);
  }
}

.erp-image-uploader__upload-icon {
  color: var(--erp-text-muted);
  opacity: 0.6;
}

.erp-image-uploader__label {
  font-size: var(--erp-font-size-base);
  font-weight: var(--erp-font-weight-medium);
  color: var(--erp-text-primary);
}

.erp-image-uploader__hint {
  font-size: var(--erp-font-size-small);
  color: var(--erp-text-muted);
}

/* ── Hidden file input ───────────────────────────────────── */
.erp-image-uploader__input {
  display: none;
}

/* ── Progress ────────────────────────────────────────────── */
.erp-image-uploader__progress {
  border-radius: var(--erp-radius-pill);
}

/* ── Replace button row ──────────────────────────────────── */
.erp-image-uploader__replace-row {
  display: flex;
  justify-content: flex-end;
}

/* ── Error ───────────────────────────────────────────────── */
.erp-image-uploader__error {
  display: flex;
  align-items: center;
  font-size: var(--erp-font-size-small);
  color: var(--erp-danger);
  padding: var(--erp-spacing-sm) var(--erp-spacing-md);
  background: var(--erp-danger-subtle);
  border: 1px solid rgba(220, 38, 38, 0.2);
  border-radius: var(--erp-radius-md);
}
</style>
