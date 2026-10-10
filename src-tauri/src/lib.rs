#[cfg(windows)]
#[repr(C)] struct DataBlob { cb_data:u32, pb_data:*mut u8 }
#[cfg(windows)]
#[link(name="Crypt32")] extern "system" { fn CryptProtectData(p:*const DataBlob,d:*const u16,e:*const DataBlob,r:*mut core::ffi::c_void,prompt:*mut core::ffi::c_void,flags:u32,out:*mut DataBlob)->i32; fn CryptUnprotectData(p:*const DataBlob,d:*mut *mut u16,e:*const DataBlob,r:*mut core::ffi::c_void,prompt:*mut core::ffi::c_void,flags:u32,out:*mut DataBlob)->i32; }
#[cfg(windows)]
#[link(name="Kernel32")] extern "system" { fn LocalFree(p:*mut core::ffi::c_void)->*mut core::ffi::c_void; }
fn hex_encode(v:&[u8])->String{v.iter().map(|b|format!("{:02x}",b)).collect()}
fn hex_decode(s:&str)->Result<Vec<u8>,String>{if s.len()%2!=0{return Err("invalid protected data".into())} (0..s.len()).step_by(2).map(|i|u8::from_str_radix(&s[i..i+2],16).map_err(|e|e.to_string())).collect()}
#[tauri::command]
fn protect_local_state(value:String)->Result<String,String>{
 #[cfg(windows)] unsafe{let bytes=value.into_bytes();let input=DataBlob{cb_data:bytes.len() as u32,pb_data:bytes.as_ptr() as *mut u8};let mut out=DataBlob{cb_data:0,pb_data:core::ptr::null_mut()};if CryptProtectData(&input,core::ptr::null(),core::ptr::null(),core::ptr::null_mut(),core::ptr::null_mut(),1,&mut out)==0{return Err("DPAPI protect failed".into())}let data=core::slice::from_raw_parts(out.pb_data,out.cb_data as usize);let result=hex_encode(data);LocalFree(out.pb_data as _);Ok(result)}
 #[cfg(not(windows))]{Ok(hex_encode(value.as_bytes()))}
}
#[tauri::command]
fn unprotect_local_state(value:String)->Result<String,String>{
 let raw=hex_decode(&value)?;
 #[cfg(windows)] unsafe{let input=DataBlob{cb_data:raw.len() as u32,pb_data:raw.as_ptr() as *mut u8};let mut out=DataBlob{cb_data:0,pb_data:core::ptr::null_mut()};if CryptUnprotectData(&input,core::ptr::null_mut(),core::ptr::null(),core::ptr::null_mut(),core::ptr::null_mut(),1,&mut out)==0{return Err("DPAPI unprotect failed".into())}let data=core::slice::from_raw_parts(out.pb_data,out.cb_data as usize);let result=String::from_utf8(data.to_vec()).map_err(|e|e.to_string())?;LocalFree(out.pb_data as _);Ok(result)}
 #[cfg(not(windows))]{String::from_utf8(raw).map_err(|e|e.to_string())}
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(){tauri::Builder::default().plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_fs::init()).plugin(tauri_plugin_opener::init()).invoke_handler(tauri::generate_handler![protect_local_state,unprotect_local_state]).run(tauri::generate_context!()).expect("error while running tauri application");}
