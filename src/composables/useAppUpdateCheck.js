/**
 * useAppUpdateCheck.js
 *
 * The Android APK (Capacitor, src-capacitor/) is a manually-built, side-loaded
 * app — no Play Store, no service worker, no OTA plugin. It ships a frozen
 * bundle (capacitor.config.json has no server.url), so unlike the PWA it gets
 * no automatic update detection at all. This checks a small public Supabase
 * table (app_release_info) on launch and prompts the user to download a new
 * APK if the installed build is behind. No-op on web/PWA (Capacitor.isNativePlatform()
 * is false there) — that platform is covered separately by the service worker
 * update prompt.
 */
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { supabase } from 'src/boot/supabase'

export async function checkForAppUpdate($q) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return
  }

  try {
    const [{ data: release, error }, info] = await Promise.all([
      supabase
        .from('app_release_info')
        .select('latest_version, latest_build, download_url, release_notes, is_mandatory')
        .eq('id', 'android')
        .single(),
      App.getInfo(),
    ])

    if (error || !release) return

    const installedBuild = parseInt(info.build, 10)
    if (!Number.isFinite(installedBuild) || installedBuild >= release.latest_build) {
      return
    }

    $q.dialog({
      title: 'Update Available',
      message: `Version ${release.latest_version} is available.${
        release.release_notes ? ` ${release.release_notes}` : ''
      }`,
      persistent: release.is_mandatory,
      ok: { label: 'Download Update', color: 'amber-8', textColor: 'dark' },
      cancel: release.is_mandatory ? false : { label: 'Later', flat: true },
    }).onOk(() => {
      window.open(release.download_url, '_system')
    })
  } catch (err) {
    console.warn('[AppUpdateCheck] Could not check for updates:', err.message)
  }
}
