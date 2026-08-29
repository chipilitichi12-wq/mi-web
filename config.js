// ============================================================
// CONFIGURACIÓN PRINCIPAL DE RAYITO HUB
// Cambiá tus datos acá sin tocar index.html.
// ============================================================
window.RAYITO_CONFIG = {
  // PERFIL PÚBLICO DE RAYITO (solo se muestra en INICIO).
  // Este perfil NO es el perfil editable de los visitantes y NO se usa en el ranking.
  profile: {
    name: "Rayito ⚡",
    welcome: "Música, juegos y todo mi setup en un solo lugar.",
    avatar: "avatar.gif",
    updatedAt: "23/08/2026"
  },
  socials: {
    tiktok: "https://www.tiktok.com/@el_metralletas.1",
    youtube: "https://www.youtube.com/@El_Metralletas",
    spotify: "https://open.spotify.com/user/31v4u2rovzppfwizlzg4fagw36pu?si=92824926e8974c2c"
  },
  setup: {
    cpu: "AMD Ryzen 7 5700X",
    gpu: "AMD Radeon RX 7600 XT 16GB",
    motherboard: "GA-A320M-H",
    monitors: [
      "Valkyrie VH2410V2 · 200 Hz",
      "ASUS VA24E · 75 Hz",
      "Samsung SMB1930N · 60 Hz"
    ],
    peripherals: [
      "Redragon Kumara QWERTY",
      "LogitechG Series Hero G502",
      "Gaming Ziumier Z20"
    ],
    // Opcional: podés poner imágenes propias o URLs públicas.
    images: { cpu: "", gpu: "", motherboard: "" }
  },
  // RANKING GLOBAL CON SUPABASE (seguro para una web pública)
  // La URL y la publishable/anon key son PÚBLICAS por diseño y pueden verse en F12.
  // NUNCA pongas acá service_role, secret keys, contraseñas ni tokens privados.
  globalRanking: {
    enabled: true,
    supabaseUrl: "https://qxwqfyomdytfycrpqohb.supabase.co",
    publishableKey: "sb_publishable_IKB5GUqw1ZWEN4Uec3vpUQ_pT8Y7PSG",
    securityMode: "verified-game-sessions",
    // Opcional: URL pública de Rayito Hub para confirmar email y recuperar contraseña.
    // Si queda vacío, la web usa automáticamente su propia URL cuando está publicada por HTTPS.
    authRedirectUrl: ""
  }
};
