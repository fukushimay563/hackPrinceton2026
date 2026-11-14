import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { usePathname } from "./shims/navigation";
import Home from "@/app/page";
import { AppShell } from "@/components/AppShell";
import PaycheckPage from "@/app/(journey)/paycheck/page";
import CreditPage from "@/app/(journey)/credit/page";
import TaxesPage from "@/app/(journey)/taxes/page";
import ClassicTaxesPage from "@/app/(journey)/taxes/classic/page";
import AdvisorPage from "@/app/(journey)/advisor/page";
import AcademyPage from "@/app/(journey)/academy/page";
import FinPilotPage from "@/app/(journey)/finpilot/page";
import AccountPage from "@/app/(journey)/account/page";
import Methodology from "@/app/methodology/page";

const JOURNEY: Record<string, () => React.ReactElement> = {
  "/advisor": () => <AdvisorPage />,
  "/paycheck": () => <PaycheckPage />,
  "/credit": () => <CreditPage />,
  "/taxes": () => <TaxesPage />,
  "/taxes/classic": () => <ClassicTaxesPage />,
  "/academy": () => <AcademyPage />,
  "/finpilot": () => <FinPilotPage />,
  "/account": () => <AccountPage />,
};

function App() {
  const path = usePathname();
  if (path === "/methodology") return <Methodology />;
  const page = JOURNEY[path];
  if (page) return <AppShell key="shell">{page()}</AppShell>;
  return <Home />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
