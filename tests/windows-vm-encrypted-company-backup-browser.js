(async () => {
  // Executes inside an installed Tauri WebView2 window, authenticated as a
  // synthetic administrator. Exercises the actual Settings UI backup methods.
  const store = FINORA.Storage;
  const company = await FINORA.Company.current();
  const actor = FINORA.Auth.current();
  if (!company?.id || !actor?.id || !FINORA.Auth.isAdmin()) {
    throw Error('Native company backup test requires an authenticated administrator');
  }
  const contactId = 'vm-only-encrypted-backup-contact';
  const synthetic = 'VM-ONLY encrypted backup test contact';
  await store.put('contacts', {
    id: contactId, companyId: company.id, ownerUserId: actor.id, name: synthetic
  });

  const password = 'VM-ONLY-PASSPHRASE-18-characters';
  const original = {
    prompt: window.prompt, create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
    anchorClick: HTMLAnchorElement.prototype.click,
    timeout: window.setTimeout,
    toastError: FINORA.Toast.error
  };
  const capturedErrors = [];
  FINORA.Toast.error = function (message, ...args) {
    capturedErrors.push(String(message).slice(0, 280));
    return original.toastError.call(this, message, ...args);
  };
  let exportedBlob = null;
  let downloadedName = null;
  const restoreFile = ciphertext => {
    window.SettingsView.openRestoreModal();
    const input = document.getElementById('restoreFile');
    const selector = document.getElementById('restoreMode');
    if (!input || !selector) throw Error('Company restore form not displayed');
    const file = new File([ciphertext], 'synthetic-company.fbackup', {
      type: 'application/octet-stream'
    });
    Object.defineProperty(input, 'files', {
      configurable: true, value: [file]
    });
    selector.value = 'merge';
  };
  try {
    window.prompt = () => password;
    URL.createObjectURL = blob => {
      exportedBlob = blob; return 'blob:vm-only-native-backup';
    };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () {
      downloadedName = this.download;
    };
    // Suppress only the UI's delayed page reload after a successful recovery.
    // This keeps the evaluation context alive for the required assertions.
    window.setTimeout = (fn, delay, ...args) => {
      if (delay === 1500 && String(fn).includes('location.reload')) return 0;
      return original.timeout.call(window, fn, delay, ...args);
    };

    await window.SettingsView.downloadBackup();
    if (!(exportedBlob instanceof Blob)) {
      throw Error('Actual SettingsView.downloadBackup did not create a Blob: ' +
        capturedErrors.join(' | '));
    }
    const encryptedText = await exportedBlob.text();
    const envelope = JSON.parse(encryptedText);
    if (envelope.format !== 'finora-encrypted-backup-v1' ||
        !envelope.salt || !envelope.iv || !envelope.ciphertext ||
        encryptedText.includes(synthetic)) {
      throw Error('Downloaded company backup is not a confidential encrypted envelope');
    }
    if (!String(downloadedName).endsWith('.fbackup')) {
      throw Error('Native Settings UI did not produce a .fbackup filename');
    }

    await store.delete('contacts', contactId);
    if (await store.get('contacts', contactId)) throw Error('Synthetic contact did not get deleted');

    restoreFile(encryptedText);
    window.prompt = () => 'an-intentionally-wrong-password';
    await window.SettingsView.restoreBackup();
    if (await store.get('contacts', contactId)) {
      throw Error('Encrypted company backup accepted an incorrect password');
    }

    // The incorrect-password result MUST produce the real, visible error toast.
    // ToastManager deliberately retains errors until dismissed.
    // Dismiss ONLY the expected toast and modal through their real UI actions.
    // Any unrelated errors remain visible and will fail the navigation sweep.
    const expectedError = 'رمز نادرست است یا فایل پشتیبان آسیب دیده است';
    if (capturedErrors.length !== 1 || !capturedErrors[0].includes(expectedError)) {
      throw Error('Wrong-password restore did not emit exactly the expected error');
    }
    const visibleErrors = [...document.querySelectorAll('.toast-error')];
    if (visibleErrors.length !== 1 || !visibleErrors[0].textContent.includes(expectedError)) {
      throw Error('Expected wrong-password error toast was absent or extra errors were shown');
    }
    const dismiss = visibleErrors[0].querySelector('.toast-close');
    if (!dismiss) throw Error('Expected error toast cannot be dismissed');
    dismiss.click();
    if (document.querySelector('.toast-error')) {
      throw Error('Unexpected error toast survived wrong-password cleanup');
    }
    // A failed restore deliberately keeps its form open for the user to retry.
    // The test must close that form before opening a second restore dialog.
    if (!document.getElementById('restoreFile')) {
      throw Error('Wrong-password recovery unexpectedly closed its dialog');
    }
    FINORA.Modal.close();
    if (document.getElementById('restoreFile')) {
      throw Error('Failed recovery dialog could not be closed');
    }

    // Corrupt the AES-GCM authentication tag of the genuine exported .fbackup.
    // This must fail in the REAL installed Settings UI with no partial writes
    // or false-positive backup_restored audit receipts.
    const auditCountBeforeCorruption = (await store.getAll('audit_events')).length;
    const damagedBytes = Uint8Array.from(atob(envelope.ciphertext), c => c.charCodeAt(0));
    if (damagedBytes.length < 17) throw Error('Encrypted backup test ciphertext too short');
    damagedBytes[damagedBytes.length - 1] ^= 1;
    const damagedCiphertext = btoa(Array.from(damagedBytes,
      byte => String.fromCharCode(byte)).join(''));
    restoreFile(JSON.stringify({ ...envelope, ciphertext: damagedCiphertext }));
    window.prompt = () => password;
    await window.SettingsView.restoreBackup();
    if (await store.get('contacts', contactId)) {
      throw Error('Tampered encrypted backup wrote the deleted synthetic contact');
    }
    if ((await store.getAll('audit_events')).length !== auditCountBeforeCorruption) {
      throw Error('Tampered encrypted backup incorrectly wrote an audit event');
    }
    if (capturedErrors.length !== 2 || !capturedErrors[1].includes(expectedError)) {
      throw Error('Tampered encrypted backup did not show its expected error');
    }
    const damagedToasts = [...document.querySelectorAll('.toast-error')];
    if (damagedToasts.length !== 1 ||
        !damagedToasts[0].textContent.includes(expectedError)) {
      throw Error('Tampered backup failure did not display exactly one error toast');
    }
    const corruptedToastClose = damagedToasts[0].querySelector('.toast-close');
    if (!corruptedToastClose) throw Error('Tampered backup toast missing dismiss action');
    corruptedToastClose.click();
    if (document.querySelector('.toast-error') || !document.getElementById('restoreFile')) {
      throw Error('Tampered backup left an unexpected error or dismissed the recovery form');
    }
    FINORA.Modal.close();
    if (document.getElementById('restoreFile')) {
      throw Error('Tampered backup recovery dialog was not closed');
    }

    restoreFile(encryptedText);
    window.prompt = () => password;
    await window.SettingsView.restoreBackup();
    if (capturedErrors.length !== 2 || document.querySelector('.toast-error') ||
        document.querySelector('.modal-backdrop')) {
      throw Error('Correct-password restore failed or left modal/error state');
    }
    const recovered = await store.get('contacts', contactId);
    if (recovered?.name !== synthetic || recovered.companyId !== company.id) {
      throw Error('Encrypted native company backup did not restore the exact contact');
    }
    const audits = (await store.getAll('audit_events'))
      .filter(e => e.eventType === 'backup_restored' && e.companyId === company.id);
    if (!audits.length) {
      throw Error('Company restore did not create a corresponding audit event');
    }
    return {
      encryptedEnvelope: true,
      filenameSuffix: '.fbackup',
      wrongPasswordRejected: true,
      tamperedCiphertextRejectedWithoutWrites: true,
      sameCompanyRestore: true,
      restoredContact: true,
      restoreAudited: true,
      plaintextSensitiveDataAbsent: true
    };
  } finally {
    window.prompt = original.prompt;
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
    HTMLAnchorElement.prototype.click = original.anchorClick;
    window.setTimeout = original.timeout;
    FINORA.Toast.error = original.toastError;
  }
})()