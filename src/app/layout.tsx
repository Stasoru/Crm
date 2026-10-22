import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Fluxo CRM", description: "Funis, contatos e WhatsApp num só lugar" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
