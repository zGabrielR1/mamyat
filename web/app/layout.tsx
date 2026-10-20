import type { Metadata } from "next";
import { Inter, Playfair_Display, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Mamy Ateliê · feito à mão, feito para durar",
    template: "%s · Mamy Ateliê",
  },
  description:
    "Bolsas, amigurumis e bordados feitos à mão no ateliê da Mamy. Peças únicas, encomendas personalizadas e envio para todo o Brasil.",
  metadataBase: new URL("https://mamyatelie.com"),
  openGraph: {
    title: "Mamy Ateliê",
    description: "Feito à mão, feito para durar.",
    url: "https://mamyatelie.com",
    siteName: "Mamy Ateliê",
    locale: "pt_BR",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={cn("font-sans", geist.variable)}>
      <body className={`${inter.variable} ${playfair.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
