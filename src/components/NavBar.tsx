import { Link } from "react-router-dom";
import { siteConfig } from "../config/site.config";

export default function NavBar() {
  return (
    <header className="glass sticky top-0 z-50">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-5">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight">
            {siteConfig.siteName}
          </span>
          <span className="text-secondary hidden text-xs sm:inline">
            {siteConfig.tagline}
          </span>
        </Link>
        <span className="text-secondary text-xs">尤克里里学习</span>
      </div>
    </header>
  );
}
