export const metadata = {
  title: "UrbanFungi — Boutique",
  description: "Boutique UrbanFungi",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        {/* 🔴 OBLIGATOIRE POUR TELEGRAM MINI APP */}
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
