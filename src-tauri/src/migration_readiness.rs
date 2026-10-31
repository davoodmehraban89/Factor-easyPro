// A02: Windows readiness diagnosis only. No shell, database connection,
// service start, elevation, installer or financial-data read/write.
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReadiness {
    pub windows_x64: bool,
    pub sql_instance_count: Option<u32>,
    pub localdb_version_count: Option<u32>,
    pub free_gib_at_user_app_data: Option<u64>,
    pub sql_compatibility_verified: bool,
    pub sql_installed_by_app: bool,
    pub backup_restored: bool,
    pub can_import: bool,
}

#[cfg(windows)]
mod win {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;

    type Hkey = *mut c_void;
    const HKLM: Hkey = 0x80000002_u32 as i32 as isize as Hkey;
    const KEY_READ: u32 = 0x20019;
    const KEY_WOW64_64KEY: u32 = 0x0100;
    const ERROR_FILE_NOT_FOUND: i32 = 2;
    const ERROR_PATH_NOT_FOUND: i32 = 3;

    #[link(name = "Advapi32")]
    extern "system" {
        fn RegOpenKeyExW(
            hkey: Hkey, subkey: *const u16, options: u32, sam: u32,
            out: *mut Hkey,
        ) -> i32;
        fn RegQueryInfoKeyW(
            hkey: Hkey, class: *mut u16, class_len: *mut u32,
            reserved: *mut u32, subkey_count: *mut u32,
            max_subkey_len: *mut u32, max_class_len: *mut u32,
            value_count: *mut u32, max_value_name_len: *mut u32,
            max_value_len: *mut u32, security_descriptor: *mut u32,
            last_write_time: *mut c_void,
        ) -> i32;
        fn RegCloseKey(hkey: Hkey) -> i32;
    }

    #[link(name = "Kernel32")]
    extern "system" {
        fn GetDiskFreeSpaceExW(
            directory_name: *const u16, available: *mut u64,
            total: *mut u64, total_free: *mut u64,
        ) -> i32;
    }

    // Registry metadata only; installed instance presence is NOT version compatibility.
    pub fn installed_count(path: &str, count_subkeys: bool) -> Option<u32> {
        let key_wide: Vec<u16> = std::ffi::OsStr::new(path)
            .encode_wide().chain(std::iter::once(0)).collect();
        let mut handle: Hkey = std::ptr::null_mut();
        let code = unsafe {
            RegOpenKeyExW(HKLM, key_wide.as_ptr(), 0,
                KEY_READ | KEY_WOW64_64KEY, &mut handle)
        };
        if code == ERROR_FILE_NOT_FOUND || code == ERROR_PATH_NOT_FOUND {
            return Some(0);
        }
        if code != 0 || handle.is_null() {
            // Access denied or another registry problem must not mean "absent".
            return None;
        }
        let mut subkeys = 0u32;
        let mut values = 0u32;
        let status = unsafe {
            let result = RegQueryInfoKeyW(
                handle, std::ptr::null_mut(), std::ptr::null_mut(),
                std::ptr::null_mut(), &mut subkeys,
                std::ptr::null_mut(), std::ptr::null_mut(), &mut values,
                std::ptr::null_mut(), std::ptr::null_mut(),
                std::ptr::null_mut(), std::ptr::null_mut(),
            );
            RegCloseKey(handle);
            result
        };
        if status != 0 { None }
        else { Some(if count_subkeys { subkeys } else { values }) }
    }

    pub fn free_gib() -> Option<u64> {
        let directory = std::env::var_os("LOCALAPPDATA")?;
        let wide: Vec<u16> = directory.encode_wide()
            .chain(std::iter::once(0)).collect();
        let mut bytes = 0u64;
        if unsafe {
            GetDiskFreeSpaceExW(
                wide.as_ptr(), &mut bytes,
                std::ptr::null_mut(), std::ptr::null_mut()
            )
        } == 0 {
            return None;
        }
        Some(bytes / 1024_u64.pow(3))
    }
}

#[tauri::command]
pub fn migration_system_readiness() -> MigrationReadiness {
    MigrationReadiness {
        windows_x64: cfg!(all(windows, target_pointer_width = "64")),
        #[cfg(windows)]
        sql_instance_count: win::installed_count(
            r"SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL", false,
        ),
        #[cfg(not(windows))]
        sql_instance_count: None,
        #[cfg(windows)]
        localdb_version_count: win::installed_count(
            r"SOFTWARE\Microsoft\Microsoft SQL Server Local DB\Installed Versions",
            true,
        ),
        #[cfg(not(windows))]
        localdb_version_count: None,
        #[cfg(windows)]
        free_gib_at_user_app_data: win::free_gib(),
        #[cfg(not(windows))]
        free_gib_at_user_app_data: None,
        sql_compatibility_verified: false,
        sql_installed_by_app: false,
        backup_restored: false,
        can_import: false,
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn contract_does_not_claim_migration() {
        let report = super::migration_system_readiness();
        assert!(!report.sql_compatibility_verified);
        assert!(!report.sql_installed_by_app);
        assert!(!report.backup_restored);
        assert!(!report.can_import);
    }
}
