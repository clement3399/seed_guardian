//! Coquille Tauri de Seed Guardian.
//!
//! Elle ne contient **aucune** logique cryptographique : celle-ci vit
//! entièrement dans `slip39-core`, appelée depuis le front via le module WASM.
//! Ce fichier se limite à ouvrir la fenêtre qui affiche le front Angular.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application Tauri");
}
