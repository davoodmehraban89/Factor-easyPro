'use strict';
// Trust boundary for installed Windows Tauri: the application UI must be
// served by Tauri's own local origin, never by a remote domain.
function verifyNativeOrigin(href) {
  let url;
  try { url = new URL(href); }
  catch { throw Error('Installed WebView2 did not expose a valid document URL'); }
  const tauriHttp = (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.hostname === 'tauri.localhost' && !url.username && !url.password;
  const tauriScheme = url.protocol === 'tauri:' && url.hostname === 'localhost' &&
    !url.username && !url.password;
  if (!tauriHttp && !tauriScheme) {
    throw Error('Installed WebView2 unexpectedly loaded a non-Tauri application origin');
  }
  return url.origin;
}
module.exports = { verifyNativeOrigin };
