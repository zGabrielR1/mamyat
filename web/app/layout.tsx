import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";

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
    "Bolsas, amigurumis e bordados feitos à mão no ateliê da Mamy, em Concórdia, Santa Catarina. Peças únicas, encomendas personalizadas e envio para todo o Brasil.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://mamyat.henriquealveslohrayne.workers.dev"),
  openGraph: {
    title: "Mamy Ateliê",
    description: "Feito à mão, feito para durar. Ateliê em Concórdia · SC.",
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://mamyat.henriquealveslohrayne.workers.dev",
    siteName: "Mamy Ateliê",
    locale: "pt_BR",
    type: "website",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#17110f" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <body className={`${inter.variable} ${playfair.variable} antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
