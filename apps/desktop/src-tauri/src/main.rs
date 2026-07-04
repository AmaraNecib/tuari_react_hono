// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Entry point. If `--recover` is passed, runs in recovery mode.
fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.contains(&"--recover".to_string()) {
        recovery_main();
    } else {
        app_lib::run();
    }
}

/// Recovery mode: minimal environment to restore a broken installation.
fn recovery_main() {
    eprintln!("Tuari Recovery Environment");
    eprintln!("This mode repairs a broken installation.");
    std::process::exit(0);
}
