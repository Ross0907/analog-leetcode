import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "AnaCode — Practice electronics by designing circuits",
    template: "%s · AnaCode",
  },
  description: "A spec-driven practice and judging platform for analog circuit designers.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    title: "AnaCode — Practice electronics by designing circuits",
    description: "Draw schematics, inspect waveforms, and solve analog electronics design problems.",
    siteName: "AnaCode",
    images: [{
      url: "/og.png",
      width: 1536,
      height: 1024,
      alt: "AnaCode textbook schematic and oscilloscope waveform",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AnaCode — Practice electronics by designing circuits",
    description: "Draw schematics, inspect waveforms, and solve analog electronics design problems.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){window.addEventListener("error",function(e){if(e.message==="ResizeObserver loop completed with undelivered notifications."||e.message==="ResizeObserver loop limit exceeded"){e.preventDefault();e.stopImmediatePropagation()}});try{var s=localStorage.getItem("anacode-theme");var t=s==="light"||s==="dark"?s:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
