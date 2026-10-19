// Metadata only: the page is a client component.
export const metadata = { title: "Dashboard", robots: { index: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
