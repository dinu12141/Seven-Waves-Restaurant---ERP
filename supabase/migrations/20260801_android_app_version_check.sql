-- ============================================================================
-- Migration: Android app version-check table
-- ============================================================================
-- PROBLEM:
--   The Android app is a Capacitor-wrapped APK (src-capacitor/) that is NOT
--   distributed via Google Play Store — it's built and shared manually
--   (release.keystore exists, but no Play Console/fastlane wiring). It ships
--   a frozen bundle (capacitor.config.json has no server.url), so unlike the
--   PWA it gets no service-worker-based update detection and no Play Store
--   "update available" prompt. There was no way for the app to know a newer
--   build exists.
--
-- FIX:
--   A single-row, publicly-readable table holding the latest published
--   Android version + a download link. The app checks this on launch (see
--   src/composables/useAppUpdateCheck.js) and prompts the user to update if
--   the installed versionCode (from @capacitor/app's App.getInfo(), compared
--   against android/app/build.gradle's versionCode) is behind.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_release_info (
  id             TEXT PRIMARY KEY DEFAULT 'android',
  latest_version TEXT NOT NULL,
  latest_build   INTEGER NOT NULL,
  download_url   TEXT NOT NULL,
  release_notes  TEXT,
  is_mandatory   BOOLEAN NOT NULL DEFAULT false,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the current baseline so the table isn't empty (matches
-- src-capacitor/android/app/build.gradle's versionCode 1 / versionName "1.0").
-- Update this row (or just latest_build/latest_version/download_url) every
-- time a new APK is built and shared.
INSERT INTO public.app_release_info (id, latest_version, latest_build, download_url, release_notes)
VALUES ('android', '1.0', 1, 'https://sevenwaves.lk/downloads/seven-waves-latest.apk', 'Initial release')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_release_info ENABLE ROW LEVEL SECURITY;

-- Readable by anyone (even logged-out) — the app checks this before/without
-- requiring a session, and it contains no sensitive data.
DROP POLICY IF EXISTS app_release_info_read ON public.app_release_info;
CREATE POLICY app_release_info_read ON public.app_release_info
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS app_release_info_admin ON public.app_release_info;
CREATE POLICY app_release_info_admin ON public.app_release_info
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.app_release_info TO anon, authenticated;
