import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tidy Week — Family Chores",
  description: "A friendly weekly chore tracker for the whole household"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
