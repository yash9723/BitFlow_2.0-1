// Metadata only: the page is a client component.
export const metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
