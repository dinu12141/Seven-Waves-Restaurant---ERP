; ──────────────────────────────────────────────────────────────────
;  Seven Waves ERP — NSIS include
;  Checks for Visual C++ Redistributable 2015-2022 (x64).
;  Without it Electron cannot start (error 0xc000007b).
; ──────────────────────────────────────────────────────────────────

!macro customInit
  ; Check for vcruntime140.dll in System32 (x64)
  IfFileExists "$SYSDIR\vcruntime140.dll" vcr_found vcr_missing

  vcr_missing:
    MessageBox MB_OK|MB_ICONEXCLAMATION \
      "This application requires the Microsoft Visual C++ Redistributable (x64).$\r$\n$\r$\n\
       Please install it from:$\r$\n\
       https://aka.ms/vs/17/release/vc_redist.x64.exe$\r$\n$\r$\n\
       The installer will now open the download page."
    ExecShell "open" "https://aka.ms/vs/17/release/vc_redist.x64.exe"
    Abort "Visual C++ Redistributable (x64) is required. Please install it and try again."

  vcr_found:
!macroend
