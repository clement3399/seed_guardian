// Masque la console Windows en mode release : l'application est purement
// graphique, une fenêtre de terminal derrière elle n'aurait aucun sens.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    seed_guardian_lib::run()
}
