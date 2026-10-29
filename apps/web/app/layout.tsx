import React from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Job Copilot — Agentic Job Search & Application Studio',
  description:
    'Zero-hallucination career graph, two-stage fit scoring, watchable Typst synthesis, and Stagehand v4 assisted apply.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
