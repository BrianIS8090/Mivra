// Предотвращает появление консольного окна в release-сборке
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  mivra_lib::run()
}
