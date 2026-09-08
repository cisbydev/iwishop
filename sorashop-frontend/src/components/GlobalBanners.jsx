export default function GlobalBanners({ children }) {
  return (
    <div data-testid="global-banners" className="sticky top-0 z-50 shadow-md">
      {children}
    </div>
  );
}
