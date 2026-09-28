import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movie Wheel",
  description: "Good movies. Great company. Let the wheel decide.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
