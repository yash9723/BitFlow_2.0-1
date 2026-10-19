// Metadata only: the page is a client component.
export const metadata = { title: "Profile", robots: { index: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
