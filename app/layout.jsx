// app/layout.jsx
export const metadata = {
  title: "UrbanFungi Boutique",
  description: "Boutique officielle UrbanFungi",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          background: "#fafafa",
          color: "#111",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont",
        }}
      >
        {children}
      </body>
    </html>
  );
}
