import { NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Moje mjesto", end: true },
  { to: "/stanice", label: "Stanice", end: false },
  { to: "/prognoza", label: "Prognoza", end: false },
] as const;

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Glavna navigacija">
      <div className="bottom-nav-inner">
        {items.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `nav-item${isActive ? " nav-item-active" : ""}`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
